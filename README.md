# Beaker Buddies (working title)

Cute pixel-art lab game for drilling Organic Chemistry II reactions (Carey 12e, Ch 16–17): scientists bring a starting material, you pick reagents from the shelf in order, run each step as a minigame, identify the product, and the game tracks mastery per reaction and per reagent with spaced repetition.

Status: **Phase 0 (plan)**. See `docs/PLAN.md`, the schemas in `content/schema/`, and the 5 sample questions in `content/questions/samples.json`. Open questions: `REVIEW.md`.

## Validate the content

```
python3 -m venv .venv && . .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/validate_content.py
```
