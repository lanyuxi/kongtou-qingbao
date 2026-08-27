import { randomUUID } from 'node:crypto';

import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createPromotionRepository,
  PromotionCommandRejectionError,
  type ExecuteCandidateReviewInput,
} from '../promotion/promotion-repository.js';

const namespace = '85000000-0000-4000-8000-';
const projectId = `${namespace}000000000010`;
const sourceId = `${namespace}000000000020`;
const feedRawItemId = `${namespace}000000000030`;
const activeReviewerId = `${namespace}000000000090`;
const revokedReviewerId = `${namespace}000000000091`;
const securityReviewerId = `${namespace}000000000092`;
const adminReviewerId = `${namespace}000000000093`;
const candidateIds = {
  approve: `${namespace}000000000061`,
  reject: `${namespace}000000000062`,
  needsReview: `${namespace}000000000063`,
  concurrent: `${namespace}000000000064`,
  rollback: `${namespace}000000000065`,
  securityRisk: `${namespace}000000000066`,
  scamIndicator: `${namespace}000000000067`,
};
const historicalCandidateIds = {
  grounded: `${namespace}000000000071`,
  ungrounded: `${namespace}000000000072`,
  linked: `${namespace}000000000073`,
  concurrent: `${namespace}000000000074`,
  pagination: `${namespace}000000000075`,
} as const;
const historicalSignalIds = {
  grounded: `${namespace}000000000081`,
  ungrounded: `${namespace}000000000082`,
  linked: `${namespace}000000000083`,
  concurrent: `${namespace}000000000084`,
  pagination: `${namespace}000000000085`,
} as const;
const baseTime = new Date('2026-08-20T04:00:00.000Z');
const securityIncidentId = `${namespace}000000000087`;
const securityEvidenceId = `${namespace}000000000088`;
const integrationDatabaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
const describeIntegration = integrationDatabaseUrl === undefined ? describe.skip : describe;
const disposableMarker = {
  id: '90000000-0000-4000-8000-000000000019',
  slug: 'disposable-integration-database-marker',
  name: 'Disposable Integration Database Marker',
  lifecycle: 'paused',
} as const;

