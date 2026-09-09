import type { ExecutionErrorCode } from '@airdrop/contracts';

/**
 * The one submission-state machine shared by every Execution surface. Failure
 * codes are rendered as-is (stable codes, never prose branches); the conflict
 * bucket only decides whether a reload affordance is shown.
 */
export type ExecutionSubmissionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'saved' }
  | { readonly status: 'removed' }
  | { readonly status: 'session_required' }
  | { readonly status: 'failed'; readonly code: ExecutionErrorCode }
  | { readonly status: 'conflict'; readonly code: ExecutionErrorCode };

const conflictCodes: readonly ExecutionErrorCode[] = [
  'execution_version_conflict',
  'execution_idempotency_conflict',
  'execution_task_limit_reached',
  'execution_watchlist_limit_reached',
  'execution_watchlist_project_limit_reached',
  'execution_name_conflict',
];

export function executionSubmissionFailure(code: ExecutionErrorCode): ExecutionSubmissionState {
  if (code === 'execution_session_required') return { status: 'session_required' };
  if (conflictCodes.includes(code)) return { status: 'conflict', code };
  return { status: 'failed', code };
}
