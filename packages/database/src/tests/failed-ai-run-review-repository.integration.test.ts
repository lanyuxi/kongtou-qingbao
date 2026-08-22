import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import {
  createFailedAiRunReviewRepository,
  type FailedAiRunReviewRepository,
} from '../review/failed-ai-run-review-repository.js';
import { presentFixtureUserIds } from './failed-ai-run-review-integration-fixture.js';

const integrationEnvironment = readIntegrationEnvironment();
const describeIntegration = integrationEnvironment === null ? describe.skip : describe;
const disposableMarker = {
  id: '90000000-0000-4000-8000-000000000019',
  slug: 'disposable-integration-database-marker',
  name: 'Disposable Integration Database Marker',
  lifecycle: 'paused',
} as const;
const password = `failed-ai-review-${randomUUID()}`;
const fixture = {
  reviewerEmail: `failed-ai-reviewer-${randomUUID()}@example.invalid`,
  ordinaryEmail: `failed-ai-ordinary-${randomUUID()}@example.invalid`,
  projectId: randomUUID(),
  sourceId: randomUUID(),
  rawItemIds: [randomUUID(), randomUUID(), randomUUID()] as const,
  runIds: [randomUUID(), randomUUID(), randomUUID()] as const,
} as const;
const fixtureRunIdSet = new Set<string>(fixture.runIds);

