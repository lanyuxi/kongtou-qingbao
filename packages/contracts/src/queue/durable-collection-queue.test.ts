import { describe, expect, it } from 'vitest';

import {
  claimedCollectionJobSchema,
  collectionJobTriggerSchema,
  durableJobEventTypeSchema,
  durableJobStateSchema,
  queueHealthSnapshotSchema,
  queueResultCodeSchema,
  scheduledCollectSourceJobSchema,
  scheduledCollectSourcePayloadSchema,
  sourceScheduleCommandResultSchema,
  sourceScheduleCommandSchema,
  sourceScheduleCommandTypeSchema,
} from '../index.js';

const projectId = '20000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000002';
const scheduleId = '20000000-0000-4000-8000-000000000003';
const jobId = '20000000-0000-4000-8000-000000000004';

const payload = {
  projectId,
  sourceId,
  scheduleId,
  scheduleVersion: 3,
  collectionRuleVersion: 'collection-v1',
  trigger: 'scheduled',
  scheduledFor: '2026-08-13T12:00:00.000Z',
};

describe('durable collection queue contracts', () => {
  it('accepts the minimal scheduled collection payload and rejects source content', () => {
    expect(scheduledCollectSourcePayloadSchema.parse(payload)).toEqual(payload);
    expect(() => scheduledCollectSourcePayloadSchema.parse({ ...payload, rawText: '<html />' })).toThrow();
  });

  it('rejects malformed scheduled collection payload identifiers, timestamps, and enum values', () => {
    expect(scheduledCollectSourcePayloadSchema.safeParse({ ...payload, projectId: 'not-a-uuid' }).success).toBe(false);
    expect(scheduledCollectSourcePayloadSchema.safeParse({ ...payload, scheduledFor: 'not-a-time' }).success).toBe(false);
    expect(scheduledCollectSourcePayloadSchema.safeParse({ ...payload, trigger: 'replayed' }).success).toBe(false);
  });

  it('accepts only version-one bounded-idempotency durable collection jobs', () => {
    const job = {
      jobId,
      type: 'collect.source',
      version: 1,
      idempotencyKey: 'scheduled:source:3',
      correlationId: '20000000-0000-4000-8000-000000000005',
      occurredAt: '2026-08-13T12:00:00.000Z',
      payload,
    };

    expect(scheduledCollectSourceJobSchema.parse(job)).toEqual(job);
    expect(scheduledCollectSourceJobSchema.safeParse({ ...job, version: 2 }).success).toBe(false);
    expect(scheduledCollectSourceJobSchema.safeParse({ ...job, idempotencyKey: '   ' }).success).toBe(false);
    expect(scheduledCollectSourceJobSchema.safeParse({ ...job, idempotencyKey: 'a'.repeat(256) }).success).toBe(false);
    expect(scheduledCollectSourceJobSchema.safeParse({ ...job, occurredAt: 'tomorrow' }).success).toBe(false);
  });

  it('requires an interval only when changing the schedule interval', () => {
    const change = { version: 1, command: 'change_interval', expectedVersion: 2, intervalSeconds: 300 };

    expect(sourceScheduleCommandSchema.parse(change)).toEqual(change);
    expect(sourceScheduleCommandSchema.safeParse({ ...change, intervalSeconds: 299 }).success).toBe(false);
    expect(sourceScheduleCommandSchema.safeParse({ ...change, intervalSeconds: 604801 }).success).toBe(false);
    expect(sourceScheduleCommandSchema.safeParse({ ...change, intervalSeconds: null }).success).toBe(false);
    expect(
      sourceScheduleCommandSchema.safeParse({ version: 1, command: 'pause', expectedVersion: 2, intervalSeconds: null }).success,
    ).toBe(true);
    expect(
      sourceScheduleCommandSchema.safeParse({ version: 1, command: 'collect_now', expectedVersion: 2, intervalSeconds: 300 }).success,
    ).toBe(false);
    expect(sourceScheduleCommandSchema.safeParse({ ...change, version: 2 }).success).toBe(false);
    expect(sourceScheduleCommandSchema.safeParse({ ...change, command: 'delete' }).success).toBe(false);
    expect(sourceScheduleCommandSchema.safeParse({ ...change, unexpected: true }).success).toBe(false);
  });

  it('accepts strict command results and claimed jobs without queue internals', () => {
    const commandResult = {
      scheduleId,
      command: 'collect_now',
      scheduleVersion: 4,
      enabled: true,
      intervalSeconds: 3600,
      nextRunAt: '2026-08-13T13:00:00.000Z',
      jobId,
      replayed: false,
    };
    const claimedJob = {
      jobId,
      payload,
      executionAttempt: 1,
      deliveryCount: 1,
      maxAttempts: 5,
      leaseOwner: 'queue-worker-1',
      leaseEpoch: 1,
      leaseExpiresAt: '2026-08-13T12:02:00.000Z',
    };

    expect(sourceScheduleCommandResultSchema.parse(commandResult)).toEqual(commandResult);
    expect(claimedCollectionJobSchema.parse(claimedJob)).toEqual(claimedJob);
    expect(claimedCollectionJobSchema.safeParse({ ...claimedJob, sql: 'select * from jobs' }).success).toBe(false);
    expect(claimedCollectionJobSchema.safeParse({ ...claimedJob, leaseOwner: ' ' }).success).toBe(false);
    expect(claimedCollectionJobSchema.safeParse({ ...claimedJob, executionAttempt: 6 }).success).toBe(false);
    expect(sourceScheduleCommandResultSchema.safeParse({ ...commandResult, nextRunAt: 'not-a-time' }).success).toBe(false);
  });

  it('accepts only stable queue enums and count-only health snapshots', () => {
    expect(durableJobStateSchema.parse('leased')).toBe('leased');
    expect(durableJobEventTypeSchema.parse('lease_renewed')).toBe('lease_renewed');
    expect(sourceScheduleCommandTypeSchema.parse('resume')).toBe('resume');
    expect(collectionJobTriggerSchema.parse('manual')).toBe('manual');
    expect(queueResultCodeSchema.parse('source_ineligible')).toBe('source_ineligible');
    expect(queueResultCodeSchema.parse('source_security_blocked')).toBe('source_security_blocked');
    expect(durableJobStateSchema.safeParse('running').success).toBe(false);
    expect(queueResultCodeSchema.safeParse('unexpected').success).toBe(false);

    const health = {
      queuedCount: 2,
      retryWaitCount: 1,
      leasedCount: 3,
      expiredLeaseCount: 0,
      deadLetterCount: 4,
      oldestRunnableAgeSeconds: null,
    };
    expect(queueHealthSnapshotSchema.parse(health)).toEqual(health);
    expect(queueHealthSnapshotSchema.safeParse({ ...health, oldestRunnableAgeSeconds: -1 }).success).toBe(false);
    expect(queueHealthSnapshotSchema.safeParse({ ...health, databaseUrl: 'secret' }).success).toBe(false);
  });
});
