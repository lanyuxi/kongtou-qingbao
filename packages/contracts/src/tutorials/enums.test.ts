import { describe, expect, it } from 'vitest';

import {
  tutorialCandidateStatusSchema,
  tutorialDecisionSchema,
  tutorialErrorCodeSchema,
  tutorialKindSchema,
  tutorialOutboxEventTypeSchema,
  tutorialReasonCodeSchema,
  tutorialStatusSchema,
  tutorialStatusTriggerSchema,
} from './enums.js';

describe('tutorial enums', () => {
  it('exposes exactly the six participable kinds in signal order', () => {
    expect(tutorialKindSchema.options).toEqual([
      'airdrop_campaign',
      'points_program',
      'snapshot_notice',
      'task_launch',
      'token_launch',
      'eligibility_rule',
    ]);
  });

  it('exposes the approved tutorial lifecycle statuses', () => {
    expect(tutorialStatusSchema.options).toEqual([
      'draft',
      'in_review',
      'published',
      'needs_review',
      'blocked',
      'retired',
    ]);
  });

  it('exposes candidate, decision, and reason enums', () => {
    expect(tutorialCandidateStatusSchema.options).toEqual(['pending', 'accepted', 'rejected']);
    expect(tutorialDecisionSchema.options).toEqual([
      'accept_candidate',
      'reject_candidate',
      'publish_version',
      'retire',
    ]);
    expect(tutorialReasonCodeSchema.options).toEqual([
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
  });

  it('reserves the unused AT2xx error-code range for tutorials', () => {
    expect(tutorialErrorCodeSchema.options).toEqual([
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
  });

  it('exposes the coupling triggers and outbox event types', () => {
    expect(tutorialStatusTriggerSchema.options).toEqual([
      'project_blocked',
      'source_blocked',
      'reference_unrenderable',
      'signal_disputed',
      'signal_retracted',
      'lifecycle_changed',
    ]);
    expect(tutorialOutboxEventTypeSchema.options).toEqual([
      'tutorial.published.v1',
      'tutorial.status_changed.v1',
    ]);
  });

  it('rejects unsupported enum values', () => {
    expect(tutorialKindSchema.safeParse('ico_launch').success).toBe(false);
    expect(tutorialStatusSchema.safeParse('archived').success).toBe(false);
    expect(tutorialErrorCodeSchema.safeParse('tutorial_unknown').success).toBe(false);
    expect(tutorialStatusTriggerSchema.safeParse('reviewer_bored').success).toBe(false);
  });
});
