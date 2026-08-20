import { describe, expect, it } from 'vitest';

import {
  EvidenceGroundingError,
  groundExactEvidence,
  normalizeEvidenceText,
} from './evidence-grounding.js';

const whitespace = '\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680' +
  '\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A' +
  '\u2028\u2029\u202F\u205F\u3000';

function expectGroundingError(
  action: () => unknown,
  code: EvidenceGroundingError['code'],
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(EvidenceGroundingError);
  expect(thrown).toMatchObject({ code });
}

describe('normalizeEvidenceText', () => {
  it('replaces every supported Unicode whitespace sequence with one ASCII space', () => {
    expect(normalizeEvidenceText(`alpha${whitespace}beta`)).toBe('alpha beta');
  });

  it('trims leading and trailing whitespace without changing other characters', () => {
    expect(normalizeEvidenceText('\u3000Case, punctuation!\n')).toBe('Case, punctuation!');
  });

  it('preserves U+FEFF while trimming only whitespace from the explicit set', () => {
    expect(normalizeEvidenceText(`${whitespace}alpha${whitespace}`)).toBe('alpha');
    expect(normalizeEvidenceText('\uFEFFalpha\uFEFF')).toBe('\uFEFFalpha\uFEFF');
  });
});

describe('groundExactEvidence', () => {
  it('returns the normalized quote and deterministic UTF-8 lowercase SHA-256', () => {
    expect(groundExactEvidence({
      sourceText: 'Case, punctuation! stay unchanged.',
      quote: 'Case, punctuation!',
    })).toEqual({
      normalizedQuote: 'Case, punctuation!',
      normalizedQuoteSha256: '5762bcef2d4e2810b7a6ccff1ebbfe76f54f3cf0761a49c7ee5f41f16657de4f',
    });
  });

  it('normalizes source and quote before checking one contiguous match', () => {
    expect(groundExactEvidence({
      sourceText: 'A long\u00A0enough quote stays contiguous.',
      quote: 'long\u00A0enough quote',
    }).normalizedQuote).toBe('long enough quote');
  });

  it('preserves case sensitivity', () => {
    expectGroundingError(
      () => groundExactEvidence({
        sourceText: 'A Case-sensitive quote is present.',
        quote: 'a Case-sensitive quote',
      }),
      'evidence_quote_not_found',
    );
  });

  it('preserves punctuation sensitivity', () => {
    expectGroundingError(
      () => groundExactEvidence({
        sourceText: 'A punctuation-sensitive quote is present.',
        quote: 'A punctuation-sensitive quote,',
      }),
      'evidence_quote_not_found',
    );
  });

  it('rejects a non-contiguous quote', () => {
    expectGroundingError(
      () => groundExactEvidence({
        sourceText: 'A quote with a gap between words.',
        quote: 'A quote words.',
      }),
      'evidence_quote_not_found',
    );
  });

  it.each([
    ['', 'evidence_quote_invalid'],
    ['short', 'evidence_quote_invalid'],
    ['x'.repeat(501), 'evidence_quote_invalid'],
  ] as const)('rejects normalized quote %j', (quote, code) => {
    expectGroundingError(
      () => groundExactEvidence({ sourceText: `prefix ${quote} suffix`, quote }),
      code,
    );
  });

  it('rejects a missing quote with a valid normalized length', () => {
    expectGroundingError(
      () => groundExactEvidence({
        sourceText: 'A different source sentence is present.',
        quote: 'A missing quote',
      }),
      'evidence_quote_not_found',
    );
  });
});
