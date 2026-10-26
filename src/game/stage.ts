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

export function stageRect(): StageRect {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const land = isLandscape();
  const x = 0;
  const y = hudHeight();
  const w = land ? Math.floor(W * 0.5) : W;
  const h = (land ? H : Math.floor(H * 0.42)) - y;
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
  onResize(): void {
    this.scene.restart();
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
