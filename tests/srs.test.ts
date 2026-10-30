import { describe, expect, it } from 'vitest';
import { applyResult, capInterval, DAY, newRecord, seeded } from '../src/mastery/srs';
import { newSession, noteResult, noteServed, pickNext } from '../src/mastery/scheduler';
import { playableReactions, REACTIONS } from '../src/content/bank';
import { SEEDS } from '../src/mastery/seeds';
import { mulberry32 } from '../src/util/rng';

describe('SRS state machine', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  it('miss -> missed, due now, back in 3 orders', () => {
    const r = applyResult(newRecord(), { correct: false, hinted: false }, now);
    expect(r.state).toBe('missed');
    expect(r.dueAt).toBe(now);
    expect(r.sessionGap).toBe(3);
  });
  it('first-try hit -> solid, 4 days, then doubling', () => {
    let r = applyResult(newRecord(), { correct: true, hinted: false }, now);
    expect(r.state).toBe('solid');
    expect(r.intervalDays).toBe(4);
    expect(r.sessionGap).toBeUndefined();
    r = applyResult(r, { correct: true, hinted: false }, now + 4 * DAY);
    expect(r.intervalDays).toBe(8);
    r = applyResult(r, { correct: true, hinted: false }, now + 12 * DAY);
    expect(r.intervalDays).toBe(16);
  });
  it('hinted hit or first hit after a miss -> shaky, 2 days, back in 8 orders', () => {
    const hinted = applyResult(newRecord(), { correct: true, hinted: true }, now);
    expect(hinted.state).toBe('shaky');
    expect(hinted.intervalDays).toBe(2);
    expect(hinted.sessionGap).toBe(8);
    const missed = applyResult(newRecord(), { correct: false, hinted: false }, now);
    const recovered = applyResult(missed, { correct: true, hinted: false }, now + DAY);
    expect(recovered.state).toBe('shaky');
  });
  it('caps intervals before the exam', () => {
    expect(capInterval(16, now, '2026-11-01')).toBe(2); // 5.5 days away -> floor(5.5 / 2)
    expect(capInterval(16, now, '2026-10-27')).toBe(1);
    expect(capInterval(16, now, undefined)).toBe(16);
    const r = applyResult({ ...newRecord(), state: 'solid', intervalDays: 8 }, { correct: true, hinted: false }, now, '2026-11-01');
    expect(r.intervalDays).toBe(2);
  });
});

describe('scheduler', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  const playable = REACTIONS.filter((r) => r.phase === 1);
  const opts = { allowedTypes: ['make_it', 'predict_product'] as const, now, rng: mulberry32(3) };
  it('serves missed before shaky before new before solid', () => {
    const mastery = {
      R2: { ...newRecord(), state: 'solid' as const, dueAt: now + 3 * DAY, lastSeenAt: now },
      R5: { ...newRecord(), state: 'shaky' as const, dueAt: now + DAY, lastSeenAt: now, seen: 2, correct: 1 },
      P1: { ...newRecord(), state: 'missed' as const, dueAt: now, lastSeenAt: now - DAY, seen: 1 },
    };
    const session = newSession();
    const p1 = pickNext(playable, mastery, session, { ...opts, allowedTypes: [...opts.allowedTypes] });
    expect(p1?.reaction.id).toBe('P1');
    expect(p1?.bucket).toBe('overdue');
    noteServed(session, 'P1', p1!.item.id);
    const p2 = pickNext(playable, mastery, session, { ...opts, allowedTypes: [...opts.allowedTypes] });
    expect(p2?.reaction.id).toBe('R5');
  });
  it('re-tests a miss after the session gap with the same item', () => {
    const session = newSession();
    const mastery: Record<string, ReturnType<typeof newRecord>> = {};
    const first = pickNext(playable, mastery, session, { ...opts, allowedTypes: [...opts.allowedTypes] })!;
    noteServed(session, first.reaction.id, first.item.id);
    const missed = applyResult(newRecord(), { correct: false, hinted: false }, now);
    mastery[first.reaction.id] = missed;
    noteResult(session, first.reaction.id, first.item.id, missed);
    // two other orders go by
    for (let i = 0; i < 2; i++) {
      const p = pickNext(playable, mastery, session, { ...opts, allowedTypes: [...opts.allowedTypes] })!;
      expect(p.retest).toBe(false);
      noteServed(session, p.reaction.id, p.item.id);
    }
    const retest = pickNext(playable, mastery, session, { ...opts, allowedTypes: [...opts.allowedTypes] })!;
    expect(retest.retest).toBe(true);
    expect(retest.item.id).toBe(first.item.id);
  });
  it('weakness clinic keeps cycling weak reactions before new ones', () => {
    const mastery = {
      R5: { ...newRecord(), state: 'shaky' as const, dueAt: now + DAY, lastSeenAt: now, seen: 2, correct: 1 },
      P1: { ...newRecord(), state: 'missed' as const, dueAt: now, lastSeenAt: now - DAY, seen: 1 },
    };
    const session = newSession();
    const served: string[] = [];
    for (let i = 0; i < 6; i++) {
      const p = pickNext(playable, mastery, session, { ...opts, allowedTypes: [...opts.allowedTypes], weakOnly: true })!;
      served.push(p.reaction.id);
      noteServed(session, p.reaction.id, p.item.id);
    }
    expect(served.every((id) => id === 'R5' || id === 'P1')).toBe(true);
  });
  it('does not repeat an item within a session', () => {
    const session = newSession();
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const p = pickNext(playable, {}, session, { ...opts, allowedTypes: [...opts.allowedTypes] });
      if (!p) break;
      expect(seen.has(p.item.id)).toBe(false);
      seen.add(p.item.id);
      noteServed(session, p.reaction.id, p.item.id);
    }
    expect(seen.size).toBeGreaterThan(30);
  });
  it('serves a seeded weak spot as a single step until it has been played', () => {
    const all = playableReactions();
    const fresh = Object.fromEntries(SEEDS.map((sd) => [sd.reactionId, seeded(sd.state, now)]));
    const played = Object.fromEntries(Object.entries(fresh).map(([id, r]) => [id, { ...r, seen: 2, correct: 1, lastSeenAt: now - DAY }]));
    const types = (mastery: typeof fresh) => {
      const out = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) {
        const p = pickNext(all, mastery, newSession(), { allowedTypes: ['make_it', 'synthesis'], synthesisChance: 0.4, now, rng: mulberry32(seed) });
        if (p) out.add(p.type);
      }
      return out;
    };
    expect([...types(fresh)]).toEqual(['make_it']);
    expect(types(played).has('synthesis')).toBe(true);
  });
});
