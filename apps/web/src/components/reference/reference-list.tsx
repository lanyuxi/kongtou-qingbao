'use client';

import type {
  ReferenceKind,
  ReferenceReviewListQuery,
  RegisterReferenceCommandV1,
  ReviewerReferenceListItem,
} from '@airdrop/contracts';
import { registerReferenceCommandV1Schema } from '@airdrop/contracts';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';

import { createPendingActionGate, type PendingActionGate } from '../../lib/review-pending-action.js';
import type { ReferenceReviewApiClient } from '../../lib/reference-review-api-client.js';
import type { ReviewSessionController } from '../../lib/review-session.js';
import { SubmissionMessage, type ReferenceSubmissionState } from './authority-detail.js';
import { uuidPattern } from './authority-list.js';
import { formatReviewDate } from '../review/failed-ai-run-list.js';
import { displayReviewValue } from '../review/safe-review-text.js';

export type ReferenceListState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'failed' }
  | {
    readonly status: 'ready';
    readonly items: readonly ReviewerReferenceListItem[];
    readonly nextCursor: string | null;
  };

export interface ReferenceRegisterDraft {
  readonly projectId: string;
  readonly kind: ReferenceKind;
  readonly url: string;
  readonly label: string;
  readonly evidenceId: string;
  readonly note: string;
}

export function referenceDetailHref(referenceId: string): string | null {
  return uuidPattern.test(referenceId) ? `/review/references/${referenceId}` : null;
}

