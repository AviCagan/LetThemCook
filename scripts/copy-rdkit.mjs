// Copies the RDKit.js runtime from node_modules into public/rdkit so it is served
// (and precached by the service worker) as a static asset. Runs before dev/build.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@rdkit', 'rdkit', 'dist');
const dst = join(root, 'public', 'rdkit');
mkdirSync(dst, { recursive: true });
for (const f of ['RDKit_minimal.js', 'RDKit_minimal.wasm']) {
  if (!existsSync(join(src, f))) {
    console.error(`missing ${f} in @rdkit/rdkit; run npm install`);
    process.exit(1);
  }
  copyFileSync(join(src, f), join(dst, f));
}
console.log('rdkit runtime copied to public/rdkit');
