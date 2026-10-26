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
    const item = itemsForReaction(id).find((q) => q.id === session.retests[id].itemId) ?? pickItem(reaction, session, opts);
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
  const ordered = opts.weakOnly ? [...buckets.slice(0, 3), ...buckets.slice(3)] : buckets;
  for (const b of ordered) {
    // among the top few of a bucket, pick randomly so shifts are not identical day to day
    const top = b.list.slice(0, b.name === 'new' ? b.list.length : 3);
    for (const reaction of shuffleStable(top, opts.rng)) {
      const item = pickItem(reaction, session, opts);
      if (!item) continue;
      const type = pickType(item, opts);
      if (!type) continue;
      return { reaction, item, type, bucket: b.name, retest: false };
    }
  }
  // everything served this session: allow repeats of reactions (but not items) when the shift is long
  for (const reaction of shuffleStable(pool, opts.rng)) {
    const item = pickItem(reaction, session, opts);
    if (!item) continue;
    const type = pickType(item, opts);
    if (type) return { reaction, item, type, bucket: 'solid', retest: false };
  }
  return undefined;
}

function pickItem(reaction: Reaction, session: SessionState, opts: SchedulerOptions): QuestionItem | undefined {
  const candidates = itemsForReaction(reaction.id).filter(
    (q) => !session.servedItems.has(q.id) && q.orderTypes.some((t) => opts.allowedTypes.includes(t)),
  );
  if (!candidates.length) return undefined;
  return pick(opts.rng, candidates);
}

function pickType(item: QuestionItem, opts: SchedulerOptions): OrderType | undefined {
  const types = item.orderTypes.filter((t) => opts.allowedTypes.includes(t));
  return types.length ? pick(opts.rng, types) : undefined;
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
