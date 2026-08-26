import { z } from 'zod';

import { activeSecurityPostureSchema } from './enums.js';
import { securityTargetSchema } from './candidate.js';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const positiveVersionSchema = z.number().int().safe().positive();
const eventBase = {
  version: z.literal(1),
  aggregateId: uuidSchema,
  aggregateVersion: positiveVersionSchema,
  target: securityTargetSchema,
  occurredAt: timestampSchema,
};

export const securityOutboxEventV1Schema = z.discriminatedUnion('eventType', [
  z.strictObject({
    ...eventBase,
    eventType: z.literal('security.candidate.submitted.v1'),
    candidateId: uuidSchema,
  }),
  z.strictObject({
    ...eventBase,
    eventType: z.literal('security.candidate.reviewed.v1'),
    candidateId: uuidSchema,
    decisionId: uuidSchema,
  }),
  z.strictObject({
    ...eventBase,
    eventType: z.literal('security.indicator.accepted.v1'),
    indicatorId: uuidSchema,
  }),
  z.strictObject({
    ...eventBase,
    eventType: z.literal('security.incident.opened.v1'),
    incidentId: uuidSchema,
    decisionId: uuidSchema,
    resultingPosture: activeSecurityPostureSchema,
  }),
  z.strictObject({
    ...eventBase,
    eventType: z.literal('security.incident.changed.v1'),
    incidentId: uuidSchema,
    decisionId: uuidSchema,
    resultingPosture: activeSecurityPostureSchema.nullable(),
  }),
  z.strictObject({
    ...eventBase,
    eventType: z.literal('security.indicator.disclosure_changed.v1'),
    indicatorId: uuidSchema,
  }),
]);

export type SecurityOutboxEventV1 = z.infer<typeof securityOutboxEventV1Schema>;
