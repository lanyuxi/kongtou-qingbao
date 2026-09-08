import { describe, expect, it } from 'vitest';

import {
  createExecutionParticipationRepositoryFromRpc,
  createExecutionTaskRepositoryFromRpc,
  createExecutionWatchlistRepositoryFromRpc,
  ExecutionRepositoryError,
  type ExecutionRpc,
  type ExecutionRpcCall,
} from '../execution/index.js';

const taskId = '70000000-0000-4000-8000-000000000001';
const watchlistId = '70000000-0000-4000-8000-000000000002';
const projectId = '70000000-0000-4000-8000-000000000003';
const userId = '70000000-0000-4000-8000-000000000004';
const commandId = '70000000-0000-4000-8000-000000000099';

const taskRow = {
  taskId,
  userId,
  projectId,
  title: '核对快照条件',
  status: 'in_progress',
  priority: 'high',
  dueAt: null,
  completedAt: null,
  version: 2,
  createdAt: '2026-09-06T09:00:00.000Z',
  updatedAt: '2026-09-06T09:30:00.000Z',
};

const watchlistRow = {
  watchlistId,
  name: '重点关注',
  isDefault: true,
  projectCount: 3,
  version: 2,
  createdAt: '2026-09-06T09:00:00.000Z',
  updatedAt: '2026-09-06T09:00:00.000Z',
};

const membershipRow = {
  watchlistId,
  projectId,
  addedAt: '2026-09-06T09:00:00.000Z',
};

const participationRow = {
  projectId,
  participationStatus: 'participating',
  notes: null,
  startedAt: '2026-09-06T09:00:00.000Z',
  updatedAt: '2026-09-06T09:00:00.000Z',
};

const createTaskCommand = {
  idempotencyKey: 'repo-task-create',
  expectedVersion: 1,
  projectId,
  title: '核对快照条件',
  status: 'backlog',
  priority: 'medium',
  dueAt: null,
} as const;

const updateTaskCommand = {
  idempotencyKey: 'repo-task-update',
  expectedVersion: 2,
  taskId,
  status: 'completed',
  completedAt: '2026-09-06T10:00:00.000Z',
} as const;

const receipt = {
  version: 1 as const,
  commandId,
  replayed: false,
  taskId,
  taskVersion: 2,
};

