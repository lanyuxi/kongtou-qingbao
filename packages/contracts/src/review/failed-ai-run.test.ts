import { describe, expect, it } from 'vitest';

import * as contracts from '../index.js';

const runId = 'a1000000-0000-4000-8000-000000000001';
const projectId = 'a1000000-0000-4000-8000-000000000002';
const sourceId = 'a1000000-0000-4000-8000-000000000003';
const decisionId = 'a1000000-0000-4000-8000-000000000004';
const commandId = 'a1000000-0000-4000-8000-000000000005';
const reviewerUserId = 'a1000000-0000-4000-8000-000000000006';
const cursor =
  'eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTIyVDAwOjAwOjAwLjAwMFoiLCJpZCI6ImExMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9';

const validListItem = {
  version: 1,
  runId,
  status: 'provider_error',
  safeFailureCode: 'provider_error',
  stage: 'extract_discovered_item',
  inputKind: 'discovered_item',
  modelId: 'review-test-model',
  promptVersion: 'extract-v1',
  schemaVersion: 'candidate-v1',
  pipelineVersion: 'pipeline-v1',
  project: null,
  source: null,
  createdAt: '2026-08-22T00:00:00.000Z',
  reviewState: 'unreviewed',
  reviewVersion: 0,
  latestDecisionAt: null,
} as const;

const validDecisionRecord = {
  version: 1,
  decisionId,
  reviewVersion: 1,
  decision: 'dismiss',
  reasonCode: 'transient_failure',
  note: null,
  reviewerUserId,
  createdAt: '2026-08-22T00:00:00.000Z',
} as const;

