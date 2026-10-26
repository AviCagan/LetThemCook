// Spaced-repetition state machine per reaction (and, more loosely, per reagent card).
// States and intervals follow the tutor's drill rules (see docs/PLAN.md §5).

export type MasteryState = 'new' | 'missed' | 'shaky' | 'solid';

export interface MasteryRecord {
  state: MasteryState;
  /** epoch ms when the next review is due */
  dueAt: number;
  intervalDays: number;
  seen: number;
  correct: number;
  firstTry: number;
  lastSeenAt: number;
  lastResult?: 'hit' | 'miss' | 'hint';
  /** orders to wait before re-testing in the current session; undefined = not again this session */
  sessionGap?: number;
}

export interface ResultInput {
  correct: boolean;
  /** a hint was used or the answer came on a retry */
  hinted: boolean;
}

export const DAY = 24 * 60 * 60 * 1000;

export function newRecord(): MasteryRecord {
  return { state: 'new', dueAt: 0, intervalDays: 0, seen: 0, correct: 0, firstTry: 0, lastSeenAt: 0 };
}

/** Cap intervals so every reaction gets at least one more review before the exam. */
export function capInterval(intervalDays: number, now: number, examDate?: string): number {
  if (!examDate) return intervalDays;
  const exam = Date.parse(examDate);
  if (Number.isNaN(exam)) return intervalDays;
  const daysToExam = (exam - now) / DAY;
  if (daysToExam <= 0) return intervalDays;
  return Math.min(intervalDays, Math.max(1, Math.floor(daysToExam / 2)));
}

export function applyResult(rec: MasteryRecord, result: ResultInput, now: number, examDate?: string): MasteryRecord {
  const next: MasteryRecord = { ...rec, seen: rec.seen + 1, lastSeenAt: now };
  if (!result.correct) {
    next.state = 'missed';
    next.lastResult = 'miss';
    next.intervalDays = 0;
    next.dueAt = now; // overdue as soon as the next session starts
    next.sessionGap = 3;
    return next;
  }
  next.correct = rec.correct + 1;
  const wasMissed = rec.state === 'missed';
  if (result.hinted || wasMissed) {
    next.state = 'shaky';
    next.lastResult = result.hinted ? 'hint' : 'hit';
    next.intervalDays = capInterval(2, now, examDate);
    next.dueAt = now + next.intervalDays * DAY;
    next.sessionGap = 8;
    return next;
  }
  next.state = 'solid';
  next.lastResult = 'hit';
  next.firstTry = rec.firstTry + 1;
  const base = rec.state === 'solid' && rec.intervalDays > 0 ? rec.intervalDays * 2 : 4;
  next.intervalDays = capInterval(base, now, examDate);
  next.dueAt = now + next.intervalDays * DAY;
  next.sessionGap = undefined;
  return next;
}

export function accuracy(rec: MasteryRecord): number {
  return rec.seen === 0 ? 0 : rec.correct / rec.seen;
}

export function isOverdue(rec: MasteryRecord, now: number): boolean {
  return rec.state !== 'new' && rec.dueAt <= now;
}

/** Seed a record straight into a state (used for the starting weak spots). */
export function seeded(state: MasteryState, now: number): MasteryRecord {
  const rec = newRecord();
  rec.state = state;
  rec.dueAt = now;
  rec.lastSeenAt = 0;
  rec.sessionGap = state === 'missed' ? 3 : state === 'shaky' ? 8 : undefined;
  return rec;
}

export interface ReagentRecord {
  seen: number;
  right: number;
  wrong: number;
  lastSeenAt: number;
}

export function reagentState(rec: ReagentRecord | undefined): MasteryState {
  if (!rec || rec.seen === 0) return 'new';
  const acc = rec.right / rec.seen;
  if (rec.wrong > 0 && rec.seen - lastIndexOfWrongApprox(rec) <= 1) return 'missed';
  if (acc >= 0.85 && rec.seen >= 2) return 'solid';
  return 'shaky';
}
// We do not store a per-use history for reagents; treat a card as "missed" only while the
// most recent uses were wrong (approximated by wrong > right).
function lastIndexOfWrongApprox(rec: ReagentRecord): number {
  return rec.wrong > rec.right ? rec.seen - 1 : -10;
}
