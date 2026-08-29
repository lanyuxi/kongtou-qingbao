import { z } from 'zod';

import {
  securityCandidateOriginSchema,
  securityCandidateStateSchema,
  securityIndicatorTypeSchema,
  securityTargetTypeSchema,
} from './enums.js';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const positiveVersionSchema = z.number().int().safe().positive();
const nonNegativeVersionSchema = z.number().int().safe().nonnegative();
const boundedText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const internalNoteSchema = boundedText(1, 1000).nullable();

export const securityTargetSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('project'), id: uuidSchema }),
  z.strictObject({ type: z.literal('source'), id: uuidSchema }),
]);

export const securityIndicatorProposalSchema = z.strictObject({
  type: securityIndicatorTypeSchema,
  value: boundedText(1, 500),
});

export const extractionSecurityCandidateIngressV1Schema = z
  .strictObject({
    version: z.literal(1),
    extractionCandidateId: uuidSchema,
    projectId: uuidSchema.nullable(),
    sourceId: uuidSchema.nullable(),
    summary: boundedText(10, 2000),
  })
  .refine((value) => value.projectId !== null || value.sourceId !== null, {
    message: 'extraction candidate requires a project or source context',
  });

export const manualSecurityCandidateCommandV1Schema = z.strictObject({
  version: z.literal(1),
  target: securityTargetSchema,
  evidenceId: uuidSchema,
  indicator: securityIndicatorProposalSchema,
  summary: boundedText(10, 2000),
  note: internalNoteSchema,
});

const cursorPayloadSchema = z.strictObject({
  createdAt: timestampSchema,
  id: uuidSchema,
});

const cursorSchema = z.string().superRefine((value, context) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    context.addIssue({ code: 'custom', message: 'cursor must be base64url encoded' });
    return;
  }
  try {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const binary = globalThis.atob(`${value}${padding}`);
    const decoded = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))),
    ) as unknown;
    if (!cursorPayloadSchema.safeParse(decoded).success) {
      context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
  }
});

export const securityCandidateListCursorSchema = cursorSchema;

export const securityCandidateListQuerySchema = z.strictObject({
  origin: z.union([z.literal('all'), securityCandidateOriginSchema]).default('all'),
  state: z.union([z.literal('all'), securityCandidateStateSchema]).default('all'),
  targetType: z.union([z.literal('all'), securityTargetTypeSchema]).default('all'),
  cursor: cursorSchema.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(25),
});

export const reviewerSecurityCandidateListItemSchema = z.strictObject({
  version: z.literal(1),
  candidateId: uuidSchema,
  origin: securityCandidateOriginSchema,
  state: securityCandidateStateSchema,
  stateVersion: nonNegativeVersionSchema,
  target: securityTargetSchema.nullable(),
  summary: boundedText(10, 2000),
  createdAt: timestampSchema,
  reviewedAt: timestampSchema.nullable(),
});

const reviewerSecurityCandidateDetailBase = {
  version: z.literal(1),
  candidateId: uuidSchema,
  state: securityCandidateStateSchema,
  stateVersion: nonNegativeVersionSchema,
  summary: boundedText(10, 2000),
  note: internalNoteSchema,
  submittedByUserId: uuidSchema.nullable(),
  createdAt: timestampSchema,
};

export const reviewerSecurityCandidateDetailSchema = z.discriminatedUnion('origin', [
  z.strictObject({
    ...reviewerSecurityCandidateDetailBase,
    origin: z.literal('reviewer_manual'),
    target: securityTargetSchema,
    targetContext: z.null(),
    indicator: securityIndicatorProposalSchema,
    evidenceId: uuidSchema,
  }),
  z.strictObject({
    ...reviewerSecurityCandidateDetailBase,
    origin: z.literal('extraction'),
    target: z.null(),
    targetContext: z.strictObject({
      projectId: uuidSchema,
      sourceId: uuidSchema,
    }),
    indicator: z.null(),
    evidenceId: z.null(),
    note: z.null(),
    submittedByUserId: z.null(),
  }),
]);

export const securityCandidateReviewReceiptV1Schema = z.strictObject({
  version: z.literal(1),
  commandId: uuidSchema,
  candidateId: uuidSchema,
  candidateVersion: positiveVersionSchema,
  decisionId: uuidSchema,
  state: securityCandidateStateSchema,
  indicatorId: uuidSchema.nullable(),
  incidentId: uuidSchema.nullable(),
  replayed: z.boolean(),
});

export type SecurityTarget = z.infer<typeof securityTargetSchema>;
export type SecurityIndicatorProposal = z.infer<typeof securityIndicatorProposalSchema>;
export type ExtractionSecurityCandidateIngressV1 = z.infer<
  typeof extractionSecurityCandidateIngressV1Schema
>;
export type ManualSecurityCandidateCommandV1 = z.infer<typeof manualSecurityCandidateCommandV1Schema>;
export type SecurityCandidateListCursor = z.infer<typeof securityCandidateListCursorSchema>;
export type SecurityCandidateListQuery = z.infer<typeof securityCandidateListQuerySchema>;
export type ReviewerSecurityCandidateListItem = z.infer<typeof reviewerSecurityCandidateListItemSchema>;
export type ReviewerSecurityCandidateDetail = z.infer<typeof reviewerSecurityCandidateDetailSchema>;
export type SecurityCandidateReviewReceiptV1 = z.infer<typeof securityCandidateReviewReceiptV1Schema>;
