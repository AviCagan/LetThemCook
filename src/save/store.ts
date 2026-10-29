// IndexedDB persistence (idb-keyval) with a localStorage fallback for private windows.
import { get, set } from 'idb-keyval';
import { emptySave, type SaveData } from './types';
import { validateSave } from './codec';
import { nextExam } from '../content/course';
import { ensureLedger } from './economy';

const KEY = 'beaker-buddies:save:v1';

/** Validate, migrate to the current shape and fill defaults: for anything loaded, imported or pulled from the cloud. */
export function normalizeSave(data: unknown): SaveData {
  const s = withExamDefault(migrate(validateSave(data)));
  ensureLedger(s);
  return s;
}

export async function loadSave(): Promise<SaveData> {
  try {
    const data = await get<SaveData>(KEY);
    if (data) return normalizeSave(data);
  } catch {
    /* fall through to localStorage */
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeSave(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  const fresh = withExamDefault(emptySave());
  ensureLedger(fresh);
  return fresh;
}

type PersistListener = (save: SaveData) => void;
const listeners = new Set<PersistListener>();
/** Called after every persist (cloud sync uses it to schedule an upload). */
export function onPersist(fn: PersistListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** First run: point the SRS cap at the next exam on the course schedule. */
function withExamDefault(save: SaveData): SaveData {
  if (!save.profile.examDate) {
    const exam = nextExam();
    if (exam) save.profile.examDate = exam.date;
  }
  return save;
}

let pending: ReturnType<typeof setTimeout> | undefined;
let latest: SaveData | undefined;

export function persistSave(save: SaveData, immediate = false): void {
  latest = save;
  save.updatedAt = Date.now();
  if (pending) clearTimeout(pending);
  const write = () => {
    pending = undefined;
    const snapshot = latest!;
    set(KEY, snapshot).catch(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(snapshot));
      } catch {
        /* storage unavailable */
      }
    });
  };
  if (immediate) write();
  else pending = setTimeout(write, 300);
  listeners.forEach((fn) => fn(save));
}

export async function flushSave(): Promise<void> {
  if (pending && latest) {
    clearTimeout(pending);
    pending = undefined;
    await set(KEY, latest).catch(() => undefined);
  }
}

function migrate(save: SaveData): SaveData {
  // schemaVersion 1 is current. Future versions: migrate step by step here.
  const base = emptySave();
  return {
    ...base,
    ...save,
    profile: { ...base.profile, ...save.profile, settings: { ...base.profile.settings, ...save.profile.settings } },
    mastery: { reactions: save.mastery.reactions ?? {}, reagents: save.mastery.reagents ?? {} },
    notes: save.notes ?? {},
    labBook: save.labBook ?? [],
    economy: { ...base.economy, ...save.economy },
    stats: { ...base.stats, ...save.stats },
  };
}
