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
}

export interface Settings {
  mute: boolean;
  reducedMotion: boolean;
  hintsEnabled: boolean;
  shiftLength: number;
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
  };
  mastery: {
    reactions: Record<string, MasteryRecord>;
    reagents: Record<string, ReagentRecord>;
  };
  history: HistoryEntry[];
  economy: {
    coins: number;
    unlocked: string[];
    equipped: Record<string, string>;
  };
  stats: {
    shiftsPlayed: number;
    bestStreak: number;
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
      settings: { mute: false, reducedMotion: false, hintsEnabled: true, shiftLength: 10 },
      seededReactions: [],
    },
    mastery: { reactions: {}, reagents: {} },
    history: [],
    economy: { coins: 0, unlocked: [], equipped: {} },
    stats: { shiftsPlayed: 0, bestStreak: 0 },
  };
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}
