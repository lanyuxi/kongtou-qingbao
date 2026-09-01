'use client';

import type {
  DecideDomainAuthorityCommandV1,
  DomainAuthorityDecision,
  ReferenceReasonCode,
  ReviewerDomainAuthorityDetail,
} from '@airdrop/contracts';
import { decideDomainAuthorityCommandV1Schema } from '@airdrop/contracts';
import { useRef, useState, type FormEvent } from 'react';

import { createPendingActionGate, type PendingActionGate } from '../../lib/review-pending-action.js';
import type { ReferenceReviewApiClient } from '../../lib/reference-review-api-client.js';
import type { ReviewSessionController } from '../../lib/review-session.js';
import { formatReviewDate } from '../review/failed-ai-run-list.js';
import { displayReviewValue } from '../review/safe-review-text.js';

export type ReferenceSubmissionState = {
  readonly status: 'idle' | 'submitting' | 'saved' | 'conflict' | 'forbidden' | 'failed';
  readonly message?: string;
};

export type AuthorityDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'not_found' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly authority: ReviewerDomainAuthorityDetail };

export interface AuthorityDecisionDraft {
  readonly decision: DomainAuthorityDecision;
  readonly evidenceId: string;
  readonly reasonCode: ReferenceReasonCode;
  readonly note: string;
}

export interface AuthorityDecisionConfirmation {
  readonly affirmed: boolean;
  readonly draft: AuthorityDecisionDraft;
  readonly authority: { readonly authorityId: string; readonly authorityVersion: number };
}

