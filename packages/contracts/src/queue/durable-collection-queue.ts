import { z } from 'zod';

import { collectionOutcomeSchema } from '../collection/source-collection.js';
import { createJobEnvelopeSchema } from '../jobs/envelope.js';

export const durableJobStateSchema = z.enum([
  'queued',
  'leased',
  'retry_wait',
  'succeeded',
  'dead_letter',
  'canceled',
]);

export const durableJobEventTypeSchema = z.enum([
  'enqueued',
  'claimed',
  'lease_renewed',
  'lease_expired',
  'retry_scheduled',
  'succeeded',
  'dead_lettered',
  'canceled',
]);

export const sourceScheduleCommandTypeSchema = z.enum([
  'pause',
  'resume',
  'change_interval',
  'collect_now',
]);

export const collectionJobTriggerSchema = z.enum(['scheduled', 'manual']);

export const queueResultCodeSchema = z.enum([
  ...collectionOutcomeSchema.options,
  'source_ineligible',
  'queue_persistence_failed',
  'lease_fence_lost',
  'invalid_queue_runtime_configuration',
]);

export const scheduledCollectSourcePayloadSchema = z
  .object({
    projectId: z.string().uuid(),
    sourceId: z.string().uuid(),
    scheduleId: z.string().uuid(),
    scheduleVersion: z.number().int().positive(),
    collectionRuleVersion: z.string().trim().min(1).max(100),
    trigger: collectionJobTriggerSchema,
    scheduledFor: z.string().datetime({ offset: true }),
  })
  .strict();

export const scheduledCollectSourceJobSchema = createJobEnvelopeSchema(
  'collect.source',
  scheduledCollectSourcePayloadSchema,
);

const scheduleCommandBaseSchema = z.object({
  version: z.literal(1),
  expectedVersion: z.number().int().nonnegative(),
}).strict();

export const sourceScheduleCommandSchema = z.discriminatedUnion('command', [
  scheduleCommandBaseSchema
    .extend({ command: z.literal('pause'), intervalSeconds: z.null() })
    .strict(),
  scheduleCommandBaseSchema
    .extend({ command: z.literal('resume'), intervalSeconds: z.null() })
    .strict(),
  scheduleCommandBaseSchema
    .extend({
      command: z.literal('change_interval'),
      intervalSeconds: z.number().int().min(300).max(604800),
    })
    .strict(),
  scheduleCommandBaseSchema
    .extend({ command: z.literal('collect_now'), intervalSeconds: z.null() })
    .strict(),
]);

export const sourceScheduleCommandResultSchema = z
  .object({
    scheduleId: z.string().uuid(),
    command: sourceScheduleCommandTypeSchema,
    scheduleVersion: z.number().int().positive(),
    enabled: z.boolean(),
    intervalSeconds: z.number().int().min(300).max(604800),
    nextRunAt: z.string().datetime({ offset: true }),
    jobId: z.string().uuid().nullable(),
    replayed: z.boolean(),
  })
  .strict();

export const claimedCollectionJobSchema = z
  .object({
    jobId: z.string().uuid(),
    payload: scheduledCollectSourcePayloadSchema,
    executionAttempt: z.number().int().min(1).max(5),
    deliveryCount: z.number().int().positive(),
    maxAttempts: z.literal(5),
    leaseOwner: z.string().trim().min(1).max(255),
    leaseEpoch: z.number().int().positive(),
    leaseExpiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const queueHealthSnapshotSchema = z
  .object({
    queuedCount: z.number().int().nonnegative(),
    retryWaitCount: z.number().int().nonnegative(),
    leasedCount: z.number().int().nonnegative(),
    expiredLeaseCount: z.number().int().nonnegative(),
    deadLetterCount: z.number().int().nonnegative(),
    oldestRunnableAgeSeconds: z.number().int().nonnegative().nullable(),
  })
  .strict();

export type DurableJobState = z.infer<typeof durableJobStateSchema>;
export type DurableJobEventType = z.infer<typeof durableJobEventTypeSchema>;
export type SourceScheduleCommandType = z.infer<typeof sourceScheduleCommandTypeSchema>;
export type CollectionJobTrigger = z.infer<typeof collectionJobTriggerSchema>;
export type QueueResultCode = z.infer<typeof queueResultCodeSchema>;
export type ScheduledCollectSourcePayload = z.infer<typeof scheduledCollectSourcePayloadSchema>;
export type ScheduledCollectSourceJob = z.infer<typeof scheduledCollectSourceJobSchema>;
export type SourceScheduleCommand = z.infer<typeof sourceScheduleCommandSchema>;
export type SourceScheduleCommandResult = z.infer<typeof sourceScheduleCommandResultSchema>;
export type ClaimedCollectionJob = z.infer<typeof claimedCollectionJobSchema>;
export type QueueHealthSnapshot = z.infer<typeof queueHealthSnapshotSchema>;
