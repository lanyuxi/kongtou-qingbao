import { z } from 'zod';

import {
  tutorialCandidateStatusSchema,
  tutorialDecisionSchema,
  tutorialKindSchema,
  tutorialReasonCodeSchema,
  tutorialStatusSchema,
  tutorialStatusTriggerSchema,
} from './enums.js';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const positiveVersionSchema = z.number().int().safe().positive();

// Public projections resolve every link through the Phase 7B ledger at read
// time: the projection carries the referenceId plus the ledger-derived url and
// verification stamp, and never a stored url column. A link whose reference is
// currently not renderable keeps its place with renderable=false and null url.
const publicTutorialLinkSchema = z.strictObject({
  referenceId: uuidSchema,
  url: z.string().nullable(),
  label: z.string().min(1).max(160).nullable(),
  lastVerifiedAt: timestampSchema.nullable(),
  renderable: z.boolean(),
});

const publicTutorialStepSchema = z.strictObject({
  ordinal: z.number().int().positive(),
  title: z.string().min(3).max(120),
  body: z.string().min(10).max(1000),
  links: z.array(publicTutorialLinkSchema).max(5),
});

export const publicTutorialDetailSchema = z.strictObject({
  tutorialId: uuidSchema,
  projectId: uuidSchema,
  kind: tutorialKindSchema,
  title: z.string().min(5).max(200),
  summary: z.string().min(10).max(2000),
  version: positiveVersionSchema,
  lastVerifiedAt: timestampSchema.nullable(),
  publishedAt: timestampSchema,
  steps: z.array(publicTutorialStepSchema).min(2).max(20),
});

export const publicTutorialCursorSchema = z.strictObject({
  publishedAt: timestampSchema,
  tutorialId: uuidSchema,
});

export const publicTutorialListQuerySchema = z.strictObject({
  projectId: uuidSchema,
  cursor: publicTutorialCursorSchema.nullable().default(null),
  limit: z.number().int().min(1).max(50).default(12),
});

export const publicTutorialListItemSchema = z.strictObject({
  tutorialId: uuidSchema,
  projectId: uuidSchema,
  kind: tutorialKindSchema,
  title: z.string().min(5).max(200),
  summary: z.string().min(10).max(2000),
  version: positiveVersionSchema,
  lastVerifiedAt: timestampSchema.nullable(),
  publishedAt: timestampSchema,
  stepCount: z.number().int().min(2).max(20),
});

export const publicTutorialListSchema = z.strictObject({
  items: z.array(publicTutorialListItemSchema),
});

// Reviewer projections. The candidate queue never embeds the payload body; the
// detail RPC carries it separately so a hostile payload renders only where the
// UI deliberately and inertly displays it.

export const tutorialCandidateCursorSchema = z.strictObject({
  createdAt: timestampSchema,
  candidateId: uuidSchema,
});

export const tutorialCandidateReviewListQuerySchema = z.strictObject({
  status: z
    .union([z.literal('all'), tutorialCandidateStatusSchema])
    .default('pending'),
  cursor: tutorialCandidateCursorSchema.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(25),
});

export const tutorialCandidateReviewListItemSchema = z.strictObject({
  candidateId: uuidSchema,
  projectId: uuidSchema,
  kind: tutorialKindSchema,
  status: tutorialCandidateStatusSchema,
  title: z.string().min(5).max(200),
  createdAt: timestampSchema,
});

export const tutorialCandidateReviewListSchema = z.strictObject({
  items: z.array(tutorialCandidateReviewListItemSchema),
  nextCursor: tutorialCandidateCursorSchema.nullable(),
});

export const tutorialReviewCursorSchema = z.strictObject({
  updatedAt: timestampSchema,
  tutorialId: uuidSchema,
});

// The review list covers only the statuses that need reviewer attention;
// draft/in_review never persist in v1, so they are not filterable.
export const tutorialReviewStatusFilterSchema = z.union([
  z.literal('all'),
  z.literal('published'),
  z.literal('needs_review'),
  z.literal('blocked'),
  z.literal('retired'),
]);

