// Decides which reaction (and which item) the next customer brings.
// Priority: session re-tests -> overdue reviews -> recent Missed -> weakest Shaky -> unseen -> Solid maintenance.
import type { OrderType, QuestionItem, Reaction } from '../content/types';
import { itemsForReaction } from '../content/bank';
import { accuracy, isOverdue, type MasteryRecord, newRecord } from './srs';
import { pick, type Rng } from '../util/rng';

export interface SessionState {
  orderIndex: number;
  servedReactions: Record<string, number>; // reactionId -> order index last served
  servedItems: Set<string>;
  /** reactionId -> { dueAt order index, itemId to re-test } */
  retests: Record<string, { due: number; itemId: string }>;
}

export function newSession(): SessionState {
  return { orderIndex: 0, servedReactions: {}, servedItems: new Set(), retests: {} };
}

export type Bucket = 'retest' | 'overdue' | 'missed' | 'shaky' | 'new' | 'solid';

export interface Pick {
  reaction: Reaction;
  item: QuestionItem;
  type: OrderType;
  bucket: Bucket;
  retest: boolean;
}

export interface SchedulerOptions {
  allowedTypes: OrderType[];
  now: number;
  rng: Rng;
  /** restrict to these reactions (practice mode) */
  only?: string[];
  /** weakness clinic: skip the 'new' and 'solid' buckets unless nothing else is left */
  weakOnly?: boolean;
  /** 0..1: how often a shaky/solid reaction is served as a multi-step synthesis instead of a single step */
  synthesisChance?: number;
  /** extra per-item filter (e.g. drop multi-step orders that touch a switched-off chapter) */
  itemFilter?: (q: QuestionItem) => boolean;
  /** relative weights when an item supports several order types */
  typeWeights?: Partial<Record<OrderType, number>>;
  /** prefer items at or below this difficulty (the rising curve of a shift) */
  maxDifficulty?: number;
  /** prefer items whose traps / flaws carry these mistake tags (weakness clinic) */
  preferTags?: string[];
}

export const DEFAULT_TYPE_WEIGHTS: Record<OrderType, number> = {
  make_it: 0.45,
  synthesis: 0.45,
  predict_product: 0.18,
  what_start: 0.12,
  spot_flaw: 0.13,
  name_it: 0.12,
};

function itemTags(q: QuestionItem): string[] {
  return [...(q.traps ?? []).map((t) => t.tag), ...(q.flaws ?? []).map((f) => f.tag)];
}

export function pickNext(
  reactions: Reaction[],
  mastery: Record<string, MasteryRecord>,
  session: SessionState,
  opts: SchedulerOptions,
): Pick | undefined {
  const pool = opts.only ? reactions.filter((r) => opts.only!.includes(r.id)) : reactions;
  const rec = (id: string) => mastery[id] ?? newRecord();
  const servedThisSession = (id: string) => session.servedReactions[id] !== undefined;

  // 1. deliberate re-tests of this session's misses
  const retestIds = Object.entries(session.retests)
    .filter(([id, r]) => r.due <= session.orderIndex && pool.some((p) => p.id === id))
    .map(([id]) => id);
  if (retestIds.length) {
    const id = retestIds.sort((a, b) => session.retests[a].due - session.retests[b].due)[0];
    const reaction = pool.find((p) => p.id === id)!;
    const item = itemsForReaction(id).find((q) => q.id === session.retests[id].itemId) ?? pickItem(reaction, session, opts, rec(id));
    if (item) {
      const type = pickType(item, opts);
      if (type) return { reaction, item, type, bucket: 'retest', retest: true };
    }
  }

  const fresh = pool.filter((r) => !servedThisSession(r.id));
  const buckets: { name: Bucket; list: Reaction[] }[] = [
    { name: 'overdue', list: fresh.filter((r) => isOverdue(rec(r.id), opts.now)).sort((a, b) => rec(a.id).dueAt - rec(b.id).dueAt) },
    { name: 'missed', list: fresh.filter((r) => rec(r.id).state === 'missed').sort((a, b) => rec(b.id).lastSeenAt - rec(a.id).lastSeenAt) },
    { name: 'shaky', list: fresh.filter((r) => rec(r.id).state === 'shaky').sort((a, b) => accuracy(rec(a.id)) - accuracy(rec(b.id))) },
    { name: 'new', list: fresh.filter((r) => rec(r.id).state === 'new') },
    { name: 'solid', list: fresh.filter((r) => rec(r.id).state === 'solid').sort((a, b) => rec(a.id).dueAt - rec(b.id).dueAt) },
  ];
  const tryBucket = (b: { name: Bucket; list: Reaction[] }): Pick | undefined => {
    // among the top few of a bucket, pick randomly so shifts are not identical day to day
    const top = b.list.slice(0, b.name === 'new' ? b.list.length : 3);
    for (const reaction of shuffleStable(top, opts.rng)) {
      const item = pickItem(reaction, session, opts, rec(reaction.id));
      if (!item) continue;
      const type = pickType(item, opts);
      if (!type) continue;
      return { reaction, item, type, bucket: b.name, retest: false };
    }
    return undefined;
  };
  const weakBuckets = buckets.slice(0, 3);
  for (const b of weakBuckets) {
    const hit = tryBucket(b);
    if (hit) return hit;
  }
  if (opts.weakOnly) {
    // clinic: keep cycling weak reactions (with items not yet served) before touching new or solid ones
    const weakAll = pool.filter((r) => rec(r.id).state === 'missed' || rec(r.id).state === 'shaky' || isOverdue(rec(r.id), opts.now));
    const hit = tryBucket({ name: 'shaky', list: shuffleStable(weakAll, opts.rng) });
    if (hit) return hit;
  }
  for (const b of buckets.slice(3)) {
    const hit = tryBucket(b);
    if (hit) return hit;
  }
  // everything served this session: allow repeats of reactions (but not items) when the shift is long
  for (const reaction of shuffleStable(pool, opts.rng)) {
    const item = pickItem(reaction, session, opts, rec(reaction.id));
    if (!item) continue;
    const type = pickType(item, opts);
    if (type) return { reaction, item, type, bucket: 'solid', retest: false };
  }
  return undefined;
}