describe('failed AI run review contracts', () => {
  it('accepts every documented enum literal', () => {
    for (const status of ['provider_error', 'schema_invalid_after_repair', 'grounding_failed']) {
      expect(contracts.failedAiRunStatusSchema.parse(status)).toBe(status);
    }
    for (const state of ['unreviewed', 'needs_investigation', 'dismissed']) {
      expect(contracts.failedAiRunReviewStateSchema.parse(state)).toBe(state);
    }
    for (const decision of ['needs_investigation', 'dismiss']) {
      expect(contracts.failedAiRunDecisionSchema.parse(decision)).toBe(decision);
    }
    for (const reason of [
      'provider_instability',
      'schema_regression',
      'grounding_regression',
      'source_data_problem',
      'suspected_prompt_injection',
      'transient_failure',
      'duplicate_or_superseded',
      'expected_invalid_input',
      'no_action_needed',
      'other',
    ]) {
      expect(contracts.failedAiRunReasonCodeSchema.parse(reason)).toBe(reason);
    }
  });

  it('uses safe defaults and validates the opaque cursor', () => {
    expect(contracts.failedAiRunListQuerySchema.parse({})).toEqual({
      reviewState: 'all',
      status: 'all',
      cursor: null,
      limit: 25,
    });
    expect(
      contracts.failedAiRunListQuerySchema.parse({
        reviewState: 'dismissed',
        status: 'grounding_failed',
        cursor,
        limit: 1,
      }),
    ).toEqual({
      reviewState: 'dismissed',
      status: 'grounding_failed',
      cursor,
      limit: 1,
    });
    expect(contracts.failedAiRunListQuerySchema.parse({ limit: 100 }).limit).toBe(100);

    for (const malformedCursor of [
      'not-a-cursor',
      '@@@',
      'e30',
      'eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTIyVDAwOjAwOjAwLjAwMFoifQ',
    ]) {
      expect(() => contracts.failedAiRunListQuerySchema.parse({ cursor: malformedCursor })).toThrow();
    }
    for (const invalidLimit of [0, 101, 1.5, -1]) {
      expect(() => contracts.failedAiRunListQuerySchema.parse({ limit: invalidLimit })).toThrow();
    }
  });

  it('rejects malformed query values and unknown query fields', () => {
    expect(() => contracts.failedAiRunListQuerySchema.parse({ reviewState: 'unknown' })).toThrow();
    expect(() => contracts.failedAiRunListQuerySchema.parse({ status: 'succeeded' })).toThrow();
    expect(() => contracts.failedAiRunListQuerySchema.parse({ cursor: 42 })).toThrow();
    expect(() => contracts.failedAiRunListQuerySchema.parse({ extra: true })).toThrow();
  });

  it('accepts a safe list item with optional catalog projections', () => {
    expect(
      contracts.failedAiRunListItemSchema.parse({
        ...validListItem,
        project: { id: projectId, slug: 'ethereum', name: 'Ethereum' },
        source: { id: sourceId, name: 'Official Blog', sourceType: 'official_web' },
        reviewState: 'needs_investigation',
        reviewVersion: 2,
        latestDecisionAt: '2026-08-22T01:00:00.000Z',
      }),
    ).toEqual({
      ...validListItem,
      project: { id: projectId, slug: 'ethereum', name: 'Ethereum' },
      source: { id: sourceId, name: 'Official Blog', sourceType: 'official_web' },
      reviewState: 'needs_investigation',
      reviewVersion: 2,
      latestDecisionAt: '2026-08-22T01:00:00.000Z',
    });
  });

  it('rejects unsafe list projections and malformed metadata', () => {
    expect(() => contracts.failedAiRunListItemSchema.parse({ ...validListItem, errorDetail: 'provider password=secret' })).toThrow();
    expect(() => contracts.failedAiRunListItemSchema.parse({ ...validListItem, output: { secret: true } })).toThrow();
    expect(() => contracts.failedAiRunListItemSchema.parse({ ...validListItem, safeFailureCode: 'grounding_failed' })).toThrow();
    expect(() => contracts.failedAiRunListItemSchema.parse({ ...validListItem, runId: 'not-a-uuid' })).toThrow();
    expect(() => contracts.failedAiRunListItemSchema.parse({ ...validListItem, createdAt: 'not-a-timestamp' })).toThrow();
    expect(() => contracts.failedAiRunListItemSchema.parse({ ...validListItem, reviewVersion: -1 })).toThrow();
    expect(() => contracts.failedAiRunListItemSchema.parse({ ...validListItem, latestDecisionAt: 'not-a-timestamp' })).toThrow();
  });

  it('accepts a safe detail projection with ordered decision records', () => {
    expect(
      contracts.failedAiRunDetailSchema.parse({
        version: 1,
        run: validListItem,
        input: { kind: 'raw_item', id: sourceId, collectedAt: '2026-08-21T23:00:00.000Z' },
        decisions: [validDecisionRecord],
      }),
    ).toEqual({
      version: 1,
      run: validListItem,
      input: { kind: 'raw_item', id: sourceId, collectedAt: '2026-08-21T23:00:00.000Z' },
      decisions: [validDecisionRecord],
    });
    expect(
      contracts.failedAiRunDetailSchema.parse({
        version: 1,
        run: validListItem,
        input: { kind: 'discovered_item', id: sourceId, collectedAt: null },
        decisions: [],
      }).decisions,
    ).toEqual([]);
  });

  it('rejects raw detail fields and malformed decision history', () => {
    expect(() => contracts.failedAiRunDetailSchema.parse({
      version: 1,
      run: validListItem,
      input: { kind: 'raw_item', id: sourceId, collectedAt: null, content: 'raw source' },
      decisions: [],
    })).toThrow();
    expect(() => contracts.failedAiRunDetailSchema.parse({
      version: 1,
      run: validListItem,
      input: { kind: 'raw_item', id: 'bad', collectedAt: null },
      decisions: [],
    })).toThrow();
    expect(() => contracts.failedAiRunDetailSchema.parse({
      version: 1,
      run: validListItem,
      input: { kind: 'raw_item', id: sourceId, collectedAt: null },
      decisions: [{ ...validDecisionRecord, reviewVersion: 0 }],
    })).toThrow();
    expect(() => contracts.failedAiRunDetailSchema.parse({
      version: 1,
      run: validListItem,
      input: { kind: 'raw_item', id: sourceId, collectedAt: null },
      decisions: [{ ...validDecisionRecord, note: '   ' }],
    })).toThrow();
  });

  it('accepts an investigation command with a compatible reason and trims its note', () => {
    expect(contracts.failedAiRunDecisionCommandSchema.parse({
      version: 1,
      expectedReviewVersion: 0,
      decision: 'needs_investigation',
      reasonCode: 'provider_instability',
      note: '  Check provider status.  ',
    })).toEqual({
      version: 1,
      expectedReviewVersion: 0,
      decision: 'needs_investigation',
      reasonCode: 'provider_instability',
      note: 'Check provider status.',
    });
  });

  it('accepts a dismissal command with each dismissal reason', () => {
    for (const reasonCode of [
      'transient_failure',
      'duplicate_or_superseded',
      'expected_invalid_input',
      'no_action_needed',
      'other',
    ]) {
      expect(contracts.failedAiRunDecisionCommandSchema.parse({
        version: 1,
        expectedReviewVersion: 4,
        decision: 'dismiss',
        reasonCode,
        note: null,
      }).reasonCode).toBe(reasonCode);
    }
  });

  it('rejects every incompatible decision/reason pair', () => {
    const investigationReasons = [
      'provider_instability',
      'schema_regression',
      'grounding_regression',
      'source_data_problem',
      'suspected_prompt_injection',
    ];
    const dismissalReasons = [
      'transient_failure',
      'duplicate_or_superseded',
      'expected_invalid_input',
      'no_action_needed',
    ];
    for (const reasonCode of dismissalReasons) {
      expect(() => contracts.failedAiRunDecisionCommandSchema.parse({
        version: 1,
        expectedReviewVersion: 0,
        decision: 'needs_investigation',
        reasonCode,
        note: null,
      })).toThrow();
    }
    for (const reasonCode of investigationReasons) {
      expect(() => contracts.failedAiRunDecisionCommandSchema.parse({
        version: 1,
        expectedReviewVersion: 0,
        decision: 'dismiss',
        reasonCode,
        note: null,
      })).toThrow();
    }
  });

  it('rejects malformed commands, unknown fields, whitespace notes, and overlong notes', () => {
    expect(() => contracts.failedAiRunDecisionCommandSchema.parse({
      version: 1,
      expectedReviewVersion: -1,
      decision: 'dismiss',
      reasonCode: 'other',
      note: null,
    })).toThrow();
    expect(() => contracts.failedAiRunDecisionCommandSchema.parse({
      version: 2,
      expectedReviewVersion: 0,
      decision: 'dismiss',
      reasonCode: 'other',
      note: null,
    })).toThrow();
    expect(() => contracts.failedAiRunDecisionCommandSchema.parse({
      version: 1,
      expectedReviewVersion: 0,
      decision: 'dismiss',
      reasonCode: 'other',
      note: ' \t\n ',
    })).toThrow();
    expect(() => contracts.failedAiRunDecisionCommandSchema.parse({
      version: 1,
      expectedReviewVersion: 0,
      decision: 'dismiss',
      reasonCode: 'other',
      note: 'a'.repeat(1001),
    })).toThrow();
    expect(() => contracts.failedAiRunDecisionCommandSchema.parse({
      version: 1,
      expectedReviewVersion: 0,
      decision: 'dismiss',
      reasonCode: 'other',
      note: null,
      reviewerUserId,
    })).toThrow();
  });

  it('accepts and strictly validates a decision result', () => {
    expect(contracts.failedAiRunDecisionResultSchema.parse({
      version: 1,
      commandId,
      runId,
      decisionId,
      reviewVersion: 1,
      reviewState: 'dismissed',
      replayed: false,
    })).toEqual({
      version: 1,
      commandId,
      runId,
      decisionId,
      reviewVersion: 1,
      reviewState: 'dismissed',
      replayed: false,
    });
    expect(() => contracts.failedAiRunDecisionResultSchema.parse({
      version: 1,
      commandId,
      runId,
      decisionId,
      reviewVersion: 0,
      reviewState: 'unreviewed',
      replayed: false,
    })).toThrow();
    expect(() => contracts.failedAiRunDecisionResultSchema.parse({
      version: 1,
      commandId,
      runId,
      decisionId,
      reviewVersion: 1,
      reviewState: 'dismissed',
      replayed: false,
      errorDetail: 'secret',
    })).toThrow();
  });
});
