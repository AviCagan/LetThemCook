// Runtime reaction engine: applies the per-bottle rules in content/rules.json to the flask
// with RDKit.js. Mirrors scripts/chem_engine.py exactly (scripts/parity.mjs checks that).
import rulesJson from '../../content/rules.json';
import reagentsJson from '../../content/reagents.json';
import type { Conditions, Reagent } from '../content/types';
import type { RDKitModule, RDKitMol, RDKitReaction } from './rdkit';

export interface PipelineStep {
  rxn?: string;
  anyOf?: string[];
  repeat?: boolean;
}
export interface Rule {
  id: string;
  reagent: string;
  reactionIds: string[];
  label: string;
  conditions?: Record<string, unknown>;
  partner?: 'bottle' | 'self';
  requireNot?: string[];
  requireNotWhy?: string;
  warn?: { light?: boolean; tag: string; why: string };
  pipeline: PipelineStep[];
}
export interface NoReactionTrap {
  reagent: string;
  pattern: string;
  tag: string;
  why: string;
}
export interface Outcome {
  product: string;
  changed: boolean;
  rule?: Rule;
  blocked: string[];
  traps: NoReactionTrap[];
  warnings: { tag: string; why: string }[];
}

const DATA = rulesJson as { rules: Rule[]; noReaction: NoReactionTrap[] };
const REAGENTS = new Map((reagentsJson as Reagent[]).map((r) => [r.id, r]));
const RULES_BY_REAGENT = new Map<string, Rule[]>();
for (const r of DATA.rules) {
  const list = RULES_BY_REAGENT.get(r.reagent) ?? [];
  list.push(r);
  RULES_BY_REAGENT.set(r.reagent, list);
}
const MAX_REPEAT = 12;

export class ReactionEngine {
  private rxnCache = new Map<string, RDKitReaction | null>();
  private qCache = new Map<string, RDKitMol>();
  constructor(private RDKit: RDKitModule) {}

  /** Canonical SMILES; with stereo=false all @ and / \ marks are dropped. */
  canonical(smiles: string, stereo = true): string | null {
    const m = this.RDKit.get_mol(smiles);
    if (!m || !m.is_valid()) {
      m?.delete();
      return null;
    }
    let s = m.get_smiles();
    m.delete();
    if (!stereo) {
      const flat = s.replace(/@+/g, '').replace(/[\\/]/g, '');
      const m2 = this.RDKit.get_mol(flat);
      s = m2 ? m2.get_smiles() : flat;
      m2?.delete();
    }
    return s;
  }

  private rxn(smarts: string) {
    let r = this.rxnCache.get(smarts);
    if (!r) {
      r = this.RDKit.get_rxn(smarts);
      this.rxnCache.set(smarts, r);
    }
    return r;
  }

  private query(smarts: string): RDKitMol {
    let q = this.qCache.get(smarts);
    if (!q) {
      q = this.RDKit.get_qmol(smarts)!;
      this.qCache.set(smarts, q);
    }
    return q;
  }

  hasPattern(smiles: string, smarts: string): boolean {
    const m = this.RDKit.get_mol(smiles);
    if (!m) return false;
    const res = m.get_substruct_match(this.query(smarts));
    m.delete();
    return res !== '{}' && res.length > 2;
  }

  /** First valid product set of one template application, as canonical SMILES; null if no match. */
  private runOnce(smarts: string, reactantSmiles: string[]): string | null {
    const rxn = this.rxn(smarts);
    if (!rxn) return null;
    const list = new this.RDKit.MolList();
    const mols: RDKitMol[] = [];
    for (const s of reactantSmiles) {
      const m = this.RDKit.get_mol(s);
      if (!m) {
        list.delete();
        mols.forEach((x) => x.delete());
        return null;
      }
      mols.push(m);
      list.append(m);
    }
    const sets = rxn.run_reactants(list, 64);
    let out: string | null = null;
    for (let i = 0; i < sets.size() && out === null; i++) {
      const prods = sets.get(i);
      if (!prods) continue;
      const frags: string[] = [];
      let ok = true;
      for (let j = 0; j < prods.size(); j++) {
        const p = prods.at(j);
        if (!p) {
          ok = false;
          break;
        }
        const smi = p.get_smiles();
        p.delete();
        const check = this.RDKit.get_mol(smi);
        if (!check || !check.is_valid()) {
          check?.delete();
          ok = false;
          break;
        }
        frags.push(check.get_smiles());
        check.delete();
      }
      prods.delete();
      if (!ok) continue;
      const joined = this.canonical(frags.join('.'));
      if (joined) out = joined;
    }
    sets.delete();
    list.delete();
    mols.forEach((x) => x.delete());
    return out;
  }

