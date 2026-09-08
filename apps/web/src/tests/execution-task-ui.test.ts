import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  buildTaskCreateInput,
  buildTaskUpdateInput,
  filterTasks,
  submitTaskCreateOnce,
  submitTaskRemove,
  submitTaskUpdateOnce,
  TaskManager,
  taskSubmissionFailure,
  type ExecutionTaskFilter,
  type TaskDraft,
  type TaskSubmissionState,
} from '../components/execution/task-manager.js';
import type { ExecutionApiClient } from '../lib/execution-api-client.js';

const taskId = '72000000-0000-4000-8000-000000000001';
const projectId = '72000000-0000-4000-8000-000000000002';

const backlog = {
  taskId,
  userId: '72000000-0000-4000-8000-000000000003',
  projectId,
  title: '核对快照条件',
  status: 'backlog',
  priority: 'medium',
  dueAt: null,
  completedAt: null,
  version: 1,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
} as const;

const urgent = { ...backlog, taskId: '72000000-0000-4000-8000-000000000009', title: '领取测试币', status: 'in_progress', priority: 'urgent' } as const;
const done = { ...backlog, taskId: '72000000-0000-4000-8000-00000000000a', title: '完成 KYC', status: 'completed', priority: 'low', completedAt: '2026-09-08T01:00:00.000Z' } as const;

const allTasks = [backlog, urgent, done] as never;

function apiClient(options: {
  readonly failWith?: string;
  readonly created?: boolean;
} = {}): ExecutionApiClient {
  return {
    listTasks: async () => ({ ok: true, data: allTasks }),
    createTask: async () => (
      options.failWith
        ? { ok: false, code: options.failWith as never }
        : { ok: true, data: { version: 1, commandId: taskId, replayed: false, taskId, taskVersion: 1 } }
    ),
    updateTask: async () => (
      options.failWith
        ? { ok: false, code: options.failWith as never }
        : { ok: true, data: { version: 1, commandId: taskId, replayed: false, taskId, taskVersion: 2 } }
    ),
    removeTask: async () => (
      options.failWith
        ? { ok: false, code: options.failWith as never }
        : { ok: true, data: { version: 1, commandId: taskId, replayed: false, taskId, taskVersion: 2 } }
    ),
  };
}

const gate = () => ({ begin: () => true, finish: () => {} });

