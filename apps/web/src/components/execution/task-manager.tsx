'use client';

import {
  taskPrioritySchema,
  taskStatusSchema,
  type ExecutionErrorCode,
  type UserTaskRow,
} from '@airdrop/contracts';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';

import type { ExecutionApiClient } from '../../lib/execution-api-client.js';
import {
  createPendingActionGate,
  type PendingActionGate,
} from '../../lib/review-pending-action.js';

export type TaskManagerState =
  | { readonly status: 'loading' }
  | { readonly status: 'sign_in_required' }
  | { readonly status: 'failed'; readonly code: 'execution_query_failed' }
  | { readonly status: 'ready'; readonly tasks: readonly UserTaskRow[] };

export type TaskSubmissionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'saved' }
  | { readonly status: 'removed' }
  | { readonly status: 'session_required' }
  | { readonly status: 'failed'; readonly code: ExecutionErrorCode }
  | { readonly status: 'conflict'; readonly code: ExecutionErrorCode };

export interface TaskDraft {
  readonly title: string | null;
  readonly status: string | null;
  readonly priority: string | null;
  readonly projectId: string | null;
  readonly dueAt: string | null;
  readonly completedAt?: string | null;
}

export interface ExecutionTaskFilter {
  readonly status: string;
  readonly priority: string;
}

// A draft is validated against a strict shape before it is turned into a
// command. An unexpected field is rejected outright: silently dropping it would
// hide a hostile or broken caller, which is the one thing this layer must not do.
const taskCreateDraftSchema = z.strictObject({
  projectId: z.uuid().nullable(),
  title: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueAt: z.iso.datetime({ offset: true }).nullable(),
});

const taskUpdateDraftSchema = z.strictObject({
  projectId: z.uuid().nullable(),
  title: z.string().nullable(),
  status: taskStatusSchema.nullable(),
  priority: taskPrioritySchema.nullable(),
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const taskStatuses: readonly string[] = [
  'backlog',
  'planned',
  'in_progress',
  'completed',
  'skipped',
  'blocked',
];
export const taskPriorities: readonly string[] = ['low', 'medium', 'high', 'urgent'];

// Filtering happens on the rows already loaded. The first version deliberately
// has no pagination, so nothing here invents a cursor or a page control.
export function filterTasks(
  tasks: readonly UserTaskRow[],
  filter: ExecutionTaskFilter,
): readonly UserTaskRow[] {
  return tasks.filter((task) => (
    (filter.status === 'all' || task.status === filter.status)
    && (filter.priority === 'all' || task.priority === filter.priority)
  ));
}

export function buildTaskCreateInput(draft: TaskDraft): {
  readonly projectId: string | null;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly dueAt: string | null;
} {
  return {
    projectId: draft.projectId,
    title: (draft.title ?? '').trim(),
    status: draft.status ?? 'backlog',
    priority: draft.priority ?? 'medium',
    dueAt: draft.dueAt,
  };
}

export function buildTaskUpdateInput(task: UserTaskRow, draft: TaskDraft): {
  readonly taskId: string;
  readonly expectedVersion: number;
  readonly projectId: string | null;
  readonly title: string | null;
  readonly status: string | null;
  readonly priority: string | null;
  readonly dueAt: string | null;
  readonly completedAt: string | null;
} {
  return {
    taskId: task.taskId,
    expectedVersion: task.version,
    projectId: draft.projectId,
    title: draft.title === null ? null : draft.title.trim(),
    status: draft.status,
    priority: draft.priority,
    dueAt: draft.dueAt,
    completedAt: draft.completedAt ?? null,
  };
}

export function taskSubmissionFailure(code: ExecutionErrorCode): TaskSubmissionState {
  if (code === 'execution_session_required') return { status: 'session_required' };
  if (
    code === 'execution_version_conflict'
    || code === 'execution_idempotency_conflict'
    || code === 'execution_task_limit_reached'
  ) return { status: 'conflict', code };
  return { status: 'failed', code };
}

export async function submitTaskCreate(input: {
  readonly api: ExecutionApiClient;
  readonly draft: TaskDraft;
  readonly onReload: () => Promise<void>;
}): Promise<TaskSubmissionState> {
  if (!taskCreateDraftSchema.safeParse(input.draft).success) {
    return { status: 'failed', code: 'execution_command_invalid' };
  }
  const result = await input.api.createTask(buildTaskCreateInput(input.draft));
  if (result.ok) {
    await input.onReload();
    return { status: 'saved' };
  }
  return taskSubmissionFailure(result.code);
}

export async function submitTaskCreateOnce(
  gate: PendingActionGate,
  input: Parameters<typeof submitTaskCreate>[0],
): Promise<TaskSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    return await submitTaskCreate(input);
  } finally {
    gate.finish();
  }
}

