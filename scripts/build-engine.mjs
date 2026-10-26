// Bundles src/chem/engine.ts (plus its JSON imports) to CommonJS for the Node parity script.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [join(root, 'src/chem/engine.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: join(root, 'scripts/.engine/engine.cjs'),
  logLevel: 'error',
});
console.log('engine bundled for Node');
