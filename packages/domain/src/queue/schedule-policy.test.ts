import type { ProjectLifecycle, SourceStatus } from '@airdrop/contracts';
import { describe, expect, it } from 'vitest';

import {
  CollectionIntervalError,
  assertCollectionInterval,
  calculateNextRunAt,
  deterministicJitterSeconds,
  isAutomaticCollectionEligible,
} from './schedule-policy.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const SCHEDULED_FOR = '2026-08-13T12:00:00.000Z';

describe('automatic collection eligibility', () => {
  const eligibleInput = {
    enabled: true,
    projectLifecycle: 'active' as ProjectLifecycle,
    sourceStatus: 'active' as SourceStatus,
    isOfficial: true,
    verifiedAt: '2026-08-13T10:00:00.000Z',
    verifiedBy: 'reviewer-1',
  };

  it.each([
    ['active', true],
    ['degraded', false],
    ['suspended', false],
    ['retired', false],
  ] as const)('requires an active source when status is %s', (sourceStatus, expected) => {
    expect(isAutomaticCollectionEligible({ ...eligibleInput, sourceStatus })).toBe(expected);
  });

  it.each([
    ['rumored', false],
    ['active', true],
    ['paused', false],
    ['ended', false],
    ['archived', false],
  ] as const)('requires an active project when lifecycle is %s', (projectLifecycle, expected) => {
    expect(isAutomaticCollectionEligible({ ...eligibleInput, projectLifecycle })).toBe(expected);
  });

  it.each([
    ['disabled schedule', { enabled: false }, false],
    ['non-official relationship', { isOfficial: false }, false],
    ['missing verification time', { verifiedAt: null }, false],
    ['missing verifier', { verifiedBy: null }, false],
  ] as const)('rejects %s', (_name, override, expected) => {
    expect(isAutomaticCollectionEligible({ ...eligibleInput, ...override })).toBe(expected);
  });
});

describe('collection interval validation', () => {
  it.each([300, 1_800, 604_800])('accepts the inclusive interval boundary %d', (seconds) => {
    expect(assertCollectionInterval(seconds)).toBe(seconds);
  });

  it.each([299, 604_801, 300.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid interval %s with a stable domain error',
    (seconds) => {
      expect(() => assertCollectionInterval(seconds)).toThrow(
        expect.objectContaining<Partial<CollectionIntervalError>>({
          code: 'invalid_collection_interval',
        }),
      );
    },
  );
});

describe('deterministic scheduling', () => {
  it('uses the fixed FNV-1a conformance vector and remains stable', () => {
    const input = {
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      scheduledFor: SCHEDULED_FOR,
      intervalSeconds: 1_800,
    };

    expect(deterministicJitterSeconds(input)).toBe(32);
    expect(deterministicJitterSeconds(input)).toBe(32);
  });

  it.each([
    ['different project', '33333333-3333-4333-8333-333333333333', SOURCE_ID, SCHEDULED_FOR],
    ['different source', PROJECT_ID, '44444444-4444-4444-8444-444444444444', SCHEDULED_FOR],
    ['different window', PROJECT_ID, SOURCE_ID, '2026-08-13T12:30:00.000Z'],
  ] as const)('keeps %s jitter within the interval-derived bound', (_name, projectId, sourceId, scheduledFor) => {
    const jitter = deterministicJitterSeconds({
      projectId,
      sourceId,
      scheduledFor,
      intervalSeconds: 1_800,
    });

    expect(jitter).toBeGreaterThanOrEqual(0);
    expect(jitter).toBeLessThanOrEqual(180);
  });

  it('caps jitter at 300 seconds for long intervals', () => {
    expect(
      deterministicJitterSeconds({
        projectId: PROJECT_ID,
        sourceId: SOURCE_ID,
        scheduledFor: SCHEDULED_FOR,
        intervalSeconds: 604_800,
      }),
    ).toBeLessThanOrEqual(300);
  });

  it('coalesces overdue windows by advancing exactly one interval from the injected time', () => {
    const now = new Date('2026-08-13T12:17:45.000Z');

    expect(calculateNextRunAt({ now, intervalSeconds: 1_800 }).toISOString()).toBe(
      '2026-08-13T12:47:45.000Z',
    );
    expect(now.toISOString()).toBe('2026-08-13T12:17:45.000Z');
  });
});
