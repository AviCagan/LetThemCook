import Phaser from 'phaser';
import { StageScene, VW, VH, bandPrecision, clamp01 } from '../stage';
import { flow, type MinigameRequest, type MinigameResult } from '../../flow';
import { sfx } from '../../audio/sfx';
import { frameCount } from '../../art/textures';
import type { TempPreset } from '../../content/types';

abstract class MinigameScene extends StageScene {
  req!: MinigameRequest;
  protected finished = false;

  init(data: MinigameRequest): void {
    super.init();
    this.req = data;
    this.finished = false;
  }

  create(): void {
    super.create();
    this.dimBackdrop();
    this.text(VW / 2, 9, this.title(), 14);
  }

  abstract title(): string;

  protected finish(result: MinigameResult, verdict: string): void {
    if (this.finished) return;
    this.finished = true;
    this.input.enabled = false;
    const t = this.text(VW / 2, VH / 2, verdict, 20, result.precision >= 0.7 ? '#2f8f5b' : '#b04a5a');
    this.tweens.add({ targets: t, scale: 1.2, duration: 200, yoyo: true });
    this.time.delayedCall(650, () => {
      this.scene.stop();
      flow.completeMinigame(result);
    });
  }

  protected verdictFor(p: number): string {
    return p >= 0.9 ? 'Perfect!' : p >= 0.7 ? 'Nice!' : p >= 0.4 ? 'Close…' : 'Oops!';
  }
}

/* ---------------- Pour / pressure ---------------- */

