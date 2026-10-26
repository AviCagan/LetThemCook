// Shared layout helpers: the "stage" is the part of the viewport the Phaser scenes draw in
// (top ~42% in portrait, left half in landscape); the DOM panel takes the rest.
import Phaser from 'phaser';
import { registerAllTextures } from '../art/textures';

export const VW = 240; // virtual pixel width of the lab
export const VH = 160; // virtual pixel height

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

export function stageRect(): StageRect {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const land = isLandscape();
  const x = 0;
  const y = 0;
  const w = land ? Math.floor(W * 0.5) : W;
  const h = land ? H : Math.floor(H * 0.42);
  const zoom = Math.max(1, Math.floor(Math.min(w / VW, h / VH)));
  const ox = x + Math.floor((w - VW * zoom) / 2);
  const oy = y + Math.floor((h - VH * zoom) / 2);
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

  vx(x: number): number {
    return this.r.ox + x * this.r.zoom;
  }
  vy(y: number): number {
    return this.r.oy + y * this.r.zoom;
  }
  /** Add a sprite at virtual coords with the pixel zoom applied. Origin default bottom-centre. */
  sprite(key: string, x: number, y: number, frame = 0, originX = 0.5, originY = 1): Phaser.GameObjects.Image {
    const img = this.add.image(this.vx(x), this.vy(y), key, String(frame));
    img.setOrigin(originX, originY).setScale(this.r.zoom);
    return img;
  }
  tile(key: string, x: number, y: number, w: number, h: number): Phaser.GameObjects.TileSprite {
    const t = this.add.tileSprite(this.vx(x), this.vy(y), w, h, key, '0');
    t.setOrigin(0, 0).setScale(this.r.zoom);
    return t;
  }
  text(x: number, y: number, str: string, size = 14, color = '#4a3f5c', originX = 0.5): Phaser.GameObjects.Text {
    const t = this.add.text(this.vx(x), this.vy(y), str, {
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      fontSize: `${size}px`,
      color,
      fontStyle: 'bold',
      stroke: '#fff8ef',
      strokeThickness: 3,
    });
    t.setOrigin(originX, 0.5).setResolution(2);
    return t;
  }
  button(x: number, y: number, label: string, onClick: () => void, w = 72, h = 20): Phaser.GameObjects.Container {
    const z = this.r.zoom;
    const g = this.add.graphics();
    g.fillStyle(0x7fc8a9, 1).fillRoundedRect(-w * z * 0.5, -h * z * 0.5, w * z, h * z, 4 * z);
    g.lineStyle(2, 0x4a3f5c, 1).strokeRoundedRect(-w * z * 0.5, -h * z * 0.5, w * z, h * z, 4 * z);
    const t = this.add.text(0, 0, label, { fontFamily: 'system-ui, sans-serif', fontSize: `${Math.max(13, 7 * z)}px`, color: '#2e2740', fontStyle: 'bold' }).setOrigin(0.5).setResolution(2);
    const c = this.add.container(this.vx(x), this.vy(y), [g, t]);
    c.setSize(w * z, h * z).setInteractive({ useHandCursor: true });
    c.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      onClick();
    });
    return c;
  }
  /** Dim the lab behind a minigame. */
  dimBackdrop(): Phaser.GameObjects.Rectangle {
    return this.add.rectangle(this.r.x, this.r.y, this.r.w, this.r.h, 0xf6e7d8, 0.82).setOrigin(0, 0);
  }
  onResize(): void {
    this.scene.restart();
  }
  create(): void {
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.disposers.forEach((d) => d());
      this.disposers = [];
    });
  }
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Precision from a value's distance to a band [lo, hi]: 1 at the centre, ~0.7 at the edges, falling to 0 outside. */
export function bandPrecision(value: number, lo: number, hi: number): number {
  const c = (lo + hi) / 2;
  const half = Math.max(1e-6, (hi - lo) / 2);
  const d = Math.abs(value - c) / half;
  if (d <= 1) return 1 - 0.3 * d;
  return clamp01(0.7 - (d - 1) * 0.5);
}
