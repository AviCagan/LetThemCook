# Beaker Buddies

A Game Boy Color-style lab game for drilling Organic Chemistry II reactions (Carey 12e, Ch 16–17). A customer walks into the lab with a molecule and asks for another one by IUPAC name (tap "?" to see the structure). You make it: pick a bottle from the shelf, set heat, light, equivalents or pressure, and the game runs the real reaction on your flask with RDKit and shows you what you actually got. Keep going until the flask holds the target, then hand it over. One step or five, your call. A "?" button asks the mentor for the next step (costs stars), a notepad keeps your notes per problem, and the lab book records every step of every order. Mastery is tracked per reaction and per reagent with spaced repetition.

Original characters, art and names. All chemistry lives in `content/` as data and is validated with RDKit in CI.

## Status

**Phase 2 (current)**: 57 reactions (the Exam 2 toolkit R1–R28, P1–P10, E2–E13 plus six rows from Carey's chapter 16/17 summary tables: alkene hydration, alkyl-halide hydrolysis, tosylates, Swern/PDC, Sharpless, alcohol + alkene ether synthesis) with 816 orders: 376 single-reaction orders and 440 multi-step syntheses built by chaining validated orders (2–3 steps, named at both ends). A live RDKit reaction engine (77 bottles, 113 rules, 159 no-reaction traps, 175 rule tests, Python/JS parity checked in CI), the make-it loop with step-by-step products on a full searchable shelf, the target structure beside the flask, mentor help, per-order notes, lab book, stereo check at hand-over, SRS with your seeded weak spots, a Synthesis shift mode, mastery notebook, save + export/import, light/dark theme, PWA, GitHub Pages deploy. See `docs/PLAN.md` for the architecture and `REVIEW.md` for open chemistry questions.

## Run it locally

```
npm install
npm run dev        # http://localhost:5173
npm test           # SRS, save and sprite unit tests (vitest)
npm run parity     # bundles the TS reaction engine for Node and checks it against the Python engine on every rule test and every order route
npm run typecheck
npm run build      # production build in dist/ (PWA service worker included)
npm run preview    # serve dist/ to test offline / install behaviour
```

`npm run dev` and `npm run build` first copy the RDKit.js runtime (`RDKit_minimal.js` + `.wasm`) from `node_modules` into `public/rdkit/`, where the service worker precaches it.

### Validate the chemistry content

```
python3 -m venv .venv && . .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/validate_content.py          # fails on bad SMILES/SMARTS, routes that do not reach the target, duplicates, stereo mismatches, failed rule tests
python scripts/validate_content.py --fill   # same, and writes target.smiles / highlightAtoms for new items by running their route through the engine
python scripts/run_rule_tests.py            # just the engine rule tests (content/rule_tests.json)
```

CI (`.github/workflows/validate.yml`) runs the validator (`--strict`), the engine parity check, typecheck, unit tests and the build on every push.

## Deploy to GitHub Pages

`.github/workflows/pages.yml` builds with `BASE_PATH=/<repo>/` and deploys `dist/` on every push to the default branch (or on demand from any branch via Actions → "Run workflow").

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site then lives at `https://<user>.github.io/<repo>/` over HTTPS, which iOS needs for the PWA.

## Install on iPhone

1. Open the GitHub Pages URL in Safari.
2. Share → **Add to Home Screen**.
3. Launch it from the home screen: it runs full-screen and keeps working offline after the first load (the service worker caches the app, the content and the RDKit runtime).

## Android APK

Phase 3 adds the Capacitor project and the `android.yml` workflow that builds a debug APK on every push and uploads it as an artifact.

## Adding chemistry

Everything the engine knows comes from `content/`:

- `reagents.json`: shelf bottles (label, card text, which conditions the bottle asks for: temperature presets, lamp, equivalents, pressure).
- `rules.json`: what each bottle does to a flask, as ordered RDKit reaction SMARTS pipelines with optional conditions, partner reagent, blockers and warnings; plus `noReaction` traps (the mistake tag and the "why" shown when a bottle does nothing).
- `rule_tests.json`: flask + reagent + conditions → expected product. Run by the validator and by `npm run parity` through the browser engine.
- `reactions.json`: the toolkit rows (summary, typical mistake tags, decoy bottles) that the notebook and the scheduler use.
- `questions/<reaction>.json`: orders. Each has a start molecule, the target by name (and stereo label), the intended `route` of bottles, optional `altRoutes`, and `traps` (wrong products with their mistake tag). `target.smiles` and the highlights are filled by the validator from the route, so the answer always matches what the engine does.
- `questions/SYN.json`: multi-step synthesis orders, generated by `python scripts/gen_synthesis.py` from the single-reaction orders (A's product = B's start, E/Z geometry matched, every chain re-run through the engine). Regenerate it after editing other question files.
- `mistake_tags.json`: tags with the rule the mentor restates.

Add a file, run `validate_content.py --fill`, and the orders appear in the game and the notebook. No engine changes needed.

Open `?debug=1` on the game URL to get `window.__bb` (flow, save, screen, Phaser game) in the console.

## Layout

```
content/     chemistry data + JSON schemas (no code)
scripts/     validate_content.py, chem_engine.py (Python twin of the engine), run_rule_tests.py,
             build-engine.mjs + parity.mjs, copy-rdkit.mjs, gen-icons.mjs
src/chem     RDKit.js loader, SVG drawing (translucent highlights), reaction engine (rules.json → run_reactants)
src/content  typed loaders
src/flow.ts  the game loop: shift → customer → request → bench → stereo → result/mentor → day end
src/engine   scoring, stereo labels
src/mastery  SRS, scheduler, seeds, stats
src/save     IndexedDB store, export/import codes, merge
src/game     Phaser: the top-down lab room (tiles, walking customers, mentor, effects)
src/art      code-defined GBC sprites and tiles -> textures / data URLs
src/ui       Preact overlays: request card, workbench + shelf, notepad, lab book, notebook, settings
tests/       vitest
```
