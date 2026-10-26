// Lazy RDKit.js loader and molecule renderer. The runtime (RDKit_minimal.js + .wasm) is served from
// public/rdkit (copied from node_modules by scripts/copy-rdkit.mjs) and precached by the service worker.

export interface RDKitMol {
  get_svg_with_highlights(details: string): string;
  get_svg(w: number, h: number): string;
  is_valid(): boolean;
  delete(): void;
}
export interface RDKitModule {
  version(): string;
  get_mol(smiles: string, details?: string): RDKitMol | null;
  prefer_coordgen?(v: boolean): void;
}

declare global {
  interface Window {
    initRDKitModule?: (opts?: { locateFile?: (f: string) => string }) => Promise<RDKitModule>;
  }
}

let modulePromise: Promise<RDKitModule> | null = null;
let loaded: RDKitModule | null = null;

export function rdkitBase(): string {
  return `${import.meta.env.BASE_URL}rdkit/`;
}

export function loadRDKit(): Promise<RDKitModule> {
  if (modulePromise) return modulePromise;
  modulePromise = new Promise<RDKitModule>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${rdkitBase()}RDKit_minimal.js`;
    script.async = true;
    script.onload = () => {
      if (!window.initRDKitModule) {
        reject(new Error('RDKit runtime did not expose initRDKitModule'));
        return;
      }
      window
        .initRDKitModule({ locateFile: (f) => `${rdkitBase()}${f}` })
        .then((m) => {
          loaded = m;
          resolve(m);
        }, reject);
    };
    script.onerror = () => reject(new Error('Could not load the RDKit runtime'));
    document.head.appendChild(script);
  });
  return modulePromise;
}

export function rdkitLoaded(): boolean {
  return loaded !== null;
}

export interface DrawOptions {
  width?: number;
  height?: number;
  highlight?: number[];
  /** r, g, b, a in 0..1 */
  highlightColor?: [number, number, number, number];
}

const cache = new Map<string, string>();

/** Draw a molecule as an SVG string (responsive: width 100%, viewBox kept). */
export async function drawMolecule(smiles: string, opts: DrawOptions = {}): Promise<string> {
  const width = opts.width ?? 320;
  const height = opts.height ?? 220;
  const key = `${smiles}|${width}x${height}|${(opts.highlight ?? []).join(',')}|${(opts.highlightColor ?? []).join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const RDKit = await loadRDKit();
  const mol = RDKit.get_mol(smiles);
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><text x="10" y="30" font-size="14">bad SMILES</text></svg>`;
  }
  const details: Record<string, unknown> = {
    width,
    height,
    bondLineWidth: 2.4,
    scaleBondWidth: false,
    minFontSize: 13,
    maxFontSize: 22,
    fixedBondLength: 34,
    padding: 0.08,
    clearBackground: false,
    addStereoAnnotation: false,
    explicitMethyl: false,
    comicMode: false,
  };
  if (opts.highlight && opts.highlight.length) {
    details.atoms = opts.highlight;
    details.highlightColour = opts.highlightColor ?? [1.0, 0.45, 0.45, 0.3];
    details.highlightRadius = 0.45;
    details.fillHighlights = true;
  }
  let svg = mol.get_svg_with_highlights(JSON.stringify(details));
  mol.delete();
  svg = svg
    .replace(/width='[0-9.]+px'/, "width='100%'")
    .replace(/height='[0-9.]+px'/, "height='100%'")
    .replace(/<rect style='opacity:1.0;fill:#FFFFFF[^>]*>/, '');
  if (!/preserveAspectRatio/.test(svg)) svg = svg.replace('<svg ', "<svg preserveAspectRatio='xMidYMid meet' ");
  cache.set(key, svg);
  return svg;
}

export function warmCache(smilesList: string[]): void {
  for (const s of smilesList) drawMolecule(s).catch(() => undefined);
}
