import { describe, expect, it } from 'vitest';

import {
  createExecutionParticipationHandler,
  createExecutionTaskHandler,
  createExecutionTaskItemHandler,
  createExecutionWatchlistHandler,
  createExecutionWatchlistItemHandler,
  createExecutionWatchlistProjectHandler,
  type ExecutionHandlerDependencies,
} from '../lib/execution-handlers.js';

const taskId = '71000000-0000-4000-8000-000000000001';
const watchlistId = '71000000-0000-4000-8000-000000000002';
const projectId = '71000000-0000-4000-8000-000000000003';
const otherProjectId = '71000000-0000-4000-8000-000000000009';

const taskRow = {
  taskId,
  userId: '71000000-0000-4000-8000-000000000004',
  projectId,
  title: '核对快照条件',
  status: 'in_progress',
  priority: 'high',
  dueAt: null,
  completedAt: null,
  version: 2,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};

const createTaskBody = {
  idempotencyKey: 'bff-task-create',
  expectedVersion: 1,
  projectId,
  title: '核对快照条件',
  status: 'backlog',
  priority: 'medium',
  dueAt: null,
} as const;

const updateTaskBody = {
  idempotencyKey: 'bff-task-update',
  expectedVersion: 2,
  taskId,
  projectId: null,
  title: null,
  status: 'completed',
  priority: null,
  dueAt: null,
  completedAt: '2026-09-08T00:00:00.000Z',
} as const;

type RepoCall = { readonly name: string; readonly args: readonly unknown[] };
type Failing = { readonly code: string };

function makeDeps(options: {
  readonly session?: 'verified' | 'none' | 'error';
  readonly failWith?: Failing;
} = {}) {
  const calls: RepoCall[] = [];
  const session = options.session ?? 'verified';
  const tasks = {
    listMine: async (input: unknown) => {
      calls.push({ name: 'tasks.listMine', args: [input] });
      if (options.failWith) throw options.failWith;
      return [taskRow];
    },
    create: async (input: unknown) => {
      calls.push({ name: 'tasks.create', args: [input] });
      if (options.failWith) throw options.failWith;
      return { version: 1, commandId: taskId, replayed: false, taskId, taskVersion: 1 };
    },
    update: async (input: unknown) => {
      calls.push({ name: 'tasks.update', args: [input] });
      if (options.failWith) throw options.failWith;
      return { version: 1, commandId: taskId, replayed: false, taskId, taskVersion: 3 };
    },
    remove: async (input: unknown) => {
      calls.push({ name: 'tasks.remove', args: [input] });
      if (options.failWith) throw options.failWith;
      return { version: 1, commandId: taskId, replayed: false, taskId, taskVersion: 3 };
    },
  };
  const watchlists = {
    listMine: async (input: unknown) => {
      calls.push({ name: 'watchlists.listMine', args: [input] });
      if (options.failWith) throw options.failWith;
      return [];
    },
    listProjects: async (input: unknown) => {
      calls.push({ name: 'watchlists.listProjects', args: [input] });
      if (options.failWith) throw options.failWith;
      return [];
    },
    create: async (input: unknown) => {
      calls.push({ name: 'watchlists.create', args: [input] });
      if (options.failWith) throw options.failWith;
      return { version: 1, commandId: taskId, replayed: false, watchlistId, watchlistVersion: 1 };
    },
    rename: async (input: unknown) => {
      calls.push({ name: 'watchlists.rename', args: [input] });
      if (options.failWith) throw options.failWith;
      return { version: 1, commandId: taskId, replayed: false, watchlistId, watchlistVersion: 2 };
    },
    remove: async (input: unknown) => {
      calls.push({ name: 'watchlists.remove', args: [input] });
      if (options.failWith) throw options.failWith;
      return { version: 1, commandId: taskId, replayed: false, watchlistId, watchlistVersion: 2 };
    },
    addProject: async (input: unknown) => {
      calls.push({ name: 'watchlists.addProject', args: [input] });
      if (options.failWith) throw options.failWith;
      return { version: 1, commandId: taskId, replayed: false, watchlistId, watchlistVersion: 2 };
    },
    removeProject: async (input: unknown) => {
      calls.push({ name: 'watchlists.removeProject', args: [input] });
      if (options.failWith) throw options.failWith;
      return { version: 1, commandId: taskId, replayed: false, watchlistId, watchlistVersion: 3 };
    },
  };
  const participation = {
    getMine: async (input: unknown) => {
      calls.push({ name: 'participation.getMine', args: [input] });
      if (options.failWith) throw options.failWith;
      return {
        projectId,
        participationStatus: 'participating',
        notes: null,
        startedAt: null,
        updatedAt: '2026-09-08T00:00:00.000Z',
        version: 1,
      };
    },
    set: async (input: unknown) => {
      calls.push({ name: 'participation.set', args: [input] });
      if (options.failWith) throw options.failWith;
      return { version: 1, commandId: taskId, replayed: false, projectId };
    },
  };

  const deps = {
    auth: {
      verifyAuthorizationHeader: async () => {
        if (session === 'error') throw new Error('auth down');
        return session === 'verified' ? { userId: 'user-1' } : null;
      },
    },
    tasks,
    watchlists,
    participation,
    ids: { generate: () => '71000000-0000-4000-8000-0000000000ff' },
  } as unknown as ExecutionHandlerDependencies;

  return { deps, calls };
}