export class PourScene extends MinigameScene {
  private level = 0;
  private pouring = false;
  private liquid?: Phaser.GameObjects.Image;
  private bottle?: Phaser.GameObjects.Image;
  private marker?: Phaser.GameObjects.Rectangle;
  private bands: { lo: number; hi: number; equiv?: number; required: boolean }[] = [];
  private dropTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super('pour');
  }
  title(): string {
    return this.req.kind === 'pressure' ? `Pump H₂ over the catalyst` : `Pour ${this.req.label}`;
  }

  create(): void {
    super.create();
    const z = this.r.zoom;
    const isPump = this.req.kind === 'pressure';
    // bands
    if (this.req.equivOptions && this.req.equivOptions.length > 1) {
      const n = this.req.equivOptions.length;
      this.bands = this.req.equivOptions.map((eq, i) => {
        const c = 0.3 + (0.55 * i) / (n - 1);
        return { lo: c - 0.07, hi: c + 0.07, equiv: eq, required: this.req.target?.equiv === undefined ? true : this.req.target.equiv === eq };
      });
    } else {
      this.bands = [{ lo: 0.52, hi: 0.7, required: true }];
    }
    // flask + liquid
    this.sprite(isPump ? 'hotplate' : 'flask_big', VW / 2 - 16, VH - 8, 0);
    if (isPump) this.sprite('flask_big', VW / 2 - 16, VH - 12);
    this.liquid = this.sprite('flask_liquid', VW / 2 - 16, isPump ? VH - 12 : VH - 8, 0).setTint(isPump ? 0xd7d7ff : 0xa8dcff).setVisible(false);
    this.bottle = this.sprite(isPump ? 'beaker' : 'bottle_tall', VW / 2 - 52, 54, 0, 0.5, 1).setAngle(0);
    // gauge
    const gx = VW / 2 + 34;
    const gy0 = 26;
    const gh = VH - 44;
    const g = this.add.graphics();
    g.fillStyle(0xfff8ef, 1).fillRect(this.vx(gx), this.vy(gy0), 14 * z, gh * z);
    g.lineStyle(2, 0x4a3f5c).strokeRect(this.vx(gx), this.vy(gy0), 14 * z, gh * z);
    for (const b of this.bands) {
      const y1 = gy0 + gh * (1 - b.hi);
      const y2 = gy0 + gh * (1 - b.lo);
      g.fillStyle(b.required ? 0x7fe0a8 : 0xd9d2cc, 1).fillRect(this.vx(gx) + 2 * z, this.vy(y1), 10 * z, (y2 - y1) * z);
      if (b.equiv !== undefined) this.text(gx + 24, (y1 + y2) / 2, `${b.equiv} eq`, 12, '#4a3f5c', 0);
    }
    this.marker = this.add.rectangle(this.vx(gx) - 2 * z, this.vy(gy0 + gh), 18 * z, 2 * z, 0xb04a5a).setOrigin(0, 0.5);
    this.text(gx + 7, gy0 - 7, isPump ? 'pressure' : 'fill', 11);
    this.text(VW / 2 - 24, VH - 4, isPump ? 'hold to pump · release in the green band' : 'hold to pour · release in the green band', 11);

    this.input.on('pointerdown', () => {
      if (this.finished) return;
      this.pouring = true;
      this.bottle?.setAngle(-35);
      sfx.pour();
      this.dropTimer = this.time.addEvent({ delay: 120, loop: true, callback: () => this.drop() });
    });
    const stop = () => {
      if (!this.pouring || this.finished) return;
      this.pouring = false;
      this.bottle?.setAngle(0);
      this.dropTimer?.remove();
      this.evaluate();
    };
    this.input.on('pointerup', stop);
    this.input.on('pointerupoutside', stop);
  }

  private drop(): void {
    const d = this.sprite('drop', VW / 2 - 36 + Math.random() * 8, 60, 0, 0.5, 0.5);
    this.tweens.add({ targets: d, y: this.vy(VH - 30), duration: 220, onComplete: () => d.destroy() });
  }

  update(_t: number, dt: number): void {
    if (this.pouring && !this.finished) {
      this.level = Math.min(1.05, this.level + (dt / 1000) * 0.32);
      const frames = frameCount('flask_liquid');
      const f = Math.min(frames - 1, Math.floor(this.level * frames));
      this.liquid?.setVisible(this.level > 0.02).setFrame(String(f));
      if (this.marker) this.marker.y = this.vy(26 + (VH - 44) * (1 - Math.min(1, this.level)));
      if (this.level >= 1.05) {
        this.pouring = false;
        this.dropTimer?.remove();
        sfx.fizzle();
        this.finish({ precision: 0.1, conditions: this.conditionsFor(undefined) }, 'Overflow!');
      }
    }
  }

  private evaluate(): void {
    // nearest band (choose mode) or the required band (predict mode)
    let best = this.bands[0];
    let bestP = -1;
    for (const b of this.bands) {
      if (!this.req.choose && !b.required) continue;
      const p = bandPrecision(this.level, b.lo, b.hi);
      if (p > bestP) {
        bestP = p;
        best = b;
      }
    }
    const inBand = this.level >= best.lo && this.level <= best.hi;
    this.finish({ precision: bestP, conditions: this.conditionsFor(inBand ? best.equiv : best.equiv) }, this.verdictFor(bestP));
  }

  private conditionsFor(equiv: number | undefined) {
    const c: Record<string, unknown> = {};
    if (this.req.kind === 'pressure') c.pressure = true;
    if (equiv !== undefined) c.equiv = equiv;
    return c as { pressure?: boolean; equiv?: number };
  }
}

/* ---------------- Temperature ---------------- */

const PRESET_BANDS: Record<TempPreset, { lo: number; hi: number; label: string }> = {
  ice: { lo: 0, hi: 5, label: 'ice 0–5°' },
  rt: { lo: 18, hi: 30, label: 'rt' },
  reflux: { lo: 75, hi: 115, label: 'heat' },
  c140: { lo: 130, hi: 150, label: '140°' },
  c180: { lo: 170, hi: 190, label: '180°' },
};
const T_MIN = -10;
const T_MAX = 200;

