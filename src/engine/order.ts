// Builds one playable order from a question item and an order type.
import type { Molecule, OrderType, QuestionItem, Reaction, Reagent, Route, StereoLabel } from '../content/types';
import { REAGENTS, getReaction, getReagent } from '../content/bank';
import { sample, shuffle, type Rng } from '../util/rng';

export interface ProductOption {
  id: string;
  smiles: string;
  stereo: StereoLabel;
  correct: boolean;
  tag?: string;
  why?: string;
}

export interface Order {
  id: string;
  item: QuestionItem;
  type: OrderType;
  reaction: Reaction;
  start: Molecule;
  /** shown on the customer card for make_it */
  target?: Molecule;
  /** given to the player for predict_product */
  givenRoute?: Route;
  /** bottles on the shelf (make_it) */
  shelf: Reagent[];
  /** product picker options, already shuffled */
  options: ProductOption[];
  stereoChoices?: StereoLabel[];
  /** par time in seconds for the speed score */
  par: number;
  /** marks a deliberate re-test of a miss */
  retest?: boolean;
}

export const DEFAULT_STEREO_CHOICES: StereoLabel[] = ['none', 'racemic', 'single_enantiomer', 'meso'];

let orderCounter = 0;

export function buildOrder(item: QuestionItem, type: OrderType, rng: Rng, opts: { retest?: boolean; shelfSize?: number } = {}): Order {
  if (!item.start || !item.route || !item.answer || !item.productDistractors) {
    throw new Error(`item ${item.id} cannot be served as ${type}`);
  }
  const reaction = getReaction(item.reactionId);
  const distractors = sample(rng, item.productDistractors, 3).map((d, i) => ({
    id: `d${i}`,
    smiles: d.smiles,
    stereo: d.stereo,
    correct: false,
    tag: d.tag,
    why: d.why,
  }));
  const options = shuffle(rng, [
    { id: 'answer', smiles: item.answer.smiles, stereo: item.answer.stereo, correct: true },
    ...distractors,
  ]);
  const stereoChoices =
    item.answer.stereo === 'none'
      ? undefined
      : uniq([item.answer.stereo, ...(item.answer.stereoChoices ?? DEFAULT_STEREO_CHOICES), 'none' as StereoLabel]);

  const order: Order = {
    id: `o${Date.now().toString(36)}-${++orderCounter}`,
    item,
    type,
    reaction,
    start: item.start,
    shelf: [],
    options,
    stereoChoices,
    par: type === 'make_it' ? 90 : 60,
    retest: opts.retest,
  };
  if (type === 'make_it') {
    order.target = { smiles: item.answer.smiles, stereo: item.answer.stereo, name: item.answer.names?.accepted[0] };
    order.shelf = buildShelf(item, reaction, rng, opts.shelfSize ?? 9);
  } else {
    order.givenRoute = item.route.steps;
  }
  return order;
}

/** The reaction's own bottles, its decoys, bottles from flawed routes, plus random fillers from the same shelves. */
export function buildShelf(item: QuestionItem, reaction: Reaction, rng: Rng, size: number): Reagent[] {
  const needed = new Set<string>();
  for (const s of item.route?.steps ?? []) s.reagents.forEach((id) => needed.add(id));
  for (const alt of item.route?.alt ?? []) alt.forEach((s) => s.reagents.forEach((id) => needed.add(id)));
  for (const alt of reaction.altRoutes ?? []) alt.forEach((s) => s.reagents.forEach((id) => needed.add(id)));
  // both workup bottles are always on the shelf so forgetting one is a real test
  needed.add('H2O');
  needed.add('H3O_plus');
  const extras = new Set<string>();
  for (const id of reaction.decoys ?? []) extras.add(id);
  for (const rd of item.routeDistractors ?? []) rd.steps.forEach((s) => s.reagents.forEach((id) => extras.add(id)));
  for (const id of needed) extras.delete(id);

  const ids = [...needed, ...shuffle(rng, [...extras])];
  const fillerPool = REAGENTS.filter((r) => !ids.includes(r.id) && r.kind === 'reagent').map((r) => r.id);
  for (const id of shuffle(rng, fillerPool)) {
    if (ids.length >= size) break;
    ids.push(id);
  }
  return shuffle(rng, ids.slice(0, Math.max(size, needed.size))).map(getReagent);
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