describeIntegration('FailedAiRunReviewRepository PostgREST integration', () => {
  const owner = integrationEnvironment === null
    ? null
    : postgres(integrationEnvironment.databaseUrl, { max: 2, onnotice: () => {} });
  const reviewerAuth = integrationEnvironment === null
    ? null
    : createClient<Database>(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });
  const ordinaryAuth = integrationEnvironment === null
    ? null
    : createClient<Database>(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });
  let reviewerUserId = '';
  let ordinaryUserId = '';
  let reviewerAccessToken = '';
  let ordinaryAccessToken = '';
  let first: FailedAiRunReviewRepository | null = null;
  let second: FailedAiRunReviewRepository | null = null;

  beforeAll(async () => {
    const database = requireOwner(owner);
    const environment = requireEnvironment(integrationEnvironment);
    await assertDisposableDatabase(database);

    const reviewer = await signUpFixture(
      requireAuth(reviewerAuth), database, fixture.reviewerEmail, password,
    );
    reviewerUserId = reviewer.userId;
    reviewerAccessToken = reviewer.accessToken;
    const ordinary = await signUpFixture(
      requireAuth(ordinaryAuth), database, fixture.ordinaryEmail, password,
    );
    ordinaryUserId = ordinary.userId;
    ordinaryAccessToken = ordinary.accessToken;

    await seedFixtures(database, reviewerUserId, ordinaryUserId);
    first = createFailedAiRunReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.anonKey,
    });
    second = createFailedAiRunReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.anonKey,
    });
  });

  afterAll(async () => {
    reviewerAccessToken = '';
    ordinaryAccessToken = '';
    if (owner === null) return;
    try {
      await removeExactFixtures(owner, reviewerUserId, ordinaryUserId);
    } finally {
      await owner.end({ timeout: 5 });
    }
  });

  it('uses real reviewer and ordinary-user sessions for safe list/detail/decision flow', async () => {
    const repository = requireRepository(first);
    const listed = await repository.list({
      accessToken: reviewerAccessToken,
      query: { reviewState: 'all', status: 'all', cursor: null, limit: 25 },
    });
    const listedFixtures = listed.items.filter((item) => fixtureRunIdSet.has(item.runId));

    expect(listedFixtures).toHaveLength(3);
    expect(JSON.stringify(listedFixtures)).not.toMatch(
      /provider-secret|raw-fixture-body|canonical_url|error_detail|output|usage/i,
    );

    const detailBefore = await repository.get({
      accessToken: reviewerAccessToken,
      runId: fixture.runIds[0],
    });
    expect(detailBefore.run.reviewVersion).toBe(0);
    expect(detailBefore.decisions).toEqual([]);
    expect(JSON.stringify(detailBefore)).not.toMatch(
      /provider-secret|raw-fixture-body|https:\/\/|error_detail|output|usage/i,
    );

    const input = {
      accessToken: reviewerAccessToken,
      runId: fixture.runIds[0],
      idempotencyKey: `safe-flow-${randomUUID()}`,
      command: {
        version: 1 as const,
        expectedReviewVersion: 0,
        decision: 'needs_investigation' as const,
        reasonCode: 'provider_instability' as const,
        note: 'Check the provider status page.',
      },
    };
    const firstResult = await repository.decide(input);
    const replay = await repository.decide(input);
    expect(firstResult).toMatchObject({
      runId: fixture.runIds[0],
      reviewVersion: 1,
      reviewState: 'needs_investigation',
      replayed: false,
    });
    expect(replay).toEqual({ ...firstResult, replayed: true });

    const detailAfter = await repository.get({
      accessToken: reviewerAccessToken,
      runId: fixture.runIds[0],
    });
    expect(detailAfter.run.reviewVersion).toBe(1);
    expect(detailAfter.decisions).toHaveLength(1);

    await expect(repository.list({
      accessToken: ordinaryAccessToken,
      query: { reviewState: 'all', status: 'all', cursor: null, limit: 25 },
    })).rejects.toMatchObject({ code: 'reviewer_required', message: 'reviewer_required' });
  });

  it('serializes two independent clients racing the same reviewer and idempotency key', async () => {
    const idempotencyKey = `same-key-${randomUUID()}`;
    const command = {
      version: 1 as const,
      expectedReviewVersion: 0,
      decision: 'dismiss' as const,
      reasonCode: 'transient_failure' as const,
      note: null,
    };
    const outcomes = await Promise.all([
      requireRepository(first).decide({
        accessToken: reviewerAccessToken,
        runId: fixture.runIds[1],
        idempotencyKey,
        command,
      }),
      requireRepository(second).decide({
        accessToken: reviewerAccessToken,
        runId: fixture.runIds[1],
        idempotencyKey,
        command,
      }),
    ]);

    expect(outcomes.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(new Set(outcomes.map((result) => result.commandId))).toHaveLength(1);
    expect(new Set(outcomes.map((result) => result.decisionId))).toHaveLength(1);
    const winner = outcomes.find((result) => !result.replayed);
    if (winner === undefined) throw new Error('same_key_race_winner_missing');
    const snapshot = await reviewHistorySnapshot(requireOwner(owner), fixture.runIds[1]);
    expect(snapshot).toEqual({
      decisions: [{
        id: winner.decisionId,
        ai_run_id: fixture.runIds[1],
        review_version: '1',
        reviewer_user_id: reviewerUserId,
        decision: command.decision,
        reason_code: command.reasonCode,
        note: command.note,
        created_at: expect.any(String),
      }],
      receipts: [{
        id: winner.commandId,
        reviewer_user_id: reviewerUserId,
        ai_run_id: fixture.runIds[1],
        idempotency_key: idempotencyKey,
        expected_review_version: String(command.expectedReviewVersion),
        decision: command.decision,
        reason_code: command.reasonCode,
        note: command.note,
        resulting_review_version: String(winner.reviewVersion),
        decision_id: winner.decisionId,
        created_at: expect.any(String),
      }],
      outbox: [{
        aggregate_type: 'ai_run',
        aggregate_id: fixture.runIds[1],
        aggregate_version: String(winner.reviewVersion),
        event_type: 'intelligence.ai_run.reviewed.v1',
        event_version: 1,
        payload: {
          version: 1,
          runId: fixture.runIds[1],
          reviewVersion: winner.reviewVersion,
          decisionId: winner.decisionId,
          decision: command.decision,
          reasonCode: command.reasonCode,
          occurredAt: expect.any(String),
        },
        occurred_at: expect.any(String),
      }],
    });
    expectExactSafeOutbox(snapshot);
    expectMatchingHistoryTimestamps(snapshot);
  });

  it('lets exactly one independent client win different keys at the same expected version', async () => {
    const command = {
      version: 1 as const,
      expectedReviewVersion: 0,
      decision: 'dismiss' as const,
      reasonCode: 'no_action_needed' as const,
      note: null,
    };
    const firstIdempotencyKey = `different-key-a-${randomUUID()}`;
    const secondIdempotencyKey = `different-key-b-${randomUUID()}`;
    const outcomes = await Promise.allSettled([
      requireRepository(first).decide({
        accessToken: reviewerAccessToken,
        runId: fixture.runIds[2],
        idempotencyKey: firstIdempotencyKey,
        command,
      }),
      requireRepository(second).decide({
        accessToken: reviewerAccessToken,
        runId: fixture.runIds[2],
        idempotencyKey: secondIdempotencyKey,
        command,
      }),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]?.value).toMatchObject({ reviewVersion: 1, replayed: false });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      code: 'review_version_conflict',
      message: 'review_version_conflict',
    });
    const winningIndex = outcomes.findIndex((outcome) => outcome.status === 'fulfilled');
    const winner = outcomes[winningIndex];
    if (winner?.status !== 'fulfilled') throw new Error('different_key_race_winner_missing');
    const winningIdempotencyKey = [firstIdempotencyKey, secondIdempotencyKey][winningIndex];
    if (winningIdempotencyKey === undefined) throw new Error('winning_idempotency_key_missing');
    const snapshot = await reviewHistorySnapshot(requireOwner(owner), fixture.runIds[2]);
    expect(snapshot).toEqual({
      decisions: [{
        id: winner.value.decisionId,
        ai_run_id: fixture.runIds[2],
        review_version: '1',
        reviewer_user_id: reviewerUserId,
        decision: command.decision,
        reason_code: command.reasonCode,
        note: command.note,
        created_at: expect.any(String),
      }],
      receipts: [{
        id: winner.value.commandId,
        reviewer_user_id: reviewerUserId,
        ai_run_id: fixture.runIds[2],
        idempotency_key: winningIdempotencyKey,
        expected_review_version: String(command.expectedReviewVersion),
        decision: command.decision,
        reason_code: command.reasonCode,
        note: command.note,
        resulting_review_version: String(winner.value.reviewVersion),
        decision_id: winner.value.decisionId,
        created_at: expect.any(String),
      }],
      outbox: [{
        aggregate_type: 'ai_run',
        aggregate_id: fixture.runIds[2],
        aggregate_version: String(winner.value.reviewVersion),
        event_type: 'intelligence.ai_run.reviewed.v1',
        event_version: 1,
        payload: {
          version: 1,
          runId: fixture.runIds[2],
          reviewVersion: winner.value.reviewVersion,
          decisionId: winner.value.decisionId,
          decision: command.decision,
          reasonCode: command.reasonCode,
          occurredAt: expect.any(String),
        },
        occurred_at: expect.any(String),
      }],
    });
    expectExactSafeOutbox(snapshot);
    expectMatchingHistoryTimestamps(snapshot);
  });
});

