'use client';

import type {
  PublishTutorialVersionCommandV1,
  RetireTutorialCommandV1,
  TutorialReasonCode,
  TutorialReviewDetail,
} from '@airdrop/contracts';
import {
  publishTutorialVersionCommandV1Schema,
  retireTutorialCommandV1Schema,
} from '@airdrop/contracts';
import { useRef, useState, type FormEvent } from 'react';

import { createPendingActionGate, type PendingActionGate } from '../../lib/review-pending-action.js';
import type { ReviewSessionController } from '../../lib/review-session.js';
import type { TutorialReviewApiClient } from '../../lib/tutorial-review-api-client.js';
import { formatReviewDate } from '../review/failed-ai-run-list.js';
import { displayReviewValue } from '../review/safe-review-text.js';
import type { TutorialStepDraft, TutorialSubmissionState } from './candidate-detail.js';
import { SubmissionMessage } from './candidate-detail.js';
import { parseStepLinks } from './candidate-detail.js';

export type TutorialDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'not_found' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly tutorial: TutorialReviewDetail };

export interface PublishConfirmation {
  readonly affirmed: boolean;
  readonly steps: readonly TutorialStepDraft[];
  readonly tutorial: { readonly tutorialId: string; readonly expectedVersion: number };
}

export interface RetireConfirmation {
  readonly affirmed: boolean;
  readonly draft: RetireDraft;
  readonly tutorial: { readonly tutorialId: string; readonly expectedVersion: number };
}

export interface RetireDraft {
  readonly reasonCode: TutorialReasonCode;
  readonly note: string;
}

