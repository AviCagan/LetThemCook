import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave, fromBase64Url, toBase64Url } from '../src/save/codec';
import { mergeSaves } from '../src/save/merge';
import { emptySave } from '../src/save/types';

describe('save codec', () => {
  it('round-trips base64url', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });
  it('encodes and decodes a save', async () => {
    const s = emptySave(1000);
    s.economy.coins = 42;
    const code = await encodeSave(s);
    expect(code.startsWith('BB')).toBe(true);
    const back = await decodeSave(code);
    expect(back.economy.coins).toBe(42);
    expect(back.deviceId).toBe(s.deviceId);
  });
  it('rejects junk', async () => {
    await expect(decodeSave('hello')).rejects.toThrow();
  });
});

describe('merge', () => {
  it('keeps the newer record per reaction and unions history', () => {
    const a = emptySave(1000);
    const b = emptySave(1000);
    a.updatedAt = 5000;
    b.updatedAt = 6000;
    a.mastery.reactions.R2 = { state: 'solid', dueAt: 1, intervalDays: 4, seen: 3, correct: 3, firstTry: 3, lastSeenAt: 4000 };
    b.mastery.reactions.R2 = { state: 'missed', dueAt: 1, intervalDays: 0, seen: 1, correct: 0, firstTry: 0, lastSeenAt: 3000 };
    a.history.push({ t: 1, item: 'x', type: 'make_it', reaction: 'R2', ok: true, tags: [], stars: 3, hinted: false, mode: 'shift', seconds: 10 });
    b.history.push({ t: 2, item: 'y', type: 'make_it', reaction: 'R2', ok: false, tags: ['over_reduction'], stars: 0, hinted: false, mode: 'shift', seconds: 10 });
    // saves from before the coin ledger: the stored balance becomes legacy coins
    a.economy.coins = 10;
    b.economy.coins = 7;
    delete a.economy.legacyCoins;
    delete b.economy.legacyCoins;
    const m = mergeSaves(a, b);
    expect(m.mastery.reactions.R2.state).toBe('solid');
    expect(m.history.map((h) => h.item)).toEqual(['x', 'y']);
    expect(m.economy.coins).toBe(10);
    expect(m.updatedAt).toBe(6000);
  });
});
