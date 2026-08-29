import { describe, expect, it } from 'vitest';

import {
  domainAuthorityDecisionSchema,
  domainAuthorityStateSchema,
  referenceDecisionSchema,
  referenceErrorCodeSchema,
  referenceKindSchema,
  referenceReasonCodeSchema,
  referenceStateSchema,
} from './enums.js';

describe('reference enums', () => {
  it('declares the approved reference states without storing a mutable status', () => {
    expect(referenceStateSchema.options).toEqual([
      'candidate',
      'verified',
      'flagged',
      'withdrawn',
    ]);
  });

  it('declares domain authority states separately from reference states', () => {
    expect(domainAuthorityStateSchema.options).toEqual(['candidate', 'granted', 'revoked']);
  });

  it('declares the approved reference kinds', () => {
    expect(referenceKindSchema.options).toEqual([
      'official_site',
      'official_docs',
      'claim_portal',
      'app_entry',
      'official_social',
      'code_repository',
      'announcement',
      'other',
    ]);
  });

  it('keeps verification and withdrawal explicit while separating security flags', () => {
    expect(referenceDecisionSchema.options).toEqual([
      'register',
      'verify',
      'reverify',
      'restore',
      'withdraw',
    ]);
    expect(domainAuthorityDecisionSchema.options).toEqual([
      'register',
      'grant',
      'revoke',
      'regrant',
    ]);
  });

  it('declares reason codes that separate ownership evidence from security state', () => {
    expect(referenceReasonCodeSchema.options).toEqual([
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
  });

  it('declares the AR2xx reference error band', () => {
    expect(referenceErrorCodeSchema.options).toEqual([
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
  });

  it('rejects unsupported enum values', () => {
    expect(referenceStateSchema.safeParse('allowlisted').success).toBe(false);
    expect(referenceKindSchema.safeParse('contract').success).toBe(false);
    expect(referenceDecisionSchema.safeParse('publish').success).toBe(false);
    expect(domainAuthorityStateSchema.safeParse('verified').success).toBe(false);
  });
});
