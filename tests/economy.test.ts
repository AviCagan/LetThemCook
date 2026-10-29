import { describe, it, expect } from 'vitest';
import { emptySave, type HistoryEntry, type SaveData } from '../src/save/types';
import { buy, ensureLedger, recomputeCoins, trimHistory } from '../src/save/economy';
import { mergeSaves } from '../src/save/merge';

const order = (t: number, coins: number, item = `q-${t}`): HistoryEntry => ({ t, item, type: 'make_it', reaction: 'R2', ok: true, tags: [], stars: 3, hinted: false, mode: 'shift', seconds: 30, coins });

function device(id: string): SaveData {
  const s = emptySave(1000);
  s.deviceId = id;
  ensureLedger(s);
  return s;
}

describe('coin ledger', () => {
  it('turns an old save balance into legacy coins', () => {
    const s = emptySave(1000);
    s.economy.coins = 120;
    delete (s.economy as { legacyCoins?: number }).legacyCoins;
    ensureLedger(s);
    expect(s.economy.legacyCoins).toBe(120);
    expect(s.economy.coins).toBe(120);
  });

  it('balance = earned - spent, and buying twice is refused', () => {
    const s = device('a');
    s.history.push(order(1, 30), order(2, 25));
    expect(recomputeCoins(s)).toBe(55);
    expect(buy(s, 'pet_hamster', 50, 3)).toBe(true);
    expect(s.economy.coins).toBe(5);
    expect(buy(s, 'pet_hamster', 50, 4)).toBe(false);
    expect(buy(s, 'pet_slime', 50, 4)).toBe(false); // too expensive
  });

  it('keeps trimmed orders as legacy coins', () => {
    const s = device('a');
    for (let i = 0; i < 10; i++) s.history.push(order(i, 10));
    trimHistory(s, 4);
    expect(s.history).toHaveLength(4);
    expect(recomputeCoins(s)).toBe(100);
  });

  it('merging two devices that each earned and spent gives the exact balance', () => {
    const base = device('phone');
    base.history.push(order(1, 40));
    ensureLedger(base);
    const phone = structuredClone(base);
    const laptop = structuredClone(base);
    laptop.deviceId = 'laptop';
    phone.history.push(order(10, 30));
    phone.updatedAt = 10;
    expect(buy(phone, 'rug_lavender', 60, 11)).toBe(true); // 40 + 30 - 60 = 10
    laptop.history.push(order(20, 25));
    laptop.updatedAt = 20;
    expect(buy(laptop, 'plant_cactus', 50, 21)).toBe(true); // 40 + 25 - 50 = 15
    const merged = mergeSaves(phone, laptop);
    // 40 + 30 + 25 earned, 60 + 50 spent
    expect(merged.economy.coins).toBe(0); // 95 earned - 110 spent, floored at zero
    expect(merged.economy.purchases!.map((p) => p.id).sort()).toEqual(['plant_cactus', 'rug_lavender']);
    expect(merged.economy.unlocked).toContain('rug_lavender');
    expect(merged.economy.unlocked).toContain('plant_cactus');
    expect(merged.deviceId).toBe('phone');
    expect(mergeSaves(laptop, phone).deviceId).toBe('laptop');
  });

  it('a purchase made on both devices is only charged once', () => {
    const a = device('a');
    a.history.push(order(1, 100));
    const b = structuredClone(a);
    b.deviceId = 'b';
    buy(a, 'pet_axo', 80, 5);
    buy(b, 'pet_axo', 80, 7);
    const m = mergeSaves(a, b);
    expect(m.economy.purchases).toHaveLength(1);
    expect(m.economy.coins).toBe(20);
  });
});
