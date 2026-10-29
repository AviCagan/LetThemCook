// Top-down lab room (GBC style): customers come in through the door at the bottom and walk up
// to the counter; the player stands behind it; the mentor drops in when a batch fails.
import Phaser from 'phaser';
import { effect } from '@preact/signals';
import { StageScene, TILE, VW, VH, stageRect } from '../stage';
import { flow } from '../../flow';
import { save } from '../../state';
import { frameCount } from '../../art/textures';
import { equipped, skinned } from '../../shop';

type Dir = 'down' | 'up' | 'left' | 'right';
const DIR_BASE: Record<Dir, number> = { down: 0, up: 3, left: 6, right: 9 };

// 10 x 9 tiles. Row 0 wall top; row 1 back wall; row 2 benches; row 3 player aisle; rows 4-5 counter; 6-8 shop floor + door.
const ROOM: string[][] = [
  ['t_wall_top', 't_wall_top', 't_wall_top', 't_wall_top', 't_wall_top', 't_wall_top', 't_wall_top', 't_wall_top', 't_wall_top', 't_wall_top'],
  ['t_wall', 't_window', 't_wall_poster', 't_wall_shelf', 't_fumehood_tl', 't_fumehood_tr', 't_wall_cabinet', 't_wall_shelf', 't_window', 't_wall'],
  ['t_bookshelf', 't_bench_flask', 't_bench_hotplate', 't_bench_icebath', 't_fumehood_bl', 't_fumehood_br', 't_bench_computer', 't_bench_books', 't_bench', 't_plant'],
  ['t_floor_a', 't_floor_b', 't_floor_a', 't_floor_b', 't_floor_a', 't_floor_b', 't_floor_a', 't_floor_b', 't_floor_a', 't_floor_b'],
  ['t_floor_b', 't_counter_l', 't_counter_m', 't_counter_m', 't_counter_m', 't_counter_m', 't_counter_m', 't_counter_m', 't_counter_r', 't_floor_a'],
  ['t_floor_a', 't_counter_front_l', 't_counter_front_m', 't_counter_front_m', 't_counter_front_m', 't_counter_front_m', 't_counter_front_m', 't_counter_front_m', 't_counter_front_r', 't_floor_b'],
  ['t_floor_a', 't_trash', 't_floor_b', 't_rug_tl', 't_rug_edge_top', 't_rug_edge_top', 't_rug_edge_top', 't_floor_a', 't_plant', 't_floor_b'],
  ['t_floor_b', 't_floor_a', 't_floor_b', 't_rug_edge_left', 't_rug', 't_rug', 't_rug', 't_floor_b', 't_floor_a', 't_sink'],
  ['t_floor_dark', 't_floor_dark', 't_floor_dark', 't_floor_dark', 't_floor_dark', 't_door', 't_floor_dark', 't_floor_dark', 't_floor_dark', 't_floor_dark'],
];
const DOOR = { col: 5, row: 8 };
const CUSTOMER_SPOT = { col: 5, row: 6 };
const MENTOR_SPOT = { col: 6, row: 6 };
const PLAYER_SPOT = { col: 5, row: 3 };
const FLASK_SPOT = { x: 3 * TILE + 8, y: 4 * TILE + 6 };

/** Depth = the feet line in room pixels, so whoever stands lower on screen is drawn in front. */
const feetDepth = (row: number) => row * TILE + TILE + 0.5;

