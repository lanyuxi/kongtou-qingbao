import { z } from 'zod';

// Tutorial lifecycle enums for Phase 8. The six kinds mirror the six
// "participable" extraction claim types: tutorials teach users how to act on
// those; security_risk and scam_indicator signals are coupling triggers, never
// tutorial material.

export const tutorialKindSchema = z.enum([
  'airdrop_campaign',
  'points_program',
  'snapshot_notice',
  'task_launch',
  'token_launch',
  'eligibility_rule',
]);

export const tutorialStatusSchema = z.enum([
  'draft',
  'in_review',
  'published',
  'needs_review',
  'blocked',
  'retired',
]);

export const tutorialCandidateStatusSchema = z.enum(['pending', 'accepted', 'rejected']);

export const tutorialDecisionSchema = z.enum([
  'accept_candidate',
  'reject_candidate',
  'publish_version',
  'retire',
]);

export const tutorialReasonCodeSchema = z.enum([
  'content_verified',
  'content_stale',
  'reference_unrenderable',
  'security_blocked',
  'source_blocked',
  'signal_retracted',
  'duplicate',
  'out_of_scope',
  'other',
]);

// Numeric range AT2xx is reserved for tutorials (AT201-AT211, AT299); the
// string codes map 1:1 to the values below and to the migration's errcodes.
export const tutorialErrorCodeSchema = z.enum([
  'tutorial_reviewer_required',
  'tutorial_not_found',
  'tutorial_not_decidable',
  'tutorial_version_conflict',
  'tutorial_idempotency_conflict',
  'tutorial_command_invalid',
  'tutorial_reference_not_allowlisted',
  'tutorial_reference_not_renderable',
  'tutorial_steps_invalid',
  'tutorial_persistence_failed',
]);

export const tutorialStatusTriggerSchema = z.enum([
  'project_blocked',
  'source_blocked',
  'reference_unrenderable',
  'signal_disputed',
  'signal_retracted',
  'lifecycle_changed',
]);

export const tutorialOutboxEventTypeSchema = z.enum([
  'tutorial.published.v1',
  'tutorial.status_changed.v1',
]);

export type TutorialKind = z.infer<typeof tutorialKindSchema>;
export type TutorialStatus = z.infer<typeof tutorialStatusSchema>;
export type TutorialCandidateStatus = z.infer<typeof tutorialCandidateStatusSchema>;
export type TutorialDecision = z.infer<typeof tutorialDecisionSchema>;
export type TutorialReasonCode = z.infer<typeof tutorialReasonCodeSchema>;
export type TutorialErrorCode = z.infer<typeof tutorialErrorCodeSchema>;
export type TutorialStatusTrigger = z.infer<typeof tutorialStatusTriggerSchema>;
export type TutorialOutboxEventType = z.infer<typeof tutorialOutboxEventTypeSchema>;
