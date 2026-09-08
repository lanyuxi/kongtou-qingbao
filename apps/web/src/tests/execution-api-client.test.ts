import { describe, expect, it } from 'vitest';

import {
  createExecutionApiClient,
  type ExecutionApiClient,
} from '../lib/execution-api-client.js';

const projectId = '50000000-0000-4000-8000-000000000003';
const watchlistId = '50000000-0000-4000-8000-000000000002';
const taskId = '50000000-0000-4000-8000-000000000001';
const idempotencyKey = 'idempotency-key-00000001';

const watchlistRow = {
  watchlistId,
  name: '默认关注',
  isDefault: true,
  projectCount: 0,
  version: 1,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};

const participationRow = {
  projectId,
  participationStatus: 'interested',
  notes: null,
  startedAt: null,
  updatedAt: '2026-09-08T00:00:00.000Z',
  version: 1,
};

const taskRow = {
  taskId,
  userId: '50000000-0000-4000-8000-000000000004',
  projectId: null,
  title: '核对快照条件',
  status: 'backlog',
  priority: 'medium',
  dueAt: null,
  completedAt: null,
  version: 1,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};

const requestId = '50000000-0000-4000-8000-000000000009';

function successBody(data: unknown) {
  return { ok: true, data, meta: { requestId, nextCursor: null } };
}

function errorBody(code: string) {
  return {
    ok: false,
    error: { code, message: 'x', requestId, details: null },
  };
}

interface RecordedCall {
  readonly input: string;
  readonly init: RequestInit;
}

