// @ts-expect-error The domain package intentionally has no runtime dependency on Node type declarations.
import { createHash } from 'node:crypto';

// The explicit control characters are part of the PostgreSQL-compatible whitespace contract.
// eslint-disable-next-line no-control-regex
const evidenceWhitespace = /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/gu;

export type EvidenceGroundingErrorCode =
  | 'evidence_quote_invalid'
  | 'evidence_quote_not_found';

export class EvidenceGroundingError extends Error {
  constructor(readonly code: EvidenceGroundingErrorCode) {
    super(code);
    this.name = 'EvidenceGroundingError';
  }
}

export function normalizeEvidenceText(value: string): string {
  return value.replace(evidenceWhitespace, ' ').replace(/^ +| +$/g, '');
}

export function groundExactEvidence(input: {
  readonly sourceText: string;
  readonly quote: string;
}): { normalizedQuote: string; normalizedQuoteSha256: string } {
  const normalizedQuote = normalizeEvidenceText(input.quote);
  const quoteLength = [...normalizedQuote].length;
  if (quoteLength < 10 || quoteLength > 500) {
    throw new EvidenceGroundingError('evidence_quote_invalid');
  }

  if (!normalizeEvidenceText(input.sourceText).includes(normalizedQuote)) {
    throw new EvidenceGroundingError('evidence_quote_not_found');
  }

  return {
    normalizedQuote,
    normalizedQuoteSha256: createHash('sha256').update(normalizedQuote, 'utf8').digest('hex'),
  };
}
