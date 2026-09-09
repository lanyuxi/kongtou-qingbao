import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  buildWatchlistAddProjectInput,
  buildWatchlistCreateInput,
  buildWatchlistRemoveInput,
  buildWatchlistRenameInput,
  canRemoveWatchlist,
  defaultWatchlistOf,
  submitWatchlistCreateOnce,
  submitWatchlistRemove,
  submitWatchlistRenameOnce,
  WatchlistManager,
  watchlistSubmissionFailure,
  type WatchlistDraft,
} from '../components/execution/watchlist-manager.js';
import type { ExecutionApiClient } from '../lib/execution-api-client.js';

const watchlistId = '50000000-0000-4000-8000-000000000002';
const otherId = '50000000-0000-4000-8000-000000000012';
const projectId = '50000000-0000-4000-8000-000000000003';

const defaultList = {
  watchlistId,
  name: '默认关注',
  isDefault: true,
  projectCount: 1,
  version: 1,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
} as const;

const customList = {
  watchlistId: otherId,
  name: '空投日历',
  isDefault: false,
  projectCount: 0,
  version: 3,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
} as const;

const allLists = [defaultList, customList] as never;

function apiClient(options: {
  readonly failWith?: string;
} = {}): ExecutionApiClient {
  return {
    listTasks: async () => ({ ok: true, data: [] }),
    createTask: async () => ({ ok: false, code: 'execution_command_invalid' }),
    updateTask: async () => ({ ok: false, code: 'execution_command_invalid' }),
    removeTask: async () => ({ ok: false, code: 'execution_command_invalid' }),
    listWatchlists: async () => ({ ok: true, data: allLists }),
    createWatchlist: async () => (
      options.failWith
        ? { ok: false, code: options.failWith as never }
        : { ok: true, data: {
          version: 1, commandId: otherId, replayed: false, watchlistId: otherId, watchlistVersion: 1,
        } }
    ),
    renameWatchlist: async () => (
      options.failWith
        ? { ok: false, code: options.failWith as never }
        : { ok: true, data: {
          version: 1, commandId: otherId, replayed: false, watchlistId: otherId, watchlistVersion: 4,
        } }
    ),
    removeWatchlist: async () => ({ ok: true, data: {
      version: 1, commandId: otherId, replayed: false, watchlistId: otherId, watchlistVersion: 4,
    } }),
    listWatchlistProjects: async () => ({ ok: true, data: [
      { watchlistId, projectId, addedAt: '2026-09-08T00:00:00.000Z' },
    ] }),
    addWatchlistProject: async () => ({ ok: true, data: {
      version: 1, commandId: watchlistId, replayed: false, watchlistId, watchlistVersion: 2,
    } }),
    removeWatchlistProject: async () => ({ ok: true, data: {
      version: 1, commandId: watchlistId, replayed: false, watchlistId, watchlistVersion: 3,
    } }),
    getParticipation: async () => ({ ok: false, code: 'execution_project_not_found' }),
    setParticipation: async () => ({ ok: true, data: {
      version: 1, commandId: projectId, replayed: false, projectId,
    } }),
  };
}

const gate = () => ({ begin: () => true, finish: () => {} });

