import { z } from 'zod';

import {
  tutorialKindSchema,
  tutorialStatusSchema,
  tutorialStatusTriggerSchema,
} from './enums.js';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const positiveVersionSchema = z.number().int().safe().positive();

const eventBase = {
  version: z.literal(1),
  aggregateId: uuidSchema,
  aggregateVersion: positiveVersionSchema,
  occurredAt: timestampSchema,
};

// Exact outbox event shapes. Every payload enumerates only safe keys, so step
// content, reviewer notes, or actor identity can never be published through an
// event consumer.
export const tutorialOutboxEventV1Schema = z.discriminatedUnion('eventType', [
  z.strictObject({
    ...eventBase,
    eventType: z.literal('tutorial.published.v1'),
    projectId: uuidSchema,
    kind: tutorialKindSchema,
  }),
  z.strictObject({
    ...eventBase,
    eventType: z.literal('tutorial.status_changed.v1'),
    projectId: uuidSchema,
    fromStatus: tutorialStatusSchema,
    toStatus: tutorialStatusSchema,
    trigger: tutorialStatusTriggerSchema.nullable(),
  }),
]);

export type TutorialOutboxEventV1 = z.infer<typeof tutorialOutboxEventV1Schema>;
