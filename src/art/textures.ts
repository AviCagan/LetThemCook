// Turns code-defined sprites (palette + char grids) into canvases, Phaser textures and data URLs.
import { SPRITES, type SpriteDef } from './sprites';
import { VARIANTS, variantBase, variantDef } from './variants';

const dataUrlCache = new Map<string, string>();

const variantCache = new Map<string, SpriteDef>();

export function spriteDef(key: string): SpriteDef {
  const def = SPRITES[key];
  if (def) return def;
  let v = variantCache.get(key);
  if (!v) {
    const base = variantBase(key);
    v = base ? variantDef(key, SPRITES[base]) : undefined;
    if (v) variantCache.set(key, v);
  }
  if (!v) throw new Error(`unknown sprite ${key}`);
  return v;
}

export function drawSpriteToCanvas(def: SpriteDef, frame = 0, scale = 1, ctxIn?: CanvasRenderingContext2D, ox = 0, oy = 0): HTMLCanvasElement {
  const canvas = ctxIn ? ctxIn.canvas : document.createElement('canvas');
  if (!ctxIn) {
    canvas.width = def.w * scale;
    canvas.height = def.h * scale;
  }
  const ctx = ctxIn ?? canvas.getContext('2d')!;
  const rows = def.frames[Math.min(frame, def.frames.length - 1)];
  for (let y = 0; y < def.h; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < def.w; x++) {
      const ch = row[x] ?? '.';
      if (ch === '.') continue;
      const color = def.palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
  return canvas;
}

/** Data URL for use in the DOM (img src / CSS background). Cached. */
export function spriteDataUrl(key: string, frame = 0, scale = 3): string {
  const id = `${key}:${frame}:${scale}`;
  const hit = dataUrlCache.get(id);
  if (hit) return hit;
  const url = drawSpriteToCanvas(spriteDef(key), frame, scale).toDataURL();
  dataUrlCache.set(id, url);
  return url;
}

export interface TextureRegistrar {
  textures: {
    exists(key: string): boolean;
    addCanvas(key: string, canvas: HTMLCanvasElement): { add(name: string | number, sourceIndex: number, x: number, y: number, w: number, h: number): unknown } | null;
  };
}

/** Register every sprite as a Phaser texture with one frame per animation frame (frame names "0", "1", ...). */
export function registerAllTextures(scene: TextureRegistrar): void {
  const all: [string, SpriteDef][] = [...Object.entries(SPRITES), ...VARIANTS.map((v) => [v.key, spriteDef(v.key)] as [string, SpriteDef])];
  for (const [key, def] of all) {
    if (scene.textures.exists(key)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = def.w * def.frames.length;
    canvas.height = def.h;
    const ctx = canvas.getContext('2d')!;
    def.frames.forEach((_, i) => drawSpriteToCanvas(def, i, 1, ctx, i * def.w, 0));
    const tex = scene.textures.addCanvas(key, canvas);
    if (!tex) continue;
    def.frames.forEach((_, i) => tex.add(String(i), 0, i * def.w, 0, def.w, def.h));
  }
}

export function frameCount(key: string): number {
  return spriteDef(key).frames.length;
}
