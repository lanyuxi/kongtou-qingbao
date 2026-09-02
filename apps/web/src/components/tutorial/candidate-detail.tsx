'use client';

import type {
  RejectTutorialCandidateCommandV1,
  TutorialCandidateReviewDetail,
  TutorialReasonCode,
} from '@airdrop/contracts';
import {
  acceptTutorialCandidateCommandV1Schema,
  rejectTutorialCandidateCommandV1Schema,
} from '@airdrop/contracts';
import { useRef, useState, type FormEvent } from 'react';

import { createPendingActionGate, type PendingActionGate } from '../../lib/review-pending-action.js';
import type { ReviewSessionController } from '../../lib/review-session.js';
import type { TutorialReviewApiClient } from '../../lib/tutorial-review-api-client.js';
import { formatReviewDate } from '../review/failed-ai-run-list.js';
import { displayReviewValue } from '../review/safe-review-text.js';

export type CandidateDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'not_found' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly candidate: TutorialCandidateReviewDetail };

export type TutorialSubmissionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'saved'; readonly message: string }
  | { readonly status: 'conflict'; readonly message: string }
  | { readonly status: 'forbidden'; readonly message: string }
  | { readonly status: 'failed'; readonly message: string };

export interface TutorialStepDraft {
  readonly title: string;
  readonly body: string;
  readonly links: string;
}

// Candidate rows are immutable in v1: accept and reject both target the
// candidate at the version it was created with, so the expected version is a
// constant and lives next to the confirmation binding.
export const candidateExpectedVersion = 1;

export function CandidateDetail({ candidate }: { readonly candidate: TutorialCandidateReviewDetail }) {
  return (
    <div className="review-detail">
      <section className="review-panel" aria-labelledby="candidate-detail-heading">
        <div className="review-panel-heading">
          <div>
            <h1 id="candidate-detail-heading">教程候选</h1>
            <p>候选内容是惰性数据：只有编辑后的步骤会进入发布命令。</p>
          </div>
          <span className="review-badge">{candidate.status}</span>
        </div>
        <dl className="review-metadata">
          <Metadata label="候选 ID" value={candidate.candidateId} />
          <Metadata label="项目 ID" value={candidate.projectId} />
          <Metadata label="类型" value={candidate.kind} />
          <Metadata label="标题" value={candidate.title} />
          <Metadata label="摘要" value={candidate.summary} />
          <Metadata label="置信度" value={String(candidate.confidence)} />
          <Metadata label="信号 ID" value={candidate.sourceSignalIds.join('、')} />
          <Metadata label="创建时间" value={formatReviewDate(candidate.createdAt)} />
        </dl>
      </section>
      <section className="review-panel" aria-labelledby="candidate-payload-heading">
        <h2 id="candidate-payload-heading">原始候选载荷（惰性展示）</h2>
        <pre className="review-payload">{displayReviewValue(JSON.stringify(candidate.payload))}</pre>
      </section>
    </div>
  );
}

