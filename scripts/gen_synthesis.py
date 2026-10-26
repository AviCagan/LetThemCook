#!/usr/bin/env python3
"""Build multi-step synthesis orders by chaining validated single-reaction orders.

If order A turns X into Y and order B turns Y into Z (same Y, E/Z geometry matched strictly),
then X -> Z with route A+B is a 2-step synthesis whose start and target names are already known.
3-step chains are built the same way. Output: content/questions/SYN.json (regenerate after editing
other question files; the validator fills targets/highlights and checks every route).
"""
from __future__ import annotations

import glob
import json
import os
import random
import sys
from collections import defaultdict

from pathlib import Path

from rdkit import Chem, RDLogger

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chem_engine import Engine, contains_target  # noqa: E402

RDLogger.DisableLog("rdApp.*")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QDIR = os.path.join(ROOT, "content", "questions")
OUT = os.path.join(QDIR, "SYN.json")
MAX_TWO = 300
MAX_THREE = 140
CHAPTER_RANK = {"16": 1, "17": 2}


def canon(smiles: str, tetrahedral: bool) -> str | None:
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None
    if not tetrahedral:
        for a in m.GetAtoms():
            a.SetChiralTag(Chem.ChiralType.CHI_UNSPECIFIED)
    return Chem.MolToSmiles(m)


def has_tetrahedral(smiles: str) -> bool:
    m = Chem.MolFromSmiles(smiles)
    return m is not None and any(a.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED for a in m.GetAtoms())


def load_items() -> list[dict]:
    items = []
    for f in sorted(glob.glob(os.path.join(QDIR, "*.json"))):
        if os.path.basename(f) == "SYN.json":
            continue
        for it in json.load(open(f, encoding="utf-8")):
            if it.get("review") or "synthesis" in it.get("orderTypes", []):
                continue
            if not it.get("target", {}).get("smiles"):
                continue
            items.append(it)
    return items


def links(a: dict, b: dict) -> bool:
    """A's product is B's starting material, with the stereo the two orders assume."""
    if set(a["reactionIds"]) & set(b["reactionIds"]):
        return False
    if canon(b["target"]["smiles"], False) == canon(a["start"]["smiles"], False):
        return False  # round trip
    bs = b["start"]["smiles"]
    if has_tetrahedral(bs):
        return a["target"]["stereo"] == "single_enantiomer" and canon(a["target"]["smiles"], True) == canon(bs, True)
    if canon(a["target"]["smiles"], False) != canon(bs, False):
        return False
    # the intermediate is one stereoisomer (meso / single) but B was written for an unspecified start
    # and keeps stereocentres: the final label would be ambiguous, so skip
    if a["target"]["stereo"] in ("meso", "single_enantiomer") and b["target"]["stereo"] != "none":
        return False
    return True


def route_text(route: list[dict], reagents: dict) -> str:
    parts = []
    for s in route:
        r = reagents[s["reagent"]]["label"]
        c = s.get("conditions") or {}
        extras = []
        if c.get("temp") and c["temp"] != "rt":
            extras.append({"ice": "0–5 °C", "reflux": "heat", "c140": "140 °C", "c180": "180 °C"}[c["temp"]])
        if c.get("light"):
            extras.append("light")
        if c.get("equiv"):
            extras.append(f"{c['equiv']} equiv")
        if c.get("pressure"):
            extras.append("pressure")
        parts.append(r + (f" ({', '.join(extras)})" if extras else ""))
    return " → ".join(parts)


def chain_item(parts: list[dict], reagents: dict) -> dict:
    first, last = parts[0], parts[-1]
    route = [s for p in parts for s in p["route"]]
    reaction_ids = []
    for p in parts:
        for rid in p["reactionIds"]:
            if rid not in reaction_ids:
                reaction_ids.append(rid)
    # the item's chapter is the primary reaction's (validator rule); a ch17 step anywhere marks it 17 for the toggle
    chapter = max((p["chapter"] for p in parts), key=lambda c: CHAPTER_RANK.get(str(c), 0))
    final_c = canon(last["target"]["smiles"], False)
    traps: list[dict] = []
    seen = set()

    def add_trap(t: dict) -> None:
        c = canon(t["smiles"], False)
        if c is None or c == final_c or c in seen:
            return
        seen.add(c)
        traps.append(t)

    # handing over an intermediate
    for i, p in enumerate(parts[:-1]):
        nxt = parts[i + 1]
        add_trap({
            "smiles": p["target"]["smiles"],
            "stereo": p["target"]["stereo"],
            "tag": "stopped_halfway",
            "why": f"That is {p['target']['name']}, only the intermediate. It still needs {route_text(nxt['route'], reagents)} to become {last['target']['name']}.",
        })
    for p in parts:
        for t in p.get("traps", []):
            add_trap(dict(t))
    alt_routes = []
    for i, p in enumerate(parts):
        for alt in p.get("altRoutes", [])[:2]:
            alt_routes.append([s for q in parts[:i] for s in q["route"]] + alt + [s for q in parts[i + 1:] for s in q["route"]])
    explanation = " Then ".join(p["explanation"].rstrip(". ") + "." if i == 0 else p["explanation"][0].lower() + p["explanation"][1:].rstrip(". ") + "." for i, p in enumerate(parts))
    return {
        "id": "q-SYN-" + "-".join(p["id"].replace("q-", "").rsplit("-", 1)[0].lower() for p in parts),
        "reactionIds": reaction_ids,
        "chapter": chapter,
        "difficulty": 3 if len(parts) == 2 else 4,
        "orderTypes": ["synthesis"],
        "start": dict(first["start"]),
        "target": {k: v for k, v in last["target"].items() if k not in ("smiles", "highlightAtoms")},
        "route": route,
        **({"altRoutes": alt_routes[:4]} if alt_routes else {}),
        "traps": traps[:8],
        **({"nameTraps": last["nameTraps"]} if last.get("nameTraps") else {}),
        "explanation": explanation,
        "tip": last.get("tip") or first.get("tip") or "Work backwards: what one-step change gives the target?",
        "source": "chain of " + " + ".join(p["id"] for p in parts),
    }


