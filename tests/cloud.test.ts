import { describe, it, expect } from 'vitest';
import { CODE_LEN, cloudConfigured, formatCode, generateCode, normalizeCode } from '../src/save/cloud';

describe('cloud sync codes', () => {
  it('are 26 base32 characters (130 bits)', () => {
    const c = generateCode();
    expect(c).toHaveLength(CODE_LEN);
    expect(c).toMatch(/^[A-Z2-7]{26}$/);
    expect(generateCode()).not.toBe(c);
  });
  it('round-trip through the grouped display form, case and spacing insensitive', () => {
    const c = generateCode();
    expect(normalizeCode(formatCode(c))).toBe(c);
    expect(normalizeCode(` ${formatCode(c).toLowerCase().replace(/-/g, ' ')} `)).toBe(c);
  });
  it('fix look-alike digits and reject malformed codes', () => {
    expect(normalizeCode('0'.repeat(26))).toBe('O'.repeat(26));
    expect(normalizeCode('ABC')).toBeNull();
    expect(normalizeCode('A'.repeat(27))).toBeNull();
  });
  it('need both a URL and a key to be configured', () => {
    expect(cloudConfigured({ url: '', anonKey: '' })).toBe(false);
    expect(cloudConfigured({ url: 'https://x.supabase.co', anonKey: '' })).toBe(false);
    expect(cloudConfigured({ url: 'https://x.supabase.co', anonKey: 'sb_publishable_x' })).toBe(true);
  });
});
