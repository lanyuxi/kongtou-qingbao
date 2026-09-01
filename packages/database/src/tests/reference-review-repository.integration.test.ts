import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import {
  createReferenceReviewRepository,
  ReferenceReviewRepositoryError,
  type ReferenceReviewRepository,
} from '../references/reference-review-repository.js';

const fixturePausedMarker = {
  id: '90000000-0000-4000-8000-000000000019',
  slug: 'disposable-integration-database-marker',
  name: 'Disposable Integration Database Marker',
  lifecycle: 'paused',
} as const;

const password = `reference-review-${randomUUID()}`;
const sharedUrl = `https://${randomUUID().replaceAll('-', '')}.example/claim`;
const fixture = {
  adminEmail: `reference-admin-${randomUUID()}@example.invalid`,
  reviewerEmail: `reference-reviewer-${randomUUID()}@example.invalid`,
  ordinaryEmail: `reference-ordinary-${randomUUID()}@example.invalid`,
  revocableEmail: `reference-revocable-${randomUUID()}@example.invalid`,
  projectA: fixtureTarget('a'),
  projectB: fixtureTarget('b'),
} as const;

const integrationEnvironment = readIntegrationEnvironment();
const describeIntegration = integrationEnvironment === null ? describe.skip : describe;
const projectIds = [fixture.projectA.projectId, fixture.projectB.projectId] as const;
const sourceIds = [fixture.projectA.sourceId, fixture.projectB.sourceId] as const;
const rawItemIds = [fixture.projectA.rawItemId, fixture.projectB.rawItemId] as const;
const evidenceIds = [fixture.projectA.evidenceId, fixture.projectB.evidenceId] as const;