export function TutorialDetail({ tutorial }: { readonly tutorial: TutorialReviewDetail }) {
  return (
    <div className="review-detail">
      <section className="review-panel" aria-labelledby="tutorial-detail-heading">
        <div className="review-panel-heading">
          <div>
            <h1 id="tutorial-detail-heading">教程详情</h1>
            <p>needs_review 与 blocked 由安全联动产生，恢复只能发布新版本。</p>
          </div>
          <span className="review-badge">{`${tutorial.status} · v${tutorial.version}`}</span>
        </div>
        <dl className="review-metadata">
          <Metadata label="教程 ID" value={tutorial.tutorialId} />
          <Metadata label="项目 ID" value={tutorial.projectId} />
          <Metadata label="类型" value={tutorial.kind} />
          <Metadata label="标题" value={tutorial.title} />
          <Metadata label="摘要" value={tutorial.summary} />
          <Metadata label="最近核验" value={tutorial.lastVerifiedAt ?? '尚未核验'} />
          <Metadata label="更新时间" value={formatReviewDate(tutorial.updatedAt)} />
        </dl>
      </section>
      <section className="review-panel" aria-labelledby="tutorial-steps-heading">
        <h2 id="tutorial-steps-heading">当前版本步骤</h2>
        <ol className="review-history">
          {tutorial.steps.map((step) => (
            <li key={step.ordinal}>
              <strong>{`步骤 ${step.ordinal} · ${displayReviewValue(step.title)}`}</strong>
              <p>{displayReviewValue(step.body)}</p>
              {step.links.length === 0 ? (
                <span>无引用链接</span>
              ) : (
                <ul>
                  {step.links.map((link) => (
                    <li key={link.referenceId}>
                      {`${displayReviewValue(link.referenceLabel ?? '')} · ${link.renderable ? '可渲染' : '不可渲染'}`}
                      {link.lastVerifiedAt === null
                        ? ''
                        : <time dateTime={link.lastVerifiedAt}>{` · ${formatReviewDate(link.lastVerifiedAt)}`}</time>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>
      <section className="review-panel" aria-labelledby="tutorial-decisions-heading">
        <h2 id="tutorial-decisions-heading">决策历史</h2>
        <ol className="review-history">
          {tutorial.decisions.map((decision, index) => (
            <li key={`${decision.createdAt}-${index}`}>
              <strong>{`v${decision.aggregateVersion} · ${decision.decision}`}</strong>
              <span>{decision.reasonCode ?? '—'}</span>
              <Metadata label="备注" value={decision.note ?? '—'} />
              <time dateTime={decision.createdAt}>{formatReviewDate(decision.createdAt)}</time>
            </li>
          ))}
        </ol>
      </section>
      <section className="review-panel" aria-labelledby="tutorial-events-heading">
        <h2 id="tutorial-events-heading">状态事件时间线</h2>
        <ol className="review-history">
          {tutorial.statusEvents.length === 0
            ? <li>尚无状态事件。</li>
            : tutorial.statusEvents.map((event, index) => (
              <li key={`${event.createdAt}-${index}`}>
                <strong>{`${event.trigger}`}</strong>
                <span>{`${event.fromStatus} → ${event.toStatus}`}</span>
                <time dateTime={event.createdAt}>{formatReviewDate(event.createdAt)}</time>
              </li>
            ))}
        </ol>
      </section>
    </div>
  );
}

export async function loadTutorialDetail({ session, api, tutorialId, redirect }: {
  readonly session: ReviewSessionController;
  readonly api: TutorialReviewApiClient;
  readonly tutorialId: string;
  readonly redirect: (path: string) => void;
}): Promise<TutorialDetailState> {
  if (await session.getAccessToken() === null) {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  const result = await api.getTutorial(tutorialId);
  if (result.ok) return { status: 'ready', tutorial: result.data };
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

export function PublishVersionForm({ api, tutorial, onRefresh, onSessionExpired }: {
  readonly api: TutorialReviewApiClient;
  readonly tutorial: TutorialReviewDetail;
  readonly onRefresh: () => Promise<void>;
  readonly onSessionExpired: () => void | Promise<void>;
}) {
  const [steps, setSteps] = useState<TutorialStepDraft[]>(initialPublishDrafts(tutorial));
  const [confirmation, setConfirmation] = useState<PublishConfirmation | null>(null);
  const [state, setState] = useState<TutorialSubmissionState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const pending = state.status === 'submitting';
  const command = buildPublishCommand(tutorial, steps);
  const confirmed = isPublishConfirmed(tutorial, steps, confirmation);

  function updateStep(index: number, next: Partial<TutorialStepDraft>) {
    setSteps((value) => value.map((step, i) => (i === index ? { ...step, ...next } : step)));
    setConfirmation(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setState({ status: 'submitting' });
    const next = await submitPublishOnce(gate.current, {
      api, tutorial, steps, confirmation, refresh: onRefresh, sessionExpired: onSessionExpired,
    });
    setConfirmation(next.status === 'conflict' ? null : confirmation);
    setState(next);
  }

  return (
    <form className="review-form" onSubmit={(event) => { void submit(event); }}>
      <p className="review-state">发布即生成不可变新版本（当前 v{tutorial.version} → v{tutorial.version + 1}）；步骤可编辑，链接仅接受台账引用 ID。</p>
      {steps.map((step, index) => (
        <fieldset key={index} className="review-field" disabled={pending}>
          <legend>{`步骤 ${index + 1}`}</legend>
          <Text label="标题" value={step.title} disabled={pending} onChange={(title) => updateStep(index, { title })} />
          <Text label="正文" value={step.body} disabled={pending} onChange={(body) => updateStep(index, { body })} multiline />
          <Text label="引用 ID（每行一个）" value={step.links} disabled={pending} onChange={(links) => updateStep(index, { links })} multiline />
        </fieldset>
      ))}
      <PublishConfirmation tutorial={tutorial} steps={steps} />
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending || command === null}
          onChange={(event) => setConfirmation(event.currentTarget.checked
            ? {
              affirmed: true,
              steps,
              tutorial: { tutorialId: tutorial.tutorialId, expectedVersion: tutorial.version },
            }
            : null)}
        />
        {' 我已核对以上命令摘要，并确认发布新版本。'}
      </label>
      <SubmissionMessage state={state} />
      <button className="review-button" type="submit" disabled={pending || !confirmed || command === null}>
        {pending ? '正在提交…' : '发布新版本'}
      </button>
    </form>
  );
}

export function RetireForm({ api, tutorial, onRefresh, onSessionExpired }: {
  readonly api: TutorialReviewApiClient;
  readonly tutorial: TutorialReviewDetail;
  readonly onRefresh: () => Promise<void>;
  readonly onSessionExpired: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<RetireDraft>({ reasonCode: 'security_blocked', note: '' });
  const [confirmation, setConfirmation] = useState<RetireConfirmation | null>(null);
  const [state, setState] = useState<TutorialSubmissionState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const pending = state.status === 'submitting';
  const command = buildRetireCommand(tutorial, draft);
  const confirmed = isRetireConfirmed(tutorial, draft, confirmation);

  function update(next: Partial<RetireDraft>) {
    setDraft((value) => ({ ...value, ...next }));
    setConfirmation(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setState({ status: 'submitting' });
    const next = await submitRetireOnce(gate.current, {
      api, tutorial, draft, confirmation, refresh: onRefresh, sessionExpired: onSessionExpired,
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
          {retireReasonCodes.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      </Field>
      <Text label="内部备注（可选）" value={draft.note} disabled={pending} onChange={(note) => update({ note })} multiline />
      <RetireConfirmation tutorial={tutorial} draft={draft} />
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending || command === null}
          onChange={(event) => setConfirmation(event.currentTarget.checked
            ? {
              affirmed: true,
              draft,
              tutorial: { tutorialId: tutorial.tutorialId, expectedVersion: tutorial.version },
            }
            : null)}
        />
        {' 我已核对以上命令摘要，并确认下线。'}
      </label>
      <SubmissionMessage state={state} />
      <button className="review-button" type="submit" disabled={pending || !confirmed || command === null}>
        {pending ? '正在提交…' : '下线教程'}
      </button>
    </form>
  );
}

export function initialPublishDrafts(tutorial: TutorialReviewDetail): TutorialStepDraft[] {
  return tutorial.steps.map((step) => ({
    title: step.title,
    body: step.body,
    links: step.links.map((link) => link.referenceId).join('\n'),
  }));
}

export function buildPublishCommand(
  tutorial: TutorialReviewDetail,
  steps: readonly TutorialStepDraft[],
): PublishTutorialVersionCommandV1 | null {
  const command = {
    version: 1 as const,
    tutorialId: tutorial.tutorialId,
    expectedVersion: tutorial.version,
    steps: steps.map((step) => ({
      title: step.title.trim(),
      body: step.body.trim(),
      links: parseStepLinks(step.links),
    })),
  };
  const parsed = publishTutorialVersionCommandV1Schema.safeParse(command);
  return parsed.success ? parsed.data : null;
}

export function buildRetireCommand(
  tutorial: TutorialReviewDetail,
  draft: RetireDraft,
): RetireTutorialCommandV1 | null {
  const command = {
    version: 1 as const,
    tutorialId: tutorial.tutorialId,
    expectedVersion: tutorial.version,
    reasonCode: draft.reasonCode,
    note: nullIfEmpty(draft.note),
  };
  const parsed = retireTutorialCommandV1Schema.safeParse(command);
  return parsed.success ? parsed.data : null;
}

export function isPublishConfirmed(
  tutorial: TutorialReviewDetail,
  steps: readonly TutorialStepDraft[],
  confirmation: PublishConfirmation | null | undefined,
): boolean {
  if (confirmation === null || confirmation === undefined) return false;
  return confirmation.affirmed
    && same(confirmation.steps, steps)
    && same(confirmation.tutorial, {
      tutorialId: tutorial.tutorialId,
      expectedVersion: tutorial.version,
    });
}

export function isRetireConfirmed(
  tutorial: TutorialReviewDetail,
  draft: RetireDraft,
  confirmation: RetireConfirmation | null | undefined,
): boolean {
  if (confirmation === null || confirmation === undefined) return false;
  return confirmation.affirmed
    && same(confirmation.draft, draft)
    && same(confirmation.tutorial, {
      tutorialId: tutorial.tutorialId,
      expectedVersion: tutorial.version,
    });
}

export async function submitPublishOnce(gate: PendingActionGate, input: {
  readonly api: TutorialReviewApiClient;
  readonly tutorial: TutorialReviewDetail;
  readonly steps: readonly TutorialStepDraft[];
  readonly confirmation?: PublishConfirmation | null;
  readonly refresh: () => Promise<void>;
  readonly sessionExpired: () => void | Promise<void>;
}): Promise<TutorialSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    if (!isPublishConfirmed(input.tutorial, input.steps, input.confirmation)) {
      return { status: 'failed', message: '请在核对当前命令摘要后确认提交。' };
    }
    const command = buildPublishCommand(input.tutorial, input.steps);
    if (command === null) return { status: 'failed', message: '步骤内容无效：标题/正文长度或引用 ID 不满足要求。' };
    const result = await input.api.publishVersion(input.tutorial.tutorialId, command);
    if (result.ok) {
      await input.refresh();
      return { status: 'saved', message: '新版本已发布，详情已刷新。' };
    }
    if (result.state === 'sign_in_required' || result.state === 'forbidden') {
      await input.sessionExpired();
      return { status: 'forbidden', message: '当前账号没有有效的审核权限。' };
    }
    if (result.state === 'conflict') {
      await input.refresh();
      return { status: 'conflict', message: '教程版本已更新，请检查最新版本后重新提交。' };
    }
    return { status: 'failed', message: '发布暂时无法提交。请刷新后重试。' };
  } finally {
    gate.finish();
  }
}

export async function submitRetireOnce(gate: PendingActionGate, input: {
  readonly api: TutorialReviewApiClient;
  readonly tutorial: TutorialReviewDetail;
  readonly draft: RetireDraft;
  readonly confirmation?: RetireConfirmation | null;
  readonly refresh: () => Promise<void>;
  readonly sessionExpired: () => void | Promise<void>;
}): Promise<TutorialSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    if (!isRetireConfirmed(input.tutorial, input.draft, input.confirmation)) {
      return { status: 'failed', message: '请在核对当前命令摘要后确认提交。' };
    }
    const command = buildRetireCommand(input.tutorial, input.draft);
    if (command === null) return { status: 'failed', message: '下线信息无效，请检查原因与备注。' };
    const result = await input.api.retire(input.tutorial.tutorialId, command);
    if (result.ok) {
      await input.refresh();
      return { status: 'saved', message: '教程已下线，状态已刷新。' };
    }
    if (result.state === 'sign_in_required' || result.state === 'forbidden') {
      await input.sessionExpired();
      return { status: 'forbidden', message: '当前账号没有有效的审核权限。' };
    }
    if (result.state === 'conflict') {
      await input.refresh();
      return { status: 'conflict', message: '教程版本已更新，请检查最新版本后重新提交。' };
    }
    return { status: 'failed', message: '下线暂时无法提交。请刷新后重试。' };
  } finally {
    gate.finish();
  }
}

function PublishConfirmation({ tutorial, steps }: {
  readonly tutorial: TutorialReviewDetail;
  readonly steps: readonly TutorialStepDraft[];
}) {
  return (
    <section className="review-panel" aria-label="高影响命令确认">
      <h2>提交前确认</h2>
      <dl className="review-metadata">
        <Metadata label="教程 ID" value={tutorial.tutorialId} />
        <Metadata label="当前版本" value={String(tutorial.version)} />
        <Metadata label="步骤数" value={String(steps.length)} />
        <Metadata label="动作" value="publish_version" />
      </dl>
    </section>
  );
}

function RetireConfirmation({ tutorial, draft }: {
  readonly tutorial: TutorialReviewDetail;
  readonly draft: RetireDraft;
}) {
  return (
    <section className="review-panel" aria-label="高影响命令确认">
      <h2>提交前确认</h2>
      <dl className="review-metadata">
        <Metadata label="教程 ID" value={tutorial.tutorialId} />
        <Metadata label="当前版本" value={String(tutorial.version)} />
        <Metadata label="原因" value={draft.reasonCode} />
        <Metadata label="动作" value="retire" />
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

const retireReasonCodes = [
  'content_stale', 'reference_unrenderable', 'security_blocked', 'source_blocked',
  'duplicate', 'out_of_scope', 'other',
] as const satisfies readonly TutorialReasonCode[];