function request(method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  const init: RequestInit = { method, headers: { authorization: 'Bearer token-1', ...headers } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { ...init.headers, 'content-type': 'application/json' };
  }
  return new Request('http://localhost/api/v1/execution/tasks', init);
}

const params = (values: Record<string, string>) => ({ params: Promise.resolve(values) });

describe('Execution BFF handlers', () => {
  it('fails closed with 401 and never calls a repository when there is no session', async () => {
    const { deps, calls } = makeDeps({ session: 'none' });
    const handler = createExecutionTaskHandler(deps);

    const response = await handler(request('GET'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'execution_session_required' } });
    expect(calls).toEqual([]);
  });

  it('authenticates strictly before it parses the request body', async () => {
    const { deps, calls } = makeDeps({ session: 'none' });
    const handler = createExecutionTaskHandler(deps);

    const response = await handler(request('POST', { broken: true }));
    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('lists the caller tasks through the bearer token', async () => {
    const { deps, calls } = makeDeps();
    const handler = createExecutionTaskHandler(deps);

    const response = await handler(request('GET'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: [taskRow] });
    expect(calls).toEqual([{ name: 'tasks.listMine', args: [{ accessToken: 'token-1' }] }]);
  });

  it('requires the idempotency key header to match the body', async () => {
    const { deps, calls } = makeDeps();
    const handler = createExecutionTaskHandler(deps);

    const response = await handler(
      request('POST', createTaskBody, { 'idempotency-key': 'a-different-key' }),
    );
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('creates a task when the idempotency key matches', async () => {
    const { deps, calls } = makeDeps();
    const handler = createExecutionTaskHandler(deps);

    const response = await handler(
      request('POST', createTaskBody, { 'idempotency-key': 'bff-task-create' }),
    );
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('binds the path task id to the body task id', async () => {
    const { deps, calls } = makeDeps();
    const handler = createExecutionTaskItemHandler(deps);

    const response = await handler(
      request('PATCH', { ...updateTaskBody, taskId: otherProjectId }, {
        'idempotency-key': 'bff-task-update',
      }),
      params({ id: taskId }) as never,
    );
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('updates and deletes the addressed task', async () => {
    const { deps, calls } = makeDeps();
    const handler = createExecutionTaskItemHandler(deps);

    const patched = await handler(
      request('PATCH', updateTaskBody, { 'idempotency-key': 'bff-task-update' }),
      params({ id: taskId }) as never,
    );
    expect(patched.status).toBe(200);
    const deleted = await handler(
      request('DELETE', {
        idempotencyKey: 'bff-task-delete',
        expectedVersion: 3,
        taskId,
      }, { 'idempotency-key': 'bff-task-delete' }),
      params({ id: taskId }) as never,
    );
    expect(deleted.status).toBe(200);
    expect(calls.map((call) => call.name)).toEqual(['tasks.update', 'tasks.remove']);
  });

  it('manages watchlists and their members through the addressed ids', async () => {
    const { deps, calls } = makeDeps();
    const list = createExecutionWatchlistHandler(deps);
    const item = createExecutionWatchlistItemHandler(deps);
    const member = createExecutionWatchlistProjectHandler(deps);

    await expect(list(request('GET'))).resolves.toMatchObject({ status: 200 } as never);
    const created = await list(
      request('POST', {
        idempotencyKey: 'bff-list-create',
        expectedVersion: 1,
        name: '长期观察',
      }, { 'idempotency-key': 'bff-list-create' }),
    );
    expect(created.status).toBe(200);

    const renamed = await item(
      request('PATCH', {
        idempotencyKey: 'bff-list-rename',
        expectedVersion: 1,
        watchlistId,
        name: '长期观察二',
      }, { 'idempotency-key': 'bff-list-rename' }),
      params({ id: watchlistId }) as never,
    );
    expect(renamed.status).toBe(200);

    const added = await member(
      request('PUT', {
        idempotencyKey: 'bff-list-add',
        expectedVersion: 2,
        watchlistId,
        projectId,
      }, { 'idempotency-key': 'bff-list-add' }),
      params({ watchlistId, projectId }) as never,
    );
    expect(added.status).toBe(200);

    const removed = await member(
      request('DELETE', {
        idempotencyKey: 'bff-list-remove',
        expectedVersion: 3,
        watchlistId,
        projectId,
      }, { 'idempotency-key': 'bff-list-remove' }),
      params({ watchlistId, projectId }) as never,
    );
    expect(removed.status).toBe(200);

    expect(calls.map((call) => call.name)).toEqual([
      'watchlists.listMine',
      'watchlists.create',
      'watchlists.rename',
      'watchlists.addProject',
      'watchlists.removeProject',
    ]);
  });

  it('reads and sets participation for the addressed project', async () => {
    const { deps, calls } = makeDeps();
    const handler = createExecutionParticipationHandler(deps);

    await expect(handler(request('GET'), params({ projectId }) as never)).resolves.toMatchObject({
      status: 200,
    } as never);
    const set = await handler(
      request('PUT', {
        idempotencyKey: 'bff-participation',
        expectedVersion: 1,
        projectId,
        participationStatus: 'participating',
        notes: null,
      }, { 'idempotency-key': 'bff-participation' }),
      params({ projectId }) as never,
    );
    expect(set.status).toBe(200);
    expect(calls.map((call) => call.name)).toEqual(['participation.getMine', 'participation.set']);
  });

  it.each([
    ['execution_task_not_found', 404],
    ['execution_watchlist_not_found', 404],
    ['execution_project_not_found', 404],
    ['execution_name_conflict', 409],
    ['execution_version_conflict', 409],
    ['execution_idempotency_conflict', 409],
    ['execution_task_limit_reached', 409],
    ['execution_watchlist_limit_reached', 409],
    ['execution_watchlist_project_limit_reached', 409],
    ['execution_command_invalid', 400],
  ] as const)('maps %s to %i', async (code, status) => {
    const { deps } = makeDeps({ failWith: { code } });
    const response = await createExecutionTaskHandler(deps)(request('GET'));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });

  it('falls back to query failure on reads and persistence failure on writes', async () => {
    const readDeps = makeDeps({ failWith: { code: 'something_unexpected' } });
    const read = await createExecutionTaskHandler(readDeps.deps)(request('GET'));
    expect(read.status).toBe(500);
    await expect(read.json()).resolves.toMatchObject({
      error: { code: 'execution_query_failed' },
    });

    const writeDeps = makeDeps({ failWith: { code: 'something_unexpected' } });
    const write = await createExecutionTaskHandler(writeDeps.deps)(
      request('POST', createTaskBody, { 'idempotency-key': 'bff-task-create' }),
    );
    expect(write.status).toBe(500);
    await expect(write.json()).resolves.toMatchObject({
      error: { code: 'execution_persistence_failed' },
    });
  });

  it('reports authentication infrastructure failures with the matching fallback', async () => {
    const { deps } = makeDeps({ session: 'error' });
    const read = await createExecutionTaskHandler(deps)(request('GET'));
    expect(read.status).toBe(500);
    await expect(read.json()).resolves.toMatchObject({
      error: { code: 'execution_query_failed' },
    });

    const write = await createExecutionTaskHandler(deps)(
      request('POST', createTaskBody, { 'idempotency-key': 'bff-task-create' }),
    );
    expect(write.status).toBe(500);
    await expect(write.json()).resolves.toMatchObject({
      error: { code: 'execution_persistence_failed' },
    });
  });

  it('rejects query strings and unknown methods', async () => {
    const { deps } = makeDeps();
    const handler = createExecutionTaskHandler(deps);

    const withQuery = new Request('http://localhost/api/v1/execution/tasks?page=2', {
      method: 'GET',
      headers: { authorization: 'Bearer token-1' },
    });
    expect((await handler(withQuery)).status).toBe(400);
    expect((await handler(request('PUT'))).status).toBe(400);
  });
});
