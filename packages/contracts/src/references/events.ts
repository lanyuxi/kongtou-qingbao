import { z } from 'zod';

import { referenceStateSchema } from './enums.js';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const positiveVersionSchema = z.number().int().safe().positive();

const eventBase = {
  version: z.literal(1),
  aggregateId: uuidSchema,
  aggregateVersion: positiveVersionSchema,
  occurredAt: timestampSchema,
};

// Exact outbox event shapes. Every payload enumerates only safe keys, so a
// reviewer note, Evidence locator, or actor identity can never be published.
export const referenceOutboxEventV1Schema = z.discriminatedUnion('eventType', [
  z.strictObject({
    ...eventBase,
    eventType: z.literal('reference.registered.v1'),
    projectId: uuidSchema,
  }),
  z.strictObject({
    ...eventBase,
    eventType: z.literal('reference.decided.v1'),
    decisionId: uuidSchema,
    resultingState: referenceStateSchema,
  }),
  z.strictObject({
    ...eventBase,
    eventType: z.literal('domain_authority.decided.v1'),
    decisionId: uuidSchema,
    resultingState: z.enum(['candidate', 'granted', 'revoked']),
  }),
  z.strictObject({
    ...eventBase,
    eventType: z.literal('reference.security_flagged.v1'),
    indicatorId: uuidSchema,
  }),
]);

export type ReferenceOutboxEventV1 = z.infer<typeof referenceOutboxEventV1Schema>;