function pickItem(reaction: Reaction, session: SessionState, opts: SchedulerOptions, record: MasteryRecord = newRecord()): QuestionItem | undefined {
  const candidates = itemsForReaction(reaction.id).filter(
    (q) => !session.servedItems.has(q.id) && (q.orderTypes ?? ['make_it']).some((t) => opts.allowedTypes.includes(t)) && (opts.itemFilter?.(q) ?? true),
  );
  if (!candidates.length) return undefined;
  const isSyn = (q: QuestionItem) => (q.orderTypes ?? ['make_it']).includes('synthesis');
  const prefer = (list: QuestionItem[]): QuestionItem => {
    let pool = list;
    if (opts.maxDifficulty !== undefined) {
      const easy = pool.filter((q) => q.difficulty <= opts.maxDifficulty!);
      if (easy.length) pool = easy;
    }
    if (opts.preferTags?.length && opts.rng() < 0.7) {
      const hit = pool.filter((q) => itemTags(q).some((t) => opts.preferTags!.includes(t)));
      if (hit.length) pool = hit;
    }
    return pick(opts.rng, pool);
  };
  const singles = candidates.filter((q) => !isSyn(q));
  const multis = candidates.filter(isSyn);
  if (!singles.length) return prefer(multis);
  if (!multis.length) return prefer(singles);
  // multi-step orders once the reaction is past 'new' / 'missed' (singles first), then by chance.
  // A seeded weak spot starts 'shaky' without ever being played, so it also needs one real attempt.
  const wantMulti = (record.state === 'shaky' || record.state === 'solid') && record.seen > 0 && opts.rng() < (opts.synthesisChance ?? 0);
  return prefer(wantMulti ? multis : singles);
}

function pickType(item: QuestionItem, opts: SchedulerOptions): OrderType | undefined {
  const types = (item.orderTypes ?? ['make_it']).filter((t) => opts.allowedTypes.includes(t));
  if (!types.length) return undefined;
  const w = { ...DEFAULT_TYPE_WEIGHTS, ...opts.typeWeights };
  const total = types.reduce((n, t) => n + (w[t] ?? 0.1), 0);
  let r = opts.rng() * total;
  for (const t of types) {
    r -= w[t] ?? 0.1;
    if (r <= 0) return t;
  }
  return types[types.length - 1];
}

function shuffleStable<T>(arr: T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Record that an order was served and, on a miss, schedule the in-session re-test. */
export function noteServed(session: SessionState, reactionId: string, itemId: string): void {
  session.servedReactions[reactionId] = session.orderIndex;
  session.servedItems.add(itemId);
  session.orderIndex += 1;
}

export function noteResult(session: SessionState, reactionId: string, itemId: string, rec: MasteryRecord): void {
  if (rec.sessionGap !== undefined) {
    session.retests[reactionId] = { due: session.orderIndex + rec.sessionGap - 1, itemId };
    session.servedItems.delete(itemId); // a deliberate re-test may repeat the exact item
  } else {
    delete session.retests[reactionId];
  }
}
