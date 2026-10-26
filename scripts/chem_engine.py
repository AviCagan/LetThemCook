"""Reference implementation of the Beaker Buddies reaction engine (RDKit, Python).

The browser runs the same rules with RDKit.js (src/chem/engine.ts); scripts/parity.mjs checks
that both give identical products for every item. Semantics:

  apply(reagent, conditions, flask_smiles) -> Outcome
    rules for that bottle are tried in file order;
    a rule is skipped when its `conditions` are not satisfied by the chosen conditions,
    or when any `requireNot` pattern is present in the flask (recorded as `blocked`);
    the rule's pipeline runs on the flask contents (plus a partner molecule when `partner`
    is "bottle" (the bottle's SMILES) or "self" (a second copy of the flask));
    the first rule whose pipeline CHANGES the flask wins.
  pipeline step {rxn, repeat}: apply the template; take the first product set; repeat while it changes (max 12).
  pipeline step {anyOf: [...], repeat}: the first template in the list that matches is applied (once per pass).
  Flask contents are kept as a canonical isomeric SMILES; fragments are dot-separated.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from rdkit import Chem, RDLogger
from rdkit.Chem import AllChem

RDLogger.DisableLog("rdApp.*")
MAX_REPEAT = 12


def canon(smiles: str, stereo: bool = True) -> str | None:
    m = Chem.MolFromSmiles(smiles)
    return Chem.MolToSmiles(m, isomericSmiles=stereo) if m else None


def strip_stereo(smiles: str) -> str | None:
    return canon(smiles, stereo=False)


_rxn_cache: dict[str, AllChem.ChemicalReaction] = {}


def _rxn(smarts: str) -> AllChem.ChemicalReaction:
    r = _rxn_cache.get(smarts)
    if r is None:
        r = AllChem.ReactionFromSmarts(smarts)
        _rxn_cache[smarts] = r
    return r


def _run_once(smarts: str, mols: list[Chem.Mol]) -> str | None:
    """Apply the template once; return the canonical SMILES of the FIRST valid product set, or None."""
    rxn = _rxn(smarts)
    if rxn.GetNumReactantTemplates() != len(mols):
        return None
    for product_set in rxn.RunReactants(tuple(mols)):
        frags = []
        ok = True
        for p in product_set:
            try:
                Chem.SanitizeMol(p)
                frags.append(Chem.MolToSmiles(p, isomericSmiles=True))
            except Exception:
                ok = False
                break
        if not ok:
            continue
        joined = canon(".".join(frags))
        if joined:
            return joined
    return None


def _apply_step_fragment(step: dict, frag: str, partner: str | None) -> str:
    templates = step.get("anyOf") or [step["rxn"]]
    repeat = bool(step.get("repeat"))
    cur = frag
    for _ in range(MAX_REPEAT if repeat else 1):
        mols = [Chem.MolFromSmiles(cur)]
        if partner is not None:
            mols.append(Chem.MolFromSmiles(partner))
        nxt = None
        for t in templates:
            nxt = _run_once(t, mols)
            if nxt is not None:
                break
        if nxt is None or nxt == cur:
            break
        cur = nxt
    return cur


def _apply_step(step: dict, flask: str, partner: str | None) -> str:
    """RDKit only carries over atoms connected to the match, so a multi-fragment flask is
    processed fragment by fragment and re-joined (a template may itself split a fragment)."""
    frags = flask.split(".")
    out = [_apply_step_fragment(step, f, partner) for f in frags]
    return canon(".".join(out)) or flask


@dataclass
class Outcome:
    product: str
    changed: bool
    rule: dict | None = None
    blocked: list[str] = field(default_factory=list)
    traps: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)


class Engine:
    def __init__(self, root: Path):
        content = root / "content"
        data = json.loads((content / "rules.json").read_text(encoding="utf-8"))
        self.rules_by_reagent: dict[str, list[dict]] = {}
        for r in data["rules"]:
            self.rules_by_reagent.setdefault(r["reagent"], []).append(r)
        self.traps: list[dict] = data["noReaction"]
        self.reagents = {r["id"]: r for r in json.loads((content / "reagents.json").read_text(encoding="utf-8"))}
        self._patt: dict[str, Chem.Mol] = {}

    def patt(self, smarts: str) -> Chem.Mol:
        p = self._patt.get(smarts)
        if p is None:
            p = Chem.MolFromSmarts(smarts)
            self._patt[smarts] = p
        return p

    @staticmethod
    def conditions_ok(required: dict | None, chosen: dict | None) -> bool:
        if not required:
            return True
        chosen = chosen or {}
        for key, want in required.items():
            have = chosen.get(key)
            if isinstance(want, list):
                if have not in want:
                    return False
            elif have != want:
                return False
        return True

    def apply(self, reagent_id: str, conditions: dict | None, flask: str) -> Outcome:
        flask_c = canon(flask)
        if flask_c is None:
            raise ValueError(f"bad flask SMILES {flask}")
        mol = Chem.MolFromSmiles(flask_c)
        blocked: list[str] = []
        warnings: list[dict] = []
        for rule in self.rules_by_reagent.get(reagent_id, []):
            if not self.conditions_ok(rule.get("conditions"), conditions):
                continue
            if any(mol.HasSubstructMatch(self.patt(p)) for p in rule.get("requireNot", [])):
                blocked.append(rule.get("requireNotWhy", "blocked"))
                continue
            partner = None
            if rule.get("partner") == "bottle":
                partner = self.reagents[reagent_id].get("smiles")
                if partner is None:
                    raise ValueError(f"rule {rule['id']} needs a bottle smiles")
            elif rule.get("partner") == "self":
                partner = flask_c
            cur = flask_c
            for step in rule["pipeline"]:
                cur = _apply_step(step, cur, partner)
            if cur != flask_c:
                w = rule.get("warn")
                if w and (conditions or {}).get("light") == w.get("light"):
                    warnings.append({"tag": w["tag"], "why": w["why"]})
                return Outcome(product=cur, changed=True, rule=rule, blocked=blocked, warnings=warnings)
        traps = [t for t in self.traps if t["reagent"] == reagent_id and (t["pattern"] == "*" or mol.HasSubstructMatch(self.patt(t["pattern"])))]
        return Outcome(product=flask_c, changed=False, blocked=blocked, traps=traps[:1] if traps else [])

    def run_route(self, start: str, route: list[dict]) -> tuple[str, list[Outcome]]:
        flask = canon(start)
        outcomes = []
        for s in route:
            o = self.apply(s["reagent"], s.get("conditions"), flask)
            outcomes.append(o)
            flask = o.product
        return flask, outcomes


def contains_target(flask: str, target: str) -> bool:
    """True when the target molecule is one of the flask's fragments (stereo ignored)."""
    t = strip_stereo(target)
    frags = {strip_stereo(f) for f in flask.split(".")}
    return t in frags or strip_stereo(flask) == t
