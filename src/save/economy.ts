// Coin ledger. The balance is derived, never just stored, so two devices that each earned and spent
// coins merge to the exact right total: legacy coins + coins earned by every order in history - purchases.
import type { Purchase, SaveData } from './types';

export function earned(save: SaveData): number {
  let n = save.economy.legacyCoins ?? 0;
  for (const h of save.history) n += h.coins ?? 0;
  return n;
}

export function spent(save: SaveData): number {
  return (save.economy.purchases ?? []).reduce((n, p) => n + p.cost, 0);
}

/** Recompute the cached balance from the ledger (never below zero). */
export function recomputeCoins(save: SaveData): number {
  save.economy.coins = Math.max(0, earned(save) - spent(save));
  return save.economy.coins;
}

/** Older saves: everything not attributable to an order becomes legacy coins. */
export function ensureLedger(save: SaveData): void {
  save.economy.purchases ??= [];
  if (save.economy.legacyCoins === undefined) {
    const fromHistory = save.history.reduce((n, h) => n + (h.coins ?? 0), 0);
    save.economy.legacyCoins = Math.max(0, save.economy.coins - fromHistory + spent(save));
  }
  recomputeCoins(save);
}

/** Before history is trimmed, keep the trimmed orders' coins as legacy coins. */
export function trimHistory(save: SaveData, max: number): void {
  if (save.history.length <= max) return;
  const cut = save.history.splice(0, save.history.length - max);
  save.economy.legacyCoins = (save.economy.legacyCoins ?? 0) + cut.reduce((n, h) => n + (h.coins ?? 0), 0);
}

export function mergePurchases(a: Purchase[] = [], b: Purchase[] = []): Purchase[] {
  const out = new Map<string, Purchase>();
  for (const p of [...a, ...b]) {
    const cur = out.get(p.id);
    if (!cur || p.t < cur.t) out.set(p.id, p);
  }
  return [...out.values()].sort((x, y) => x.t - y.t);
}

/** Buy a shop item. Returns false if already owned or too expensive. */
export function buy(save: SaveData, id: string, cost: number, now = Date.now()): boolean {
  ensureLedger(save);
  if (save.economy.unlocked.includes(id) || save.economy.purchases!.some((p) => p.id === id)) return false;
  if (recomputeCoins(save) < cost) return false;
  save.economy.purchases!.push({ id, cost, t: now });
  save.economy.unlocked.push(id);
  recomputeCoins(save);
  return true;
}