export class TemperatureScene extends MinigameScene {
  private temp = 24;
  private needle?: Phaser.GameObjects.Rectangle;
  private readout?: Phaser.GameObjects.Text;
  private mercury?: Phaser.GameObjects.Rectangle;
  private hot?: Phaser.GameObjects.Image;
  private ice?: Phaser.GameObjects.Image;
  private presets: TempPreset[] = [];
  private dragging = false;
  private dragStartX = 0;
  private dragStartT = 0;

  constructor() {
    super('temperature');
  }
  title(): string {
    return `Set the temperature for ${this.req.label}`;
  }

  create(): void {
    super.create();
    const z = this.r.zoom;
    this.presets = (this.req.tempPresets as TempPreset[] | undefined) ?? ['ice', 'rt', 'reflux', 'c140', 'c180'];
    const target = this.req.target?.temp;
    // scale bar
    const bx = 16;
    const bw = VW - 32;
    const by = 30;
    const g = this.add.graphics();
    g.fillStyle(0xfff8ef, 1).fillRect(this.vx(bx), this.vy(by), bw * z, 12 * z);
    g.lineStyle(2, 0x4a3f5c).strokeRect(this.vx(bx), this.vy(by), bw * z, 12 * z);
    this.presets.forEach((p, i) => {
      const b = PRESET_BANDS[p];
      const x1 = bx + (bw * (b.lo - T_MIN)) / (T_MAX - T_MIN);
      const x2 = bx + (bw * (b.hi - T_MIN)) / (T_MAX - T_MIN);
      const required = this.req.choose || target === p;
      g.fillStyle(required ? 0x7fe0a8 : 0xd9d2cc, 1).fillRect(this.vx(x1), this.vy(by) + 2 * z, Math.max(2 * z, (x2 - x1) * z), 8 * z);
      this.text((x1 + x2) / 2, by + 18 + (i % 2) * 9, b.label, 10, required ? '#2f8f5b' : '#7a6f8a');
    });
    this.needle = this.add.rectangle(this.vx(bx), this.vy(by - 2), 2 * z, 16 * z, 0xb04a5a).setOrigin(0.5, 0);
    this.readout = this.text(VW / 2, by + 34, '', 16);
    // bench props
    this.ice = this.sprite('ice_bath', 30, VH - 6);
    this.hot = this.sprite('hotplate', 100, VH - 6, 0);
    this.sprite('flask_big', 100, VH - 10);
    this.sprite('flask_liquid', 100, VH - 10, 2).setTint(0xa8dcff);
    this.sprite('thermometer', 130, VH - 6, 0, 0.5, 1);
    this.mercury = this.add.rectangle(this.vx(130), this.vy(VH - 10), 2 * z, 0, 0xb04a5a).setOrigin(0.5, 1);
    this.sprite('dial', 64, VH - 24, 0, 0.5, 0.5);
    this.text(VW / 2 - 20, VH - 4, 'drag left/right to turn the dial', 11);
    this.button(VW - 26, VH - 22, 'Set', () => this.evaluate(), 40, 18);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.dragStartX = p.x;
      this.dragStartT = this.temp;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || this.finished) return;
      const dT = ((p.x - this.dragStartX) / (bw * z)) * (T_MAX - T_MIN);
      this.temp = Math.max(T_MIN, Math.min(T_MAX, this.dragStartT + dT));
      this.render();
    });
    const up = () => (this.dragging = false);
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    this.render();
  }

  private render(): void {
    const z = this.r.zoom;
    const bx = 16;
    const bw = VW - 32;
    const x = bx + (bw * (this.temp - T_MIN)) / (T_MAX - T_MIN);
    this.needle?.setX(this.vx(x));
    this.readout?.setText(`${Math.round(this.temp)} °C`);
    this.mercury?.setSize(2 * z, Math.max(0, ((this.temp - T_MIN) / (T_MAX - T_MIN)) * 26 * z));
    this.hot?.setFrame(this.temp > 60 ? '1' : '0');
    this.ice?.setAlpha(this.temp < 12 ? 1 : 0.35);
    if (this.temp > 60 && Math.random() < 0.05) sfx.bubble();
  }

  private evaluate(): void {
    let best: TempPreset = this.presets[0];
    let bestP = -1;
    for (const p of this.presets) {
      if (!this.req.choose && this.req.target?.temp && p !== this.req.target.temp) continue;
      const b = PRESET_BANDS[p];
      const prec = bandPrecision(this.temp, b.lo, b.hi);
      if (prec > bestP) {
        bestP = prec;
        best = p;
      }
    }
    this.finish({ precision: bestP, conditions: { temp: best } }, this.verdictFor(bestP));
  }
}

