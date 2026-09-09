'use client';

import type { ExecutionErrorCode, WatchlistProjectRow, WatchlistRow } from '@airdrop/contracts';
import { useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';

import type { ExecutionApiClient } from '../../lib/execution-api-client.js';
import {
  createPendingActionGate,
  type PendingActionGate,
} from '../../lib/review-pending-action.js';
import { executionSubmissionFailure, type ExecutionSubmissionState } from './execution-submission.js';

export type WatchlistManagerState =
  | { readonly status: 'loading' }
  | { readonly status: 'sign_in_required' }
  | { readonly status: 'failed'; readonly code: 'execution_query_failed' }
  | { readonly status: 'ready'; readonly watchlists: readonly WatchlistRow[] };

export type WatchlistSubmissionState = ExecutionSubmissionState;

export interface WatchlistDraft {
  readonly name: string | null;
}

// A draft is validated against a strict shape before it is turned into a
// command; an unexpected field is rejected outright instead of silently
// dropped, so a hostile caller stays visible.
const watchlistDraftSchema = z.strictObject({ name: z.string().nullable() });

/**
 * The default list is provisioned by a database trigger, so a fresh account
 * still sees one row here. The UI treats "no default list" as a broken state,
 * not as a reason to create one implicitly.
 */
export function defaultWatchlistOf(
  watchlists: readonly WatchlistRow[],
): WatchlistRow | null {
  return watchlists.find((watchlist) => watchlist.isDefault) ?? null;
}

export function buildWatchlistCreateInput(draft: WatchlistDraft): {
  readonly name: string;
} {
  return { name: (draft.name ?? '').trim() };
}

export function buildWatchlistRenameInput(watchlist: WatchlistRow, draft: WatchlistDraft): {
  readonly watchlistId: string;
  readonly expectedVersion: number;
  readonly name: string;
} {
  return {
    watchlistId: watchlist.watchlistId,
    expectedVersion: watchlist.version,
    name: (draft.name ?? '').trim(),
  };
}

export function buildWatchlistRemoveInput(watchlist: WatchlistRow): {
  readonly watchlistId: string;
  readonly expectedVersion: number;
} {
  return { watchlistId: watchlist.watchlistId, expectedVersion: watchlist.version };
}

export function buildWatchlistAddProjectInput(watchlist: WatchlistRow, projectId: string): {
  readonly watchlistId: string;
  readonly expectedVersion: number;
  readonly projectId: string;
} {
  return {
    watchlistId: watchlist.watchlistId,
    expectedVersion: watchlist.version,
    projectId,
  };
}

export function buildWatchlistRemoveProjectInput(watchlist: WatchlistRow, projectId: string): {
  readonly watchlistId: string;
  readonly expectedVersion: number;
  readonly projectId: string;
} {
  return {
    watchlistId: watchlist.watchlistId,
    expectedVersion: watchlist.version,
    projectId,
  };
}

// The default list anchors the domain: participation and quick-add flows assume
// it exists, so it has no delete affordance anywhere in this UI.
export function canRemoveWatchlist(watchlist: WatchlistRow): boolean {
  return !watchlist.isDefault;
}

export function watchlistSubmissionFailure(code: ExecutionErrorCode): WatchlistSubmissionState {
  return executionSubmissionFailure(code);
}

export async function submitWatchlistCreate(input: {
  readonly api: ExecutionApiClient;
  readonly draft: WatchlistDraft;
  readonly onReload: () => Promise<void>;
}): Promise<WatchlistSubmissionState> {
  if (!watchlistDraftSchema.safeParse(input.draft).success) {
    return { status: 'failed', code: 'execution_command_invalid' };
  }
  const result = await input.api.createWatchlist(buildWatchlistCreateInput(input.draft));
  if (result.ok) {
    await input.onReload();
    return { status: 'saved' };
  }
  return watchlistSubmissionFailure(result.code);
}

export async function submitWatchlistCreateOnce(
  gate: PendingActionGate,
  input: Parameters<typeof submitWatchlistCreate>[0],
): Promise<WatchlistSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    return await submitWatchlistCreate(input);
  } finally {
    gate.finish();
  }
}

export async function submitWatchlistRename(input: {
  readonly api: ExecutionApiClient;
  readonly watchlist: WatchlistRow;
  readonly draft: WatchlistDraft;
  readonly onReload: () => Promise<void>;
}): Promise<WatchlistSubmissionState> {
  if (!watchlistDraftSchema.safeParse(input.draft).success) {
    return { status: 'failed', code: 'execution_command_invalid' };
  }
  const result = await input.api.renameWatchlist(
    buildWatchlistRenameInput(input.watchlist, input.draft),
  );
  if (result.ok) {
    await input.onReload();
    return { status: 'saved' };
  }
  return watchlistSubmissionFailure(result.code);
}

