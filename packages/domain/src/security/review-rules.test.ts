import { describe, expect, it } from 'vitest';

import {
  validateCandidateDecision,
  validateDisclosureDecision,
  validateIncidentTransition,
} from '../index.js';

const active = {
  state: 'active' as const,
  posture: 'blocked' as const,
  severity: 'critical' as const,
  summary: '风险仍在持续。',
};
const resolved = {
  state: 'resolved' as const,
  posture: null,
  severity: 'high' as const,
  summary: '此前风险已经处理。',
};

function expectInvalid(result: { readonly ok: boolean; readonly code?: string }): void {
  expect(result).toEqual({ ok: false, code: 'security_command_invalid' });
}

describe('candidate decision reasons', () => {
  // Break caught: accepting a candidate without verified evidence, or rejecting it with an acceptance reason.
  it.each([
    ['needs_review', 'source_mismatch', true],
    ['needs_review', 'grounding_failed', true],
    ['needs_review', 'insufficient_context', true],
    ['needs_review', 'wrong_scope', true],
    ['needs_review', 'evidence_verified', false],
    ['reject', 'claim_not_supported', true],
    ['reject', 'source_mismatch', true],
    ['reject', 'duplicate_candidate', true],
    ['reject', 'wrong_scope', true],
    ['reject', 'grounding_failed', false],
    ['accept_and_open', 'evidence_verified', true],
    ['accept_and_open', 'source_mismatch', false],
    ['accept_and_attach', 'evidence_verified', true],
    ['accept_and_attach', 'duplicate_candidate', false],
  ] as const)('permits %s with %s: %s', (decision, reasonCode, expected) => {
    expect(validateCandidateDecision({ decision, reasonCode }).ok).toBe(expected);
  });
});

describe('incident transitions', () => {
  // Break caught: reopening or adjusting a record that has never been opened.
  it('allows open only when there is no current incident', () => {
    expect(validateIncidentTransition({
      current: null,
      command: {
        action: 'open',
        reasonCode: 'precautionary_evidence',
        evidenceId: 'evidence-1',
        resultingPosture: 'caution',
        resultingSeverity: 'low',
        publicSummary: '新近证据显示需要保持谨慎。',
      },
    })).toEqual({ ok: true });
    expectInvalid(validateIncidentTransition({
      current: active,
      command: {
        action: 'open',
        reasonCode: 'active_exploitation',
        evidenceId: 'evidence-1',
        resultingPosture: 'blocked',
        resultingSeverity: 'critical',
        publicSummary: active.summary,
      },
    }));
  });

  // Break caught: accepting invalid stricter, less-strict, or same-posture adjustment reasons.
  it.each([
    ['caution', 'blocked', 'evidence_escalated', 'higher posture', true],
    ['caution', 'blocked', 'active_exploitation', 'higher posture exploitation', true],
    ['caution', 'blocked', 'evidence_deescalated', 'higher posture de-escalation', false],
    ['blocked', 'caution', 'mitigation_verified', 'lower posture', true],
    ['blocked', 'caution', 'scope_corrected', 'lower posture scope correction', true],
    ['blocked', 'caution', 'evidence_deescalated', 'lower posture de-escalation', true],
    ['blocked', 'caution', 'evidence_escalated', 'lower posture escalation', false],
    ['blocked', 'blocked', 'additional_evidence', 'same posture with changed summary', true],
    ['blocked', 'blocked', 'mitigation_verified', 'same posture mitigation verification', true],
    ['blocked', 'blocked', 'scope_corrected', 'same posture scope correction', false],
  ] as const)('validates %s to %s with %s', (currentPosture, resultingPosture, reasonCode, _case, expected) => {
    const result = validateIncidentTransition({
      current: { ...active, posture: currentPosture },
      command: {
        action: 'adjust',
        reasonCode,
        evidenceId: 'evidence-2',
        resultingPosture,
        resultingSeverity: 'high',
        publicSummary: '经复核后的公开风险摘要。',
      },
    });
    expect(result.ok).toBe(expected);
  });

  // Break caught: treating a same-posture, same-summary adjustment as a valid history row.
  it('rejects a same-posture adjustment without a changed public summary', () => {
    expectInvalid(validateIncidentTransition({
      current: { ...active, posture: 'caution', severity: 'high' },
      command: {
        action: 'adjust',
        reasonCode: 'additional_evidence',
        evidenceId: 'evidence-3',
        resultingPosture: 'caution',
        resultingSeverity: 'high',
        publicSummary: active.summary,
      },
    }));
  });

  // Break caught: resolving one incident being rejected because a separate active incident could still block the target.
  it('allows an individual active incident to resolve independently', () => {
    for (const reasonCode of ['mitigation_verified', 'false_positive_verified', 'scope_corrected'] as const) {
      expect(validateIncidentTransition({
        current: active,
        command: {
          action: 'resolve',
          reasonCode,
          evidenceId: 'evidence-4',
          resultingSeverity: 'critical',
          publicSummary: '该独立事件已被确认并解除。',
        },
      })).toEqual({ ok: true });
    }
  });

  // Break caught: attaching an indicator with an implicit posture/severity/summary adjustment.
  it('requires attach_indicator to carry forward the active decision exactly', () => {
    expect(validateIncidentTransition({
      current: active,
      command: {
        action: 'attach_indicator',
        reasonCode: 'additional_evidence',
        evidenceId: 'evidence-5',
        resultingPosture: 'blocked',
        resultingSeverity: 'critical',
        publicSummary: active.summary,
      },
    })).toEqual({ ok: true });
    expectInvalid(validateIncidentTransition({
      current: active,
      command: {
        action: 'attach_indicator',
        reasonCode: 'additional_evidence',
        evidenceId: 'evidence-5',
        resultingPosture: 'blocked',
        resultingSeverity: 'high',
        publicSummary: active.summary,
      },
    }));
  });

  // Break caught: allowing reopen while active or resolve after it was already resolved.
  it('allows reopen only after resolution and resolve only while active', () => {
    expect(validateIncidentTransition({
      current: resolved,
      command: {
        action: 'reopen',
        reasonCode: 'active_exploitation',
        evidenceId: 'evidence-6',
        resultingPosture: 'blocked',
        resultingSeverity: 'critical',
        publicSummary: '新的证据需要重新启用限制。',
      },
    })).toEqual({ ok: true });
    expectInvalid(validateIncidentTransition({
      current: active,
      command: {
        action: 'reopen',
        reasonCode: 'precautionary_evidence',
        evidenceId: 'evidence-6',
        resultingPosture: 'caution',
        resultingSeverity: 'high',
        publicSummary: active.summary,
      },
    }));
    expectInvalid(validateIncidentTransition({
      current: resolved,
      command: {
        action: 'resolve',
        reasonCode: 'mitigation_verified',
        evidenceId: 'evidence-6',
        resultingSeverity: 'high',
        publicSummary: resolved.summary,
      },
    }));
  });
});

describe('indicator disclosure decisions', () => {
  // Break caught: publishing sensitive indicators or withdrawing with a public-warning reason.
  it.each([
    ['publish', 'safe_for_public_warning', true],
    ['publish', 'sensitive_indicator', false],
    ['withdraw', 'sensitive_indicator', true],
    ['withdraw', 'disclosure_no_longer_needed', true],
    ['withdraw', 'safe_for_public_warning', false],
  ] as const)('permits %s with %s: %s', (decision, reasonCode, expected) => {
    expect(validateDisclosureDecision({ decision, reasonCode }).ok).toBe(expected);
  });
});
