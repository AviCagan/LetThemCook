import { describe, expect, it } from 'vitest';
import { gradeProduct, gradeRoute } from '../src/engine/grader';
import { ITEMS, getReaction } from '../src/content/bank';
import { buildOrder } from '../src/engine/order';
import { mulberry32 } from '../src/util/rng';
import { scoreOrder } from '../src/engine/scoring';

const item = (id: string) => {
  const q = ITEMS.find((x) => x.id === id);
  if (!q) throw new Error(`missing item ${id}`);
  return q;
};

describe('route grading', () => {
  it('accepts the canonical route and the reaction alt route', () => {
    const q = item('q-R5-ethylbenzoate-001');
    const r = getReaction('R5');
    expect(gradeRoute(q, r, [{ reagents: ['LiAlH4'] }, { reagents: ['H2O'], conditions: { temp: 'rt' } }]).correct).toBe(true);
    expect(gradeRoute(q, r, [{ reagents: ['LiAlH4'] }, { reagents: ['H3O_plus'] }]).correct).toBe(true);
  });
  it('tags a forgotten workup', () => {
    const q = item('q-R5-ethylbenzoate-001');
    const g = gradeRoute(q, getReaction('R5'), [{ reagents: ['LiAlH4'] }]);
    expect(g.correct).toBe(false);
    expect(g.mistakes[0].tag).toBe('missing_workup');
  });
  it('tags steps out of order', () => {
    const q = item('q-E3-cyclohexanol-001');
    const g = gradeRoute(q, getReaction('E3'), [{ reagents: ['CH3I'] }, { reagents: ['NaH'] }]);
    expect(g.mistakes[0].tag).toBe('wrong_reagent_order');
  });
  it('matches an authored flawed route (AlCl3 as base)', () => {
    const q = item('q-E3-cyclohexanol-001');
    const g = gradeRoute(q, getReaction('E3'), [{ reagents: ['AlCl3'] }, { reagents: ['CH3I'] }]);
    expect(g.mistakes[0].tag).toBe('lewis_acid_as_base');
  });
  it('tags wrong temperature for a warm diazotisation', () => {
    const q = item('q-P1-aniline-001');
    const g = gradeRoute(q, getReaction('P1'), [
      { reagents: ['NaNO2_H2SO4'], conditions: { temp: 'rt' } },
      { reagents: ['H2O'], conditions: { temp: 'reflux' } },
    ]);
    expect(g.correct).toBe(false);
    expect(g.mistakes[0].tag).toBe('wrong_temperature');
  });
  it('tags nitration as nitrite_vs_nitric', () => {
    const q = item('q-P1-aniline-001');
    const g = gradeRoute(q, getReaction('P1'), [{ reagents: ['HNO3_H2SO4'], conditions: { temp: 'ice' } }]);
    expect(g.mistakes[0].tag).toBe('nitrite_vs_nitric');
  });
  it('falls back to reagent_label_unknown for an unrelated bottle', () => {
    const q = item('q-R2-benzaldehyde-001');
    const g = gradeRoute(q, getReaction('R2'), [{ reagents: ['HIO4'] }]);
    expect(g.correct).toBe(false);
    expect(g.mistakes.some((m) => m.tag === 'reagent_label_unknown')).toBe(true);
  });
});

describe('product grading', () => {
  it('requires the stereo label when the answer has stereo', () => {
    const q = item('q-R11-cisbutene-001');
    expect(gradeProduct(q, { correct: true }, 'meso').correct).toBe(true);
    const wrong = gradeProduct(q, { correct: true }, 'racemic');
    expect(wrong.correct).toBe(false);
    expect(wrong.mistakes[0].tag).toBe('meso_vs_racemic');
    expect(gradeProduct(q, { correct: true }, 'none').mistakes[0].tag).toBe('missing_stereo');
  });
  it('passes the distractor tag through', () => {
    const q = item('q-R23-butanediol-001');
    const g = gradeProduct(q, { correct: false, tag: 'diol_to_alcohols', why: 'x' });
    expect(g.mistakes[0].tag).toBe('diol_to_alcohols');
  });
});

describe('order builder', () => {
  it('builds 4 shuffled options with exactly one correct answer and a shelf containing the route', () => {
    const q = item('q-P1-ptoluidine-001');
    const o = buildOrder(q, 'make_it', mulberry32(7));
    expect(o.options).toHaveLength(4);
    expect(o.options.filter((x) => x.correct)).toHaveLength(1);
    const ids = o.shelf.map((r) => r.id);
    expect(ids).toContain('NaNO2_H2SO4');
    expect(ids).toContain('H2O');
    expect(ids).toContain('HNO3_H2SO4');
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every playable item can be served as each of its order types', () => {
    const rng = mulberry32(1);
    for (const q of ITEMS) {
      for (const t of q.orderTypes) {
        if (t !== 'make_it' && t !== 'predict_product') continue;
        const o = buildOrder(q, t, rng);
        expect(o.options.length).toBe(4);
      }
    }
  });
});

describe('scoring', () => {
  it('weights chemistry 70 / technique 20 / speed 10', () => {
    expect(scoreOrder({ chemistry: 1, technique: 1, seconds: 10 }).stars).toBe(3);
    expect(scoreOrder({ chemistry: 1, technique: 0, seconds: 500 }).stars).toBe(2);
    expect(scoreOrder({ chemistry: 0.5, technique: 1, seconds: 10 }).stars).toBe(2);
    expect(scoreOrder({ chemistry: 0, technique: 1, seconds: 10 }).stars).toBe(0);
  });
});
