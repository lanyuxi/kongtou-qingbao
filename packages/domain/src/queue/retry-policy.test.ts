import type { CollectionOutcome } from '@airdrop/contracts';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_COLLECTION_ATTEMPTS,
  classifyCollectionOutcome,
  collectorIdempotencyKey,
  retryDelaySeconds,
} from './retry-policy.js';

describe('collection outcome classification', () => {
  it.each([
    'stored_new_content',
    'not_modified',
    'unchanged_content',
  ] satisfies CollectionOutcome[])('classifies %s as succeeded', (outcome) => {
    expect(classifyCollectionOutcome(outcome)).toBe('succeeded');
  });

  it.each(['timeout', 'http_error', 'persistence_failed'] satisfies CollectionOutcome[])(
    'classifies %s as retryable',
    (outcome) => {
      expect(classifyCollectionOutcome(outcome)).toBe('retry');
    },
  );

  it.each([
    'rejected_url',
    'rejected_dns_target',
    'redirect_rejected',
    'unsupported_content_type',
    'invalid_text_encoding',
    'response_too_large',
    'invalid_feed',
    'discovered_only',
    'body_fetch_budget_exhausted',
    'security_blocked',
  ] satisfies CollectionOutcome[])('classifies %s as dead letter', (outcome) => {
    expect(classifyCollectionOutcome(outcome)).toBe('dead_letter');
  });
});

describe('retry delay', () => {
  it.each([
    [1, 60, 66],
    [2, 300, 330],
    [3, 900, 960],
    [4, 3_600, 3_660],
  ] as const)(
    'keeps failed execution attempt %d within its exact base and jitter bound',
    (executionAttempt, minimum, maximum) => {
      const delay = retryDelaySeconds({
        jobId: '11111111-1111-4111-8111-111111111111',
        executionAttempt,
        maxAttempts: DEFAULT_MAX_COLLECTION_ATTEMPTS,
      });

      expect(delay).toBeGreaterThanOrEqual(minimum);
      expect(delay).toBeLessThanOrEqual(maximum);
    },
  );

  it.each([
    [1, 64],
    [2, 307],
    [3, 921],
    [4, 3_625],
  ] as const)('uses a stable retry FNV-1a vector for attempt %d', (executionAttempt, expected) => {
    const input = {
      jobId: '11111111-1111-4111-8111-111111111111',
      executionAttempt,
      maxAttempts: DEFAULT_MAX_COLLECTION_ATTEMPTS,
    };

    expect(retryDelaySeconds(input)).toBe(expected);
    expect(retryDelaySeconds(input)).toBe(expected);
  });

  it('rejects retry scheduling after the maximum execution attempt', () => {
    expect(() =>
      retryDelaySeconds({
        jobId: '11111111-1111-4111-8111-111111111111',
        executionAttempt: DEFAULT_MAX_COLLECTION_ATTEMPTS,
        maxAttempts: DEFAULT_MAX_COLLECTION_ATTEMPTS,
      }),
    ).toThrow(expect.objectContaining({ code: 'collection_retry_exhausted' }));
  });

  it.each([
    [0, DEFAULT_MAX_COLLECTION_ATTEMPTS, 'invalid_collection_execution_attempt'],
    [1.5, DEFAULT_MAX_COLLECTION_ATTEMPTS, 'invalid_collection_execution_attempt'],
    [1, 0, 'invalid_max_collection_attempts'],
    [1, 1.5, 'invalid_max_collection_attempts'],
  ] as const)('rejects execution attempt %s with max attempts %s', (executionAttempt, maxAttempts, code) => {
    expect(() =>
      retryDelaySeconds({
        jobId: '11111111-1111-4111-8111-111111111111',
        executionAttempt,
        maxAttempts,
      }),
    ).toThrow(expect.objectContaining({ code }));
  });
});

describe('Collector idempotency keys', () => {
  const jobId = '11111111-1111-4111-8111-111111111111';

  it('keeps the key stable for delivery replay of the same execution attempt', () => {
    expect(collectorIdempotencyKey(jobId, 2)).toBe(`queue:${jobId}:attempt:2`);
    expect(collectorIdempotencyKey(jobId, 2)).toBe(`queue:${jobId}:attempt:2`);
  });

  it('changes the key when the execution attempt advances', () => {
    expect(collectorIdempotencyKey(jobId, 3)).not.toBe(collectorIdempotencyKey(jobId, 2));
  });

  it.each([
    ['not-a-uuid', 1],
    [jobId, 0],
    [jobId, 1.5],
  ] as const)('rejects invalid key input %s / %s', (candidateJobId, executionAttempt) => {
    expect(() => collectorIdempotencyKey(candidateJobId, executionAttempt)).toThrow();
  });
});
