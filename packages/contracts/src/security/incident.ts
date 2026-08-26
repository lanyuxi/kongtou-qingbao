import { z } from 'zod';

import {
  activeSecurityPostureSchema,
  securityIncidentActionSchema,
  securityIncidentCategorySchema,
  securityIncidentReasonCodeSchema,
  securityIncidentStateSchema,
  securityIndicatorDisclosureDecisionSchema,
  securitySeveritySchema,
} from './enums.js';
import {
  securityCandidateListCursorSchema,
  securityIndicatorProposalSchema,
  securityTargetSchema,
} from './candidate.js';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const positiveVersionSchema = z.number().int().safe().positive();
const nonNegativeVersionSchema = z.number().int().safe().nonnegative();
const noteSchema = z.string().trim().min(1).max(1000).nullable();
const publicSummarySchema = z.string().trim().min(20).max(500);

const candidateCommandBase = {
  version: z.literal(1),
  candidateId: uuidSchema,
  expectedCandidateVersion: positiveVersionSchema,
  note: noteSchema,
};

const needsReviewCandidateCommandSchema = z.strictObject({
  ...candidateCommandBase,
  decision: z.literal('needs_review'),
  reasonCode: z.enum(['source_mismatch', 'grounding_failed', 'insufficient_context', 'wrong_scope']),
});
const rejectCandidateCommandSchema = z.strictObject({
  ...candidateCommandBase,
  decision: z.literal('reject'),
  reasonCode: z.enum(['claim_not_supported', 'source_mismatch', 'duplicate_candidate', 'wrong_scope']),
});
const acceptAndOpenCandidateCommandSchema = z.strictObject({
  ...candidateCommandBase,
  decision: z.literal('accept_and_open'),
  reasonCode: z.literal('evidence_verified'),
  evidenceId: uuidSchema,
  indicator: securityIndicatorProposalSchema,
  category: securityIncidentCategorySchema,
  resultingPosture: activeSecurityPostureSchema,
  resultingSeverity: securitySeveritySchema,
  publicSummary: publicSummarySchema,
});
const acceptAndAttachCandidateCommandSchema = z.strictObject({
  ...candidateCommandBase,
  decision: z.literal('accept_and_attach'),
  reasonCode: z.literal('evidence_verified'),
  incidentId: uuidSchema,
  evidenceId: uuidSchema,
  indicator: securityIndicatorProposalSchema,
});

export const securityCandidateReviewCommandV1Schema = z.discriminatedUnion('decision', [
  needsReviewCandidateCommandSchema,
  rejectCandidateCommandSchema,
  acceptAndOpenCandidateCommandSchema,
  acceptAndAttachCandidateCommandSchema,
]);

const incidentCommandBase = {
  version: z.literal(1),
  evidenceId: uuidSchema,
  resultingSeverity: securitySeveritySchema,
  publicSummary: publicSummarySchema,
  note: noteSchema,
};
const activeIncidentCommandBase = {
  ...incidentCommandBase,
  resultingPosture: activeSecurityPostureSchema,
};

const openSecurityIncidentCommandSchema = z.strictObject({
  ...activeIncidentCommandBase,
  action: z.literal('open'),
  target: securityTargetSchema,
  category: securityIncidentCategorySchema,
  indicatorId: uuidSchema,
  reasonCode: z.enum(['precautionary_evidence', 'active_exploitation']),
});
const attachIndicatorSecurityIncidentCommandSchema = z.strictObject({
  ...activeIncidentCommandBase,
  action: z.literal('attach_indicator'),
  incidentId: uuidSchema,
  expectedIncidentVersion: positiveVersionSchema,
  indicatorId: uuidSchema,
  reasonCode: z.literal('additional_evidence'),
});
const adjustSecurityIncidentCommandSchema = z.strictObject({
  ...activeIncidentCommandBase,
  action: z.literal('adjust'),
  incidentId: uuidSchema,
  expectedIncidentVersion: positiveVersionSchema,
  reasonCode: z.enum([
    'evidence_escalated',
    'active_exploitation',
    'evidence_deescalated',
    'mitigation_verified',
    'scope_corrected',
    'additional_evidence',
  ]),
});
const resolveSecurityIncidentCommandSchema = z.strictObject({
  ...incidentCommandBase,
  action: z.literal('resolve'),
  incidentId: uuidSchema,
  expectedIncidentVersion: positiveVersionSchema,
  reasonCode: z.enum(['mitigation_verified', 'false_positive_verified', 'scope_corrected']),
});
const reopenSecurityIncidentCommandSchema = z.strictObject({
  ...activeIncidentCommandBase,
  action: z.literal('reopen'),
  incidentId: uuidSchema,
  expectedIncidentVersion: positiveVersionSchema,
  reasonCode: z.enum(['precautionary_evidence', 'active_exploitation']),
});

