import { describe, expect, it } from 'vitest';

import {
  isSecurityIndicatorLexicallyValid,
  normalizeSecurityIndicatorValueV1,
} from '../index.js';

const whitespace = '\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680' +
  '\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A' +
  '\u2028\u2029\u202F\u205F\u3000';

describe('security indicator normalization', () => {
  // Break caught: failing to use the shared PostgreSQL-compatible Unicode whitespace normalization.
  it('collapses every supported whitespace character and trims its boundaries', () => {
    expect(normalizeSecurityIndicatorValueV1(`${whitespace}MiXeD${whitespace}Value${whitespace}`))
      .toBe('MiXeD Value');
  });

  // Break caught: changing case, resolving URLs, or otherwise altering exact indicator identity.
  it('preserves non-whitespace code points exactly', () => {
    expect(normalizeSecurityIndicatorValueV1('HTTPS://ExAmple.test/A?B=1#C')).toBe(
      'HTTPS://ExAmple.test/A?B=1#C',
    );
  });
});

describe('security indicator lexical validity', () => {
  // Break caught: allowing a domain above the 253-character boundary or rejecting the inclusive boundary.
  it.each([
    ['a'.repeat(253), true],
    ['a'.repeat(254), false],
  ] as const)('enforces the domain %s-character boundary', (value, expected) => {
    expect(isSecurityIndicatorLexicallyValid({ type: 'domain', value, evidenceText: value })).toBe(expected);
  });

  // Break caught: allowing domains with whitespace or controls after normalization.
  it.each(['bad domain', 'bad\u0000domain', 'bad\u0085domain'])('rejects an invalid domain %j', (value) => {
    expect(isSecurityIndicatorLexicallyValid({ type: 'domain', value, evidenceText: value })).toBe(false);
  });

  // Break caught: accepting non-HTTP absolute URLs or rejecting either supported secure scheme.
  it.each([
    ['http://example.test/path', true],
    ['https://example.test/path?x=1', true],
    ['ftp://example.test/path', false],
    ['/relative/path', false],
    ['https://', false],
  ] as const)('validates URL %s as %s', (value, expected) => {
    expect(isSecurityIndicatorLexicallyValid({ type: 'url', value, evidenceText: value })).toBe(expected);
  });

  // Break caught: allowing malformed UTF-16 or control characters into canonical indicators.
  it.each([
    ['contract_address', '0xabc\uD800'],
    ['transaction_hash', '0xabc\uDC00'],
    ['social_account', 'name\u0007'],
    ['observed_behavior', 'behavior\u009F'],
    ['url', 'https://example.test/\u0001'],
  ] as const)('rejects unsafe %s text', (type, value) => {
    expect(isSecurityIndicatorLexicallyValid({ type, value, evidenceText: value })).toBe(false);
  });

  // Break caught: adding chain or provider-specific validation to otherwise safe non-domain indicator text.
  it('accepts non-domain indicator values without provider-specific semantics', () => {
    expect(isSecurityIndicatorLexicallyValid({
      type: 'contract_address',
      value: 'not-a-chain-address',
      evidenceText: 'Mentioned indicator: not-a-chain-address.',
    })).toBe(true);
  });

  // Break caught: grounding against raw whitespace, case-folded text, or a non-contiguous occurrence.
  it.each([
    ['normalizes evidence before an exact occurrence check', 'sample\u00A0indicator', 'prefix sample indicator suffix', true],
    ['preserves case in occurrence checks', 'Sample', 'prefix sample suffix', false],
    ['preserves punctuation in occurrence checks', 'indicator!', 'prefix indicator suffix', false],
    ['rejects non-contiguous occurrences', 'sample indicator', 'prefix sample unrelated indicator suffix', false],
  ] as const)('%s', (_name, value, evidenceText, expected) => {
    expect(isSecurityIndicatorLexicallyValid({
      type: 'observed_behavior',
      value,
      evidenceText,
    })).toBe(expected);
  });
});
