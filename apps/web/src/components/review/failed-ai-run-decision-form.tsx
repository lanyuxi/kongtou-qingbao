'use client';

import type {
  FailedAiRunDecision,
  FailedAiRunReasonCode,
} from '@airdrop/contracts';
import { useState, type FormEvent } from 'react';

import type { ReviewApiClient } from '../../lib/review-api-client.js';

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
  const [decision, setDecision] = useState<FailedAiRunDecision>('needs_investigation');
  const [reasonCode, setReasonCode] = useState<FailedAiRunReasonCode>('provider_instability');
  const [note, setNote] = useState('');
  const [state, setState] = useState<DecisionSubmissionState>(initialState);

  function changeDecision(next: FailedAiRunDecision): void {
    setDecision(next);
    const firstReason = failedAiRunReasonsFor(next)[0];
    if (firstReason !== undefined) setReasonCode(firstReason);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setState({ status: 'submitting' });
    setState(await submitFailedAiRunDecision({
      api,
      runId,
      displayedReviewVersion,
      decision,
      reasonCode,
      note,
      refresh: onRefresh,
      sessionExpired: onSessionExpired,
    }));
  }

  return (
    <form className="review-form" onSubmit={(event) => { void submit(event); }}>
      <input type="hidden" name="expectedReviewVersion" value={displayedReviewVersion} />
      <div className="review-field">
        <label htmlFor="review-decision">决策</label>
        <select
          id="review-decision"
          name="decision"
          value={decision}
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
          value={reasonCode}
          onChange={(event) => setReasonCode(event.currentTarget.value as FailedAiRunReasonCode)}
        >
          {failedAiRunReasonsFor(decision).map((reason) => (
            <option key={reason} value={reason}>{reason}</option>
          ))}
        </select>
      </div>
      <div className="review-field">
        <label htmlFor="review-note">备注（可选）</label>
        <textarea
          id="review-note"
          name="note"
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
      </div>
      <DecisionMessage state={state} />
      <button className="review-button" type="submit" disabled={state.status === 'submitting'}>
        {state.status === 'submitting' ? '正在提交…' : '提交决策'}
      </button>
    </form>
  );
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
