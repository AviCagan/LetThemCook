#!/usr/bin/env python3
"""Fill the quiz-style order types into every question file (run after gen_synthesis.py).

For each item, using the reaction engine so every answer is the engine's own chemistry:
  * predict_product ("What do I get?"): needs >= 3 wrong products. Extra ones come from realistic
    slips (a confusable bottle, a dropped workup, swapped steps, a wrong condition) and keep the
    tag + why of the slip.
  * what_start ("What did I start with?"): `reverse.distractors`, starting materials taken from other
    orders that the same route does NOT turn into the target (each is run through the engine).
  * spot_flaw ("Spot the flaw"): `flaws`, wrong routes that do not reach the target, each with the
    mistake tag and the reason it fails.
  * name_it ("Name it"): small targets whose name OPSIN parses to the drawn structure.
Deterministic (seeded); re-running gives the same output.
"""
from __future__ import annotations

import glob
import json
import os
import random
import re
import sys
from pathlib import Path

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chem_engine import Engine, canon, contains_target, strip_stereo  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
QDIR = ROOT / "content" / "questions"

# plausible bottle mix-ups (a student reaching for the wrong but similar-looking reagent)
CONFUSE: dict[str, list[str]] = {
    # only mix-ups the course teaches as traps, so the engine models both sides
    "NaBH4": ["LiAlH4", "H2_Pt"], "LiAlH4": ["NaBH4"], "H2_Pt": ["NaBH4"],
    "PCC": ["H2CrO4"], "PDC": ["H2CrO4"], "Swern": ["H2CrO4"], "H2CrO4": ["PCC"],
    "OsO4": ["O3", "KMnO4", "mCPBA"], "HIO4": ["OsO4"], "O3": ["OsO4"],
    "BH3_THF": ["H2SO4_H2O"], "H2SO4_H2O": ["BH3_THF"],
    "mCPBA": ["OsO4"], "Sharpless": ["mCPBA"], "NaIO4": ["H2O2"],
    "NaH": ["NaOH"], "Na": ["NaOH"], "NaOH": ["NaHCO3"], "NaHCO3": ["NaOH"], "K2CO3": ["NaHCO3"],
    "HNO3_dil": ["HNO3_H2SO4"], "Br2_H2O": ["Br2_CHCl3"], "Br2_CHCl3": ["Br2_H2O"],
    "AcCl_pyr": ["AcCl_AlCl3"], "AcCl_AlCl3": ["AcCl_pyr"],
    "CH3I": ["tBuBr"], "EtBr": ["iPrBr"], "nPrBr": ["iPrBr"],
    "Zn_Hg_HCl": ["NaBH4"], "H2NNH2_KOH": ["NaBH4"],
    "MeOH_H2SO4": ["NaOMe"], "EtOH_H2SO4": ["NaOEt"], "NaOMe": ["MeOH_H2SO4"], "NaOEt": ["EtOH_H2SO4"],
}
INTERMEDIATES = [
    (re.compile(r"\[O-\]|\[S-\]"), "missing_workup", "The route stops at the anion (alkoxide / phenoxide / thiolate / carboxylate): it never adds water or acid to protonate it."),
    (re.compile(r"\[Mg\]"), "missing_workup", "The route stops at the Grignard reagent: no carbonyl/epoxide partner or acid workup."),
    (re.compile(r"\[N\+\]#N"), "missing_workup", "The route stops at the diazonium salt: it still needs water and heat."),
    (re.compile(r"B(?!r)"), "missing_workup", "The route stops at the alkylborane: it still needs H₂O₂/NaOH."),
]
TEMP_WORD = {"ice": "0–5 °C", "rt": "room temperature", "reflux": "heat", "c140": "140 °C", "c180": "180 °C"}


def heavy(smiles: str) -> int:
    m = Chem.MolFromSmiles(smiles)
    return m.GetNumHeavyAtoms() if m else 0


def main_frag(smiles: str) -> str:
    frags = [f for f in smiles.split(".") if f]
    return max(frags, key=heavy)


