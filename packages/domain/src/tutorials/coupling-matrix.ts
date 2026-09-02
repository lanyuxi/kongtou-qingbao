import type { TutorialStatus, TutorialStatusTrigger } from '@airdrop/contracts';

export type TutorialDemotionStatus = 'needs_review' | 'blocked';

// D5 severity mapping: security-level events block the tutorial outright,
// content-level events queue it for human re-verification. A blocked tutorial
// never demotes further, and nothing returns to published without a fresh
// human-approved version.
const TRIGGER_SEVERITY: Readonly<Record<TutorialStatusTrigger, TutorialDemotionStatus>> = {
  project_blocked: 'blocked',
  source_blocked: 'needs_review',
  reference_unrenderable: 'needs_review',
  signal_disputed: 'needs_review',
  signal_retracted: 'needs_review',
  lifecycle_changed: 'needs_review',
};

export function tutorialTriggerSeverity(trigger: TutorialStatusTrigger): TutorialDemotionStatus {
  return TRIGGER_SEVERITY[trigger];
}

/**
 * Resolve the status a tutorial moves to when a coupling trigger fires, or
 * `null` when the current status is unaffected. Only public-facing statuses
 * participate: a published tutorial demotes per the trigger severity, a
 * needs_review tutorial escalates only under a security trigger, and blocked,
 * retired, and non-persisted states stay untouched by automation.
 */
export function resolveTutorialStatusTransition(
  currentStatus: TutorialStatus,
  trigger: TutorialStatusTrigger,
): TutorialDemotionStatus | null {
  const severity = TRIGGER_SEVERITY[trigger];
  switch (currentStatus) {
    case 'published':
      return severity;
    case 'needs_review':
      return severity === 'blocked' ? 'blocked' : null;
    case 'blocked':
    case 'retired':
    case 'draft':
    case 'in_review':
      return null;
  }
}
