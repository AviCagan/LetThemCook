# Notes for agents working on Beaker Buddies (LetThemCook)

An Orgo II study game (Carey 12e, ch 16–17 + phenols): Vite + TypeScript + Phaser + Preact, RDKit.js
for every molecule, a PWA on GitHub Pages, and a Capacitor Android APK. Start with `README.md`
(commands, deploy, APK), `docs/PLAN.md` (architecture), and `REVIEW.md` (open chemistry questions).

## Chemistry content is data, and it is checked

- Everything the game knows is in `content/`. Never hand-write a target structure: run
  `python scripts/validate_content.py --fill`, which runs each route through the engine.
- After editing question files, regenerate in this order:
  `validate_content.py --fill` → `gen_synthesis.py` → `validate_content.py --fill` →
  `gen_quiz.py` → `validate_content.py --strict`.
- The validator fails on any name that OPSIN parses to a different molecule than the one drawn
  (needs `py2opsin` + Java). `npm run parity` checks the browser engine against the Python one.
- Don't invent chemistry. If unsure, add the question to `REVIEW.md` instead of guessing.

## Cloud save lives in another app's Supabase project

- The backend is the Supabase project **"Things"** (ref `rixslpsozkfytcdeprma`). It belongs to
  **HouseholdLauncher** (https://github.com/AviCagan/HouseholdLauncher), Avi's household app. We
  were given room there because the free plan allows only two projects.
- Beaker Buddies owns **only** `public.bb_saves`, `bb_get_save`, `bb_put_save` and `bb_key_hash`,
  plus migrations named `beaker_buddies_*`. Never read, change or test against the household
  tables, policies or functions. HouseholdLauncher's `CLAUDE.md` tells its agents the same about us.
- The source of truth is `supabase/migrations/20261029000000_beaker_buddies_cloud_save.sql`. It
  holds the combined final state of the two live migrations. To change the backend, edit that
  file, then apply only the difference to "Things" as a new `beaker_buddies_*` migration.
- Test SQL in PGlite first, as the e2e cloud test does. The browser tests use a fake Supabase URL
  and never touch the real project. If you test against the real project, delete your test rows
  afterwards (`delete from public.bb_saves where device_id in (...)`).
- `bb_saves` is capped at 20 saves. The public key is in `src/save/cloud.config.ts` on purpose.
  It can only call the two `bb_` RPCs, so it is not a secret.

## Before you push

`npm run typecheck`, `npm test`, `npm run parity`, `npm run build`, and `npm run e2e` (Playwright,
desktop + phone) all run in CI, along with the content validator and the APK build. Keep all of
them green.
