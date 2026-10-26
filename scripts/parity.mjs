// Runs every rule test and every item route through the JS engine (RDKit.js in Node) and
// compares with the expectations the Python engine produced. Exit 1 on any mismatch.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const initRDKitModule = require(join(root, 'node_modules/@rdkit/rdkit/dist/RDKit_minimal.js'));

// Load the TS engine through a tiny transpile step: the engine file only uses type-only TS features
// plus `import x from '../../content/*.json'`, so strip types with esbuild-free regexes is fragile.
// Instead we re-implement the loader: the engine source is compiled by vite for the app; for Node we
// use the same logic exposed in dist-engine.cjs built by `npm run build:engine`.
const { ReactionEngine } = require(join(root, 'scripts/.engine/engine.cjs'));

const RDKit = await initRDKitModule({ locateFile: (f) => join(root, 'node_modules/@rdkit/rdkit/dist', f) });
const engine = new ReactionEngine(RDKit);
const flat = (s) => engine.canonical(s, false);

let fails = 0;
let n = 0;
const tests = JSON.parse(readFileSync(join(root, 'content/rule_tests.json'), 'utf8'));
for (const c of tests) {
  n++;
  const out = engine.apply(c.reagent, c.conditions, c.flask);
  if (c.noReaction) {
    if (out.changed) { fails++; console.log(`FAIL ${c.id}: expected no reaction, got ${out.product}`); }
    else if (c.trap && (out.traps[0]?.tag ?? null) !== c.trap) { fails++; console.log(`FAIL ${c.id}: trap ${out.traps[0]?.tag} != ${c.trap}`); }
  } else if (flat(out.product) !== flat(c.expect)) {
    fails++; console.log(`FAIL ${c.id}: expected ${flat(c.expect)}, got ${flat(out.product)}`);
  } else if (c.warn && !out.warnings.some((w) => w.tag === c.warn)) { fails++; console.log(`FAIL ${c.id}: missing warning`); }
}
const qdir = join(root, 'content/questions');
for (const f of readdirSync(qdir).filter((x) => x.endsWith('.json'))) {
  for (const q of JSON.parse(readFileSync(join(qdir, f), 'utf8'))) {
    if (!q.start || !q.route || !q.target?.smiles) continue;
    n++;
    let flask = engine.canonical(q.start.smiles);
    for (const s of q.route) flask = engine.apply(s.reagent, s.conditions, flask).product;
    if (!engine.containsTarget(flask, q.target.smiles)) { fails++; console.log(`FAIL item ${q.id}: route gives ${flask}, target ${q.target.smiles}`); }
  }
}
console.log(`${n - fails}/${n} parity checks passed`);
process.exit(fails ? 1 : 0);