export const tutorialReviewListQuerySchema = z.strictObject({
  status: tutorialReviewStatusFilterSchema.default('all'),
  cursor: tutorialReviewCursorSchema.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(25),
});

export const tutorialReviewListItemSchema = z.strictObject({
  tutorialId: uuidSchema,
  projectId: uuidSchema,
  kind: tutorialKindSchema,
  status: tutorialStatusSchema,
  version: positiveVersionSchema,
  title: z.string().min(5).max(200),
  updatedAt: timestampSchema,
});

export const tutorialReviewListSchema = z.strictObject({
  items: z.array(tutorialReviewListItemSchema),
  nextCursor: tutorialReviewCursorSchema.nullable(),
});

const reviewStepLinkSchema = z.strictObject({
  referenceId: uuidSchema,
  referenceLabel: z.string().min(1).max(160).nullable(),
  renderable: z.boolean(),
  lastVerifiedAt: timestampSchema.nullable(),
});

const reviewStepSchema = z.strictObject({
  ordinal: z.number().int().positive(),
  title: z.string().min(3).max(120),
  body: z.string().min(10).max(1000),
  links: z.array(reviewStepLinkSchema).max(5),
});

const reviewDecisionSchema = z.strictObject({
  decision: tutorialDecisionSchema,
  reasonCode: tutorialReasonCodeSchema.nullable(),
  note: z.string().min(1).max(1000).nullable(),
  aggregateVersion: positiveVersionSchema,
  createdAt: timestampSchema,
});

const reviewStatusEventSchema = z.strictObject({
  trigger: tutorialStatusTriggerSchema,
  fromStatus: tutorialStatusSchema,
  toStatus: tutorialStatusSchema,
  createdAt: timestampSchema,
});

export const tutorialReviewDetailSchema = z.strictObject({
  tutorialId: uuidSchema,
  projectId: uuidSchema,
  kind: tutorialKindSchema,
  status: tutorialStatusSchema,
  version: positiveVersionSchema,
  title: z.string().min(5).max(200),
  summary: z.string().min(10).max(2000),
  lastVerifiedAt: timestampSchema.nullable(),
  updatedAt: timestampSchema,
  steps: z.array(reviewStepSchema).min(2).max(20),
  decisions: z.array(reviewDecisionSchema).max(100),
  statusEvents: z.array(reviewStatusEventSchema).max(100),
});

export const tutorialCandidateReviewDetailSchema = z.strictObject({
  candidateId: uuidSchema,
  projectId: uuidSchema,
  kind: tutorialKindSchema,
  status: tutorialCandidateStatusSchema,
  title: z.string().min(5).max(200),
  summary: z.string().min(10).max(2000),
  payload: z.unknown(),
  sourceSignalIds: z.array(uuidSchema).min(1).max(10),
  confidence: z.number().min(0).max(100),
  createdAt: timestampSchema,
});

export type PublicTutorialDetail = z.infer<typeof publicTutorialDetailSchema>;
export type PublicTutorialLink = z.infer<typeof publicTutorialLinkSchema>;
export type PublicTutorialListItem = z.infer<typeof publicTutorialListItemSchema>;
export type TutorialCandidateCursor = z.infer<typeof tutorialCandidateCursorSchema>;
export type TutorialCandidateReviewListQuery = z.infer<
  typeof tutorialCandidateReviewListQuerySchema
>;
export type TutorialCandidateReviewListItem = z.infer<
  typeof tutorialCandidateReviewListItemSchema
>;
export type TutorialReviewCursor = z.infer<typeof tutorialReviewCursorSchema>;
export type TutorialReviewListQuery = z.infer<typeof tutorialReviewListQuerySchema>;
export type TutorialReviewListItem = z.infer<typeof tutorialReviewListItemSchema>;
export type TutorialReviewDetail = z.infer<typeof tutorialReviewDetailSchema>;
export type TutorialCandidateReviewDetail = z.infer<typeof tutorialCandidateReviewDetailSchema>;
