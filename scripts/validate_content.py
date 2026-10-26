#!/usr/bin/env python3
"""Validate the chemistry content under content/.

Runs in CI (and locally: `python scripts/validate_content.py`). Fails the build when:
  * a file does not match its JSON schema
  * a reagent / reaction / tag id is referenced but not defined
  * any SMILES fails to parse
  * an answer's canonical SMILES equals any distractor's (or matches it with stereo
    stripped, unless the distractor is marked stereoOnly)
  * there are duplicate questions (same id, or same reaction + start + answer)
  * stereo is labelled but the SMILES carries no stereo marks, or the reverse
  * an order type is listed without the sections it needs
  * the reaction SMARTS, run on the starting material, does not reproduce the answer

Usage: validate_content.py [--root DIR] [--strict]
  --strict   also fail on warnings (unsure items, missing highlights)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from rdkit import Chem, RDLogger
from rdkit.Chem import AllChem

try:
    from jsonschema import Draft7Validator
    from referencing import Registry, Resource
    from referencing.jsonschema import DRAFT7
except ImportError:  # pragma: no cover
    print("pip install -r scripts/requirements.txt", file=sys.stderr)
    raise

RDLogger.DisableLog("rdApp.*")

STEREO_LABELS_NEEDING_MARKS = {"single_enantiomer", "racemic", "meso", "cis", "trans", "syn", "anti"}
TYPE_REQUIREMENTS = {
    "make_it": ["start", "route", "answer", "productDistractors"],
    "predict_product": ["start", "route", "answer", "productDistractors"],
    "find_start": ["start", "route", "answer", "startDistractors"],
    "name_it": ["answer"],
    "spot_flaw": ["flaw"],
    "multistep": ["start", "route", "answer", "productDistractors", "reactionIds"],
}


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


# ---------- helpers ----------

def load_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def mol_from_smiles(smiles: str):
    return Chem.MolFromSmiles(smiles)


def canonical(smiles: str, stereo: bool = True) -> str | None:
    mol = mol_from_smiles(smiles)
    if mol is None:
        return None
    return Chem.MolToSmiles(mol, isomericSmiles=stereo)


def has_stereo_marks(smiles: str) -> bool:
    mol = mol_from_smiles(smiles)
    if mol is None:
        return False
    iso = Chem.MolToSmiles(mol, isomericSmiles=True)
    return "@" in iso or "/" in iso or "\\" in iso


def run_template(rxn_smarts: str, reactant_smiles: list[str], mode: str) -> set[str]:
    """Return the set of canonical (stereo-stripped) product SMILES the template yields."""
    rxn = AllChem.ReactionFromSmarts(rxn_smarts)
    mols = [mol_from_smiles(s) for s in reactant_smiles]
    if any(m is None for m in mols):
        return set()
    if mode == "exhaustive":
        if len(mols) != 1:
            raise ValueError("exhaustive mode supports a single reactant")
        cur = mols[0]
        for _ in range(20):
            product_sets = rxn.RunReactants((cur,))
            if not product_sets:
                break
            frags = []
            for p in product_sets[0]:
                Chem.SanitizeMol(p)
                frags.append(Chem.MolToSmiles(p, isomericSmiles=False))
            cur = mol_from_smiles(".".join(frags))
            if cur is None:
                return set()
        return {Chem.MolToSmiles(cur, isomericSmiles=False)}
    outs: set[str] = set()
    for product_set in rxn.RunReactants(tuple(mols)):
        frags = []
        try:
            for p in product_set:
                Chem.SanitizeMol(p)
                frags.append(Chem.MolToSmiles(p, isomericSmiles=False))
        except Exception:  # unsanitisable match; skip it
            continue
        joined = canonical(".".join(frags), stereo=False)
        if joined:
            outs.add(joined)
    return outs


# ---------- checks ----------

def validate_schema(name: str, data, schema_name: str, registry: Registry, report: Report) -> None:
    schema = registry.contents(f"https://letthemcook.local/schema/{schema_name}")
    validator = Draft7Validator(schema, registry=registry)
    item_schema = {"type": "array", "items": {"$ref": f"https://letthemcook.local/schema/{schema_name}"}}
    validator = Draft7Validator(item_schema, registry=registry)
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        path = "/".join(str(p) for p in err.absolute_path)
        report.error(f"[schema] {name}: {path}: {err.message}")
    report.ok()


def check_smiles(label: str, smiles: str, report: Report) -> bool:
    if mol_from_smiles(smiles) is None:
        report.error(f"[smiles] {label}: cannot parse '{smiles}'")
        return False
    report.ok()
    return True


def has_tetrahedral_marks(smiles: str) -> bool:
    mol = mol_from_smiles(smiles)
    return mol is not None and "@" in Chem.MolToSmiles(mol, isomericSmiles=True)


def check_stereo_consistency(label: str, smiles: str, stereo: str, report: Report) -> None:
    """Labels that the stereo picker asks about need tetrahedral marks; 'none' forbids them.
    Retained E/Z alkene geometry (/ \\ marks) is allowed under any label: it is drawn, not asked."""
    tetra = has_tetrahedral_marks(smiles)
    any_marks = has_stereo_marks(smiles)
    if stereo in ("single_enantiomer", "racemic", "meso", "syn", "anti") and not tetra:
        report.error(f"[stereo] {label}: labelled '{stereo}' but SMILES '{smiles}' has no tetrahedral (@) marks")
    elif stereo in ("cis", "trans") and not any_marks:
        report.error(f"[stereo] {label}: labelled '{stereo}' but SMILES '{smiles}' has no stereo marks")
    elif stereo == "none" and tetra:
        report.error(f"[stereo] {label}: labelled 'none' but SMILES '{smiles}' carries tetrahedral (@) marks")
    else:
        report.ok()


def check_highlights(label: str, smiles: str, atoms: list[int] | None, report: Report) -> None:
    if atoms is None:
        report.warn(f"[highlight] {label}: no highlightAtoms (mentor view will fall back to no highlight)")
        return
    mol = mol_from_smiles(smiles)
    n = mol.GetNumAtoms() if mol else 0
    bad = [a for a in atoms if a >= n]
    if bad:
        report.error(f"[highlight] {label}: atom indices {bad} out of range (molecule has {n} atoms)")
    else:
        report.ok()


def steps_signature(steps) -> tuple:
    return tuple((tuple(sorted(s["reagents"])), json.dumps(s.get("conditions", {}), sort_keys=True)) for s in steps)


def reagent_classes(reagents: dict) -> set[str]:
    return {c for r in reagents.values() for c in r.get("classes", [])}


def check_route_reagents(label: str, steps, reagents: dict, report: Report, allow_classes: bool = False) -> None:
    known_classes = reagent_classes(reagents)
    for i, step in enumerate(steps, 1):
        for rid in step["reagents"]:
            if rid.startswith("#"):
                if not allow_classes:
                    report.error(f"[ref] {label}: step {i} uses class token '{rid}' but only reaction definitions may")
                elif rid[1:] not in known_classes:
                    report.error(f"[ref] {label}: step {i} uses unknown reagent class '{rid}'")
                else:
                    report.ok()
            elif rid not in reagents:
                report.error(f"[ref] {label}: step {i} uses unknown reagent '{rid}'")
            else:
                report.ok()


def step_matches_template(template_reagents: list[str], actual_reagents: list[str], reagents: dict) -> bool:
    """A reaction step template matches an item step when every template token is satisfied by a distinct actual bottle."""
    if len(template_reagents) != len(actual_reagents):
        return False
    remaining = list(actual_reagents)
    for tok in template_reagents:
        hit = None
        for rid in remaining:
            if tok.startswith("#"):
                if tok[1:] in reagents.get(rid, {}).get("classes", []):
                    hit = rid
                    break
            elif tok == rid:
                hit = rid
                break
        if hit is None:
            return False
        remaining.remove(hit)
    return True


def route_matches_template(template, actual, reagents: dict) -> bool:
    return len(template) == len(actual) and all(step_matches_template(t["reagents"], a["reagents"], reagents) for t, a in zip(template, actual))


def resolve_reactants(spec_reactants: list[str], start_smiles: str | None, reagents: dict, label: str, report: Report, route=None) -> list[str] | None:
    out = []
    for token in spec_reactants:
        if token == "start":
            if start_smiles is None:
                report.error(f"[smarts] {label}: template needs 'start' but the item has no start")
                return None
            out.append(start_smiles)
        elif token.startswith("step:"):
            n = int(token.split(":")[1])
            step = (route or [])[n - 1] if route and len(route) >= n else None
            cands = [reagents[r]["smiles"] for r in (step["reagents"] if step else []) if "smiles" in reagents.get(r, {})]
            if not cands:
                report.error(f"[smarts] {label}: template reactant '{token}' but no reagent with smiles in that step")
                return None
            out.append(cands[0])
        else:
            reagent = reagents.get(token)
            if reagent is None or "smiles" not in reagent:
                report.error(f"[smarts] {label}: template reactant '{token}' is not a reagent with a smiles field")
                return None
            out.append(reagent["smiles"])
    return out


def run_pipeline(templates: list[dict], start_smiles: str, reagents: dict, label: str, report: Report, route) -> set[str] | None:
    """Apply templates in order. exhaustive: 0..n times per molecule; single: exactly once (any match)."""
    current: set[str] = {canonical(start_smiles, stereo=False)}
    for t in templates:
        nxt: set[str] = set()
        for smi in current:
            reactants = resolve_reactants(t["reactants"], smi, reagents, label, report, route)
            if reactants is None:
                return None
            if t["mode"] == "exhaustive":
                prods = run_template(t["rxn"], reactants, "exhaustive")
                nxt |= prods if prods else {smi}
            else:
                prods = run_template(t["rxn"], reactants, "single")
                if not prods:
                    report.error(f"[smarts] {label}: pipeline template '{t['rxn']}' does not apply to {smi}")
                    return None
                nxt |= prods
        current = nxt
    return current


def check_template(label: str, reaction: dict, start_smiles: str | None, answer_smiles: str, reagents: dict, report: Report, route=None) -> None:
    templates = reaction.get("smarts") or []
    if not templates:
        report.warn(f"[smarts] {label}: reaction {reaction['id']} has no SMARTS template; answer not machine-checked")
        return
    expected = canonical(answer_smiles, stereo=False)
    if reaction.get("smartsMode") == "pipeline":
        if start_smiles is None:
            report.error(f"[smarts] {label}: pipeline needs a start")
            return
        products = run_pipeline(templates, start_smiles, reagents, label, report, route)
        if products is None:
            return
        if expected in products:
            report.ok()
        else:
            report.error(f"[smarts] {label}: pipeline for {reaction['id']} gives {sorted(products)}, answer is {expected}")
        return
    products: set[str] = set()
    for t in templates:
        reactants = resolve_reactants(t["reactants"], start_smiles, reagents, label, report, route)
        if reactants is None:
            return
        try:
            products |= run_template(t["rxn"], reactants, t["mode"])
        except Exception as exc:  # bad SMARTS
            report.error(f"[smarts] {label}: template for {reaction['id']} failed to run: {exc}")
            return
        if expected in products:
            report.ok()
            return
    report.error(f"[smarts] {label}: template(s) for {reaction['id']} give {sorted(products) or 'nothing'}, answer is {expected}")


def mirror_canonical(smiles: str) -> str | None:
    """Canonical SMILES of the mirror image (all tetrahedral centres inverted)."""
    mol = mol_from_smiles(smiles)
    if mol is None:
        return None
    can = Chem.MolToSmiles(mol, isomericSmiles=True)
    flipped = can.replace("@@", "\x00").replace("@", "@@").replace("\x00", "@")
    m2 = mol_from_smiles(flipped)
    return Chem.MolToSmiles(m2, isomericSmiles=True) if m2 else None


def check_meso_racemic(label: str, smiles: str, stereo: str, report: Report) -> None:
    if stereo not in ("meso", "racemic", "single_enantiomer"):
        return
    can = canonical(smiles, stereo=True)
    mirror = mirror_canonical(smiles)
    if mirror is None:
        return
    if stereo == "meso" and can != mirror:
        report.error(f"[stereo] {label}: labelled meso but '{smiles}' is chiral (mirror image differs)")
    elif stereo in ("racemic", "single_enantiomer") and can == mirror:
        report.error(f"[stereo] {label}: labelled {stereo} but '{smiles}' is achiral/meso (equals its mirror image)")
    else:
        report.ok()


def validate_question(q: dict, reactions: dict, reagents: dict, tags: set, report: Report, seen_facts: dict) -> None:
    qid = q["id"]
    label = qid

    # references
    for rid in [q["reactionId"], *q.get("reactionIds", [])]:
        if rid not in reactions:
            report.error(f"[ref] {label}: unknown reaction '{rid}'")
        else:
            report.ok()
    reaction = reactions.get(q["reactionId"])
    if reaction and reaction["chapter"] != q["chapter"]:
        report.error(f"[ref] {label}: chapter {q['chapter']} does not match reaction {reaction['id']} (chapter {reaction['chapter']})")

    # order-type requirements
    for t in q["orderTypes"]:
        for section in TYPE_REQUIREMENTS[t]:
            if section not in q:
                report.error(f"[type] {label}: order type '{t}' needs section '{section}'")
            else:
                report.ok()
        if t in ("make_it", "predict_product", "multistep") and len(q.get("productDistractors", [])) < 3:
            report.error(f"[type] {label}: '{t}' needs at least 3 productDistractors")
        if t == "find_start" and len(q.get("startDistractors", [])) < 3:
            report.error(f"[type] {label}: 'find_start' needs at least 3 startDistractors")
        if t == "name_it" and not q.get("answer", {}).get("names", {}).get("accepted"):
            report.error(f"[type] {label}: 'name_it' needs answer.names.accepted")
        if t == "multistep" and len(q.get("route", {}).get("steps", [])) < 2:
            report.error(f"[type] {label}: 'multistep' needs a route with >= 2 steps")

    if q.get("review"):
        report.warn(f"[review] {label}: marked for review: {q['review']}")

    # start / route / answer
    start = q.get("start")
    if start:
        check_smiles(f"{label}.start", start["smiles"], report)
    route = q.get("route")
    if route:
        check_route_reagents(label, route["steps"], reagents, report)
        for alt in route.get("alt", []):
            check_route_reagents(f"{label}.alt", alt, reagents, report)
        if reaction and reaction.get("steps"):
            # the canonical route must use the reaction's bottles (order and sets; '#class' tokens allowed), ignoring conditions
            templates = [reaction["steps"], *reaction.get("altRoutes", [])]
            if "multistep" not in q["orderTypes"] and not any(route_matches_template(t, route["steps"], reagents) for t in templates):
                q_sig = tuple(tuple(sorted(s["reagents"])) for s in route["steps"])
                report.error(f"[route] {label}: route bottles {q_sig} do not match reaction {reaction['id']} steps or its altRoutes")
            else:
                report.ok()

    answer = q.get("answer")
    answer_canon = None
    if answer:
        if check_smiles(f"{label}.answer", answer["smiles"], report):
            answer_canon = canonical(answer["smiles"], stereo=True)
            check_stereo_consistency(f"{label}.answer", answer["smiles"], answer["stereo"], report)
            check_meso_racemic(f"{label}.answer", answer["smiles"], answer["stereo"], report)
            check_highlights(f"{label}.answer", answer["smiles"], answer.get("highlightAtoms"), report)
            if start and reaction:
                check_template(label, reaction, start["smiles"], answer["smiles"], reagents, report, route["steps"] if route else None)
        for trap in answer.get("names", {}).get("traps", []):
            if trap["tag"] not in tags:
                report.error(f"[tag] {label}: name trap '{trap['name']}' has unknown tag '{trap['tag']}'")
        names = answer.get("names", {}).get("accepted", [])
        if len(set(n.lower() for n in names)) != len(names):
            report.error(f"[names] {label}: duplicate accepted names")

    # distractors
    answer_flat = canonical(answer["smiles"], stereo=False) if answer else None
    for section in ("productDistractors", "startDistractors"):
        seen_d: set[str] = set()
        for i, d in enumerate(q.get(section, [])):
            dl = f"{label}.{section}[{i}]"
            if d["tag"] not in tags:
                report.error(f"[tag] {dl}: unknown tag '{d['tag']}'")
            else:
                report.ok()
            if not check_smiles(dl, d["smiles"], report):
                continue
            check_stereo_consistency(dl, d["smiles"], d["stereo"], report)
            check_meso_racemic(dl, d["smiles"], d["stereo"], report)
            d_canon = canonical(d["smiles"], stereo=True)
            d_flat = canonical(d["smiles"], stereo=False)
            if d_canon in seen_d:
                report.error(f"[distractor] {dl}: duplicates another distractor")
            seen_d.add(d_canon)
            if section == "productDistractors" and answer_canon is not None:
                if d_canon == answer_canon:
                    report.error(f"[distractor] {dl}: identical to the answer")
                elif d_flat == answer_flat and not d.get("stereoOnly"):
                    report.error(f"[distractor] {dl}: equals the answer once stereo is stripped; set stereoOnly=true if deliberate")
                else:
                    report.ok()
            if section == "startDistractors" and start:
                if d_canon == canonical(start["smiles"], stereo=True):
                    report.error(f"[distractor] {dl}: identical to the starting material")

    for i, rd in enumerate(q.get("routeDistractors", [])):
        rl = f"{label}.routeDistractors[{i}]"
        if rd["tag"] not in tags:
            report.error(f"[tag] {rl}: unknown tag '{rd['tag']}'")
        check_route_reagents(rl, rd["steps"], reagents, report)
        if route and steps_signature(rd["steps"]) == steps_signature(route["steps"]):
            report.error(f"[route] {rl}: flawed route is identical to the correct route")
        if rd.get("product"):
            check_smiles(f"{rl}.product", rd["product"]["smiles"], report)

    # spot the flaw
    flaw = q.get("flaw")
    if flaw:
        check_smiles(f"{label}.flaw.target", flaw["target"]["smiles"], report)
        target_canon = canonical(flaw["target"]["smiles"], stereo=False)
        choice_tags = [c["tag"] for c in flaw["choices"]]
        for ct in choice_tags:
            if ct not in tags:
                report.error(f"[tag] {label}.flaw: unknown choice tag '{ct}'")
        if choice_tags.count(flaw["answer"]["tag"]) != 1:
            report.error(f"[flaw] {label}: answer tag '{flaw['answer']['tag']}' must appear exactly once in choices")
        working = [r for r in flaw["routes"] if r["works"]]
        if len(working) != 1 or working[0]["id"] != flaw["answer"]["route"]:
            report.error(f"[flaw] {label}: exactly one route must work and it must be answer.route")
        for r in flaw["routes"]:
            rl = f"{label}.flaw.route{r['id']}"
            check_smiles(f"{rl}.start", r["start"]["smiles"], report)
            check_route_reagents(rl, r["steps"], reagents, report)
            rxn = reactions.get(r["reactionId"])
            if rxn is None:
                report.error(f"[ref] {rl}: unknown reaction '{r['reactionId']}'")
                continue
            if not r["works"]:
                if not r.get("tag"):
                    report.error(f"[flaw] {rl}: failing route needs a tag")
                elif r["tag"] != flaw["answer"]["tag"]:
                    report.error(f"[flaw] {rl}: failing route tag differs from answer tag")
            if r.get("product"):
                if check_smiles(f"{rl}.product", r["product"]["smiles"], report):
                    p_canon = canonical(r["product"]["smiles"], stereo=False)
                    if r["works"] and p_canon != target_canon:
                        report.error(f"[flaw] {rl}: working route's product is not the target")
                    if not r["works"] and p_canon == target_canon:
                        report.error(f"[flaw] {rl}: failing route's product equals the target")
                    check_template(rl, rxn, r["start"]["smiles"], r["product"]["smiles"], reagents, report, r["steps"])

    # duplicate facts
    if start and answer and answer_canon:
        key = (q["reactionId"], canonical(start["smiles"], stereo=True), answer_canon)
        if key in seen_facts:
            report.error(f"[dup] {label}: same reaction/start/answer as {seen_facts[key]}")
        else:
            seen_facts[key] = qid
            report.ok()


def validate_reaction(r: dict, reagents: dict, tags: set, report: Report) -> None:
    label = f"reaction {r['id']}"
    check_route_reagents(label, r["steps"], reagents, report, allow_classes=True)
    for alt in r.get("altRoutes", []):
        check_route_reagents(f"{label}.altRoutes", alt, reagents, report, allow_classes=True)
    for rid in r.get("decoys", []):
        if rid not in reagents:
            report.error(f"[ref] {label}: unknown decoy reagent '{rid}'")
    for t in r.get("typicalTags", []):
        if t not in tags:
            report.error(f"[tag] {label}: unknown typical tag '{t}'")
    for t in r.get("smarts", []):
        try:
            AllChem.ReactionFromSmarts(t["rxn"])
            report.ok()
        except Exception as exc:
            report.error(f"[smarts] {label}: SMARTS does not parse: {exc}")
        for token in t["reactants"]:
            if token != "start" and not token.startswith("step:") and "smiles" not in reagents.get(token, {}):
                report.error(f"[smarts] {label}: reactant '{token}' is not a reagent with smiles")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()
    root = Path(args.root)
    content = root / "content"
    report = Report()

    # schemas
    registry = Registry()
    for schema_file in sorted((content / "schema").glob("*.schema.json")):
        schema = load_json(schema_file)
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema, default_specification=DRAFT7))

    reagents_list = load_json(content / "reagents.json")
    reactions_list = load_json(content / "reactions.json")
    tags_list = load_json(content / "mistake_tags.json")
    question_files = sorted((content / "questions").glob("*.json"))

    validate_schema("reagents.json", reagents_list, "reagent.schema.json", registry, report)
    validate_schema("reactions.json", reactions_list, "reaction.schema.json", registry, report)
    validate_schema("mistake_tags.json", tags_list, "mistake-tag.schema.json", registry, report)
    questions: list[dict] = []
    for qf in question_files:
        data = load_json(qf)
        validate_schema(qf.name, data, "question.schema.json", registry, report)
        questions.extend(data)

    if report.errors:
        return finish(report, args.strict)

    reagents = {r["id"]: r for r in reagents_list}
    reactions = {r["id"]: r for r in reactions_list}
    tags = {t["id"] for t in tags_list}
    for coll, name in ((reagents_list, "reagent"), (reactions_list, "reaction"), (tags_list, "tag")):
        ids = [x["id"] for x in coll]
        for dup in {i for i in ids if ids.count(i) > 1}:
            report.error(f"[dup] duplicate {name} id '{dup}'")

    for r in reagents_list:
        if "smiles" in r:
            check_smiles(f"reagent {r['id']}", r["smiles"], report)
    for r in reactions_list:
        validate_reaction(r, reagents, tags, report)

    seen_ids: set[str] = set()
    seen_facts: dict = {}
    for q in questions:
        if q["id"] in seen_ids:
            report.error(f"[dup] duplicate question id '{q['id']}'")
        seen_ids.add(q["id"])
        validate_question(q, reactions, reagents, tags, report, seen_facts)

    # coverage summary (informational)
    per_reaction: dict[str, int] = {}
    for q in questions:
        per_reaction[q["reactionId"]] = per_reaction.get(q["reactionId"], 0) + 1
    print(f"content: {len(reagents)} reagents, {len(reactions)} reactions, {len(tags)} tags, {len(questions)} questions")
    for rid in sorted(reactions, key=lambda x: (x[0], int(x[1:]))):
        n = per_reaction.get(rid, 0)
        flag = "" if n >= 6 else "  (< 6 variants)"
        print(f"  {rid:4s} {n:3d} items{flag}")
    return finish(report, args.strict)


def finish(report: Report, strict: bool) -> int:
    for w in report.warnings:
        print(f"WARN  {w}")
    for e in report.errors:
        print(f"ERROR {e}")
    print(f"{report.checks} checks passed, {len(report.warnings)} warnings, {len(report.errors)} errors")
    if report.errors or (strict and report.warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
