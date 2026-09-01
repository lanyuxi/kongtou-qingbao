import { z } from 'zod';

import {
  domainAuthorityDecisionSchema,
  domainAuthorityStateSchema,
  referenceDecisionSchema,
  referenceKindSchema,
  referenceReasonCodeSchema,
  referenceStateSchema,
} from './enums.js';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const positiveVersionSchema = z.number().int().safe().positive();
const internalNoteSchema = z.string().trim().min(1).max(1000).nullable();
const referenceUrlSchema = z
  .string()
  .min(11)
  .max(2048)
  .refine((value) => value.startsWith('https://'), {
    message: 'reference url must use https',
  })
  .refine((value) => !value.includes('#'), {
    message: 'reference url must not contain a fragment',
  });

const cursorPayloadSchema = z.strictObject({
  lastVerifiedAt: timestampSchema,
  referenceId: uuidSchema,
});

const referenceReviewCursorPayloadSchema = z.strictObject({
  updatedAt: timestampSchema,
  referenceId: uuidSchema,
});

const domainAuthorityReviewCursorPayloadSchema = z.strictObject({
  updatedAt: timestampSchema,
  authorityId: uuidSchema,
});

function decodeCursor(value: string): unknown {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = globalThis.atob(`${value}${padding}`);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export const publicProjectReferenceCursorSchema = z.string().superRefine((value, context) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    context.addIssue({ code: 'custom', message: 'cursor must be base64url encoded' });
    return;
  }
  try {
    if (!cursorPayloadSchema.safeParse(decodeCursor(value)).success) {
      context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
  }
});

function createOpaqueCursorSchema(payloadSchema: z.ZodType) {
  return z.string().superRefine((value, context) => {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      context.addIssue({ code: 'custom', message: 'cursor must be base64url encoded' });
      return;
    }
    try {
      if (!payloadSchema.safeParse(decodeCursor(value)).success) {
        context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
      }
    } catch {
      context.addIssue({ code: 'custom', message: 'cursor payload is invalid' });
    }
  });
}

export const referenceReviewListCursorSchema = createOpaqueCursorSchema(
  referenceReviewCursorPayloadSchema,
);

export const domainAuthorityReviewListCursorSchema = createOpaqueCursorSchema(
  domainAuthorityReviewCursorPayloadSchema,
);

export const referenceReviewListQuerySchema = z.strictObject({
  projectId: uuidSchema.nullable().default(null),
  state: z.union([z.literal('all'), referenceStateSchema]).default('all'),
  cursor: referenceReviewListCursorSchema.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(25),
});

export const domainAuthorityReviewListQuerySchema = z.strictObject({
  projectId: uuidSchema.nullable().default(null),
  state: z.union([z.literal('all'), domainAuthorityStateSchema]).default('all'),
  cursor: domainAuthorityReviewListCursorSchema.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(25),
});

// Public projection: verified references only. It deliberately omits Evidence
// ids, locators, notes, actor identity, candidate rows, and normalization
// diagnostics so no internal field can reach a public consumer.
export const publicProjectReferenceSchema = z.strictObject({
  projectId: uuidSchema,
  referenceId: uuidSchema,
  kind: referenceKindSchema,
  label: z.string().min(1).max(160),
  url: referenceUrlSchema,
  lastVerifiedAt: timestampSchema,
});

export const publicProjectDomainAuthoritySchema = z.strictObject({
  projectId: uuidSchema,
  authorityId: uuidSchema,
  domain: z.string().min(1).max(253),
  grantedAt: timestampSchema,
});

// Public list boundaries stay explicit so a public endpoint can never widen
// into an unbounded scan or leak a driver-side default.
export const publicProjectReferenceListQuerySchema = z.strictObject({
  projectId: uuidSchema,
  cursor: publicProjectReferenceCursorSchema.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(25),
});

export const publicProjectReferencePageSchema = z.strictObject({
  items: z.array(publicProjectReferenceSchema),
  nextCursor: publicProjectReferenceCursorSchema.nullable(),
});

export const publicProjectDomainAuthorityListQuerySchema = z.strictObject({
  projectId: uuidSchema,
  limit: z.number().int().min(1).max(100).default(25),
});

export const publicProjectDomainAuthorityListSchema = z.strictObject({
  items: z.array(publicProjectDomainAuthoritySchema),
});

