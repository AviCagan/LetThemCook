// "Name it" answer checking. Normalises case, spacing, dashes and hyphens; accepts every listed name
// (IUPAC, functional-class, common); and recognises the typical slips so the mentor can say which one:
// missing/wrong locants, alphabetical order, wrong parent, -al vs -one, "-oxide" used for an ether.
import type { NameTrap } from '../content/types';

export interface NameVerdict {
  correct: boolean;
  /** mistake tag when wrong */
  tag?: string;
  /** mentor text when wrong */
  why?: string;
  /** the accepted name the answer was matched against (or the closest one) */
  matched?: string;
}

/** lower case, unify dashes, drop spaces and hyphens, t-/s- shorthands, "di-" style spacing */
export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[’'`]/g, "'")
    .replace(/\bt-butyl/g, 'tert-butyl')
    .replace(/\bs-butyl/g, 'sec-butyl')
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .trim();
}

const letters = (s: string) => s.replace(/[^a-z]/g, '');
const digits = (s: string) => s.replace(/[^0-9]/g, '');
const sorted = (s: string) => [...s].sort().join('');
const PARENT = /^(cyclo)?(meth|eth|prop|but|pent|hex|hept|oct|non|dec)ane$|^benzene$/;
/** The parent hydride at the end of a normalised name: the LONGEST matching suffix (methane, not "ethane"). */
function parentOf(s: string): string {
  let best = '';
  for (let i = s.length - 4; i >= 0; i--) {
    const suf = s.slice(i);
    if (PARENT.test(suf)) best = suf;
  }
  return best;
}

export function checkName(answer: string, accepted: string[], traps: NameTrap[] = []): NameVerdict {
  const a = normalizeName(answer);
  if (!a) return { correct: false, tag: 'naming_spelling', why: 'Type a name first.' };
  for (const n of accepted) if (normalizeName(n) === a) return { correct: true, matched: n };
  for (const t of traps) {
    if (normalizeName(t.name) === a) return { correct: false, tag: t.tag, why: t.why, matched: accepted[0] };
  }
  // "-oxide" for an ether (methoxide, ethoxide, phenoxide …), but not "ethylene oxide"-style epoxide names
  if (/(meth|eth|prop|but|pent|hex|phen|isoprop|benz)oxide$/.test(a) && accepted.some((n) => /ether|oxy|ox[ia]/.test(n))) {
    return { correct: false, tag: 'naming_alkoxide', why: "An '-oxide' (methoxide, ethoxide, phenoxide) is the anion RO⁻. Name a neutral ether as alkoxy + parent, or the two groups + 'ether'.", matched: accepted[0] };
  }
  for (const n of accepted) {
    const b = normalizeName(n);
    // same letters, locants missing or different
    if (letters(a) === letters(b) && digits(a) !== digits(b)) {
      const why = digits(a).length < digits(b).length
        ? `Every substituent needs its locant: ${n}.`
        : `Check the numbering (lowest locants, from the right end): ${n}.`;
      return { correct: false, tag: 'naming_locant', why, matched: n };
    }
    // same pieces in a different order: alphabetical order, or the wrong part used as the parent
    if (a.length === b.length && sorted(a) === sorted(b)) {
      const functionalClass = /(ether|sulfide)$/.test(b);
      const pa = parentOf(a);
      const pb = parentOf(b);
      if (functionalClass || !pa || !pb || pa === pb) {
        return { correct: false, tag: 'naming_alpha_order', why: `Substituents (or the two groups of an ether) go in alphabetical order: ${n}.`, matched: n };
      }
      return { correct: false, tag: 'naming_parent', why: `Pick the larger (or ring) part as the parent and name the smaller one as the substituent: ${n}.`, matched: n };
    }
    // aldehyde vs ketone ending
    const stem = (s: string) => letters(s).replace(/(al|one)$/, '');
    if ((/al$/.test(a) && /one$/.test(b)) || (/one$/.test(a) && /al$/.test(b))) {
      if (stem(a) === stem(b)) {
        return { correct: false, tag: 'aldehyde_ketone_mixup', why: `'-al' is an aldehyde (C=O at the end of the chain); '-one' is a ketone (C=O inside it). This is ${n}.`, matched: n };
      }
    }
  }
  return { correct: false, tag: 'naming_spelling', why: `Not quite. Accepted: ${accepted.slice(0, 3).join(' · ')}.`, matched: accepted[0] };
}

/** Wrong options for the multiple-choice fallback: the item's name traps, then generated slips. */
export function nameChoices(accepted: string[], traps: NameTrap[], others: string[], rng: () => number): string[] {
  const main = accepted[0];
  const bad = new Set(accepted.map(normalizeName));
  const out: string[] = [];
  const add = (n: string | undefined) => {
    if (!n) return;
    const k = normalizeName(n);
    if (bad.has(k) || out.some((x) => normalizeName(x) === k)) return;
    out.push(n);
  };
  for (const t of traps) add(t.name);
  // locants dropped
  if (/\d/.test(main)) add(main.replace(/\d+(,\d+)*-/g, '').replace(/^-/, ''));
  // -al <-> -one
  if (/al$/.test(main)) add(main.replace(/al$/, 'one'));
  if (/one$/.test(main)) add(main.replace(/(-\d+-)?one$/, 'al').replace(/an-?al$/, 'anal'));
  // functional-class groups swapped
  for (const n of accepted) {
    const m = n.match(/^(\S+) (\S+) (ether|sulfide)$/);
    if (m) add(`${m[2]} ${m[1]} ${m[3]}`);
  }
  const pool = others.filter((n) => !bad.has(normalizeName(n)));
  while (out.length < 3 && pool.length) add(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out.slice(0, 3);
}