export function ReferenceList({ state, query, onQueryChange, onNext }: {
  readonly state: ReferenceListState;
  readonly query: ReferenceReviewListQuery;
  readonly onQueryChange?: (query: ReferenceReviewListQuery) => void;
  readonly onNext?: (cursor: string) => void;
}) {
  return (
    <section className="review-panel" aria-labelledby="reference-list-heading">
      <div className="review-panel-heading">
        <div>
          <h1 id="reference-list-heading">引用条目</h1>
          <p>只有 verified 状态且无未释放安全标记的引用才会公开渲染。</p>
        </div>
        <div className="review-filters">
          <label htmlFor="reference-state">状态</label>
          <select
            id="reference-state"
            value={query.state}
            onChange={(event) => onQueryChange?.(
              changeReferenceFilters(query, { state: event.currentTarget.value as ReferenceReviewListQuery['state'] }),
            )}
          >
            <option value="all">全部状态</option>
            <option value="candidate">candidate</option>
            <option value="verified">verified</option>
            <option value="flagged">flagged</option>
            <option value="withdrawn">withdrawn</option>
          </select>
        </div>
      </div>
      {body(state)}
      {state.status === 'ready' && state.nextCursor !== null ? (
        <div className="review-pagination">
          <button
            className="review-button review-button-secondary"
            type="button"
            onClick={() => onNext?.(state.nextCursor ?? '')}
          >
            下一页
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function ReferenceRegisterForm({ api, onRegistered, onSessionExpired }: {
  readonly api: ReferenceReviewApiClient;
  readonly onRegistered: () => Promise<void>;
  readonly onSessionExpired: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<ReferenceRegisterDraft>({
    projectId: '', kind: 'official_site', url: '', label: '', evidenceId: '', note: '',
  });
  const [state, setState] = useState<ReferenceSubmissionState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const pending = state.status === 'submitting';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setState({ status: 'submitting' });
    setState(await submitReferenceRegisterOnce(gate.current, {
      api, draft, registered: onRegistered, sessionExpired: onSessionExpired,
    }));
  }

  return (
    <form className="review-form" onSubmit={(event) => { void submit(event); }}>
      <Text label="项目 ID" value={draft.projectId} disabled={pending} onChange={(projectId) => setDraft((value) => ({ ...value, projectId }))} />
      <Field label="类型">
        <select value={draft.kind} disabled={pending} onChange={(event) => setDraft((value) => ({ ...value, kind: event.currentTarget.value as ReferenceKind }))}>
          {kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select>
      </Field>
      <Text label="URL" value={draft.url} disabled={pending} onChange={(url) => setDraft((value) => ({ ...value, url }))} />
      <Text label="标签" value={draft.label} disabled={pending} onChange={(label) => setDraft((value) => ({ ...value, label }))} />
      <Text label="证据 ID" value={draft.evidenceId} disabled={pending} onChange={(evidenceId) => setDraft((value) => ({ ...value, evidenceId }))} />
      <Text label="内部备注（可选）" value={draft.note} disabled={pending} onChange={(note) => setDraft((value) => ({ ...value, note }))} multiline />
      <SubmissionMessage state={state} />
      <button className="review-button" type="submit" disabled={pending}>
        {pending ? '正在提交…' : '登记为候选引用'}
      </button>
    </form>
  );
}

export async function loadReferenceList({ session, api, query, redirect }: {
  readonly session: ReviewSessionController;
  readonly api: ReferenceReviewApiClient;
  readonly query: ReferenceReviewListQuery;
  readonly redirect: (path: string) => void;
}): Promise<ReferenceListState> {
  if (await session.getAccessToken() === null) {
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  const result = await api.listReferences(query);
  if (result.ok) return { status: 'ready', items: result.data.items, nextCursor: result.nextCursor };
  if (result.state === 'sign_in_required') {
    await session.signOut();
    redirect('/review/sign-in');
    return { status: 'loading' };
  }
  if (result.state === 'forbidden') {
    await session.signOut();
    return { status: 'forbidden' };
  }
  return { status: 'failed' };
}

export function changeReferenceFilters(
  query: ReferenceReviewListQuery,
  filters: Partial<Pick<ReferenceReviewListQuery, 'projectId' | 'state'>>,
): ReferenceReviewListQuery {
  return { ...query, ...filters, cursor: null };
}

export function applyReferenceCursor(
  query: ReferenceReviewListQuery,
  cursor: string,
): ReferenceReviewListQuery {
  return { ...query, cursor };
}

export function buildReferenceRegisterCommand(
  draft: ReferenceRegisterDraft,
): RegisterReferenceCommandV1 | null {
  const command = {
    version: 1 as const,
    projectId: draft.projectId.trim(),
    kind: draft.kind,
    url: draft.url.trim(),
    label: draft.label.trim(),
    evidenceId: draft.evidenceId.trim(),
    note: nullIfEmpty(draft.note),
  };
  const parsed = registerReferenceCommandV1Schema.safeParse(command);
  return parsed.success ? parsed.data : null;
}

export async function submitReferenceRegisterOnce(gate: PendingActionGate, input: {
  readonly api: ReferenceReviewApiClient;
  readonly draft: ReferenceRegisterDraft;
  readonly registered: () => Promise<void>;
  readonly sessionExpired: () => void | Promise<void>;
}): Promise<ReferenceSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    const command = buildReferenceRegisterCommand(input.draft);
    if (command === null) return { status: 'failed', message: '请填写完整且有效的引用登记信息。' };
    const result = await input.api.registerReference(command);
    if (result.ok) {
      await input.registered();
      return { status: 'saved', message: '引用已登记为候选，等待核验。' };
    }
    if (result.state === 'sign_in_required' || result.state === 'forbidden') {
      await input.sessionExpired();
      return { status: 'forbidden', message: '当前账号没有有效的审核权限。' };
    }
    return { status: 'failed', message: '引用登记暂时无法提交。请刷新后重试。' };
  } finally {
    gate.finish();
  }
}

function body(state: ReferenceListState) {
  if (state.status === 'loading') return <p className="review-state">正在确认审核会话…</p>;
  if (state.status === 'forbidden') return <p className="review-state review-message-error" role="alert">当前账号没有有效的审核权限。</p>;
  if (state.status === 'failed') return <p className="review-state review-message-error" role="alert">引用条目暂时无法加载。请稍后重试。</p>;
  if (state.items.length === 0) return <p className="review-state">没有匹配的引用条目。</p>;
  return (
    <div className="review-table-wrap">
      <table className="review-table">
        <thead>
          <tr><th>状态</th><th>类型</th><th>标签</th><th>URL</th><th>更新时间</th></tr>
        </thead>
        <tbody>
          {state.items.map((item) => {
            const href = referenceDetailHref(item.referenceId);
            return (
              <tr key={item.referenceId}>
                <td>
                  {href === null ? item.state : <Link className="review-link" href={href}>{item.state}</Link>}
                </td>
                <td>{item.kind}</td>
                <td>{displayReviewValue(item.label)}</td>
                <td>{displayReviewValue(item.url)}</td>
                <td><time dateTime={item.updatedAt}>{formatReviewDate(item.updatedAt)}</time></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
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

const kinds = [
  'official_site', 'official_docs', 'claim_portal', 'app_entry',
  'official_social', 'code_repository', 'announcement', 'other',
] as const satisfies readonly ReferenceKind[];
