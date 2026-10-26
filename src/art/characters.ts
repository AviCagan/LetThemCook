// Customer roster. Sprite keys must exist in src/art/sprites.ts (sci_*). Names are original.
export const CHARACTER_KEYS = [
  'sci_frog',
  'sci_cat',
  'sci_owl',
  'sci_robot',
  'sci_axolotl',
  'sci_bear',
  'sci_bunny',
  'sci_duck',
  'sci_ghost',
  'sci_dino',
];

export const CHARACTER_NAMES: Record<string, string> = {
  sci_frog: 'Dr. Ribbit',
  sci_cat: 'Prof. Whiskerton',
  sci_owl: 'Dr. Hootsworth',
  sci_robot: 'Unit B-3AKR',
  sci_axolotl: 'Dr. Lotl',
  sci_bear: 'Prof. Bramble',
  sci_bunny: 'Dr. Hopkins',
  sci_duck: 'Dr. Quackenbush',
  sci_ghost: 'Dr. Boo',
  sci_dino: 'Prof. Rex',
};

export function characterName(key: string): string {
  return CHARACTER_NAMES[key] ?? 'A scientist';
}
