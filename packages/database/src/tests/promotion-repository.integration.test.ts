import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createPromotionRepository,
  type ExecuteCandidateReviewInput,
} from '../promotion/promotion-repository.js';

const namespace = '85000000-0000-4000-8000-';
const projectId = `${namespace}000000000010`;
const sourceId = `${namespace}000000000020`;
const feedRawItemId = `${namespace}000000000030`;
const activeReviewerId = `${namespace}000000000090`;
const revokedReviewerId = `${namespace}000000000091`;
const candidateIds = {
  approve: `${namespace}000000000061`,
  reject: `${namespace}000000000062`,
  needsReview: `${namespace}000000000063`,
  concurrent: `${namespace}000000000064`,
  rollback: `${namespace}000000000065`,
};
const baseTime = new Date('2026-08-20T04:00:00.000Z');
const integrationDatabaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
const describeIntegration = integrationDatabaseUrl === undefined ? describe.skip : describe;
const loginRole = 'promotion_repository_test_login';

describeIntegration('PromotionRepository PostgreSQL integration', () => {
  const owner = integrationDatabaseUrl === undefined ? null : postgres(integrationDatabaseUrl, {
    max: 2,
    onnotice: () => {},
  });
  let login: postgres.Sql | null = null;
  let first: ReturnType<typeof createPromotionRepository> | null = null;
  let second: ReturnType<typeof createPromotionRepository> | null = null;

  beforeAll(async () => {
    const database = requireSql(owner);
    await removeFixtures(database);
    await database.unsafe(`drop role if exists ${loginRole}`);
    const disposablePassword = `promotion-${randomUUID()}`;
    const createLogin = await database`
      select pg_catalog.format(
        'create role promotion_repository_test_login login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication password %L',
        ${disposablePassword}::text
      ) as statement
    `;
    await database.unsafe(requireStatement(createLogin[0]?.statement));
    await database.unsafe(`grant promotion_service to ${loginRole}`);
    const loginUrl = new URL(requireDatabaseUrl(integrationDatabaseUrl));
    loginUrl.username = loginRole;
    loginUrl.password = disposablePassword;
    login = postgres(loginUrl.toString(), { max: 1, onnotice: () => {} });
    first = createPromotionRepository(loginUrl.toString());
    second = createPromotionRepository(loginUrl.toString());
  });

  beforeEach(async () => {
    const database = requireSql(owner);
    await dropRollbackTrigger(database);
    await removeFixtures(database);
    await seedFixtures(database);
  });

  afterAll(async () => {
    if (first !== null) await first.close();
    if (second !== null) await second.close();
    if (login !== null) await login.end({ timeout: 5 });
    if (owner !== null) {
      try {
        await dropRollbackTrigger(owner);
        await removeFixtures(owner);
        await owner.unsafe(`drop role if exists ${loginRole}`);
      } finally {
        await owner.end({ timeout: 5 });
      }
    }
  });

  it('denies direct canonical/governance inserts but approves atomically through the protected command', async () => {
    const restricted = requireSql(login);
    await expect(restricted`
      insert into public.signals (
        project_id, signal_type, title, summary, verification, lifecycle, confidence
      ) values (
        ${projectId}::uuid, 'bypass', 'Bypass', 'Direct canonical write',
        'unverified', 'published', 50
      )
    `).rejects.toMatchObject({ code: '42501' });
    await expect(restricted`
      insert into public.candidate_review_decisions (
        candidate_id, candidate_version, reviewer_user_id, decision, reason_code
      ) values (
        ${candidateIds.approve}::uuid, 2, ${activeReviewerId}::uuid,
        'needs_review', 'insufficient_context'
      )
    `).rejects.toMatchObject({ code: '42501' });

    const result = await requireRepository(first).reviewCandidate(
      reviewInput(candidateIds.approve, 'approve-1'),
    );
    expect(result).toMatchObject({
      outcome: 'promoted',
      candidateVersion: 2,
      replayed: false,
      signalId: expect.any(String),
      evidenceId: expect.any(String),
    });

    const rows = await requireSql(owner)`
      select
        (select count(*)::integer from public.evidence where id = ${result.evidenceId}::uuid) as evidence_count,
        (select count(*)::integer from public.signals where id = ${result.signalId}::uuid) as signal_count,
        (select count(*)::integer from public.signal_evidence_links where signal_id = ${result.signalId}::uuid) as link_count,
        (select count(*)::integer from public.candidate_review_decisions where id = ${result.decisionId}::uuid) as decision_count,
        (select count(*)::integer from public.promotion_events where review_decision_id = ${result.decisionId}::uuid) as audit_count,
        (select count(*)::integer from public.promotion_commands where id = ${result.commandId}::uuid) as receipt_count,
        (select count(*)::integer from public.outbox_events where aggregate_id = ${candidateIds.approve}::uuid) as outbox_count
    `;
    expect(rows[0]).toEqual({
      evidence_count: 1,
      signal_count: 1,
      link_count: 1,
      decision_count: 1,
      audit_count: 1,
      receipt_count: 1,
      outbox_count: 1,
    });
  });

  it('returns stable IDs on exact replay and rejects conflicting key reuse', async () => {
    const repository = requireRepository(first);
    const original = await repository.reviewCandidate(reviewInput(candidateIds.reject, 'replay-1', {
      decision: 'reject',
      reasonCode: 'claim_not_supported',
    }));
    const replay = await repository.reviewCandidate(reviewInput(candidateIds.reject, 'replay-1', {
      decision: 'reject',
      reasonCode: 'claim_not_supported',
    }));

    expect(replay).toEqual({ ...original, replayed: true });
    await expect(repository.reviewCandidate(reviewInput(candidateIds.needsReview, 'replay-1', {
      decision: 'needs_review',
      reasonCode: 'insufficient_context',
    }))).rejects.toMatchObject({ code: 'promotion_idempotency_conflict' });
  });

  it('rejects stale versions and revoked reviewers without receipts', async () => {
    const repository = requireRepository(first);
    await expect(repository.reviewCandidate({
      ...reviewInput(candidateIds.reject, 'stale-1', {
        decision: 'reject',
        reasonCode: 'claim_not_supported',
      }),
      command: {
        ...reviewInput(candidateIds.reject, 'unused', {
          decision: 'reject',
          reasonCode: 'claim_not_supported',
        }).command,
        expectedCandidateVersion: 2,
      },
    })).rejects.toMatchObject({ code: 'promotion_version_conflict' });
    await expect(repository.reviewCandidate({
      ...reviewInput(candidateIds.needsReview, 'revoked-1', {
        decision: 'needs_review',
        reasonCode: 'insufficient_context',
      }),
      command: {
        ...reviewInput(candidateIds.needsReview, 'unused', {
          decision: 'needs_review',
          reasonCode: 'insufficient_context',
        }).command,
        reviewerUserId: revokedReviewerId,
      },
    })).rejects.toMatchObject({ code: 'promotion_reviewer_not_authorized' });

    const receipts = await requireSql(owner)`
      select count(*)::integer as count from public.promotion_commands
      where idempotency_key in ('stale-1', 'revoked-1')
    `;
    expect(receipts[0]?.count).toBe(0);
  });

  it('records reject and needs-review without creating canonical signals or Evidence', async () => {
    const repository = requireRepository(first);
    const rejected = await repository.reviewCandidate(reviewInput(candidateIds.reject, 'reject-1', {
      decision: 'reject',
      reasonCode: 'claim_not_supported',
    }));
    const parked = await repository.reviewCandidate(reviewInput(candidateIds.needsReview, 'needs-review-1', {
      decision: 'needs_review',
      reasonCode: 'insufficient_context',
    }));

    expect(rejected).toMatchObject({ outcome: 'rejected', signalId: null, evidenceId: null });
    expect(parked).toMatchObject({ outcome: 'needs_review', signalId: null, evidenceId: null });
    const rows = await requireSql(owner)`
      select candidate.id, candidate.status, candidate.review_status, candidate.version,
        (select count(*)::integer from public.candidate_review_decisions as decision where decision.candidate_id = candidate.id) as decisions,
        (select count(*)::integer from public.outbox_events as event where event.aggregate_id = candidate.id) as outbox_events
      from public.extraction_candidates as candidate
      where candidate.id in (${candidateIds.reject}::uuid, ${candidateIds.needsReview}::uuid)
      order by candidate.id
    `;
    expect(rows).toEqual([
      { id: candidateIds.reject, status: 'rejected', review_status: 'decided', version: '2', decisions: 1, outbox_events: 1 },
      { id: candidateIds.needsReview, status: 'pending', review_status: 'needs_review', version: '2', decisions: 1, outbox_events: 1 },
    ]);
  });

  it('serializes concurrent approvals to one promoted result', async () => {
    const outcomes = await Promise.allSettled([
      requireRepository(first).reviewCandidate(reviewInput(candidateIds.concurrent, 'concurrent-a')),
      requireRepository(second).reviewCandidate(reviewInput(candidateIds.concurrent, 'concurrent-b')),
    ]);
    const fulfilled = outcomes.filter((result) => result.status === 'fulfilled');
    const rejected = outcomes.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]).toMatchObject({ value: { outcome: 'promoted' } });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: { code: 'promotion_version_conflict' } });
    const counts = await requireSql(owner)`
      select
        (select count(*)::integer from public.promotion_commands where candidate_id = ${candidateIds.concurrent}::uuid) as receipts,
        (select count(*)::integer from public.candidate_review_decisions where candidate_id = ${candidateIds.concurrent}::uuid) as decisions,
        (select count(*)::integer from public.outbox_events where aggregate_id = ${candidateIds.concurrent}::uuid) as outbox_events
    `;
    expect(counts[0]).toEqual({ receipts: 1, decisions: 1, outbox_events: 1 });
  });

  it('rolls back every approve-path record when outbox insertion fails', async () => {
    const database = requireSql(owner);
    await database`
      create function public.reject_promotion_repository_outbox()
      returns trigger language plpgsql set search_path = pg_catalog as $$
      begin
        if new.aggregate_id = '85000000-0000-4000-8000-000000000065'::uuid then
          raise exception 'integration_forced_outbox_failure' using errcode = 'P0001';
        end if;
        return new;
      end;
      $$
    `;
    await database`
      create trigger reject_promotion_repository_outbox
      before insert on public.outbox_events
      for each row execute function public.reject_promotion_repository_outbox()
    `;

    try {
      await expect(requireRepository(first).reviewCandidate(
        reviewInput(candidateIds.rollback, 'rollback-1'),
      )).rejects.toMatchObject({ code: 'promotion_persistence_failed' });

      const rows = await database`
        select candidate.status, candidate.review_status, candidate.version, candidate.signal_id,
          (select count(*)::integer from public.evidence as evidence where evidence.discovered_item_id = candidate.discovered_item_id) as evidence_count,
          (select count(*)::integer from public.signals as signal where signal.project_id = candidate.project_id and signal.title = candidate.payload ->> 'title') as signal_count,
          (select count(*)::integer from public.signal_evidence_links as link join public.signals as signal on signal.id = link.signal_id where signal.title = candidate.payload ->> 'title') as link_count,
          (select count(*)::integer from public.candidate_review_decisions as decision where decision.candidate_id = candidate.id) as decision_count,
          (select count(*)::integer from public.promotion_events as event where event.candidate_id = candidate.id) as audit_count,
          (select count(*)::integer from public.promotion_commands as command where command.candidate_id = candidate.id) as receipt_count,
          (select count(*)::integer from public.outbox_events as event where event.aggregate_id = candidate.id) as outbox_count
        from public.extraction_candidates as candidate
        where candidate.id = ${candidateIds.rollback}::uuid
      `;
      expect(rows[0]).toEqual({
        status: 'pending',
        review_status: 'pending',
        version: '1',
        signal_id: null,
        evidence_count: 0,
        signal_count: 0,
        link_count: 0,
        decision_count: 0,
        audit_count: 0,
        receipt_count: 0,
        outbox_count: 0,
      });
    } finally {
      await dropRollbackTrigger(database);
    }
  });
});

