import { describe, expect, it } from 'vitest';
import {
  collectSourceJobSchema,
  collectSourceResultSchema,
  collectionOutcomeSchema,
  MAX_COLLECTION_BODY_FETCHES,
  MAX_COLLECTION_DISCOVERIES,
} from '../index.js';

const baseJob = {
  jobId: '10000000-0000-4000-8000-000000000001',
  type: 'collect.source',
  version: 1,
  idempotencyKey: 'collect:project:source:v1',
  correlationId: '10000000-0000-4000-8000-000000000002',
  occurredAt: '2026-08-12T00:00:00.000Z',
  payload: {
    projectId: '10000000-0000-4000-8000-000000000003',
    sourceId: '10000000-0000-4000-8000-000000000004',
  },
};

describe('collect source contracts', () => {
  it('accepts only the strict version-one collect.source payload', () => {
    expect(collectSourceJobSchema.parse(baseJob)).toEqual(baseJob);
    expect(
      collectSourceJobSchema.safeParse({
        ...baseJob,
        payload: { ...baseJob.payload, url: 'https://attacker.test' },
      }).success,
    ).toBe(false);
    expect(collectSourceJobSchema.safeParse({ ...baseJob, version: 2 }).success).toBe(false);
  });

  it.each([
    'stored_new_content',
    'not_modified',
    'unchanged_content',
    'discovered_only',
    'body_fetch_budget_exhausted',
    'rejected_url',
    'rejected_dns_target',
    'redirect_rejected',
    'unsupported_content_type',
    'invalid_text_encoding',
    'response_too_large',
    'timeout',
    'http_error',
    'invalid_feed',
    'security_blocked',
    'persistence_failed',
  ])('accepts stable outcome %s', (outcome) => {
    expect(collectionOutcomeSchema.parse(outcome)).toBe(outcome);
  });

  it('rejects raw content and unknown keys from a result', () => {
    const result = {
      attemptId: '10000000-0000-4000-8000-000000000005',
      projectId: baseJob.payload.projectId,
      sourceId: baseJob.payload.sourceId,
      outcome: 'stored_new_content',
      rawItemId: '10000000-0000-4000-8000-000000000006',
      discoveredCount: 0,
      bodyFetchCount: 0,
    };
    expect(collectSourceResultSchema.parse(result)).toEqual(result);
    expect(collectSourceResultSchema.safeParse({ ...result, rawText: '<html />' }).success).toBe(
      false,
    );
  });

  it('bounds the collection budgets at the exported constants', () => {
    // The collector imports these same constants for its own budgets, so a
    // mismatch here would mean a busy pass fails strict parsing *after* it has
    // already committed its rows. Lock the numbers, not just the relationship.
    expect(MAX_COLLECTION_DISCOVERIES).toBe(100);
    expect(MAX_COLLECTION_BODY_FETCHES).toBe(35);
  });

  it.each([
    ['discoveredCount', MAX_COLLECTION_DISCOVERIES, true],
    ['discoveredCount', MAX_COLLECTION_DISCOVERIES + 1, false],
    ['bodyFetchCount', MAX_COLLECTION_BODY_FETCHES, true],
    ['bodyFetchCount', MAX_COLLECTION_BODY_FETCHES + 1, false],
  ] as const)('validates %s = %i as %s', (field, value, accepted) => {
    const result = {
      attemptId: '10000000-0000-4000-8000-000000000005',
      projectId: baseJob.payload.projectId,
      sourceId: baseJob.payload.sourceId,
      outcome: 'stored_new_content',
      rawItemId: null,
      discoveredCount: 0,
      bodyFetchCount: 0,
      [field]: value,
    };
    expect(collectSourceResultSchema.safeParse(result).success).toBe(accepted);
  });
});
