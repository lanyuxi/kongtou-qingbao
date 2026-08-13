import type { CollectionOutcome, QueueResultCode } from '@airdrop/contracts';

import { fnv1a32 } from './fnv1a.js';

export const DEFAULT_MAX_COLLECTION_ATTEMPTS = 5;

const RETRY_BASE_DELAYS_SECONDS = [60, 300, 900, 3_600] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CollectionOutcomeClassification = 'succeeded' | 'retry' | 'dead_letter';
export type CollectionTerminalResultCode = Extract<QueueResultCode, CollectionOutcome>;

export interface RetryDelayInput {
  readonly jobId: string;
  readonly executionAttempt: number;
  readonly maxAttempts: number;
}

export type RetryPolicyErrorCode =
  | 'invalid_collection_job_id'
  | 'invalid_collection_execution_attempt'
  | 'invalid_max_collection_attempts'
  | 'collection_retry_exhausted';

export class CollectionRetryPolicyError extends Error {
  constructor(readonly code: RetryPolicyErrorCode) {
    super(code);
    this.name = 'CollectionRetryPolicyError';
  }
}

export function classifyCollectionOutcome(
  outcome: CollectionOutcome,
): CollectionOutcomeClassification {
  switch (outcome) {
    case 'stored_new_content':
    case 'not_modified':
    case 'unchanged_content':
      return 'succeeded';
    case 'timeout':
    case 'http_error':
    case 'persistence_failed':
      return 'retry';
    case 'rejected_url':
    case 'rejected_dns_target':
    case 'redirect_rejected':
    case 'unsupported_content_type':
    case 'invalid_text_encoding':
    case 'response_too_large':
    case 'invalid_feed':
    case 'discovered_only':
    case 'body_fetch_budget_exhausted':
      return 'dead_letter';
  }
}

export function retryDelaySeconds(input: RetryDelayInput): number {
  assertUuid(input.jobId);
  assertPositiveInteger(input.executionAttempt);
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts <= 0) {
    throw new CollectionRetryPolicyError('invalid_max_collection_attempts');
  }
  if (input.executionAttempt >= input.maxAttempts) {
    throw new CollectionRetryPolicyError('collection_retry_exhausted');
  }

  const delayIndex = Math.min(
    input.executionAttempt - 1,
    RETRY_BASE_DELAYS_SECONDS.length - 1,
  );
  const baseDelay = RETRY_BASE_DELAYS_SECONDS[delayIndex] ?? RETRY_BASE_DELAYS_SECONDS[0];
  const jitterBound = Math.min(60, Math.floor(baseDelay / 10));
  const jitter = fnv1a32(`${input.jobId}|retry|${input.executionAttempt}`) % (jitterBound + 1);
  return baseDelay + jitter;
}

export function collectorIdempotencyKey(jobId: string, executionAttempt: number): string {
  assertUuid(jobId);
  assertPositiveInteger(executionAttempt);
  return `queue:${jobId}:attempt:${executionAttempt}`;
}

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new CollectionRetryPolicyError('invalid_collection_job_id');
  }
}

function assertPositiveInteger(value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CollectionRetryPolicyError('invalid_collection_execution_attempt');
  }
}
