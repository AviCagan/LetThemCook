// Starting weak spots from the brief. Applied lazily: a reaction is seeded the first time it
// exists in the content and has not been seeded before, so Phase 2 reactions get seeded when they land.
import type { MasteryState } from './srs';

export interface Seed {
  reactionId: string;
  state: MasteryState;
  tag?: string;
  note: string;
}

export const SEEDS: Seed[] = [
  { reactionId: 'P1', state: 'missed', tag: 'nitrite_vs_nitric', note: 'Diazonium route confused with nitration' },
  { reactionId: 'E3', state: 'missed', tag: 'lewis_acid_as_base', note: 'Williamson with AlCl₃ instead of a base (HW mistake)' },
  { reactionId: 'E5', state: 'shaky', tag: 'SNAr_meta', note: 'SNAr: NO₂ must be o/p to the halide' },
  { reactionId: 'R5', state: 'shaky', tag: 'ester_one_piece', note: 'LiAlH₄ on esters gives two alcohols' },
  { reactionId: 'R23', state: 'shaky', tag: 'diol_to_alcohols', note: 'HIO₄ gives carbonyls, not alcohols; -al vs -one' },
  { reactionId: 'P7', state: 'shaky', tag: 'acyl_wrong_site', note: 'O-acylation vs C-acylation vs ether' },
  { reactionId: 'P8', state: 'shaky', tag: 'acyl_wrong_site', note: 'Fries / C-acylation; para-blocked positions' },
  { reactionId: 'P6', state: 'shaky', tag: 'acyl_wrong_site', note: 'Williamson on phenols vs acylation' },
  { reactionId: 'R10', state: 'shaky', tag: 'missing_stereo', note: 'Hydroboration stereo: say racemic' },
  { reactionId: 'R11', state: 'shaky', tag: 'meso_vs_racemic', note: 'OsO₄ stereo: meso vs racemic' },
  { reactionId: 'R20', state: 'shaky', note: 'Fischer esterification: the alcohol is the nucleophile' },
  { reactionId: 'P4', state: 'shaky', tag: 'substituent_replaced', note: 'Nitration of phenols' },
  { reactionId: 'R19', state: 'shaky', note: 'Anhydride esters' },
];