describeIntegration('ReferenceReviewRepository PostgREST integration', () => {
  const owner = integrationEnvironment === null
    ? null
    : postgres(integrationEnvironment.databaseUrl, { max: 2, onnotice: () => {} });
  const authClients = integrationEnvironment === null
    ? []
    : Array.from({ length: 4 }, () => createAuthClient(
      integrationEnvironment.supabaseUrl,
      integrationEnvironment.anonKey,
    ));
  const createdUserIds = new Set<string>();
  let adminAccessToken = '';
  let reviewerAccessToken = '';
  let ordinaryAccessToken = '';
  let revocableAccessToken = '';
  let revocableUserId = '';
  let repository: ReferenceReviewRepository | null = null;

  beforeAll(async () => {
    const database = requireOwner(owner);
    const environment = requireEnvironment(integrationEnvironment);
    await assertFixturePausedMarker(database);
    if (authClients.length !== 4) throw new Error('reference_auth_clients_missing');

    const users = await Promise.all([
      signUpFixture(authClients[0]!, database, fixture.adminEmail, password, createdUserIds),
      signUpFixture(authClients[1]!, database, fixture.reviewerEmail, password, createdUserIds),
      signUpFixture(authClients[2]!, database, fixture.ordinaryEmail, password, createdUserIds),
      signUpFixture(authClients[3]!, database, fixture.revocableEmail, password, createdUserIds),
    ]);
    adminAccessToken = users[0]!.accessToken;
    reviewerAccessToken = users[1]!.accessToken;
    ordinaryAccessToken = users[2]!.accessToken;
    revocableAccessToken = users[3]!.accessToken;
    revocableUserId = users[3]!.userId;

    await seedFixtures(database, users.map((user) => user.userId));
    repository = createReferenceReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.anonKey,
    });
  });

  afterAll(async () => {
    adminAccessToken = '';
    reviewerAccessToken = '';
    ordinaryAccessToken = '';
    revocableAccessToken = '';
    if (owner === null) return;
    try {
      const ownedIds = await removeExactFixtures(owner, [...createdUserIds]);
      await assertNoFixtureResidue(owner, ownedIds);
    } finally {
      await owner.end({ timeout: 5 });
    }
  });

  it('round-trips notes, replay, version conflicts, lists, and project-scoped URLs', async () => {
    const review = requireRepository(repository);
    const authorityKey = `authority-register-${randomUUID()}`;
    const authorityCommand = {
      version: 1 as const,
      projectId: fixture.projectA.projectId,
      domain: new URL(sharedUrl).hostname,
      evidenceId: fixture.projectA.evidenceId,
      note: 'authority registration note',
    };
    const authority = await review.registerDomainAuthority({
      accessToken: adminAccessToken,
      idempotencyKey: authorityKey,
      command: authorityCommand,
    });
    const authorityReplay = await review.registerDomainAuthority({
      accessToken: adminAccessToken,
      idempotencyKey: authorityKey,
      command: authorityCommand,
    });
    expect({ ...authorityReplay, replayed: false }).toEqual(authority);
    expect(authorityReplay.replayed).toBe(true);

    await expect(review.decideDomainAuthority({
      accessToken: reviewerAccessToken,
      authorityId: authority.authorityId,
      idempotencyKey: `authority-grant-${randomUUID()}`,
      command: {
        version: 1,
        authorityId: authority.authorityId,
        expectedVersion: 1,
        decision: 'grant',
        reasonCode: 'evidence_verified',
        evidenceId: fixture.projectA.evidenceId,
        note: 'authority grant note',
      },
    })).resolves.toMatchObject({ authorityVersion: 2, state: 'granted' });

    const referenceCommandA = {
      version: 1 as const,
      projectId: fixture.projectA.projectId,
      kind: 'claim_portal' as const,
      url: sharedUrl,
      label: 'Project A claim portal',
      evidenceId: fixture.projectA.evidenceId,
      note: 'reference registration note',
    };
    const referenceA = await review.registerReference({
      accessToken: adminAccessToken,
      idempotencyKey: `reference-a-${randomUUID()}`,
      command: referenceCommandA,
    });

    await expect(review.registerReference({
      accessToken: adminAccessToken,
      idempotencyKey: `reference-a-duplicate-${randomUUID()}`,
      command: referenceCommandA,
    })).rejects.toMatchObject({ code: 'reference_command_invalid' });

    await expect(review.registerReference({
      accessToken: adminAccessToken,
      idempotencyKey: `reference-b-${randomUUID()}`,
      command: {
        ...referenceCommandA,
        projectId: fixture.projectB.projectId,
        label: 'Project B claim portal',
        evidenceId: fixture.projectB.evidenceId,
      },
    })).resolves.toMatchObject({ state: 'candidate', replayed: false });

    await expect(review.decideReference({
      accessToken: reviewerAccessToken,
      referenceId: referenceA.referenceId,
      idempotencyKey: `reference-stale-${randomUUID()}`,
      command: {
        version: 1,
        referenceId: referenceA.referenceId,
        expectedVersion: 999,
        decision: 'verify',
        reasonCode: 'evidence_verified',
        evidenceId: fixture.projectA.evidenceId,
        note: 'stale decision note',
      },
    })).rejects.toMatchObject({ code: 'reference_version_conflict' });

    await expect(review.decideReference({
      accessToken: reviewerAccessToken,
      referenceId: referenceA.referenceId,
      idempotencyKey: `reference-verify-${randomUUID()}`,
      command: {
        version: 1,
        referenceId: referenceA.referenceId,
        expectedVersion: 1,
        decision: 'verify',
        reasonCode: 'evidence_verified',
        evidenceId: fixture.projectA.evidenceId,
        note: 'reference verification note',
      },
    })).resolves.toMatchObject({ referenceVersion: 2, state: 'verified' });

    const authorityDetail = await review.getDomainAuthority({
      accessToken: reviewerAccessToken,
      authorityId: authority.authorityId,
    });
    expect(authorityDetail.authorityVersion).toBe(2);
    expect(authorityDetail.decisions.map((decision) => decision.note)).toEqual([
      'authority registration note',
      'authority grant note',
    ]);
    const referenceDetail = await review.getReference({
      accessToken: reviewerAccessToken,
      referenceId: referenceA.referenceId,
    });
    expect(referenceDetail.referenceVersion).toBe(2);
    expect(referenceDetail.decisions.map((decision) => decision.note)).toEqual([
      'reference registration note',
      'reference verification note',
    ]);
    expect(referenceDetail.domainAuthority).toMatchObject({
      authorityId: authority.authorityId,
      state: 'granted',
      authorityVersion: 2,
    });

    const listed = await review.listReferences({
      accessToken: reviewerAccessToken,
      query: { projectId: fixture.projectA.projectId, state: 'verified', cursor: null, limit: 25 },
    });
    expect(
      listed.items.find((item) => item.referenceId === referenceA.referenceId)?.referenceVersion,
    ).toBe(2);
    const listedAuthorities = await review.listDomainAuthorities({
      accessToken: reviewerAccessToken,
      query: { projectId: fixture.projectA.projectId, state: 'granted', cursor: null, limit: 25 },
    });
    expect(
      listedAuthorities.items.find((item) => item.authorityId === authority.authorityId)
        ?.authorityVersion,
    ).toBe(2);
  });

  it('does not retain a previous bearer on the next call', async () => {
    const review = requireRepository(repository);
    await expect(review.listDomainAuthorities({
      accessToken: reviewerAccessToken,
      query: { projectId: null, state: 'all', cursor: null, limit: 25 },
    })).resolves.toMatchObject({ version: 1 });
    await expect(review.listDomainAuthorities({
      accessToken: ordinaryAccessToken,
      query: { projectId: null, state: 'all', cursor: null, limit: 25 },
    })).rejects.toEqual(new ReferenceReviewRepositoryError('reference_reviewer_required'));
  });

  it('applies role revocation on the next repository call', async () => {
    const review = requireRepository(repository);
    const database = requireOwner(owner);
    await expect(review.listReferences({
      accessToken: revocableAccessToken,
      query: { projectId: null, state: 'all', cursor: null, limit: 25 },
    })).resolves.toMatchObject({ version: 1 });

    await database`
      update public.user_roles set revoked_at = now()
      where user_id = ${revocableUserId}::uuid and role = 'reviewer' and revoked_at is null
    `;

    await expect(review.listReferences({
      accessToken: revocableAccessToken,
      query: { projectId: null, state: 'all', cursor: null, limit: 25 },
    })).rejects.toEqual(new ReferenceReviewRepositoryError('reference_reviewer_required'));
  });
});

