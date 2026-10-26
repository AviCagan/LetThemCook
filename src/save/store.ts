// IndexedDB persistence (idb-keyval) with a localStorage fallback for private windows.
import { get, set } from 'idb-keyval';
import { emptySave, type SaveData } from './types';
import { validateSave } from './codec';
import { nextExam } from '../content/course';

const KEY = 'beaker-buddies:save:v1';

export async function loadSave(): Promise<SaveData> {
  try {
    const data = await get<SaveData>(KEY);
    if (data) return withExamDefault(migrate(validateSave(data)));
  } catch {
    /* fall through to localStorage */
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return withExamDefault(migrate(validateSave(JSON.parse(raw))));
  } catch {
    /* ignore */
  }
  return withExamDefault(emptySave());
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
    economy: { ...base.economy, ...save.economy },
    stats: { ...base.stats, ...save.stats },
  };
}