export async function submitTaskUpdate(input: {
  readonly api: ExecutionApiClient;
  readonly task: UserTaskRow;
  readonly draft: TaskDraft;
  readonly onReload: () => Promise<void>;
}): Promise<TaskSubmissionState> {
  if (!taskUpdateDraftSchema.safeParse({
    projectId: input.draft.projectId,
    title: input.draft.title,
    status: input.draft.status,
    priority: input.draft.priority,
    dueAt: input.draft.dueAt,
    completedAt: input.draft.completedAt ?? null,
  }).success) {
    return { status: 'failed', code: 'execution_command_invalid' };
  }
  const result = await input.api.updateTask(buildTaskUpdateInput(input.task, input.draft));
  if (result.ok) {
    await input.onReload();
    return { status: 'saved' };
  }
  return taskSubmissionFailure(result.code);
}

export async function submitTaskUpdateOnce(
  gate: PendingActionGate,
  input: Parameters<typeof submitTaskUpdate>[0],
): Promise<TaskSubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    return await submitTaskUpdate(input);
  } finally {
    gate.finish();
  }
}

export async function submitTaskRemove(input: {
  readonly api: ExecutionApiClient;
  readonly task: UserTaskRow;
  readonly onReload: () => Promise<void>;
}): Promise<TaskSubmissionState> {
  const result = await input.api.removeTask({
    taskId: input.task.taskId,
    expectedVersion: input.task.version,
  });
  if (result.ok) {
    await input.onReload();
    return { status: 'removed' };
  }
  return taskSubmissionFailure(result.code);
}

export function TaskManager({ state, api, onReload, initialSubmission }: {
  readonly state: TaskManagerState;
  readonly api: ExecutionApiClient;
  readonly onReload: () => Promise<void>;
  readonly initialSubmission?: TaskSubmissionState;
}) {
  return (
    <main className="tasks-page">
      <header className="page-header">
        <h1 className="page-title">我的任务</h1>
        <p className="page-subtitle">把关注到的机会拆成可执行的一步一步，只记录进度，不涉及任何链上操作。</p>
      </header>

      {state.status === 'loading' ? <p className="execution-message">正在加载任务…</p> : null}
      {state.status === 'sign_in_required' ? (
        <p className="execution-message" data-code="execution_session_required">
          登录状态已失效：execution_session_required
        </p>
      ) : null}
      {state.status === 'failed' ? (
        <p className="execution-message" data-code={state.code}>加载失败：{state.code}</p>
      ) : null}
      {state.status === 'ready' ? (
        <TaskBoard
          tasks={state.tasks}
          api={api}
          onReload={onReload}
          {...(initialSubmission === undefined ? {} : { initialSubmission })}
        />
      ) : null}
    </main>
  );
}

