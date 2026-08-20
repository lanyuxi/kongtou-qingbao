import { describe, expect, it } from 'vitest';
import {
  candidateReviewCommandV1Schema,
  candidateReviewReasonCodeSchema,
  candidateReviewResultV1Schema,
  evidenceLocatorV1Schema,
  governanceOutboxEventV1Schema,
} from '../index.js';

const candidateId = '10000000-0000-4000-8000-000000000001';
const reviewerUserId = '10000000-0000-4000-8000-000000000002';
const decisionId = '10000000-0000-4000-8000-000000000003';
const commandId = '10000000-0000-4000-8000-000000000004';
const signalId = '10000000-0000-4000-8000-000000000005';
const evidenceId = '10000000-0000-4000-8000-000000000006';
const occurredAt = '2026-08-20T00:00:00.000Z';

const command = {
  version: 1,
  candidateId,
  reviewerUserId,
  expectedCandidateVersion: 1,
  decision: 'approve',
  reasonCode: 'evidence_verified',
  note: null,
} as const;

describe('intelligence governance contracts', () => {
  it.each([
    ['approve', 'evidence_verified'],
    ['reject', 'claim_not_supported'],
    ['reject', 'source_mismatch'],
    ['needs_review', 'source_mismatch'],
    ['needs_review', 'grounding_failed'],
    ['needs_review', 'insufficient_context'],
    ['needs_review', 'historical_reconciliation_failed'],
  ] as const)('accepts valid %s/%s command combinations', (decision, reasonCode) => {
    expect(candidateReviewCommandV1Schema.parse({ ...command, decision, reasonCode })).toEqual({
      ...command,
      decision,
      reasonCode,
    });
  });

  it('rejects invalid command versions, IDs, versions, combinations, and keys', () => {
    expect(candidateReviewCommandV1Schema.parse(command)).toEqual(command);
    expect(() => candidateReviewCommandV1Schema.parse({ ...command, extra: true })).toThrow();
    expect(() =>
      candidateReviewCommandV1Schema.parse({
        ...command,
        decision: 'reject',
        reasonCode: 'evidence_verified',
      }),
    ).toThrow();
    expect(candidateReviewCommandV1Schema.safeParse({ ...command, version: 2 }).success).toBe(false);
    expect(candidateReviewCommandV1Schema.safeParse({ ...command, candidateId: 'invalid' }).success).toBe(
      false,
    );
    expect(
      candidateReviewCommandV1Schema.safeParse({ ...command, expectedCandidateVersion: 0 }).success,
    ).toBe(false);
    expect(
      candidateReviewCommandV1Schema.safeParse({
        ...command,
        expectedCandidateVersion: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });

  it('trims bounded nonblank review notes', () => {
    expect(candidateReviewCommandV1Schema.parse({ ...command, note: '  verified  ' }).note).toBe(
      'verified',
    );
    expect(candidateReviewCommandV1Schema.safeParse({ ...command, note: '   ' }).success).toBe(false);
    expect(candidateReviewCommandV1Schema.safeParse({ ...command, note: 'a'.repeat(1001) }).success).toBe(
      false,
    );
  });

  it('defines exact-quote evidence locators with strict bounds', () => {
    const locator = {
      version: 1,
      kind: 'exact_quote',
      sourceField: 'article_raw_text',
      quote: 'A grounded quote.',
    } as const;
    expect(evidenceLocatorV1Schema.parse(locator)).toEqual(locator);
    expect(evidenceLocatorV1Schema.safeParse({ ...locator, quote: 'short' }).success).toBe(false);
    expect(evidenceLocatorV1Schema.safeParse({ ...locator, quote: ' '.repeat(10) }).success).toBe(false);
    expect(evidenceLocatorV1Schema.safeParse({ ...locator, quote: 'a'.repeat(501) }).success).toBe(false);
    expect(evidenceLocatorV1Schema.safeParse({ ...locator, sourceField: 'url' }).success).toBe(false);
    expect(evidenceLocatorV1Schema.safeParse({ ...locator, url: 'https://example.test' }).success).toBe(
      false,
    );
  });

  it('enumerates stable review reason codes', () => {
    expect(candidateReviewReasonCodeSchema.parse('historical_reconciliation_failed')).toBe(
      'historical_reconciliation_failed',
    );
    expect(candidateReviewReasonCodeSchema.safeParse('other').success).toBe(false);
  });

  it.each([
    ['promoted', signalId, evidenceId],
    ['rejected', null, null],
    ['needs_review', null, null],
  ] as const)('requires result IDs appropriate to %s outcomes', (outcome, resultSignalId, resultEvidenceId) => {
    const result = {
      version: 1,
      commandId,
      candidateId,
      candidateVersion: 2,
      decisionId,
      outcome,
      signalId: resultSignalId,
      evidenceId: resultEvidenceId,
      replayed: false,
    };
    expect(candidateReviewResultV1Schema.parse(result)).toEqual(result);
  });

  it('rejects result IDs that do not match the outcome and unknown keys', () => {
    const result = {
      version: 1,
      commandId,
      candidateId,
      candidateVersion: 2,
      decisionId,
      outcome: 'rejected',
      signalId: null,
      evidenceId: null,
      replayed: false,
    } as const;
    expect(candidateReviewResultV1Schema.safeParse({ ...result, signalId }).success).toBe(false);
    expect(candidateReviewResultV1Schema.safeParse({ ...result, extra: true }).success).toBe(false);
  });

  it('accepts only strict governed outbox payloads', () => {
    const promoted = {
      version: 1,
      eventType: 'intelligence.signal.promoted.v1',
      candidateId,
      candidateVersion: 2,
      decisionId,
      signalId,
      evidenceId,
      occurredAt,
    } as const;
    const reviewed = {
      version: 1,
      eventType: 'intelligence.candidate.reviewed.v1',
      candidateId,
      candidateVersion: 2,
      decisionId,
      outcome: 'needs_review',
      occurredAt,
    } as const;
    expect(governanceOutboxEventV1Schema.parse(promoted)).toEqual(promoted);
    expect(governanceOutboxEventV1Schema.parse(reviewed)).toEqual(reviewed);
    expect(
      governanceOutboxEventV1Schema.parse({ ...reviewed, outcome: 'promoted' }),
    ).toEqual({ ...reviewed, outcome: 'promoted' });
  });

  it.each(['quote', 'url', 'payload', 'note', 'headers', 'credentials'])(
    'rejects sensitive outbox field %s',
    (key) => {
      const reviewed = {
        version: 1,
        eventType: 'intelligence.candidate.reviewed.v1',
        candidateId,
        candidateVersion: 2,
        decisionId,
        outcome: 'rejected',
        occurredAt,
      };
      expect(governanceOutboxEventV1Schema.safeParse({ ...reviewed, [key]: 'secret' }).success).toBe(
        false,
      );
    },
  );
});
