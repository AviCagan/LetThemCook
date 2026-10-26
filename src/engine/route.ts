import type { Conditions, Route, Step } from '../content/types';

const GRADED_CONDITION_KEYS: (keyof Conditions)[] = ['temp', 'light', 'equiv', 'pressure'];

export function stepKey(step: Step): string {
  return step.reagents.slice().sort().join('+');
}

export function bottleSet(route: Route): Set<string> {
  return new Set(route.flatMap((s) => s.reagents));
}

/** Do the player's conditions satisfy every condition the expected step specifies? */
export function conditionsMatch(expected: Conditions | undefined, actual: Conditions | undefined): boolean {
  if (!expected) return true;
  for (const key of GRADED_CONDITION_KEYS) {
    if (expected[key] === undefined) continue;
    if (actual?.[key] !== expected[key]) return false;
  }
  return true;
}

export function stepsMatch(expected: Step, actual: Step, checkConditions = true): boolean {
  return stepKey(expected) === stepKey(actual) && (!checkConditions || conditionsMatch(expected.conditions, actual.conditions));
}

export function routeMatches(expected: Route, actual: Route, checkConditions = true): boolean {
  if (expected.length !== actual.length) return false;
  return expected.every((s, i) => stepsMatch(s, actual[i], checkConditions));
}

export function sameBottlesAnyOrder(expected: Route, actual: Route): boolean {
  if (expected.length !== actual.length) return false;
  const a = expected.map(stepKey).sort().join('|');
  const b = actual.map(stepKey).sort().join('|');
  return a === b;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Pretty "1. NaH; 2. CH3I" rendering using bottle labels. */
export function describeRoute(route: Route, label: (id: string) => string, condText?: (c: Conditions | undefined) => string): string {
  return route
    .map((s, i) => {
      const cond = condText ? condText(s.conditions) : '';
      return `${i + 1}. ${s.reagents.map(label).join(' + ')}${cond ? ` (${cond})` : ''}`;
    })
    .join('; ');
}

export function conditionText(c: Conditions | undefined): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.temp) parts.push({ ice: '0–5 °C', rt: 'room temp', c140: '140 °C', c180: '180 °C', reflux: 'heat' }[c.temp]);
  if (c.light === true) parts.push('light');
  if (c.equiv !== undefined) parts.push(`${c.equiv} equiv`);
  if (c.pressure) parts.push('pressure');
  if (c.solvent) parts.push(c.solvent);
  return parts.join(', ');
}
