import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database, Json } from '../generated/database.types.js';

type PublicSchema = Database['public'];
type IdentityFunctionOverrides = {
  get_my_identity_profile: {
    Args: Record<PropertyKey, never>;
    Returns: Array<{
      userId: string;
      displayName: string | null;
      avatarUrl: string | null;
      timezone: string | null;
      version: number;
      updatedAt: string;
    }>;
  };
  get_public_identity_profile: {
    Args: { p_user_id: string };
    Returns: Array<{
      userId: string;
      displayName: string | null;
      avatarUrl: string | null;
    }>;
  };
  list_my_wallet_addresses: {
    Args: Record<PropertyKey, never>;
    Returns: Array<{
      walletAddressId: string;
      chain: string;
      address: string;
      label: string | null;
      visibility: string;
      version: number;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  list_public_identity_wallet_addresses: {
    Args: { p_user_id: string };
    Returns: Array<{
      walletAddressId: string;
      chain: string;
      address: string;
      label: string | null;
    }>;
  };
  submit_add_wallet_address: { Args: { p_payload: Json }; Returns: Json };
  submit_remove_wallet_address: { Args: { p_payload: Json }; Returns: Json };
  submit_set_wallet_address_visibility: { Args: { p_payload: Json }; Returns: Json };
  submit_update_profile: { Args: { p_payload: Json }; Returns: Json };
};

type IdentityDatabase = Omit<Database, 'public'> & {
  public: Omit<PublicSchema, 'Functions'> & {
    Functions: Omit<PublicSchema['Functions'], keyof IdentityFunctionOverrides>
      & IdentityFunctionOverrides;
  };
};

const fixturePausedMarker = {
  id: '90000000-0000-4000-8000-000000000019',
  slug: 'disposable-integration-database-marker',
  name: 'Disposable Integration Database Marker',
  lifecycle: 'paused',
} as const;

const fixturePassword = `identity-${randomUUID()}`;
const fixture = {
  ownerEmail: `identity-owner-${randomUUID()}@example.invalid`,
  otherEmail: `identity-other-${randomUUID()}@example.invalid`,
  address: `0x${randomUUID().replaceAll('-', '').padEnd(40, '1').slice(0, 40)}`,
} as const;

const integrationEnvironment = readIntegrationEnvironment();
const describeIntegration = integrationEnvironment === null ? describe.skip : describe;

describeIntegration('Identity command boundary PostgREST/Auth integration', () => {
  const ownerSql = integrationEnvironment === null
    ? null
    : postgres(integrationEnvironment.databaseUrl, { max: 2, onnotice: () => {} });
  const authClients = integrationEnvironment === null
    ? []
    : [
        createAuthClient(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey),
        createAuthClient(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey),
      ];
  const anonClient = integrationEnvironment === null
    ? null
    : createAuthClient(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey);
  const createdUserIds = new Set<string>();
  let ownerUserId = '';
  let walletAddressId = '';

  beforeAll(async () => {
    const sql = requireOwner(ownerSql);
    await assertFixturePausedMarker(sql);
    if (authClients.length !== 2) throw new Error('identity_auth_clients_missing');

    const users = await Promise.all([
      signUpFixture(authClients[0]!, sql, fixture.ownerEmail, fixturePassword, createdUserIds),
      signUpFixture(authClients[1]!, sql, fixture.otherEmail, fixturePassword, createdUserIds),
    ]);
    ownerUserId = users[0]!.userId;
  });

  afterAll(async () => {
    if (ownerSql === null) return;
    try {
      const aggregateIds = await removeExactIdentityFixtures(ownerSql, [...createdUserIds]);
      await assertNoIdentityFixtureResidue(ownerSql, [...createdUserIds], aggregateIds);
    } finally {
      await Promise.all(authClients.map(async (client) => client.auth.signOut()));
      await ownerSql.end({ timeout: 5 });
    }
  });

  it('round-trips all four commands with receipt-first replay and owner isolation', async () => {
    const owner = requireClient(authClients[0]);
    const other = requireClient(authClients[1]);
    const updatePayload = {
      idempotencyKey: `profile-${randomUUID()}`,
      expectedVersion: 1,
      displayName: 'Identity Owner',
      avatarUrl: 'https://example.invalid/identity-owner.png',
      timezone: 'Asia/Shanghai',
    } satisfies Json;

    const update = requireRpcObject(await owner.rpc('submit_update_profile', {
      p_payload: updatePayload,
    }));
    expect(Object.keys(update).sort()).toEqual([
      'commandId', 'profileId', 'profileVersion', 'replayed', 'version',
    ]);
    expect(update).toMatchObject({
      version: 1,
      profileId: ownerUserId,
      profileVersion: 2,
      replayed: false,
    });
    expect(update.commandId).toEqual(expect.any(String));

    const updateReplay = requireRpcObject(await owner.rpc('submit_update_profile', {
      p_payload: updatePayload,
    }));
    expect(updateReplay).toEqual({ ...update, replayed: true });
    await expectRpcError(owner.rpc('submit_update_profile', {
      p_payload: { ...updatePayload, displayName: 'Changed payload' },
    }), 'ID207', 'identity_idempotency_conflict');
    await expectRpcError(owner.rpc('submit_update_profile', {
      p_payload: {
        ...updatePayload,
        idempotencyKey: `profile-stale-${randomUUID()}`,
        displayName: 'Stale payload',
      },
    }), 'ID206', 'identity_version_conflict');

    const addPayload = {
      idempotencyKey: `wallet-add-${randomUUID()}`,
      expectedVersion: 2,
      chain: 'evm',
      address: fixture.address,
      label: 'primary',
      visibility: 'hidden',
    } satisfies Json;
    const add = requireRpcObject(await owner.rpc('submit_add_wallet_address', {
      p_payload: addPayload,
    }));
    walletAddressId = requireString(add.walletAddressId, 'identity_wallet_address_id_missing');
    expect(Object.keys(add).sort()).toEqual([
      'commandId', 'profileVersion', 'replayed', 'version',
      'walletAddressId', 'walletAddressVersion',
    ]);
    expect(add).toMatchObject({
      version: 1,
      walletAddressVersion: 1,
      profileVersion: 3,
      replayed: false,
    });
    const addReplay = requireRpcObject(await owner.rpc('submit_add_wallet_address', {
      p_payload: addPayload,
    }));
    expect(addReplay).toEqual({ ...add, replayed: true });
    await expectRpcError(owner.rpc('submit_add_wallet_address', {
      p_payload: { ...addPayload, label: 'changed' },
    }), 'ID207', 'identity_idempotency_conflict');

    const ownerWallets = await owner.rpc('list_my_wallet_addresses');
    expect(ownerWallets.error).toBeNull();
    expect(ownerWallets.data).toEqual([
      expect.objectContaining({
        walletAddressId,
        address: fixture.address,
        visibility: 'hidden',
        version: 1,
      }),
    ]);
    const otherWallets = await other.rpc('list_my_wallet_addresses');
    expect(otherWallets.error).toBeNull();
    expect(otherWallets.data).toEqual([]);
    await expectRpcError(other.rpc('submit_set_wallet_address_visibility', {
      p_payload: {
        idempotencyKey: `other-visibility-${randomUUID()}`,
        expectedVersion: 1,
        walletAddressId,
        visibility: 'public',
      },
    }), 'ID208', 'identity_command_invalid');

    const visibilityPayload = {
      idempotencyKey: `wallet-visibility-${randomUUID()}`,
      expectedVersion: 1,
      walletAddressId,
      visibility: 'public',
    } satisfies Json;
    const visibility = requireRpcObject(await owner.rpc(
      'submit_set_wallet_address_visibility',
      { p_payload: visibilityPayload },
    ));
    expect(visibility).toMatchObject({
      version: 1,
      walletAddressId,
      walletAddressVersion: 2,
      replayed: false,
    });
    const visibilityReplay = requireRpcObject(await owner.rpc(
      'submit_set_wallet_address_visibility',
      { p_payload: visibilityPayload },
    ));
    expect(visibilityReplay).toEqual({ ...visibility, replayed: true });

    const publicClient = requireClient(anonClient);
    const publicProfile = await publicClient.rpc('get_public_identity_profile', {
      p_user_id: ownerUserId,
    });
    expect(publicProfile.error).toBeNull();
    expect(publicProfile.data).toHaveLength(1);
    expect(Object.keys(publicProfile.data?.[0] ?? {}).sort()).toEqual([
      'avatarUrl', 'displayName', 'userId',
    ]);
    const publicWallets = await publicClient.rpc('list_public_identity_wallet_addresses', {
      p_user_id: ownerUserId,
    });
    expect(publicWallets.error).toBeNull();
    expect(publicWallets.data).toEqual([
      {
        walletAddressId,
        chain: 'evm',
        address: fixture.address,
        label: 'primary',
      },
    ]);

    const removePayload = {
      idempotencyKey: `wallet-remove-${randomUUID()}`,
      expectedVersion: 2,
      walletAddressId,
    } satisfies Json;
    const remove = requireRpcObject(await owner.rpc('submit_remove_wallet_address', {
      p_payload: removePayload,
    }));
    expect(remove).toMatchObject({
      version: 1,
      walletAddressId,
      walletAddressVersion: 3,
      replayed: false,
    });
    const removeReplay = requireRpcObject(await owner.rpc('submit_remove_wallet_address', {
      p_payload: removePayload,
    }));
    expect(removeReplay).toEqual({ ...remove, replayed: true });
    await expectRpcError(owner.rpc('submit_remove_wallet_address', {
      p_payload: {
        ...removePayload,
        idempotencyKey: `wallet-remove-stale-${randomUUID()}`,
      },
    }), 'ID206', 'identity_version_conflict');
  });

  it('denies direct browser writes and preserves transactional audit/outbox rows', async () => {
    const owner = requireClient(authClients[0]);
    const directProfile = await owner
      .from('profiles')
      .update({ display_name: 'direct bypass' })
      .eq('id', ownerUserId);
    expect(directProfile.error).toMatchObject({ code: '42501' });
    const directWallet = await owner.from('user_wallet_addresses').insert({
      user_id: ownerUserId,
      chain: 'evm',
      address: `0x${randomUUID().replaceAll('-', '').padEnd(40, '2').slice(0, 40)}`,
    });
    expect(directWallet.error).toMatchObject({ code: '42501' });

    const sql = requireOwner(ownerSql);
    const profileEventsTable = await sql`
      select pg_catalog.to_regclass('public.identity_profile_events')::text as name
    `;
    expect(profileEventsTable[0]?.name).toBeTruthy();
    if (profileEventsTable[0]?.name === null || profileEventsTable[0]?.name === undefined
      || walletAddressId === '') return;

    const evidence = await sql`
      select
        (select count(*)::int from public.identity_profile_events
          where user_id = ${ownerUserId}::uuid) as profile_events,
        (select count(*)::int from public.user_wallet_address_events
          where wallet_address_id = ${walletAddressId}::uuid) as wallet_events,
        (select count(*)::int from public.identity_command_receipts
          where user_id = ${ownerUserId}::uuid) as receipts,
        (select count(*)::int from public.outbox_events
          where event_type like 'identity.%'
            and aggregate_id = any(${[ownerUserId, walletAddressId]}::uuid[])) as outbox
    `;
    expect(evidence[0]).toEqual({
      profile_events: 1,
      wallet_events: 3,
      receipts: 4,
      outbox: 4,
    });
    const payloadRows = await sql`
      select payload from public.outbox_events
      where event_type like 'identity.%'
        and aggregate_id = any(${[ownerUserId, walletAddressId]}::uuid[])
      order by id
    `;
    for (const row of payloadRows) {
      expect(Object.keys(requireRecord(row.payload, 'identity_outbox_payload_invalid')).sort()).toEqual([
        'aggregateId', 'aggregateVersion', 'eventType', 'occurredAt', 'version',
      ]);
    }

    await expect(sql`
      update public.identity_command_receipts set response = '{}'::jsonb
      where user_id = ${ownerUserId}::uuid
    `).rejects.toMatchObject({ code: '55000' });
    await expect(sql`
      delete from public.user_wallet_address_events
      where wallet_address_id = ${walletAddressId}::uuid
    `).rejects.toMatchObject({ code: '55000' });
  });

  it('rolls failed commands back without receipts, audit, state, or outbox residue', async () => {
    const owner = requireClient(authClients[0]);
    const sql = requireOwner(ownerSql);
    const before = await identityCounts(sql, ownerUserId);
    await expectRpcError(owner.rpc('submit_add_wallet_address', {
      p_payload: {
        idempotencyKey: `rollback-${randomUUID()}`,
        expectedVersion: 1,
        chain: 'evm',
        address: fixture.address,
        label: null,
        visibility: 'hidden',
      },
    }), 'ID206', 'identity_version_conflict');
    expect(await identityCounts(sql, ownerUserId)).toEqual(before);
  });
});

function createAuthClient(
  supabaseUrl: string,
  anonKey: string,
): SupabaseClient<IdentityDatabase> {
  return createClient<IdentityDatabase>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function signUpFixture(
  client: SupabaseClient<IdentityDatabase>,
  owner: postgres.Sql,
  email: string,
  password: string,
  userIds: Set<string>,
): Promise<{ readonly userId: string }> {
  const signUp = await client.auth.signUp({ email, password });
  if (signUp.error !== null || signUp.data.user === null) {
    throw new Error('identity_auth_fixture_signup_failed');
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
      throw new Error('identity_auth_fixture_signin_failed');
    }
  }
  return { userId };
}

async function expectRpcError(
  result: PromiseLike<{ error: { code?: string; message: string } | null }>,
  code: string,
  message: string,
): Promise<void> {
  const response = await result;
  expect(response.error).toMatchObject({ code, message });
}

function requireRpcObject(result: {
  data: Json | null;
  error: { message: string } | null;
}): Record<string, Json | undefined> {
  if (result.error !== null) throw new Error(`identity_rpc_failed:${result.error.message}`);
  return requireRecord(result.data, 'identity_rpc_response_invalid');
}

function requireRecord(value: unknown, code: string): Record<string, Json | undefined> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, Json | undefined>;
}

function requireString(value: Json | undefined, code: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(code);
  return value;
}

async function identityCounts(sql: postgres.Sql, userId: string): Promise<unknown> {
  const rows = await sql`
    select
      (select count(*)::int from public.user_wallet_addresses
       where user_id = ${userId}::uuid) as wallets,
      (select count(*)::int from public.user_wallet_address_events
       where user_id = ${userId}::uuid) as wallet_events,
      (select count(*)::int from public.identity_command_receipts
       where user_id = ${userId}::uuid) as receipts,
      (select count(*)::int from public.outbox_events
       where event_type like 'identity.%' and aggregate_id = ${userId}::uuid) as profile_outbox
  `;
  return rows[0];
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

async function removeExactIdentityFixtures(
  owner: postgres.Sql,
  userIds: readonly string[],
): Promise<readonly string[]> {
  if (userIds.length === 0) return [];
  let aggregateIds: readonly string[] = userIds;
  await owner.begin(async (transaction) => {
    await assertFixturePausedMarker(transaction);
    await transaction`set local session_replication_role = replica`;
    const walletRows = await transaction`
      select id
      from public.user_wallet_addresses
      where user_id = any(${[...userIds]}::uuid[])
      union
      select wallet_address_id as id
      from public.user_wallet_address_events
      where user_id = any(${[...userIds]}::uuid[])
    `;
    const walletIds = walletRows.map((row) => row.id as string);
    aggregateIds = [...userIds, ...walletIds];
    await transaction`
      delete from public.outbox_events
      where event_type like 'identity.%' and aggregate_id = any(${aggregateIds}::uuid[])
    `;
    const profileEvents = await transaction`
      select pg_catalog.to_regclass('public.identity_profile_events')::text as name
    `;
    if (profileEvents[0]?.name !== null && profileEvents[0]?.name !== undefined) {
      await transaction`
        delete from public.identity_profile_events where user_id = any(${[...userIds]}::uuid[])
      `;
    }
    await transaction`
      delete from public.user_wallet_address_events where user_id = any(${[...userIds]}::uuid[])
    `;
    await transaction`
      delete from public.identity_command_receipts where user_id = any(${[...userIds]}::uuid[])
    `;
    await transaction`
      delete from public.user_wallet_addresses where user_id = any(${[...userIds]}::uuid[])
    `;
    await transaction`delete from public.user_roles where user_id = any(${[...userIds]}::uuid[])`;
    await transaction`delete from public.profiles where id = any(${[...userIds]}::uuid[])`;
    await transaction`delete from auth.users where id = any(${[...userIds]}::uuid[])`;
  });
  return aggregateIds;
}

async function assertNoIdentityFixtureResidue(
  sql: postgres.Sql,
  userIds: readonly string[],
  aggregateIds: readonly string[],
): Promise<void> {
  if (userIds.length === 0) return;
  const rows = await sql`
    select
      (select count(*)::int from public.user_wallet_addresses
       where user_id = any(${[...userIds]}::uuid[])) as wallets,
      (select count(*)::int from public.user_wallet_address_events
       where user_id = any(${[...userIds]}::uuid[])) as wallet_events,
      (select count(*)::int from public.identity_command_receipts
       where user_id = any(${[...userIds]}::uuid[])) as receipts,
      (select count(*)::int from public.identity_profile_events
       where user_id = any(${[...userIds]}::uuid[])) as profile_events,
      (select count(*)::int from public.outbox_events
       where event_type like 'identity.%'
         and aggregate_id = any(${[...aggregateIds]}::uuid[])) as outbox_events,
      (select count(*)::int from public.profiles
       where id = any(${[...userIds]}::uuid[])) as profiles,
      (select count(*)::int from auth.users
       where id = any(${[...userIds]}::uuid[])) as users
  `;
  const residue = rows[0];
  if (residue === undefined || Object.values(residue).some((count) => count !== 0)) {
    throw new Error(`identity_fixture_residue:${JSON.stringify(residue)}`);
  }
}

function requireClient(
  value: SupabaseClient<IdentityDatabase> | undefined | null,
): SupabaseClient<IdentityDatabase> {
  if (value === undefined || value === null) throw new Error('identity_auth_client_missing');
  return value;
}

function requireOwner(value: postgres.Sql | null): postgres.Sql {
  if (value === null) throw new Error('identity_database_integration_environment_unavailable');
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
    throw new Error('identity_integration_environment_incomplete');
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