describeIntegration('PromotionRepository PostgreSQL integration', () => {
  const owner = integrationDatabaseUrl === undefined ? null : postgres(integrationDatabaseUrl, {
    max: 2,
    onnotice: () => {},
  });
  let login: postgres.Sql | null = null;
  let first: ReturnType<typeof createPromotionRepository> | null = null;
  let second: ReturnType<typeof createPromotionRepository> | null = null;
  let loginRole = '';

  beforeAll(async () => {
    const database = requireSql(owner);
    await assertDisposableDatabase(database);
    await removeFixtures(database);
    await assertDisposableDatabase(database);
    loginRole = `promotion_repo_test_${randomUUID().replaceAll('-', '')}`;
    const disposablePassword = `promotion-${randomUUID()}`;
    const roleStatements = await database`
      select
        pg_catalog.format(
          'create role %I login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication password %L',
          ${loginRole}::text,
          ${disposablePassword}::text
        ) as create_statement,
        pg_catalog.format('grant promotion_service to %I', ${loginRole}::text) as grant_statement
    `;
    await database.unsafe(requireStatement(roleStatements[0]?.create_statement));
    await database.unsafe(requireStatement(roleStatements[0]?.grant_statement));
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
        if (loginRole !== '') await dropDisposableRole(owner, loginRole);
      } finally {
        await owner.end({ timeout: 5 });
      }
    }
  });

  it('refuses owner cleanup authorization when the disposable marker row is tampered', async () => {
    const database = requireSql(owner);
    await database.begin(async (transaction) => {
      await transaction`
        update public.projects
        set name = 'Tampered disposable marker'
        where id = ${disposableMarker.id}::uuid
      `;
      const before = await candidateSnapshot(transaction, candidateIds.approve);

      await expect(removeFixturesInTransaction(transaction)).rejects.toThrow(
        'disposable_database_marker_missing',
      );
      await expect(candidateSnapshot(transaction, candidateIds.approve)).resolves.toEqual(before);

      await transaction`
        update public.projects
        set name = ${disposableMarker.name}
        where id = ${disposableMarker.id}::uuid
      `;
    });
  });

  it('denies direct canonical and governance DML after SET ROLE but approves through the protected command', async () => {
    const restricted = requireSql(login);
    await expect(restricted`
      insert into public.signals (
        project_id, signal_type, title, summary, verification, lifecycle, confidence
      ) values (
        ${projectId}::uuid, 'bypass', 'Bypass', 'Direct canonical write',
        'unverified', 'published', 50
      )
    `).rejects.toMatchObject({ code: '42501' });

    await expectPromotionRoleDenied(restricted, async (transaction) => transaction`
      insert into public.signals (
        project_id, signal_type, title, summary, verification, lifecycle, confidence
      ) values (
        ${projectId}::uuid, 'bypass', 'Bypass', 'Direct canonical write',
        'unverified', 'published', 50
      )
    `);
    await expectPromotionRoleDenied(restricted, async (transaction) => transaction`
      update public.extraction_candidates
      set review_status = 'decided'
      where id = ${candidateIds.approve}::uuid
    `);
    await expectPromotionRoleDenied(restricted, async (transaction) => transaction`
      insert into public.promotion_events (candidate_id, signal_id, actor)
      values (${candidateIds.approve}::uuid, ${candidateIds.approve}::uuid, 'bypass')
    `);
    for (const table of [
      'evidence',
      'signal_evidence_links',
      'candidate_review_decisions',
      'promotion_commands',
      'outbox_events',
    ]) {
      await expectPromotionRoleDenied(
        restricted,
        async (transaction) => transaction.unsafe(`insert into public.${table} default values`),
      );
      await expectPromotionRoleDenied(
        restricted,
        async (transaction) => transaction.unsafe(`update public.${table} set created_at = created_at where false`),
      );
      await expectPromotionRoleDenied(
        restricted,
        async (transaction) => transaction.unsafe(`delete from public.${table} where false`),
      );
    }

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

    await expect(candidateSnapshot(requireSql(owner), candidateIds.approve)).resolves.toEqual(
      reviewedSnapshot('promoted', 'decided', result.signalId, 1),
    );
  });

  it('denies Promotion role direct candidate-table SELECT before historical listing', async () => {
    await expectPromotionRoleDenied(requireSql(login), async (transaction) => transaction`
      select id, version
      from public.extraction_candidates
      where status = 'promoted'
      order by id
      limit 1
    `);
  });

  it.each([
    [candidateIds.securityRisk, 'security_risk'],
    [candidateIds.scamIndicator, 'scam_indicator'],
  ] as const)('routes %s away from ordinary Promotion with a stable rejection', async (
    candidateId,
    claimType,
  ) => {
    const database = requireSql(owner);
    const before = await candidateSnapshot(database, candidateId);

    await expect(requireRepository(first).reviewCandidate(reviewInput(candidateId, `security-claim-${claimType}`)))
      .rejects.toEqual(new PromotionCommandRejectionError('security_review_required'));
    await expect(candidateSnapshot(database, candidateId)).resolves.toEqual(before);
  });

  it('enforces the full caution and blocked ordinary Promotion role matrix', async () => {
    const database = requireSql(owner);
    const repository = requireRepository(first);
    await setProjectSecurityPosture(database, 'caution');

    await expect(repository.reviewCandidate(reviewInput(candidateIds.approve, 'caution-ordinary')))
      .rejects.toEqual(new PromotionCommandRejectionError('security_reviewer_required'));

    await expect(repository.reviewCandidate(reviewInput(
      candidateIds.approve,
      'caution-security',
      null,
      securityReviewerId,
    )))
      .resolves.toMatchObject({ outcome: 'promoted' });
    await expect(repository.reviewCandidate(reviewInput(
      candidateIds.reject,
      'caution-admin',
      null,
      adminReviewerId,
    ))).resolves.toMatchObject({ outcome: 'promoted' });

    await setProjectSecurityPosture(database, 'blocked');
    for (const [role, candidateId, reviewerUserId] of [
      ['ordinary', candidateIds.needsReview, activeReviewerId],
      ['security-reviewer', candidateIds.concurrent, securityReviewerId],
      ['admin', candidateIds.rollback, adminReviewerId],
    ] as const) {
      const before = await candidateSnapshot(database, candidateId);
      await expect(repository.reviewCandidate(reviewInput(
        candidateId,
        `blocked-${role}`,
        null,
        reviewerUserId,
      ))).rejects.toEqual(new PromotionCommandRejectionError('security_promotion_blocked'));
      await expect(candidateSnapshot(database, candidateId)).resolves.toEqual(before);
    }
  });

  it('lists only unlinked promoted history with stable UUID cursor pagination', async () => {
    const repository = requireRepository(first);

    await expect(repository.listHistoricalCandidates({
      afterCandidateId: null,
      limit: 2,
    })).resolves.toEqual([
      { candidateId: historicalCandidateIds.grounded, candidateVersion: 1 },
      { candidateId: historicalCandidateIds.ungrounded, candidateVersion: 1 },
    ]);
    await expect(repository.listHistoricalCandidates({
      afterCandidateId: historicalCandidateIds.ungrounded,
      limit: 2,
    })).resolves.toEqual([
      { candidateId: historicalCandidateIds.concurrent, candidateVersion: 1 },
      { candidateId: historicalCandidateIds.pagination, candidateVersion: 1 },
    ]);
  });

  it('reconciles grounded and ungrounded history append-only and replays exact IDs', async () => {
    const repository = requireRepository(first);
    const groundedBefore = await candidateSnapshot(requireSql(owner), historicalCandidateIds.grounded);
    const ungroundedBefore = await candidateSnapshot(requireSql(owner), historicalCandidateIds.ungrounded);

    const grounded = await repository.reconcileHistoricalCandidate(
      historicalReconciliationInput(historicalCandidateIds.grounded),
    );
    const groundedAfter = await candidateSnapshot(requireSql(owner), historicalCandidateIds.grounded);
    const groundedReplay = await repository.reconcileHistoricalCandidate(
      historicalReconciliationInput(historicalCandidateIds.grounded),
    );
    const ungrounded = await repository.reconcileHistoricalCandidate(
      historicalReconciliationInput(historicalCandidateIds.ungrounded),
    );
    const ungroundedAfter = await candidateSnapshot(requireSql(owner), historicalCandidateIds.ungrounded);
    const ungroundedReplay = await repository.reconcileHistoricalCandidate(
      historicalReconciliationInput(historicalCandidateIds.ungrounded),
    );

    expect(groundedBefore).toEqual(historicalSnapshot(historicalSignalIds.grounded));
    expect(grounded).toMatchObject({
      outcome: 'promoted',
      candidateVersion: 2,
      signalId: historicalSignalIds.grounded,
      evidenceId: expect.any(String),
      replayed: false,
    });
    expect(groundedAfter).toEqual(historicalSnapshot(historicalSignalIds.grounded, {
      reviewStatus: 'decided', version: 2, evidence: 1, links: 1,
      decisions: 1, audits: 1, receipts: 1, outbox: 1,
    }));
    expect(groundedReplay).toEqual({ ...grounded, replayed: true });
    expect(await candidateSnapshot(requireSql(owner), historicalCandidateIds.grounded))
      .toEqual(groundedAfter);

    expect(ungroundedBefore).toEqual(historicalSnapshot(historicalSignalIds.ungrounded));
    expect(ungrounded).toMatchObject({
      outcome: 'needs_review',
      candidateVersion: 2,
      signalId: null,
      evidenceId: null,
      replayed: false,
    });
    expect(ungroundedAfter).toEqual(historicalSnapshot(historicalSignalIds.ungrounded, {
      reviewStatus: 'needs_review', version: 2,
      decisions: 1, receipts: 1, outbox: 1,
    }));
    expect(ungroundedReplay).toEqual({ ...ungrounded, replayed: true });
    expect(await candidateSnapshot(requireSql(owner), historicalCandidateIds.ungrounded))
      .toEqual(ungroundedAfter);
  });

  it('rejects linked, stale, and revoked reconciliation without changing complete state', async () => {
    const repository = requireRepository(first);
    const linkedBefore = await candidateSnapshot(requireSql(owner), historicalCandidateIds.linked);
    const staleBefore = await candidateSnapshot(requireSql(owner), historicalCandidateIds.concurrent);
    const revokedBefore = await candidateSnapshot(requireSql(owner), historicalCandidateIds.pagination);

    await expect(repository.reconcileHistoricalCandidate(
      historicalReconciliationInput(historicalCandidateIds.linked),
    )).rejects.toMatchObject({ code: 'promotion_candidate_not_reviewable' });
    await expect(repository.reconcileHistoricalCandidate({
      ...historicalReconciliationInput(historicalCandidateIds.concurrent),
      expectedCandidateVersion: 2,
    })).rejects.toMatchObject({ code: 'promotion_version_conflict' });
    await expect(repository.reconcileHistoricalCandidate({
      ...historicalReconciliationInput(historicalCandidateIds.pagination),
      reviewerUserId: revokedReviewerId,
    })).rejects.toMatchObject({ code: 'promotion_reviewer_not_authorized' });

    expect(await candidateSnapshot(requireSql(owner), historicalCandidateIds.linked)).toEqual(linkedBefore);
    expect(await candidateSnapshot(requireSql(owner), historicalCandidateIds.concurrent)).toEqual(staleBefore);
    expect(await candidateSnapshot(requireSql(owner), historicalCandidateIds.pagination)).toEqual(revokedBefore);
  });

  it('serializes concurrent historical reconciliation to one result and one exact replay', async () => {
    const outcomes = await Promise.allSettled([
      requireRepository(first).reconcileHistoricalCandidate(
        historicalReconciliationInput(historicalCandidateIds.concurrent),
      ),
      requireRepository(second).reconcileHistoricalCandidate(
        historicalReconciliationInput(historicalCandidateIds.concurrent),
      ),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(2);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toEqual([]);
    const values = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? [outcome.value] : []);
    expect(values.map((value) => value.replayed).sort()).toEqual([false, true]);
    expect(new Set(values.map((value) => value.commandId)).size).toBe(1);
    expect(await candidateSnapshot(requireSql(owner), historicalCandidateIds.concurrent))
      .toEqual(historicalSnapshot(historicalSignalIds.concurrent, {
        reviewStatus: 'decided', version: 2, evidence: 1, links: 1,
        decisions: 1, audits: 1, receipts: 1, outbox: 1,
      }));
  });

  it('returns stable IDs on exact replay and rejects conflicting key reuse', async () => {
    const repository = requireRepository(first);
    const rejectBefore = await candidateSnapshot(requireSql(owner), candidateIds.reject);
    const needsReviewBefore = await candidateSnapshot(requireSql(owner), candidateIds.needsReview);
    const original = await repository.reviewCandidate(reviewInput(candidateIds.reject, 'replay-1', {
      decision: 'reject',
      reasonCode: 'claim_not_supported',
    }));
    const replay = await repository.reviewCandidate(reviewInput(candidateIds.reject, 'replay-1', {
      decision: 'reject',
      reasonCode: 'claim_not_supported',
    }));
    const afterOriginal = await candidateSnapshot(requireSql(owner), candidateIds.reject);

    expect(replay).toEqual({ ...original, replayed: true });
    expect(await candidateSnapshot(requireSql(owner), candidateIds.reject)).toEqual(afterOriginal);
    await expect(repository.reviewCandidate(reviewInput(candidateIds.needsReview, 'replay-1', {
      decision: 'needs_review',
      reasonCode: 'insufficient_context',
    }))).rejects.toMatchObject({ code: 'promotion_idempotency_conflict' });
    expect(afterOriginal).toEqual(reviewedSnapshot('rejected', 'decided', null, 1, {
      evidence: 0,
      signals: 0,
      links: 0,
      audits: 0,
    }));
    expect(afterOriginal).not.toEqual(rejectBefore);
    expect(await candidateSnapshot(requireSql(owner), candidateIds.reject)).toEqual(afterOriginal);
    expect(await candidateSnapshot(requireSql(owner), candidateIds.needsReview)).toEqual(needsReviewBefore);
  });

  it('rejects stale versions and revoked reviewers without receipts', async () => {
    const repository = requireRepository(first);
    const staleBefore = await candidateSnapshot(requireSql(owner), candidateIds.reject);
    const revokedBefore = await candidateSnapshot(requireSql(owner), candidateIds.needsReview);
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
    expect(await candidateSnapshot(requireSql(owner), candidateIds.reject)).toEqual(staleBefore);
    expect(await candidateSnapshot(requireSql(owner), candidateIds.needsReview)).toEqual(revokedBefore);
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
    expect(await candidateSnapshot(requireSql(owner), candidateIds.reject)).toEqual(
      reviewedSnapshot('rejected', 'decided', null, 1, {
        evidence: 0,
        signals: 0,
        links: 0,
        audits: 0,
      }),
    );
    expect(await candidateSnapshot(requireSql(owner), candidateIds.needsReview)).toEqual(
      reviewedSnapshot('pending', 'needs_review', null, 1, {
        evidence: 0,
        signals: 0,
        links: 0,
        audits: 0,
      }),
    );
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
    const promoted = fulfilled[0]?.status === 'fulfilled' ? fulfilled[0].value : undefined;
    expect(await candidateSnapshot(requireSql(owner), candidateIds.concurrent)).toEqual(
      reviewedSnapshot('promoted', 'decided', promoted?.signalId ?? null, 1),
    );
  });

  it('rolls back every approve-path record when outbox insertion fails', async () => {
    const database = requireSql(owner);
    await assertDisposableDatabase(database);
    const before = await candidateSnapshot(database, candidateIds.rollback);
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

      expect(await candidateSnapshot(database, candidateIds.rollback)).toEqual(before);
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
  reviewerUserId = activeReviewerId,
): ExecuteCandidateReviewInput {
  return {
    command: decision === null
      ? {
        version: 1,
        candidateId,
        reviewerUserId,
        expectedCandidateVersion: 1,
        decision: 'approve',
        reasonCode: 'evidence_verified',
        note: null,
      }
      : {
        version: 1,
        candidateId,
        reviewerUserId,
        expectedCandidateVersion: 1,
        decision: decision.decision,
        reasonCode: decision.reasonCode,
        note: null,
      } as ExecuteCandidateReviewInput['command'],
    idempotencyKey,
    occurredAt: baseTime,
  };
}

function historicalReconciliationInput(candidateId: string) {
  return {
    candidateId,
    reviewerUserId: activeReviewerId,
    expectedCandidateVersion: 1,
    idempotencyKey: `historical-evidence-v1:${candidateId}`,
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
      ),
      (
        ${securityReviewerId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'promotion-security@example.invalid',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        ${baseTime}::timestamptz, ${baseTime}::timestamptz
      ),
      (
        ${adminReviewerId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'promotion-admin@example.invalid',
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
      ),
      (${securityReviewerId}::uuid, 'security_reviewer', ${baseTime}::timestamptz, null),
      (${adminReviewerId}::uuid, 'admin', ${baseTime}::timestamptz, null)
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

  const allCandidateIds = [
    ...Object.values(candidateIds),
    ...Object.values(historicalCandidateIds),
  ];
  for (const [index, candidateId] of allCandidateIds.entries()) {
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
        ${String((index + 1) % 10).repeat(64)}, 'integration-model', 'extract-prompt-v1',
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
        ${((index + 1) % 16).toString(16).repeat(64)}, ${baseTime}::timestamptz
      )
    `;
  }

  for (const [kind, signalId] of Object.entries(historicalSignalIds)) {
    const candidateId = historicalCandidateIds[kind as keyof typeof historicalCandidateIds];
    const candidateIndex = allCandidateIds.indexOf(candidateId);
    await sql`
      insert into public.signals (
        id, project_id, signal_type, title, summary, verification, lifecycle,
        confidence, published_at, created_at
      ) values (
        ${signalId}::uuid, ${projectId}::uuid, 'historical_fixture',
        ${`Promotion candidate ${candidateIndex + 1}`},
        ${`Historical ${kind} signal remains canonically immutable.`},
        'unverified', 'published', 70,
        ${baseTime}::timestamptz, ${baseTime}::timestamptz
      )
    `;
    await sql`
      update public.extraction_candidates
      set status = 'promoted', signal_id = ${signalId}::uuid,
        decided_at = ${baseTime}::timestamptz
      where id = ${candidateId}::uuid
    `;
  }

  await sql`
    update public.extraction_candidates
    set payload = payload || pg_catalog.jsonb_build_object(
      'claimType', case id
        when ${candidateIds.securityRisk}::uuid then 'security_risk'
        else 'scam_indicator'
      end,
      'signalType', case id
        when ${candidateIds.securityRisk}::uuid then 'security_risk'
        else 'scam_indicator'
      end
    )
    where id in (${candidateIds.securityRisk}::uuid, ${candidateIds.scamIndicator}::uuid)
  `;

  await sql`
    update public.extraction_candidates
    set payload = jsonb_set(
      payload, '{evidenceQuote}', '"This historical quote is absent."'::jsonb
    )
    where id = ${historicalCandidateIds.ungrounded}::uuid
  `;
  const linkedIndex = allCandidateIds.indexOf(historicalCandidateIds.linked);
  const linkedDiscoveredItemId = `${namespace}${String(40 + linkedIndex).padStart(12, '0')}`;
  const linkedQuote = `Candidate ${linkedIndex + 1} public points program continues through week twelve.`;
  await sql`
    insert into public.evidence (
      id, source_id, raw_item_id, discovered_item_id, source_field, quote_text,
      normalized_quote_sha256, verified_at, created_at
    ) values (
      ${`${namespace}000000000086`}::uuid, ${sourceId}::uuid, ${feedRawItemId}::uuid,
      ${linkedDiscoveredItemId}::uuid, 'discovered_summary', ${linkedQuote},
      public.evidence_quote_sha256_v1(${linkedQuote}),
      ${baseTime}::timestamptz, ${baseTime}::timestamptz
    )
  `;
  await sql`
    insert into public.signal_evidence_links (signal_id, evidence_id, created_at)
    values (
      ${historicalSignalIds.linked}::uuid, ${`${namespace}000000000086`}::uuid,
      ${baseTime}::timestamptz
    )
  `;
}

async function dropRollbackTrigger(sql: postgres.Sql): Promise<void> {
  await assertDisposableDatabase(sql);
  await sql`drop trigger if exists reject_promotion_repository_outbox on public.outbox_events`;
  await sql`drop function if exists public.reject_promotion_repository_outbox()`;
}

async function removeFixtures(sql: postgres.Sql): Promise<void> {
  await assertDisposableDatabase(sql);
  await sql.begin(removeFixturesInTransaction);
}

async function removeFixturesInTransaction(transaction: TransactionSql): Promise<void> {
  await assertDisposableDatabase(transaction);
  await transaction`set local session_replication_role = replica`;
  const allCandidateIds = [...Object.values(candidateIds), ...Object.values(historicalCandidateIds)];
  await transaction`delete from public.outbox_events where aggregate_id in ${transaction(allCandidateIds)}`;
  await transaction`delete from public.promotion_commands where candidate_id in ${transaction(allCandidateIds)}`;
  await transaction`delete from public.promotion_events where candidate_id in ${transaction(allCandidateIds)}`;
  await transaction`delete from public.candidate_review_decisions where candidate_id in ${transaction(allCandidateIds)}`;
  await transaction`delete from public.security_incident_decisions where incident_id = ${securityIncidentId}::uuid`;
  await transaction`delete from public.security_incidents where id = ${securityIncidentId}::uuid`;
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
  const reviewerIds = [activeReviewerId, revokedReviewerId, securityReviewerId, adminReviewerId];
  await transaction`delete from public.user_roles where user_id = any(${reviewerIds}::uuid[])`;
  await transaction`delete from public.profiles where id = any(${reviewerIds}::uuid[])`;
  await transaction`delete from auth.users where id = any(${reviewerIds}::uuid[])`;
}

async function setProjectSecurityPosture(
  sql: postgres.Sql,
  posture: 'caution' | 'blocked',
): Promise<void> {
  if (posture === 'caution') {
    const quote = 'Candidate 1 public points program continues through week twelve.';
    await sql`
      insert into public.evidence (
        id, source_id, raw_item_id, discovered_item_id, source_field,
        quote_text, normalized_quote_sha256, verified_at, created_at
      ) values (
        ${securityEvidenceId}::uuid, ${sourceId}::uuid, ${feedRawItemId}::uuid,
        ${`${namespace}000000000040`}::uuid, 'discovered_summary', ${quote},
        public.evidence_quote_sha256_v1(${quote}), ${baseTime}::timestamptz,
        ${baseTime}::timestamptz
      )
    `;
    await sql`
      insert into public.security_incidents (
        id, target_type, project_id, category, opened_at, created_at
      ) values (
        ${securityIncidentId}::uuid, 'project', ${projectId}::uuid, 'phishing',
        ${baseTime}::timestamptz, ${baseTime}::timestamptz
      )
    `;
    await sql`
      insert into public.security_incident_decisions (
        incident_id, incident_version, reviewer_user_id, action, reason_code,
        resulting_posture, resulting_severity, public_summary, evidence_id, created_at
      ) values (
        ${securityIncidentId}::uuid, 1, ${activeReviewerId}::uuid, 'open',
        'precautionary_evidence', 'caution', 'high',
        'Grounded caution evidence requires security reviewer oversight.',
        ${securityEvidenceId}::uuid, ${baseTime}::timestamptz
      )
    `;
    return;
  }

  await sql`
    insert into public.security_incident_decisions (
      incident_id, incident_version, reviewer_user_id, action, reason_code,
      resulting_posture, resulting_severity, public_summary, evidence_id, created_at
    ) values (
      ${securityIncidentId}::uuid, 2, ${activeReviewerId}::uuid, 'adjust',
      'evidence_escalated', 'blocked', 'critical',
      'Escalated grounded evidence requires an immediate Promotion block.',
      ${securityEvidenceId}::uuid, ${baseTime}::timestamptz + interval '1 second'
    )
  `;
}

async function dropDisposableRole(sql: postgres.Sql, roleName: string): Promise<void> {
  await assertDisposableDatabase(sql);
  if (!/^promotion_repo_test_[0-9a-f]{32}$/.test(roleName)) {
    throw new Error('invalid_disposable_role_name');
  }
  const statement = await sql`
    select pg_catalog.format('drop role if exists %I', ${roleName}::text) as statement
  `;
  await sql.unsafe(requireStatement(statement[0]?.statement));
}

async function assertDisposableDatabase(sql: postgres.Sql | TransactionSql): Promise<void> {
  const rows = await sql`
    select id, slug, name, lifecycle
    from public.projects
    where id = ${disposableMarker.id}::uuid
  `;
  const marker = rows[0];
  if (
    marker?.id !== disposableMarker.id
    || marker.slug !== disposableMarker.slug
    || marker.name !== disposableMarker.name
    || marker.lifecycle !== disposableMarker.lifecycle
  ) {
    throw new Error('disposable_database_marker_missing');
  }
}

async function expectPromotionRoleDenied(
  sql: postgres.Sql,
  work: (transaction: TransactionSql) => Promise<unknown>,
): Promise<void> {
  await expect(sql.begin(async (transaction) => {
    await transaction`set local role promotion_service`;
    await work(transaction);
  })).rejects.toMatchObject({ code: '42501' });
}

async function candidateSnapshot(sql: postgres.Sql | TransactionSql, candidateId: string) {
  const rows = await sql`
    select candidate.status, candidate.review_status, candidate.version,
      candidate.signal_id,
      (select count(*)::integer from public.evidence as evidence
       where evidence.discovered_item_id = candidate.discovered_item_id) as evidence_count,
      (select count(*)::integer from public.signals as signal
       where signal.project_id = candidate.project_id
         and signal.title = candidate.payload ->> 'title') as signal_count,
      (select count(*)::integer
       from public.signal_evidence_links as link
       join public.signals as signal on signal.id = link.signal_id
       where signal.project_id = candidate.project_id
         and signal.title = candidate.payload ->> 'title') as link_count,
      (select count(*)::integer from public.candidate_review_decisions as decision
       where decision.candidate_id = candidate.id) as decision_count,
      (select count(*)::integer from public.promotion_events as event
       where event.candidate_id = candidate.id) as audit_count,
      (select count(*)::integer from public.promotion_commands as command
       where command.candidate_id = candidate.id) as receipt_count,
      (select count(*)::integer from public.outbox_events as event
       where event.aggregate_id = candidate.id) as outbox_count
    from public.extraction_candidates as candidate
    where candidate.id = ${candidateId}::uuid
  `;
  const row = rows[0];
  if (row === undefined) throw new Error('candidate_snapshot_missing');
  return row;
}

function reviewedSnapshot(
  status: 'pending' | 'promoted' | 'rejected',
  reviewStatus: 'pending' | 'needs_review' | 'decided',
  signalId: string | null,
  historyCount: number,
  canonicalCounts: {
    readonly evidence: number;
    readonly signals: number;
    readonly links: number;
    readonly audits: number;
  } = { evidence: 1, signals: 1, links: 1, audits: 1 },
) {
  return {
    status,
    review_status: reviewStatus,
    version: '2',
    signal_id: signalId,
    evidence_count: canonicalCounts.evidence,
    signal_count: canonicalCounts.signals,
    link_count: canonicalCounts.links,
    decision_count: historyCount,
    audit_count: canonicalCounts.audits,
    receipt_count: historyCount,
    outbox_count: historyCount,
  };
}

function historicalSnapshot(
  signalId: string,
  counts: {
    readonly reviewStatus?: 'pending' | 'needs_review' | 'decided';
    readonly version?: number;
    readonly evidence?: number;
    readonly links?: number;
    readonly decisions?: number;
    readonly audits?: number;
    readonly receipts?: number;
    readonly outbox?: number;
  } = {},
) {
  return {
    status: 'promoted',
    review_status: counts.reviewStatus ?? 'pending',
    version: String(counts.version ?? 1),
    signal_id: signalId,
    evidence_count: counts.evidence ?? 0,
    signal_count: 1,
    link_count: counts.links ?? 0,
    decision_count: counts.decisions ?? 0,
    audit_count: counts.audits ?? 0,
    receipt_count: counts.receipts ?? 0,
    outbox_count: counts.outbox ?? 0,
  };
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
