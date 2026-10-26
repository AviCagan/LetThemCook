# Beaker Buddies: architecture plan (Phase 0)

Pre-med Orgo II study game: cooking-minigame feel, chemistry-lab setting, mastery tracking per reaction and per reagent. This document is the "plan first" deliverable. Nothing in Phases 1–4 starts until you OK it.

## 1. Stack

Kept as suggested, with three changes (reasons given):

| Piece | Choice | Why |
| --- | --- | --- |
| Build | Vite + TypeScript | as suggested |
| Scenes / minigames | Phaser 3, `pixelArt: true`, `roundPixels: true` | as suggested |
| Text-heavy panels | **Preact** (3 kB) + signals, mounted as DOM overlays | *Change.* The Lab Notebook grids, order cards, stereo picker and settings are tables and forms. Doing them in Phaser is slow to build and bad for accessibility; raw DOM at this size turns into string-concatenation soup. Preact keeps them declarative and still tiny. |
| Molecules | `@rdkit/rdkit` (RDKit.js), wasm bundled locally, lazy-loaded, precached by the service worker | as suggested. The wasm is several MB, so Boot shows a "warming up the fume hood" loader on first run; after that the SW serves it offline. |
| PWA | `vite-plugin-pwa` (manifest, Workbox SW, precache of wasm + content JSON) | as suggested |
| Android | Capacitor 6, debug APK built in GitHub Actions | as suggested |
| Saves | IndexedDB via `idb-keyval`, with export/import | as suggested; `idb-keyval` is 600 bytes and avoids hand-rolled IndexedDB code |
| Audio | WebAudio chiptune synth (no sample files) | as suggested |
| Pixel art | **Code-defined sprites**: palette + string grids compiled to textures at boot | *Change from "either".* No binary assets in git, every sprite is diffable and editable, licensing is trivially clean. |
| Tests | Vitest for engine/SRS/name-checker; Playwright smoke tests in Phase 3 | *Addition.* The SRS and grader are pure functions and must be unit-tested. |
| Content validation | Python RDKit (`scripts/validate_content.py`) in CI | as suggested. Already written and running against the samples. |

Text in DOM overlays uses a readable system font at ≥ 16 px. Only short in-scene labels use the code-drawn pixel font.

## 2. Architecture

```
content/                      chemistry data only; no code ever lives here
  schema/*.schema.json        JSON Schema (draft-07) for every file below
  reagents.json               shelf bottles (+ decoys, workups)
  reactions.json              toolkit rows R1–R28, P1–P10, E1–E13
  mistake_tags.json           tags + the general rule the mentor restates
  questions/<reaction>.json   items (≥ 6 per reaction)
scripts/validate_content.py   CI gate (RDKit)
src/
  chem/     rdkit loader (lazy), draw(smiles, {highlight}) -> SVG, name normaliser/checker
  content/  typed loaders, question bank index, chapter toggle
  engine/   order builder, route grader, product grader, auto-tagger, scoring
  mastery/  SRS state machine, scheduler/queue, mistake-tag stats, seeds
  save/     IndexedDB store, export/import, migrations, (later) sync adapter
  game/     Phaser scenes: Boot, Lab, Shelf, minigames (Pour, Temperature, Stir, Light, Workup, Pressure), Result
  art/      palette + sprite grids -> textures; customers, bottles, bench, window
  ui/       Preact overlays: OrderCard, MoleculeCard, ProductPicker, StereoPicker, Mentor, Notebook, Settings, Modes
  audio/    chiptune SFX, mute, reduced-motion flag
android/    Capacitor project (Phase 3)
.github/workflows/ validate.yml, pages.yml, android.yml
```

Data flow for one order:

```
scheduler.next()  ->  item + orderType  ->  OrderCard (RDKit SVG)
   -> Shelf (drag bottles into step slots)        [make_it, spot_flaw]
   -> minigames per step (technique score 0..1)   [skipped in Exam mode]
   -> ProductPicker (answer + 3 sampled distractors) + StereoPicker
   -> grader: chemistry {correct, tags[]}, technique, speed  -> stars
   -> mentor (on miss): route, product with translucent highlight, tag-specific why + rule
   -> mastery.log(item, reaction(s), reagents used, tags, hinted) -> save
```

Everything under `src/engine` and `src/mastery` is pure TypeScript with no Phaser or DOM imports, so it is unit-testable and reusable when chapters 18–25 are added as data.

## 3. Data model

Formal definitions: `content/schema/*.schema.json`. Five validated examples: `content/questions/samples.json`.

**Reagent** = one bottle. Conditions are not bottles: temperature, light, equivalents and pressure are set in minigames and graded as part of the route. Reagents that contribute atoms (CH₃I, ethylene oxide, an alcohol partner) carry a `smiles` so the validator can run multi-reactant templates.

**Reaction** = one toolkit row: canonical `steps` (ordered; each step is a set of bottles + conditions), `altRoutes` (H₂O vs H₃O⁺), `rules`, `stereoOutcome`, optional `smarts` templates for the validator (`single` or `exhaustive` application), `decoys`, `typicalTags`.

**Question item** = one chemistry fact that can be served as several order types. Sections enable types:

| Section | Enables |
| --- | --- |
| `start` + `route` + `answer` + `productDistractors` (≥ 3, tagged) | make_it, predict_product |
| + `startDistractors` (≥ 3, tagged) | find_start |
| + `answer.names` (accepted list + tagged traps) | name_it |
| `flaw` (two routes, choices, answer) | spot_flaw |
| `route` with ≥ 2 steps + `reactionIds` | multistep (special orders) |