  private applyStepFragment(step: PipelineStep, frag: string, partner: string | null): string {
    const templates = step.anyOf ?? [step.rxn!];
    const repeat = !!step.repeat;
    let cur = frag;
    for (let i = 0; i < (repeat ? MAX_REPEAT : 1); i++) {
      const reactants = partner !== null ? [cur, partner] : [cur];
      let next: string | null = null;
      for (const t of templates) {
        next = this.runOnce(t, reactants);
        if (next !== null) break;
      }
      if (next === null || next === cur) break;
      cur = next;
    }
    return cur;
  }

  private applyStep(step: PipelineStep, flask: string, partner: string | null): string {
    const frags = flask.split('.');
    const out = frags.map((f) => this.applyStepFragment(step, f, partner));
    return this.canonical(out.join('.')) ?? flask;
  }

  static conditionsOk(required: Record<string, unknown> | undefined, chosen: Conditions | undefined): boolean {
    if (!required) return true;
    const c = (chosen ?? {}) as Record<string, unknown>;
    for (const [key, want] of Object.entries(required)) {
      const have = c[key];
      if (Array.isArray(want)) {
        if (!want.includes(have)) return false;
      } else if (have !== want) return false;
    }
    return true;
  }

  apply(reagentId: string, conditions: Conditions | undefined, flask: string): Outcome {
    const flaskC = this.canonical(flask);
    if (!flaskC) throw new Error(`bad flask SMILES ${flask}`);
    const blocked: string[] = [];
    const warnings: { tag: string; why: string }[] = [];
    for (const rule of RULES_BY_REAGENT.get(reagentId) ?? []) {
      if (!ReactionEngine.conditionsOk(rule.conditions, conditions)) continue;
      if ((rule.requireNot ?? []).some((p) => this.hasPattern(flaskC, p))) {
        blocked.push(rule.requireNotWhy ?? 'blocked');
        continue;
      }
      let partner: string | null = null;
      if (rule.partner === 'bottle') {
        partner = REAGENTS.get(reagentId)?.smiles ?? null;
        if (partner === null) throw new Error(`rule ${rule.id} needs a bottle smiles`);
      } else if (rule.partner === 'self') {
        partner = flaskC;
      }
      let cur: string = flaskC;
      for (const step of rule.pipeline) cur = this.applyStep(step, cur, partner);
      if (cur !== flaskC) {
        const w = rule.warn;
        if (w && w.light !== undefined && (conditions?.light ?? false) === w.light) warnings.push({ tag: w.tag, why: w.why });
        return { product: cur, changed: true, rule, blocked, traps: [], warnings };
      }
    }
    const traps = DATA.noReaction.filter((t) => t.reagent === reagentId && (t.pattern === '*' || this.hasPattern(flaskC, t.pattern)));
    return { product: flaskC, changed: false, blocked, traps: traps.slice(0, 1), warnings };
  }

  /** True when the target is one of the flask's fragments (stereo ignored). */
  containsTarget(flask: string, target: string): boolean {
    const t = this.canonical(target, false);
    if (!t) return false;
    if (this.canonical(flask, false) === t) return true;
    return flask.split('.').some((f) => this.canonical(f, false) === t);
  }
}

export function reagentById(id: string): Reagent | undefined {
  return REAGENTS.get(id);
}
