export interface ScoreInput {
  /** 1 = right first try, 0.5 = right after a hint or retry, 0 = wrong */
  chemistry: 0 | 0.5 | 1;
  /** mean minigame precision 0..1 (1 when there were no minigames, e.g. exam mode) */
  technique: number;
  /** seconds spent on the order */
  seconds: number;
  /** par time in seconds for this order type */
  par?: number;
  /** exam mode: chemistry only */
  chemistryOnly?: boolean;
}

export interface Score {
  total: number;
  stars: 0 | 1 | 2 | 3;
  speed: number;
}

export const WEIGHTS = { chemistry: 0.7, technique: 0.2, speed: 0.1 } as const;

export function speedFactor(seconds: number, par = 60): number {
  if (seconds <= par) return 1;
  return Math.max(0, 1 - (seconds - par) / par);
}

export function scoreOrder(input: ScoreInput): Score {
  const speed = speedFactor(input.seconds, input.par ?? 60);
  let total: number;
  if (input.chemistryOnly) {
    total = input.chemistry;
  } else {
    total = WEIGHTS.chemistry * input.chemistry + WEIGHTS.technique * clamp01(input.technique) + WEIGHTS.speed * speed;
  }
  const stars: 0 | 1 | 2 | 3 = total >= 0.85 ? 3 : total >= 0.6 ? 2 : total >= 0.35 ? 1 : 0;
  return { total, stars, speed };
}

export function coinsFor(stars: number, combo: number): number {
  return stars * 5 + Math.min(combo, 5) * 2;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
