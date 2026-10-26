import type { HistoryEntry } from '../save/types';

export interface TagStat {
  tag: string;
  count: number;
  examples: HistoryEntry[];
}

export function topTags(history: HistoryEntry[], n = 5): TagStat[] {
  const map = new Map<string, TagStat>();
  for (const h of history) {
    for (const tag of h.tags) {
      const s = map.get(tag) ?? { tag, count: 0, examples: [] };
      s.count += 1;
      if (s.examples.length < 3) s.examples.push(h);
      map.set(tag, s);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, n);
}

export interface DayStat {
  day: string;
  orders: number;
  correct: number;
}

export function accuracyByDay(history: HistoryEntry[], days = 14): DayStat[] {
  const out = new Map<string, DayStat>();
  for (const h of history) {
    const day = new Date(h.t).toISOString().slice(0, 10);
    const s = out.get(day) ?? { day, orders: 0, correct: 0 };
    s.orders += 1;
    if (h.ok) s.correct += 1;
    out.set(day, s);
  }
  return [...out.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-days);
}

export function currentStreak(history: HistoryEntry[]): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (!history[i].ok) break;
    n++;
  }
  return n;
}

export function bestStreak(history: HistoryEntry[]): number {
  let best = 0;
  let run = 0;
  for (const h of history) {
    run = h.ok ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

export function overallAccuracy(history: HistoryEntry[]): number {
  if (!history.length) return 0;
  return history.filter((h) => h.ok).length / history.length;
}