export async function submitWatchlistRenameOnce(
  gate: PendingActionGate,
  input: Parameters<typeof submitWatchlistRename>[0],
): Promise<WatchlistSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    return await submitWatchlistRename(input);
  } finally {
    gate.finish();
  }
}

export async function submitWatchlistRemove(input: {
  readonly api: ExecutionApiClient;
  readonly watchlist: WatchlistRow;
  readonly onReload: () => Promise<void>;
}): Promise<WatchlistSubmissionState> {
  // The guard runs before the request, not at the database: the default list
  // is a structural row and the UI must never even try to remove it.
  if (!canRemoveWatchlist(input.watchlist)) {
    return { status: 'failed', code: 'execution_command_invalid' };
  }
  const result = await input.api.removeWatchlist(buildWatchlistRemoveInput(input.watchlist));
  if (result.ok) {
    await input.onReload();
    return { status: 'removed' };
  }
  return watchlistSubmissionFailure(result.code);
}

export async function submitWatchlistAddProject(input: {
  readonly api: ExecutionApiClient;
  readonly watchlist: WatchlistRow;
  readonly projectId: string;
  readonly onReload: () => Promise<void>;
}): Promise<WatchlistSubmissionState> {
  const result = await input.api.addWatchlistProject(
    buildWatchlistAddProjectInput(input.watchlist, input.projectId),
  );
  if (result.ok) {
    await input.onReload();
    return { status: 'saved' };
  }
  return watchlistSubmissionFailure(result.code);
}

export async function submitWatchlistRemoveProject(input: {
  readonly api: ExecutionApiClient;
  readonly watchlist: WatchlistRow;
  readonly project: WatchlistProjectRow;
  readonly onReload: () => Promise<void>;
}): Promise<WatchlistSubmissionState> {
  const result = await input.api.removeWatchlistProject(
    buildWatchlistRemoveProjectInput(input.watchlist, input.project.projectId),
  );
  if (result.ok) {
    await input.onReload();
    return { status: 'removed' };
  }
  return watchlistSubmissionFailure(result.code);
}

export function WatchlistManager({ state, api, onReload }: {
  readonly state: WatchlistManagerState;
  readonly api: ExecutionApiClient;
  readonly onReload: () => Promise<void>;
}) {
  return (
    <main className="tasks-page">
      <header className="page-header">
        <h1 className="page-title">我的关注列表</h1>
        <p className="page-subtitle">把值得跟踪的机会分门别类，默认列表由系统自动创建，随时可用。</p>
      </header>

      {state.status === 'loading' ? <p className="execution-message">正在加载关注列表…</p> : null}
      {state.status === 'sign_in_required' ? (
        <p className="execution-message" data-code="execution_session_required">
          登录状态已失效：execution_session_required
        </p>
      ) : null}
      {state.status === 'failed' ? (
        <p className="execution-message" data-code={state.code}>加载失败：{state.code}</p>
      ) : null}
      {state.status === 'ready' ? (
        <WatchlistBoard watchlists={state.watchlists} api={api} onReload={onReload} />
      ) : null}
    </main>
  );
}

