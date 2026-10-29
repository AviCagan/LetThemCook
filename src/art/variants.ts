// Palette-swapped variants of existing sprites, for the shop: counter, rug and fume-hood colours, and
// new customers in coloured lab coats. A variant key is "<base>__<variant>"; textures.ts resolves it.
import { PALETTE as P, type SpriteDef } from './sprites';

interface Family {
  base: string;
  dark: string;
  light: string;
}
const FAMILY: Record<string, Family> = {
  teal: { base: P.teal, dark: P.tealDark, light: P.tealLight },
  coral: { base: P.coral, dark: P.coralDark, light: P.pink },
  lavender: { base: P.lavender, dark: P.lavenderDark, light: P.lavenderLight },
  mint: { base: P.mint, dark: P.mintDark, light: '#d9f6e2' },
  gold: { base: P.gold, dark: P.goldDark, light: P.glowLight },
  sky: { base: P.sky, dark: P.skyDark, light: P.skyLight },
  steel: { base: P.steel, dark: P.steelDark, light: P.steelLight },
};

const COUNTER = ['t_counter_l', 't_counter_m', 't_counter_r'];
const RUG = ['t_rug', 't_rug_edge_top', 't_rug_edge_left', 't_rug_tl'];
const HOOD = ['t_fumehood_tl', 't_fumehood_tr', 't_fumehood_bl', 't_fumehood_br'];

/** colour -> colour swap for the teal family (counter, rug) */
function tealTo(f: Family): Record<string, string> {
  return { [P.teal]: f.base, [P.tealDark]: f.dark, [P.tealLight]: f.light, [P.mint]: f.light };
}
function steelTo(f: Family): Record<string, string> {
  return { [P.steel]: f.base, [P.steelDark]: f.dark, [P.steelLight]: f.light };
}

export interface VariantDef {
  key: string;
  base: string;
  /** recolour by colour value */
  colors?: Record<string, string>;
  /** recolour by palette character (character coats: w = coat, c = coat shade) */
  chars?: Record<string, string>;
}

export const VARIANTS: VariantDef[] = [];
for (const name of ['coral', 'lavender', 'mint', 'gold']) {
  for (const k of COUNTER) VARIANTS.push({ key: `${k}__${name}`, base: k, colors: tealTo(FAMILY[name]) });
}
for (const name of ['coral', 'lavender', 'gold', 'sky']) {
  for (const k of RUG) VARIANTS.push({ key: `${k}__${name}`, base: k, colors: tealTo(FAMILY[name]) });
}
for (const name of ['mint', 'lavender', 'gold']) {
  for (const k of HOOD) VARIANTS.push({ key: `${k}__${name}`, base: k, colors: steelTo(FAMILY[name]) });
}

/** Unlockable customers: existing scientists in coloured lab coats, with their own names. */
export const NEW_CUSTOMERS: { key: string; base: string; name: string; coat: string; species: string }[] = [
  { key: 'sci_frog__gold', base: 'sci_frog', name: 'Dr. Goldie Croak', coat: 'gold', species: 'frog' },
  { key: 'sci_cat__lavender', base: 'sci_cat', name: 'Professor Midnight Purr', coat: 'lavender', species: 'cat' },
  { key: 'sci_bunny__mint', base: 'sci_bunny', name: 'Dr. Minty Hopsworth', coat: 'mint', species: 'bunny' },
  { key: 'sci_owl__coral', base: 'sci_owl', name: 'Dr. Ember Hoot', coat: 'coral', species: 'owl' },
  { key: 'sci_dino__sky', base: 'sci_dino', name: 'Dr. Skye Rexford', coat: 'sky', species: 'dinosaur' },
];
for (const c of NEW_CUSTOMERS) {
  const f = FAMILY[c.coat];
  VARIANTS.push({ key: c.key, base: c.base, chars: { w: f.light, c: f.base } });
}

const VARIANT_MAP = new Map(VARIANTS.map((v) => [v.key, v]));

export function variantDef(key: string, base: SpriteDef | undefined): SpriteDef | undefined {
  const v = VARIANT_MAP.get(key);
  if (!v || !base) return undefined;
  const palette: Record<string, string> = {};
  for (const [ch, col] of Object.entries(base.palette)) {
    palette[ch] = v.chars?.[ch] ?? v.colors?.[col] ?? col;
  }
  return { ...base, palette };
}

export function variantBase(key: string): string | undefined {
  return VARIANT_MAP.get(key)?.base;
}
