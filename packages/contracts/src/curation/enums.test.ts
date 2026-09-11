import { describe, expect, it } from 'vitest';

import {
  curatedSignalErrorCodeSchema,
  curatedSignalOutcomeSchema,
  curatedSignalVerificationSchema,
  participableSignalTypeSchema,
} from './enums.js';

describe('curation enums', () => {
  it('exposes exactly the six participable signal types', () => {
    expect(participableSignalTypeSchema.options).toEqual([
      'airdrop_campaign',
      'points_program',
      'snapshot_notice',
      'task_launch',
      'token_launch',
      'eligibility_rule',
    ]);
  });

  it('rejects signal types that the tutorial pipeline does not recognise', () => {
    expect(participableSignalTypeSchema.safeParse('price_target').success).toBe(false);
  });

  it('limits the verification levels to verified and corroborated', () => {
    expect(curatedSignalVerificationSchema.options).toEqual(['verified', 'corroborated']);
    expect(curatedSignalVerificationSchema.safeParse('unverified').success).toBe(false);
  });

  it('limits the high-level outcome to created and rejected', () => {
    expect(curatedSignalOutcomeSchema.options).toEqual(['created', 'rejected']);
  });

  it('exposes the full CU2xx error-code space', () => {
    const codes = curatedSignalErrorCodeSchema.options;
    for (const expected of [
      'CU201_unauthorized',
      'CU202_role_inactive',
      'CU203_idempotency_conflict',
      'CU204_version_conflict',
      'CU205_fetch_failed',
      'CU206_evidence_missing',
      'CU207_quote_not_in_text',
      'CU208_invalid_url',
      'CU209_attestation_required',
      'CU210_source_not_paired',
    ]) {
      expect(codes).toContain(expected);
    }
    // Guard against typos: every code must start with CU2.
    for (const code of codes) expect(code.startsWith('CU2')).toBe(true);
  });
});
