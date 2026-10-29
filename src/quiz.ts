// Builds the question for the quiz-style order types from an item's validated content.
// Distractors lean on the player's own top mistake tags (spec §6: the game learns your weaknesses).
import type { Flaw, NameTrap, OrderType, QuestionItem, RouteStep } from './content/types';
import { ITEMS } from './content/bank';
import { nameChoices } from './engine/names';
import type { Rng } from './util/rng';

export interface QuizOption {
  smiles: string;
  name?: string;
  correct: boolean;
  tag?: string;
  why?: string;
  /** what-did-I-start-with distractors: what the route makes from this one */
  gives?: string;
}

export type Quiz =
  | { kind: 'predict_product'; options: QuizOption[] }
  | { kind: 'what_start'; options: QuizOption[] }
  | { kind: 'spot_flaw'; routes: { route: RouteStep[]; works: boolean }[]; flaw: Flaw; reasons: string[] }
  | { kind: 'name_it'; accepted: string[]; traps: NameTrap[]; choices: string[] };

export const QUIZ_TYPES: OrderType[] = ['predict_product', 'what_start', 'spot_flaw', 'name_it'];
export const isQuizType = (t: OrderType) => QUIZ_TYPES.includes(t);

/** Order types unlock as the player completes orders (spec: "unlock progressively"). */
export const UNLOCKS: { type: OrderType; after: number; label: string }[] = [
  { type: 'make_it', after: 0, label: 'Make it' },
  { type: 'predict_product', after: 3, label: 'What do I get?' },
  { type: 'name_it', after: 6, label: 'Name it' },
  { type: 'what_start', after: 10, label: 'What did I start with?' },
  { type: 'spot_flaw', after: 15, label: 'Spot the flaw' },
];
export function unlockedTypes(ordersDone: number): OrderType[] {
  return UNLOCKS.filter((u) => ordersDone >= u.after).map((u) => u.type);
}
export const TYPE_LABEL: Record<OrderType, string> = {
  make_it: 'Make it',
  synthesis: 'Special order',
  predict_product: 'What do I get?',
  what_start: 'What did I start with?',
  spot_flaw: 'Spot the flaw',
  name_it: 'Name it',
};

/** Reasons offered for "why does the other route fail?" (labels come from mistake_tags.json). */
const REASON_POOL = [
  'missing_workup', 'wrong_reagent_order', 'wrong_temperature', 'no_reaction', 'over_reduction', 'over_oxidation',
  'markovnikov_flip', 'williamson_E2', 'epoxide_wrong_carbon', 'ozone_vs_osmium', 'acyl_wrong_site',
  'lewis_acid_as_base', 'sulfoxide_vs_sulfone', 'stopped_halfway', 'zaitsev_flip', 'nitrite_vs_nitric',
];

function shuffle<T>(rng: Rng, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick n items, preferring ones whose tag is among the player's frequent mistakes. */
function pickWeighted<T extends { tag?: string }>(rng: Rng, list: T[], n: number, topTags: string[]): T[] {
  const scored = list.map((x) => ({ x, w: (x.tag && topTags.includes(x.tag) ? 3 : 1) * (0.5 + rng()) }));
  scored.sort((a, b) => b.w - a.w);
  return scored.slice(0, n).map((s) => s.x);
}

const largest = (smiles: string) => smiles.split('.').sort((a, b) => b.length - a.length)[0];

export function buildQuiz(type: OrderType, item: QuestionItem, rng: Rng, topTags: string[] = []): Quiz | undefined {
  const target = item.target;
  if (type === 'predict_product') {
    const seen = new Set([largest(target.smiles!)]);
    const wrong = (item.traps ?? []).filter((t) => {
      const k = largest(t.smiles);
      if (t.stereoOnly || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (wrong.length < 3) return undefined;
    const picked = pickWeighted(rng, wrong, 3, topTags);
    const options: QuizOption[] = [
      { smiles: target.smiles!, name: target.name, correct: true },
      ...picked.map((t) => ({ smiles: t.smiles, correct: false, tag: t.tag, why: t.why })),
    ];
    return { kind: 'predict_product', options: shuffle(rng, options) };
  }
  if (type === 'what_start') {
    const ds = item.reverse?.distractors ?? [];
    if (ds.length < 3) return undefined;
    const options: QuizOption[] = [
      { smiles: item.start.smiles, name: item.start.name, correct: true },
      ...ds.slice(0, 3).map((d) => ({ smiles: d.smiles, name: d.name, correct: false, tag: 'wrong_start', why: d.why, gives: d.gives })),
    ];
    return { kind: 'what_start', options: shuffle(rng, options) };
  }
  if (type === 'spot_flaw') {
    const flaws = item.flaws ?? [];
    if (!flaws.length) return undefined;
    const flaw = pickWeighted(rng, flaws, 1, topTags)[0];
    const others = shuffle(rng, REASON_POOL.filter((t) => t !== flaw.tag)).slice(0, 3);
    return {
      kind: 'spot_flaw',
      routes: shuffle(rng, [{ route: item.route, works: true }, { route: flaw.route, works: false }]),
      flaw,
      reasons: shuffle(rng, [flaw.tag, ...others]),
    };
  }
  if (type === 'name_it') {
    const accepted = [target.name, ...(target.altNames ?? [])];
    const traps = item.nameTraps ?? [];
    const len = target.name.length;
    const others = ITEMS.filter((q) => q.id !== item.id && (q.orderTypes ?? []).includes('name_it') && Math.abs(q.target.name.length - len) <= 5).map((q) => q.target.name);
    const wrong = nameChoices(accepted, traps, [...new Set(others)], rng);
    if (wrong.length < 3) return undefined;
    return { kind: 'name_it', accepted, traps, choices: shuffle(rng, [target.name, ...wrong]) };
  }
  return undefined;
}