class Gen:
    def __init__(self) -> None:
        self.engine = Engine(ROOT)
        self.reagents = {r["id"]: r for r in json.loads((ROOT / "content" / "reagents.json").read_text(encoding="utf-8"))}
        self.reactions = {r["id"]: r for r in json.loads((ROOT / "content" / "reactions.json").read_text(encoding="utf-8"))}
        self.files = {Path(f): json.loads(Path(f).read_text(encoding="utf-8")) for f in sorted(glob.glob(str(QDIR / "*.json")))}
        self.items = [q for items in self.files.values() for q in items]
        self.rng = random.Random(1622)

    # ---------- helpers
    def label(self, step: dict) -> str:
        r = self.reagents[step["reagent"]]["label"]
        c = step.get("conditions") or {}
        extra = []
        if c.get("temp") and c["temp"] != "rt":
            extra.append(TEMP_WORD[c["temp"]])
        if c.get("light"):
            extra.append("light")
        if c.get("equiv"):
            extra.append(f"{c['equiv']} equiv")
        if c.get("pressure"):
            extra.append("pressure")
        return r + (f" ({', '.join(extra)})" if extra else "")

    def route_text(self, route: list[dict]) -> str:
        if len(route) == 1:
            return self.label(route[0])
        return "; ".join(f"{i + 1}. {self.label(s)}" for i, s in enumerate(route))

    def default_conditions(self, reagent: str) -> dict | None:
        p = self.reagents[reagent].get("techniqueParams") or {}
        c: dict = {}
        if p.get("tempPresets"):
            c["temp"] = "rt" if "rt" in p["tempPresets"] else p["tempPresets"][0]
        if p.get("equivOptions"):
            c["equiv"] = p["equivOptions"][0]
        return c or None

    def run(self, start: str, route: list[dict]):
        return self.engine.run_route(start, route)

    # ---------- slips: wrong routes with a reason
    def mutations(self, q: dict) -> list[tuple[str, list[dict]]]:
        route = q["route"]
        out: list[tuple[str, list[dict]]] = []
        if len(route) >= 2 and route[-1]["reagent"] in ("H2O", "H3O_plus"):
            out.append(("drop_workup", route[:-1]))
        for i in range(len(route) - 1):
            if route[i]["reagent"] != route[i + 1]["reagent"]:
                sw = route[:i] + [route[i + 1], route[i]] + route[i + 2:]
                out.append(("swap", sw))
        decoys = []
        for rid in q["reactionIds"]:
            decoys += self.reactions.get(rid, {}).get("decoys", [])
        for i, step in enumerate(route):
            for alt in CONFUSE.get(step["reagent"], []) + decoys:
                if alt == step["reagent"] or alt not in self.reagents:
                    continue
                out.append(("swap_reagent", route[:i] + [{"reagent": alt, **({"conditions": self.default_conditions(alt)} if self.default_conditions(alt) else {})}] + route[i + 1:]))
            p = self.reagents[step["reagent"]].get("techniqueParams") or {}
            cur = step.get("conditions") or {}
            for t in p.get("tempPresets", []):
                if t != cur.get("temp"):
                    out.append(("condition", route[:i] + [{"reagent": step["reagent"], "conditions": {**cur, "temp": t}}] + route[i + 1:]))
            for e in p.get("equivOptions", []):
                if e != cur.get("equiv"):
                    out.append(("condition", route[:i] + [{"reagent": step["reagent"], "conditions": {**cur, "equiv": e}}] + route[i + 1:]))
            if p.get("lightToggle"):
                out.append(("condition", route[:i] + [{"reagent": step["reagent"], "conditions": {**cur, "light": not cur.get("light", False)}}] + route[i + 1:]))
        # de-duplicate
        seen, uniq = set(), []
        for kind, r in out:
            k = json.dumps(r, sort_keys=True)
            if k not in seen and r != route:
                seen.add(k)
                uniq.append((kind, r))
        return uniq

    def diagnose(self, q: dict, kind: str, route: list[dict]) -> dict | None:
        """Run a wrong route; return {route, tag, why, gives} when it fails for a reason we can name."""
        target = q["target"]["smiles"]
        try:
            final, outs = self.run(q["start"]["smiles"], route)
        except Exception:
            return None
        if contains_target(final, target):
            return None
        gives = main_frag(final)
        tag = why = None
        for i, o in enumerate(outs):
            if not o.changed:
                if o.blocked:
                    tag, why = "no_reaction", f"Step {i + 1} ({self.label(route[i])}) does nothing here: {o.blocked[0]}"
                elif o.traps and o.traps[0]["pattern"] != "*":
                    t = o.traps[0]["tag"]
                    tag = "no_reaction" if t == "reagent_label_unknown" else t
                    why = f"Step {i + 1} ({self.label(route[i])}) does nothing here: {o.traps[0]['why']}"
                else:
                    return None  # no specific reason on file: do not guess
                break
        if tag is None:
            for tr in q.get("traps", []):
                if not tr.get("stereoOnly") and strip_stereo(main_frag(tr["smiles"])) == strip_stereo(gives):
                    tag, why = tr["tag"], tr["why"]
                    break
        if tag is None:
            for rx, t, w in INTERMEDIATES:
                if rx.search(final):
                    tag, why = t, w
                    break
        if tag is None and kind == "swap":
            tag, why = "wrong_reagent_order", f"Same bottles, wrong order: {self.route_text(route)} does not reach the target. Each step needs the group the previous step made."
        if tag is None:
            return None
        return {"route": route, "tag": tag, "why": why, "gives": gives}

    def slips(self, q: dict) -> list[dict]:
        out, seen = [], set()
        for kind, r in self.mutations(q):
            d = self.diagnose(q, kind, r)
            if not d:
                continue
            k = strip_stereo(d["gives"]) + "|" + d["tag"]
            if k in seen:
                continue
            seen.add(k)
            out.append(d)
        return out

    # ---------- per item
    def fill(self, q: dict) -> None:
        if not q["target"].get("smiles") or not q["route"]:
            return
        base = q.get("orderTypes") or ["make_it"]
        types = ["synthesis"] if "synthesis" in base else ["make_it"]
        is_syn = "synthesis" in types
        target_flat = strip_stereo(q["target"]["smiles"])
        start_flat = strip_stereo(q["start"]["smiles"])
        slips = self.slips(q)

        # What do I get?  (realistic slips first, then "stopped partway" and "nothing happens")
        extra = list(slips)
        try:
            flask = canon(q["start"]["smiles"])
            for k, step in enumerate(q["route"][:-1]):
                o = self.engine.apply(step["reagent"], step.get("conditions"), flask)
                flask = o.product
                anion = re.search(r"\[O-\]|\[S-\]|\[Mg\]|\[N\+\]#N|B(?!r)", flask) is not None
                rest = self.route_text(q["route"][k + 1:])
                extra.append({"gives": main_frag(flask), "tag": "missing_workup" if anion else "stopped_halfway",
                              "why": f"That is only the product after step {k + 1}; it still needs {rest}."})
        except Exception:
            pass
        extra.append({"gives": q["start"]["smiles"], "tag": "no_reaction",
                      "why": f"There is a reaction: {self.route_text(q['route'])} does change {q['start']['name']}."})
        traps = [t for t in q.get("traps", []) if not t.get("auto")]
        have = {strip_stereo(main_frag(t["smiles"])) for t in traps if not t.get("stereoOnly")}
        for s in extra:
            if len([t for t in traps if not t.get("stereoOnly")]) >= 4:
                break
            g = strip_stereo(s["gives"])
            if g in have or g == target_flat:
                continue
            have.add(g)
            traps.append({"smiles": canon(s["gives"]), "stereo": "none", "tag": s["tag"], "why": s["why"], "auto": True})
        if traps:
            q["traps"] = traps
        else:
            q.pop("traps", None)
        if len([t for t in traps if not t.get("stereoOnly") and strip_stereo(main_frag(t["smiles"])) != target_flat]) >= 3:
            types.append("predict_product")

        # Spot the flaw
        flaws = [{"route": s["route"], "tag": s["tag"], "why": s["why"], "gives": canon(s["gives"])} for s in slips]
        self.rng.shuffle(flaws)
        flaws.sort(key=lambda f: f["tag"] in ("wrong_temperature", "wrong_reagent_order"))  # prefer the specific reasons
        picked, tags = [], set()
        for f in flaws:
            if f["tag"] in tags and len(picked) < 2:
                continue
            picked.append(f)
            tags.add(f["tag"])
            if len(picked) == 3:
                break
        if picked:
            q["flaws"] = picked
            types.append("spot_flaw")
        else:
            q.pop("flaws", None)

        # What did I start with?
        size = heavy(q["start"]["smiles"])
        rids = set(q["reactionIds"])
        pool = []
        for o in self.items:
            if o is q:
                continue
            s = o["start"]["smiles"]
            f = strip_stereo(s)
            if f in (start_flat, target_flat) or abs(heavy(s) - size) > 4:
                continue
            same = bool(rids & set(o["reactionIds"]))
            pool.append((0 if same else 1, self.rng.random(), o["start"]))
        pool.sort(key=lambda x: (x[0], x[1]))
        reacting, inert, seen = [], [], set()
        for _, _, st in pool[:60]:
            f = strip_stereo(st["smiles"])
            if f in seen:
                continue
            seen.add(f)
            final, outs = self.run(st["smiles"], q["route"])
            if contains_target(final, q["target"]["smiles"]):
                continue
            gives = main_frag(final)
            if any(o.changed for o in outs) and strip_stereo(gives) != f:
                reacting.append({"smiles": st["smiles"], "name": st["name"], "gives": canon(gives),
                                 "why": f"With {self.route_text(q['route'])}, {st['name']} gives a different product (shown)."})
            else:
                inert.append({"smiles": st["smiles"], "name": st["name"], "gives": canon(gives),
                              "why": f"{self.route_text(q['route'])} does nothing to {st['name']}."})
            if len(reacting) >= 3:
                break
        dist = (reacting + inert)[:3]
        if len(dist) == 3:
            q["reverse"] = {"distractors": dist}
            types.append("what_start")
        else:
            q.pop("reverse", None)

        # Name it (single-step orders only; their targets cover the synthesis targets too)
        name = q["target"]["name"]
        stereo_name = re.match(r"^(cis|trans|meso|rac|syn|anti)-|^\(", name) is not None
        if not is_syn and q["target"].get("stereo", "none") == "none" and not stereo_name and heavy(q["target"]["smiles"]) <= 16 and len(name) <= 40:
            types.append("name_it")

        order = ["make_it", "predict_product", "what_start", "spot_flaw", "name_it", "synthesis"]
        q["orderTypes"] = [t for t in order if t in set(types)]

    def run_all(self) -> None:
        for path, items in self.files.items():
            for q in items:
                self.fill(q)
            path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        counts: dict[str, int] = {}
        for q in self.items:
            for t in q.get("orderTypes", []):
                counts[t] = counts.get(t, 0) + 1
        print("order types:", counts)


if __name__ == "__main__":
    Gen().run_all()
