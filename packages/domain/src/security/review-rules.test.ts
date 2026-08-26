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
  // Break caught: accepting, rejecting, or deferring a candidate with a reason outside the full matrix.
  it.each([
    ['needs_review', 'evidence_verified', false],
    ['needs_review', 'claim_not_supported', false],
    ['needs_review', 'source_mismatch', true],
    ['needs_review', 'duplicate_candidate', false],
    ['needs_review', 'wrong_scope', true],
    ['needs_review', 'grounding_failed', true],
    ['needs_review', 'insufficient_context', true],
    ['reject', 'evidence_verified', false],
    ['reject', 'claim_not_supported', true],
    ['reject', 'source_mismatch', true],
    ['reject', 'duplicate_candidate', true],
    ['reject', 'wrong_scope', true],
    ['reject', 'grounding_failed', false],
    ['reject', 'insufficient_context', false],
    ['accept_and_open', 'evidence_verified', true],
    ['accept_and_open', 'claim_not_supported', false],
    ['accept_and_open', 'source_mismatch', false],
    ['accept_and_open', 'duplicate_candidate', false],
    ['accept_and_open', 'wrong_scope', false],
    ['accept_and_open', 'grounding_failed', false],
    ['accept_and_open', 'insufficient_context', false],
    ['accept_and_attach', 'evidence_verified', true],
    ['accept_and_attach', 'claim_not_supported', false],
    ['accept_and_attach', 'source_mismatch', false],
    ['accept_and_attach', 'duplicate_candidate', false],
    ['accept_and_attach', 'wrong_scope', false],
    ['accept_and_attach', 'grounding_failed', false],
    ['accept_and_attach', 'insufficient_context', false],
  ] as const)('permits %s with %s: %s', (decision, reasonCode, expected) => {
    expect(validateCandidateDecision({ decision, reasonCode }).ok).toBe(expected);
  });
});

