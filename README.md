# Beaker Buddies

A Game Boy Color-style lab game for drilling Organic Chemistry II reactions (Carey 12e, Ch 16–17). A customer walks into the lab with a molecule and asks for another one by IUPAC name (tap "?" to see the structure). You make it: pick a bottle from the shelf, set heat, light, equivalents or pressure, and the game runs the real reaction on your flask with RDKit and shows you what you actually got. Keep going until the flask holds the target, then hand it over. One step or five, your call. A "?" button asks the mentor for the next step (costs stars), a notepad keeps your notes per problem, and the lab book records every step of every order. Mastery is tracked per reaction and per reagent with spaced repetition.

Original characters, art and names. All chemistry lives in `content/` as data and is validated with RDKit in CI.

## Status

All four phases of the plan are built.

- **Chemistry.** 57 reactions: the Exam 2 toolkit (R1–R28, P1–P10, E1–E13) plus six rows from Carey's chapter 16/17 summary tables (alkene hydration, alkyl-halide hydrolysis, tosylates, Swern/PDC, Sharpless, alcohol + alkene ether synthesis). 840 orders: 400 single-reaction orders (24 of them E1 naming) and 440 multi-step syntheses chained from validated orders. A live RDKit reaction engine (77 bottles, 113 rules, 175 rule tests, Python/JS parity in CI). Every name is checked against its structure with OPSIN.
- **Order types** (unlock as you play): Make it (the bench), What do I get?, Name it, What did I start with?, Spot the flaw, and multi-step special orders.
- **Modes:** shifts that get harder as they go, Weakness clinic, Synthesis shift, Practice by reaction or by reagent, Rush hour (timed) and Exam (N questions, no hints, optional timer). Daily-special customer for your most overdue reaction.
- **Mastery:** spaced repetition per reaction and per reagent with your seeded weak spots, mistake tags that steer distractors and the clinic, mastery notebook, lab book of every step, notes per problem.
- **Extras:** coin shop (counter/rug/hood colours, plants, decor, posters, four lab pets, five new customers; cosmetic only), light/dark theme, chiptune SFX, reduced motion.
- **Platforms:** PWA on GitHub Pages (offline), Android APK on every push, cloud save through Supabase (needs a project; see below), export/import by code or JSON.

See `docs/PLAN.md` for the architecture and `REVIEW.md` for open chemistry questions.

## Run it locally

```
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest): SRS, saves, coin ledger, name checker, sprites
npm run e2e        # browser tests (Playwright, desktop + phone): shift, every order type, exam, rush, shop, offline, two-device cloud sync
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

The validator also checks every start/target/alternative name against its structure with OPSIN (`py2opsin`, needs Java), re-runs every "Spot the flaw" route and every "What did I start with?" distractor through the engine, and checks each quiz has enough distinct wrong answers.

After editing question files, regenerate the derived content in this order:

```
python scripts/validate_content.py --fill   # fill target structures/highlights
python scripts/gen_synthesis.py             # rebuild content/questions/SYN.json (multi-step orders)
python scripts/validate_content.py --fill   # fill the new synthesis targets
python scripts/gen_quiz.py                  # quiz distractors, wrong starting materials, flawed routes, order types
python scripts/validate_content.py --strict
```

CI (`.github/workflows/validate.yml`) runs the validator (`--strict`), the engine parity check, typecheck, unit tests, the build and the Playwright browser tests on every push.

## Deploy to GitHub Pages

`.github/workflows/pages.yml` builds with `BASE_PATH=/<repo>/` and deploys `dist/` on every push to the default branch (or on demand from any branch via Actions → "Run workflow").

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site then lives at `https://<user>.github.io/<repo>/` over HTTPS, which iOS needs for the PWA.

## Install on iPhone

1. Open the GitHub Pages URL in Safari.
2. Share → **Add to Home Screen**.
3. Launch it from the home screen: it runs full-screen and keeps working offline after the first load (the service worker caches the app, the content and the RDKit runtime).

## Android APK

