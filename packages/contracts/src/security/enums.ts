import { z } from 'zod';

export const securityTargetTypeSchema = z.enum(['project', 'source']);
export const securityPostureSchema = z.enum(['clear', 'caution', 'blocked']);
export const activeSecurityPostureSchema = z.enum(['caution', 'blocked']);
export const securitySeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const securityIndicatorTypeSchema = z.enum([
  'domain',
  'url',
  'contract_address',
  'transaction_hash',
  'social_account',
  'observed_behavior',
]);
export const securityIncidentCategorySchema = z.enum([
  'phishing',
  'impersonation',
  'malicious_contract',
  'source_compromise',
  'fraudulent_claim',
  'fund_loss',
  'other_security_risk',
]);
export const securityCandidateOriginSchema = z.enum(['extraction', 'reviewer_manual']);
export const securityCandidateStateSchema = z.enum([
  'pending',
  'needs_review',
  'accepted',
  'rejected',
]);
export const securityCandidateDecisionSchema = z.enum([
  'needs_review',
  'reject',
  'accept_and_open',
  'accept_and_attach',
]);
export const securityCandidateReasonCodeSchema = z.enum([
  'evidence_verified',
  'claim_not_supported',
  'source_mismatch',
  'duplicate_candidate',
  'wrong_scope',
  'grounding_failed',
  'insufficient_context',
]);
export const securityIncidentStateSchema = z.enum(['active', 'resolved']);
export const securityIncidentActionSchema = z.enum([
  'open',
  'attach_indicator',
  'adjust',
  'resolve',
  'reopen',
]);
export const securityIncidentReasonCodeSchema = z.enum([
  'precautionary_evidence',
  'active_exploitation',
  'evidence_escalated',
  'evidence_deescalated',
  'mitigation_verified',
  'scope_corrected',
  'additional_evidence',
  'false_positive_verified',
]);
export const securityIndicatorDisclosureDecisionSchema = z.enum(['publish', 'withdraw']);
export const securityIndicatorDisclosureReasonCodeSchema = z.enum([
  'safe_for_public_warning',
  'sensitive_indicator',
  'disclosure_no_longer_needed',
]);
export const securityErrorCodeSchema = z.enum([
  'security_reviewer_required',
  'security_candidate_not_found',
  'security_candidate_not_reviewable',
  'security_incident_not_found',
  'security_indicator_not_found',
  'security_version_conflict',
  'security_idempotency_conflict',
  'security_command_invalid',
  'security_target_mismatch',
  'security_promotion_blocked',
  'security_review_required',
  'security_persistence_failed',
]);
export const securityOutboxEventTypeSchema = z.enum([
  'security.candidate.submitted.v1',
  'security.candidate.reviewed.v1',
  'security.indicator.accepted.v1',
  'security.incident.opened.v1',
  'security.incident.changed.v1',
  'security.indicator.disclosure_changed.v1',
]);

export type SecurityTargetType = z.infer<typeof securityTargetTypeSchema>;
export type SecurityPosture = z.infer<typeof securityPostureSchema>;
export type ActiveSecurityPosture = z.infer<typeof activeSecurityPostureSchema>;
export type SecuritySeverity = z.infer<typeof securitySeveritySchema>;
export type SecurityIndicatorType = z.infer<typeof securityIndicatorTypeSchema>;
export type SecurityIncidentCategory = z.infer<typeof securityIncidentCategorySchema>;
export type SecurityCandidateOrigin = z.infer<typeof securityCandidateOriginSchema>;
export type SecurityCandidateState = z.infer<typeof securityCandidateStateSchema>;
export type SecurityCandidateDecision = z.infer<typeof securityCandidateDecisionSchema>;
export type SecurityCandidateReasonCode = z.infer<typeof securityCandidateReasonCodeSchema>;
export type SecurityIncidentState = z.infer<typeof securityIncidentStateSchema>;
export type SecurityIncidentAction = z.infer<typeof securityIncidentActionSchema>;
export type SecurityIncidentReasonCode = z.infer<typeof securityIncidentReasonCodeSchema>;
export type SecurityIndicatorDisclosureDecision = z.infer<
  typeof securityIndicatorDisclosureDecisionSchema
>;
export type SecurityIndicatorDisclosureReasonCode = z.infer<
  typeof securityIndicatorDisclosureReasonCodeSchema
>;
export type SecurityErrorCode = z.infer<typeof securityErrorCodeSchema>;
export type SecurityOutboxEventType = z.infer<typeof securityOutboxEventTypeSchema>;