export async function loadCandidateDetail({ session, api, candidateId, redirect }: {
  readonly session: ReviewSessionController;
  readonly api: TutorialReviewApiClient;
  readonly candidateId: string;
  readonly redirect: (path: string) => void;
}): Promise<CandidateDetailState> {
  if (await session.getAccessToken() === null) {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  const result = await api.getCandidate(candidateId);
  if (result.ok) return { status: 'ready', candidate: result.data };
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

export function AcceptCandidateForm({ api, candidate, onRefresh, onSessionExpired }: {
  readonly api: TutorialReviewApiClient;
  readonly candidate: TutorialCandidateReviewDetail;
  readonly onRefresh: () => Promise<void>;
  readonly onSessionExpired: () => void | Promise<void>;
}) {
  const [steps, setSteps] = useState<TutorialStepDraft[]>(initialStepDrafts(candidate));
  const [confirmation, setConfirmation] = useState<AcceptConfirmation | null>(null);
  const [state, setState] = useState<TutorialSubmissionState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const pending = state.status === 'submitting';
  const command = buildAcceptCommand(candidate, steps);
  const confirmed = isAcceptConfirmed(candidate, steps, confirmation);

  function updateStep(index: number, next: Partial<TutorialStepDraft>) {
    setSteps((value) => value.map((step, i) => (i === index ? { ...step, ...next } : step)));
    setConfirmation(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setState({ status: 'submitting' });
    const next = await submitAcceptOnce(gate.current, {
      api, candidate, steps, confirmation, refresh: onRefresh, sessionExpired: onSessionExpired,
    });
    setConfirmation(next.status === 'conflict' ? null : confirmation);
    setState(next);
  }

  return (
    <form className="review-form" onSubmit={(event) => { void submit(event); }}>
      <p className="review-state">批准会按以下步骤发布教程 v1（可编辑；链接仅接受台账引用 ID，逐行一个）。</p>
      {steps.map((step, index) => (
        <fieldset key={index} className="review-field" disabled={pending}>
          <legend>{`步骤 ${index + 1}`}</legend>
          <Text label="标题" value={step.title} disabled={pending} onChange={(title) => updateStep(index, { title })} />
          <Text label="正文" value={step.body} disabled={pending} onChange={(body) => updateStep(index, { body })} multiline />
          <Text label="引用 ID（每行一个）" value={step.links} disabled={pending} onChange={(links) => updateStep(index, { links })} multiline />
        </fieldset>
      ))}
      <AcceptConfirmation candidate={candidate} steps={steps} />
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending || command === null}
          onChange={(event) => setConfirmation(event.currentTarget.checked
            ? {
              affirmed: true,
              steps,
              candidate: { candidateId: candidate.candidateId, expectedCandidateVersion: candidateExpectedVersion },
            }
            : null)}
        />
        {' 我已核对以上命令摘要，并确认按编辑后的步骤批准。'}
      </label>
      <SubmissionMessage state={state} />
      <button className="review-button" type="submit" disabled={pending || !confirmed || command === null}>
        {pending ? '正在提交…' : '批准并发布教程'}
      </button>
    </form>
  );
}

export function RejectCandidateForm({ api, candidate, onRefresh, onSessionExpired }: {
  readonly api: TutorialReviewApiClient;
  readonly candidate: TutorialCandidateReviewDetail;
  readonly onRefresh: () => Promise<void>;
  readonly onSessionExpired: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<RejectDraft>({ reasonCode: 'duplicate', note: '' });
  const [confirmation, setConfirmation] = useState<RejectConfirmation | null>(null);
  const [state, setState] = useState<TutorialSubmissionState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const pending = state.status === 'submitting';
  const command = buildRejectCommand(candidate, draft);
  const confirmed = isRejectConfirmed(candidate, draft, confirmation);

  function update(next: Partial<RejectDraft>) {
    setDraft((value) => ({ ...value, ...next }));
    setConfirmation(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setState({ status: 'submitting' });
    const next = await submitRejectOnce(gate.current, {
      api, candidate, draft, confirmation, refresh: onRefresh, sessionExpired: onSessionExpired,
    });
    setConfirmation(next.status === 'conflict' ? null : confirmation);
    setState(next);
  }

  return (
    <form className="review-form" onSubmit={(event) => { void submit(event); }}>
      <Field label="原因">
        <select
          value={draft.reasonCode}
          disabled={pending}
          onChange={(event) => update({ reasonCode: event.currentTarget.value as TutorialReasonCode })}
        >
          {reasonCodes.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      </Field>
      <Text label="内部备注（可选）" value={draft.note} disabled={pending} onChange={(note) => update({ note })} multiline />
      <RejectConfirmation candidate={candidate} draft={draft} />
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending || command === null}
          onChange={(event) => setConfirmation(event.currentTarget.checked
            ? {
              affirmed: true,
              draft,
              candidate: { candidateId: candidate.candidateId, expectedCandidateVersion: candidateExpectedVersion },
            }
            : null)}
        />
        {' 我已核对以上命令摘要，并确认拒绝。'}
      </label>
      <SubmissionMessage state={state} />
      <button className="review-button" type="submit" disabled={pending || !confirmed || command === null}>
        {pending ? '正在提交…' : '拒绝候选'}
      </button>
    </form>
  );
}

export interface RejectDraft {
  readonly reasonCode: TutorialReasonCode;
  readonly note: string;
}

export interface AcceptConfirmation {
  readonly affirmed: boolean;
  readonly steps: readonly TutorialStepDraft[];
  readonly candidate: { readonly candidateId: string; readonly expectedCandidateVersion: number };
}

export interface RejectConfirmation {
  readonly affirmed: boolean;
  readonly draft: RejectDraft;
  readonly candidate: { readonly candidateId: string; readonly expectedCandidateVersion: number };
}

export function initialStepDrafts(candidate: TutorialCandidateReviewDetail): TutorialStepDraft[] {
  const payload = candidate.payload;
  const steps = typeof payload === 'object' && payload !== null && Array.isArray((payload as { steps?: unknown }).steps)
    ? (payload as { steps: unknown[] }).steps
    : [];
  const drafts: TutorialStepDraft[] = [];
  for (const step of steps) {
    if (typeof step !== 'object' || step === null) continue;
    const record = step as { title?: unknown; body?: unknown; links?: unknown };
    const links = Array.isArray(record.links)
      ? record.links
        .map((link) => (typeof link === 'object' && link !== null && typeof (link as { referenceId?: unknown }).referenceId === 'string'
          ? (link as { referenceId: string }).referenceId
          : ''))
        .filter((value) => value !== '')
        .join('\n')
      : '';
    drafts.push({
      title: typeof record.title === 'string' ? record.title : '',
      body: typeof record.body === 'string' ? record.body : '',
      links,
    });
  }
  return drafts.length >= 2 ? drafts : [
    { title: '', body: '', links: '' },
    { title: '', body: '', links: '' },
  ];
}

export function parseStepLinks(links: string): readonly { referenceId: string }[] {
  return links
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((referenceId) => ({ referenceId }));
}

export function buildAcceptCommand(
  candidate: TutorialCandidateReviewDetail,
  steps: readonly TutorialStepDraft[],
): import('@airdrop/contracts').AcceptTutorialCandidateCommandV1 | null {
  const command = {
    version: 1 as const,
    candidateId: candidate.candidateId,
    expectedCandidateVersion: candidateExpectedVersion,
    steps: steps.map((step) => ({
      title: step.title.trim(),
      body: step.body.trim(),
      links: parseStepLinks(step.links),
    })),
  };
  const parsed = acceptTutorialCandidateCommandV1Schema.safeParse(command);
  return parsed.success ? parsed.data : null;
}

export function buildRejectCommand(
  candidate: TutorialCandidateReviewDetail,
  draft: RejectDraft,
): RejectTutorialCandidateCommandV1 | null {
  const command = {
    version: 1 as const,
    candidateId: candidate.candidateId,
    expectedCandidateVersion: candidateExpectedVersion,
    reasonCode: draft.reasonCode,
    note: nullIfEmpty(draft.note),
  };
  const parsed = rejectTutorialCandidateCommandV1Schema.safeParse(command);
  return parsed.success ? parsed.data : null;
}

export function isAcceptConfirmed(
  candidate: TutorialCandidateReviewDetail,
  steps: readonly TutorialStepDraft[],
  confirmation: AcceptConfirmation | null | undefined,
): boolean {
  if (confirmation === null || confirmation === undefined) return false;
  return confirmation.affirmed
    && same(confirmation.steps, steps)
    && same(confirmation.candidate, {
      candidateId: candidate.candidateId,
      expectedCandidateVersion: candidateExpectedVersion,
    });
}

export function isRejectConfirmed(
  candidate: TutorialCandidateReviewDetail,
  draft: RejectDraft,
  confirmation: RejectConfirmation | null | undefined,
): boolean {
  if (confirmation === null || confirmation === undefined) return false;
  return confirmation.affirmed
    && same(confirmation.draft, draft)
    && same(confirmation.candidate, {
      candidateId: candidate.candidateId,
      expectedCandidateVersion: candidateExpectedVersion,
    });
}

export async function submitAcceptOnce(gate: PendingActionGate, input: {
  readonly api: TutorialReviewApiClient;
  readonly candidate: TutorialCandidateReviewDetail;
  readonly steps: readonly TutorialStepDraft[];
  readonly confirmation?: AcceptConfirmation | null;
  readonly refresh: () => Promise<void>;
  readonly sessionExpired: () => void | Promise<void>;
}): Promise<TutorialSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    if (!isAcceptConfirmed(input.candidate, input.steps, input.confirmation)) {
      return { status: 'failed', message: '请在核对当前命令摘要后确认提交。' };
    }
    const command = buildAcceptCommand(input.candidate, input.steps);
    if (command === null) return { status: 'failed', message: '步骤内容无效：标题/正文长度或引用 ID 不满足要求。' };
    const result = await input.api.acceptCandidate(command);
    if (result.ok) {
      await input.refresh();
      return { status: 'saved', message: '候选已批准并发布为教程。' };
    }
    if (result.state === 'sign_in_required' || result.state === 'forbidden') {
      await input.sessionExpired();
      return { status: 'forbidden', message: '当前账号没有有效的审核权限。' };
    }
    if (result.state === 'conflict') {
      await input.refresh();
      return { status: 'conflict', message: '候选状态已更新，请检查最新状态后重新提交。' };
    }
    return { status: 'failed', message: '批准暂时无法提交。请刷新后重试。' };
  } finally {
    gate.finish();
  }
}

export async function submitRejectOnce(gate: PendingActionGate, input: {
  readonly api: TutorialReviewApiClient;
  readonly candidate: TutorialCandidateReviewDetail;
  readonly draft: RejectDraft;
  readonly confirmation?: RejectConfirmation | null;
  readonly refresh: () => Promise<void>;
  readonly sessionExpired: () => void | Promise<void>;
}): Promise<TutorialSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    if (!isRejectConfirmed(input.candidate, input.draft, input.confirmation)) {
      return { status: 'failed', message: '请在核对当前命令摘要后确认提交。' };
    }
    const command = buildRejectCommand(input.candidate, input.draft);
    if (command === null) return { status: 'failed', message: '拒绝信息无效，请检查原因与备注。' };
    const result = await input.api.rejectCandidate(command);
    if (result.ok) {
      await input.refresh();
      return { status: 'saved', message: '候选已拒绝，状态已刷新。' };
    }
    if (result.state === 'sign_in_required' || result.state === 'forbidden') {
      await input.sessionExpired();
      return { status: 'forbidden', message: '当前账号没有有效的审核权限。' };
    }
    if (result.state === 'conflict') {
      await input.refresh();
      return { status: 'conflict', message: '候选状态已更新，请检查最新状态后重新提交。' };
    }
    return { status: 'failed', message: '拒绝暂时无法提交。请刷新后重试。' };
  } finally {
    gate.finish();
  }
}

