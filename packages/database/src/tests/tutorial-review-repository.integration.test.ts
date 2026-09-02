import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import { createTutorialPublicRepository } from '../repositories/tutorial-public-repository.js';
import {
  createTutorialReviewRepository,
  TutorialReviewRepositoryError,
  type TutorialReviewRepository,
} from '../tutorials/tutorial-review-repository.js';

const fixturePausedMarker = {
  id: '90000000-0000-4000-8000-000000000019',
  slug: 'disposable-integration-database-marker',
  name: 'Disposable Integration Database Marker',
  lifecycle: 'paused',
} as const;

const password = `tutorial-review-${randomUUID()}`;
const claimUrl = `https://${randomUUID().replaceAll('-', '')}.example/claim`;
const fixture = {
  reviewerEmail: `tutorial-reviewer-${randomUUID()}@example.invalid`,
  ordinaryEmail: `tutorial-ordinary-${randomUUID()}@example.invalid`,
  projectId: randomUUID(),
  sourceId: randomUUID(),
  rawItemId: randomUUID(),
  evidenceId: randomUUID(),
  signalId: randomUUID(),
  authorityId: randomUUID(),
  authorityDecisionId: randomUUID(),
  referenceId: randomUUID(),
  referenceDecisionId: randomUUID(),
  candidateAId: randomUUID(),
  candidateBId: randomUUID(),
  slug: `tutorial-review-${randomUUID()}`,
} as const;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const candidatePayloadA: Json = {
  title: '官方空投参与教程',
  summary: '覆盖从钱包连接到任务领取的完整步骤。',
  steps: [
    { title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
    { title: '打开领取页', body: '前往官方领取页查看任务。', links: [] },
  ],
  sourceSignalIds: [fixture.signalId],
  confidence: 80,
};

const candidatePayloadB: Json = {
  ...candidatePayloadA,
  title: '积分任务参与教程',
  confidence: 60,
};

const integrationEnvironment = readIntegrationEnvironment();
const describeIntegration = integrationEnvironment === null ? describe.skip : describe;

describeIntegration('TutorialReviewRepository PostgREST integration', () => {
  const owner = integrationEnvironment === null
    ? null
    : postgres(integrationEnvironment.databaseUrl, { max: 2, onnotice: () => {} });
  const authClients = integrationEnvironment === null
    ? []
    : Array.from({ length: 2 }, () => createAuthClient(
      integrationEnvironment.supabaseUrl,
      integrationEnvironment.anonKey,
    ));
  const createdUserIds = new Set<string>();
  let reviewerAccessToken = '';
  let ordinaryAccessToken = '';
  let reviewerUserId = '';
  let repository: TutorialReviewRepository | null = null;
  let publicRepository: ReturnType<typeof createTutorialPublicRepository> | null = null;

  beforeAll(async () => {
    const database = requireOwner(owner);
    const environment = requireEnvironment(integrationEnvironment);
    await assertFixturePausedMarker(database);
    if (authClients.length !== 2) throw new Error('tutorial_auth_clients_missing');

    const users = await Promise.all([
      signUpFixture(authClients[0]!, database, fixture.reviewerEmail, password, createdUserIds),
      signUpFixture(authClients[1]!, database, fixture.ordinaryEmail, password, createdUserIds),
    ]);
    reviewerAccessToken = users[0]!.accessToken;
    ordinaryAccessToken = users[1]!.accessToken;
    reviewerUserId = users[0]!.userId;

    await seedFixtures(database, reviewerUserId);
    repository = createTutorialReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.anonKey,
    });
    publicRepository = createTutorialPublicRepository(createAnonClient(
      environment.supabaseUrl,
      environment.anonKey,
    ));
  });

  afterAll(async () => {
    reviewerAccessToken = '';
    ordinaryAccessToken = '';
    if (owner === null) return;
    try {
      const ownedIds = await removeExactFixtures(owner, [...createdUserIds]);
      await assertNoFixtureResidue(owner, ownedIds);
    } finally {
      await owner.end({ timeout: 5 });
    }
  });

  it('round-trips the candidate queue, accept, replay, review detail, and public reads', async () => {
    const review = requireRepository(repository);
    const publicReads = requirePublicRepository(publicRepository);

    const queue = await review.listCandidates({
      accessToken: reviewerAccessToken,
      query: { status: 'pending', cursor: null, limit: 25 },
    });
    const queued = queue.items.find((item) => item.candidateId === fixture.candidateAId);
    expect(queued).toMatchObject({ kind: 'airdrop_campaign', status: 'pending' });

    const candidateDetail = await review.getCandidate({
      accessToken: reviewerAccessToken,
      candidateId: fixture.candidateAId,
    });
    expect(candidateDetail.payload).toMatchObject({ confidence: 80 });

    const acceptCommand = {
      version: 1 as const,
      candidateId: fixture.candidateAId,
      expectedCandidateVersion: 1,
      steps: [
        { title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
        {
          title: '打开领取页',
          body: '前往官方领取页查看任务。',
          links: [{ referenceId: fixture.referenceId }],
        },
      ],
    };
    const acceptKey = `tutorial-accept-${randomUUID()}`;
    const accept = await review.acceptCandidate({
      accessToken: reviewerAccessToken,
      idempotencyKey: acceptKey,
      command: acceptCommand,
    });
    expect(accept).toMatchObject({
      version: 1,
      candidateId: fixture.candidateAId,
      tutorialId: accept.tutorialId,
      tutorialVersion: 1,
      replayed: false,
    });
    const replay = await review.acceptCandidate({
      accessToken: reviewerAccessToken,
      idempotencyKey: acceptKey,
      command: acceptCommand,
    });
    expect(replay).toEqual({ ...accept, replayed: true });

    const listed = await review.listTutorials({
      accessToken: reviewerAccessToken,
      query: { status: 'published', cursor: null, limit: 25 },
    });
    const listedTutorial = listed.items.find(
      (item) => item.tutorialId === accept.tutorialId,
    );
    expect(listedTutorial).toMatchObject({ status: 'published', version: 1 });

    const detail = await review.getTutorial({
      accessToken: reviewerAccessToken,
      tutorialId: accept.tutorialId,
    });
    expect(detail.steps).toHaveLength(2);
    expect(detail.steps[1]).toMatchObject({ ordinal: 2 });
    expect(detail.steps[1]?.links).toHaveLength(1);
    expect(detail.steps[1]?.links[0]).toMatchObject({
      referenceId: fixture.referenceId,
      referenceLabel: '官方领取页',
      renderable: true,
    });
    expect(detail.decisions.map((decision) => decision.decision)).toEqual([
      'accept_candidate',
    ]);

    const publicList = await publicReads.listProjectTutorials({
      projectId: fixture.projectId,
      cursor: null,
      limit: 12,
    });
    const publicItem = publicList.items.find(
      (item) => item.tutorialId === accept.tutorialId,
    );
    expect(publicItem).toMatchObject({ stepCount: 2, version: 1 });

    const publicDetail = await publicReads.getTutorial({ tutorialId: accept.tutorialId });
    expect(publicDetail.steps).toHaveLength(2);
    expect(publicDetail.steps[1]?.links).toHaveLength(1);
    expect(publicDetail.steps[1]?.links[0]).toMatchObject({
      referenceId: fixture.referenceId,
      renderable: true,
    });
    expect(typeof publicDetail.steps[1]?.links[0]?.url).toBe('string');
  });

  it('rejects non-reviewers with the mapped reviewer-required code', async () => {
    const review = requireRepository(repository);
    await expect(review.listCandidates({
      accessToken: ordinaryAccessToken,
      query: { status: 'pending', cursor: null, limit: 25 },
    })).rejects.toEqual(new TutorialReviewRepositoryError('tutorial_reviewer_required'));
  });

  it('maps a stale expected version onto tutorial_not_decidable', async () => {
    const review = requireRepository(repository);
    const published = await review.listTutorials({
      accessToken: reviewerAccessToken,
      query: { status: 'published', cursor: null, limit: 25 },
    });
    const tutorialId = published.items[0]?.tutorialId;
    if (tutorialId === undefined) throw new Error('tutorial_fixture_tutorial_missing');
    await expect(review.publishVersion({
      accessToken: reviewerAccessToken,
      idempotencyKey: `tutorial-publish-stale-${randomUUID()}`,
      command: {
        version: 1,
        tutorialId,
        expectedVersion: 999,
        steps: [
          { title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
          { title: '打开领取页', body: '前往官方领取页查看任务。', links: [] },
        ],
      },
    })).rejects.toEqual(new TutorialReviewRepositoryError('tutorial_not_decidable'));
  });

  it('rejects the second candidate and drops it from the pending queue', async () => {
    const review = requireRepository(repository);
    await expect(review.rejectCandidate({
      accessToken: reviewerAccessToken,
      idempotencyKey: `tutorial-reject-${randomUUID()}`,
      command: {
        version: 1,
        candidateId: fixture.candidateBId,
        expectedCandidateVersion: 1,
        reasonCode: 'duplicate',
        note: null,
      },
    })).resolves.toMatchObject({ replayed: false, candidateId: fixture.candidateBId });

    const queue = await review.listCandidates({
      accessToken: reviewerAccessToken,
      query: { status: 'pending', cursor: null, limit: 25 },
    });
    expect(
      queue.items.find((item) => item.candidateId === fixture.candidateBId),
    ).toBeUndefined();
  });
});

function createAuthClient(supabaseUrl: string, anonKey: string): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function createAnonClient(supabaseUrl: string, anonKey: string): SupabaseClient<Database> {
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
    throw new Error('tutorial_review_auth_fixture_signup_failed');
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
      throw new Error('tutorial_review_auth_fixture_signin_failed');
    }
    session = signIn.data.session;
  }
  return { userId, accessToken: session.access_token };
}