function WatchlistBoard({ watchlists, api, onReload }: {
  readonly watchlists: readonly WatchlistRow[];
  readonly api: ExecutionApiClient;
  readonly onReload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<WatchlistDraft>({ name: '' });
  const [submission, setSubmission] = useState<WatchlistSubmissionState>({ status: 'idle' });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<WatchlistDraft>({ name: '' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [projects, setProjects] = useState<readonly WatchlistProjectRow[]>([]);
  const gate = useRef(createPendingActionGate());
  const pending = submission.status === 'submitting';

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await submitWatchlistCreateOnce(gate.current, { api, draft, onReload }));
    setDraft({ name: '' });
  }

  async function rename(watchlist: WatchlistRow) {
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await submitWatchlistRenameOnce(gate.current, {
      api,
      watchlist,
      draft: renameDraft,
      onReload,
    }));
    setRenamingId(null);
  }

  async function remove(watchlist: WatchlistRow) {
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await submitWatchlistRemove({ api, watchlist, onReload }));
  }

  async function expand(watchlist: WatchlistRow) {
    if (pending) return;
    setSubmission({ status: 'submitting' });
    const result = await api.listWatchlistProjects({ watchlistId: watchlist.watchlistId });
    if (result.ok) {
      setProjects(result.data);
      setExpandedId(watchlist.watchlistId);
      setSubmission({ status: 'idle' });
      return;
    }
    // The failure code itself is stable and rendered as-is; there is nothing
    // membership-specific to translate here.
    setSubmission(watchlistSubmissionFailure(result.code));
  }

  async function eject(watchlist: WatchlistRow, project: WatchlistProjectRow) {
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await submitWatchlistRemoveProject({ api, watchlist, project, onReload }));
  }

  return (
    <>
      <section className="card execution-card" aria-labelledby="watchlist-create-heading">
        <h2 id="watchlist-create-heading">新建关注列表</h2>
        <form className="execution-form" onSubmit={(event) => { void create(event); }}>
          <div className="execution-field">
            <label htmlFor="watchlist-name">名称</label>
            <input
              id="watchlist-name"
              value={draft.name ?? ''}
              disabled={pending}
              maxLength={80}
              onChange={(event) => setDraft({ name: event.currentTarget.value })}
            />
          </div>
          <button className="button execution-primary-button" type="submit" disabled={pending}>
            {pending ? '正在保存…' : '新建列表'}
          </button>
        </form>
        <SubmissionMessage state={submission} onReload={onReload} />
      </section>

      <section className="card execution-card" aria-labelledby="watchlist-list-heading">
        <h2 id="watchlist-list-heading">列表</h2>
        {watchlists.length === 0 ? (
          <p className="execution-message">还没有关注列表。</p>
        ) : (
          <ul className="execution-task-list">
            {watchlists.map((watchlist) => (
              <li key={watchlist.watchlistId} className="execution-task">
                <span className="execution-task-title">
                  {watchlist.name}
                  {watchlist.isDefault ? (
                    <span className="execution-task-meta">（默认）</span>
                  ) : null}
                </span>
                <span className="execution-task-meta">
                  {watchlist.projectCount} 个项目 / v{watchlist.version}
                </span>
                <button
                  className="button"
                  type="button"
                  disabled={pending}
                  onClick={() => { void expand(watchlist); }}
                >
                  查看项目
                </button>
                {watchlist.isDefault ? null : (
                  <>
                    <button
                      className="button"
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setRenamingId(watchlist.watchlistId);
                        setRenameDraft({ name: watchlist.name });
                      }}
                    >
                      重命名
                    </button>
                    <button
                      className="button"
                      type="button"
                      disabled={pending}
                      onClick={() => { void remove(watchlist); }}
                    >
                      删除
                    </button>
                  </>
                )}
                {renamingId === watchlist.watchlistId ? (
                  <form
                    className="execution-form"
                    onSubmit={(event) => { event.preventDefault(); void rename(watchlist); }}
                  >
                    <div className="execution-field">
                      <label htmlFor={`watchlist-rename-${watchlist.watchlistId}`}>新名称</label>
                      <input
                        id={`watchlist-rename-${watchlist.watchlistId}`}
                        value={renameDraft.name ?? ''}
                        disabled={pending}
                        maxLength={80}
                        onChange={(event) => setRenameDraft({ name: event.currentTarget.value })}
                      />
                    </div>
                    <button className="button execution-primary-button" type="submit" disabled={pending}>
                      保存名称
                    </button>
                    <button
                      className="button"
                      type="button"
                      onClick={() => setRenamingId(null)}
                    >
                      取消
                    </button>
                  </form>
                ) : null}
                {expandedId === watchlist.watchlistId ? (
                  projects.length === 0 ? (
                    <p className="execution-message">这个列表还没有项目。</p>
                  ) : (
                    <ul className="execution-task-list">
                      {projects.map((project) => (
                        <li key={project.projectId} className="execution-task">
                          <span className="execution-task-meta">{project.projectId}</span>
                          <button
                            className="button"
                            type="button"
                            disabled={pending}
                            onClick={() => { void eject(watchlist, project); }}
                          >
                            移出
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SubmissionMessage({ state, onReload }: {
  readonly state: WatchlistSubmissionState;
  readonly onReload: () => Promise<void>;
}) {
  if (state.status === 'idle' || state.status === 'submitting') return null;
  if (state.status === 'saved') {
    return <p className="execution-message execution-message-success" role="status">已保存。</p>;
  }
  if (state.status === 'removed') {
    return <p className="execution-message execution-message-success" role="status">已删除。</p>;
  }
  if (state.status === 'session_required') {
    return (
      <p className="execution-message" data-code="execution_session_required">
        登录状态已失效：execution_session_required
      </p>
    );
  }
  return (
    <div>
      <p className="execution-message" data-code={state.code}>
        {state.status === 'conflict' ? '无法完成：' : '操作失败：'}{state.code}
      </p>
      {state.status === 'conflict' ? (
        <button className="button" type="button" onClick={() => { void onReload(); }}>
          重新加载
        </button>
      ) : null}
    </div>
  );
}