class Walker {
  img: Phaser.GameObjects.Image;
  emote?: Phaser.GameObjects.Image;
  private timer?: Phaser.Time.TimerEvent;
  constructor(private scene: StageScene, public key: string, col: number, row: number, public dir: Dir = 'down') {
    this.img = scene.sprite(key, col * TILE + TILE / 2, row * TILE + TILE, DIR_BASE[dir]);
    this.img.setDepth(feetDepth(row));
  }
  face(dir: Dir): void {
    this.dir = dir;
    this.img.setFrame(String(DIR_BASE[dir]));
  }
  place(col: number, row: number): void {
    this.img.setPosition(this.scene.vx(col * TILE + TILE / 2), this.scene.vy(row * TILE + TILE)).setDepth(feetDepth(row));
  }
  walkTo(col: number, row: number, reduced: boolean, onDone?: () => void): void {
    const tx = this.scene.vx(col * TILE + TILE / 2);
    const ty = this.scene.vy(row * TILE + TILE);
    const dy = ty - this.img.y;
    const dx = tx - this.img.x;
    const dir: Dir = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : dx < 0 ? 'left' : 'right';
    this.face(dir);
    if (reduced) {
      this.place(col, row);
      onDone?.();
      return;
    }
    const base = DIR_BASE[dir];
    let step = 1;
    this.timer?.remove();
    this.timer = this.scene.time.addEvent({ delay: 130, loop: true, callback: () => { step = step === 1 ? 2 : 1; this.img.setFrame(String(base + step)); } });
    const dist = Math.abs(dx) + Math.abs(dy);
    this.scene.tweens.add({
      targets: this.img,
      x: tx,
      y: ty,
      duration: Math.max(200, (dist / this.scene.r.zoom) * 14),
      ease: 'Linear',
      onUpdate: () => this.img.setDepth((this.img.y - (this.scene.r.oy - this.scene.r.y)) / this.scene.r.zoom + 0.5),
      onComplete: () => {
        this.timer?.remove();
        this.img.setFrame(String(base));
        this.img.setDepth(feetDepth(row));
        onDone?.();
      },
    });
  }
  showEmote(key: string, reduced: boolean, hold = 1400): void {
    this.emote?.destroy();
    const e = this.scene.sprite(key, 0, 0, 1, 0.5, 1);
    e.setPosition(this.img.x + 6 * this.scene.r.zoom, this.img.y - 20 * this.scene.r.zoom).setDepth(1000);
    this.emote = e;
    if (!reduced) {
      e.setFrame('0');
      this.scene.time.delayedCall(120, () => e.active && e.setFrame('1'));
    }
    if (hold > 0) this.scene.time.delayedCall(hold, () => { if (this.emote === e) { e.destroy(); this.emote = undefined; } });
  }
  hideEmote(): void {
    this.emote?.destroy();
    this.emote = undefined;
  }
  setVisible(v: boolean): void {
    this.img.setVisible(v);
    if (!v) this.hideEmote();
  }
}

