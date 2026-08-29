import { z } from 'zod';

import {
  securityIncidentCategorySchema,
  securityIncidentStateSchema,
  securityIndicatorTypeSchema,
  securityPostureSchema,
  securitySeveritySchema,
} from './enums.js';
import { securityTargetSchema } from './candidate.js';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const publicSummarySchema = z.string().trim().min(20).max(500);
const projectSchema = z.strictObject({
  id: uuidSchema,
  slug: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
});

export const publicSecurityIndicatorSchema = z.strictObject({
  id: uuidSchema,
  type: securityIndicatorTypeSchema,
  value: z.string().trim().min(1).max(500),
});

export const publicSecurityIncidentSummarySchema = z.strictObject({
  version: z.literal(1),
  incidentId: uuidSchema,
  target: securityTargetSchema,
  category: securityIncidentCategorySchema,
  severity: securitySeveritySchema,
  state: securityIncidentStateSchema,
  publicSummary: publicSummarySchema,
  firstObservedAt: timestampSchema,
  lastVerifiedAt: timestampSchema,
  indicators: z.array(publicSecurityIndicatorSchema),
});

export const publicActiveSecurityIncidentSummarySchema = publicSecurityIncidentSummarySchema.extend({
  state: z.literal('active'),
});

export const publicProjectSecurityStateSchema = z.strictObject({
  version: z.literal(1),
  projectId: uuidSchema,
  posture: securityPostureSchema,
  activeIncidents: z.array(publicActiveSecurityIncidentSummarySchema),
});

export const publicBlockedProjectSecurityRowSchema = z
  .strictObject({
    version: z.literal(1),
    project: projectSchema,
    posture: z.literal('blocked'),
    category: securityIncidentCategorySchema,
    severity: securitySeveritySchema,
    publicSummary: publicSummarySchema,
    firstObservedAt: timestampSchema,
    lastVerifiedAt: timestampSchema,
    target: z.strictObject({ type: z.literal('project'), id: uuidSchema }),
    indicators: z.array(publicSecurityIndicatorSchema),
  })
  .superRefine((value, context) => {
    if (value.target.id !== value.project.id) {
      context.addIssue({
        code: 'custom',
        path: ['target', 'id'],
        message: 'blocked project target must match project.id',
      });
    }
  });

const blockedCursorPayloadSchema = z.strictObject({
  lastVerifiedAt: timestampSchema,
  projectId: uuidSchema,
});
export const blockedProjectSecurityCursorSchema = z.string().superRefine((value, context) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    context.addIssue({ code: 'custom', message: 'cursor must be base64url encoded' });
    return;
  }
  try {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const decoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(globalThis.atob(`${value}${padding}`), (character) => character.charCodeAt(0)),
      ),
    ) as unknown;
    if (!blockedCursorPayloadSchema.safeParse(decoded).success) {
      context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
  }
});
export const blockedProjectSecurityListQuerySchema = z.strictObject({
  cursor: blockedProjectSecurityCursorSchema.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(25),
});
export const publicBlockedProjectSecurityPageSchema = z.strictObject({
  items: z.array(publicBlockedProjectSecurityRowSchema),
  nextCursor: blockedProjectSecurityCursorSchema.nullable(),
});

export type PublicSecurityIndicator = z.infer<typeof publicSecurityIndicatorSchema>;
export type PublicSecurityIncidentSummary = z.infer<typeof publicSecurityIncidentSummarySchema>;
export type PublicActiveSecurityIncidentSummary = z.infer<
  typeof publicActiveSecurityIncidentSummarySchema
>;
export type PublicProjectSecurityState = z.infer<typeof publicProjectSecurityStateSchema>;
export type PublicBlockedProjectSecurityRow = z.infer<typeof publicBlockedProjectSecurityRowSchema>;
export type BlockedProjectSecurityCursor = z.infer<typeof blockedProjectSecurityCursorSchema>;
export type BlockedProjectSecurityListQuery = z.infer<typeof blockedProjectSecurityListQuerySchema>;
export type PublicBlockedProjectSecurityPage = z.infer<typeof publicBlockedProjectSecurityPageSchema>;
