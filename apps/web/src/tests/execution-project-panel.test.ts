import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  buildParticipationSetInput,
  participationSubmissionFailure,
  ProjectExecutionPanel,
  submitParticipationSet,
  submitWatchlistToggle,
  type ParticipationDraft,
  participationStatuses,
} from '../components/execution/project-execution-panel.js';
import { defaultWatchlistOf } from '../components/execution/watchlist-manager.js';
import type { ExecutionApiClient } from '../lib/execution-api-client.js';

const projectId = '50000000-0000-4000-8000-000000000003';
const watchlistId = '50000000-0000-4000-8000-000000000002';
const otherId = '50000000-0000-4000-8000-000000000012';

const defaultList = {
  watchlistId,
  name: '默认关注',
  isDefault: true,
  projectCount: 0,
  version: 1,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
} as const;

const customList = {
  watchlistId: otherId,
  name: '空投日历',
  isDefault: false,
  projectCount: 0,
  version: 1,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
} as const;

const participation = {
  projectId,
  participationStatus: 'researching',
  notes: '先观察快照规则',
  startedAt: null,
  updatedAt: '2026-09-08T00:00:00.000Z',
  version: 2,
} as const;

function apiClient(options: {
  readonly failWith?: string;
} = {}): ExecutionApiClient {
  return {
    listTasks: async () => ({ ok: true, data: [] }),
    createTask: async () => ({ ok: false, code: 'execution_command_invalid' }),
    updateTask: async () => ({ ok: false, code: 'execution_command_invalid' }),
    removeTask: async () => ({ ok: false, code: 'execution_command_invalid' }),
    listWatchlists: async () => ({ ok: true, data: [defaultList, customList] as never }),
    createWatchlist: async () => ({ ok: false, code: 'execution_command_invalid' }),
    renameWatchlist: async () => ({ ok: false, code: 'execution_command_invalid' }),
    removeWatchlist: async () => ({ ok: false, code: 'execution_command_invalid' }),
    listWatchlistProjects: async () => ({ ok: true, data: [] }),
    addWatchlistProject: async () => (
      options.failWith
        ? { ok: false, code: options.failWith as never }
        : { ok: true, data: {
          version: 1, commandId: watchlistId, replayed: false, watchlistId, watchlistVersion: 2,
        } }
    ),
    removeWatchlistProject: async () => ({ ok: true, data: {
      version: 1, commandId: watchlistId, replayed: false, watchlistId, watchlistVersion: 2,
    } }),
    getParticipation: async () => ({ ok: true, data: participation as never }),
    setParticipation: async () => (
      options.failWith
        ? { ok: false, code: options.failWith as never }
        : { ok: true, data: { version: 1, commandId: projectId, replayed: false, projectId } }
    ),
  };
}