`routeDistractors` are flawed routes the grader matches a wrong shelf pick against to choose a tag. `missing_workup`, `wrong_reagent_order`, `wrong_temperature` and `missing_stereo` are detected automatically and need no entries.

Stereo: `answer.stereo` is one of `none | single_enantiomer | racemic | meso | cis | trans | syn | anti`. The SMILES is drawn as one stereoisomer; the label says what the flask really contains. The validator enforces "label ⇔ stereo marks in the SMILES".

## 4. Engine rules

**Route grading (make_it).** Player route vs. item route and all alt routes. Steps compared in order; bottles within a step as a set; conditions compared only where the item specifies them. Mismatch classification, in order: (1) exact match to a `routeDistractor` → its tag; (2) same bottles, a required workup bottle missing → `missing_workup`; (3) same bottles, different order → `wrong_reagent_order`; (4) same bottles, wrong condition → `wrong_temperature`; (5) otherwise the closest routeDistractor by edit distance, else `reagent_label_unknown`.

**Product grading.** Pick among 4 RDKit-drawn options (answer + 3 distractors sampled from the item's list, order shuffled). Wrong pick → that distractor's tag. If `answer.stereo != none`, the stereo picker follows; wrong label → `missing_stereo` (picked "none") or `meso_vs_racemic`. Major product only; minor only when the item has `answer.minor`.

**Light / peroxide toggle and the HBr trap.** A step whose conditions say `light: false` with the toggle on is a chemistry mistake (`wrong_temperature` family, labelled "wrong conditions"), not just a technique slip.

**Scoring.** Chemistry 0.7 × (1 first try, 0.5 after hint/retry, 0), technique 0.2 × mean minigame precision, speed 0.1 × time factor. Stars: ≥ 0.85 → 3, ≥ 0.60 → 2, ≥ 0.35 → 1, else 0. A hint costs the chemistry half and is logged. Exam mode: chemistry only.

**Name checker.** Normalise: lowercase, strip spaces, unify hyphens/en-dashes, strip commas' spaces, map Unicode subscripts, treat `tert-`/`t-`, `sec-` as equal. Exact match against `accepted`. Otherwise: match a `trap` → its tag; else generic detectors: digits removed equals an accepted name → `naming_locant`; same substituent tokens in a different order → `naming_alpha_order`; `-al`/`-one` swap → `aldehyde_ketone_mixup`; ends in `oxide` → `naming_alkoxide`.

**Translucent highlight.** `answer.highlightAtoms` (atom indices in SMILES order) rendered via RDKit's highlight with alpha 0.3; falls back to no highlight when absent.

## 5. Mastery and spaced repetition

Tracked per reaction id and per reagent id (every bottle used in a correct route gets a "recognised" tick; a bottle that appears in a flawed pick gets a miss).

| State | Trigger | Next in-session | Next session |
| --- | --- | --- | --- |
| New | never seen | by queue priority | |
| Missed | wrong, or answer revealed | within ~3 orders | next session, again |
| Shaky | right after hint/retry; first correct after a Missed | ~8 orders | 2 days |
| Solid | right first try | not again this session | 4 days, doubling after each further Solid |

Exam cap: `interval = min(interval, max(1, daysToExam / 2))` so every reaction gets at least one more review before the date. Queue: overdue → recent Missed → weakest Shaky (lowest accuracy, most recent miss) → New → Solid maintenance. No item repeats in a session unless it is a scheduled re-test. Seeds from your list are loaded on first run (P1 Missed, E3-with-AlCl₃ Missed, the rest Shaky).

## 6. Save format (sync-ready)

```json
{ "schemaVersion": 1, "deviceId": "uuid", "updatedAt": "ISO",
  "profile": { "examDate": "...", "chapters": {"17": true}, "settings": {...} },
  "mastery": { "reactions": { "R2": {...} }, "reagents": { "NaBH4": {...} } },
  "history": [ { "t": "...", "item": "q-...", "type": "make_it", "ok": true, "tags": [], "stars": 3, "hinted": false } ],
  "economy": { "coins": 0, "unlocked": [] } }
```
Export = gzip (CompressionStream) + base64url string, and the same JSON as a file. Import merges by `updatedAt` per record so a later Supabase sync is a last-write-wins upsert of the same document.

## 7. Platforms and CI

- `validate.yml`: `pip install -r scripts/requirements.txt && python scripts/validate_content.py` on every push and PR; `npm test` for the engine.
- `pages.yml`: build with `base: '/LetThemCook/'`, deploy `dist/` to GitHub Pages (HTTPS for the iOS PWA).
- `android.yml` (Phase 3): `npx cap sync android && ./gradlew assembleDebug`, upload `app-debug.apk` as an artifact.
- Touch-first: ≥ 48 px targets, drag with pointer events, portrait layout first, landscape reflows the shelf beside the bench.

## 8. Phase 1 scope (after your OK)

Core loop with make_it + predict_product; reactions R1–R5, R10, R11, R21–R23, P1, E3 with ≥ 6 items each (~72 items); pour/temperature/workup minigames; scoring; SRS + Lab Notebook; save/export/import; PWA on GitHub Pages; validation in CI.

Open questions for you are in `REVIEW.md`.