def works(engine: Engine, parts: list[dict]) -> bool:
    """Every step must change the flask and the final flask must hold the target (byproducts may block a later step)."""
    route = [s for p in parts for s in p["route"]]
    flask, outcomes = engine.run_route(parts[0]["start"]["smiles"], route)
    if any(not o.changed for o in outcomes):
        return False
    return contains_target(flask, parts[-1]["target"]["smiles"])


def main() -> None:
    rng = random.Random(256)
    engine = Engine(Path(ROOT))
    reagents = {r["id"]: r for r in json.load(open(os.path.join(ROOT, "content", "reagents.json"), encoding="utf-8"))}
    items = load_items()
    by_start = defaultdict(list)
    for it in items:
        by_start[canon(it["start"]["smiles"], False)].append(it)
    single = {(canon(it["start"]["smiles"], False), canon(it["target"]["smiles"], False)) for it in items}
    pairs = [
        (a, b)
        for a in items
        for b in by_start.get(canon(a["target"]["smiles"], False), [])
        if links(a, b)
        and (canon(a["start"]["smiles"], False), canon(b["target"]["smiles"], False)) not in single  # a one-step order exists
        and works(engine, [a, b])
    ]
    # one chain per (start, final) pair, spread over reaction combos
    by_key: dict[tuple, list] = defaultdict(list)
    for a, b in pairs:
        by_key[(canon(a["start"]["smiles"], False), canon(b["target"]["smiles"], False))].append((a, b))
    twos = []
    combo_count: dict[tuple, int] = defaultdict(int)
    for key in sorted(by_key, key=lambda k: rng.random()):
        opts = sorted(by_key[key], key=lambda ab: combo_count[(ab[0]["reactionIds"][0], ab[1]["reactionIds"][0])])
        a, b = opts[0]
        combo_count[(a["reactionIds"][0], b["reactionIds"][0])] += 1
        twos.append((a, b))
    twos.sort(key=lambda ab: ab[0]["id"] + ab[1]["id"])
    rng.shuffle(twos)
    twos = twos[:MAX_TWO]

    pair_by_first = defaultdict(list)
    for a, b in pairs:
        pair_by_first[a["id"]].append((a, b))
    threes = []
    seen3 = set()
    for a, b in pairs:
        for _b, c in pair_by_first.get(b["id"], []):
            if set(c["reactionIds"]) & set(a["reactionIds"]):
                continue
            fc = canon(c["target"]["smiles"], False)
            if fc in (canon(a["start"]["smiles"], False), canon(a["target"]["smiles"], False)):
                continue
            key = (canon(a["start"]["smiles"], False), fc)
            if key in seen3 or key in by_key or key in single:
                continue  # already a 1- or 2-step order for this pair
            seen3.add(key)
            if works(engine, [a, b, c]):
                threes.append((a, b, c))
    rng.shuffle(threes)
    threes = threes[:MAX_THREE]

    out = [chain_item(list(ab), reagents) for ab in twos] + [chain_item(list(abc), reagents) for abc in threes]
    ids = set()
    uniq = []
    for it in out:
        base = it["id"]
        n = 1
        while f"{base}-{n:03d}" in ids:
            n += 1
        it["id"] = f"{base}-{n:03d}"
        ids.add(it["id"])
        uniq.append(it)
    json.dump(uniq, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{len(twos)} two-step + {len(threes)} three-step syntheses -> {os.path.relpath(OUT, ROOT)} ({len(uniq)} items)")


if __name__ == "__main__":
    sys.exit(main())
