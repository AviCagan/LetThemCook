#!/usr/bin/env python3
"""Validate the chemistry content under content/ (runs in CI).

Fails when:
  * a file does not match its JSON schema
  * a reagent / reaction / tag / rule id is referenced but not defined
  * any SMILES or SMARTS fails to parse
  * a rule test (content/rule_tests.json) fails
  * an item's intended route does not produce its target (or an altRoute does not)
  * an item's stored target.smiles differs from what the engine produces
  * a trap equals the target (or equals it with stereo stripped, unless stereoOnly)
  * a stereo label is inconsistent with the target structure
  * two items share a start + target (duplicates)

Usage: validate_content.py [--root DIR] [--strict] [--fill]
  --fill   write target.smiles / target.highlightAtoms derived from the engine into the item files
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from rdkit import Chem, RDLogger
from rdkit.Chem import rdFMCS

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chem_engine import Engine, canon, contains_target, strip_stereo  # noqa: E402

try:
    from jsonschema import Draft7Validator
    from referencing import Registry, Resource
    from referencing.jsonschema import DRAFT7
except ImportError:  # pragma: no cover
    print("pip install -r scripts/requirements.txt", file=sys.stderr)
    raise

RDLogger.DisableLog("rdApp.*")


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.checks = 0

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def ok(self) -> None:
        self.checks += 1


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate_schema(name: str, data, schema_name: str, registry: Registry, report: Report, as_list: bool = True) -> None:
    ref = {"$ref": f"https://letthemcook.local/schema/{schema_name}"}
    schema = {"type": "array", "items": ref} if as_list else ref
    validator = Draft7Validator(schema, registry=registry)
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        path = "/".join(str(p) for p in err.absolute_path)
        report.error(f"[schema] {name}: {path}: {err.message}")
    report.ok()


def stereocenters(smiles: str) -> int:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return 0
    centers = Chem.FindMolChiralCenters(mol, includeUnassigned=True, useLegacyImplementation=False)
    # only carbon stereocenters count for the course (sulfoxide S chirality is out of scope)
    return sum(1 for idx, _ in centers if mol.GetAtomWithIdx(idx).GetAtomicNum() == 6)


def changed_atoms(start_smiles: str, answer_smiles: str) -> list[int]:
    start = Chem.MolFromSmiles(start_smiles)
    answer = Chem.MolFromSmiles(answer_smiles)
    if start is None or answer is None or Chem.MolToSmiles(start) == Chem.MolToSmiles(answer):
        return []
    res = rdFMCS.FindMCS([start, answer], atomCompare=rdFMCS.AtomCompare.CompareElements, bondCompare=rdFMCS.BondCompare.CompareOrderExact,
                         ringMatchesRingOnly=False, completeRingsOnly=False, matchValences=False, timeout=5)
    if res.numAtoms == 0:
        return list(range(answer.GetNumAtoms()))
    patt = Chem.MolFromSmarts(res.smartsString)
    a_match = answer.GetSubstructMatch(patt)
    s_match = start.GetSubstructMatch(patt)
    if not a_match or not s_match:
        return list(range(answer.GetNumAtoms()))
    mapping = dict(zip(a_match, s_match))
    highlight: set[int] = set(range(answer.GetNumAtoms())) - set(a_match)
    for a_idx, s_idx in mapping.items():
        a_atom = answer.GetAtomWithIdx(a_idx)
        s_atom = start.GetAtomWithIdx(s_idx)
        a_env = sorted((b.GetBondTypeAsDouble(), b.GetOtherAtom(a_atom).GetAtomicNum()) for b in a_atom.GetBonds())
        s_env = sorted((b.GetBondTypeAsDouble(), b.GetOtherAtom(s_atom).GetAtomicNum()) for b in s_atom.GetBonds())
        if a_env != s_env or a_atom.GetTotalNumHs() != s_atom.GetTotalNumHs() or a_atom.GetFormalCharge() != s_atom.GetFormalCharge():
            highlight.add(a_idx)
    for idx in list(highlight):
        atom = answer.GetAtomWithIdx(idx)
        if atom.GetAtomicNum() != 6:
            for nb in atom.GetNeighbors():
                if nb.GetAtomicNum() == 6:
                    highlight.add(nb.GetIdx())
    return sorted(highlight)


def target_fragment(flask: str, target_smiles: str | None) -> str | None:
    """Pick the flask fragment that is the target (when known) or the largest fragment."""
    frags = flask.split(".")
    if target_smiles:
        t = strip_stereo(target_smiles)
        for f in frags:
            if strip_stereo(f) == t:
                return canon(f)
    return max(frags, key=lambda f: Chem.MolFromSmiles(f).GetNumHeavyAtoms())


def validate_item(q: dict, engine: Engine, reactions: dict, reagents: dict, tags: set, report: Report, seen: dict, fill: bool) -> bool:
    label = q["id"]
    changed = False
    for rid in q["reactionIds"]:
        if rid not in reactions:
            report.error(f"[ref] {label}: unknown reaction '{rid}'")
    primary = reactions.get(q["reactionIds"][0])
    if primary and primary["chapter"] != q["chapter"]:
        chapters = {reactions[r]["chapter"] for r in q["reactionIds"] if r in reactions}
        if "synthesis" in q.get("orderTypes", []) and q["chapter"] in chapters:
            pass  # a multi-step order carries the highest chapter of its steps (for the chapter toggle)
        else:
            report.error(f"[ref] {label}: chapter {q['chapter']} != reaction {primary['id']} chapter {primary['chapter']}")
    if Chem.MolFromSmiles(q["start"]["smiles"]) is None:
        report.error(f"[smiles] {label}: start does not parse: {q['start']['smiles']}")
        return False
    for route_name, route in [("route", q["route"]), *[(f"altRoutes[{i}]", r) for i, r in enumerate(q.get("altRoutes", []))]]:
        for i, s in enumerate(route, 1):
            if s["reagent"] not in reagents:
                report.error(f"[ref] {label}: {route_name} step {i} uses unknown bottle '{s['reagent']}'")
                return False
    # run the intended route
    flask, outcomes = engine.run_route(q["start"]["smiles"], q["route"])
    for i, o in enumerate(outcomes, 1):
        if not o.changed:
            report.error(f"[route] {label}: step {i} ({q['route'][i-1]['reagent']}) gave no reaction on {o.product}" + (f" (blocked: {o.blocked[0]})" if o.blocked else ""))
            return False
    tgt = q["target"]
    stored = tgt.get("smiles")
    derived = target_fragment(flask, stored)
    if derived is None:
        report.error(f"[route] {label}: could not pick a target fragment from {flask}")
        return False
    if stored and strip_stereo(stored) != strip_stereo(derived) and not contains_target(flask, stored):
        report.error(f"[target] {label}: stored target {stored} not produced by the route (engine gives {flask})")
        return False
    if not stored or (fill and strip_stereo(stored) != strip_stereo(derived)):
        if fill:
            tgt["smiles"] = derived
            changed = True
        else:
            report.error(f"[target] {label}: target.smiles missing; run with --fill")
            return False
    target_smiles = tgt["smiles"]
    if contains_target(flask, target_smiles):
        report.ok()
    if strip_stereo(target_smiles) == strip_stereo(q["start"]["smiles"]) and q.get("orderTypes") != ["name_it"]:
        report.error(f"[target] {label}: target equals the starting material")
    # alt routes
    for i, alt in enumerate(q.get("altRoutes", [])):
        f2, outs = engine.run_route(q["start"]["smiles"], alt)
        if not contains_target(f2, target_smiles):
            report.error(f"[route] {label}: altRoutes[{i}] gives {f2}, not the target")
        else:
            report.ok()
    # stereo label vs structure
    n_centers = stereocenters(target_smiles)
    st = tgt["stereo"]
    if st == "none" and n_centers > 0:
        report.warn(f"[stereo] {label}: target has {n_centers} stereocenter(s) but is labelled 'none' ({target_smiles})")
    if st in ("racemic", "single_enantiomer") and n_centers == 0:
        report.error(f"[stereo] {label}: labelled {st} but the target has no stereocenter ({target_smiles})")
    if st in ("meso", "cis", "trans") and n_centers < 2:
        report.error(f"[stereo] {label}: labelled {st} but the target has fewer than 2 stereocenters ({target_smiles})")
    # highlights
    if fill and "highlightAtoms" not in tgt:
        tgt["highlightAtoms"] = changed_atoms(q["start"]["smiles"], target_smiles)
        changed = True
    n_atoms = Chem.MolFromSmiles(target_smiles).GetNumAtoms()
    if any(a >= n_atoms for a in tgt.get("highlightAtoms", [])):
        report.error(f"[highlight] {label}: highlight index out of range")
    # traps
    t_flat = strip_stereo(target_smiles)
    seen_traps: set[str] = set()
    for i, tr in enumerate(q.get("traps", [])):
        tl = f"{label}.traps[{i}]"
        if tr["tag"] not in tags:
            report.error(f"[tag] {tl}: unknown tag '{tr['tag']}'")
        if Chem.MolFromSmiles(tr["smiles"]) is None:
            report.error(f"[smiles] {tl}: does not parse: {tr['smiles']}")
            continue
        c = canon(tr["smiles"])
        if c in seen_traps:
            report.error(f"[trap] {tl}: duplicate trap")
        seen_traps.add(c)
        if strip_stereo(tr["smiles"]) == t_flat and not tr.get("stereoOnly"):
            report.error(f"[trap] {tl}: equals the target once stereo is stripped (set stereoOnly if deliberate)")
        else:
            report.ok()
    if "synthesis" in q.get("orderTypes", []) and len(q.get("route", [])) < 2:
        report.error(f"[type] {label}: a synthesis order needs a route of >= 2 steps")
    types = q.get("orderTypes", [])
    target_smiles = q["target"].get("smiles")
    if not q["route"] and types != ["name_it"]:
        report.error(f"[route] {label}: an empty route is only allowed for name_it-only orders")
    if "predict_product" in types:
        options = {strip_stereo(t["smiles"].split(".")[0] if "." not in t["smiles"] else max(t["smiles"].split("."), key=len))
                   for t in q.get("traps", []) if not t.get("stereoOnly")}
        options.discard(strip_stereo(target_smiles) if target_smiles else None)
        if len(options) < 3:
            report.error(f"[type] {label}: predict_product needs >= 3 distinct wrong products")
    for t in q.get("traps", []):
        if t["tag"] not in tags:
            report.error(f"[tag] {label}: trap tag '{t['tag']}' unknown")
    if "what_start" in types:
        ds = q.get("reverse", {}).get("distractors", [])
        if len(ds) < 3:
            report.error(f"[type] {label}: what_start needs 3 reverse.distractors")
        start_flat = strip_stereo(q["start"]["smiles"])
        for d in ds:
            if Chem.MolFromSmiles(d["smiles"]) is None:
                report.error(f"[reverse] {label}: bad SMILES {d['smiles']}")
                continue
            if strip_stereo(d["smiles"]) == start_flat:
                report.error(f"[reverse] {label}: distractor {d['name']} is the real starting material")
            final, _ = engine.run_route(d["smiles"], q["route"])
            if target_smiles and contains_target(final, target_smiles):
                report.error(f"[reverse] {label}: the route turns distractor {d['name']} into the target too")
            else:
                report.ok()
    if "spot_flaw" in types and not q.get("flaws"):
        report.error(f"[type] {label}: spot_flaw needs flaws")
    for i, f in enumerate(q.get("flaws", [])):
        if f["tag"] not in tags:
            report.error(f"[flaw] {label}: flaw {i} tag '{f['tag']}' unknown")
        if any(s["reagent"] not in reagents for s in f["route"]):
            report.error(f"[flaw] {label}: flaw {i} uses an unknown bottle")
            continue
        final, _ = engine.run_route(q["start"]["smiles"], f["route"])
        if target_smiles and contains_target(final, target_smiles):
            report.error(f"[flaw] {label}: flaw {i} route actually reaches the target")
        else:
            report.ok()
    for nt in q.get("nameTraps", []):
        if nt["tag"] not in tags:
            report.error(f"[tag] {label}: nameTrap tag '{nt['tag']}' unknown")
    if not tgt["name"].strip():
        report.error(f"[name] {label}: empty target name")
    if q.get("review"):
        report.warn(f"[review] {label}: {q['review']}")
    key = (canon(q["start"]["smiles"]), t_flat)
    if key in seen:
        report.error(f"[dup] {label}: same start and target as {seen[key]}")
    else:
        seen[key] = label
    return changed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--fill", action="store_true")
    args = ap.parse_args()
    root = Path(args.root)
    content = root / "content"
    report = Report()

    registry = Registry()
    for schema_file in sorted((content / "schema").glob("*.schema.json")):
        schema = load_json(schema_file)
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema, default_specification=DRAFT7))

    reagents_list = load_json(content / "reagents.json")
    reactions_list = load_json(content / "reactions.json")
    tags_list = load_json(content / "mistake_tags.json")
    rules_data = load_json(content / "rules.json")
    question_files = sorted((content / "questions").glob("*.json"))

    validate_schema("reagents.json", reagents_list, "reagent.schema.json", registry, report)
    validate_schema("reactions.json", reactions_list, "reaction.schema.json", registry, report)
    validate_schema("mistake_tags.json", tags_list, "mistake-tag.schema.json", registry, report)
    validate_schema("rules.json", rules_data, "rule.schema.json", registry, report, as_list=False)
    questions: dict[Path, list[dict]] = {}
    for qf in question_files:
        data = load_json(qf)
        validate_schema(qf.name, data, "question.schema.json", registry, report)
        questions[qf] = data
    if report.errors:
        return finish(report, args.strict)

    reagents = {r["id"]: r for r in reagents_list}
    reactions = {r["id"]: r for r in reactions_list}
    tags = {t["id"] for t in tags_list}
    for coll, name in ((reagents_list, "reagent"), (reactions_list, "reaction"), (tags_list, "tag"), (rules_data["rules"], "rule")):
        ids = [x["id"] for x in coll]
        for dup in {i for i in ids if ids.count(i) > 1}:
            report.error(f"[dup] duplicate {name} id '{dup}'")
    for r in reagents_list:
        if "smiles" in r and Chem.MolFromSmiles(r["smiles"]) is None:
            report.error(f"[smiles] reagent {r['id']}: bad smiles")
    for rule in rules_data["rules"]:
        if rule["reagent"] not in reagents:
            report.error(f"[ref] rule {rule['id']}: unknown reagent '{rule['reagent']}'")
        for rid in rule["reactionIds"]:
            if rid not in reactions:
                report.error(f"[ref] rule {rule['id']}: unknown reaction '{rid}'")
        if rule.get("partner") == "bottle" and "smiles" not in reagents.get(rule["reagent"], {}):
            report.error(f"[ref] rule {rule['id']}: partner bottle has no smiles")
        for p in rule.get("requireNot", []):
            if Chem.MolFromSmarts(p) is None:
                report.error(f"[smarts] rule {rule['id']}: bad requireNot SMARTS {p}")
        for st in rule["pipeline"]:
            for t in st.get("anyOf") or [st.get("rxn")]:
                try:
                    from rdkit.Chem import AllChem
                    AllChem.ReactionFromSmarts(t)
                    report.ok()
                except Exception as exc:
                    report.error(f"[smarts] rule {rule['id']}: {exc}")
    for t in rules_data["noReaction"]:
        if t["reagent"] not in reagents:
            report.error(f"[ref] trap for unknown reagent '{t['reagent']}'")
        if t["tag"] not in tags:
            report.error(f"[tag] trap for {t['reagent']}: unknown tag '{t['tag']}'")
        if t["pattern"] != "*" and Chem.MolFromSmarts(t["pattern"]) is None:
            report.error(f"[smarts] trap for {t['reagent']}: bad pattern {t['pattern']}")
    for r in reactions_list:
        for s in r.get("steps", []):
            for rid in s["reagents"]:
                if not rid.startswith("#") and rid not in reagents:
                    report.error(f"[ref] reaction {r['id']}: unknown bottle '{rid}'")
        for rid in r.get("decoys", []):
            if rid not in reagents:
                report.error(f"[ref] reaction {r['id']}: unknown decoy '{rid}'")
        for t in r.get("typicalTags", []):
            if t not in tags:
                report.error(f"[tag] reaction {r['id']}: unknown tag '{t}'")

    # rule tests
    proc = subprocess.run([sys.executable, "-I", str(root / "scripts" / "run_rule_tests.py")], capture_output=True, text=True)
    for line in proc.stdout.splitlines():
        if line.startswith("FAIL"):
            report.error(f"[rule-test] {line[5:]}")
    if proc.returncode != 0 and not any(l.startswith("FAIL") for l in proc.stdout.splitlines()):
        report.error(f"[rule-test] runner failed: {proc.stderr[-500:]}")
    report.checks += len(load_json(content / "rule_tests.json"))

    engine = Engine(root)
    seen: dict = {}
    seen_ids: set[str] = set()
    per_reaction: dict[str, int] = {}
    for qf, items in questions.items():
        file_changed = False
        for q in items:
            if q["id"] in seen_ids:
                report.error(f"[dup] duplicate id {q['id']}")
            seen_ids.add(q["id"])
            per_reaction[q["reactionIds"][0]] = per_reaction.get(q["reactionIds"][0], 0) + 1
            try:
                if validate_item(q, engine, reactions, reagents, tags, report, seen, args.fill):
                    file_changed = True
            except Exception as exc:  # keep going; report
                report.error(f"[crash] {q['id']}: {exc}")
        if file_changed and args.fill:
            qf.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    check_names(questions, report)

    n_items = sum(len(v) for v in questions.values())
    print(f"content: {len(reagents)} bottles, {len(reactions)} reactions, {len(rules_data['rules'])} rules, {len(tags)} tags, {n_items} items")
    for rid in sorted(reactions, key=lambda x: (x[0], int(x[1:]))):
        n = per_reaction.get(rid, 0)
        if reactions[rid].get("steps"):
            print(f"  {rid:4s} {n:3d} items{'' if n >= 6 else '  (< 6)'}")
    return finish(report, args.strict)


def _organic(smiles: str) -> str | None:
    """Largest fragment, stereo stripped: names of salts carry a counter-ion the game does not draw."""
    if not smiles:
        return None
    frags = smiles.split(".")
    best = max(frags, key=lambda f: (Chem.MolFromSmiles(f).GetNumHeavyAtoms() if Chem.MolFromSmiles(f) else -1))
    return strip_stereo(best)


def _name_variants(name: str) -> list[str]:
    """The name as written, the parts in/out of a trailing '(common name)', and without rac-/meso- style prefixes."""
    out = [name]
    m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", name)
    if m and not re.match(r"^[\dRSEZ,]+$", m.group(2)):
        out += [m.group(1), m.group(2)]
    stripped = []
    for n in out:
        n2 = re.sub(r"^(rac|meso|cis|trans)-", "", n)
        n2 = re.sub(r"^\([\dRS,]+\)/\([\dRS,]+\)-", "", n2)
        if n2 != n:
            stripped.append(n2)
    return out + stripped


def check_names(questions: dict, report: Report) -> None:
    """Every start/target name and alternative name must parse (OPSIN) to the drawn structure.
    Names OPSIN cannot read (acronyms, trade names) are skipped; a name that parses to a different
    molecule is an error. Needs py2opsin (Java); without it the check is skipped with a warning."""
    try:
        import warnings as _w
        _w.filterwarnings("ignore")
        from py2opsin import py2opsin  # type: ignore
    except Exception:
        report.warn("[names] py2opsin not installed: IUPAC names were not checked against structures")
        return
    jobs = []  # (label, kind, name, smiles)
    for items in questions.values():
        for q in items:
            jobs.append((q["id"], "start", q["start"]["name"], q["start"]["smiles"]))
            t = q["target"]
            if t.get("smiles"):
                jobs.append((q["id"], "target", t["name"], t["smiles"]))
                for a in t.get("altNames", []):
                    jobs.append((q["id"], "altName", a, t["smiles"]))
    names = sorted({v for _, _, n, _ in jobs for v in _name_variants(n)})
    try:
        parsed = dict(zip(names, py2opsin(names)))
    except Exception as exc:  # Java missing etc.
        report.warn(f"[names] OPSIN failed to run ({exc}); names not checked")
        return
    name_it = {q["id"] for items in questions.values() for q in items if "name_it" in q.get("orderTypes", [])}
    for label, kind, name, smiles in jobs:
        want = _organic(smiles)
        got = [parsed.get(v) or "" for v in _name_variants(name)]
        got = [g for g in got if g]
        if not got:
            if kind == "target" and label in name_it:
                report.error(f"[name] {label}: name_it target '{name}' cannot be checked by OPSIN")
            continue
        if any(_organic(g) == want for g in got):
            report.ok()
        else:
            report.error(f"[name] {label}: {kind} '{name}' is {_organic(got[0])} by OPSIN, but the structure is {want}")


def finish(report: Report, strict: bool) -> int:
    for w in report.warnings:
        print(f"WARN  {w}")
    for e in report.errors:
        print(f"ERROR {e}")
    print(f"{report.checks} checks passed, {len(report.warnings)} warnings, {len(report.errors)} errors")
    return 1 if report.errors or (strict and report.warnings) else 0


if __name__ == "__main__":
    sys.exit(main())
