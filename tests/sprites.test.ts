import { describe, it, expect } from 'vitest';
import { SPRITES, PALETTE, CHARACTERS } from '../src/art/sprites';

const HEX = /^#[0-9a-f]{6}$/i;

/** key -> [w, h, frameCount] */
const REQUIRED: Record<string, [number, number, number]> = {
  sci_frog: [24, 32, 4],
  sci_cat: [24, 32, 4],
  sci_owl: [24, 32, 4],
  sci_robot: [24, 32, 4],
  sci_axolotl: [24, 32, 4],
  sci_bear: [24, 32, 4],
  sci_bunny: [24, 32, 4],
  sci_duck: [24, 32, 4],
  sci_ghost: [24, 32, 4],
  sci_dino: [24, 32, 4],
  mentor: [24, 32, 3],
  player_hands: [32, 16, 2],
  bottle_tall: [16, 24, 2],
  bottle_round: [16, 24, 2],
  bottle_flask: [16, 24, 2],
  flask_big: [32, 40, 1],
  flask_liquid: [32, 40, 6],
  beaker: [24, 28, 3],
  hotplate: [40, 16, 2],
  ice_bath: [40, 20, 2],
  fume_hood: [96, 72, 1],
  bench_tile: [32, 32, 1],
  bench_front: [32, 32, 1],
  shelf_board: [32, 8, 1],
  floor_tile: [32, 32, 1],
  wall_tile: [32, 32, 1],
  window: [48, 48, 3],
  plant: [16, 24, 1],
  clipboard: [48, 56, 1],
  thermometer: [8, 32, 1],
  dial: [24, 24, 1],
  drop: [6, 8, 1],
  bubble: [8, 8, 2],
  sparkle: [12, 12, 4],
  puff: [24, 24, 4],
  star: [12, 12, 2],
  coin: [10, 10, 3],
  speech_tail: [8, 6, 1],
  pet_slime: [16, 14, 2],
  heart: [8, 8, 1],
  check: [12, 12, 1],
  cross: [12, 12, 1],
  lock: [10, 12, 1],
};

describe('PALETTE', () => {
  it('only holds #rrggbb colours', () => {
    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(hex, name).toMatch(HEX);
    }
  });
});

describe('SPRITES', () => {
  const keys = Object.keys(SPRITES);

  it.each(keys)('%s is a well-formed sprite', (key) => {
    const s = SPRITES[key];
    expect(s.w).toBeGreaterThan(0);
    expect(s.h).toBeGreaterThan(0);
    expect(s.frames.length).toBeGreaterThanOrEqual(1);
    expect(s.palette['.']).toBeUndefined();
    for (const [ch, hex] of Object.entries(s.palette)) {
      expect(ch.length, `${key} palette char "${ch}"`).toBe(1);
      expect(hex, `${key} palette ${ch}`).toMatch(HEX);
    }
    const problems: string[] = [];
    s.frames.forEach((frame, fi) => {
      if (frame.length !== s.h) problems.push(`frame ${fi}: ${frame.length} rows, want ${s.h}`);
      frame.forEach((row, ri) => {
        if (row.length !== s.w) problems.push(`frame ${fi} row ${ri}: ${row.length} chars, want ${s.w}: "${row}"`);
        for (const ch of row) {
          if (ch !== '.' && !(ch in s.palette)) {
            problems.push(`frame ${fi} row ${ri}: char "${ch}" not in palette`);
            break;
          }
        }
      });
    });
    expect(problems, problems.join('\n')).toEqual([]);
    if (s.anchor) {
      expect(s.anchor[0]).toBeGreaterThanOrEqual(0);
      expect(s.anchor[0]).toBeLessThanOrEqual(1);
      expect(s.anchor[1]).toBeGreaterThanOrEqual(0);
      expect(s.anchor[1]).toBeLessThanOrEqual(1);
    }
  });

  it.each(Object.entries(REQUIRED))('%s exists with the right size and frame count', (key, [w, h, n]) => {
    const s = SPRITES[key];
    expect(s, `missing sprite ${key}`).toBeDefined();
    expect([s.w, s.h]).toEqual([w, h]);
    expect(s.frames.length).toBe(n);
  });

  it('keeps every sprite palette small (<= 12 colours)', () => {
    for (const [key, s] of Object.entries(SPRITES)) {
      expect(Object.keys(s.palette).length, key).toBeLessThanOrEqual(12);
    }
  });

  it('draws a visible lab coat and face on every character', () => {
    const chars = [...keys.filter((k) => k.startsWith('sci_')), 'mentor'];
    for (const key of chars) {
      const s = SPRITES[key];
      const whites = Object.entries(s.palette).filter(([, hex]) => hex.toLowerCase() === '#ffffff').map(([c]) => c);
      expect(whites.length, `${key} needs a white coat colour`).toBeGreaterThan(0);
      expect(s.palette.k, `${key} needs eye colour k`).toBeDefined();
      for (const frame of s.frames) {
        const txt = frame.join('');
        expect(whites.some((c) => txt.includes(c)), `${key} coat`).toBe(true);
        expect(txt.includes('k'), `${key} eyes`).toBe(true);
      }
    }
  });

  it('keeps the bottle label areas flat (cols 3-12, rows 10-16)', () => {
    for (const key of ['bottle_tall', 'bottle_round', 'bottle_flask']) {
      const frame = SPRITES[key].frames[0];
      for (let y = 10; y <= 16; y++) {
        expect(frame[y].slice(3, 13), `${key} row ${y}`).toBe('eeeeeeeeee');
      }
    }
  });

  it('keeps the clipboard paper flat', () => {
    const frame = SPRITES.clipboard.frames[0];
    for (let y = 10; y <= 52; y++) {
      expect(frame[y].slice(3, 45), `row ${y}`).toBe('e'.repeat(42));
    }
  });

  it('flask_liquid uses a single colour and rises frame by frame', () => {
    const s = SPRITES.flask_liquid;
    expect(Object.keys(s.palette)).toHaveLength(1);
    const counts = s.frames.map((f) => f.join('').replace(/\./g, '').length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
  });

  it('tiles are seamless left-right', () => {
    for (const key of ['bench_tile', 'bench_front', 'shelf_board', 'floor_tile', 'wall_tile']) {
      const s = SPRITES[key];
      for (const row of s.frames[0]) expect(row.includes('.'), `${key} has transparent pixels`).toBe(false);
    }
  });
});

describe('CHARACTERS', () => {
  it('lists all ten scientists with names', () => {
    expect(CHARACTERS).toHaveLength(10);
    for (const c of CHARACTERS) {
      expect(SPRITES[c.key], c.key).toBeDefined();
      expect(c.key.startsWith('sci_')).toBe(true);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.species.length).toBeGreaterThan(0);
    }
    expect(new Set(CHARACTERS.map((c) => c.key)).size).toBe(10);
  });
});