function AcceptConfirmation({ candidate, steps }: {
  readonly candidate: TutorialCandidateReviewDetail;
  readonly steps: readonly TutorialStepDraft[];
}) {
  return (
    <section className="review-panel" aria-label="高影响命令确认">
      <h2>提交前确认</h2>
      <dl className="review-metadata">
        <Metadata label="候选 ID" value={candidate.candidateId} />
        <Metadata label="期望候选版本" value={String(candidateExpectedVersion)} />
        <Metadata label="步骤数" value={String(steps.length)} />
        <Metadata label="动作" value="accept_candidate" />
      </dl>
    </section>
  );
}

function RejectConfirmation({ candidate, draft }: {
  readonly candidate: TutorialCandidateReviewDetail;
  readonly draft: RejectDraft;
}) {
  return (
    <section className="review-panel" aria-label="高影响命令确认">
      <h2>提交前确认</h2>
      <dl className="review-metadata">
        <Metadata label="候选 ID" value={candidate.candidateId} />
        <Metadata label="期望候选版本" value={String(candidateExpectedVersion)} />
        <Metadata label="原因" value={draft.reasonCode} />
        <Metadata label="动作" value="reject_candidate" />
      </dl>
    </section>
  );
}

export function SubmissionMessage({ state }: { readonly state: TutorialSubmissionState }) {
  if (state.status === 'idle' || state.status === 'submitting') return null;
  const tone = state.status === 'saved'
    ? 'review-message-ok'
    : state.status === 'conflict'
      ? 'review-message-error'
      : 'review-message-error';
  return <p className={`review-state ${tone}`} role={state.status === 'saved' ? 'status' : 'alert'}>{state.message}</p>;
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

const reasonCodes = [
  'content_verified', 'content_stale', 'reference_unrenderable', 'security_blocked',
  'source_blocked', 'signal_retracted', 'duplicate', 'out_of_scope', 'other',
] as const satisfies readonly TutorialReasonCode[];