function TaskBoard({ tasks, api, onReload, initialSubmission }: {
  readonly tasks: readonly UserTaskRow[];
  readonly api: ExecutionApiClient;
  readonly onReload: () => Promise<void>;
  readonly initialSubmission?: TaskSubmissionState;
}) {
  const [filter, setFilter] = useState<ExecutionTaskFilter>({ status: 'all', priority: 'all' });
  const [draft, setDraft] = useState<TaskDraft>({
    title: '',
    status: 'backlog',
    priority: 'medium',
    projectId: null,
    dueAt: null,
  });
  const [submission, setSubmission] = useState<TaskSubmissionState>(
    initialSubmission ?? { status: 'idle' },
  );
  const gate = useRef(createPendingActionGate());
  const visible = useMemo(() => filterTasks(tasks, filter), [tasks, filter]);
  const pending = submission.status === 'submitting';

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await submitTaskCreateOnce(gate.current, { api, draft, onReload }));
  }

  async function complete(task: UserTaskRow) {
    if (pending) return;
    setSubmission({ status: 'submitting' });
    const completedAt = new Date().toISOString();
    setSubmission(await submitTaskUpdateOnce(gate.current, {
      api,
      task,
      draft: {
        title: null,
        status: 'completed',
        priority: null,
        projectId: null,
        dueAt: null,
        completedAt,
      },
      onReload,
    }));
  }

  async function remove(task: UserTaskRow) {
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await submitTaskRemove({ api, task, onReload }));
  }

  return (
    <>
      <section className="card execution-card" aria-labelledby="task-create-heading">
        <h2 id="task-create-heading">新建任务</h2>
        <form className="execution-form" onSubmit={(event) => { void create(event); }}>
          <div className="execution-field">
            <label htmlFor="task-title">标题</label>
            <input
              id="task-title"
              value={draft.title ?? ''}
              disabled={pending}
              maxLength={200}
              onChange={(event) => setDraft((value) => ({ ...value, title: event.currentTarget.value }))}
            />
          </div>
          <div className="execution-field">
            <label htmlFor="task-status">状态</label>
            <select
              id="task-status"
              value={draft.status ?? 'backlog'}
              disabled={pending}
              onChange={(event) => setDraft((value) => ({ ...value, status: event.currentTarget.value }))}
            >
              {taskStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div className="execution-field">
            <label htmlFor="task-priority">优先级</label>
            <select
              id="task-priority"
              value={draft.priority ?? 'medium'}
              disabled={pending}
              onChange={(event) => setDraft((value) => ({ ...value, priority: event.currentTarget.value }))}
            >
              {taskPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </div>
          <button className="button execution-primary-button" type="submit" disabled={pending}>
            {pending ? '正在保存…' : '新建任务'}
          </button>
        </form>
        <SubmissionMessage state={submission} onReload={onReload} />
      </section>

      <section className="card execution-card" aria-labelledby="task-filter-heading">
        <h2 id="task-filter-heading">筛选</h2>
        <div className="execution-filters">
          <div className="execution-field">
            <label htmlFor="filter-status">状态</label>
            <select
              id="filter-status"
              value={filter.status}
              onChange={(event) => setFilter((value) => ({ ...value, status: event.currentTarget.value }))}
            >
              <option value="all">全部</option>
              {taskStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div className="execution-field">
            <label htmlFor="filter-priority">优先级</label>
            <select
              id="filter-priority"
              value={filter.priority}
              onChange={(event) => setFilter((value) => ({ ...value, priority: event.currentTarget.value }))}
            >
              <option value="all">全部</option>
              {taskPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="card execution-card" aria-labelledby="task-list-heading">
        <h2 id="task-list-heading">任务列表</h2>
        {visible.length === 0 ? (
          <p className="execution-message">还没有任务。</p>
        ) : (
          <ul className="execution-task-list">
            {visible.map((task) => (
              <li key={task.taskId} className="execution-task">
                <span className="execution-task-title">{task.title}</span>
                <span className="execution-task-meta">{task.status} / {task.priority} / v{task.version}</span>
                {task.status === 'completed' ? null : (
                  <button
                    className="button"
                    type="button"
                    disabled={pending}
                    onClick={() => { void complete(task); }}
                  >
                    标记完成
                  </button>
                )}
                <button
                  className="button"
                  type="button"
                  disabled={pending}
                  onClick={() => { void remove(task); }}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SubmissionMessage({ state, onReload }: {
  readonly state: TaskSubmissionState;
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
        {state.status === 'conflict' ? '任务已变更：' : '操作失败：'}{state.code}
      </p>
      {state.status === 'conflict' ? (
        <button className="button" type="button" onClick={() => { void onReload(); }}>
          重新加载
        </button>
      ) : null}
    </div>
  );
}