export class LabScene extends StageScene {
  private customer?: Walker;
  private mentor?: Walker;
  private player?: Walker;
  private windows: Phaser.GameObjects.Image[] = [];
  private hotplate?: Phaser.GameObjects.Image;
  private computer?: Phaser.GameObjects.Image;
  private door?: Phaser.GameObjects.Image;
  private flask?: Phaser.GameObjects.Image;
  private liquid?: Phaser.GameObjects.Image;
  private lastPhase = '';
  private lastStepCount = 0;
  private hudCheck = 0;
  private lamps: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('lab');
  }

  init(): void {
    super.init();
    // a restart (resize, HUD height change) must not remember the old phase: create() re-syncs with the flow
    this.lastPhase = '';
    this.lastStepCount = 0;
  }

  update(time: number): void {
    if (time - this.hudCheck > 400) {
      this.hudCheck = time;
      const n = stageRect();
      if (n.y !== this.r.y || n.h !== this.r.h || n.zoom !== this.r.zoom) this.onResize();
    }
  }

  create(): void {
    super.create();
    const reduced = () => !!save.value?.profile.settings.reducedMotion;
    this.windows = [];
    const sv = save.value;
    this.lamps = [];
    ROOM.forEach((row, r) => row.forEach((base, c) => {
      const key = sv ? skinned(sv, base) : base;
      const t = this.tile(key, c, r);
      if (key === 't_aquarium' && !reduced()) this.time.addEvent({ delay: 650, loop: true, callback: () => t.setFrame(t.frame.name === '0' ? '1' : '0') });
      if (key === 't_lamp') this.lamps.push(t);
      if (key.startsWith('t_floor') || key.startsWith('t_rug')) t.setDepth(0);
      if (key === 't_window') this.windows.push(t);
      if (key === 't_bench_hotplate') this.hotplate = t;
      if (key === 't_bench_computer') this.computer = t;
      if (key === 't_door') this.door = t;
    }));
    // the working flask on the counter
    this.flask = this.sprite('fx_flask', FLASK_SPOT.x, FLASK_SPOT.y, 0).setDepth(4 * TILE + TILE + 2);
    this.liquid = this.sprite('fx_flask', FLASK_SPOT.x, FLASK_SPOT.y, 1).setDepth(4 * TILE + TILE + 3).setTint(0x8ecbff).setVisible(false);
    this.player = new Walker(this, 'player', PLAYER_SPOT.col, PLAYER_SPOT.row, 'down');
    this.customer = new Walker(this, flow.customerKey.value, DOOR.col, DOOR.row, 'up');
    this.customer.setVisible(false);
    this.mentor = new Walker(this, 'mentor', DOOR.col, DOOR.row, 'up');
    this.mentor.setVisible(false);
    this.restoreFromFlow();
    const petKey = sv ? equipped(sv, 'pet').sprite : undefined;
    if (petKey) this.spawnPet(petKey, reduced());
    // rebuild the room when something is bought / equipped in the shop
    const labKey = () => JSON.stringify(save.value?.economy.equipped ?? {});
    const startKey = labKey();

    if (!reduced()) {
      this.time.addEvent({ delay: 700, loop: true, callback: () => this.computer?.setFrame(this.computer.frame.name === '0' ? '1' : '0') });
      this.time.addEvent({ delay: 2600, loop: true, callback: () => { if (Math.random() < 0.5 && this.player) { const d: Dir[] = ['down', 'left', 'right']; this.player.face(d[Math.floor(Math.random() * d.length)]); this.time.delayedCall(900, () => this.player?.face('down')); } } });
    }

    this.disposers.push(
      effect(() => {
        const phase = flow.phase.value;
        const key = flow.customerKey.value;
        if (phase === this.lastPhase) return;
        this.lastPhase = phase;
        this.handlePhase(phase, key, reduced());
      }),
      effect(() => {
        const t = flow.timeOfDay.value;
        const f = t < 0.4 ? 0 : t < 0.75 ? 1 : 2;
        this.windows.forEach((w) => w.setFrame(String(Math.min(f, frameCount('t_window') - 1))));
        this.lamps.forEach((l) => l.setFrame(t >= 0.4 ? '1' : '0'));
      }),
      effect(() => {
        void save.value;
        if (labKey() !== startKey) this.time.delayedCall(0, () => this.scene.restart());
      }),
      effect(() => {
        const steps = flow.steps.value;
        const n = steps.length;
        if (n !== this.lastStepCount) {
          this.lastStepCount = n;
          const last = steps[n - 1];
          if (last && last.kind === 'step') this.onStep(last.changed, last.conditions?.temp, reduced());
        }
      }),
    );
  }

  /** After a (re)start, put everyone where the current phase says they are; 'arrive' replays the walk-in. */
  private restoreFromFlow(): void {
    const phase = flow.phase.value;
    if (!this.customer || !this.mentor) return;
    if (phase === 'request' || phase === 'bench' || phase === 'stereo' || phase === 'result' || phase === 'mentor') {
      this.customer.key = flow.customerKey.value;
      this.customer.img.setTexture(flow.customerKey.value, String(DIR_BASE.up));
      this.customer.place(CUSTOMER_SPOT.col, CUSTOMER_SPOT.row);
      this.customer.face('up');
      this.customer.setVisible(true);
      if (phase === 'mentor') {
        this.mentor.place(MENTOR_SPOT.col, MENTOR_SPOT.row);
        this.mentor.face('up');
        this.mentor.setVisible(true);
      }
      const steps = flow.steps.value;
      this.lastStepCount = steps.length;
      if (steps.some((s) => s.kind === 'step')) this.liquid?.setVisible(true).setTint(phase === 'result' ? 0x9fe3b4 : phase === 'mentor' ? 0xa9a6ba : 0x8ecbff);
      this.lastPhase = phase;
    }
  }

  private handlePhase(phase: string, key: string, reduced: boolean): void {
    if (!this.customer || !this.mentor) return;
    if (phase === 'arrive') {
      this.mentorLeave(reduced);
      this.customer.key = key;
      this.customer.img.setTexture(key, '3');
      this.customer.place(DOOR.col, DOOR.row);
      this.customer.setVisible(true);
      this.door?.setFrame('1');
      this.liquid?.setVisible(false);
      this.customer.walkTo(CUSTOMER_SPOT.col, CUSTOMER_SPOT.row, reduced, () => {
        this.door?.setFrame('0');
        this.customer?.face('up');
        this.customer?.showEmote('emote_exclaim', reduced);
        flow.customerArrived();
      });
    } else if (phase === 'request') {
      this.time.delayedCall(600, () => this.customer?.showEmote('emote_question', reduced, 2500));
    } else if (phase === 'bench') {
      this.customer.hideEmote();
      this.player?.face('down');
    } else if (phase === 'result') {
      this.customer.showEmote('emote_heart', reduced, 3000);
      this.liquid?.setVisible(true).setTint(0x9fe3b4);
      this.sparkle(reduced);
    } else if (phase === 'mentor') {
      this.customer.showEmote('emote_sweat', reduced, 3000);
      this.liquid?.setVisible(true).setTint(0xa9a6ba);
      this.smoke(reduced);
      this.mentorEnter(reduced);
    } else if (phase === 'idle' || phase === 'dayend') {
      this.customer.hideEmote();
      if (this.customer.img.visible) {
        this.door?.setFrame('1');
        this.customer.walkTo(DOOR.col, DOOR.row, reduced, () => { this.customer?.setVisible(false); this.door?.setFrame('0'); });
      }
      this.mentorLeave(reduced);
    }
  }

  /** The lab pet wanders the shop floor in front of the counter. */
  private spawnPet(key: string, reduced: boolean): void {
    const z = this.r.zoom;
    const pet = this.sprite(key, 3 * TILE, 7 * TILE + 12, 0, 0.5, 1);
    const depthAt = () => pet.setDepth((pet.y - (this.r.oy - this.r.y)) / z + 0.25);
    depthAt();
    let idleFrame = 0;
    this.time.addEvent({ delay: 520, loop: true, callback: () => { if (!pet.getData('walking')) { idleFrame = 1 - idleFrame; pet.setFrame(String(reduced ? 0 : idleFrame)); } } });
    if (reduced) return;
    const wander = () => {
      if (!pet.active) return;
      const tx = this.vx(16 + Math.random() * 128);
      const ty = this.vy(6 * TILE + 14 + Math.random() * 20);
      const dx = tx - pet.x;
      const base = dx < 0 ? 2 : 4;
      let step = 0;
      pet.setData('walking', true);
      const walk = this.time.addEvent({ delay: 150, loop: true, callback: () => { step = 1 - step; pet.setFrame(String(base + step)); } });
      const dist = Math.hypot(dx, ty - pet.y) / z;
      this.tweens.add({
        targets: pet, x: tx, y: ty, duration: Math.max(300, dist * 45), ease: 'Linear',
        onUpdate: depthAt,
        onComplete: () => {
          walk.remove();
          pet.setData('walking', false);
          pet.setFrame('0');
          this.time.delayedCall(1800 + Math.random() * 3200, wander);
        },
      });
    };
    this.time.delayedCall(1200, wander);
  }

  private onStep(changed: boolean, temp: string | undefined, reduced: boolean): void {
    if (!this.flask) return;
    this.liquid?.setVisible(true).setTint(changed ? 0x8ecbff : 0xffb3c6);
    this.hotplate?.setFrame(temp === 'reflux' || temp === 'c140' || temp === 'c180' ? '1' : '0');
    if (reduced) return;
    const n = changed ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const b = this.sprite('fx_bubble', FLASK_SPOT.x - 6 + Math.random() * 12, FLASK_SPOT.y - 10, i % 3, 0.5, 0.5).setDepth(900);
      this.tweens.add({ targets: b, y: b.y - 14 * this.r.zoom, alpha: 0, duration: 500 + i * 120, onComplete: () => b.destroy() });
    }
    this.player?.face('down');
  }

  private mentorEnter(reduced: boolean): void {
    if (!this.mentor) return;
    this.mentor.place(DOOR.col, DOOR.row);
    this.mentor.setVisible(true);
    this.door?.setFrame('1');
    this.mentor.walkTo(MENTOR_SPOT.col, MENTOR_SPOT.row, reduced, () => {
      this.door?.setFrame('0');
      this.mentor?.face('up');
      this.mentor?.showEmote('emote_idea', reduced, 2500);
    });
  }

  private mentorLeave(reduced: boolean): void {
    if (!this.mentor || !this.mentor.img.visible) return;
    this.mentor.walkTo(DOOR.col, DOOR.row, reduced, () => this.mentor?.setVisible(false));
  }

  private sparkle(reduced: boolean): void {
    const n = reduced ? 2 : 6;
    for (let i = 0; i < n; i++) {
      const s = this.sprite('fx_sparkle', FLASK_SPOT.x + (Math.random() - 0.5) * 40, FLASK_SPOT.y - 6 + (Math.random() - 0.5) * 24, 0, 0.5, 0.5).setDepth(950);
      let f = 0;
      const ev = this.time.addEvent({ delay: 110, repeat: 4, callback: () => { f = (f + 1) % frameCount('fx_sparkle'); s.setFrame(String(f)); } });
      this.time.delayedCall(650 + i * 50, () => { ev.remove(); s.destroy(); });
    }
  }

  private smoke(reduced: boolean): void {
    const n = reduced ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const p = this.sprite('fx_smoke', FLASK_SPOT.x + (i - 1) * 8, FLASK_SPOT.y - 8, 0, 0.5, 1).setDepth(950);
      let f = 0;
      const ev = this.time.addEvent({ delay: 160, repeat: 3, callback: () => { f = Math.min(f + 1, frameCount('fx_smoke') - 1); p.setFrame(String(f)); } });
      if (!reduced) this.tweens.add({ targets: p, y: p.y - 18 * this.r.zoom, alpha: 0.2, duration: 700 });
      this.time.delayedCall(750, () => { ev.remove(); p.destroy(); });
    }
  }
}
void VW;
void VH;
