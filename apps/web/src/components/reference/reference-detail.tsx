'use client';

import type {
  DecideReferenceCommandV1,
  ReferenceDecision,
  ReferenceReasonCode,
  ReviewerReferenceDetail,
} from '@airdrop/contracts';
import { decideReferenceCommandV1Schema } from '@airdrop/contracts';
import { useRef, useState, type FormEvent } from 'react';

import { createPendingActionGate, type PendingActionGate } from '../../lib/review-pending-action.js';
import type { ReferenceReviewApiClient } from '../../lib/reference-review-api-client.js';
import type { ReviewSessionController } from '../../lib/review-session.js';
import {
  SubmissionMessage,
  type ReferenceSubmissionState,
} from './authority-detail.js';
import { formatReviewDate } from '../review/failed-ai-run-list.js';
import { displayReviewValue } from '../review/safe-review-text.js';

export type ReferenceDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'not_found' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly reference: ReviewerReferenceDetail };

export interface ReferenceDecisionDraft {
  readonly decision: ReferenceDecision;
  readonly evidenceId: string;
  readonly reasonCode: ReferenceReasonCode;
  readonly note: string;
}

export interface ReferenceDecisionConfirmation {
  readonly affirmed: boolean;
  readonly draft: ReferenceDecisionDraft;
  readonly reference: { readonly referenceId: string; readonly referenceVersion: number };
}

