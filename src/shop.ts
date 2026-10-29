// The coin shop: cosmetic lab upgrades, a lab pet, and new customers. Nothing here affects scoring.
import { NEW_CUSTOMERS } from './art/variants';
import { buy } from './save/economy';
import type { SaveData } from './save/types';

export type Slot = 'bench' | 'rug' | 'hood' | 'plant' | 'decor' | 'poster' | 'pet' | 'customer';

export interface ShopItem {
  id: string;
  slot: Slot;
  name: string;
  cost: number;
  /** sprite key (and frame) shown on the shop card */
  preview: string;
  frame?: number;
  /** room tile / sprite this item puts in the lab */
  sprite?: string;
}

export const SLOT_LABEL: Record<Slot, string> = {
  bench: 'Counter top', rug: 'Rug', hood: 'Fume hood', plant: 'Corner plants', decor: 'Corner decor',
  poster: 'Wall poster', pet: 'Lab pet', customer: 'New customers',
};

export const CATALOG: ShopItem[] = [
  { id: 'bench_teal', slot: 'bench', name: 'Teal counter', cost: 0, preview: 't_counter_m' },
  { id: 'bench_coral', slot: 'bench', name: 'Coral counter', cost: 60, preview: 't_counter_m__coral' },
  { id: 'bench_lavender', slot: 'bench', name: 'Lavender counter', cost: 60, preview: 't_counter_m__lavender' },
  { id: 'bench_mint', slot: 'bench', name: 'Mint counter', cost: 60, preview: 't_counter_m__mint' },
  { id: 'bench_gold', slot: 'bench', name: 'Gold counter', cost: 90, preview: 't_counter_m__gold' },
  { id: 'rug_teal', slot: 'rug', name: 'Teal rug', cost: 0, preview: 't_rug' },
  { id: 'rug_coral', slot: 'rug', name: 'Coral rug', cost: 40, preview: 't_rug__coral' },
  { id: 'rug_lavender', slot: 'rug', name: 'Lavender rug', cost: 40, preview: 't_rug__lavender' },
  { id: 'rug_gold', slot: 'rug', name: 'Sunny rug', cost: 40, preview: 't_rug__gold' },
  { id: 'rug_sky', slot: 'rug', name: 'Sky rug', cost: 40, preview: 't_rug__sky' },
  { id: 'hood_steel', slot: 'hood', name: 'Steel hood', cost: 0, preview: 't_fumehood_bl' },
  { id: 'hood_mint', slot: 'hood', name: 'Mint hood', cost: 70, preview: 't_fumehood_bl__mint' },
  { id: 'hood_lavender', slot: 'hood', name: 'Lavender hood', cost: 70, preview: 't_fumehood_bl__lavender' },
  { id: 'hood_gold', slot: 'hood', name: 'Brass hood', cost: 90, preview: 't_fumehood_bl__gold' },
  { id: 'plant_basic', slot: 'plant', name: 'Leafy plant', cost: 0, preview: 't_plant', sprite: 't_plant' },
  { id: 'plant_cactus', slot: 'plant', name: 'Cactus', cost: 30, preview: 't_plant_cactus', sprite: 't_plant_cactus' },
  { id: 'plant_fern', slot: 'plant', name: 'Fern', cost: 30, preview: 't_plant_fern', sprite: 't_plant_fern' },
  { id: 'plant_flower', slot: 'plant', name: 'Flower pot', cost: 35, preview: 't_plant_flower', sprite: 't_plant_flower' },
  { id: 'plant_bonsai', slot: 'plant', name: 'Bonsai', cost: 60, preview: 't_plant_bonsai', sprite: 't_plant_bonsai' },
  { id: 'decor_trash', slot: 'decor', name: 'Waste bin', cost: 0, preview: 't_trash', sprite: 't_trash' },
  { id: 'decor_lamp', slot: 'decor', name: 'Floor lamp', cost: 45, preview: 't_lamp', frame: 1, sprite: 't_lamp' },
  { id: 'decor_beanbag', slot: 'decor', name: 'Bean bag', cost: 50, preview: 't_beanbag', sprite: 't_beanbag' },
  { id: 'decor_aquarium', slot: 'decor', name: 'Aquarium', cost: 90, preview: 't_aquarium', sprite: 't_aquarium' },
  { id: 'poster_basic', slot: 'poster', name: 'Lab poster', cost: 0, preview: 't_wall_poster', sprite: 't_wall_poster' },
  { id: 'poster_periodic', slot: 'poster', name: 'Periodic table', cost: 35, preview: 't_poster_periodic', sprite: 't_poster_periodic' },
  { id: 'poster_molecule', slot: 'poster', name: 'Benzene ring', cost: 35, preview: 't_poster_molecule', sprite: 't_poster_molecule' },
  { id: 'pet_none', slot: 'pet', name: 'No pet', cost: 0, preview: 'ic_paw' },
  { id: 'pet_slime', slot: 'pet', name: 'Slime', cost: 100, preview: 'pet_slime', sprite: 'pet_slime' },
  { id: 'pet_hamster', slot: 'pet', name: 'Hamster', cost: 120, preview: 'pet_hamster', sprite: 'pet_hamster' },
  { id: 'pet_axo', slot: 'pet', name: 'Axolotl', cost: 140, preview: 'pet_axo', sprite: 'pet_axo' },
  { id: 'pet_robot', slot: 'pet', name: 'Robo-sweeper', cost: 160, preview: 'pet_robot', sprite: 'pet_robot' },
  ...NEW_CUSTOMERS.map((c, i) => ({ id: `cust_${c.key}`, slot: 'customer' as Slot, name: c.name, cost: 60 + 10 * i, preview: c.key, sprite: c.key })),
];