export const securityIncidentCommandV1Schema = z.discriminatedUnion('action', [
  openSecurityIncidentCommandSchema,
  attachIndicatorSecurityIncidentCommandSchema,
  adjustSecurityIncidentCommandSchema,
  resolveSecurityIncidentCommandSchema,
  reopenSecurityIncidentCommandSchema,
]);

export const securityIncidentListCursorSchema = securityCandidateListCursorSchema;
export const securityIncidentListQuerySchema = z.strictObject({
  state: z.union([z.literal('all'), securityIncidentStateSchema]).default('all'),
  targetType: z.union([z.literal('all'), z.enum(['project', 'source'])]).default('all'),
  cursor: securityIncidentListCursorSchema.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(25),
});
export const reviewerSecurityIncidentDecisionSchema = z.strictObject({
  version: z.literal(1),
  decisionId: uuidSchema,
  incidentVersion: positiveVersionSchema,
  action: securityIncidentActionSchema,
  reasonCode: securityIncidentReasonCodeSchema,
  resultingPosture: activeSecurityPostureSchema.nullable(),
  resultingSeverity: securitySeveritySchema,
  publicSummary: publicSummarySchema,
  note: noteSchema,
  evidenceId: uuidSchema,
  reviewerUserId: uuidSchema,
  createdAt: timestampSchema,
});
const reviewerSecurityIncidentListItemBase = {
  version: z.literal(1),
  incidentId: uuidSchema,
  target: securityTargetSchema,
  category: securityIncidentCategorySchema,
  currentSeverity: securitySeveritySchema,
  publicSummary: publicSummarySchema,
  incidentVersion: nonNegativeVersionSchema,
  openedAt: timestampSchema,
  lastDecisionAt: timestampSchema,
};
export const reviewerSecurityIncidentListItemSchema = z.discriminatedUnion('state', [
  z.strictObject({
    ...reviewerSecurityIncidentListItemBase,
    state: z.literal('active'),
    currentPosture: activeSecurityPostureSchema,
  }),
  z.strictObject({
    ...reviewerSecurityIncidentListItemBase,
    state: z.literal('resolved'),
    currentPosture: z.null(),
  }),
]);
export const reviewerSecurityIncidentDetailSchema = z.strictObject({
  version: z.literal(1),
  incident: reviewerSecurityIncidentListItemSchema,
  indicatorIds: z.array(uuidSchema),
  decisions: z.array(reviewerSecurityIncidentDecisionSchema),
});
export const securityIncidentCommandReceiptV1Schema = z.strictObject({
  version: z.literal(1),
  commandId: uuidSchema,
  incidentId: uuidSchema,
  incidentVersion: positiveVersionSchema,
  decisionId: uuidSchema,
  state: securityIncidentStateSchema,
  posture: activeSecurityPostureSchema.nullable(),
  replayed: z.boolean(),
});

export const securityIndicatorDisclosureCommandV1Schema = z.discriminatedUnion('decision', [
  z.strictObject({
    version: z.literal(1),
    indicatorId: uuidSchema,
    expectedIndicatorVersion: positiveVersionSchema,
    decision: z.literal('publish'),
    reasonCode: z.literal('safe_for_public_warning'),
    note: noteSchema,
  }),
  z.strictObject({
    version: z.literal(1),
    indicatorId: uuidSchema,
    expectedIndicatorVersion: positiveVersionSchema,
    decision: z.literal('withdraw'),
    reasonCode: z.enum(['sensitive_indicator', 'disclosure_no_longer_needed']),
    note: noteSchema,
  }),
]);

export const securityIndicatorDisclosureReceiptV1Schema = z.strictObject({
  version: z.literal(1),
  commandId: uuidSchema,
  indicatorId: uuidSchema,
  indicatorVersion: positiveVersionSchema,
  decision: securityIndicatorDisclosureDecisionSchema,
  publicSafe: z.boolean(),
  replayed: z.boolean(),
});

export type SecurityCandidateReviewCommandV1 = z.infer<typeof securityCandidateReviewCommandV1Schema>;
export type SecurityIncidentCommandV1 = z.infer<typeof securityIncidentCommandV1Schema>;
export type SecurityIncidentListCursor = z.infer<typeof securityIncidentListCursorSchema>;
export type SecurityIncidentListQuery = z.infer<typeof securityIncidentListQuerySchema>;
export type ReviewerSecurityIncidentDecision = z.infer<typeof reviewerSecurityIncidentDecisionSchema>;
export type ReviewerSecurityIncidentListItem = z.infer<typeof reviewerSecurityIncidentListItemSchema>;
export type ReviewerSecurityIncidentDetail = z.infer<typeof reviewerSecurityIncidentDetailSchema>;
export type SecurityIncidentCommandReceiptV1 = z.infer<typeof securityIncidentCommandReceiptV1Schema>;
export type SecurityIndicatorDisclosureCommandV1 = z.infer<
  typeof securityIndicatorDisclosureCommandV1Schema
>;
export type SecurityIndicatorDisclosureReceiptV1 = z.infer<
  typeof securityIndicatorDisclosureReceiptV1Schema
>;