describe('task manager contract', () => {
  it('builds a create command from the draft alone', () => {
    const draft: TaskDraft = {
      title: '  核对快照条件  ',
      status: 'backlog',
      priority: 'medium',
      projectId,
      dueAt: null,
    };
    expect(buildTaskCreateInput(draft)).toEqual({
      projectId,
      title: '核对快照条件',
      status: 'backlog',
      priority: 'medium',
      dueAt: null,
    });
  });

  it('builds an update command that states every patch field', () => {
    const input = buildTaskUpdateInput(backlog as never, {
      title: null,
      status: 'completed',
      priority: null,
      projectId: null,
      dueAt: null,
      completedAt: '2026-09-08T02:00:00.000Z',
    });
    expect(Object.keys(input).sort()).toEqual([
      'completedAt',
      'dueAt',
      'expectedVersion',
      'priority',
      'projectId',
      'status',
      'taskId',
      'title',
    ]);
    expect(input).toMatchObject({ expectedVersion: 1, taskId, status: 'completed' });
  });

  it('never lets an unauthorized field reach the command', async () => {
    const client = apiClient();
    const spy = { seen: undefined as unknown };
    const wrapped: ExecutionApiClient = {
      ...client,
      createTask: async (input) => { spy.seen = input; return client.createTask(input); },
    };
    const draft: TaskDraft = {
      title: '带私钥匙的任务',
      status: 'backlog',
      priority: 'medium',
      projectId: null,
      dueAt: null,
      ...({ privateKey: '0xdeadbeef' } as Record<string, unknown>),
    } as never;
    const result = await submitTaskCreateOnce(gate(), {
      api: wrapped,
      draft,
      onReload: async () => {},
    });
    expect(result.status).toBe('failed');
    expect(result).toMatchObject({ code: 'execution_command_invalid' });
    expect(spy.seen).toBeUndefined();
  });

  it('maps version conflicts and limits to the conflict state, never by message text', () => {
    expect(taskSubmissionFailure('execution_version_conflict')).toEqual({
      status: 'conflict',
      code: 'execution_version_conflict',
    });
    expect(taskSubmissionFailure('execution_task_limit_reached')).toEqual({
      status: 'conflict',
      code: 'execution_task_limit_reached',
    });
    expect(taskSubmissionFailure('execution_command_invalid')).toEqual({
      status: 'failed',
      code: 'execution_command_invalid',
    });
  });

  it('reports a session that expired during a mutation', async () => {
    const result = await submitTaskUpdateOnce(gate(), {
      api: apiClient({ failWith: 'execution_session_required' }),
      task: backlog as never,
      draft: {
        title: null,
        status: 'in_progress',
        priority: null,
        projectId: null,
        dueAt: null,
        completedAt: null,
      },
      onReload: async () => {},
    });
    expect(result).toMatchObject({ status: 'session_required' });
  });

  it('filters by status and priority without inventing pagination', () => {
    const filter: ExecutionTaskFilter = { status: 'all', priority: 'all' };
    expect(filterTasks(allTasks, filter)).toHaveLength(3);
    expect(filterTasks(allTasks, { status: 'completed', priority: 'all' })).toHaveLength(1);
    expect(filterTasks(allTasks, { status: 'all', priority: 'urgent' })).toHaveLength(1);
    expect(filterTasks(allTasks, { status: 'backlog', priority: 'urgent' })).toHaveLength(0);
  });

  it('asks before deleting and only then removes', async () => {
    const result = await submitTaskRemove({
      api: apiClient(),
      task: backlog as never,
      onReload: async () => {},
    });
    expect(result.status).toBe('removed');
  });
});

describe('task manager rendering', () => {
  it('renders the empty state, the list, and never a pagination control', () => {
    const empty = renderToStaticMarkup(
      createElement(TaskManager, {
        state: { status: 'ready', tasks: [] },
        api: apiClient(),
        onReload: async () => {},
      }),
    );
    expect(empty).toContain('还没有任务');
    expect(empty).not.toContain('下一页');
    expect(empty).not.toContain('page=');

    const filled = renderToStaticMarkup(
      createElement(TaskManager, {
        state: { status: 'ready', tasks: allTasks },
        api: apiClient(),
        onReload: async () => {},
      }),
    );
    expect(filled).toContain('核对快照条件');
    expect(filled).toContain('领取测试币');
    expect(filled).not.toContain('下一页');
  });

  it('shows the sign-in state and a stable code rather than a message', () => {
    const html = renderToStaticMarkup(
      createElement(TaskManager, {
        state: { status: 'sign_in_required' },
        api: apiClient(),
        onReload: async () => {},
      }),
    );
    expect(html).toContain('execution_session_required');
  });

  it('shows the failure code for a load error', () => {
    const html = renderToStaticMarkup(
      createElement(TaskManager, {
        state: { status: 'failed', code: 'execution_query_failed' },
        api: apiClient(),
        onReload: async () => {},
      }),
    );
    expect(html).toContain('execution_query_failed');
  });

  it('renders a conflict with a reload affordance', () => {
    const submission: TaskSubmissionState = {
      status: 'conflict',
      code: 'execution_version_conflict',
    };
    const html = renderToStaticMarkup(
      createElement(TaskManager, {
        state: { status: 'ready', tasks: allTasks },
        api: apiClient(),
        onReload: async () => {},
        initialSubmission: submission,
      }),
    );
    expect(html).toContain('execution_version_conflict');
    expect(html).toContain('重新加载');
  });
});
