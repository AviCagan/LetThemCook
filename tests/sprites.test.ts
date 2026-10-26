import { describe, it, expect } from 'vitest';
import { SPRITES, PALETTE, CHARACTERS, type SpriteDef } from '../src/art/sprites';

const HEX = /^#[0-9a-f]{6}$/i;

const CUSTOMERS = ['sci_frog', 'sci_cat', 'sci_owl', 'sci_robot', 'sci_axolotl', 'sci_bear', 'sci_bunny', 'sci_duck', 'sci_ghost', 'sci_dino'];
const CHARACTER_KEYS = [...CUSTOMERS, 'player', 'mentor'];
const EMOTES = ['emote_exclaim', 'emote_question', 'emote_heart', 'emote_dots', 'emote_sweat', 'emote_music', 'emote_idea'];
const SINGLE_TILES = [
  't_floor_a', 't_floor_b', 't_floor_dark', 't_rug', 't_rug_edge_top', 't_rug_edge_left', 't_rug_tl',
  't_wall_top', 't_wall', 't_wall_shelf', 't_wall_poster', 't_wall_cabinet',
  't_counter_l', 't_counter_m', 't_counter_r', 't_counter_front_l', 't_counter_front_m', 't_counter_front_r',
  't_bench', 't_bench_flask', 't_bench_icebath', 't_bench_books',
  't_fumehood_tl', 't_fumehood_tr', 't_fumehood_bl', 't_fumehood_br', 't_bookshelf', 't_plant', 't_trash', 't_sink',
];
const SINGLE_ICONS = [
  'ic_bottle_tall', 'ic_bottle_round', 'ic_bottle_flask', 'ic_bottle_dropper', 'ic_gas_tank', 'ic_flame', 'ic_ice', 'ic_lamp',
  'ic_water', 'ic_check', 'ic_cross', 'ic_lock', 'ic_notepad', 'ic_book', 'ic_help', 'ic_arrow', 'ic_undo',
];

/** key -> [w, h, frameCount, anchor] */
const REQUIRED: Record<string, [number, number, number, [number, number]]> = {};
for (const k of CHARACTER_KEYS) REQUIRED[k] = [16, 20, 12, [0.5, 1]];
for (const k of EMOTES) REQUIRED[k] = [16, 16, 2, [0.5, 1]];
for (const k of SINGLE_TILES) REQUIRED[k] = [16, 16, 1, [0, 0]];
REQUIRED.t_window = [16, 16, 3, [0, 0]];
REQUIRED.t_door = [16, 16, 2, [0, 0]];
REQUIRED.t_bench_hotplate = [16, 16, 2, [0, 0]];
REQUIRED.t_bench_computer = [16, 16, 2, [0, 0]];
for (const k of SINGLE_ICONS) REQUIRED[k] = [16, 16, 1, [0.5, 0.5]];
REQUIRED.ic_star = [16, 16, 2, [0.5, 0.5]];
REQUIRED.ic_coin = [16, 16, 3, [0.5, 0.5]];
REQUIRED.fx_sparkle = [16, 16, 4, [0.5, 0.5]];
REQUIRED.fx_smoke = [16, 16, 4, [0.5, 0.5]];
REQUIRED.fx_bubble = [8, 8, 3, [0.5, 0.5]];
REQUIRED.fx_flask = [24, 24, 5, [0.5, 1]];
REQUIRED.fx_glow = [16, 16, 2, [0.5, 0.5]];
REQUIRED.ui_frame = [24, 24, 1, [0, 0]];
REQUIRED.ui_frame_dark = [24, 24, 1, [0, 0]];
REQUIRED.ui_cursor = [8, 8, 1, [0, 0]];

const mirror = (frame: string[]) => frame.map((r) => [...r].reverse().join(''));
const opaque = (frame: string[]) => frame.join('').replace(/\./g, '').length;
const charsOf = (frame: string[], ch: string) => frame.join('').split('').filter((c) => c === ch).length;
const whiteChars = (s: SpriteDef) => Object.entries(s.palette).filter(([, hex]) => hex.toLowerCase() === '#ffffff').map(([c]) => c);

