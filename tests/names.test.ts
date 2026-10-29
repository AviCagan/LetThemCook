import { describe, it, expect } from 'vitest';
import { checkName, nameChoices, normalizeName } from '../src/engine/names';

const etherNames = ['methoxyethane', 'ethyl methyl ether'];

describe('name checker', () => {
  it('ignores case, spacing, dashes and hyphens', () => {
    expect(normalizeName(' 2-Methoxy-2-methylpropane ')).toBe(normalizeName('2 methoxy 2 methyl propane'));
    expect(checkName('2–methoxy—2-METHYLpropane', ['2-methoxy-2-methylpropane']).correct).toBe(true);
    expect(checkName('Ethyl Methyl Ether', etherNames).correct).toBe(true);
    expect(checkName('t-butyl methyl ether', ['tert-butyl methyl ether']).correct).toBe(true);
  });
  it('catches missing and wrong locants', () => {
    expect(checkName('methoxypropane', ['1-methoxypropane']).tag).toBe('naming_locant');
    expect(checkName('propan-1-ol', ['propan-2-ol']).tag).toBe('naming_locant');
    expect(checkName('butanol', ['butan-1-ol', '1-butanol']).tag).toBe('naming_locant');
  });
  it('catches alphabetical order in functional-class and substitutive names', () => {
    expect(checkName('methyl ethyl ether', etherNames).tag).toBe('naming_alpha_order');
    expect(checkName('2-methyl-1-ethoxypropane', ['1-ethoxy-2-methylpropane']).tag).toBe('naming_alpha_order');
  });
  it('catches the wrong parent', () => {
    expect(checkName('ethoxymethane', etherNames).tag).toBe('naming_parent');
  });
  it('catches -al vs -one and alkoxide-for-ether', () => {
    expect(checkName('propanone', ['propanal']).tag).toBe('aldehyde_ketone_mixup');
    expect(checkName('ethyl methoxide', etherNames).tag).toBe('naming_alkoxide');
    // epoxide "alkene oxide" names are fine
    expect(checkName('ethylene oxide', ['oxirane', 'ethylene oxide']).correct).toBe(true);
  });
  it('uses the item name traps first', () => {
    const v = checkName('3-methyloxirane', ['2-methyloxirane'], [{ name: '3-methyloxirane', tag: 'naming_locant', why: 'number from O' }]);
    expect(v).toMatchObject({ correct: false, tag: 'naming_locant', why: 'number from O' });
  });
  it('makes three wrong choices that are never accepted names', () => {
    const c = nameChoices(['1-methoxypropane', 'methyl propyl ether'], [], ['methoxyethane', 'ethoxyethane', '2-methoxypropane'], () => 0.3);
    expect(c).toHaveLength(3);
    for (const n of c) expect(checkName(n, ['1-methoxypropane', 'methyl propyl ether']).correct).toBe(false);
    expect(c).toContain('methoxypropane');
    expect(c).toContain('propyl methyl ether');
  });
});