async function seedFixtures(sql: postgres.Sql, reviewerId: string): Promise<void> {
  await sql`
    insert into public.user_roles (user_id, role, granted_at, revoked_at) values
      (${reviewerId}::uuid, 'reviewer', now() - interval '2 hours', null)
  `;
  await sql`
    insert into public.projects (id, slug, name, lifecycle)
    values (${fixture.projectId}::uuid, ${fixture.slug}, 'Tutorial Review Target', 'active')
  `;
  await sql`
    insert into public.sources (id, source_type, name, canonical_url, status)
    values (
      ${fixture.sourceId}::uuid, 'official_web', 'Tutorial Review Source',
      ${`https://${fixture.sourceId}.example.invalid/`}, 'active'
    )
  `;
  await sql`
    insert into public.raw_items (
      id, project_id, source_id, logical_url, final_url, content_kind,
      media_type, raw_text, sha256, collected_at
    ) values (
      ${fixture.rawItemId}::uuid, ${fixture.projectId}::uuid, ${fixture.sourceId}::uuid,
      ${`https://${fixture.sourceId}.example.invalid/raw`},
      ${`https://${fixture.sourceId}.example.invalid/raw`},
      'feed_article_html', 'text/html', 'Official tutorial evidence.',
      ${randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')}, now()
    )
  `;
  const quote = `Official tutorial evidence for ${fixture.projectId}.`;
  await sql`
    insert into public.evidence (
      id, source_id, raw_item_id, source_field, quote_text,
      normalized_quote_sha256, verified_at, created_at
    ) values (
      ${fixture.evidenceId}::uuid, ${fixture.sourceId}::uuid, ${fixture.rawItemId}::uuid,
      'article_raw_text', ${quote}, ${await quoteSha256(sql, quote)}, now(), now()
    )
  `;
  await sql`
    insert into public.signals (
      id, project_id, signal_type, title, summary, verification, lifecycle,
      confidence, published_at, created_at
    ) values (
      ${fixture.signalId}::uuid, ${fixture.projectId}::uuid, 'airdrop_campaign',
      'Tutorial Review Signal', '教程生成所用的已核验信号。',
      'verified', 'published', 90, now(), now()
    )
  `;
  await sql`
    insert into public.signal_evidence_links (signal_id, evidence_id, created_at)
    values (${fixture.signalId}::uuid, ${fixture.evidenceId}::uuid, now())
  `;
  await sql`
    insert into public.project_domain_authorities (id, project_id, normalized_domain, created_at)
    values (
      ${fixture.authorityId}::uuid, ${fixture.projectId}::uuid,
      ${new URL(claimUrl).hostname}, now()
    )
  `;
  await sql`
    insert into public.project_domain_authority_decisions (
      id, authority_id, decision, resulting_state, reason_code, evidence_id,
      aggregate_version, actor_user_id, idempotency_key, created_at
    ) values (
      ${fixture.authorityDecisionId}::uuid, ${fixture.authorityId}::uuid,
      'grant', 'granted', 'evidence_verified', ${fixture.evidenceId}::uuid,
      1, ${reviewerId}::uuid, ${`tutorial-authority-${randomUUID()}`}, now()
    )
  `;
  await sql`
    insert into public.project_references (
      id, project_id, kind, normalized_url, normalized_domain, label,
      version, created_at
    ) values (
      ${fixture.referenceId}::uuid, ${fixture.projectId}::uuid, 'claim_portal',
      ${claimUrl}, ${new URL(claimUrl).hostname}, '官方领取页', 1, now()
    )
  `;
  await sql`
    insert into public.project_reference_decisions (
      id, reference_id, decision, resulting_state, reason_code, aggregate_version,
      evidence_id, actor_user_id, idempotency_key, created_at
    ) values (
      ${fixture.referenceDecisionId}::uuid, ${fixture.referenceId}::uuid,
      'verify', 'verified', 'evidence_verified', 1, ${fixture.evidenceId}::uuid,
      ${reviewerId}::uuid, ${`tutorial-reference-${randomUUID()}`}, now()
    )
  `;
  await sql`
    insert into public.tutorial_candidates (
      id, project_id, kind, payload, source_signal_ids, confidence,
      status, version, content_hash, created_at
    ) values
      (
        ${fixture.candidateAId}::uuid, ${fixture.projectId}::uuid, 'airdrop_campaign',
        ${sql.json(candidatePayloadA)},
        array[${fixture.signalId}::uuid], 80, 'pending', 1,
        ${randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')}, now() - interval '1 hour'
      ),
      (
        ${fixture.candidateBId}::uuid, ${fixture.projectId}::uuid, 'airdrop_campaign',
        ${sql.json(candidatePayloadB)},
        array[${fixture.signalId}::uuid], 60, 'pending', 1,
        ${randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')}, now()
      )
  `;
}

async function quoteSha256(sql: postgres.Sql, quote: string): Promise<string> {
  const rows = await sql`select public.evidence_quote_sha256_v1(${quote}) as sha`;
  const sha = rows[0]?.sha;
  if (typeof sha !== 'string' || sha.length !== 64) throw new Error('tutorial_quote_sha_missing');
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
    const tutorialRows = await transaction`
      select id from public.tutorials where project_id = ${fixture.projectId}::uuid
    `;
    const tutorialIds = tutorialRows.map((row) => row.id as string);
    const aggregateIds = [fixture.projectId, ...tutorialIds];

    await transaction`delete from public.outbox_events where aggregate_id = any(${aggregateIds}::uuid[])`;
    await transaction`delete from public.tutorial_status_events where tutorial_id = any(${tutorialIds}::uuid[])`;
    await transaction`delete from public.tutorial_review_decisions where tutorial_id = any(${tutorialIds}::uuid[]) or candidate_id = any(${[fixture.candidateAId, fixture.candidateBId]}::uuid[])`;
    await transaction`delete from public.tutorial_review_commands where aggregate_id = any(${aggregateIds}::uuid[]) or actor_user_id = any(${[...userIds]}::uuid[])`;
    await transaction`delete from public.tutorial_step_links where tutorial_id = any(${tutorialIds}::uuid[])`;
    await transaction`delete from public.tutorial_versions where tutorial_id = any(${tutorialIds}::uuid[])`;
    await transaction`delete from public.tutorials where id = any(${tutorialIds}::uuid[])`;
    await transaction`delete from public.tutorial_candidates where project_id = ${fixture.projectId}::uuid`;
    await transaction`delete from public.reference_security_flags where reference_id = ${fixture.referenceId}::uuid`;
    await transaction`delete from public.project_reference_decisions where reference_id = ${fixture.referenceId}::uuid`;
    await transaction`delete from public.project_references where id = ${fixture.referenceId}::uuid`;
    await transaction`delete from public.project_domain_authority_decisions where authority_id = ${fixture.authorityId}::uuid`;
    await transaction`delete from public.project_domain_authorities where id = ${fixture.authorityId}::uuid`;
    await transaction`delete from public.signal_evidence_links where signal_id = ${fixture.signalId}::uuid`;
    await transaction`delete from public.signals where id = ${fixture.signalId}::uuid`;
    await transaction`delete from public.evidence where id = ${fixture.evidenceId}::uuid`;
    await transaction`delete from public.raw_items where id = ${fixture.rawItemId}::uuid`;
    await transaction`delete from public.sources where id = ${fixture.sourceId}::uuid`;
    await transaction`delete from public.projects where id = ${fixture.projectId}::uuid`;
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
      (select count(*)::int from public.tutorials
        where project_id = ${fixture.projectId}::uuid) as tutorials,
      (select count(*)::int from public.tutorial_candidates
        where project_id = ${fixture.projectId}::uuid) as candidates,
      (select count(*)::int from public.tutorial_review_commands
        where aggregate_id = any(${owned.aggregateIds}::uuid[])
          or actor_user_id = any(${[...owned.userIds]}::uuid[])) as commands,
      (select count(*)::int from public.outbox_events
        where aggregate_id = any(${owned.aggregateIds}::uuid[])) as outbox,
      (select count(*)::int from public.project_references
        where project_id = ${fixture.projectId}::uuid) as references,
      (select count(*)::int from public.projects
        where id = ${fixture.projectId}::uuid) as projects,
      (select count(*)::int from auth.users
        where id = any(${[...owned.userIds]}::uuid[])) as users
  `;
  const residue = rows[0];
  if (residue === undefined || Object.values(residue).some((count) => count !== 0)) {
    throw new Error(`tutorial_fixture_residue:${JSON.stringify(residue)}`);
  }
}

function requireRepository(value: TutorialReviewRepository | null): TutorialReviewRepository {
  if (value === null) throw new Error('Tutorial review integration environment unavailable.');
  return value;
}

function requirePublicRepository(
  value: ReturnType<typeof createTutorialPublicRepository> | null,
): ReturnType<typeof createTutorialPublicRepository> {
  if (value === null) throw new Error('Tutorial public integration environment unavailable.');
  return value;
}

function requireOwner(value: postgres.Sql | null): postgres.Sql {
  if (value === null) throw new Error('Tutorial database integration environment unavailable.');
  return value;
}

function requireEnvironment(
  value: ReturnType<typeof readIntegrationEnvironment>,
): NonNullable<ReturnType<typeof readIntegrationEnvironment>> {
  if (value === null) throw new Error('Tutorial integration environment unavailable.');
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
    throw new Error('tutorial_integration_environment_incomplete');
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
