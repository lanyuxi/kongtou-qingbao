import { describe, expect, it } from 'vitest';

import {
  ORCHESTRATION_BACKOFF_CAP_MS,
  OrchestrationPolicyError,
  backoffDelayMs,
} from './backoff.js';

describe('backoffDelayMs', () => {
  it('returns the base interval while no stage failure has occurred', () => {
    expect(backoffDelayMs(0, 60_000)).toBe(60_000);
  });

  it('doubles the delay per consecutive failure', () => {
    expect(backoffDelayMs(1, 60_000)).toBe(120_000);
    expect(backoffDelayMs(2, 60_000)).toBe(240_000);
    expect(backoffDelayMs(3, 60_000)).toBe(480_000);
  });

  it('caps the delay at the orchestration backoff cap', () => {
    expect(backoffDelayMs(10, 60_000)).toBe(ORCHESTRATION_BACKOFF_CAP_MS);
    expect(backoffDelayMs(100, 60_000)).toBe(ORCHESTRATION_BACKOFF_CAP_MS);
  });

  it('respects a caller-supplied cap below the default', () => {
    expect(backoffDelayMs(5, 60_000, 180_000)).toBe(180_000);
  });

  it('rejects negative or fractional failure counts', () => {
    expect(() => backoffDelayMs(-1, 60_000)).toThrow(OrchestrationPolicyError);
    expect(() => backoffDelayMs(1.5, 60_000)).toThrow(OrchestrationPolicyError);
  });

  it('rejects non-positive base intervals', () => {
    expect(() => backoffDelayMs(0, 0)).toThrow(OrchestrationPolicyError);
    expect(() => backoffDelayMs(0, -1)).toThrow(OrchestrationPolicyError);
  });

  it('rejects caps below the base interval', () => {
    expect(() => backoffDelayMs(0, 60_000, 30_000)).toThrow(OrchestrationPolicyError);
  });
});