describe('incident transitions', () => {
  // Break caught: allowing invalid reasons while opening or reopening an incident.
  it.each([
    ['open', 'precautionary_evidence', true],
    ['open', 'active_exploitation', true],
    ['open', 'evidence_escalated', false],
    ['open', 'evidence_deescalated', false],
    ['open', 'mitigation_verified', false],
    ['open', 'scope_corrected', false],
    ['open', 'additional_evidence', false],
    ['open', 'false_positive_verified', false],
    ['reopen', 'precautionary_evidence', true],
    ['reopen', 'active_exploitation', true],
    ['reopen', 'evidence_escalated', false],
    ['reopen', 'evidence_deescalated', false],
    ['reopen', 'mitigation_verified', false],
    ['reopen', 'scope_corrected', false],
    ['reopen', 'additional_evidence', false],
    ['reopen', 'false_positive_verified', false],
  ] as const)('validates %s with %s', (action, reasonCode, expected) => {
    expect(validateIncidentTransition({
      current: action === 'open' ? null : resolved,
      command: {
        action,
        reasonCode,
        evidenceId: 'evidence-1',
        resultingPosture: 'caution',
        resultingSeverity: 'low',
        publicSummary: '新近证据显示需要保持谨慎。',
      },
    }).ok).toBe(expected);
  });

  // Break caught: accepting an adjustment reason outside its strictness-specific matrix.
  it.each([
    ['caution', 'blocked', 'precautionary_evidence', false],
    ['caution', 'blocked', 'active_exploitation', true],
    ['caution', 'blocked', 'evidence_escalated', true],
    ['caution', 'blocked', 'evidence_deescalated', false],
    ['caution', 'blocked', 'mitigation_verified', false],
    ['caution', 'blocked', 'scope_corrected', false],
    ['caution', 'blocked', 'additional_evidence', false],
    ['caution', 'blocked', 'false_positive_verified', false],
    ['blocked', 'caution', 'precautionary_evidence', false],
    ['blocked', 'caution', 'active_exploitation', false],
    ['blocked', 'caution', 'evidence_escalated', false],
    ['blocked', 'caution', 'evidence_deescalated', true],
    ['blocked', 'caution', 'mitigation_verified', true],
    ['blocked', 'caution', 'scope_corrected', true],
    ['blocked', 'caution', 'additional_evidence', false],
    ['blocked', 'caution', 'false_positive_verified', false],
    ['blocked', 'blocked', 'precautionary_evidence', false],
    ['blocked', 'blocked', 'active_exploitation', false],
    ['blocked', 'blocked', 'evidence_escalated', false],
    ['blocked', 'blocked', 'evidence_deescalated', false],
    ['blocked', 'blocked', 'mitigation_verified', true],
    ['blocked', 'blocked', 'scope_corrected', false],
    ['blocked', 'blocked', 'additional_evidence', true],
    ['blocked', 'blocked', 'false_positive_verified', false],
  ] as const)('validates adjust from %s to %s with %s', (currentPosture, resultingPosture, reasonCode, expected) => {
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

  // Break caught: resolving an active incident with a non-resolution reason.
  it.each([
    ['precautionary_evidence', false],
    ['active_exploitation', false],
    ['evidence_escalated', false],
    ['evidence_deescalated', false],
    ['mitigation_verified', true],
    ['scope_corrected', true],
    ['additional_evidence', false],
    ['false_positive_verified', true],
  ] as const)('validates active resolve with %s', (reasonCode, expected) => {
    expect(validateIncidentTransition({
      current: active,
      command: {
        action: 'resolve',
        reasonCode,
        evidenceId: 'evidence-4',
        resultingSeverity: 'critical',
        publicSummary: '该独立事件已被确认并解除。',
      },
    }).ok).toBe(expected);
  });

  // Break caught: making one active incident's resolve depend on another incident's separate posture.
  it('allows an individual active incident to resolve independently', () => {
    expect(validateIncidentTransition({
      current: active,
      command: {
        action: 'resolve',
        reasonCode: 'false_positive_verified',
        evidenceId: 'evidence-independent',
        resultingSeverity: 'critical',
        publicSummary: '该独立事件已被确认并解除。',
      },
    })).toEqual({ ok: true });
  });

  // Break caught: attaching an indicator with a reason outside its single allowed reason.
  it.each([
    ['precautionary_evidence', false],
    ['active_exploitation', false],
    ['evidence_escalated', false],
    ['evidence_deescalated', false],
    ['mitigation_verified', false],
    ['scope_corrected', false],
    ['additional_evidence', true],
    ['false_positive_verified', false],
  ] as const)('validates attach_indicator with %s', (reasonCode, expected) => {
    expect(validateIncidentTransition({
      current: active,
      command: {
        action: 'attach_indicator',
        reasonCode,
        evidenceId: 'evidence-5',
        resultingPosture: 'blocked',
        resultingSeverity: 'critical',
        publicSummary: active.summary,
      },
    }).ok).toBe(expected);
  });

  // Break caught: attaching an indicator with an implicit posture, severity, or summary adjustment.
  it('requires attach_indicator to carry forward the active decision exactly', () => {
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
    expectInvalid(validateIncidentTransition({
      current: active,
      command: {
        action: 'attach_indicator',
        reasonCode: 'additional_evidence',
        evidenceId: 'evidence-5',
        resultingPosture: 'caution',
        resultingSeverity: 'critical',
        publicSummary: active.summary,
      },
    }));
    expectInvalid(validateIncidentTransition({
      current: active,
      command: {
        action: 'attach_indicator',
        reasonCode: 'additional_evidence',
        evidenceId: 'evidence-5',
        resultingPosture: 'blocked',
        resultingSeverity: 'critical',
        publicSummary: '更新后的摘要不能隐式附加。',
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
    ['publish', 'disclosure_no_longer_needed', false],
    ['withdraw', 'sensitive_indicator', true],
    ['withdraw', 'disclosure_no_longer_needed', true],
    ['withdraw', 'safe_for_public_warning', false],
  ] as const)('permits %s with %s: %s', (decision, reasonCode, expected) => {
    expect(validateDisclosureDecision({ decision, reasonCode }).ok).toBe(expected);
  });
});