function fixtureTarget(suffix: string) {
  return {
    projectId: randomUUID(),
    sourceId: randomUUID(),
    rawItemId: randomUUID(),
    evidenceId: randomUUID(),
    slug: `reference-review-${suffix}-${randomUUID()}`,
  };
}

function createAuthClient(supabaseUrl: string, anonKey: string): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function signUpFixture(
  client: SupabaseClient<Database>,
  owner: postgres.Sql,
  email: string,
  fixturePassword: string,
  userIds: Set<string>,
): Promise<{ readonly userId: string; readonly accessToken: string }> {
  const signUp = await client.auth.signUp({ email, password: fixturePassword });
  if (signUp.error !== null || signUp.data.user === null) {
    throw new Error('reference_review_auth_fixture_signup_failed');
  }
  const userId = signUp.data.user.id;
  userIds.add(userId);
  let session = signUp.data.session;
  if (session === null) {
    await owner`
      update auth.users set email_confirmed_at = now(), updated_at = now()
      where id = ${userId}::uuid
    `;
    const signIn = await client.auth.signInWithPassword({ email, password: fixturePassword });
    if (signIn.error !== null || signIn.data.session === null) {
      throw new Error('reference_review_auth_fixture_signin_failed');
    }
    session = signIn.data.session;
  }
  return { userId, accessToken: session.access_token };
}

