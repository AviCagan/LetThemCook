# Beaker Buddies

A cute pixel-art lab game for drilling Organic Chemistry II reactions (Carey 12e, Ch 16–17). Scientists bring a starting material to your bench; you pick reagents from the shelf in the right order, run each step as a small minigame, identify the product, and the game tracks what you know reaction by reaction with spaced repetition.

Original characters, art and names. All chemistry lives in `content/` as data and is validated with RDKit in CI.

## Status

**Phase 1 (MVP)**: "Make it" and "What do I get?" orders for 12 reactions (R1–R5, R10, R11, R21–R23, P1, E3; 82 items), pour / temperature / workup / stir / lamp minigames, scoring, SRS with your seeded weak spots, Lab Notebook, save + export/import, PWA, GitHub Pages deploy, content validation in CI. See `docs/PLAN.md` for the architecture and `REVIEW.md` for open chemistry questions.

## Run it locally

```
npm install
npm run dev        # http://localhost:5173
npm test           # engine + SRS unit tests (vitest)
npm run typecheck
npm run build      # production build in dist/ (PWA service worker included)
npm run preview    # serve dist/ to test offline / install behaviour
```

`npm run dev` and `npm run build` first copy the RDKit.js runtime (`RDKit_minimal.js` + `.wasm`) from `node_modules` into `public/rdkit/`, where the service worker precaches it.

### Validate the chemistry content

```
python3 -m venv .venv && . .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/validate_content.py          # fails on bad SMILES, answer == distractor, duplicates, stereo mismatches, broken templates
python scripts/derive_highlights.py         # fills answer.highlightAtoms for new items (changed atoms, via MCS)
```

CI (`.github/workflows/validate.yml`) runs both the validator (`--strict`) and the TypeScript build on every push.

## Deploy to GitHub Pages

`.github/workflows/pages.yml` builds with `BASE_PATH=/<repo>/` and deploys `dist/` on every push to `main`.

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site then lives at `https://<user>.github.io/<repo>/` over HTTPS, which iOS needs for the PWA.

## Install on iPhone

1. Open the GitHub Pages URL in Safari.
2. Share → **Add to Home Screen**.
3. Launch it from the home screen: it runs full-screen and keeps working offline after the first load (the service worker caches the app, the content and the RDKit runtime).

## Android APK

Phase 3 adds the Capacitor project and the `android.yml` workflow that builds a debug APK on every push and uploads it as an artifact.

## Adding chemistry

Everything the engine knows comes from `content/`:

- `reagents.json`: shelf bottles (label, what the card says, default minigame, optional `classes` such as `alkyl_halide_1`).
- `reactions.json`: toolkit rows with canonical steps, rules, stereo outcome and RDKit reaction SMARTS used by the validator.
- `questions/<reaction>.json`: items. One item can be served as several order types depending on which sections it has (see `content/schema/question.schema.json`).
- `mistake_tags.json`: tags with the rule the mentor restates.

Add a file, run the validator, and the reactions appear in the game and the notebook. No engine changes needed.

## Layout

```
content/     chemistry data + JSON schemas (no code)
scripts/     validate_content.py, derive_highlights.py, copy-rdkit.mjs, gen-icons.mjs
src/chem     RDKit.js loader + SVG drawing (translucent highlights)
src/content  typed loaders
src/engine   order builder, route/product grader, scoring
src/mastery  SRS, scheduler, seeds, stats
src/save     IndexedDB store, export/import codes, merge
src/game     Phaser scenes: lab + minigames
src/art      code-defined pixel sprites -> textures
src/ui       Preact overlays
tests/       vitest
```
