'use client';

import type {
  ExecutionErrorCode,
  UserProjectParticipationRow,
  WatchlistRow,
} from '@airdrop/contracts';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';

import { participationStatusSchema } from '@airdrop/contracts';

import {
  createExecutionApiClient,
  type ExecutionApiClient,
} from '../../lib/execution-api-client.js';
import { useExecutionBrowserRuntime } from '../../lib/execution-browser-runtime.js';
import {
  createPendingActionGate,
  type PendingActionGate,
} from '../../lib/review-pending-action.js';
import { defaultWatchlistOf, buildWatchlistAddProjectInput } from './watchlist-manager.js';
import { executionSubmissionFailure, type ExecutionSubmissionState } from './execution-submission.js';

export type ProjectExecutionState =
  | { readonly status: 'loading' }
  | { readonly status: 'sign_in_required' }
  | { readonly status: 'failed'; readonly code: ExecutionErrorCode }
  | {
      readonly status: 'ready';
      readonly watchlists: readonly WatchlistRow[];
      readonly participation: UserProjectParticipationRow | null;
    };

export type ProjectSubmissionState = ExecutionSubmissionState;

export interface ParticipationDraft {
  readonly status: string | null;
  readonly notes: string | null;
}

export const participationStatuses: readonly string[] = participationStatusSchema.options;

// Exactly the fields the participation command carries; anything else on a
// draft is a hostile or broken caller and must be visible, not dropped.
const participationDraftSchema = z.strictObject({
  status: participationStatusSchema.nullable(),
  notes: z.string().max(4000).nullable(),
});

/**
 * Builds the set-participation command. A row that has never been written
 * accepts version 1; an existing row must state the version the projection
 * handed back, or the database rejects the update as stale.
 */
export function buildParticipationSetInput(
  projectId: string,
  draft: ParticipationDraft,
  participation: UserProjectParticipationRow | null,
): {
  readonly projectId: string;
  readonly participationStatus: string;
  readonly notes: string | null;
  readonly expectedVersion: number;
} {
  return {
    projectId,
    participationStatus: draft.status ?? 'interested',
    notes: (draft.notes ?? '').trim() === '' ? null : (draft.notes ?? '').trim(),
    expectedVersion: participation?.version ?? 1,
  };
}

export function participationSubmissionFailure(
  code: ExecutionErrorCode,
): ProjectSubmissionState {
  return executionSubmissionFailure(code);
}

export async function submitParticipationSet(input: {
  readonly api: ExecutionApiClient;
  readonly projectId: string;
  readonly draft: ParticipationDraft;
  readonly participation: UserProjectParticipationRow | null;
  readonly onReload: () => Promise<void>;
}): Promise<ProjectSubmissionState> {
  if (!participationDraftSchema.safeParse(input.draft).success) {
    return { status: 'failed', code: 'execution_command_invalid' };
  }
  const result = await input.api.setParticipation(
    buildParticipationSetInput(input.projectId, input.draft, input.participation),
  );
  if (result.ok) {
    await input.onReload();
    return { status: 'saved' };
  }
  return participationSubmissionFailure(result.code);
}

export async function submitParticipationSetOnce(
  gate: PendingActionGate,
  input: Parameters<typeof submitParticipationSet>[0],
): Promise<ProjectSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    return await submitParticipationSet(input);
  } finally {
    gate.finish();
  }
}

export async function submitWatchlistToggle(input: {
  readonly api: ExecutionApiClient;
  readonly watchlists: readonly WatchlistRow[];
  readonly projectId: string;
  readonly onReload: () => Promise<void>;
}): Promise<ProjectSubmissionState> {
  const watchlist = defaultWatchlistOf(input.watchlists);
  // The trigger guarantees a default list; if one is missing the environment
  // is broken and the UI must fail closed instead of picking an arbitrary row.
  if (watchlist === null) {
    return { status: 'failed', code: 'execution_command_invalid' };
  }
  const result = await input.api.addWatchlistProject(
    buildWatchlistAddProjectInput(watchlist, input.projectId),
  );
  if (result.ok) {
    await input.onReload();
    return { status: 'saved' };
  }
  return participationSubmissionFailure(result.code);
}

export async function submitWatchlistToggleOnce(
  gate: PendingActionGate,
  input: Parameters<typeof submitWatchlistToggle>[0],
): Promise<ProjectSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    return await submitWatchlistToggle(input);
  } finally {
    gate.finish();
  }
}

