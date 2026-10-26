import Phaser from 'phaser';
import { effect } from '@preact/signals';
import { StageScene, VW, VH } from '../stage';
import { flow } from '../../flow';
import { save } from '../../state';
import { frameCount } from '../../art/textures';

const BENCH_Y = 104;

export class LabScene extends StageScene {
  private customer?: Phaser.GameObjects.Image;
  private mentor?: Phaser.GameObjects.Image;
  private window?: Phaser.GameObjects.Image;
  private bubble?: Phaser.GameObjects.Text;
  private liquid?: Phaser.GameObjects.Image;
  private pet?: Phaser.GameObjects.Image;
  private walkTween?: Phaser.Tweens.Tween;
  private lastPhase = '';

  constructor() {
    super('lab');
  }

  create(): void {
    super.create();
    const reduced = () => !!save.value?.profile.settings.reducedMotion;
    // room
    this.tile('wall_tile', 0, 0, VW, 100);
    this.tile('floor_tile', 0, 100, VW, VH - 100);
    this.window = this.sprite('window', 8, 6, 0, 0, 0);
    this.sprite('shelf_board', 64, 44, 0, 0, 0).setScale(this.r.zoom * 2, this.r.zoom);
    this.sprite('bottle_tall', 72, 44);
    this.sprite('bottle_round', 90, 44);
    this.sprite('bottle_flask', 108, 44);
    this.sprite('fume_hood', 136, 24, 0, 0, 0);
    this.tile('bench_tile', 0, BENCH_Y, VW, 32);
    this.tile('bench_front', 0, BENCH_Y + 32, VW, VH - BENCH_Y - 32);
    this.sprite('hotplate', 150, BENCH_Y + 12);
    this.sprite('flask_big', 150, BENCH_Y + 12 - 2);
    this.liquid = this.sprite('flask_liquid', 150, BENCH_Y + 12 - 2, 1).setTint(0xa8dcff);
    this.sprite('ice_bath', 200, BENCH_Y + 16);
    this.sprite('beaker', 112, BENCH_Y + 12, 1);
    this.sprite('plant', 228, BENCH_Y + 4);
    this.pet = this.sprite('pet_slime', 24, BENCH_Y + 2);
    this.customer = this.sprite(flow.customerKey.value, -40, VH);
    this.mentor = this.sprite('mentor', VW + 40, VH);
    this.bubble = this.text(0, 0, '', 16).setVisible(false);

    // idle animations
    if (!reduced()) {
      this.tweens.add({ targets: this.pet, y: this.pet.y - 3 * this.r.zoom, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.time.addEvent({ delay: 900, loop: true, callback: () => this.pet?.setFrame(this.pet.frame.name === '0' ? '1' : '0') });
    }

    // react to flow state
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
        this.window?.setFrame(String(Math.min(f, frameCount('window') - 1)));
      }),
      effect(() => {
        const mg = flow.minigame.value;
        if (mg && flow.phase.value === 'minigame') {
          const sceneKey = mg.kind === 'pressure' ? 'pour' : mg.kind;
          this.scene.launch(sceneKey, mg);
        }
      }),
    );
  }

  private handlePhase(phase: string, key: string, reduced: boolean): void {
    const z = this.r.zoom;
    if (phase === 'arrive') {
      this.mentorLeave(reduced);
      this.customer?.setTexture(key, '0').setPosition(this.vx(-30), this.vy(VH)).setVisible(true);
      this.bubble?.setVisible(false);
      this.liquid?.setFrame('1').setTint(0xa8dcff);
      const target = this.vx(48);
      this.walkTween?.stop();
      if (reduced) {
        this.customer?.setX(target);
        this.time.delayedCall(150, () => flow.customerArrived());
        return;
      }
      let frame = 1;
      const walkTimer = this.time.addEvent({ delay: 140, loop: true, callback: () => { frame = frame === 1 ? 2 : 1; this.customer?.setFrame(String(frame)); } });
      this.walkTween = this.tweens.add({
        targets: this.customer,
        x: target,
        duration: 1100,
        ease: 'Linear',
        onComplete: () => {
          walkTimer.remove();
          this.customer?.setFrame('3');
          this.showBubble('!');
          flow.customerArrived();
        },
      });
    } else if (phase === 'card' || phase === 'shelf') {
      this.customer?.setFrame('3');
    } else if (phase === 'minigame') {
      this.customer?.setFrame('0');
      this.bubble?.setVisible(false);
    } else if (phase === 'picker' || phase === 'stereo') {
      this.liquid?.setFrame('4').setTint(0xffd6a5);
      this.showBubble('?');
    } else if (phase === 'result') {
      this.showBubble('♥');
      this.liquid?.setTint(0xb5f0c8);
      this.sparkle(150, BENCH_Y - 10, reduced);
    } else if (phase === 'mentor') {
      this.showBubble('…');
      this.liquid?.setTint(0x9e9e9e);
      this.puff(150, BENCH_Y - 14, reduced);
      this.mentorEnter(reduced);
    } else if (phase === 'dayend' || phase === 'idle') {
      this.bubble?.setVisible(false);
      if (!reduced && this.customer && phase === 'idle') {
        this.tweens.add({ targets: this.customer, x: this.vx(VW + 40), duration: 700, ease: 'Linear' });
      }
    }
    void z;
  }

  private showBubble(ch: string): void {
    if (!this.customer || !this.bubble) return;
    this.bubble.setText(ch).setPosition(this.customer.x + 14 * this.r.zoom, this.customer.y - 36 * this.r.zoom).setVisible(true);
  }

  private mentorEnter(reduced: boolean): void {
    if (!this.mentor) return;
    this.mentor.setFrame('2').setVisible(true);
    const target = this.vx(VW - 44);
    if (reduced) {
      this.mentor.setX(target);
      return;
    }
    this.tweens.add({ targets: this.mentor, x: target, duration: 800, ease: 'Sine.easeOut' });
  }

  private mentorLeave(reduced: boolean): void {
    if (!this.mentor) return;
    const off = this.vx(VW + 40);
    if (reduced) {
      this.mentor.setX(off);
      return;
    }
    this.tweens.add({ targets: this.mentor, x: off, duration: 500 });
  }

  private sparkle(x: number, y: number, reduced: boolean): void {
    const n = reduced ? 3 : 8;
    for (let i = 0; i < n; i++) {
      const s = this.sprite('sparkle', x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 30, 0, 0.5, 0.5);
      let f = 0;
      const ev = this.time.addEvent({ delay: 110, repeat: 4, callback: () => { f = (f + 1) % frameCount('sparkle'); s.setFrame(String(f)); } });
      this.time.delayedCall(650 + i * 40, () => { ev.remove(); s.destroy(); });
    }
  }

  private puff(x: number, y: number, reduced: boolean): void {
    const n = reduced ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const p = this.sprite('puff', x + (i - 1) * 12, y, 0, 0.5, 1);
      let f = 0;
      const ev = this.time.addEvent({ delay: 160, repeat: 3, callback: () => { f = Math.min(f + 1, frameCount('puff') - 1); p.setFrame(String(f)); } });
      if (!reduced) this.tweens.add({ targets: p, y: p.y - 20 * this.r.zoom, alpha: 0.2, duration: 700 });
      this.time.delayedCall(750, () => { ev.remove(); p.destroy(); });
    }
  }
}
