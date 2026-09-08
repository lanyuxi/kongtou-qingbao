import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database, Json } from '../generated/database.types.js';
import {
  createExecutionParticipationRepository,
  createExecutionTaskRepository,
  createExecutionWatchlistRepository,
  ExecutionRepositoryError,
} from '../execution/index.js';

type PublicSchema = Database['public'];
type ExecutionFunctionOverrides = {
  list_my_execution_tasks: {
    Args: Record<PropertyKey, never>;
    Returns: Array<{
      taskId: string;
      userId: string;
      projectId: string | null;
      title: string;
      status: string;
      priority: string;
      dueAt: string | null;
      completedAt: string | null;
      version: number;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  list_my_watchlists: {
    Args: Record<PropertyKey, never>;
    Returns: Array<{
      watchlistId: string;
      name: string;
      isDefault: boolean;
      projectCount: number;
      version: number;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  list_my_watchlist_projects: {
    Args: { p_watchlist_id: string };
    Returns: Array<{ watchlistId: string; projectId: string; addedAt: string }>;
  };
  get_my_participation: {
    Args: { p_project_id: string };
    Returns: Array<{
      projectId: string;
      participationStatus: string;
      notes: string | null;
      startedAt: string | null;
      updatedAt: string;
      version: number;
    }>;
  };
  submit_create_task: { Args: { p_payload: Json }; Returns: Json };
  submit_update_task: { Args: { p_payload: Json }; Returns: Json };
  submit_delete_task: { Args: { p_payload: Json }; Returns: Json };
  submit_create_watchlist: { Args: { p_payload: Json }; Returns: Json };
  submit_rename_watchlist: { Args: { p_payload: Json }; Returns: Json };
  submit_delete_watchlist: { Args: { p_payload: Json }; Returns: Json };
  submit_add_watchlist_project: { Args: { p_payload: Json }; Returns: Json };
  submit_remove_watchlist_project: { Args: { p_payload: Json }; Returns: Json };
  submit_set_participation_status: { Args: { p_payload: Json }; Returns: Json };
};

type ExecutionDatabase = Omit<Database, 'public'> & {
  public: Omit<PublicSchema, 'Functions'> & {
    Functions: Omit<PublicSchema['Functions'], keyof ExecutionFunctionOverrides>
      & ExecutionFunctionOverrides;
  };
};

const fixturePausedMarker = {
  id: '90000000-0000-4000-8000-000000000019',
  slug: 'disposable-integration-database-marker',
  name: 'Disposable Integration Database Marker',
  lifecycle: 'paused',
} as const;

const fixturePassword = `execution-${randomUUID()}`;
const fixture = {
  ownerEmail: `execution-owner-${randomUUID()}@example.invalid`,
  otherEmail: `execution-other-${randomUUID()}@example.invalid`,
} as const;

describe('Execution integration fixture isolation', () => {
  it('assigns repository round trips to dedicated auth users', () => {
    expect(new Set([fixture.ownerEmail, fixture.otherEmail])).toHaveLength(2);
  });
});

const integrationEnvironment = readIntegrationEnvironment();
const describeIntegration = integrationEnvironment === null ? describe.skip : describe;

describeIntegration('Execution command boundary PostgREST/Auth integration', () => {
  const ownerSql = integrationEnvironment === null
    ? null
    : postgres(integrationEnvironment.databaseUrl, { max: 2, onnotice: () => {} });
  const authClients = integrationEnvironment === null
    ? []
    : [
        createAuthClient(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey),
        createAuthClient(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey),
      ];
  const createdUserIds = new Set<string>();
  let ownerUserId = '';
  let otherUserId = '';
  let projectId = '';

  beforeAll(async () => {
    const sql = requireOwner(ownerSql);
    await assertFixturePausedMarker(sql);
    if (authClients.length !== 2) throw new Error('execution_auth_clients_missing');

    const users = await Promise.all([
      signUpFixture(authClients[0]!, sql, fixture.ownerEmail, fixturePassword, createdUserIds),
      signUpFixture(authClients[1]!, sql, fixture.otherEmail, fixturePassword, createdUserIds),
    ]);
    ownerUserId = users[0]!.userId;
    otherUserId = users[1]!.userId;

    const rows = await sql`
      select id from public.projects where slug = 'fixture-active'
    `;
    projectId = rows[0]?.id as string;
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('execution_fixture_project_missing');
    }
  });

  afterAll(async () => {
    if (ownerSql === null) return;
    try {
      const aggregateIds = await removeExactExecutionFixtures(ownerSql, [...createdUserIds]);
      await assertNoExecutionFixtureResidue(ownerSql, [...createdUserIds], aggregateIds);
    } finally {
      await Promise.all(authClients.map(async (client) => client.auth.signOut()));
      await ownerSql.end({ timeout: 5 });
    }
  });

  it('round-trips task commands with exact replay, version conflict, and owner isolation', async () => {
    const owner = requireClient(authClients[0]);
    const other = requireClient(authClients[1]);
    const options = {
      url: integrationEnvironment?.supabaseUrl ?? '',
      anonKey: integrationEnvironment?.anonKey ?? '',
    };
    const tasks = createExecutionTaskRepository(options);
    const otherTasks = createExecutionTaskRepository(options);

    const ownerToken = await requireAccessToken(owner);
    const otherToken = await requireAccessToken(other);

    const createCommand = {
      idempotencyKey: `exec-task-${randomUUID()}`,
      expectedVersion: 1,
      projectId,
      title: '集成任务',
      status: 'backlog',
      priority: 'medium',
      dueAt: null,
    } as const;
    const created = await tasks.create({ accessToken: ownerToken, command: createCommand });
    expect(created.replayed).toBe(false);
    expect(created.taskVersion).toBe(1);

    await expect(tasks.create({ accessToken: ownerToken, command: createCommand })).resolves.toEqual(
      { ...created, replayed: true },
    );
    await expect(
      tasks.create({
        accessToken: ownerToken,
        command: { ...createCommand, title: '被篡改的重放' },
      }),
    ).rejects.toMatchObject({ code: 'execution_idempotency_conflict' });

    const listedAfterCreate = await tasks.listMine({ accessToken: ownerToken });
    expect(listedAfterCreate.filter((row) => row.title === '集成任务')).toHaveLength(1);
    expect(listedAfterCreate.every((row) => row.userId === ownerUserId)).toBe(true);
    expect(listedAfterCreate.every((row) => row.userId !== otherUserId)).toBe(true);

    const listed = await tasks.listMine({ accessToken: ownerToken });
    expect(listed.map((row) => row.title)).toContain('集成任务');

    await expect(otherTasks.listMine({ accessToken: otherToken })).resolves.toEqual([]);

    await expect(
      otherTasks.remove({
        accessToken: otherToken,
        command: {
          idempotencyKey: `exec-task-other-${randomUUID()}`,
          expectedVersion: 1,
          taskId: created.taskId,
        },
      }),
    ).rejects.toMatchObject({ code: 'execution_task_not_found' });

    await expect(
      tasks.update({
        accessToken: ownerToken,
        command: {
          idempotencyKey: `exec-task-stale-${randomUUID()}`,
          expectedVersion: 99,
          taskId: created.taskId,
          projectId: null,
          title: null,
          status: 'completed',
          priority: null,
          dueAt: null,
          completedAt: '2026-09-08T00:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'execution_version_conflict' });

    const updated = await tasks.update({
      accessToken: ownerToken,
      command: {
        idempotencyKey: `exec-task-done-${randomUUID()}`,
        expectedVersion: 1,
        taskId: created.taskId,
        projectId: null,
        title: null,
        status: 'completed',
        priority: null,
        dueAt: null,
        completedAt: '2026-09-08T00:00:00.000Z',
      },
    });
    expect(updated.taskVersion).toBe(2);

    const afterUpdate = await tasks.listMine({ accessToken: ownerToken });
    const completed = afterUpdate.find((row) => row.taskId === created.taskId);
    expect(completed?.status).toBe('completed');
    expect(completed?.completedAt).not.toBeNull();

    await expect(
      tasks.remove({
        accessToken: ownerToken,
        command: {
          idempotencyKey: `exec-task-delete-${randomUUID()}`,
          expectedVersion: 2,
          taskId: created.taskId,
        },
      }),
    ).resolves.toMatchObject({ taskId: created.taskId });
  });

  it('bootstraps a default watchlist per user and isolates watchlist commands', async () => {
    const owner = requireClient(authClients[0]);
    const other = requireClient(authClients[1]);
    const options = {
      url: integrationEnvironment?.supabaseUrl ?? '',
      anonKey: integrationEnvironment?.anonKey ?? '',
    };
    const watchlists = createExecutionWatchlistRepository(options);
    const otherWatchlists = createExecutionWatchlistRepository(options);
    const ownerToken = await requireAccessToken(owner);
    const otherToken = await requireAccessToken(other);

    const ownerListed = await watchlists.listMine({ accessToken: ownerToken });
    expect(ownerListed.filter((row) => row.isDefault)).toHaveLength(1);

    const created = await watchlists.create({
      accessToken: ownerToken,
      command: {
        idempotencyKey: `exec-list-${randomUUID()}`,
        expectedVersion: 1,
        name: '集成观察',
      },
    });

    await watchlists.addProject({
      accessToken: ownerToken,
      command: {
        idempotencyKey: `exec-list-add-${randomUUID()}`,
        expectedVersion: created.watchlistVersion,
        watchlistId: created.watchlistId,
        projectId,
      },
    });

    const members = await watchlists.listProjects({
      accessToken: ownerToken,
      watchlistId: created.watchlistId,
    });
    expect(members.map((row) => row.projectId)).toContain(projectId);

    await expect(
      otherWatchlists.listProjects({
        accessToken: otherToken,
        watchlistId: created.watchlistId,
      }),
    ).resolves.toEqual([]);

    await expect(
      watchlists.rename({
        accessToken: ownerToken,
        command: {
          idempotencyKey: `exec-list-clash-${randomUUID()}`,
          expectedVersion: created.watchlistVersion + 1,
          watchlistId: created.watchlistId,
          name: '默认关注',
        },
      }),
    ).rejects.toMatchObject({ code: 'execution_name_conflict' });

    await expect(
      watchlists.remove({
        accessToken: ownerToken,
        command: {
          idempotencyKey: `exec-list-del-default-${randomUUID()}`,
          expectedVersion: 1,
          watchlistId: ownerListed.find((row) => row.isDefault)!.watchlistId,
        },
      }),
    ).rejects.toMatchObject({ code: 'execution_command_invalid' });
  });

  it('round-trips participation state for the owner only', async () => {
    const owner = requireClient(authClients[0]);
    const other = requireClient(authClients[1]);
    const options = {
      url: integrationEnvironment?.supabaseUrl ?? '',
      anonKey: integrationEnvironment?.anonKey ?? '',
    };
    const participation = createExecutionParticipationRepository(options);
    const otherParticipation = createExecutionParticipationRepository(options);
    const ownerToken = await requireAccessToken(owner);
    const otherToken = await requireAccessToken(other);

    await participation.set({
      accessToken: ownerToken,
      command: {
        idempotencyKey: `exec-part-${randomUUID()}`,
        expectedVersion: 1,
        projectId,
        participationStatus: 'participating',
        notes: null,
      },
    });

    const mine = await participation.getMine({ accessToken: ownerToken, projectId });
    expect(mine.participationStatus).toBe('participating');

    await expect(
      otherParticipation.getMine({ accessToken: otherToken, projectId }),
    ).rejects.toMatchObject({ code: 'execution_project_not_found' });
  });

  it('round-trips a second participation update through the projected version', async () => {
    const owner = requireClient(authClients[0]);
    const options = {
      url: integrationEnvironment?.supabaseUrl ?? '',
      anonKey: integrationEnvironment?.anonKey ?? '',
    };
    const participation = createExecutionParticipationRepository(options);
    const ownerToken = await requireAccessToken(owner);
    const secondProjectId = randomUUID();

    // The fresh row is created at version 1, exactly as the command requires.
    const first = await participation.set({
      accessToken: ownerToken,
      command: {
        idempotencyKey: `exec-part-first-${randomUUID()}`,
        expectedVersion: 1,
        projectId: secondProjectId,
        participationStatus: 'interested',
        notes: null,
      },
    });
    expect(first.projectId).toBe(secondProjectId);

    // The projection carries the optimistic-lock version, so the browser can
    // build the next command without guessing.
    const projected = await participation.getMine({ accessToken: ownerToken, projectId: secondProjectId });
    expect(projected.version).toBe(1);

    const second = await participation.set({
      accessToken: ownerToken,
      command: {
        idempotencyKey: `exec-part-second-${randomUUID()}`,
        expectedVersion: projected.version,
        projectId: secondProjectId,
        participationStatus: 'researching',
        notes: '第二轮再看',
      },
    });
    expect(second.projectId).toBe(secondProjectId);

    const afterSecond = await participation.getMine({ accessToken: ownerToken, projectId: secondProjectId });
    expect(afterSecond).toMatchObject({ participationStatus: 'researching', version: 2 });

    // A stale version built from the first projection is rejected outright.
    await expect(
      participation.set({
        accessToken: ownerToken,
        command: {
          idempotencyKey: `exec-part-stale-${randomUUID()}`,
          expectedVersion: 1,
          projectId: secondProjectId,
          participationStatus: 'paused',
          notes: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'execution_version_conflict' });
  });

  it('denies direct browser writes to every execution table', async () => {
    const owner = requireClient(authClients[0]);
    const direct = await owner
      .from('user_tasks')
      .insert({ user_id: ownerUserId, title: 'direct write' })
      .select('id');
    expect(direct.error).not.toBeNull();
  });
});

async function requireAccessToken(client: SupabaseClient<ExecutionDatabase>): Promise<string> {
  const session = await client.auth.getSession();
  if (session.error !== null) throw new Error('execution_auth_session_failed');
  const token = session.data.session?.access_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new ExecutionRepositoryError('execution_session_required');
  }
  return token;
}

function createAuthClient(
  supabaseUrl: string,
  anonKey: string,
): SupabaseClient<ExecutionDatabase> {
  return createClient<ExecutionDatabase>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function signUpFixture(
  client: SupabaseClient<ExecutionDatabase>,
  owner: postgres.Sql,
  email: string,
  password: string,
  userIds: Set<string>,
): Promise<{ readonly userId: string }> {
  const signUp = await client.auth.signUp({ email, password });
  if (signUp.error !== null || signUp.data.user === null) {
    throw new Error('execution_auth_fixture_signup_failed');
  }
  const userId = signUp.data.user.id;
  userIds.add(userId);
  if (signUp.data.session === null) {
    await owner`
      update auth.users set email_confirmed_at = now(), updated_at = now()
      where id = ${userId}::uuid
    `;
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error !== null || signIn.data.session === null) {
      throw new Error('execution_auth_fixture_signin_failed');
    }
  }
  return { userId };
}

async function assertFixturePausedMarker(sql: postgres.Sql | TransactionSql): Promise<void> {
  const rows = await sql`
    select id, slug, name, lifecycle from public.projects
    where id = ${fixturePausedMarker.id}::uuid
  `;
  if (JSON.stringify(rows[0]) !== JSON.stringify(fixturePausedMarker)) {
    throw new Error('fixture_paused_marker_missing');
  }
}

async function removeExactExecutionFixtures(
  owner: postgres.Sql,
  userIds: readonly string[],
): Promise<readonly string[]> {
  if (userIds.length === 0) return [];
  let aggregateIds: readonly string[] = userIds;
  await owner.begin(async (transaction) => {
    await assertFixturePausedMarker(transaction);
    await transaction`set local session_replication_role = replica`;
    const listRows = await transaction`
      select id from public.watchlists where user_id = any(${[...userIds]}::uuid[])
    `;
    const taskRows = await transaction`
      select id from public.user_tasks where user_id = any(${[...userIds]}::uuid[])
      union
      select task_id as id from public.user_task_events
      where user_id = any(${[...userIds]}::uuid[])
    `;
    aggregateIds = [
      ...userIds,
      ...listRows.map((row) => row.id as string),
      ...taskRows.map((row) => row.id as string),
    ];
    await transaction`
      delete from public.outbox_events
      where event_type like 'execution.%' and aggregate_id = any(${aggregateIds}::uuid[])
    `;
    await transaction`
      delete from public.user_task_events where user_id = any(${[...userIds]}::uuid[])
    `;
    await transaction`
      delete from public.execution_command_receipts
      where user_id = any(${[...userIds]}::uuid[])
    `;
    await transaction`
      delete from public.user_tasks where user_id = any(${[...userIds]}::uuid[])
    `;
    await transaction`
      delete from public.watchlist_projects
      where watchlist_id = any(${listRows.map((row) => row.id as string)}::uuid[])
    `;
    await transaction`
      delete from public.watchlists where user_id = any(${[...userIds]}::uuid[])
    `;
    await transaction`
      delete from public.user_projects where user_id = any(${[...userIds]}::uuid[])
    `;
    await transaction`delete from public.profiles where id = any(${[...userIds]}::uuid[])`;
    await transaction`delete from auth.users where id = any(${[...userIds]}::uuid[])`;
  });
  return aggregateIds;
}

async function assertNoExecutionFixtureResidue(
  sql: postgres.Sql,
  userIds: readonly string[],
  aggregateIds: readonly string[],
): Promise<void> {
  if (userIds.length === 0) return;
  const rows = await sql`
    select
      (select count(*)::int from public.user_tasks
       where user_id = any(${[...userIds]}::uuid[])) as tasks,
      (select count(*)::int from public.user_task_events
       where user_id = any(${[...userIds]}::uuid[])) as task_events,
      (select count(*)::int from public.execution_command_receipts
       where user_id = any(${[...userIds]}::uuid[])) as receipts,
      (select count(*)::int from public.watchlists
       where user_id = any(${[...userIds]}::uuid[])) as watchlists,
      (select count(*)::int from public.user_projects
       where user_id = any(${[...userIds]}::uuid[])) as user_projects,
      (select count(*)::int from public.outbox_events
       where event_type like 'execution.%'
         and aggregate_id = any(${[...aggregateIds]}::uuid[])) as outbox_events,
      (select count(*)::int from public.profiles
       where id = any(${[...userIds]}::uuid[])) as profiles,
      (select count(*)::int from auth.users
       where id = any(${[...userIds]}::uuid[])) as users
  `;
  const residue = rows[0];
  if (residue === undefined || Object.values(residue).some((count) => count !== 0)) {
    throw new Error(`execution_fixture_residue:${JSON.stringify(residue)}`);
  }
}

function requireClient(
  value: SupabaseClient<ExecutionDatabase> | undefined | null,
): SupabaseClient<ExecutionDatabase> {
  if (value === undefined || value === null) throw new Error('execution_auth_client_missing');
  return value;
}

function requireOwner(value: postgres.Sql | null): postgres.Sql {
  if (value === null) throw new Error('execution_database_integration_environment_unavailable');
  return value;
}

function readIntegrationEnvironment(): {
  readonly databaseUrl: string;
  readonly queueDatabaseUrl: string;
  readonly supabaseUrl: string;
  readonly anonKey: string;
} | null {
  const databaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
  const queueDatabaseUrl = process.env.AIRDROP_QUEUE_ADMIN_DATABASE_TEST_URL;
  const supabaseUrl = process.env.AIRDROP_ANON_SUPABASE_URL;
  const anonKey = process.env.AIRDROP_ANON_SUPABASE_KEY;
  const values = [databaseUrl, queueDatabaseUrl, supabaseUrl, anonKey].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );
  if (values.length === 0) return null;
  if (values.length !== 4 || databaseUrl === undefined || queueDatabaseUrl === undefined
    || supabaseUrl === undefined || anonKey === undefined) {
    throw new Error('execution_integration_environment_incomplete');
  }
  assertDisposableTunnelUrls(databaseUrl, queueDatabaseUrl, supabaseUrl);
  return { databaseUrl, queueDatabaseUrl, supabaseUrl, anonKey };
}

function assertDisposableTunnelUrls(
  databaseUrl: string,
  queueDatabaseUrl: string,
  supabaseUrl: string,
): void {
  const database = new URL(databaseUrl);
  const queue = new URL(queueDatabaseUrl);
  const api = new URL(supabaseUrl);
  if (!isExactDatabaseTunnel(database) || !isExactDatabaseTunnel(queue)) {
    throw new Error('integration_database_url_is_not_disposable_tunnel');
  }
  if (api.protocol !== 'http:' || api.hostname !== '127.0.0.1' || api.port !== '16433'
    || api.pathname !== '/' || api.username !== '' || api.password !== ''
    || api.search !== '' || api.hash !== '') {
    throw new Error('integration_api_url_is_not_disposable_tunnel');
  }
}

function isExactDatabaseTunnel(url: URL): boolean {
  return url.protocol === 'postgresql:' && url.hostname === '127.0.0.1'
    && url.port === '16432' && url.pathname === '/postgres'
    && url.search === '' && url.hash === '';
}
