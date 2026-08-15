export const ORCHESTRATION_BACKOFF_CAP_MS = 900_000;

export type OrchestrationPolicyErrorCode =
  | 'invalid_failure_count'
  | 'invalid_base_interval_ms'
  | 'invalid_backoff_cap_ms';

export class OrchestrationPolicyError extends Error {
  constructor(readonly code: OrchestrationPolicyErrorCode) {
    super(code);
    this.name = 'OrchestrationPolicyError';
  }
}

/**
 * Deterministic exponential backoff for orchestration stages.
 *
 * A stage that keeps failing waits `baseMs * 2^consecutiveFailures` before its
 * next attempt, capped at `capMs` (default 15 minutes). A success resets the
 * failure count, restoring the base interval.
 */
export function backoffDelayMs(
  consecutiveFailures: number,
  baseMs: number,
  capMs: number = ORCHESTRATION_BACKOFF_CAP_MS,
): number {
  if (!Number.isInteger(consecutiveFailures) || consecutiveFailures < 0) {
    throw new OrchestrationPolicyError('invalid_failure_count');
  }
  if (!Number.isInteger(baseMs) || baseMs <= 0) {
    throw new OrchestrationPolicyError('invalid_base_interval_ms');
  }
  if (!Number.isInteger(capMs) || capMs < baseMs) {
    throw new OrchestrationPolicyError('invalid_backoff_cap_ms');
  }

  const uncapped = baseMs * 2 ** consecutiveFailures;
  return Math.min(capMs, Number.isFinite(uncapped) ? uncapped : capMs);
}