function harness(options: {
  readonly status?: number;
  readonly body?: unknown;
} = {}): {
  readonly api: ExecutionApiClient;
  readonly calls: readonly RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify(options.body ?? successBody([])), {
      status: options.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;
  const api = createExecutionApiClient({
    session: { getAccessToken: async () => 'token-1' },
    fetch: fetchImpl,
    ids: { generate: () => idempotencyKey },
  });
  return { api, calls };
}

function sentJson(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

// The client builds a Headers instance; vitest's toMatchObject cannot read it,
// so the assertions flatten it first.
function sentHeaders(call: RecordedCall): Record<string, string> {
  return Object.fromEntries(new Headers(call.init.headers).entries());
}

function firstCall(calls: readonly RecordedCall[]): RecordedCall {
  const call = calls[0];
  if (call === undefined) throw new Error('no request was recorded');
  return call;
}

describe('execution api client commands', () => {
  it('sends a complete create-task command, version included, before any key exists', async () => {
    const { api, calls } = harness({ body: successBody({
      version: 1,
      commandId: taskId,
      replayed: false,
      taskId,
      taskVersion: 1,
    }) });
    const result = await api.createTask({
      projectId: null,
      title: '核对快照条件',
      status: 'backlog',
      priority: 'medium',
      dueAt: null,
    });
    expect(result).toEqual({ ok: true, data: {
      version: 1, commandId: taskId, replayed: false, taskId, taskVersion: 1,
    } });
    expect(calls).toHaveLength(1);
    expect(firstCall(calls).input).toBe('/api/v1/execution/tasks');
    expect(firstCall(calls).init.method).toBe('POST');
    expect(sentHeaders(firstCall(calls))).toMatchObject({
      authorization: 'Bearer token-1',
      'idempotency-key': idempotencyKey,
    });
    expect(sentJson(firstCall(calls))).toEqual({
      idempotencyKey,
      expectedVersion: 1,
      projectId: null,
      title: '核对快照条件',
      status: 'backlog',
      priority: 'medium',
      dueAt: null,
    });
  });

  it('sends a complete create-watchlist command with the trimmed name', async () => {
    const { api, calls } = harness({ body: successBody({
      version: 1,
      commandId: watchlistId,
      replayed: false,
      watchlistId,
      watchlistVersion: 1,
    }) });
    const result = await api.createWatchlist({ name: '  空投日历  ' });
    expect(result).toEqual({ ok: true, data: {
      version: 1, commandId: watchlistId, replayed: false, watchlistId, watchlistVersion: 1,
    } });
    expect(firstCall(calls).input).toBe('/api/v1/execution/watchlists');
    expect(firstCall(calls).init.method).toBe('POST');
    expect(sentJson(firstCall(calls))).toEqual({
      idempotencyKey,
      expectedVersion: 1,
      name: '空投日历',
    });
  });

  it('rejects secret-like fields in the browser with zero requests', async () => {
    const { api, calls } = harness();
    const result = await api.createWatchlist({
      name: '带私钥匙的列表',
      ...({ privateKey: '0xdeadbeef' } as unknown as Record<string, never>),
    } as never);
    expect(result).toEqual({ ok: false, code: 'execution_command_invalid' });
    expect(calls).toHaveLength(0);
  });
});

describe('execution api client watchlist reads and writes', () => {
  it('lists watchlists with the bearer token', async () => {
    const { api, calls } = harness({ body: successBody([watchlistRow]) });
    const result = await api.listWatchlists();
    expect(result).toEqual({ ok: true, data: [watchlistRow] });
    expect(firstCall(calls).input).toBe('/api/v1/execution/watchlists');
    expect(firstCall(calls).init.method).toBe('GET');
    expect(sentHeaders(firstCall(calls))).toMatchObject({ authorization: 'Bearer token-1' });
  });

  it('renames a watchlist against the projected version', async () => {
    const { api, calls } = harness({ body: successBody({
      version: 1, commandId: watchlistId, replayed: false, watchlistId, watchlistVersion: 2,
    }) });
    const result = await api.renameWatchlist({
      watchlistId,
      expectedVersion: 2,
      name: '新名字',
    });
    expect(result.ok).toBe(true);
    expect(firstCall(calls).input).toBe(`/api/v1/execution/watchlists/${watchlistId}`);
    expect(firstCall(calls).init.method).toBe('PATCH');
    expect(sentJson(firstCall(calls))).toEqual({
      idempotencyKey,
      expectedVersion: 2,
      watchlistId,
      name: '新名字',
    });
  });

  it('removes a watchlist with a DELETE carrying the version', async () => {
    const { api, calls } = harness({ body: successBody({
      version: 1, commandId: watchlistId, replayed: false, watchlistId, watchlistVersion: 2,
    }) });
    const result = await api.removeWatchlist({ watchlistId, expectedVersion: 2 });
    expect(result.ok).toBe(true);
    expect(firstCall(calls).input).toBe(`/api/v1/execution/watchlists/${watchlistId}`);
    expect(firstCall(calls).init.method).toBe('DELETE');
    expect(sentJson(firstCall(calls))).toEqual({
      idempotencyKey,
      expectedVersion: 2,
      watchlistId,
    });
  });

  it('lists the projects of one watchlist', async () => {
    const row = { watchlistId, projectId, addedAt: '2026-09-08T00:00:00.000Z' };
    const { api, calls } = harness({ body: successBody([row]) });
    const result = await api.listWatchlistProjects({ watchlistId });
    expect(result).toEqual({ ok: true, data: [row] });
    expect(firstCall(calls).input).toBe(`/api/v1/execution/watchlists/${watchlistId}`);
    expect(firstCall(calls).init.method).toBe('GET');
  });

  it('adds a project to a watchlist with PUT and the pair alone', async () => {
    const { api, calls } = harness({ body: successBody({
      version: 1, commandId: watchlistId, replayed: false, watchlistId, watchlistVersion: 2,
    }) });
    const result = await api.addWatchlistProject({
      watchlistId,
      expectedVersion: 1,
      projectId,
    });
    expect(result.ok).toBe(true);
    expect(firstCall(calls).input).toBe(
      `/api/v1/execution/watchlists/${watchlistId}/projects/${projectId}`,
    );
    expect(firstCall(calls).init.method).toBe('PUT');
    expect(sentJson(firstCall(calls))).toEqual({
      idempotencyKey,
      expectedVersion: 1,
      watchlistId,
      projectId,
    });
  });

  it('removes a project from a watchlist with DELETE', async () => {
    const { api, calls } = harness({ body: successBody({
      version: 1, commandId: watchlistId, replayed: false, watchlistId, watchlistVersion: 3,
    }) });
    const result = await api.removeWatchlistProject({
      watchlistId,
      expectedVersion: 2,
      projectId,
    });
    expect(result.ok).toBe(true);
    expect(firstCall(calls).input).toBe(
      `/api/v1/execution/watchlists/${watchlistId}/projects/${projectId}`,
    );
    expect(firstCall(calls).init.method).toBe('DELETE');
    expect(sentJson(firstCall(calls))).toEqual({
      idempotencyKey,
      expectedVersion: 2,
      watchlistId,
      projectId,
    });
  });
});

describe('execution api client participation', () => {
  it('reads my participation for one project', async () => {
    const { api, calls } = harness({ body: successBody(participationRow) });
    const result = await api.getParticipation({ projectId });
    expect(result).toEqual({ ok: true, data: participationRow });
    expect(firstCall(calls).input).toBe(`/api/v1/execution/projects/${projectId}/participation`);
    expect(firstCall(calls).init.method).toBe('GET');
  });

  it('sets participation with exactly the allowed fields', async () => {
    const { api, calls } = harness({ body: successBody({
      version: 1, commandId: projectId, replayed: false, projectId,
    }) });
    const result = await api.setParticipation({
      projectId,
      expectedVersion: 2,
      participationStatus: 'participating',
      notes: '记录参与的池子',
    });
    expect(result.ok).toBe(true);
    expect(firstCall(calls).input).toBe(`/api/v1/execution/projects/${projectId}/participation`);
    expect(firstCall(calls).init.method).toBe('PUT');
    expect(Object.keys(sentJson(firstCall(calls))).sort()).toEqual([
      'expectedVersion',
      'idempotencyKey',
      'notes',
      'participationStatus',
      'projectId',
    ]);
    expect(sentJson(firstCall(calls))).toEqual({
      idempotencyKey,
      expectedVersion: 2,
      projectId,
      participationStatus: 'participating',
      notes: '记录参与的池子',
    });
  });

  it('passes a not-found project through on the participation read', async () => {
    const { api } = harness({ status: 404, body: errorBody('execution_project_not_found') });
    const result = await api.getParticipation({ projectId });
    expect(result).toEqual({ ok: false, code: 'execution_project_not_found' });
  });

  it('passes watchlist limit and name conflicts through by code', async () => {
    const limited = harness({
      status: 409,
      body: errorBody('execution_watchlist_limit_reached'),
    });
    expect(await limited.api.createWatchlist({ name: '第二十个列表' }))
      .toEqual({ ok: false, code: 'execution_watchlist_limit_reached' });

    const renamed = harness({
      status: 409,
      body: errorBody('execution_name_conflict'),
    });
    expect(await renamed.api.renameWatchlist({
      watchlistId,
      expectedVersion: 1,
      name: '重名',
    })).toEqual({ ok: false, code: 'execution_name_conflict' });

    const membership = harness({
      status: 409,
      body: errorBody('execution_watchlist_project_limit_reached'),
    });
    expect(await membership.api.addWatchlistProject({
      watchlistId,
      expectedVersion: 1,
      projectId,
    })).toEqual({ ok: false, code: 'execution_watchlist_project_limit_reached' });

    const conflict = harness({
      status: 409,
      body: errorBody('execution_version_conflict'),
    });
    expect(await conflict.api.setParticipation({
      projectId,
      expectedVersion: 1,
      participationStatus: 'paused',
      notes: null,
    })).toEqual({ ok: false, code: 'execution_version_conflict' });
  });

  it('reports an expired session instead of a query failure', async () => {
    const { api } = harness({ status: 401, body: errorBody('execution_session_required') });
    const result = await api.listWatchlists();
    expect(result).toEqual({ ok: false, code: 'execution_session_required' });
  });
});

describe('execution api client task queries', () => {
  it('lists tasks and parses the rows', async () => {
    const { api, calls } = harness({ body: successBody([taskRow]) });
    const result = await api.listTasks();
    expect(result).toEqual({ ok: true, data: [taskRow] });
    expect(calls).toHaveLength(1);
    expect(firstCall(calls).input).toBe('/api/v1/execution/tasks');
    expect(firstCall(calls).init.method).toBe('GET');
  });
});
