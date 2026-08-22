import { randomUUID } from 'node:crypto';

import type { FailedAiRunDetail, FailedAiRunListItem } from '@airdrop/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import {
  createFailedAiRunReviewRepository,
  type FailedAiRunReviewRepository,
} from '../review/failed-ai-run-review-repository.js';

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
  revokedEmail: `failed-ai-revoked-${randomUUID()}@example.invalid`,
  projectId: randomUUID(),
  sourceId: randomUUID(),
  rawItemIds: [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()] as const,
  runIds: [randomUUID(), randomUUID(), randomUUID()] as const,
  excludedRunIds: [randomUUID(), randomUUID()] as const,
} as const;
const fixtureRunIdSet = new Set<string>(fixture.runIds);
const allFixtureRunIds = [...fixture.runIds, ...fixture.excludedRunIds] as const;
const allFixtureRunIdSet = new Set<string>(allFixtureRunIds);

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
  const revokedAuth = integrationEnvironment === null
    ? null
    : createClient<Database>(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });
  const anonymous = integrationEnvironment === null
    ? null
    : createClient<Database>(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });
  let reviewerUserId = '';
  let ordinaryUserId = '';
  let revokedUserId = '';
  let reviewerAccessToken = '';
  let ordinaryAccessToken = '';
  let revokedAccessToken = '';
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
    const revoked = await signUpFixture(
      requireAuth(revokedAuth), database, fixture.revokedEmail, password,
    );
    revokedUserId = revoked.userId;
    revokedAccessToken = revoked.accessToken;

    await seedFixtures(database, reviewerUserId, ordinaryUserId, revokedUserId);
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
    revokedAccessToken = '';
    if (owner === null) return;
    try {
      await removeExactFixtures(owner, reviewerUserId, ordinaryUserId, revokedUserId);
    } finally {
      await owner.end({ timeout: 5 });
    }
  });

  it('uses a real active reviewer session for the complete safe append-only workflow', async () => {
    const repository = requireRepository(first);
    const listed = await repository.list({
      accessToken: reviewerAccessToken,
      query: { reviewState: 'all', status: 'all', cursor: null, limit: 25 },
    });
    const listedFixtures = listed.items.filter((item) => allFixtureRunIdSet.has(item.runId));

    expect(listedFixtures).toHaveLength(3);
    expect(new Set(listedFixtures.map((item) => item.runId))).toEqual(fixtureRunIdSet);
    expect(new Set(listedFixtures.map((item) => item.status))).toEqual(new Set([
      'provider_error',
      'schema_invalid_after_repair',
      'grounding_failed',
    ]));
    expect(listedFixtures.map((item) => item.runId)).not.toEqual(
      expect.arrayContaining([...fixture.excludedRunIds]),
    );
    for (const item of listedFixtures) expectExactSafeListItem(item);
    expect(JSON.stringify(listedFixtures)).not.toMatch(
      /provider-secret|raw-fixture-body|source-body-secret|canonical_url|error_detail|output|usage|token|password/i,
    );

    const detailBefore = await repository.get({
      accessToken: reviewerAccessToken,
      runId: fixture.runIds[0],
    });
    expect(detailBefore.run.reviewVersion).toBe(0);
    expect(detailBefore.decisions).toEqual([]);
    expectExactSafeDetail(detailBefore);
    expect(JSON.stringify(detailBefore)).not.toMatch(
      /provider-secret|raw-fixture-body|source-body-secret|https:\/\/|error_detail|output|usage|token|password/i,
    );

    const firstIdempotencyKey = `safe-flow-investigate-${randomUUID()}`;
    const firstInput = {
      accessToken: reviewerAccessToken,
      runId: fixture.runIds[0],
      idempotencyKey: firstIdempotencyKey,
      command: {
        version: 1 as const,
        expectedReviewVersion: 0,
        decision: 'needs_investigation' as const,
        reasonCode: 'provider_instability' as const,
        note: 'Check the provider status page.',
      },
    };
    const firstResult = await repository.decide(firstInput);
    const replay = await repository.decide(firstInput);
    expect(firstResult).toMatchObject({
      runId: fixture.runIds[0],
      reviewVersion: 1,
      reviewState: 'needs_investigation',
      replayed: false,
    });
    expect(replay).toEqual({ ...firstResult, replayed: true });

    const secondIdempotencyKey = `safe-flow-dismiss-${randomUUID()}`;
    const secondResult = await repository.decide({
      accessToken: reviewerAccessToken,
      runId: fixture.runIds[0],
      idempotencyKey: secondIdempotencyKey,
      command: {
        version: 1,
        expectedReviewVersion: 1,
        decision: 'dismiss',
        reasonCode: 'no_action_needed',
        note: null,
      },
    });
    expect(secondResult).toMatchObject({
      runId: fixture.runIds[0],
      reviewVersion: 2,
      reviewState: 'dismissed',
      replayed: false,
    });

    const detailAfter = await repository.get({
      accessToken: reviewerAccessToken,
      runId: fixture.runIds[0],
    });
    expect(detailAfter.run).toMatchObject({ reviewVersion: 2, reviewState: 'dismissed' });
    expect(detailAfter.decisions).toEqual([
      {
        version: 1,
        decisionId: firstResult.decisionId,
        reviewVersion: 1,
        decision: 'needs_investigation',
        reasonCode: 'provider_instability',
        note: 'Check the provider status page.',
        reviewerUserId,
        createdAt: expect.any(String),
      },
      {
        version: 1,
        decisionId: secondResult.decisionId,
        reviewVersion: 2,
        decision: 'dismiss',
        reasonCode: 'no_action_needed',
        note: null,
        reviewerUserId,
        createdAt: expect.any(String),
      },
    ]);
    expectExactSafeDetail(detailAfter);
    expect(JSON.stringify(detailAfter)).not.toMatch(
      /provider-secret|raw-fixture-body|source-body-secret|https:\/\/|error_detail|output|usage|token|password/i,
    );

    const snapshot = await reviewHistorySnapshot(requireOwner(owner), fixture.runIds[0]);
    expect(snapshot).toEqual({
      decisions: [
        {
          id: firstResult.decisionId,
          ai_run_id: fixture.runIds[0],
          review_version: '1',
          reviewer_user_id: reviewerUserId,
          decision: 'needs_investigation',
          reason_code: 'provider_instability',
          note: 'Check the provider status page.',
          created_at: expect.any(String),
        },
        {
          id: secondResult.decisionId,
          ai_run_id: fixture.runIds[0],
          review_version: '2',
          reviewer_user_id: reviewerUserId,
          decision: 'dismiss',
          reason_code: 'no_action_needed',
          note: null,
          created_at: expect.any(String),
        },
      ],
      receipts: [
        {
          id: firstResult.commandId,
          reviewer_user_id: reviewerUserId,
          ai_run_id: fixture.runIds[0],
          idempotency_key: firstIdempotencyKey,
          expected_review_version: '0',
          decision: 'needs_investigation',
          reason_code: 'provider_instability',
          note: 'Check the provider status page.',
          resulting_review_version: '1',
          decision_id: firstResult.decisionId,
          created_at: expect.any(String),
        },
        {
          id: secondResult.commandId,
          reviewer_user_id: reviewerUserId,
          ai_run_id: fixture.runIds[0],
          idempotency_key: secondIdempotencyKey,
          expected_review_version: '1',
          decision: 'dismiss',
          reason_code: 'no_action_needed',
          note: null,
          resulting_review_version: '2',
          decision_id: secondResult.decisionId,
          created_at: expect.any(String),
        },
      ],
      outbox: [
        expectedOutbox(fixture.runIds[0], firstResult.decisionId, 1,
          'needs_investigation', 'provider_instability'),
        expectedOutbox(fixture.runIds[0], secondResult.decisionId, 2,
          'dismiss', 'no_action_needed'),
      ],
    });
    expectExactSafeOutbox(snapshot);
    expectMatchingHistoryTimestamps(snapshot);
  });

  it('returns AR104 for every ordinary-user and revoked-reviewer RPC operation', async () => {
    await expectRpcReviewDenied(requireAuth(ordinaryAuth), fixture.runIds[0]);
    await expectRpcReviewDenied(requireAuth(revokedAuth), fixture.runIds[0]);

    for (const accessToken of [ordinaryAccessToken, revokedAccessToken]) {
      await expect(requireRepository(first).list({
        accessToken,
        query: { reviewState: 'all', status: 'all', cursor: null, limit: 25 },
      })).rejects.toMatchObject({ code: 'reviewer_required', message: 'reviewer_required' });
    }
  });

  it('denies anonymous review RPCs and direct table reads for every browser principal', async () => {
    const anonymousClient = requireAuth(anonymous);
    await expectRpcPermissionDenied(anonymousClient, fixture.runIds[0]);

    for (const client of [anonymousClient, requireAuth(ordinaryAuth), requireAuth(revokedAuth), requireAuth(reviewerAuth)]) {
      const decisions = await client.from('ai_run_review_decisions').select('id').limit(1);
      const commands = await client.from('ai_run_review_commands').select('id').limit(1);
      expect(decisions.error).toMatchObject({ code: '42501' });
      expect(commands.error).toMatchObject({ code: '42501' });
      expect(decisions.data).toBeNull();
      expect(commands.data).toBeNull();
    }
  });

  it('keeps worker and service roles outside review tables, RPCs, and canonical promotion', async () => {
    const rows = await requireOwner(owner)`
      select role_name,
        has_table_privilege(role_name, 'public.ai_run_review_decisions', 'SELECT') as decisions_select,
        has_table_privilege(role_name, 'public.ai_run_review_decisions', 'INSERT') as decisions_insert,
        has_table_privilege(role_name, 'public.ai_run_review_decisions', 'UPDATE') as decisions_update,
        has_table_privilege(role_name, 'public.ai_run_review_decisions', 'DELETE') as decisions_delete,
        has_table_privilege(role_name, 'public.ai_run_review_decisions', 'TRUNCATE') as decisions_truncate,
        has_table_privilege(role_name, 'public.ai_run_review_commands', 'SELECT') as commands_select,
        has_table_privilege(role_name, 'public.ai_run_review_commands', 'INSERT') as commands_insert,
        has_table_privilege(role_name, 'public.ai_run_review_commands', 'UPDATE') as commands_update,
        has_table_privilege(role_name, 'public.ai_run_review_commands', 'DELETE') as commands_delete,
        has_table_privilege(role_name, 'public.ai_run_review_commands', 'TRUNCATE') as commands_truncate,
        has_function_privilege(
          role_name,
          'public.list_failed_ai_runs(text,text,timestamp with time zone,uuid,integer)',
          'EXECUTE'
        ) as list_execute,
        has_function_privilege(role_name, 'public.get_failed_ai_run(uuid)', 'EXECUTE') as get_execute,
        has_function_privilege(
          role_name,
          'public.execute_failed_ai_run_review(uuid,jsonb,text,timestamp with time zone)',
          'EXECUTE'
        ) as decide_execute
      from (values
        ('ai_stage_worker'), ('authenticated'), ('collection_worker'), ('service_role')
      ) as roles(role_name)
      order by role_name
    `;
    expect(rows).toEqual([
      deniedRolePrivileges('ai_stage_worker'),
      {
        ...deniedRolePrivileges('authenticated'),
        list_execute: true,
        get_execute: true,
        decide_execute: true,
      },
      deniedRolePrivileges('collection_worker'),
      deniedRolePrivileges('service_role'),
    ]);

    const canonicalBoundary = await requireOwner(owner)`
      select
        has_function_privilege(
          'authenticated', 'public.promote_extraction_candidate(uuid,text)', 'EXECUTE'
        ) as promotion_execute,
        has_table_privilege('authenticated', 'public.extraction_candidates', 'INSERT')
          as candidate_insert,
        has_table_privilege('authenticated', 'public.extraction_candidates', 'UPDATE')
          as candidate_update,
        has_table_privilege('authenticated', 'public.promotion_events', 'INSERT')
          as promotion_event_insert
    `;
    expect(canonicalBoundary).toEqual([{
      promotion_execute: false,
      candidate_insert: false,
      candidate_update: false,
      promotion_event_insert: false,
    }]);
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
  revokedUserId: string,
): Promise<void> {
  await sql`
    insert into public.user_roles (user_id, role, granted_at, revoked_at) values
      (${reviewerUserId}::uuid, 'reviewer', now() - interval '2 hours', null),
      (${ordinaryUserId}::uuid, 'user', now() - interval '2 hours', null),
      (${revokedUserId}::uuid, 'reviewer',
        now() - interval '2 hours', now() - interval '1 hour')
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
  const runStatuses = [
    'provider_error',
    'schema_invalid_after_repair',
    'grounding_failed',
    'succeeded',
    'skipped_no_content',
  ] as const;
  for (const [index, runId] of allFixtureRunIds.entries()) {
    const rawItemId = fixture.rawItemIds[index];
    const status = runStatuses[index];
    if (rawItemId === undefined) throw new Error('review_fixture_raw_item_missing');
    if (status === undefined) throw new Error('review_fixture_status_missing');
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
        'candidate-v1', 'pipeline-v1', ${status},
        ${status === 'succeeded' ? JSON.stringify({ rawOutput: 'provider-secret-output' }) : null}::jsonb,
        ${`provider-secret-${index} token password source-body-secret`},
        now() - (${index}::integer * interval '1 second')
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

function expectExactSafeDetail(detail: FailedAiRunDetail): void {
  expect(Object.keys(detail).sort()).toEqual(['decisions', 'input', 'run', 'version']);
  expectExactSafeListItem(detail.run);
  expect(Object.keys(detail.input).sort()).toEqual(['collectedAt', 'id', 'kind']);
  for (const decision of detail.decisions) {
    expect(Object.keys(decision).sort()).toEqual([
      'createdAt',
      'decision',
      'decisionId',
      'note',
      'reasonCode',
      'reviewVersion',
      'reviewerUserId',
      'version',
    ]);
  }
}

function expectExactSafeListItem(item: FailedAiRunListItem): void {
  expect(Object.keys(item).sort()).toEqual([
    'createdAt',
    'inputKind',
    'latestDecisionAt',
    'modelId',
    'pipelineVersion',
    'project',
    'promptVersion',
    'reviewState',
    'reviewVersion',
    'runId',
    'safeFailureCode',
    'schemaVersion',
    'source',
    'stage',
    'status',
    'version',
  ]);
  if (item.project !== null) {
    expect(Object.keys(item.project).sort()).toEqual(['id', 'name', 'slug']);
  }
  if (item.source !== null) {
    expect(Object.keys(item.source).sort()).toEqual(['id', 'name', 'sourceType']);
  }
}

function expectExactSafeOutbox(
  snapshot: Awaited<ReturnType<typeof reviewHistorySnapshot>>,
): void {
  for (const outbox of snapshot.outbox) {
    const payload = outbox.payload;
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
}

function expectMatchingHistoryTimestamps(
  snapshot: Awaited<ReturnType<typeof reviewHistorySnapshot>>,
): void {
  for (const [index, decision] of snapshot.decisions.entries()) {
    const decisionCreatedAt = decision?.created_at;
    const receiptCreatedAt = snapshot.receipts[index]?.created_at;
    const occurredAt = snapshot.outbox[index]?.occurred_at;
    const payload = snapshot.outbox[index]?.payload;
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
}

function expectedOutbox(
  runId: string,
  expectedDecisionId: string,
  reviewVersion: number,
  decision: 'needs_investigation' | 'dismiss',
  reasonCode: 'provider_instability' | 'no_action_needed',
) {
  return {
    aggregate_type: 'ai_run',
    aggregate_id: runId,
    aggregate_version: String(reviewVersion),
    event_type: 'intelligence.ai_run.reviewed.v1',
    event_version: 1,
    payload: {
      version: 1,
      runId,
      reviewVersion,
      decisionId: expectedDecisionId,
      decision,
      reasonCode,
      occurredAt: expect.any(String),
    },
    occurred_at: expect.any(String),
  };
}

async function expectRpcReviewDenied(
  client: SupabaseClient<Database>,
  runId: string,
): Promise<void> {
  const list = await client.rpc('list_failed_ai_runs', {
    p_review_state: 'all',
    p_status: 'all',
    p_cursor_created_at: null as unknown as string,
    p_cursor_id: null as unknown as string,
    p_limit: 25,
  });
  const detail = await client.rpc('get_failed_ai_run', { p_ai_run_id: runId });
  const decide = await client.rpc('execute_failed_ai_run_review', {
    p_ai_run_id: runId,
    p_command_payload: {
      version: 1,
      expectedReviewVersion: 0,
      decision: 'needs_investigation',
      reasonCode: 'provider_instability',
      note: null,
    },
    p_idempotency_key: `denied-${randomUUID()}`,
    p_now: new Date().toISOString(),
  });
  for (const response of [list, detail, decide]) {
    expect(response.data).toBeNull();
    expect(response.error).toMatchObject({ code: 'AR104', message: 'reviewer_required' });
  }
}

async function expectRpcPermissionDenied(
  client: SupabaseClient<Database>,
  runId: string,
): Promise<void> {
  const list = await client.rpc('list_failed_ai_runs', {
    p_review_state: 'all',
    p_status: 'all',
    p_cursor_created_at: null as unknown as string,
    p_cursor_id: null as unknown as string,
    p_limit: 25,
  });
  const detail = await client.rpc('get_failed_ai_run', { p_ai_run_id: runId });
  const decide = await client.rpc('execute_failed_ai_run_review', {
    p_ai_run_id: runId,
    p_command_payload: {
      version: 1,
      expectedReviewVersion: 0,
      decision: 'needs_investigation',
      reasonCode: 'provider_instability',
      note: null,
    },
    p_idempotency_key: `anonymous-${randomUUID()}`,
    p_now: new Date().toISOString(),
  });
  for (const response of [list, detail, decide]) {
    expect(response.data).toBeNull();
    expect(response.error).toMatchObject({ code: '42501' });
  }
}

function deniedRolePrivileges(roleName: string) {
  return {
    role_name: roleName,
    decisions_select: false,
    decisions_insert: false,
    decisions_update: false,
    decisions_delete: false,
    decisions_truncate: false,
    commands_select: false,
    commands_insert: false,
    commands_update: false,
    commands_delete: false,
    commands_truncate: false,
    list_execute: false,
    get_execute: false,
    decide_execute: false,
  };
}

async function removeExactFixtures(
  sql: postgres.Sql,
  reviewerUserId: string,
  ordinaryUserId: string,
  revokedUserId: string,
): Promise<void> {
  const userIds = [...new Set(
    [reviewerUserId, ordinaryUserId, revokedUserId].filter((userId) => userId !== ''),
  )];
  await sql.begin(async (transaction) => {
    await assertDisposableDatabase(transaction);
    await transaction`set local session_replication_role = replica`;
    await transaction`delete from public.outbox_events where aggregate_id in ${transaction(allFixtureRunIds)}`;
    await transaction`delete from public.ai_run_review_commands where ai_run_id in ${transaction(allFixtureRunIds)}`;
    await transaction`delete from public.ai_run_review_decisions where ai_run_id in ${transaction(allFixtureRunIds)}`;
    await transaction`delete from public.ai_runs where id in ${transaction(allFixtureRunIds)}`;
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