export function ProjectExecutionSection({ projectId }: {
  readonly projectId: string;
}) {
  const runtime = useExecutionBrowserRuntime();
  const [state, setState] = useState<ProjectExecutionState>({ status: 'loading' });

  const reload = useCallback(async () => {
    const api = runtime?.api;
    if (api === undefined) return;
    setState({ status: 'loading' });
    const [watchlists, participation] = await Promise.all([
      api.listWatchlists(),
      api.getParticipation({ projectId }),
    ]);
    if (!watchlists.ok) {
      if (watchlists.code === 'execution_session_required') {
        setState({ status: 'sign_in_required' });
        return;
      }
      setState({ status: 'failed', code: 'execution_query_failed' });
      return;
    }
    // A project with no participation row yet reports not-found: that is the
    // "never participated" state, not an error, and renders as a fresh form.
    if (!participation.ok && participation.code !== 'execution_project_not_found') {
      if (participation.code === 'execution_session_required') {
        setState({ status: 'sign_in_required' });
        return;
      }
      setState({ status: 'failed', code: 'execution_query_failed' });
      return;
    }
    setState({
      status: 'ready',
      watchlists: watchlists.data,
      participation: participation.ok ? participation.data : null,
    });
  }, [runtime, projectId]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <ProjectExecutionPanel
      projectId={projectId}
      state={state}
      api={runtime?.api ?? unavailableClient}
      onReload={reload}
    />
  );
}

const unavailableClient: ExecutionApiClient = createExecutionApiClient({
  session: { getAccessToken: async () => null },
  fetch: globalThis.fetch.bind(globalThis),
  ids: { generate: () => crypto.randomUUID() },
});

export function ProjectExecutionPanel({ projectId, state, api, onReload }: {
  readonly projectId: string;
  readonly state: ProjectExecutionState;
  readonly api: ExecutionApiClient;
  readonly onReload: () => Promise<void>;
}) {
  return (
    <section className="card detail-section" aria-labelledby="execution-panel-heading">
      <h2 className="detail-section-title" id="execution-panel-heading">我的参与</h2>
      {state.status === 'loading' ? <p className="execution-message">正在加载参与状态…</p> : null}
      {state.status === 'sign_in_required' ? (
        <p className="execution-message" data-code="execution_session_required">
          登录后可记录参与状态：execution_session_required
        </p>
      ) : null}
      {state.status === 'failed' ? (
        <p className="execution-message" data-code={state.code}>加载失败：{state.code}</p>
      ) : null}
      {state.status === 'ready' ? (
        <ProjectExecutionForm
          projectId={projectId}
          watchlists={state.watchlists}
          participation={state.participation}
          api={api}
          onReload={onReload}
        />
      ) : null}
    </section>
  );
}

function ProjectExecutionForm({ projectId, watchlists, participation, api, onReload }: {
  readonly projectId: string;
  readonly watchlists: readonly WatchlistRow[];
  readonly participation: UserProjectParticipationRow | null;
  readonly api: ExecutionApiClient;
  readonly onReload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ParticipationDraft>({
    status: participation?.participationStatus ?? 'interested',
    notes: participation?.notes ?? '',
  });
  const [submission, setSubmission] = useState<ProjectSubmissionState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const pending = submission.status === 'submitting';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await submitParticipationSetOnce(gate.current, {
      api,
      projectId,
      draft,
      participation,
      onReload,
    }));
  }

  async function watch() {
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await submitWatchlistToggleOnce(gate.current, {
      api,
      watchlists,
      projectId,
      onReload,
    }));
  }

  return (
    <>
      <form className="execution-form" onSubmit={(event) => { void save(event); }}>
        <div className="execution-field">
          <label htmlFor="participation-status">参与状态</label>
          <select
            id="participation-status"
            value={draft.status ?? 'interested'}
            disabled={pending}
            onChange={(event) => setDraft((value) => ({ ...value, status: event.currentTarget.value }))}
          >
            {participationStatuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
        <div className="execution-field">
          <label htmlFor="participation-notes">笔记</label>
          <textarea
            id="participation-notes"
            value={draft.notes ?? ''}
            disabled={pending}
            maxLength={4000}
            rows={3}
            onChange={(event) => setDraft((value) => ({ ...value, notes: event.currentTarget.value }))}
          />
        </div>
        <button className="button execution-primary-button" type="submit" disabled={pending}>
          {pending ? '正在保存…' : '保存参与状态'}
        </button>
      </form>
      <button
        className="button"
        type="button"
        disabled={pending}
        onClick={() => { void watch(); }}
      >
        加入默认关注
      </button>
      <SubmissionMessage state={submission} onReload={onReload} />
    </>
  );
}

function SubmissionMessage({ state, onReload }: {
  readonly state: ProjectSubmissionState;
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
