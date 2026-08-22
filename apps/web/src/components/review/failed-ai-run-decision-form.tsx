'use client';

import type {
  FailedAiRunDecision,
  FailedAiRunReasonCode,
} from '@airdrop/contracts';
import { useRef, useState, type FormEvent } from 'react';

import type { ReviewApiClient } from '../../lib/review-api-client.js';
import type { PendingActionGate } from '../../lib/review-pending-action.js';
import { createPendingActionGate } from '../../lib/review-pending-action.js';

const investigationReasons = [
  'provider_instability',
  'schema_regression',
  'grounding_regression',
  'source_data_problem',
  'suspected_prompt_injection',
  'other',
] as const satisfies readonly FailedAiRunReasonCode[];

const dismissalReasons = [
  'transient_failure',
  'duplicate_or_superseded',
  'expected_invalid_input',
  'no_action_needed',
  'other',
] as const satisfies readonly FailedAiRunReasonCode[];

export type DecisionSubmissionState = {
  readonly status: 'idle' | 'submitting' | 'saved' | 'conflict' | 'forbidden' | 'failed';
};

export interface FailedAiRunDecisionDraft {
  readonly decision: FailedAiRunDecision;
  readonly reasonCode: FailedAiRunReasonCode;
  readonly note: string | null;
}

export function failedAiRunReasonsFor(
  decision: FailedAiRunDecision,
): readonly FailedAiRunReasonCode[] {
  return decision === 'needs_investigation' ? investigationReasons : dismissalReasons;
}

export function FailedAiRunDecisionForm({
  api,
  runId,
  displayedReviewVersion,
  onRefresh,
  onSessionExpired,
  initialState = { status: 'idle' },
}: {
  readonly api: ReviewApiClient;
  readonly runId: string;
  readonly displayedReviewVersion: number;
  readonly onRefresh: () => Promise<void>;
  readonly onSessionExpired: () => void;
  readonly initialState?: DecisionSubmissionState;
}) {
  const [draft, setDraft] = useState<FailedAiRunDecisionDraft>({
    decision: 'needs_investigation',
    reasonCode: 'provider_instability',
    note: null,
  });
  const [state, setState] = useState<DecisionSubmissionState>(initialState);
  const submissionGate = useRef(createPendingActionGate());

  function changeDecision(next: FailedAiRunDecision): void {
    setDraft((current) => changeFailedAiRunDecision(current, next));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setState({ status: 'submitting' });
    setState(await submitFailedAiRunDecisionOnce(submissionGate.current, {
      api,
      runId,
      displayedReviewVersion,
      ...draft,
      refresh: onRefresh,
      sessionExpired: onSessionExpired,
    }));
  }

  const disabled = state.status === 'submitting';
  const note = draft.note ?? '';

  return (
    <form className="review-form" onSubmit={(event) => { void submit(event); }}>
      <input type="hidden" name="expectedReviewVersion" value={displayedReviewVersion} />
      <div className="review-field">
        <label htmlFor="review-decision">决策</label>
        <select
          id="review-decision"
          name="decision"
          value={draft.decision}
          disabled={disabled}
          onChange={(event) => changeDecision(event.currentTarget.value as FailedAiRunDecision)}
        >
          <option value="needs_investigation">需要调查</option>
          <option value="dismiss">忽略</option>
        </select>
      </div>
      <div className="review-field">
        <label htmlFor="review-reason">原因</label>
        <select
          id="review-reason"
          name="reasonCode"
          value={draft.reasonCode}
          disabled={disabled}
          onChange={(event) => setDraft((current) => ({
            ...current,
            reasonCode: event.currentTarget.value as FailedAiRunReasonCode,
          }))}
        >
          {failedAiRunReasonsFor(draft.decision).map((reason) => (
            <option key={reason} value={reason}>{reason}</option>
          ))}
        </select>
      </div>
      <div className="review-field">
        <label htmlFor="review-note">备注（可选）</label>
        <textarea
          id="review-note"
          name="note"
          disabled={disabled}
          value={note}
          onChange={(event) => setDraft((current) => ({
            ...current,
            note: normalizeReviewNoteInput(event.currentTarget.value),
          }))}
        />
        <span className="review-note-count">{Array.from(note).length} / 1000</span>
      </div>
      <DecisionMessage state={state} />
      <button className="review-button" type="submit" disabled={disabled}>
        {state.status === 'submitting' ? '正在提交…' : '提交决策'}
      </button>
    </form>
  );
}

export function changeFailedAiRunDecision(
  draft: FailedAiRunDecisionDraft,
  decision: FailedAiRunDecision,
): FailedAiRunDecisionDraft {
  const reasonCode = failedAiRunReasonsFor(decision)[0];
  return {
    ...draft,
    decision,
    reasonCode: reasonCode ?? 'other',
  };
}

export function normalizeReviewNoteInput(value: string): string {
  return Array.from(value).slice(0, 1000).join('');
}

export async function submitFailedAiRunDecision({
  api,
  runId,
  displayedReviewVersion,
  decision,
  reasonCode,
  note,
  refresh,
  sessionExpired,
}: {
  readonly api: ReviewApiClient;
  readonly runId: string;
  readonly displayedReviewVersion: number;
  readonly decision: FailedAiRunDecision;
  readonly reasonCode: FailedAiRunReasonCode;
  readonly note: string | null;
  readonly refresh: () => Promise<void>;
  readonly sessionExpired: () => void;
}): Promise<DecisionSubmissionState> {
  if (!failedAiRunReasonsFor(decision).includes(reasonCode)) return { status: 'failed' };
  const trimmedNote = note?.trim() ?? '';
  const result = await api.decide(runId, {
    version: 1,
    expectedReviewVersion: displayedReviewVersion,
    decision,
    reasonCode,
    note: trimmedNote === '' ? null : trimmedNote,
  });
  if (result.ok) {
    await refresh();
    return { status: 'saved' };
  }
  if (result.state === 'sign_in_required') {
    sessionExpired();
    return { status: 'idle' };
  }
  if (result.state === 'conflict') {
    await refresh();
    return { status: 'conflict' };
  }
  if (result.state === 'forbidden') return { status: 'forbidden' };
  return { status: 'failed' };
}

export async function submitFailedAiRunDecisionOnce(
  gate: PendingActionGate,
  input: Parameters<typeof submitFailedAiRunDecision>[0],
): Promise<DecisionSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    return await submitFailedAiRunDecision(input);
  } finally {
    gate.finish();
  }
}

function DecisionMessage({ state }: { readonly state: DecisionSubmissionState }) {
  if (state.status === 'saved') return <p className="review-message" role="status">决策已保存，详情已刷新。</p>;
  if (state.status === 'conflict') {
    return <p className="review-message review-message-error" role="alert">审核状态已变化，已刷新最新版本，请重新确认后提交。</p>;
  }
  if (state.status === 'forbidden') {
    return <p className="review-message review-message-error" role="alert">当前账号没有有效的审核权限。</p>;
  }
  if (state.status === 'failed') return <p className="review-message review-message-error" role="alert">决策暂时无法提交。请刷新后重试。</p>;
  return null;
}
