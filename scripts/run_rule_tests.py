#!/usr/bin/env python3
"""Run content/rule_tests.json through the Python reaction engine. Exit 1 on any failure."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chem_engine import Engine, canon, strip_stereo  # noqa: E402

root = Path(__file__).resolve().parent.parent
engine = Engine(root)
tests = json.loads((root / "content" / "rule_tests.json").read_text(encoding="utf-8"))
fails = 0
for c in tests:
    try:
        out = engine.apply(c["reagent"], c.get("conditions"), c["flask"])
    except Exception as exc:
        print(f"FAIL {c['id']}: exception {exc}")
        fails += 1
        continue
    if c.get("noReaction"):
        ok = not out.changed
        if ok and c.get("trap"):
            got = out.traps[0]["tag"] if out.traps else None
            if got != c["trap"]:
                ok = False
                print(f"FAIL {c['id']}: expected trap {c['trap']}, got {got} ({out.traps[0]['why'] if out.traps else 'no trap'})")
                fails += 1
                continue
        if not ok:
            print(f"FAIL {c['id']}: expected no reaction, got {out.product} via {out.rule['id'] if out.rule else '?'}")
            fails += 1
    else:
        exp = strip_stereo(c["expect"])
        got = strip_stereo(out.product)
        if exp is None:
            print(f"FAIL {c['id']}: expected SMILES does not parse: {c['expect']}")
            fails += 1
        elif got != exp:
            print(f"FAIL {c['id']}: expected {exp}, got {got} (changed={out.changed}, rule={out.rule['id'] if out.rule else None}, blocked={out.blocked})")
            fails += 1
        elif c.get("warn") and not any(w["tag"] == c["warn"] for w in out.warnings):
            print(f"FAIL {c['id']}: expected warning {c['warn']}")
            fails += 1
print(f"{len(tests) - fails}/{len(tests)} rule tests passed")
sys.exit(1 if fails else 0)
