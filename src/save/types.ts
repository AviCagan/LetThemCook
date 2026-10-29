import type { OrderType } from '../content/types';
import type { MasteryRecord, ReagentRecord } from '../mastery/srs';

export interface HistoryEntry {
  t: number;
  item: string;
  type: OrderType;
  reaction: string;
  ok: boolean;
  tags: string[];
  stars: number;
  hinted: boolean;
  mode: string;
  seconds: number;
  /** coins earned by this order (absent on saves from before the coin ledger) */
  coins?: number;
}

export interface Purchase {
  /** shop item id */
  id: string;
  cost: number;
  t: number;
}

export interface LabBookStep {
  reagent: string;
  conditions?: import('../content/types').Conditions;
  before: string;
  after: string;
  changed: boolean;
  label: string;
  kind: 'step' | 'undo' | 'reset';
}

export interface LabBookEntry {
  /** order type (absent = make_it) */
  type?: import('../content/types').OrderType;
  /** quiz answer the player gave (SMILES, name, or "route A") */
  picked?: string;
  t: number;
  item: string;
  startSmiles: string;
  startName: string;
  targetSmiles: string;
  targetName: string;
  ok: boolean;
  stars: number;
  steps: LabBookStep[];
  finalSmiles: string;
  tags: string[];
  note?: string;
}

export interface Settings {
  mute: boolean;
  reducedMotion: boolean;
  hintsEnabled: boolean;
  shiftLength: number;
  /** 'auto' follows the OS setting */
  theme: 'auto' | 'light' | 'dark';
  /** exam mode: number of orders and time limit (0 = untimed) */
  examLength?: number;
  examMinutes?: number;
  /** rush hour length in minutes */
  rushMinutes?: number;
}

export interface SaveData {
  schemaVersion: 1;
  deviceId: string;
  createdAt: number;
  updatedAt: number;
  profile: {
    name: string;
    examDate?: string; // YYYY-MM-DD
    chapters: Record<string, boolean>;
    settings: Settings;
    seededReactions: string[];
    /** YYYY-MM-DD of the last daily-special customer */
    lastDailySpecial?: string;
  };
  mastery: {
    reactions: Record<string, MasteryRecord>;
    reagents: Record<string, ReagentRecord>;
  };
  history: HistoryEntry[];
  /** free-text notes per item id */
  notes: Record<string, string>;
  /** every order played, with all its steps */
  labBook: LabBookEntry[];
  economy: {
    /** cached balance; always legacyCoins + coins earned in history - purchases (see save/economy.ts) */
    coins: number;
    unlocked: string[];
    /** slot -> shop item id (bench, hood, plant, pet, rug, poster, ...) */
    equipped: Record<string, string>;
    purchases?: Purchase[];
    /** coins earned before per-order coins were recorded, or by orders trimmed out of history */
    legacyCoins?: number;
  };
  stats: {
    shiftsPlayed: number;
    bestStreak: number;
    /** how often the target structure was revealed on the request card */
    reveals?: number;
  };
}

export function emptySave(now = Date.now()): SaveData {
  return {
    schemaVersion: 1,
    deviceId: makeId(),
    createdAt: now,
    updatedAt: now,
    profile: {
      name: 'Avi',
      chapters: { '16': true, '17': true },
      settings: { mute: false, reducedMotion: false, hintsEnabled: true, shiftLength: 10, theme: 'auto', examLength: 25, examMinutes: 50, rushMinutes: 5 },
      seededReactions: [],
    },
    mastery: { reactions: {}, reagents: {} },
    history: [],
    notes: {},
    labBook: [],
    economy: { coins: 0, unlocked: [], equipped: {}, purchases: [], legacyCoins: 0 },
    stats: { shiftsPlayed: 0, bestStreak: 0 },
  };
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}
