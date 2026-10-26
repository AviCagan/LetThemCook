#!/usr/bin/env python3
"""Fill in answer.highlightAtoms for question items that lack it.

The highlight marks the atoms of the product that changed relative to the starting
material: atoms outside the maximum common substructure, plus mapped atoms whose
bonding changed (a C=O that became C–O, an N that became O...). Atom indices follow
the answer SMILES order, which RDKit preserves, so the game can pass them straight
to get_svg_with_highlights.

Usage: derive_highlights.py [--root DIR] [--force]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from rdkit import Chem, RDLogger
from rdkit.Chem import rdFMCS

RDLogger.DisableLog("rdApp.*")


def changed_atoms(start_smiles: str, answer_smiles: str) -> list[int]:
    start = Chem.MolFromSmiles(start_smiles)
    answer = Chem.MolFromSmiles(answer_smiles)
    if start is None or answer is None:
        return []
    if Chem.MolToSmiles(start) == Chem.MolToSmiles(answer):
        return []  # no reaction: nothing to highlight
    res = rdFMCS.FindMCS(
        [start, answer],
        atomCompare=rdFMCS.AtomCompare.CompareElements,
        bondCompare=rdFMCS.BondCompare.CompareOrderExact,
        ringMatchesRingOnly=False,
        completeRingsOnly=False,
        matchValences=False,
        timeout=5,
    )
    if res.numAtoms == 0:
        return list(range(answer.GetNumAtoms()))
    patt = Chem.MolFromSmarts(res.smartsString)
    a_match = answer.GetSubstructMatch(patt)
    s_match = start.GetSubstructMatch(patt)
    if not a_match or not s_match:
        return list(range(answer.GetNumAtoms()))
    mapping = dict(zip(a_match, s_match))  # answer idx -> start idx
    highlight: set[int] = set(range(answer.GetNumAtoms())) - set(a_match)
    for a_idx, s_idx in mapping.items():
        a_atom = answer.GetAtomWithIdx(a_idx)
        s_atom = start.GetAtomWithIdx(s_idx)
        a_env = sorted((b.GetBondTypeAsDouble(), b.GetOtherAtom(a_atom).GetAtomicNum()) for b in a_atom.GetBonds())
        s_env = sorted((b.GetBondTypeAsDouble(), b.GetOtherAtom(s_atom).GetAtomicNum()) for b in s_atom.GetBonds())
        if a_env != s_env or a_atom.GetTotalNumHs() != s_atom.GetTotalNumHs() or a_atom.GetFormalCharge() != s_atom.GetFormalCharge():
            highlight.add(a_idx)
    # a highlighted heteroatom pulls in its carbon so the changed bond is visible
    for idx in list(highlight):
        atom = answer.GetAtomWithIdx(idx)
        if atom.GetAtomicNum() != 6:
            for nb in atom.GetNeighbors():
                if nb.GetAtomicNum() == 6:
                    highlight.add(nb.GetIdx())
    return sorted(highlight)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--force", action="store_true", help="recompute even when highlightAtoms is present")
    args = ap.parse_args()
    qdir = Path(args.root) / "content" / "questions"
    total = 0
    for f in sorted(qdir.glob("*.json")):
        items = json.loads(f.read_text(encoding="utf-8"))
        changed = False
        for q in items:
            ans = q.get("answer")
            start = q.get("start")
            if not ans or not start:
                continue
            if "highlightAtoms" in ans and not args.force:
                continue
            ans["highlightAtoms"] = changed_atoms(start["smiles"], ans["smiles"])
            changed = True
            total += 1
        if changed:
            f.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"highlights derived for {total} items")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