/* ---------------- Workup ---------------- */

export class WorkupScene extends MinigameScene {
  private meter = 0;
  private fill?: Phaser.GameObjects.Rectangle;
  private liquid?: Phaser.GameObjects.Image;
  constructor() {
    super('workup');
  }
  title(): string {
    return `Quench with ${this.req.label}`;
  }
  create(): void {
    super.create();
    const z = this.r.zoom;
    const gh = VH - 44;
    this.sprite('flask_big', VW / 2 - 16, VH - 8);
    this.liquid = this.sprite('flask_liquid', VW / 2 - 16, VH - 8, 2).setTint(0xffd6a5);
    this.sprite('bottle_round', VW / 2 - 52, 58);
    const gx = VW / 2 + 34;
    const g = this.add.graphics();
    g.fillStyle(0xfff8ef, 1).fillRect(this.vx(gx), this.vy(26), 14 * z, gh * z);
    g.lineStyle(2, 0x4a3f5c).strokeRect(this.vx(gx), this.vy(26), 14 * z, gh * z);
    g.fillStyle(0x7fe0a8, 1).fillRect(this.vx(gx) + 2 * z, this.vy(26 + gh * (1 - 0.85)), 10 * z, gh * 0.25 * z);
    this.fill = this.add.rectangle(this.vx(gx) + 2 * z, this.vy(26 + gh), 10 * z, 0, 0x7fb2e0).setOrigin(0, 1).setAlpha(0.7);
    this.text(gx + 7, 19, 'quench', 11);
    this.text(VW / 2 - 30, VH - 4, 'tap to add drops · stop in the green band', 11);
    this.button(VW - 32, VH - 24, 'Done', () => this.evaluate(), 48, 18);
    this.input.on('pointerdown', () => {
      if (this.finished) return;
      this.meter = Math.min(1.1, this.meter + 0.11);
      sfx.bubble();
      const d = this.sprite('drop', VW / 2 - 32 + Math.random() * 10, 64, 0, 0.5, 0.5);
      this.tweens.add({ targets: d, y: this.vy(VH - 30), duration: 200, onComplete: () => d.destroy() });
      const b = this.sprite('bubble', VW / 2 - 24 + Math.random() * 16, VH - 24, Math.random() < 0.5 ? 0 : 1, 0.5, 0.5);
      this.tweens.add({ targets: b, y: this.vy(VH - 44), alpha: 0, duration: 500, onComplete: () => b.destroy() });
      this.fill?.setSize(10 * z, Math.min(1, this.meter) * gh * z);
      this.liquid?.setTint(this.meter > 0.6 ? 0xb5f0c8 : 0xffd6a5);
      if (this.meter > 1.0) {
        sfx.fizzle();
        this.finish({ precision: 0.15 }, 'Too much!');
      }
    });
  }
  private evaluate(): void {
    const p = bandPrecision(this.meter, 0.6, 0.85);
    this.finish({ precision: p }, this.verdictFor(p));
  }
}

/* ---------------- Stir ---------------- */