export const SLOTS: Slot[] = ['pet', 'bench', 'rug', 'hood', 'plant', 'decor', 'poster', 'customer'];

const byId = new Map(CATALOG.map((i) => [i.id, i]));
export const shopItem = (id: string) => byId.get(id);

export function owns(s: SaveData, item: ShopItem): boolean {
  return item.cost === 0 || s.economy.unlocked.includes(item.id);
}

/** The item equipped in a slot (the free default when nothing is set). */
export function equipped(s: SaveData, slot: Slot): ShopItem {
  const id = s.economy.equipped[slot];
  const it = id ? byId.get(id) : undefined;
  return it && it.slot === slot && owns(s, it) ? it : CATALOG.find((i) => i.slot === slot && i.cost === 0)!;
}

export function equip(s: SaveData, item: ShopItem): boolean {
  if (item.slot === 'customer' || !owns(s, item)) return false;
  s.economy.equipped[item.slot] = item.id;
  return true;
}

/** Buy (and, for cosmetics, equip at once). */
export function purchase(s: SaveData, item: ShopItem): boolean {
  if (owns(s, item)) return false;
  if (!buy(s, item.id, item.cost)) return false;
  if (item.slot !== 'customer') s.economy.equipped[item.slot] = item.id;
  return true;
}

/** Customers who can walk in: the original ten plus any bought. */
export function customerPool(s: SaveData, base: string[]): string[] {
  return [...base, ...CATALOG.filter((i) => i.slot === 'customer' && owns(s, i)).map((i) => i.sprite!)];
}

/** Room tile key for a slot-skinned tile ("t_counter_m" -> "t_counter_m__coral"). */
export function skinned(s: SaveData, key: string): string {
  if (key.startsWith('t_counter_') && !key.startsWith('t_counter_front')) return suffix(key, equipped(s, 'bench').id, 'bench_teal');
  if (key.startsWith('t_rug')) return suffix(key, equipped(s, 'rug').id, 'rug_teal');
  if (key.startsWith('t_fumehood_')) return suffix(key, equipped(s, 'hood').id, 'hood_steel');
  if (key === 't_plant') return equipped(s, 'plant').sprite ?? key;
  if (key === 't_trash') return equipped(s, 'decor').sprite ?? key;
  if (key === 't_wall_poster') return equipped(s, 'poster').sprite ?? key;
  return key;
}
function suffix(key: string, id: string, def: string): string {
  return id === def ? key : `${key}__${id.split('_')[1]}`;
}