export const reviewerReferenceListItemSchema = z.strictObject({
  referenceId: uuidSchema,
  projectId: uuidSchema,
  kind: referenceKindSchema,
  label: z.string().min(1).max(160),
  url: referenceUrlSchema,
  state: referenceStateSchema,
  lastVerifiedAt: timestampSchema.nullable(),
  activeIndicatorId: uuidSchema.nullable(),
  version: z.literal(1),
  referenceVersion: positiveVersionSchema,
  updatedAt: timestampSchema,
});

const reviewerReferenceDecisionSchema = z.strictObject({
  decisionId: uuidSchema,
  decision: referenceDecisionSchema,
  resultingState: referenceStateSchema,
  reasonCode: referenceReasonCodeSchema,
  evidenceId: uuidSchema.nullable(),
  note: internalNoteSchema,
  createdAt: timestampSchema,
});

export const reviewerDomainAuthorityListItemSchema = z.strictObject({
  authorityId: uuidSchema,
  projectId: uuidSchema,
  domain: z.string().min(1).max(253),
  state: domainAuthorityStateSchema,
  version: z.literal(1),
  authorityVersion: positiveVersionSchema,
  updatedAt: timestampSchema,
});

const reviewerDomainAuthorityDecisionSchema = z.strictObject({
  decisionId: uuidSchema,
  decision: domainAuthorityDecisionSchema,
  resultingState: domainAuthorityStateSchema,
  reasonCode: referenceReasonCodeSchema,
  evidenceId: uuidSchema.nullable(),
  note: internalNoteSchema,
  createdAt: timestampSchema,
});

export const reviewerDomainAuthorityDetailSchema = reviewerDomainAuthorityListItemSchema.extend({
  decisions: z.array(reviewerDomainAuthorityDecisionSchema),
});

export const reviewerReferenceDetailSchema = z.strictObject({
  referenceId: uuidSchema,
  projectId: uuidSchema,
  kind: referenceKindSchema,
  label: z.string().min(1).max(160),
  url: referenceUrlSchema,
  state: referenceStateSchema,
  lastVerifiedAt: timestampSchema.nullable(),
  activeIndicatorId: uuidSchema.nullable(),
  version: z.literal(1),
  referenceVersion: positiveVersionSchema,
  updatedAt: timestampSchema,
  domainAuthority: z
    .strictObject({
      authorityId: uuidSchema,
      domain: z.string().min(1).max(253),
      state: domainAuthorityStateSchema,
      authorityVersion: positiveVersionSchema,
    })
    .nullable(),
  decisions: z.array(reviewerReferenceDecisionSchema),
});

export type PublicProjectReference = z.infer<typeof publicProjectReferenceSchema>;
export type PublicProjectDomainAuthority = z.infer<typeof publicProjectDomainAuthoritySchema>;
export type PublicProjectReferenceCursor = z.infer<typeof publicProjectReferenceCursorSchema>;
export type PublicProjectReferenceListQuery = z.infer<
  typeof publicProjectReferenceListQuerySchema
>;
export type PublicProjectReferencePage = z.infer<typeof publicProjectReferencePageSchema>;
export type PublicProjectDomainAuthorityListQuery = z.infer<
  typeof publicProjectDomainAuthorityListQuerySchema
>;
export type PublicProjectDomainAuthorityList = z.infer<
  typeof publicProjectDomainAuthorityListSchema
>;
export type ReferenceReviewListCursor = z.infer<typeof referenceReviewListCursorSchema>;
export type DomainAuthorityReviewListCursor = z.infer<
  typeof domainAuthorityReviewListCursorSchema
>;
export type ReferenceReviewListQuery = z.infer<typeof referenceReviewListQuerySchema>;
export type DomainAuthorityReviewListQuery = z.infer<
  typeof domainAuthorityReviewListQuerySchema
>;
export type ReviewerReferenceListItem = z.infer<typeof reviewerReferenceListItemSchema>;
export type ReviewerReferenceDetail = z.infer<typeof reviewerReferenceDetailSchema>;
export type ReviewerReferenceDecision = z.infer<typeof reviewerReferenceDecisionSchema>;
export type ReviewerDomainAuthorityListItem = z.infer<
  typeof reviewerDomainAuthorityListItemSchema
>;
export type ReviewerDomainAuthorityDecision = z.infer<
  typeof reviewerDomainAuthorityDecisionSchema
>;
export type ReviewerDomainAuthorityDetail = z.infer<typeof reviewerDomainAuthorityDetailSchema>;