async function seedFixtures(sql: postgres.Sql, userIds: readonly string[]): Promise<void> {
  const [adminId, reviewerId, ordinaryId, revocableId] = userIds;
  if (adminId === undefined || reviewerId === undefined
    || ordinaryId === undefined || revocableId === undefined) {
    throw new Error('reference_review_fixture_user_missing');
  }
  await sql`
    insert into public.user_roles (user_id, role, granted_at, revoked_at) values
      (${adminId}::uuid, 'admin', now() - interval '2 hours', null),
      (${reviewerId}::uuid, 'reviewer', now() - interval '2 hours', null),
      (${ordinaryId}::uuid, 'user', now() - interval '2 hours', null),
      (${revocableId}::uuid, 'reviewer', now() - interval '2 hours', null)
  `;
  for (const target of [fixture.projectA, fixture.projectB]) {
    await sql`
      insert into public.projects (id, slug, name, lifecycle)
      values (${target.projectId}::uuid, ${target.slug}, 'Reference Review Target', 'active')
    `;
    await sql`
      insert into public.sources (id, source_type, name, canonical_url, status)
      values (
        ${target.sourceId}::uuid, 'official_web', 'Reference Review Source',
        ${`https://${target.sourceId}.example.invalid/`}, 'active'
      )
    `;
    await sql`
      insert into public.raw_items (
        id, project_id, source_id, logical_url, final_url, content_kind,
        media_type, raw_text, sha256, collected_at
      ) values (
        ${target.rawItemId}::uuid, ${target.projectId}::uuid, ${target.sourceId}::uuid,
        ${`https://${target.sourceId}.example.invalid/raw`},
        ${`https://${target.sourceId}.example.invalid/raw`},
        'feed_article_html', 'text/html', 'Official reference evidence.',
        ${randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')}, now()
      )
    `;
    const quote = `Official reference evidence for ${target.projectId}.`;
    await sql`
      insert into public.evidence (
        id, source_id, raw_item_id, source_field, quote_text,
        normalized_quote_sha256, verified_at, created_at
      ) values (
        ${target.evidenceId}::uuid, ${target.sourceId}::uuid, ${target.rawItemId}::uuid,
        'article_raw_text', ${quote}, ${await quoteSha256(sql, quote)}, now(), now()
      )
    `;
  }
}

async function quoteSha256(sql: postgres.Sql, quote: string): Promise<string> {
  const rows = await sql`select public.evidence_quote_sha256_v1(${quote}) as sha`;
  const sha = rows[0]?.sha;
  if (typeof sha !== 'string' || sha.length !== 64) throw new Error('reference_quote_sha_missing');
  return sha;
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

async function removeExactFixtures(
  owner: postgres.Sql,
  userIds: readonly string[],
): Promise<{ aggregateIds: readonly string[]; userIds: readonly string[] }> {
  return owner.begin(async (transaction) => {
    await assertFixturePausedMarker(transaction);
    await transaction`set local session_replication_role = replica`;
    const referenceRows = await transaction`
      select id from public.project_references where project_id = any(${projectIds}::uuid[])
    `;
    const authorityRows = await transaction`
      select id from public.project_domain_authorities where project_id = any(${projectIds}::uuid[])
    `;
    const referenceIds = referenceRows.map((row) => row.id as string);
    const authorityIds = authorityRows.map((row) => row.id as string);
    const aggregateIds = [...projectIds, ...referenceIds, ...authorityIds];

    await transaction`delete from public.outbox_events where aggregate_id = any(${aggregateIds}::uuid[])`;
    await transaction`delete from public.reference_security_flags where reference_id = any(${referenceIds}::uuid[])`;
    await transaction`
      delete from public.reference_review_commands
      where aggregate_id = any(${aggregateIds}::uuid[])
        or actor_user_id = any(${[...userIds]}::uuid[])
    `;
    await transaction`delete from public.project_reference_decisions where reference_id = any(${referenceIds}::uuid[])`;
    await transaction`delete from public.project_references where id = any(${referenceIds}::uuid[])`;
    await transaction`delete from public.project_domain_authority_decisions where authority_id = any(${authorityIds}::uuid[])`;
    await transaction`delete from public.project_domain_authorities where id = any(${authorityIds}::uuid[])`;
    await transaction`delete from public.evidence where id = any(${evidenceIds}::uuid[])`;
    await transaction`delete from public.raw_items where id = any(${rawItemIds}::uuid[])`;
    await transaction`delete from public.sources where id = any(${sourceIds}::uuid[])`;
    await transaction`delete from public.projects where id = any(${projectIds}::uuid[])`;
    await transaction`delete from public.user_roles where user_id = any(${[...userIds]}::uuid[])`;
    await transaction`delete from public.profiles where id = any(${[...userIds]}::uuid[])`;
    await transaction`delete from auth.users where id = any(${[...userIds]}::uuid[])`;

    return { aggregateIds, userIds };
  });
}

async function assertNoFixtureResidue(
  sql: postgres.Sql,
  owned: { aggregateIds: readonly string[]; userIds: readonly string[] },
): Promise<void> {
  const rows = await sql`
    select
      (select count(*)::int from public.project_references
        where project_id = any(${projectIds}::uuid[])) as references,
      (select count(*)::int from public.project_domain_authorities
        where project_id = any(${projectIds}::uuid[])) as authorities,
      (select count(*)::int from public.reference_review_commands
        where aggregate_id = any(${owned.aggregateIds}::uuid[])
          or actor_user_id = any(${[...owned.userIds]}::uuid[])) as commands,
      (select count(*)::int from public.outbox_events
        where aggregate_id = any(${owned.aggregateIds}::uuid[])) as outbox,
      (select count(*)::int from public.projects
        where id = any(${projectIds}::uuid[])) as projects,
      (select count(*)::int from auth.users
        where id = any(${[...owned.userIds]}::uuid[])) as users
  `;
  const residue = rows[0];
  if (residue === undefined || Object.values(residue).some((count) => count !== 0)) {
    throw new Error(`reference_fixture_residue:${JSON.stringify(residue)}`);
  }
}

function requireRepository(value: ReferenceReviewRepository | null): ReferenceReviewRepository {
  if (value === null) throw new Error('Reference review integration environment unavailable.');
  return value;
}

function requireOwner(value: postgres.Sql | null): postgres.Sql {
  if (value === null) throw new Error('Reference database integration environment unavailable.');
  return value;
}

function requireEnvironment(
  value: ReturnType<typeof readIntegrationEnvironment>,
): NonNullable<ReturnType<typeof readIntegrationEnvironment>> {
  if (value === null) throw new Error('Reference integration environment unavailable.');
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
    throw new Error('reference_integration_environment_incomplete');
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