export function ReferenceDetail({ reference }: { readonly reference: ReviewerReferenceDetail }) {
  const authority = reference.domainAuthority;
  return (
    <div className="review-detail">
      <section className="review-panel" aria-labelledby="reference-detail-heading">
        <div className="review-panel-heading">
          <div>
            <h1 id="reference-detail-heading">引用条目</h1>
            <p>只有 verified 状态且无未释放安全标记的引用才会公开渲染。</p>
          </div>
          <span className="review-badge">{reference.state}</span>
        </div>
        <dl className="review-metadata">
          <Metadata label="引用 ID" value={reference.referenceId} />
          <Metadata label="项目 ID" value={reference.projectId} />
          <Metadata label="类型" value={reference.kind} />
          <Metadata label="标签" value={reference.label} />
          <Metadata label="URL" value={reference.url} />
          <Metadata label="当前版本" value={String(reference.referenceVersion)} />
          <Metadata label="最近核验" value={reference.lastVerifiedAt ?? '尚未核验'} />
          <Metadata label="活跃安全指标" value={reference.activeIndicatorId ?? '无'} />
          <Metadata label="域名权威" value={authority === null ? '无已授权域名' : `${authority.domain} · ${authority.state} v${authority.authorityVersion}`} />
          <Metadata label="更新时间" value={formatReviewDate(reference.updatedAt)} />
        </dl>
      </section>
      <section className="review-panel" aria-labelledby="reference-history-heading">
        <h2 id="reference-history-heading">不可变更的引用历史</h2>
        <ol className="review-history">
          {reference.decisions.map((decision, index) => (
            <li key={decision.decisionId}>
              <strong>{`v${index + 1} · ${decision.decision}`}</strong>
              <span>{`${decision.resultingState} · ${decision.reasonCode}`}</span>
              <Metadata label="证据 ID" value={decision.evidenceId ?? '—'} />
              <Metadata label="备注" value={decision.note ?? '—'} />
              <time dateTime={decision.createdAt}>{formatReviewDate(decision.createdAt)}</time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export async function loadReferenceDetail({ session, api, referenceId, redirect }: {
  readonly session: ReviewSessionController;
  readonly api: ReferenceReviewApiClient;
  readonly referenceId: string;
  readonly redirect: (path: string) => void;
}): Promise<ReferenceDetailState> {
  if (await session.getAccessToken() === null) {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  const result = await api.getReference(referenceId);
  if (result.ok) return { status: 'ready', reference: result.data };
  if (result.state === 'sign_in_required') {
    await session.signOut();
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  if (result.state === 'forbidden') {
    await session.signOut();
    return { status: 'forbidden' };
  }
  return result.state === 'not_found' ? { status: 'not_found' } : { status: 'failed' };
}

export function ReferenceDecisionForm({ api, reference, onRefresh, onSessionExpired }: {
  readonly api: ReferenceReviewApiClient;
  readonly reference: ReviewerReferenceDetail;
  readonly onRefresh: () => Promise<void>;
  readonly onSessionExpired: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<ReferenceDecisionDraft>(initialReferenceDraft(reference));
  const [confirmation, setConfirmation] = useState<ReferenceDecisionConfirmation | null>(null);
  const [state, setState] = useState<ReferenceSubmissionState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const pending = state.status === 'submitting';
  const command = buildReferenceDecisionCommand(reference, draft);
  const confirmed = isReferenceDecisionConfirmed(reference, draft, confirmation);

  function update(next: Partial<ReferenceDecisionDraft>) {
    setDraft((value) => ({ ...value, ...next }));
    setConfirmation(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setState({ status: 'submitting' });
    const next = await submitReferenceDecisionOnce(gate.current, {
      api, reference, draft, confirmation, refresh: onRefresh, sessionExpired: onSessionExpired,
    });
    setConfirmation(next.status === 'conflict' ? null : confirmation);
    setState(next);
  }

  return (
    <form className="review-form" onSubmit={(event) => { void submit(event); }}>
      <Field label="决策">
        <select
          value={draft.decision}
          disabled={pending}
          onChange={(event) => update({ decision: event.currentTarget.value as ReferenceDecision })}
        >
          {referenceDecisions.map((decision) => <option key={decision} value={decision}>{decision}</option>)}
        </select>
      </Field>
      <Text
        label="证据 ID"
        value={draft.evidenceId}
        disabled={pending}
        onChange={(evidenceId) => update({ evidenceId })}
      />
      <Field label="原因">
        <select
          value={draft.reasonCode}
          disabled={pending}
          onChange={(event) => update({ reasonCode: event.currentTarget.value as ReferenceReasonCode })}
        >
          {reasonCodes.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      </Field>
      <Text label="内部备注（可选）" value={draft.note} disabled={pending} onChange={(note) => update({ note })} multiline />
      <ReferenceConfirmation reference={reference} draft={draft} />
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending || command === null}
          onChange={(event) => setConfirmation(event.currentTarget.checked
            ? {
              affirmed: true,
              draft,
              reference: { referenceId: reference.referenceId, referenceVersion: reference.referenceVersion },
            }
            : null)}
        />
        {' 我已核对以上命令摘要，并确认提交。'}
      </label>
      <SubmissionMessage state={state} />
      <button className="review-button" type="submit" disabled={pending || !confirmed || command === null}>
        {pending ? '正在提交…' : '提交引用决策'}
      </button>
    </form>
  );
}

export function initialReferenceDraft(reference: ReviewerReferenceDetail): ReferenceDecisionDraft {
  return {
    decision: reference.state === 'candidate' ? 'verify' : 'reverify',
    evidenceId: '',
    reasonCode: 'evidence_verified',
    note: '',
  };
}

// verify, reverify, and restore must ground in Evidence; withdraw is a reviewer
// judgement and carries no Evidence requirement.
export function requiresReferenceEvidence(decision: ReferenceDecision): boolean {
  return decision === 'verify' || decision === 'reverify' || decision === 'restore';
}

export function buildReferenceDecisionCommand(
  reference: ReviewerReferenceDetail,
  draft: ReferenceDecisionDraft,
): DecideReferenceCommandV1 | null {
  const evidenceId = draft.evidenceId.trim();
  const command = {
    version: 1 as const,
    referenceId: reference.referenceId,
    expectedVersion: reference.referenceVersion,
    decision: draft.decision,
    reasonCode: draft.reasonCode,
    evidenceId: evidenceId === '' ? null : evidenceId,
    note: nullIfEmpty(draft.note),
  };
  const parsed = decideReferenceCommandV1Schema.safeParse(command);
  return parsed.success ? parsed.data : null;
}

export function isReferenceDecisionConfirmed(
  reference: ReviewerReferenceDetail,
  draft: ReferenceDecisionDraft,
  confirmation: ReferenceDecisionConfirmation | null | undefined,
): boolean {
  if (confirmation === null || confirmation === undefined) return false;
  return confirmation.affirmed
    && same(confirmation.draft, draft)
    && same(confirmation.reference, {
      referenceId: reference.referenceId,
      referenceVersion: reference.referenceVersion,
    });
}

export async function submitReferenceDecisionOnce(gate: PendingActionGate, input: {
  readonly api: ReferenceReviewApiClient;
  readonly reference: ReviewerReferenceDetail;
  readonly draft: ReferenceDecisionDraft;
  readonly confirmation?: ReferenceDecisionConfirmation | null;
  readonly refresh: () => Promise<void>;
  readonly sessionExpired: () => void | Promise<void>;
}): Promise<ReferenceSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    if (!isReferenceDecisionConfirmed(input.reference, input.draft, input.confirmation)) {
      return { status: 'failed', message: '请在核对当前命令摘要后确认提交。' };
    }
    const command = buildReferenceDecisionCommand(input.reference, input.draft);
    if (command === null) return { status: 'failed', message: '请填写完整且有效的引用决策。' };
    const result = await input.api.decideReference(input.reference.referenceId, command);
    if (result.ok) {
      await input.refresh();
      return { status: 'saved', message: '引用决策已保存，详情已刷新。' };
    }
    if (result.state === 'sign_in_required' || result.state === 'forbidden') {
      await input.sessionExpired();
      return { status: 'forbidden', message: '当前账号没有有效的审核权限。' };
    }
    if (result.state === 'conflict' && result.code === 'reference_version_conflict') {
      await input.refresh();
      return { status: 'conflict', message: '引用记录已更新，请检查最新版本后重新提交。' };
    }
    return { status: 'failed', message: '引用决策暂时无法提交。请刷新后重试。' };
  } finally {
    gate.finish();
  }
}

function ReferenceConfirmation({ reference, draft }: {
  readonly reference: ReviewerReferenceDetail;
  readonly draft: ReferenceDecisionDraft;
}) {
  return (
    <section className="review-panel" aria-label="高影响命令确认">
      <h2>提交前确认</h2>
      <dl className="review-metadata">
        <Metadata label="引用 ID" value={reference.referenceId} />
        <Metadata label="URL" value={reference.url} />
        <Metadata label="当前版本" value={String(reference.referenceVersion)} />
        <Metadata label="决策" value={draft.decision} />
        <Metadata label="原因" value={draft.reasonCode} />
        <Metadata label="证据 ID" value={draft.evidenceId === '' ? '未填写' : draft.evidenceId} />
      </dl>
    </section>
  );
}

function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function Metadata({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><dt>{label}</dt><dd>{displayReviewValue(value)}</dd></div>;
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return <div className="review-field"><label>{label}</label>{children}</div>;
}

function Text({ label, value, disabled, onChange, multiline = false }: {
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly multiline?: boolean;
}) {
  return (
    <div className="review-field">
      <label>{label}</label>
      {multiline
        ? <textarea value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />
        : <input value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />}
    </div>
  );
}

const referenceDecisions = ['verify', 'reverify', 'restore', 'withdraw'] as const satisfies readonly ReferenceDecision[];
const reasonCodes = [
  'evidence_verified', 'official_announcement', 'corroborated_source', 'ownership_unproven',
  'domain_mismatch', 'duplicate_reference', 'source_no_longer_official', 'security_flag_cleared',
  'withdrawn_by_reviewer', 'insufficient_context',
] as const satisfies readonly ReferenceReasonCode[];