async function signUpFixture(
  client: SupabaseClient<Database>,
  owner: postgres.Sql,
  email: string,
  fixturePassword: string,
): Promise<{ readonly userId: string; readonly accessToken: string }> {
  const signUp = await client.auth.signUp({ email, password: fixturePassword });
  if (signUp.error !== null || signUp.data.user === null) {
    throw new Error('review_auth_fixture_signup_failed');
  }
  let session = signUp.data.session;
  if (session === null) {
    await owner`
      update auth.users set email_confirmed_at = now(), updated_at = now()
      where id = ${signUp.data.user.id}::uuid
    `;
    const signIn = await client.auth.signInWithPassword({ email, password: fixturePassword });
    if (signIn.error !== null || signIn.data.session === null) {
      throw new Error('review_auth_fixture_signin_failed');
    }
    session = signIn.data.session;
  }
  return { userId: signUp.data.user.id, accessToken: session.access_token };
}

async function seedFixtures(
  sql: postgres.Sql,
  reviewerUserId: string,
  ordinaryUserId: string,
): Promise<void> {
  await sql`
    insert into public.user_roles (user_id, role) values
      (${reviewerUserId}::uuid, 'reviewer'),
      (${ordinaryUserId}::uuid, 'user')
  `;
  await sql`
    insert into public.projects (id, slug, name, lifecycle)
    values (${fixture.projectId}::uuid, ${`failed-ai-${fixture.projectId}`}, 'Failed AI Review Integration', 'active')
  `;
  await sql`
    insert into public.sources (id, source_type, name, canonical_url, status)
    values (
      ${fixture.sourceId}::uuid, 'official_web', 'Failed AI Review Integration',
      ${`https://${fixture.sourceId}.example.invalid/secret-path`}, 'active'
    )
  `;
  await sql`
    insert into public.project_sources (
      project_id, source_id, authority_domains, is_official, verified_at, verified_by
    ) values (
      ${fixture.projectId}::uuid, ${fixture.sourceId}::uuid,
      ${[`failed-ai-${fixture.sourceId}.example.invalid`]}, true, now(), ${reviewerUserId}::uuid
    )
  `;
  for (const [index, runId] of fixture.runIds.entries()) {
    const rawItemId = fixture.rawItemIds[index];
    if (rawItemId === undefined) throw new Error('review_fixture_raw_item_missing');
    await sql`
      insert into public.raw_items (
        id, project_id, source_id, logical_url, final_url, content_kind,
        media_type, raw_text, sha256, collected_at
      ) values (
        ${rawItemId}::uuid, ${fixture.projectId}::uuid, ${fixture.sourceId}::uuid,
        ${`https://${fixture.sourceId}.example.invalid/raw-${index}`},
        ${`https://${fixture.sourceId}.example.invalid/raw-${index}`},
        'feed_article_html', 'text/html', ${`raw-fixture-body-${index}`},
        ${String(index + 1).repeat(64)}, now()
      )
    `;
    await sql`
      insert into public.ai_runs (
        id, stage, input_kind, input_id, input_hash, model_id, prompt_version,
        schema_version, pipeline_version, status, output, error_detail, created_at
      ) values (
        ${runId}::uuid, 'extract_discovered_item', 'raw_item', ${rawItemId}::uuid,
        ${String(index + 4).repeat(64)}, 'review-integration-model', 'extract-v1',
        'candidate-v1', 'pipeline-v1', 'provider_error', null,
        ${`provider-secret-${index}`}, now() - (${index}::integer * interval '1 second')
      )
    `;
  }
}

async function reviewHistorySnapshot(sql: postgres.Sql, runId: string) {
  const decisions = await sql`
    select id, ai_run_id, review_version, reviewer_user_id, decision, reason_code,
      note, created_at::text
    from public.ai_run_review_decisions
    where ai_run_id = ${runId}::uuid
    order by review_version, id
  `;
  const receipts = await sql`
    select id, reviewer_user_id, ai_run_id, idempotency_key, expected_review_version,
      decision, reason_code, note, resulting_review_version, decision_id, created_at::text
    from public.ai_run_review_commands
    where ai_run_id = ${runId}::uuid
    order by resulting_review_version, id
  `;
  const outbox = await sql`
    select aggregate_type, aggregate_id, aggregate_version, event_type, event_version,
      payload, occurred_at::text
    from public.outbox_events
    where aggregate_id = ${runId}::uuid
      and event_type = 'intelligence.ai_run.reviewed.v1'
    order by aggregate_version, id
  `;
  return { decisions, receipts, outbox };
}

function expectExactSafeOutbox(
  snapshot: Awaited<ReturnType<typeof reviewHistorySnapshot>>,
): void {
  const payload = snapshot.outbox[0]?.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('review_outbox_payload_missing');
  }
  expect(Object.keys(payload).sort()).toEqual([
    'decision',
    'decisionId',
    'occurredAt',
    'reasonCode',
    'reviewVersion',
    'runId',
    'version',
  ]);
  expect(JSON.stringify(payload)).not.toMatch(
    /note|reviewer|token|password|error|output|usage|prompt|source|raw|url/i,
  );
}

function expectMatchingHistoryTimestamps(
  snapshot: Awaited<ReturnType<typeof reviewHistorySnapshot>>,
): void {
  const decisionCreatedAt = snapshot.decisions[0]?.created_at;
  const receiptCreatedAt = snapshot.receipts[0]?.created_at;
  const occurredAt = snapshot.outbox[0]?.occurred_at;
  const payload = snapshot.outbox[0]?.payload;
  if (typeof decisionCreatedAt !== 'string'
    || typeof receiptCreatedAt !== 'string'
    || typeof occurredAt !== 'string'
    || typeof payload !== 'object'
    || payload === null
    || Array.isArray(payload)
    || typeof payload.occurredAt !== 'string') {
    throw new Error('review_history_timestamp_missing');
  }
  expect(decisionCreatedAt).toBe(receiptCreatedAt);
  expect(receiptCreatedAt).toBe(occurredAt);
  expect(Date.parse(occurredAt)).toBe(Date.parse(payload.occurredAt));
}

async function removeExactFixtures(
  sql: postgres.Sql,
  reviewerUserId: string,
  ordinaryUserId: string,
): Promise<void> {
  const userIds = presentFixtureUserIds(reviewerUserId, ordinaryUserId);
  await sql.begin(async (transaction) => {
    await assertDisposableDatabase(transaction);
    await transaction`set local session_replication_role = replica`;
    await transaction`delete from public.outbox_events where aggregate_id in ${transaction(fixture.runIds)}`;
    await transaction`delete from public.ai_run_review_commands where ai_run_id in ${transaction(fixture.runIds)}`;
    await transaction`delete from public.ai_run_review_decisions where ai_run_id in ${transaction(fixture.runIds)}`;
    await transaction`delete from public.ai_runs where id in ${transaction(fixture.runIds)}`;
    await transaction`delete from public.raw_items where id in ${transaction(fixture.rawItemIds)}`;
    await transaction`delete from public.project_sources where project_id = ${fixture.projectId}::uuid and source_id = ${fixture.sourceId}::uuid`;
    await transaction`delete from public.sources where id = ${fixture.sourceId}::uuid`;
    await transaction`delete from public.projects where id = ${fixture.projectId}::uuid`;
    if (userIds.length > 0) {
      await transaction`delete from public.user_roles where user_id in ${transaction(userIds)}`;
      await transaction`delete from public.profiles where id in ${transaction(userIds)}`;
      await transaction`delete from auth.users where id in ${transaction(userIds)}`;
    }
  });
}

async function assertDisposableDatabase(sql: postgres.Sql | TransactionSql): Promise<void> {
  const rows = await sql`
    select id, slug, name, lifecycle from public.projects
    where id = ${disposableMarker.id}::uuid
  `;
  if (JSON.stringify(rows[0]) !== JSON.stringify(disposableMarker)) {
    throw new Error('disposable_database_marker_missing');
  }
}

function requireRepository(
  repository: FailedAiRunReviewRepository | null,
): FailedAiRunReviewRepository {
  if (repository === null) throw new Error('Review repository integration environment unavailable.');
  return repository;
}

function requireOwner(value: postgres.Sql | null): postgres.Sql {
  if (value === null) throw new Error('Review database integration environment unavailable.');
  return value;
}

function requireAuth(value: SupabaseClient<Database> | null): SupabaseClient<Database> {
  if (value === null) throw new Error('Review Auth integration environment unavailable.');
  return value;
}

function requireEnvironment(
  value: ReturnType<typeof readIntegrationEnvironment>,
): NonNullable<ReturnType<typeof readIntegrationEnvironment>> {
  if (value === null) throw new Error('Review integration environment unavailable.');
  return value;
}

function readIntegrationEnvironment(): {
  readonly databaseUrl: string;
  readonly supabaseUrl: string;
  readonly anonKey: string;
} | null {
  const databaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
  const supabaseUrl = process.env.AIRDROP_ANON_SUPABASE_URL;
  const anonKey = process.env.AIRDROP_ANON_SUPABASE_KEY;
  const configured = [databaseUrl, supabaseUrl, anonKey].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );
  if (configured.length === 0) return null;
  if (configured.length !== 3 || databaseUrl === undefined || supabaseUrl === undefined || anonKey === undefined) {
    throw new Error(
      'AIRDROP_DATABASE_TEST_URL, AIRDROP_ANON_SUPABASE_URL, and AIRDROP_ANON_SUPABASE_KEY must be configured together.',
    );
  }
  return { databaseUrl, supabaseUrl, anonKey };
}