export class StirScene extends MinigameScene {
  private revs = 0;
  private lastAngle: number | null = null;
  private bar?: Phaser.GameObjects.Rectangle;
  private rod?: Phaser.GameObjects.Rectangle;
  private cx = 0;
  private cy = 0;
  constructor() {
    super('stir');
  }
  title(): string {
    return `Stir in ${this.req.label}`;
  }
  create(): void {
    super.create();
    const z = this.r.zoom;
    this.cx = this.vx(VW / 2);
    this.cy = this.vy(VH - 24);
    this.sprite('beaker', VW / 2, VH - 8, 2);
    this.rod = this.add.rectangle(this.cx, this.cy, 2 * z, 30 * z, 0x4a3f5c).setOrigin(0.5, 1);
    const g = this.add.graphics();
    g.fillStyle(0xfff8ef, 1).fillRect(this.vx(24), this.vy(26), (VW - 48) * z, 10 * z);
    g.lineStyle(2, 0x4a3f5c).strokeRect(this.vx(24), this.vy(26), (VW - 48) * z, 10 * z);
    this.bar = this.add.rectangle(this.vx(24) + 2 * z, this.vy(31), 0, 6 * z, 0x7fe0a8).setOrigin(0, 0.5);
    this.text(VW / 2, VH - 4, 'swipe in circles around the beaker', 11);
    this.button(VW - 32, 52, 'Done', () => this.evaluate(), 48, 18);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.finished) return;
      const a = Math.atan2(p.worldY - this.cy, p.worldX - this.cx);
      if (this.lastAngle !== null) {
        let d = a - this.lastAngle;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        this.revs += Math.abs(d) / (2 * Math.PI);
        this.rod?.setRotation(a + Math.PI / 2);
        const w = Math.min(1, this.revs / 3) * (VW - 52) * z;
        this.bar?.setSize(w, 6 * z);
        if (Math.random() < 0.08) sfx.bubble();
        if (this.revs >= 3) this.evaluate();
      }
      this.lastAngle = a;
    });
    this.input.on('pointerup', () => (this.lastAngle = null));
  }
  private evaluate(): void {
    const p = clamp01(this.revs / 3);
    this.finish({ precision: Math.max(0.2, p) }, this.verdictFor(p));
  }
}

/* ---------------- Light / peroxide toggle ---------------- */

export class LightScene extends MinigameScene {
  private on = false;
  private lamp?: Phaser.GameObjects.Arc;
  private label?: Phaser.GameObjects.Text;
  constructor() {
    super('light');
  }
  title(): string {
    return `Lamp for ${this.req.label}?`;
  }
  create(): void {
    super.create();
    const z = this.r.zoom;
    this.sprite('flask_big', VW / 2 + 40, VH - 8);
    this.sprite('flask_liquid', VW / 2 + 40, VH - 8, 2).setTint(0xa8dcff);
    this.lamp = this.add.circle(this.vx(VW / 2 - 30), this.vy(56), 14 * z, 0xd9d2cc).setStrokeStyle(2, 0x4a3f5c).setInteractive({ useHandCursor: true });
    this.label = this.text(VW / 2 - 30, 82, 'lamp OFF', 13);
    this.lamp.on('pointerdown', () => {
      this.on = !this.on;
      sfx.click();
      this.lamp?.setFillStyle(this.on ? 0xffe066 : 0xd9d2cc);
      this.label?.setText(this.on ? 'lamp ON (hν / peroxide)' : 'lamp OFF');
    });
    this.text(VW / 2, VH - 4, this.req.choose ? 'does this step need light?' : `this step needs the lamp ${this.req.target?.light ? 'ON' : 'OFF'}`, 11);
    this.button(VW - 32, VH - 24, 'Done', () => {
      const want = this.req.target?.light;
      const p = this.req.choose || want === undefined ? 1 : want === this.on ? 1 : 0.3;
      this.finish({ precision: p, conditions: { light: this.on } }, this.verdictFor(p));
    }, 48, 18);
  }
}