describe('watchlist manager contract', () => {
  it('always finds the default list the trigger guarantees', () => {
    expect(defaultWatchlistOf(allLists)).toEqual(defaultList);
    expect(defaultWatchlistOf([customList] as never)).toBeNull();
    expect(defaultWatchlistOf([])).toBeNull();
  });

  it('builds a create command from the trimmed draft alone', () => {
    const draft: WatchlistDraft = { name: '  空投日历  ' };
    expect(buildWatchlistCreateInput(draft)).toEqual({ name: '空投日历' });
  });

  it('builds a rename command against the projected version', () => {
    const input = buildWatchlistRenameInput(customList as never, { name: '新名字' });
    expect(Object.keys(input).sort()).toEqual([
      'expectedVersion',
      'name',
      'watchlistId',
    ]);
    expect(input).toEqual({ watchlistId: otherId, expectedVersion: 3, name: '新名字' });
  });

  it('builds a remove command against the projected version', () => {
    expect(buildWatchlistRemoveInput(customList as never)).toEqual({
      watchlistId: otherId,
      expectedVersion: 3,
    });
    expect(buildWatchlistAddProjectInput(defaultList as never, projectId)).toEqual({
      watchlistId,
      expectedVersion: 1,
      projectId,
    });
  });

  it('never lets a secret-like draft field reach the command', async () => {
    const client = apiClient();
    const spy = { seen: undefined as unknown };
    const wrapped: ExecutionApiClient = {
      ...client,
      createWatchlist: async (input) => { spy.seen = input; return client.createWatchlist(input); },
    };
    const draft = {
      name: '带私钥匙的列表',
      ...({ privateKey: '0xdeadbeef' } as Record<string, unknown>),
    } as never;
    const result = await submitWatchlistCreateOnce(gate(), {
      api: wrapped,
      draft,
      onReload: async () => {},
    });
    expect(result.status).toBe('failed');
    expect(result).toMatchObject({ code: 'execution_command_invalid' });
    expect(spy.seen).toBeUndefined();
  });

  it('refuses to delete the default list before any request is made', async () => {
    expect(canRemoveWatchlist(defaultList as never)).toBe(false);
    expect(canRemoveWatchlist(customList as never)).toBe(true);
    const client = apiClient();
    const spy = { seen: 0 };
    const wrapped: ExecutionApiClient = {
      ...client,
      removeWatchlist: async (input) => {
        spy.seen += 1;
        return client.removeWatchlist(input);
      },
    };
    const result = await submitWatchlistRemove({
      api: wrapped,
      watchlist: defaultList as never,
      onReload: async () => {},
    });
    expect(result.status).toBe('failed');
    expect(result).toMatchObject({ code: 'execution_command_invalid' });
    expect(spy.seen).toBe(0);
  });

  it('maps duplicate names and limits to the conflict state, never by message text', () => {
    expect(watchlistSubmissionFailure('execution_name_conflict')).toEqual({
      status: 'conflict',
      code: 'execution_name_conflict',
    });
    expect(watchlistSubmissionFailure('execution_watchlist_limit_reached')).toEqual({
      status: 'conflict',
      code: 'execution_watchlist_limit_reached',
    });
    expect(watchlistSubmissionFailure('execution_watchlist_project_limit_reached')).toEqual({
      status: 'conflict',
      code: 'execution_watchlist_project_limit_reached',
    });
    expect(watchlistSubmissionFailure('execution_version_conflict')).toEqual({
      status: 'conflict',
      code: 'execution_version_conflict',
    });
    expect(watchlistSubmissionFailure('execution_command_invalid')).toEqual({
      status: 'failed',
      code: 'execution_command_invalid',
    });
  });

  it('reports a session that expired during a rename', async () => {
    const result = await submitWatchlistRenameOnce(gate(), {
      api: apiClient({ failWith: 'execution_session_required' }),
      watchlist: customList as never,
      draft: { name: '新名字' },
      onReload: async () => {},
    });
    expect(result).toMatchObject({ status: 'session_required' });
  });

  it('surfaces a duplicate-name conflict as a conflict state', async () => {
    const result = await submitWatchlistCreateOnce(gate(), {
      api: apiClient({ failWith: 'execution_name_conflict' }),
      draft: { name: '重名列表' },
      onReload: async () => {},
    });
    expect(result).toMatchObject({ status: 'conflict', code: 'execution_name_conflict' });
  });
});

describe('watchlist manager rendering', () => {
  it('renders the default badge, counts, and never a pagination control', () => {
    const html = renderToStaticMarkup(
      createElement(WatchlistManager, {
        state: { status: 'ready', watchlists: allLists },
        api: apiClient(),
        onReload: async () => {},
      }),
    );
    expect(html).toContain('默认关注');
    expect(html).toContain('空投日历');
    expect(html).toContain('默认');
    expect(html).not.toContain('下一页');
    expect(html).not.toContain('page=');
  });

  it('renders the empty state', () => {
    const html = renderToStaticMarkup(
      createElement(WatchlistManager, {
        state: { status: 'ready', watchlists: [] },
        api: apiClient(),
        onReload: async () => {},
      }),
    );
    expect(html).toContain('还没有关注列表');
  });

  it('shows stable codes for sign-in and load failures', () => {
    const signIn = renderToStaticMarkup(
      createElement(WatchlistManager, {
        state: { status: 'sign_in_required' },
        api: apiClient(),
        onReload: async () => {},
      }),
    );
    expect(signIn).toContain('execution_session_required');

    const failed = renderToStaticMarkup(
      createElement(WatchlistManager, {
        state: { status: 'failed', code: 'execution_query_failed' },
        api: apiClient(),
        onReload: async () => {},
      }),
    );
    expect(failed).toContain('execution_query_failed');
  });
});
