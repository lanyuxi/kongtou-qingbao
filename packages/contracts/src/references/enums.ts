import { z } from 'zod';

export const referenceKindSchema = z.enum([
  'official_site',
  'official_docs',
  'claim_portal',
  'app_entry',
  'official_social',
  'code_repository',
  'announcement',
  'other',
]);

export const referenceStateSchema = z.enum(['candidate', 'verified', 'flagged', 'withdrawn']);

export const domainAuthorityStateSchema = z.enum(['candidate', 'granted', 'revoked']);

export const referenceDecisionSchema = z.enum([
  'register',
  'verify',
  'reverify',
  'restore',
  'withdraw',
]);

export const domainAuthorityDecisionSchema = z.enum([
  'register',
  'grant',
  'revoke',
  'regrant',
]);

export const referenceReasonCodeSchema = z.enum([
  'evidence_verified',
  'official_announcement',
  'corroborated_source',
  'ownership_unproven',
  'domain_mismatch',
  'duplicate_reference',
  'source_no_longer_official',
  'security_flag_cleared',
  'withdrawn_by_reviewer',
  'insufficient_context',
]);

export const referenceErrorCodeSchema = z.enum([
  'reference_reviewer_required',
  'reference_not_found',
  'reference_not_decidable',
  'domain_authority_not_found',
  'reference_version_conflict',
  'reference_idempotency_conflict',
  'reference_command_invalid',
  'reference_evidence_required',
  'reference_normalization_invalid',
  'reference_persistence_failed',
]);

export const referenceOutboxEventTypeSchema = z.enum([
  'reference.registered.v1',
  'reference.decided.v1',
  'domain_authority.decided.v1',
  'reference.security_flagged.v1',
]);

export type ReferenceKind = z.infer<typeof referenceKindSchema>;
export type ReferenceState = z.infer<typeof referenceStateSchema>;
export type DomainAuthorityState = z.infer<typeof domainAuthorityStateSchema>;
export type ReferenceDecision = z.infer<typeof referenceDecisionSchema>;
export type DomainAuthorityDecision = z.infer<typeof domainAuthorityDecisionSchema>;
export type ReferenceReasonCode = z.infer<typeof referenceReasonCodeSchema>;
export type ReferenceErrorCode = z.infer<typeof referenceErrorCodeSchema>;
export type ReferenceOutboxEventType = z.infer<typeof referenceOutboxEventTypeSchema>;
