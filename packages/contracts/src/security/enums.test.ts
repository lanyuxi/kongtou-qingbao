import { describe, expect, it } from 'vitest';

import {
  activeSecurityPostureSchema,
  securityCandidateDecisionSchema,
  securityCandidateStateSchema,
  securityIncidentActionSchema,
  securityIndicatorTypeSchema,
  securityPostureSchema,
  securityTargetTypeSchema,
} from '../index.js';

describe('security enum contracts', () => {
  it('enumerates the approved independent security values', () => {
    expect(securityTargetTypeSchema.options).toEqual(['project', 'source']);
    expect(securityPostureSchema.options).toEqual(['clear', 'caution', 'blocked']);
    expect(activeSecurityPostureSchema.options).toEqual(['caution', 'blocked']);
    expect(securityCandidateStateSchema.options).toEqual([
      'pending',
      'needs_review',
      'accepted',
      'rejected',
    ]);
    expect(securityCandidateDecisionSchema.options).toEqual([
      'needs_review',
      'reject',
      'accept_and_open',
      'accept_and_attach',
    ]);
    expect(securityIncidentActionSchema.options).toEqual([
      'open',
      'attach_indicator',
      'adjust',
      'resolve',
      'reopen',
    ]);
    expect(securityIndicatorTypeSchema.options).toEqual([
      'domain',
      'url',
      'contract_address',
      'transaction_hash',
      'social_account',
      'observed_behavior',
    ]);
  });

  it('rejects unapproved values rather than coercing them', () => {
    expect(securityPostureSchema.safeParse('high').success).toBe(false);
    expect(securityCandidateStateSchema.safeParse('reviewed').success).toBe(false);
  });
});
