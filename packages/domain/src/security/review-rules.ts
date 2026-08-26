import type {
  ActiveSecurityPosture,
  SecurityCandidateDecision,
  SecurityCandidateReasonCode,
  SecurityIncidentAction,
  SecurityIncidentReasonCode,
  SecurityIncidentState,
  SecurityIndicatorDisclosureDecision,
  SecurityIndicatorDisclosureReasonCode,
  SecuritySeverity,
} from '@airdrop/contracts';

import { compareSecurityPosture } from './posture.js';

export type SecurityRuleValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'security_command_invalid' };

export interface CandidateDecisionInput {
  readonly decision: SecurityCandidateDecision;
  readonly reasonCode: SecurityCandidateReasonCode;
}

export type IncidentCurrentDecision =
  | {
  readonly state: Extract<SecurityIncidentState, 'active'>;
  readonly posture: ActiveSecurityPosture;
  readonly severity: SecuritySeverity;
  readonly summary: string;
  }
  | {
  readonly state: Extract<SecurityIncidentState, 'resolved'>;
  readonly posture: null;
  readonly severity: SecuritySeverity;
  readonly summary: string;
  };

export interface IncidentTransitionCommand {
  readonly action: SecurityIncidentAction;
  readonly reasonCode: SecurityIncidentReasonCode;
  readonly evidenceId: string;
  readonly resultingPosture?: ActiveSecurityPosture;
  readonly resultingSeverity: SecuritySeverity;
  readonly publicSummary: string;
}

export interface IncidentTransitionInput {
  readonly current: IncidentCurrentDecision | null;
  readonly command: IncidentTransitionCommand;
}

export interface DisclosureDecisionInput {
  readonly decision: SecurityIndicatorDisclosureDecision;
  readonly reasonCode: SecurityIndicatorDisclosureReasonCode;
}

const invalid: SecurityRuleValidationResult = { ok: false, code: 'security_command_invalid' };
const valid: SecurityRuleValidationResult = { ok: true };

export function validateCandidateDecision(input: CandidateDecisionInput): SecurityRuleValidationResult {
  const allowedReasons: Record<SecurityCandidateDecision, readonly SecurityCandidateReasonCode[]> = {
    needs_review: ['source_mismatch', 'grounding_failed', 'insufficient_context', 'wrong_scope'],
    reject: ['claim_not_supported', 'source_mismatch', 'duplicate_candidate', 'wrong_scope'],
    accept_and_open: ['evidence_verified'],
    accept_and_attach: ['evidence_verified'],
  };
  return allowedReasons[input.decision].includes(input.reasonCode) ? valid : invalid;
}

export function validateIncidentTransition(
  input: IncidentTransitionInput,
): SecurityRuleValidationResult {
  const { current, command } = input;
  if (command.evidenceId.length === 0) {
    return invalid;
  }

  switch (command.action) {
    case 'open':
      return current === null && command.resultingPosture !== undefined && isOpenReason(command.reasonCode)
        ? valid
        : invalid;
    case 'reopen':
      return current?.state === 'resolved' && command.resultingPosture !== undefined && isOpenReason(command.reasonCode)
        ? valid
        : invalid;
    case 'resolve':
      return current?.state === 'active' && isResolveReason(command.reasonCode) ? valid : invalid;
    case 'attach_indicator':
      return isExactActiveCarryForward(current, command) && command.reasonCode === 'additional_evidence'
        ? valid
        : invalid;
    case 'adjust':
      return current?.state === 'active' && command.resultingPosture !== undefined
        && isCompatibleAdjustment(current, command)
        ? valid
        : invalid;
  }
}

export function validateDisclosureDecision(
  input: DisclosureDecisionInput,
): SecurityRuleValidationResult {
  if (input.decision === 'publish') {
    return input.reasonCode === 'safe_for_public_warning' ? valid : invalid;
  }
  return input.reasonCode === 'sensitive_indicator' || input.reasonCode === 'disclosure_no_longer_needed'
    ? valid
    : invalid;
}

function isOpenReason(reasonCode: SecurityIncidentReasonCode): boolean {
  return reasonCode === 'precautionary_evidence' || reasonCode === 'active_exploitation';
}

function isResolveReason(reasonCode: SecurityIncidentReasonCode): boolean {
  return reasonCode === 'mitigation_verified'
    || reasonCode === 'false_positive_verified'
    || reasonCode === 'scope_corrected';
}

function isExactActiveCarryForward(
  current: IncidentCurrentDecision | null,
  command: IncidentTransitionCommand,
): boolean {
  return current?.state === 'active'
    && command.resultingPosture === current.posture
    && command.resultingSeverity === current.severity
    && command.publicSummary === current.summary;
}

function isCompatibleAdjustment(
  current: IncidentCurrentDecision,
  command: IncidentTransitionCommand,
): boolean {
  const postureDifference = compareSecurityPosture(command.resultingPosture!, current.posture!);
  if (postureDifference > 0) {
    return command.reasonCode === 'evidence_escalated' || command.reasonCode === 'active_exploitation';
  }
  if (postureDifference < 0) {
    return command.reasonCode === 'evidence_deescalated'
      || command.reasonCode === 'mitigation_verified'
      || command.reasonCode === 'scope_corrected';
  }
  return command.publicSummary !== current.summary
    && (command.reasonCode === 'additional_evidence' || command.reasonCode === 'mitigation_verified');
}
