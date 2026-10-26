import courseJson from '../../content/course.json';

export interface Exam {
  name: string;
  date: string; // YYYY-MM-DD
  chapters: number[];
  topics?: string;
}

export const COURSE = courseJson as { course: string; source?: string; exams: Exam[] };

/** The next exam on or after `now` (local date), if any. */
export function nextExam(now = Date.now()): Exam | undefined {
  const today = new Date(now);
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return COURSE.exams.find((e) => e.date >= iso);
}

export function daysUntil(date: string, now = Date.now()): number {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  return Math.ceil((target - now) / 86400000);
}