function reviewInput(
  candidateId: string,
  idempotencyKey: string,
  decision: {
    readonly decision: 'reject';
    readonly reasonCode: 'claim_not_supported' | 'source_mismatch';
  } | {
    readonly decision: 'needs_review';
    readonly reasonCode: 'source_mismatch' | 'grounding_failed' | 'insufficient_context' | 'historical_reconciliation_failed';
  } | null = null,
): ExecuteCandidateReviewInput {
  return {
    command: decision === null
      ? {
        version: 1,
        candidateId,
        reviewerUserId: activeReviewerId,
        expectedCandidateVersion: 1,
        decision: 'approve',
        reasonCode: 'evidence_verified',
        note: null,
      }
      : {
        version: 1,
        candidateId,
        reviewerUserId: activeReviewerId,
        expectedCandidateVersion: 1,
        decision: decision.decision,
        reasonCode: decision.reasonCode,
        note: null,
      } as ExecuteCandidateReviewInput['command'],
    idempotencyKey,
    occurredAt: baseTime,
  };
}

async function seedFixtures(sql: postgres.Sql): Promise<void> {
  await sql`
    insert into auth.users (
      id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values
      (
        ${activeReviewerId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'promotion-active@example.invalid',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        ${baseTime}::timestamptz, ${baseTime}::timestamptz
      ),
      (
        ${revokedReviewerId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'promotion-revoked@example.invalid',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        ${baseTime}::timestamptz, ${baseTime}::timestamptz
      )
  `;
  await sql`
    insert into public.user_roles (user_id, role, granted_at, revoked_at) values
      (${activeReviewerId}::uuid, 'reviewer', ${baseTime}::timestamptz, null),
      (
        ${revokedReviewerId}::uuid, 'reviewer', ${baseTime}::timestamptz,
        '2026-08-20T04:00:01.000Z'::timestamptz
      )
  `;
  await sql`insert into public.projects (id, slug, name, lifecycle) values (${projectId}::uuid, 'promotion-repository', 'Promotion Repository', 'active')`;
  await sql`insert into public.sources (id, source_type, name, canonical_url, status) values (${sourceId}::uuid, 'official_web', 'Promotion Repository', 'https://promotion-repository.example/', 'active')`;
  await sql`
    insert into public.project_sources (
      project_id, source_id, authority_domains, is_official, verified_at, verified_by
    ) values (
      ${projectId}::uuid, ${sourceId}::uuid, array['promotion-repository.example'], true,
      ${baseTime}::timestamptz, ${activeReviewerId}::uuid
    )
  `;
  await sql`
    insert into public.raw_items (
      id, project_id, source_id, logical_url, final_url, content_kind,
      media_type, raw_text, sha256, collected_at, created_at
    ) values (
      ${feedRawItemId}::uuid, ${projectId}::uuid, ${sourceId}::uuid,
      'https://promotion-repository.example/feed', 'https://promotion-repository.example/feed',
      'rss_feed', 'application/json', 'Promotion repository integration feed.',
      repeat('a', 64), ${baseTime}::timestamptz, ${baseTime}::timestamptz
    )
  `;

  for (const [index, candidateId] of Object.values(candidateIds).entries()) {
    const discoveredItemId = `${namespace}${String(40 + index).padStart(12, '0')}`;
    const aiRunId = `${namespace}${String(50 + index).padStart(12, '0')}`;
    const quote = `Candidate ${index + 1} public points program continues through week twelve.`;
    await sql`
      insert into public.discovered_items (
        id, project_id, source_id, feed_raw_item_id, stable_entry_key, version,
        title, summary, is_authority_domain, disposition, created_at
      ) values (
        ${discoveredItemId}::uuid, ${projectId}::uuid, ${sourceId}::uuid,
        ${feedRawItemId}::uuid, ${`promotion-${index + 1}`}, 1,
        ${`Promotion candidate ${index + 1}`}, ${quote}, true, 'eligible', ${baseTime}::timestamptz
      )
    `;
    await sql`
      insert into public.ai_runs (
        id, stage, input_kind, input_id, input_hash, model_id, prompt_version,
        schema_version, pipeline_version, status, output, created_at
      ) values (
        ${aiRunId}::uuid, 'extract.v1', 'discovered_item', ${discoveredItemId}::uuid,
        ${String(index + 1).repeat(64)}, 'integration-model', 'extract-prompt-v1',
        'extract-schema-v1', 'extract-pipeline-v1', 'succeeded', '{}'::jsonb,
        ${baseTime}::timestamptz
      )
    `;
    await sql`
      insert into public.extraction_candidates (
        id, ai_run_id, project_id, source_id, discovered_item_id, raw_item_id,
        payload, payload_sha256, created_at
      ) values (
        ${candidateId}::uuid, ${aiRunId}::uuid, ${projectId}::uuid, ${sourceId}::uuid,
        ${discoveredItemId}::uuid, null,
        ${sql.json({
          claimType: 'points_program',
          signalType: 'points_program',
          title: `Promotion candidate ${index + 1}`,
          summary: `Candidate ${index + 1} was reviewed through the governed repository.`,
          confidence: 80,
          evidenceQuote: quote,
          occurredAtIso: null,
        })},
        ${String(9 - index).repeat(64)}, ${baseTime}::timestamptz
      )
    `;
  }
}

