// The Phaser "stage" is the part of the viewport the lab room draws in (top ~42% in portrait,
// left half in landscape). The room is a Game Boy Color-sized 160x144 grid of 16px tiles,
// scaled by an integer zoom so pixels stay crisp.
import Phaser from 'phaser';
import { registerAllTextures } from '../art/textures';

export const TILE = 16;
export const COLS = 10;
export const ROWS = 9;
export const VW = TILE * COLS; // 160
export const VH = TILE * ROWS; // 144
export const HUD_H = 52;

export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
  ox: number;
  oy: number;
}

export function isLandscape(): boolean {
  return window.innerWidth > window.innerHeight * 1.25;
}

export function hudHeight(): number {
  const hud = document.querySelector('.hud') as HTMLElement | null;
  return hud ? Math.round(hud.getBoundingClientRect().height) : HUD_H;
}

/** Share of the screen height the room gets in portrait (the panel below gets the rest; keep in sync with --panel-h). */
export const PORTRAIT_SHARE = 0.46;
/** The point of the room kept in the middle when the room is cropped: the counter, between player and customer. */
const FOCUS_X = VW / 2;
const FOCUS_Y = 84;
/** When cropping, keep at least this much room height visible (back bench row down to the customer). */
const MIN_VISIBLE_H = 96;

export function stageRect(): StageRect {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const land = isLandscape();
  const x = 0;
  const y = hudHeight();
  const w = land ? Math.floor(W * 0.5) : W;
  const h = (land ? H : Math.floor(H * PORTRAIT_SHARE)) - y;
  const fit = Math.max(1, Math.floor(Math.min(w / VW, h / VH)));
  // Small screens (phones): one integer step closer and crop the room's edges around the counter,
  // instead of shrinking everyone to fit the whole room. Large screens show the whole room.
  let zoom = fit;
  if (fit <= 3) {
    const z = fit + 1;
    if (VW * z <= w * 1.35 && h / z >= MIN_VISIBLE_H) zoom = z;
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const ox = VW * zoom <= w ? x + Math.floor((w - VW * zoom) / 2) : x + clamp(Math.round(w / 2 - FOCUS_X * zoom), w - VW * zoom, 0);
  const oy = VH * zoom <= h ? y + Math.floor((h - VH * zoom) / 2) : y + clamp(Math.round(h / 2 - FOCUS_Y * zoom), h - VH * zoom, 0);
  return { x, y, w, h, zoom, ox, oy };
}

export class StageScene extends Phaser.Scene {
  r: StageRect = stageRect();
  protected disposers: (() => void)[] = [];

  init(_data?: unknown): void {
    this.r = stageRect();
  }

  preload(): void {
    registerAllTextures(this);
  }

  /** Virtual (160x144) -> camera coordinates; the camera viewport is the stage rect. */
  vx(x: number): number {
    return this.r.ox - this.r.x + x * this.r.zoom;
  }
  vy(y: number): number {
    return this.r.oy - this.r.y + y * this.r.zoom;
  }
  sprite(key: string, x: number, y: number, frame = 0, originX = 0.5, originY = 1): Phaser.GameObjects.Image {
    const img = this.add.image(this.vx(x), this.vy(y), key, String(frame));
    img.setOrigin(originX, originY).setScale(this.r.zoom);
    return img;
  }
  tile(key: string, col: number, row: number, frame = 0): Phaser.GameObjects.Image {
    return this.sprite(key, col * TILE, row * TILE, frame, 0, 0).setDepth(row * TILE + TILE);
  }
  /** Restart only when the stage geometry really changed (iOS fires resize on every toolbar show/hide). */
  onResize(): void {
    const n = stageRect();
    const o = this.r;
    if (n.zoom !== o.zoom || n.ox !== o.ox || n.oy !== o.oy || n.w !== o.w || n.h !== o.h || n.x !== o.x || n.y !== o.y) this.scene.restart();
  }
  create(): void {
    this.cameras.main.setViewport(this.r.x, this.r.y, this.r.w, this.r.h);
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.disposers.forEach((d) => d());
      this.disposers = [];
    });
  }
}