export function AuthorityDetail({ authority }: { readonly authority: ReviewerDomainAuthorityDetail }) {
  return (
    <div className="review-detail">
      <section className="review-panel" aria-labelledby="authority-detail-heading">
        <div className="review-panel-heading">
          <div>
            <h1 id="authority-detail-heading">域名权威</h1>
            <p>域名权威只证明归属性，其下的 URL 仍需单独核验。</p>
          </div>
          <span className="review-badge">{authority.state}</span>
        </div>
        <dl className="review-metadata">
          <Metadata label="权威 ID" value={authority.authorityId} />
          <Metadata label="项目 ID" value={authority.projectId} />
          <Metadata label="域名" value={authority.domain} />
          <Metadata label="当前版本" value={String(authority.authorityVersion)} />
          <Metadata label="更新时间" value={formatReviewDate(authority.updatedAt)} />
        </dl>
      </section>
      <section className="review-panel" aria-labelledby="authority-history-heading">
        <h2 id="authority-history-heading">不可变更的权威历史</h2>
        <ol className="review-history">
          {authority.decisions.map((decision, index) => (
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

export async function loadAuthorityDetail({ session, api, authorityId, redirect }: {
  readonly session: ReviewSessionController;
  readonly api: ReferenceReviewApiClient;
  readonly authorityId: string;
  readonly redirect: (path: string) => void;
}): Promise<AuthorityDetailState> {
  if (await session.getAccessToken() === null) {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  const result = await api.getDomainAuthority(authorityId);
  if (result.ok) return { status: 'ready', authority: result.data };
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

export function AuthorityDecisionForm({ api, authority, onRefresh, onSessionExpired }: {
  readonly api: ReferenceReviewApiClient;
  readonly authority: ReviewerDomainAuthorityDetail;
  readonly onRefresh: () => Promise<void>;
  readonly onSessionExpired: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<AuthorityDecisionDraft>(initialAuthorityDraft(authority));
  const [confirmation, setConfirmation] = useState<AuthorityDecisionConfirmation | null>(null);
  const [state, setState] = useState<ReferenceSubmissionState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const pending = state.status === 'submitting';
  const command = buildAuthorityDecisionCommand(authority, draft);
  const confirmed = isAuthorityDecisionConfirmed(authority, draft, confirmation);

  function update(next: Partial<AuthorityDecisionDraft>) {
    setDraft((value) => ({ ...value, ...next }));
    setConfirmation(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setState({ status: 'submitting' });
    const next = await submitAuthorityDecisionOnce(gate.current, {
      api, authority, draft, confirmation, refresh: onRefresh, sessionExpired: onSessionExpired,
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
          onChange={(event) => update({ decision: event.currentTarget.value as DomainAuthorityDecision })}
        >
          {authorityDecisions.map((decision) => <option key={decision} value={decision}>{decision}</option>)}
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
      <AuthorityConfirmation authority={authority} draft={draft} />
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending || command === null}
          onChange={(event) => setConfirmation(event.currentTarget.checked
            ? {
              affirmed: true,
              draft,
              authority: { authorityId: authority.authorityId, authorityVersion: authority.authorityVersion },
            }
            : null)}
        />
        {' 我已核对以上命令摘要，并确认提交。'}
      </label>
      <SubmissionMessage state={state} />
      <button className="review-button" type="submit" disabled={pending || !confirmed || command === null}>
        {pending ? '正在提交…' : '提交权威决策'}
      </button>
    </form>
  );
}

export function initialAuthorityDraft(authority: ReviewerDomainAuthorityDetail): AuthorityDecisionDraft {
  return {
    decision: authority.state === 'granted' ? 'revoke' : 'grant',
    evidenceId: '',
    reasonCode: authority.state === 'granted' ? 'source_no_longer_official' : 'official_announcement',
    note: '',
  };
}

export function buildAuthorityDecisionCommand(
  authority: ReviewerDomainAuthorityDetail,
  draft: AuthorityDecisionDraft,
): DecideDomainAuthorityCommandV1 | null {
  const command = {
    version: 1 as const,
    authorityId: authority.authorityId,
    expectedVersion: authority.authorityVersion,
    decision: draft.decision,
    reasonCode: draft.reasonCode,
    evidenceId: draft.evidenceId.trim() === '' ? null : draft.evidenceId.trim(),
    note: nullIfEmpty(draft.note),
  };
  const parsed = decideDomainAuthorityCommandV1Schema.safeParse(command);
  return parsed.success ? parsed.data : null;
}

export function isAuthorityDecisionConfirmed(
  authority: ReviewerDomainAuthorityDetail,
  draft: AuthorityDecisionDraft,
  confirmation: AuthorityDecisionConfirmation | null | undefined,
): boolean {
  if (confirmation === null || confirmation === undefined) return false;
  return confirmation.affirmed
    && same(confirmation.draft, draft)
    && same(confirmation.authority, {
      authorityId: authority.authorityId,
      authorityVersion: authority.authorityVersion,
    });
}

export async function submitAuthorityDecisionOnce(gate: PendingActionGate, input: {
  readonly api: ReferenceReviewApiClient;
  readonly authority: ReviewerDomainAuthorityDetail;
  readonly draft: AuthorityDecisionDraft;
  readonly confirmation?: AuthorityDecisionConfirmation | null;
  readonly refresh: () => Promise<void>;
  readonly sessionExpired: () => void | Promise<void>;
}): Promise<ReferenceSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    if (!isAuthorityDecisionConfirmed(input.authority, input.draft, input.confirmation)) {
      return { status: 'failed', message: '请在核对当前命令摘要后确认提交。' };
    }
    const command = buildAuthorityDecisionCommand(input.authority, input.draft);
    if (command === null) return { status: 'failed', message: '请填写完整且有效的权威决策。' };
    const result = await input.api.decideDomainAuthority(input.authority.authorityId, command);
    if (result.ok) {
      await input.refresh();
      return { status: 'saved', message: '域名权威已更新，详情已刷新。' };
    }
    if (result.state === 'sign_in_required' || result.state === 'forbidden') {
      await input.sessionExpired();
      return { status: 'forbidden', message: '当前账号没有有效的审核权限。' };
    }
    if (result.state === 'conflict' && result.code === 'reference_version_conflict') {
      await input.refresh();
      return { status: 'conflict', message: '域名权威已更新，请检查最新版本后重新提交。' };
    }
    return { status: 'failed', message: '域名权威决策暂时无法提交。请刷新后重试。' };
  } finally {
    gate.finish();
  }
}

function AuthorityConfirmation({ authority, draft }: {
  readonly authority: ReviewerDomainAuthorityDetail;
  readonly draft: AuthorityDecisionDraft;
}) {
  return (
    <section className="review-panel" aria-label="高影响命令确认">
      <h2>提交前确认</h2>
      <dl className="review-metadata">
        <Metadata label="权威 ID" value={authority.authorityId} />
        <Metadata label="域名" value={authority.domain} />
        <Metadata label="当前版本" value={String(authority.authorityVersion)} />
        <Metadata label="决策" value={draft.decision} />
        <Metadata label="原因" value={draft.reasonCode} />
        <Metadata label="证据 ID" value={draft.evidenceId === '' ? '未填写' : draft.evidenceId} />
      </dl>
    </section>
  );
}

export function SubmissionMessage({ state }: { readonly state: ReferenceSubmissionState }) {
  return state.message === undefined ? null : (
    <p
      className={`review-message${state.status === 'saved' ? '' : ' review-message-error'}`}
      role={state.status === 'saved' ? 'status' : 'alert'}
    >
      {state.message}
    </p>
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

const authorityDecisions = ['grant', 'revoke', 'regrant'] as const satisfies readonly DomainAuthorityDecision[];
const reasonCodes = [
  'evidence_verified', 'official_announcement', 'corroborated_source', 'ownership_unproven',
  'domain_mismatch', 'duplicate_reference', 'source_no_longer_official', 'security_flag_cleared',
  'withdrawn_by_reviewer', 'insufficient_context',
] as const satisfies readonly ReferenceReasonCode[];