async function dropRollbackTrigger(sql: postgres.Sql): Promise<void> {
  await sql`drop trigger if exists reject_promotion_repository_outbox on public.outbox_events`;
  await sql`drop function if exists public.reject_promotion_repository_outbox()`;
}

async function removeFixtures(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (transaction) => {
    await transaction`set local session_replication_role = replica`;
    await transaction`delete from public.outbox_events where aggregate_id in ${transaction(Object.values(candidateIds))}`;
    await transaction`delete from public.promotion_commands where candidate_id in ${transaction(Object.values(candidateIds))}`;
    await transaction`delete from public.promotion_events where candidate_id in ${transaction(Object.values(candidateIds))}`;
    await transaction`delete from public.candidate_review_decisions where candidate_id in ${transaction(Object.values(candidateIds))}`;
    await transaction`delete from public.signal_evidence_links where signal_id in (select id from public.signals where project_id = ${projectId}::uuid)`;
    await transaction`delete from public.evidence where discovered_item_id in (select id from public.discovered_items where project_id = ${projectId}::uuid)`;
    await transaction`delete from public.extraction_candidates where project_id = ${projectId}::uuid`;
    await transaction`delete from public.signals where project_id = ${projectId}::uuid`;
    await transaction`delete from public.ai_runs where input_id in (select id from public.discovered_items where project_id = ${projectId}::uuid)`;
    await transaction`delete from public.discovered_items where project_id = ${projectId}::uuid`;
    await transaction`delete from public.raw_items where project_id = ${projectId}::uuid`;
    await transaction`delete from public.project_sources where project_id = ${projectId}::uuid`;
    await transaction`delete from public.sources where id = ${sourceId}::uuid`;
    await transaction`delete from public.projects where id = ${projectId}::uuid`;
    await transaction`delete from public.user_roles where user_id in (${activeReviewerId}::uuid, ${revokedReviewerId}::uuid)`;
    await transaction`delete from public.profiles where id in (${activeReviewerId}::uuid, ${revokedReviewerId}::uuid)`;
    await transaction`delete from auth.users where id in (${activeReviewerId}::uuid, ${revokedReviewerId}::uuid)`;
  });
}

function requireDatabaseUrl(value: string | undefined): string {
  if (value === undefined) throw new Error('Database integration environment is unavailable.');
  return value;
}

function requireStatement(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a generated SQL statement.');
  return value;
}

function requireSql(value: postgres.Sql | null): postgres.Sql {
  if (value === null) throw new Error('Database integration environment is unavailable.');
  return value;
}

function requireRepository(value: ReturnType<typeof createPromotionRepository> | null) {
  if (value === null) throw new Error('Database integration environment is unavailable.');
  return value;
}
