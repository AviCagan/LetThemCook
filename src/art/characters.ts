// Customer roster. Names and species live next to the pixel art in sprites.ts (single source of truth).
import { CHARACTERS } from './sprites';

export const CHARACTER_KEYS: string[] = CHARACTERS.map((c) => c.key);

export function characterName(key: string): string {
  return CHARACTERS.find((c) => c.key === key)?.name ?? 'A scientist';
}

export function characterSpecies(key: string): string {
  return CHARACTERS.find((c) => c.key === key)?.species ?? '';
}