`.github/workflows/android.yml` builds a debug APK with Capacitor on every push and uploads it as an artifact. On the default branch it also publishes it to the `android-latest` release, so the newest build is always at:

https://github.com/AviCagan/LetThemCook/releases/download/android-latest/beaker-buddies.apk

To install on a phone (no Android Studio needed):

1. Open that link on the phone and download `beaker-buddies.apk`.
2. Open the download. Android asks to allow installs from your browser: allow it once.
3. Tap Install. Later builds install over this one and keep your progress, because every build is signed with the same debug key (`android/app/beaker-buddies-debug.keystore`, committed on purpose; it is not a Play Store key).

Any run's APK is also under Actions → "Android APK" → the run → Artifacts.

Local build: `npm run build:android` (web build + `cap sync android`), then `cd android && ./gradlew assembleDebug` with Java 21 and the Android SDK.

## Cloud save (Supabase)

Optional sync between phone, laptop and the Android app. The database side is one migration, `supabase/migrations/*_beaker_buddies_cloud_save.sql`: a `bb_saves` table nobody can read directly, and two functions (`bb_get_save`, `bb_put_save`) that work only for a caller who knows the save's secret sync code (stored as a SHA-256 hash, writes are compare-and-swap). Everything is prefixed `bb_`, so it can share a project with other apps.

To switch it on: apply the migration to a Supabase project, then put the project URL and its publishable (anon) key in `src/save/cloud.config.ts` (or the `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` build variables). Both values are public by design. In the game: Settings → Cloud save → "Turn on" on one device, then "Link this device" with the code on the others. Sync runs after each order, when the app comes back to the front, and on "Sync now". Progress merges record by record and coins come from a ledger, so nothing is lost or double-counted.

## Adding chemistry

Everything the engine knows comes from `content/`:

- `reagents.json`: shelf bottles (label, card text, which conditions the bottle asks for: temperature presets, lamp, equivalents, pressure).
- `rules.json`: what each bottle does to a flask, as ordered RDKit reaction SMARTS pipelines with optional conditions, partner reagent, blockers and warnings; plus `noReaction` traps (the mistake tag and the "why" shown when a bottle does nothing).
- `rule_tests.json`: flask + reagent + conditions → expected product. Run by the validator and by `npm run parity` through the browser engine.
- `reactions.json`: the toolkit rows (summary, typical mistake tags, decoy bottles) that the notebook and the scheduler use.
- `questions/<reaction>.json`: orders. Each has a start molecule, the target by name (and stereo label), the intended `route` of bottles, optional `altRoutes`, and `traps` (wrong products with their mistake tag). `target.smiles` and the highlights are filled by the validator from the route, so the answer always matches what the engine does.
- `questions/SYN.json`: multi-step synthesis orders, generated by `python scripts/gen_synthesis.py` from the single-reaction orders (A's product = B's start, E/Z geometry matched, every chain re-run through the engine). Regenerate it after editing other question files.
- Quiz content (`traps` marked `auto`, `reverse.distractors`, `flaws`, `orderTypes`) is generated by `python scripts/gen_quiz.py` from the engine; hand-written traps and name traps are kept.
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
src/flow.ts  the game loop: shift → customer → request → bench or quiz → stereo → result/mentor → day end
src/quiz.ts  quiz builders (options, routes, name choices) and order-type unlocks
src/shop.ts  coin shop catalogue, equip/buy, room skins
src/engine   scoring, stereo labels, name checker
src/mastery  SRS, scheduler, seeds, stats
src/save     IndexedDB store, export/import codes, merge, coin ledger, cloud sync (Supabase RPC)
src/game     Phaser: the top-down lab room (tiles, walking customers, mentor, effects)
src/art      code-defined GBC sprites and tiles -> textures / data URLs
src/ui       Preact overlays: request card, workbench + shelf, notepad, lab book, notebook, settings
tests/       vitest unit tests; tests/e2e Playwright specs
android/     Capacitor Android project
supabase/    cloud-save migration
```