describe('PALETTE', () => {
  it('only holds #rrggbb colours and has the shared names the sprites rely on', () => {
    for (const [name, hex] of Object.entries(PALETTE)) expect(hex, name).toMatch(HEX);
    for (const name of ['outline', 'white', 'cream', 'teal', 'mint', 'coral', 'gold', 'sky', 'lavender', 'navy', 'floorLight', 'floorDark', 'wall', 'wood']) {
      expect(PALETTE[name], name).toBeDefined();
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
      for (const v of s.anchor) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each(Object.entries(REQUIRED))('%s exists with the right size, frame count and anchor', (key, [w, h, n, anchor]) => {
    const s = SPRITES[key];
    expect(s, `missing sprite ${key}`).toBeDefined();
    expect([s.w, s.h]).toEqual([w, h]);
    expect(s.frames.length).toBe(n);
    expect(s.anchor ?? [0.5, 1]).toEqual(anchor);
  });

  it('keeps palettes tight and every outline on the shared dark outline colour', () => {
    for (const [key, s] of Object.entries(SPRITES)) {
      const limit = CHARACTER_KEYS.includes(key) ? 8 : 12;
      expect(Object.keys(s.palette).length, key).toBeLessThanOrEqual(limit);
      if ('o' in s.palette) expect(s.palette.o, `${key} outline`).toBe(PALETTE.outline);
      for (const ch of Object.keys(s.palette)) {
        const used = s.frames.some((f) => f.some((r) => r.includes(ch)));
        expect(used, `${key} palette char "${ch}" is unused`).toBe(true);
      }
    }
  });

  describe('characters', () => {
    it.each(CHARACTER_KEYS)('%s wears a white coat in every frame and shows eyes whenever it faces the camera', (key) => {
      const s = SPRITES[key];
      const whites = whiteChars(s);
      expect(whites.length, `${key} needs a white coat colour`).toBeGreaterThan(0);
      expect(s.palette.k, `${key} needs eye colour k`).toBeDefined();
      s.frames.forEach((frame, i) => {
        const txt = frame.join('');
        expect(whites.some((c) => txt.includes(c)), `${key} frame ${i} coat`).toBe(true);
        // Up frames (3-5) show the back of the head, so eyes are only required when facing down/left/right.
        const facingAway = i >= 3 && i <= 5;
        if (!facingAway) expect(txt.includes('k'), `${key} frame ${i} eyes`).toBe(true);
      });
    });

    it.each(CHARACTER_KEYS)('%s right-facing frames mirror the left-facing ones', (key) => {
      const s = SPRITES[key];
      for (let i = 0; i < 3; i++) expect(s.frames[9 + i], `${key} right${i}`).toEqual(mirror(s.frames[6 + i]));
    });

    it.each(CHARACTER_KEYS)('%s walk poses differ from standing and from each other', (key) => {
      const s = SPRITES[key];
      for (const base of [0, 3, 6]) {
        expect(s.frames[base + 1]).not.toEqual(s.frames[base]);
        expect(s.frames[base + 1]).not.toEqual(s.frames[base + 2]);
      }
    });

    it('sci_ghost floats: its first walk frame is the standing frame bobbed up one pixel', () => {
      const s = SPRITES.sci_ghost;
      for (const base of [0, 3, 6, 9]) {
        const bobbed = [...s.frames[base].slice(1), '.'.repeat(s.w)];
        expect(s.frames[base + 1]).toEqual(bobbed);
        expect(s.frames[base + 2]).toEqual(s.frames[base]);
      }
    });

    it('uses the dark outline colour for every character outline', () => {
      for (const key of CHARACTER_KEYS) expect(SPRITES[key].palette.o).toBe(PALETTE.outline);
    });
  });

  describe('emotes', () => {
    it.each(EMOTES)('%s pops in from a smaller balloon', (key) => {
      const s = SPRITES[key];
      expect(opaque(s.frames[0])).toBeLessThan(opaque(s.frames[1]));
      // full balloon is white with a dark outline and a tail reaching the bottom-left
      expect(s.frames[1][15].slice(0, 6)).toContain('o');
      expect(whiteChars(s).length).toBeGreaterThan(0);
    });
  });

  describe('tiles', () => {
    it('floor, wall and counter tiles have no transparent pixels so they tile seamlessly', () => {
      const solid = ['t_floor_a', 't_floor_b', 't_floor_dark', 't_rug', 't_rug_edge_top', 't_rug_edge_left', 't_rug_tl', 't_wall_top', 't_wall', 't_wall_shelf', 't_wall_poster', 't_wall_cabinet', 't_window', 't_counter_m', 't_counter_front_m', 't_bench', 't_door'];
      for (const key of solid) {
        for (const frame of SPRITES[key].frames) expect(frame.join('').includes('.'), `${key} has transparent pixels`).toBe(false);
      }
    });

    it('rug edges share the centre pattern and the corner combines both edges', () => {
      const centre = SPRITES.t_rug.frames[0];
      const top = SPRITES.t_rug_edge_top.frames[0];
      const left = SPRITES.t_rug_edge_left.frames[0];
      const tl = SPRITES.t_rug_tl.frames[0];
      for (let y = 3; y < 16; y++) {
        expect(top[y]).toBe(centre[y]);
        expect(left[y].slice(3)).toBe(centre[y].slice(3));
        expect(tl[y].slice(3)).toBe(centre[y].slice(3));
      }
      for (let y = 0; y < 3; y++) expect(tl[y].slice(3)).toBe(top[y].slice(3));
      for (let y = 3; y < 16; y++) expect(tl[y].slice(0, 3)).toBe(left[y].slice(0, 3));
    });

    it('counter ends close with an outline column and the middle piece runs edge to edge', () => {
      for (const [l, m, r] of [['t_counter_l', 't_counter_m', 't_counter_r'], ['t_counter_front_l', 't_counter_front_m', 't_counter_front_r']]) {
        const L = SPRITES[l].frames[0], M = SPRITES[m].frames[0], R = SPRITES[r].frames[0];
        for (let y = 1; y < 15; y++) {
          expect(L[y][0], `${l} row ${y}`).toBe('o');
          expect(R[y][15], `${r} row ${y}`).toBe('o');
          expect(M[y][0]).toBe(M[y][15]);
        }
      }
    });

    it('window night frame has stars and the hotplate glows when on', () => {
      const win = SPRITES.t_window;
      expect(charsOf(win.frames[2], 'w')).toBeGreaterThan(3);
      expect(win.frames[0]).not.toEqual(win.frames[1]);
      const hot = SPRITES.t_bench_hotplate;
      expect(hot.frames[1]).not.toEqual(hot.frames[0]);
      expect(Object.values(hot.palette).map((h) => h.toLowerCase())).toContain(PALETTE.orange.toLowerCase());
    });

    it('fume hood halves meet in the middle', () => {
      const tl = SPRITES.t_fumehood_tl.frames[0], tr = SPRITES.t_fumehood_tr.frames[0];
      const bl = SPRITES.t_fumehood_bl.frames[0], br = SPRITES.t_fumehood_br.frames[0];
      for (let y = 0; y < 16; y++) {
        expect(tl[y][0]).toBe('o');
        expect(tr[y][15]).toBe('o');
        expect(bl[y][0]).toBe('o');
        expect(br[y][15]).toBe('o');
      }
      expect(tl[15]).toBe(bl[0]);
    });
  });

  describe('fx_flask', () => {
    it('draws the liquid with the single char l, rising frame by frame inside the glass', () => {
      const s = SPRITES.fx_flask;
      expect(s.palette.l).toBeDefined();
      const empty = s.frames[0];
      expect(charsOf(empty, 'l')).toBe(0);
      let prev = 0;
      for (let i = 1; i < s.frames.length; i++) {
        const f = s.frames[i];
        const count = charsOf(f, 'l');
        expect(count, `frame ${i}`).toBeGreaterThan(prev);
        prev = count;
        for (let y = 0; y < s.h; y++) {
          for (let x = 0; x < s.w; x++) {
            const a = empty[y][x], b = f[y][x];
            if (a !== b) {
              expect(b, `frame ${i} (${x},${y}) may only change glass into liquid`).toBe('l');
              expect('gw'.includes(a), `frame ${i} (${x},${y}) liquid outside the glass`).toBe(true);
            }
          }
        }
      }
    });
  });

  describe('ui', () => {
    it.each(['ui_frame', 'ui_frame_dark'])('%s is a 9-slice on an 8px grid with a flat centre cell', (key) => {
      const f = SPRITES[key].frames[0];
      const centre = new Set<string>();
      for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) centre.add(f[y][x]);
      expect([...centre]).toHaveLength(1);
      expect([...centre][0]).not.toBe('.');
      // outer line is dark with 1px rounded corners, inner line white
      expect(f[0][0]).toBe('.');
      expect(f[0][1]).toBe('o');
      expect(f[1][1]).toBe('w');
      expect(f[23][23]).toBe('.');
      expect(f[12][0]).toBe('o');
      expect(f[12][1]).toBe('w');
      expect(SPRITES[key].palette.w).toBe(PALETTE.white);
    });

    it('ui_frame_dark fills with navy', () => {
      const f = SPRITES.ui_frame_dark.frames[0];
      expect(SPRITES.ui_frame_dark.palette[f[12][12]]).toBe(PALETTE.navy);
    });

    it('ui_cursor is a right-pointing arrow', () => {
      const f = SPRITES.ui_cursor.frames[0];
      expect(f[0][0]).not.toBe('.');
      expect(f[4].replace(/\./g, '').length).toBeGreaterThan(f[0].replace(/\./g, '').length);
    });
  });
});

describe('CHARACTERS', () => {
  it('lists the ten scientist customers with unique names', () => {
    expect(CHARACTERS.map((c) => c.key)).toEqual(CUSTOMERS);
    for (const c of CHARACTERS) {
      expect(SPRITES[c.key], c.key).toBeDefined();
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.species.length).toBeGreaterThan(0);
    }
    expect(new Set(CHARACTERS.map((c) => c.name)).size).toBe(10);
  });
});
