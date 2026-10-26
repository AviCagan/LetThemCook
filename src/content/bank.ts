// Loads the chemistry content (pure data) and exposes typed lookups. The engine never
// hard-codes chemistry: everything comes from content/*.json.
import reagentsJson from '../../content/reagents.json';
import reactionsJson from '../../content/reactions.json';
import tagsJson from '../../content/mistake_tags.json';
import type { MistakeTag, QuestionItem, Reaction, Reagent, Chapter } from './types';

const questionModules = import.meta.glob('../../content/questions/*.json', { eager: true }) as Record<
  string,
  { default: QuestionItem[] }
>;

export const REAGENTS: Reagent[] = reagentsJson as Reagent[];
export const REACTIONS: Reaction[] = reactionsJson as Reaction[];
export const TAGS: MistakeTag[] = tagsJson as MistakeTag[];
export const ITEMS: QuestionItem[] = Object.values(questionModules)
  .flatMap((m) => m.default)
  .filter((q) => !q.review && !!q.target.smiles);

const reagentById = new Map(REAGENTS.map((r) => [r.id, r]));
const reactionById = new Map(REACTIONS.map((r) => [r.id, r]));
const tagById = new Map(TAGS.map((t) => [t.id, t]));
const itemsByReaction = new Map<string, QuestionItem[]>();
for (const item of ITEMS) {
  for (const rid of item.reactionIds) {
    const list = itemsByReaction.get(rid) ?? [];
    list.push(item);
    itemsByReaction.set(rid, list);
  }
}

export function getReagent(id: string): Reagent {
  const r = reagentById.get(id);
  if (!r) throw new Error(`unknown reagent ${id}`);
  return r;
}
export function getReaction(id: string): Reaction {
  const r = reactionById.get(id);
  if (!r) throw new Error(`unknown reaction ${id}`);
  return r;
}
export function getTag(id: string): MistakeTag {
  return tagById.get(id) ?? { id, label: id, rule: '' };
}
export function itemsForReaction(id: string): QuestionItem[] {
  return itemsByReaction.get(id) ?? [];
}
/** Reactions that have at least one playable item, optionally restricted by chapter toggles. */
export function playableReactions(chapters: Record<string, boolean> = {}): Reaction[] {
  return REACTIONS.filter((r) => (itemsByReaction.get(r.id)?.length ?? 0) > 0 && chapters[String(r.chapter)] !== false);
}
export function reactionsForChapter(ch: Chapter): Reaction[] {
  return REACTIONS.filter((r) => r.chapter === ch);
}
export function orderTypeLabel(t: string): string {
  return (
    {
      make_it: 'Make it',
      predict_product: 'What do I get?',
    } as Record<string, string>
  )[t] ?? t;
}