describe('project execution panel contract', () => {
  it('offers every participation status the database accepts', () => {
    expect(participationStatuses).toEqual([
      'interested',
      'researching',
      'participating',
      'paused',
      'completed',
      'abandoned',
    ]);
  });

  it('builds a first participation command at version one', () => {
    const draft: ParticipationDraft = { status: 'participating', notes: '  小额参与  ' };
    const input = buildParticipationSetInput(projectId, draft, null);
    expect(input).toEqual({
      projectId,
      participationStatus: 'participating',
      notes: '小额参与',
      expectedVersion: 1,
    });
  });

  it('builds a repeat participation command from the projected version', () => {
    const draft: ParticipationDraft = { status: 'paused', notes: null };
    const input = buildParticipationSetInput(projectId, draft, participation as never);
    expect(input.expectedVersion).toBe(2);
    expect(input).toEqual({
      projectId,
      participationStatus: 'paused',
      notes: null,
      expectedVersion: 2,
    });
  });

  it('rejects secret-like draft fields before any request is made', async () => {
    const client = apiClient();
    const spy = { seen: undefined as unknown };
    const wrapped: ExecutionApiClient = {
      ...client,
      setParticipation: async (input) => { spy.seen = input; return client.setParticipation(input); },
    };
    const draft = {
      status: 'participating',
      notes: null,
      ...({ privateKey: '0xdeadbeef' } as Record<string, unknown>),
    } as never;
    const result = await submitParticipationSet({
      api: wrapped,
      projectId,
      draft,
      participation: null,
      onReload: async () => {},
    });
    expect(result.status).toBe('failed');
    expect(result).toMatchObject({ code: 'execution_command_invalid' });
    expect(spy.seen).toBeUndefined();
  });

  it('submits exactly the allowed participation fields', async () => {
    const client = apiClient();
    const spy = { seen: undefined as unknown };
    const wrapped: ExecutionApiClient = {
      ...client,
      setParticipation: async (input) => { spy.seen = input; return client.setParticipation(input); },
    };
    const result = await submitParticipationSet({
      api: wrapped,
      projectId,
      draft: { status: 'participating', notes: null },
      participation: null,
      onReload: async () => {},
    });
    expect(result.status).toBe('saved');
    expect(Object.keys(spy.seen as object).sort()).toEqual([
      'expectedVersion',
      'notes',
      'participationStatus',
      'projectId',
    ]);
    expect(spy.seen).toMatchObject({ projectId, participationStatus: 'participating' });
  });

  it('rejects an oversized or empty participation draft in the browser', async () => {
    const client = apiClient();
    const spy = { seen: 0 };
    const wrapped: ExecutionApiClient = {
      ...client,
      setParticipation: async (input) => {
        spy.seen += 1;
        return client.setParticipation(input);
      },
    };
    const tooLong = await submitParticipationSet({
      api: wrapped,
      projectId,
      draft: { status: 'participating', notes: 'x'.repeat(4001) },
      participation: null,
      onReload: async () => {},
    });
    expect(tooLong.status).toBe('failed');
    expect(tooLong).toMatchObject({ code: 'execution_command_invalid' });

    const blank = await submitParticipationSet({
      api: wrapped,
      projectId,
      draft: { status: '   ', notes: null },
      participation: null,
      onReload: async () => {},
    });
    expect(blank.status).toBe('failed');
    expect(spy.seen).toBe(0);
  });

  it('adds the project to the default list the trigger guarantees', async () => {
    const client = apiClient();
    const spy = { seen: undefined as unknown };
    const wrapped: ExecutionApiClient = {
      ...client,
      addWatchlistProject: async (input) => {
        spy.seen = input;
        return client.addWatchlistProject(input);
      },
    };
    const result = await submitWatchlistToggle({
      api: wrapped,
      watchlists: [defaultList, customList] as never,
      projectId,
      onReload: async () => {},
    });
    expect(result.status).toBe('saved');
    expect(defaultWatchlistOf([defaultList, customList] as never)).toEqual(defaultList);
    expect(spy.seen).toEqual({
      watchlistId,
      expectedVersion: 1,
      projectId,
    });
  });

  it('fails closed when no default list exists', async () => {
    const client = apiClient();
    const spy = { seen: 0 };
    const wrapped: ExecutionApiClient = {
      ...client,
      addWatchlistProject: async (input) => {
        spy.seen += 1;
        return client.addWatchlistProject(input);
      },
    };
    const result = await submitWatchlistToggle({
      api: wrapped,
      watchlists: [] as never,
      projectId,
      onReload: async () => {},
    });
    expect(result.status).toBe('failed');
    expect(result).toMatchObject({ code: 'execution_command_invalid' });
    expect(spy.seen).toBe(0);
  });

  it('maps membership limits and version conflicts to the conflict state', () => {
    expect(participationSubmissionFailure('execution_watchlist_project_limit_reached')).toEqual({
      status: 'conflict',
      code: 'execution_watchlist_project_limit_reached',
    });
    expect(participationSubmissionFailure('execution_version_conflict')).toEqual({
      status: 'conflict',
      code: 'execution_version_conflict',
    });
    expect(participationSubmissionFailure('execution_command_invalid')).toEqual({
      status: 'failed',
      code: 'execution_command_invalid',
    });
  });
});

describe('project execution panel rendering', () => {
  it('renders the participation select and the watch action when ready', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectExecutionPanel, {
        projectId,
        state: {
          status: 'ready',
          watchlists: [defaultList, customList] as never,
          participation: participation as never,
        },
        api: apiClient(),
        onReload: async () => {},
      }),
    );
    expect(html).toContain('参与状态');
    expect(html).toContain('researching');
    expect(html).toContain('加入默认关注');
    expect(html).toContain('先观察快照规则');
  });

  it('shows stable codes for the sign-in and failure states', () => {
    const signIn = renderToStaticMarkup(
      createElement(ProjectExecutionPanel, {
        projectId,
        state: { status: 'sign_in_required' },
        api: apiClient(),
        onReload: async () => {},
      }),
    );
    expect(signIn).toContain('execution_session_required');

    const failed = renderToStaticMarkup(
      createElement(ProjectExecutionPanel, {
        projectId,
        state: { status: 'failed', code: 'execution_query_failed' },
        api: apiClient(),
        onReload: async () => {},
      }),
    );
    expect(failed).toContain('execution_query_failed');
  });
});
