// Mirrors content/schema/*.schema.json. Keep in sync with the schemas; the validator is the source of truth.

export type Shelf = 'ch16' | 'phenols' | 'ch17' | 'workup' | 'decoy';
export type ReagentKind = 'reagent' | 'workup' | 'decoy';
export type Technique = 'pour' | 'temperature' | 'stir' | 'light' | 'workup' | 'pressure' | 'none';
export type TempPreset = 'ice' | 'rt' | 'c140' | 'c180' | 'reflux';
export type StereoLabel = 'none' | 'single_enantiomer' | 'racemic' | 'meso' | 'cis' | 'trans' | 'syn' | 'anti';
export type OrderType = 'make_it' | 'predict_product' | 'find_start' | 'spot_flaw' | 'name_it' | 'multistep';
export type Chapter = 16 | 17;

export interface Reagent {
  id: string;
  label: string;
  name: string;
  smiles?: string;
  shelf: Shelf;
  kind: ReagentKind;
  technique: Technique;
  techniqueParams?: {
    equivOptions?: number[];
    tempPresets?: TempPreset[];
    lightToggle?: boolean;
  };
  card: { does: string; doesNot?: string; trap?: string };
  aliases?: string[];
}

export interface Conditions {
  temp?: TempPreset;
  light?: boolean;
  equiv?: number;
  pressure?: boolean;
  solvent?: string;
}

export interface Step {
  reagents: string[];
  conditions?: Conditions;
}
export type Route = Step[];

export interface SmartsTemplate {
  rxn: string;
  reactants: string[];
  mode: 'single' | 'exhaustive';
}

export interface Reaction {
  id: string;
  name: string;
  chapter: Chapter;
  section: 'alcohols' | 'phenols' | 'ethers';
  phase: 1 | 2;
  reagentsText: string;
  steps: Route;
  altRoutes?: Route[];
  rules: { summary: string; regio?: string; stereo?: string; leavesAlone?: string[]; notes?: string[] };
  stereoOutcome: string;
  smarts?: SmartsTemplate[];
  smartsMode?: 'alternatives' | 'pipeline';
  decoys?: string[];
  typicalTags: string[];
  minigames?: Exclude<Technique, 'none'>[];
}

export interface MistakeTag {
  id: string;
  label: string;
  rule: string;
  auto?: boolean;
}

export interface Molecule {
  smiles: string;
  name?: string;
  stereo?: StereoLabel;
}

export interface NameTrap { name: string; tag: string; why?: string }
export interface Names { accepted: string[]; traps?: NameTrap[] }

export interface Answer {
  smiles: string;
  stereo: StereoLabel;
  stereoChoices?: StereoLabel[];
  names?: Names;
  highlightAtoms?: number[];
  minor?: Molecule;
}

export interface ProductDistractor {
  smiles: string;
  stereo: StereoLabel;
  tag: string;
  why: string;
  stereoOnly?: boolean;
}

export interface RouteDistractor {
  steps: Route;
  tag: string;
  why: string;
  product?: Molecule;
}

export interface FlawRoute {
  id: 'A' | 'B';
  start: Molecule;
  steps: Route;
  works: boolean;
  reactionId: string;
  product?: Molecule;
  tag?: string;
  why?: string;
}

export interface Flaw {
  target: Molecule;
  routes: FlawRoute[];
  choices: { tag: string; label: string }[];
  answer: { route: 'A' | 'B'; tag: string };
}

export interface QuestionItem {
  id: string;
  reactionId: string;
  reactionIds?: string[];
  chapter: Chapter;
  difficulty: 1 | 2 | 3;
  orderTypes: OrderType[];
  start?: Molecule;
  route?: { steps: Route; alt?: Route[] };
  answer?: Answer;
  productDistractors?: ProductDistractor[];
  routeDistractors?: RouteDistractor[];
  startDistractors?: ProductDistractor[];
  flaw?: Flaw;
  explanation: string;
  tip?: string;
  source?: string;
  review?: string;
}
