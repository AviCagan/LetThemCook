// Merge two saves record by record (later wins). Used by import and by cloud sync.
// `a` is this device's save: the result keeps a's deviceId.
import type { SaveData } from './types';
import { ensureLedger, mergePurchases, recomputeCoins } from './economy';

export function mergeSaves(a: SaveData, b: SaveData): SaveData {
  ensureLedger(a);
  ensureLedger(b);
  const [older, newer] = a.updatedAt <= b.updatedAt ? [a, b] : [b, a];
  const out: SaveData = JSON.parse(JSON.stringify(newer));
  out.createdAt = Math.min(a.createdAt, b.createdAt);
  out.profile.seededReactions = uniq([...a.profile.seededReactions, ...b.profile.seededReactions]);
  for (const [id, rec] of Object.entries(older.mastery.reactions)) {
    const cur = out.mastery.reactions[id];
    if (!cur || rec.lastSeenAt > cur.lastSeenAt) out.mastery.reactions[id] = rec;
  }
  for (const [id, rec] of Object.entries(older.mastery.reagents)) {
    const cur = out.mastery.reagents[id];
    if (!cur || rec.lastSeenAt > cur.lastSeenAt) out.mastery.reagents[id] = rec;
  }
  const seen = new Set(out.history.map((h) => `${h.t}:${h.item}`));
  for (const h of older.history) {
    const key = `${h.t}:${h.item}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.history.push(h);
    }
  }
  out.history.sort((x, y) => x.t - y.t);
  out.notes = { ...older.notes, ...newer.notes };
  const seenBook = new Set(out.labBook.map((b) => `${b.t}:${b.item}`));
  for (const b of older.labBook) {
    const key = `${b.t}:${b.item}`;
    if (!seenBook.has(key)) {
      seenBook.add(key);
      out.labBook.push(b);
    }
  }
  out.labBook.sort((x, y) => x.t - y.t);
  out.deviceId = a.deviceId;
  out.economy.legacyCoins = Math.max(a.economy.legacyCoins ?? 0, b.economy.legacyCoins ?? 0);
  out.economy.purchases = mergePurchases(a.economy.purchases, b.economy.purchases);
  out.economy.unlocked = uniq([...a.economy.unlocked, ...b.economy.unlocked, ...out.economy.purchases.map((p) => p.id)]);
  out.economy.equipped = { ...older.economy.equipped, ...newer.economy.equipped };
  recomputeCoins(out);
  out.stats.shiftsPlayed = Math.max(a.stats.shiftsPlayed, b.stats.shiftsPlayed);
  out.stats.bestStreak = Math.max(a.stats.bestStreak, b.stats.bestStreak);
  out.updatedAt = Math.max(a.updatedAt, b.updatedAt);
  return out;
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