describe('Execution repositories', () => {
  it('sends the caller bearer to every owner-scoped read', async () => {
    const rpc = new RecordingRpc([[taskRow], [watchlistRow], [participationRow]]);
    const tasks = createExecutionTaskRepositoryFromRpc(rpc);
    const watchlists = createExecutionWatchlistRepositoryFromRpc(rpc);
    const participation = createExecutionParticipationRepositoryFromRpc(rpc);

    await expect(tasks.listMine({ accessToken: 'caller-token' })).resolves.toEqual([taskRow]);
    await expect(watchlists.listMine({ accessToken: 'caller-token' })).resolves.toEqual([
      watchlistRow,
    ]);
    await expect(
      participation.getMine({ accessToken: 'caller-token', projectId }),
    ).resolves.toEqual(participationRow);

    expect(rpc.calls).toEqual([
      { accessToken: 'caller-token', functionName: 'list_my_execution_tasks', args: {} },
      { accessToken: 'caller-token', functionName: 'list_my_watchlists', args: {} },
      {
        accessToken: 'caller-token',
        functionName: 'get_my_participation',
        args: { p_project_id: projectId },
      },
    ]);
  });

  it('scopes membership reads to the named watchlist through the caller bearer', async () => {
    const rpc = new RecordingRpc([[membershipRow]]);
    const watchlists = createExecutionWatchlistRepositoryFromRpc(rpc);

    await expect(
      watchlists.listProjects({ accessToken: 'caller-token', watchlistId }),
    ).resolves.toEqual([membershipRow]);
    expect(rpc.calls).toEqual([
      {
        accessToken: 'caller-token',
        functionName: 'list_my_watchlist_projects',
        args: { p_watchlist_id: watchlistId },
      },
    ]);
  });

  it('fails closed when a read is attempted without a token', async () => {
    const rpc = new RecordingRpc([[taskRow]]);
    const tasks = createExecutionTaskRepositoryFromRpc(rpc);

    await expect(tasks.listMine({ accessToken: '  ' })).rejects.toThrow(
      ExecutionRepositoryError,
    );
    await expect(tasks.listMine({ accessToken: '  ' })).rejects.toMatchObject({
      code: 'execution_session_required',
    });
    expect(rpc.calls).toHaveLength(0);
  });

  it('routes every task mutation through its protected command with the exact payload', async () => {
    const rpc = new RecordingRpc([receipt, receipt, receipt]);
    const tasks = createExecutionTaskRepositoryFromRpc(rpc);

    await expect(
      tasks.create({ accessToken: 'caller-token', command: createTaskCommand }),
    ).resolves.toEqual(receipt);
    await expect(
      tasks.update({ accessToken: 'caller-token', command: updateTaskCommand }),
    ).resolves.toEqual(receipt);
    await expect(
      tasks.remove({
        accessToken: 'caller-token',
        command: {
          idempotencyKey: 'repo-task-delete',
          expectedVersion: 3,
          taskId,
        },
      }),
    ).resolves.toEqual(receipt);

    expect(rpc.calls).toEqual([
      {
        accessToken: 'caller-token',
        functionName: 'submit_create_task',
        args: { p_payload: createTaskCommand },
      },
      {
        accessToken: 'caller-token',
        functionName: 'submit_update_task',
        args: { p_payload: updateTaskCommand },
      },
      {
        accessToken: 'caller-token',
        functionName: 'submit_delete_task',
        args: {
          p_payload: {
            idempotencyKey: 'repo-task-delete',
            expectedVersion: 3,
            taskId,
          },
        },
      },
    ]);
  });

  it('routes every watchlist mutation through its protected command', async () => {
    const listReceipt = {
      version: 1 as const,
      commandId,
      replayed: false,
      watchlistId,
      watchlistVersion: 2,
    };
    const rpc = new RecordingRpc([
      listReceipt,
      listReceipt,
      listReceipt,
      listReceipt,
      listReceipt,
    ]);
    const watchlists = createExecutionWatchlistRepositoryFromRpc(rpc);

    await watchlists.create({
      accessToken: 'caller-token',
      command: {
        idempotencyKey: 'repo-list-create',
        expectedVersion: 1,
        name: '长期观察',
      },
    });
    await watchlists.rename({
      accessToken: 'caller-token',
      command: {
        idempotencyKey: 'repo-list-rename',
        expectedVersion: 1,
        watchlistId,
        name: '长期观察二',
      },
    });
    await watchlists.remove({
      accessToken: 'caller-token',
      command: {
        idempotencyKey: 'repo-list-delete',
        expectedVersion: 2,
        watchlistId,
      },
    });
    await watchlists.addProject({
      accessToken: 'caller-token',
      command: {
        idempotencyKey: 'repo-list-add',
        expectedVersion: 2,
        watchlistId,
        projectId,
      },
    });
    await watchlists.removeProject({
      accessToken: 'caller-token',
      command: {
        idempotencyKey: 'repo-list-remove',
        expectedVersion: 3,
        watchlistId,
        projectId,
      },
    });

    expect(rpc.calls.map((call) => call.functionName)).toEqual([
      'submit_create_watchlist',
      'submit_rename_watchlist',
      'submit_delete_watchlist',
      'submit_add_watchlist_project',
      'submit_remove_watchlist_project',
    ]);
    expect(rpc.calls.every((call) => call.accessToken === 'caller-token')).toBe(true);
  });

  it('routes participation changes through the protected command', async () => {
    const rpc = new RecordingRpc([
      {
        version: 1 as const,
        commandId,
        replayed: false,
        projectId,
      },
    ]);
    const participation = createExecutionParticipationRepositoryFromRpc(rpc);

    await expect(
      participation.set({
        accessToken: 'caller-token',
        command: {
          idempotencyKey: 'repo-participation',
          expectedVersion: 1,
          projectId,
          participationStatus: 'participating',
          notes: null,
        },
      }),
    ).resolves.toEqual({ version: 1, commandId, replayed: false, projectId });
    expect(rpc.calls).toEqual([
      {
        accessToken: 'caller-token',
        functionName: 'submit_set_participation_status',
        args: {
          p_payload: {
            idempotencyKey: 'repo-participation',
            expectedVersion: 1,
            projectId,
            participationStatus: 'participating',
            notes: null,
          },
        },
      },
    ]);
  });

  it('refuses a command that carries a secret-like field instead of sending it', async () => {
    const rpc = new RecordingRpc([receipt]);
    const tasks = createExecutionTaskRepositoryFromRpc(rpc);

    await expect(
      tasks.create({
        accessToken: 'caller-token',
        command: { ...createTaskCommand, privateKey: '0xdeadbeef' } as never,
      }),
    ).rejects.toMatchObject({ code: 'execution_command_invalid' });
    expect(rpc.calls).toHaveLength(0);
  });

  it('refuses a command with an unknown field instead of sending it', async () => {
    const rpc = new RecordingRpc([receipt]);
    const tasks = createExecutionTaskRepositoryFromRpc(rpc);

    await expect(
      tasks.create({
        accessToken: 'caller-token',
        command: { ...createTaskCommand, unexpected: 'x' } as never,
      }),
    ).rejects.toMatchObject({ code: 'execution_command_invalid' });
    expect(rpc.calls).toHaveLength(0);
  });

  it('maps database error codes back to their contract codes', async () => {
    const cases: readonly (readonly [string, string])[] = [
      ['EX201', 'execution_session_required'],
      ['EX202', 'execution_task_not_found'],
      ['EX203', 'execution_watchlist_not_found'],
      ['EX204', 'execution_project_not_found'],
      ['EX205', 'execution_task_limit_reached'],
      ['EX206', 'execution_watchlist_limit_reached'],
      ['EX207', 'execution_watchlist_project_limit_reached'],
      ['EX208', 'execution_name_conflict'],
      ['EX209', 'execution_version_conflict'],
      ['EX210', 'execution_idempotency_conflict'],
      ['EX211', 'execution_command_invalid'],
      ['EX299', 'execution_persistence_failed'],
    ];

    for (const [state, code] of cases) {
      const rpc = new RecordingRpc([{ code: state }]);
      const tasks = createExecutionTaskRepositoryFromRpc(rpc);
      await expect(
        tasks.create({ accessToken: 'caller-token', command: createTaskCommand }),
      ).rejects.toMatchObject({ code });
    }
  });

  it('falls back to persistence failure for an unknown mutation error', async () => {
    const rpc = new RecordingRpc([new Error('boom')]);
    const tasks = createExecutionTaskRepositoryFromRpc(rpc);

    await expect(
      tasks.create({ accessToken: 'caller-token', command: createTaskCommand }),
    ).rejects.toMatchObject({ code: 'execution_persistence_failed' });
  });

  it('falls back to query failure for an unknown read error', async () => {
    const rpc = new RecordingRpc([new Error('boom')]);
    const tasks = createExecutionTaskRepositoryFromRpc(rpc);

    await expect(tasks.listMine({ accessToken: 'caller-token' })).rejects.toMatchObject({
      code: 'execution_query_failed',
    });
  });

  it('rejects a projection that would leak fields beyond the contract', async () => {
    const rpc = new RecordingRpc([
      [{ ...taskRow, ownerEmail: 'leak@example.invalid' }],
      [{ ...watchlistRow, ownerEmail: 'leak@example.invalid' }],
      [{ ...membershipRow, notes: 'leak' }],
      [{ ...participationRow, userEmail: 'leak@example.invalid' }],
    ]);
    const tasks = createExecutionTaskRepositoryFromRpc(rpc);
    const watchlists = createExecutionWatchlistRepositoryFromRpc(rpc);
    const participation = createExecutionParticipationRepositoryFromRpc(rpc);

    // Every projection is parsed against its strict schema, and a row that
    // would leak a field is rejected: the caller never sees the extra column.
    await expect(tasks.listMine({ accessToken: 't' })).rejects.toMatchObject({
      code: 'execution_query_failed',
    });
    await expect(watchlists.listMine({ accessToken: 't' })).rejects.toMatchObject({
      code: 'execution_query_failed',
    });
    await expect(
      watchlists.listProjects({ accessToken: 't', watchlistId }),
    ).rejects.toMatchObject({ code: 'execution_query_failed' });
    await expect(
      participation.getMine({ accessToken: 't', projectId }),
    ).rejects.toMatchObject({ code: 'execution_query_failed' });
  });

  it('reports a missing participation row as not-found rather than undefined', async () => {
    const rpc = new RecordingRpc([[]]);
    const participation = createExecutionParticipationRepositoryFromRpc(rpc);

    await expect(
      participation.getMine({ accessToken: 't', projectId }),
    ).rejects.toMatchObject({ code: 'execution_project_not_found' });
  });

  it('treats an empty owner read as an empty list, never as a fabricated row', async () => {
    const rpc = new RecordingRpc([[]]);
    const tasks = createExecutionTaskRepositoryFromRpc(rpc);

    await expect(tasks.listMine({ accessToken: 'other-token' })).resolves.toEqual([]);
  });
});

class RecordingRpc implements ExecutionRpc {
  readonly calls: ExecutionRpcCall[] = [];

  constructor(private readonly results: unknown[]) {}

  async invoke(call: ExecutionRpcCall): Promise<unknown> {
    this.calls.push(call);
    const result = this.results.shift();
    if (result instanceof Error || isRecordWithCode(result)) throw result;
    return result;
  }
}

function isRecordWithCode(value: unknown): value is { readonly code: string } {
  return typeof value === 'object' && value !== null && 'code' in value;
}
