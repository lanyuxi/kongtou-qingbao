import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import type { SecurityCandidateReviewReceiptV1 } from '@airdrop/contracts';
import {
  createSecurityReviewRepository,
  SecurityReviewRepositoryError,
  type SecurityReviewRepository,
} from '../security/security-review-repository.js';

const fixturePausedMarker = {
  id: '90000000-0000-4000-8000-000000000019',
  slug: 'disposable-integration-database-marker',
  name: 'Disposable Integration Database Marker',
  lifecycle: 'paused',
} as const;

const password = `security-review-${randomUUID()}`;
const publicSummary = '发现仿冒领取页面，请勿访问该域名并立即停止任何提交。';
const fixture = {
  adminEmail: `security-admin-${randomUUID()}@example.invalid`,
  reviewerEmail: `security-reviewer-${randomUUID()}@example.invalid`,
  ordinaryEmail: `security-ordinary-${randomUUID()}@example.invalid`,
  revokedEmail: `security-revoked-${randomUUID()}@example.invalid`,
  targetA: {
    projectId: randomUUID(),
    sourceId: randomUUID(),
    rawItemId: randomUUID(),
    evidenceId: randomUUID(),
    domain: `${randomUUID().replaceAll('-', '')}-claim.example`,
  },
  targetB: {
    projectId: randomUUID(),
    sourceId: randomUUID(),
    rawItemId: randomUUID(),
    evidenceId: randomUUID(),
    domain: `${randomUUID().replaceAll('-', '')}-wallet.example`,
  },
} as const;

const integrationEnvironment = readIntegrationEnvironment();
const describeIntegration = integrationEnvironment === null ? describe.skip : describe;
const allFixtureProjectIds = [fixture.targetA.projectId, fixture.targetB.projectId] as const;
const allFixtureSourceIds = [fixture.targetA.sourceId, fixture.targetB.sourceId] as const;
const allFixtureRawItemIds = [fixture.targetA.rawItemId, fixture.targetB.rawItemId] as const;
const allFixtureEvidenceIds = [fixture.targetA.evidenceId, fixture.targetB.evidenceId] as const;

describeIntegration('SecurityReviewRepository PostgREST integration', () => {
  const owner = integrationEnvironment === null
    ? null
    : postgres(integrationEnvironment.databaseUrl, { max: 2, onnotice: () => {} });
  const adminAuth = integrationEnvironment === null
    ? null
    : createAuthClient(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey);
  const reviewerAuth = integrationEnvironment === null
    ? null
    : createAuthClient(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey);
  const ordinaryAuth = integrationEnvironment === null
    ? null
    : createAuthClient(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey);
  const revokedAuth = integrationEnvironment === null
    ? null
    : createAuthClient(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey);
  let adminAccessToken = '';
  let reviewerAccessToken = '';
  let ordinaryAccessToken = '';
  let revokedAccessToken = '';
  const createdUserIds = new Set<string>();
  let first: SecurityReviewRepository | null = null;
  let second: SecurityReviewRepository | null = null;

  beforeAll(async () => {
    const database = requireOwner(owner);
    const environment = requireEnvironment(integrationEnvironment);
    await assertFixturePausedMarker(database);

    const [adminClient, reviewerClient, ordinaryClient, revokedClient] = [
      requireAuth(adminAuth), requireAuth(reviewerAuth),
      requireAuth(ordinaryAuth), requireAuth(revokedAuth),
    ];
    const admin = await signUpFixture(
      adminClient, database, fixture.adminEmail, password,
      (userId) => createdUserIds.add(userId),
    );
    adminAccessToken = admin.accessToken;
    const reviewer = await signUpFixture(
      reviewerClient, database, fixture.reviewerEmail, password,
      (userId) => createdUserIds.add(userId),
    );
    reviewerAccessToken = reviewer.accessToken;
    const ordinary = await signUpFixture(
      ordinaryClient, database, fixture.ordinaryEmail, password,
      (userId) => createdUserIds.add(userId),
    );
    ordinaryAccessToken = ordinary.accessToken;
    const revoked = await signUpFixture(
      revokedClient, database, fixture.revokedEmail, password,
      (userId) => createdUserIds.add(userId),
    );
    revokedAccessToken = revoked.accessToken;

    await seedFixtures(database, [admin.userId, reviewer.userId, ordinary.userId, revoked.userId]);
    first = createSecurityReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.anonKey,
    });
    second = createSecurityReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.anonKey,
    });
  });

  afterAll(async () => {
    adminAccessToken = '';
    reviewerAccessToken = '';
    ordinaryAccessToken = '';
    revokedAccessToken = '';
    if (owner === null) return;
    try {
      const ownedAggregateIds = await removeExactFixtures(owner, [...createdUserIds]);
      await assertNoFixtureAggregateResidue(owner, ownedAggregateIds, 'afterAll');
    } finally {
      await owner.end({ timeout: 5 });
    }
  });

  it('runs the full submit, replay, conflict, accept and disclosure workflow', async () => {
    const repository = requireRepository(first);
    const submitted = await repository.submitManualCandidate({
      accessToken: adminAccessToken,
      idempotencyKey: `workflow-submit-${randomUUID()}`,
      command: manualCommand(fixture.targetA.projectId, fixture.targetA.evidenceId, fixture.targetA.domain),
    });
    expect(submitted).toMatchObject({ candidateId: expect.any(String), replayed: false });

    const detailBefore = await repository.getCandidate({
      accessToken: reviewerAccessToken,
      candidateId: submitted.candidateId,
    });
    expect(detailBefore).toMatchObject({
      origin: 'reviewer_manual',
      indicator: { type: 'domain', value: fixture.targetA.domain },
      target: { type: 'project', id: fixture.targetA.projectId },
    });

    const staleReview = await repository.reviewCandidate({
      accessToken: reviewerAccessToken,
      candidateId: submitted.candidateId,
      idempotencyKey: `stale-version-${randomUUID()}`,
      command: { ...needsReviewCommand(submitted.candidateId, 999) },
    }).catch((cause: unknown) => cause);
    expect(staleReview).toBeInstanceOf(SecurityReviewRepositoryError);
    expect((staleReview as SecurityReviewRepositoryError).code).toBe('security_version_conflict');

    const reviewCommand = acceptAndOpenCommand(
      submitted.candidateId,
      fixture.targetA.projectId,
      fixture.targetA.evidenceId,
      fixture.targetA.domain,
    );
    const accepted = asReviewReceipt(await repository.reviewCandidate({
      accessToken: reviewerAccessToken,
      candidateId: submitted.candidateId,
      idempotencyKey: `workflow-review-${randomUUID()}`,
      command: reviewCommand,
    }));
    expect(accepted).toMatchObject({
      candidateId: submitted.candidateId,
      state: 'accepted',
      incidentId: expect.any(String),
      indicatorId: expect.any(String),
      replayed: false,
    });

    const incidentDetail = await repository.getIncident({
      accessToken: reviewerAccessToken,
      incidentId: accepted.incidentId ?? '00000000-0000-4000-8000-000000000000',
    });
    expect(incidentDetail.incident).toMatchObject({
      state: 'active',
      currentPosture: 'blocked',
      category: 'phishing',
    });
    expect(incidentDetail.indicatorIds).toContain(accepted.indicatorId);

    const listed = await repository.listIncidents({
      accessToken: reviewerAccessToken,
      query: { state: 'active', targetType: 'project', cursor: null, limit: 100 },
    });
    expect(listed.items.some((item) => item.incidentId === accepted.incidentId)).toBe(true);

    const published = await repository.setIndicatorDisclosure({
      accessToken: reviewerAccessToken,
      indicatorId: accepted.indicatorId ?? '00000000-0000-4000-8000-000000000000',
      idempotencyKey: `workflow-publish-${randomUUID()}`,
      command: {
        version: 1,
        indicatorId: accepted.indicatorId ?? '',
        expectedIndicatorVersion: 1,
        decision: 'publish',
        reasonCode: 'safe_for_public_warning',
        note: null,
      },
    });
    expect(published).toMatchObject({ publicSafe: true, decision: 'publish', replayed: false });
  });

  it('replays identical manual submissions under one idempotency key', async () => {
    const repository = requireRepository(first);
    const idempotencyKey = `replay-submit-${randomUUID()}`;
    const command = manualCommand(fixture.targetA.projectId, fixture.targetA.evidenceId, fixture.targetA.domain);

    const firstResult = await repository.submitManualCandidate({
      accessToken: adminAccessToken,
      idempotencyKey,
      command,
    });
    const replay = await repository.submitManualCandidate({
      accessToken: adminAccessToken,
      idempotencyKey,
      command,
    });

    expect({ ...replay, replayed: false }).toEqual(firstResult);
    expect(firstResult.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
  });

  it('rejects the same idempotency key carrying a different payload', async () => {
    const repository = requireRepository(second);
    const idempotencyKey = `conflict-submit-${randomUUID()}`;

    await expect(repository.submitManualCandidate({
      accessToken: adminAccessToken,
      idempotencyKey,
      command: manualCommand(fixture.targetA.projectId, fixture.targetA.evidenceId, fixture.targetA.domain),
    })).resolves.toMatchObject({ replayed: false });

    const conflict = await repository.submitManualCandidate({
      accessToken: adminAccessToken,
      idempotencyKey,
      command: manualCommand(
        fixture.targetA.projectId,
        fixture.targetA.evidenceId,
        fixture.targetB.domain,
      ),
    }).catch((cause: unknown) => cause);

    expect(conflict).toBeInstanceOf(SecurityReviewRepositoryError);
    expect((conflict as SecurityReviewRepositoryError).code).toBe('security_idempotency_conflict');
  });

  it('denies every RPC operation for ordinary users and revoked reviewers', async () => {
    const repository = requireRepository(first);
    for (const accessToken of [ordinaryAccessToken, revokedAccessToken]) {
      await expect(repository.listCandidates({ accessToken, query: { origin: 'all', state: 'all', targetType: 'all', cursor: null, limit: 25 } }))
        .rejects.toMatchObject({ code: 'security_reviewer_required', message: 'security_reviewer_required' });
      await expect(repository.listIncidents({ accessToken, query: { state: 'all', targetType: 'all', cursor: null, limit: 25 } }))
        .rejects.toMatchObject({ code: 'security_reviewer_required' });
      await expect(repository.submitManualCandidate({
        accessToken,
        idempotencyKey: `denied-submit-${randomUUID()}`,
        command: manualCommand(fixture.targetA.projectId, fixture.targetA.evidenceId, fixture.targetA.domain),
      })).rejects.toMatchObject({ code: 'security_reviewer_required' });
    }
  });

  it('serializes two independent repositories racing the same review idempotency key', async () => {
    const firstRepository = requireRepository(first);
    const secondRepository = requireRepository(second);
    const submitted = await firstRepository.submitManualCandidate({
      accessToken: adminAccessToken,
      idempotencyKey: `race-submit-${randomUUID()}`,
      command: manualCommand(fixture.targetA.projectId, fixture.targetA.evidenceId, fixture.targetA.domain),
    });
    const idempotencyKey = `race-same-key-${randomUUID()}`;
    const command = acceptAndOpenCommand(
      submitted.candidateId,
      fixture.targetA.projectId,
      fixture.targetA.evidenceId,
      fixture.targetA.domain,
    );

    const outcomes = await Promise.all([
      firstRepository.reviewCandidate({
        accessToken: reviewerAccessToken,
        candidateId: submitted.candidateId,
        idempotencyKey,
        command,
      }),
      secondRepository.reviewCandidate({
        accessToken: reviewerAccessToken,
        candidateId: submitted.candidateId,
        idempotencyKey,
        command,
      }),
    ]);

    expect(outcomes.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(new Set(outcomes.map((result) => result.commandId))).toHaveLength(1);
    expect(new Set(outcomes.map((result) => asReviewReceipt(result).decisionId))).toHaveLength(1);
  });

  it('lets exactly one racing review with a different key win the same expected version', async () => {
    const firstRepository = requireRepository(first);
    const secondRepository = requireRepository(second);
    const submitted = await firstRepository.submitManualCandidate({
      accessToken: adminAccessToken,
      idempotencyKey: `race-different-key-submit-${randomUUID()}`,
      command: manualCommand(fixture.targetA.projectId, fixture.targetA.evidenceId, fixture.targetA.domain),
    });
    const command = acceptAndOpenCommand(
      submitted.candidateId,
      fixture.targetA.projectId,
      fixture.targetA.evidenceId,
      fixture.targetA.domain,
    );

    const outcomes = await Promise.allSettled([
      firstRepository.reviewCandidate({
        accessToken: reviewerAccessToken,
        candidateId: submitted.candidateId,
        idempotencyKey: `race-key-a-${randomUUID()}`,
        command,
      }),
      secondRepository.reviewCandidate({
        accessToken: reviewerAccessToken,
        candidateId: submitted.candidateId,
        idempotencyKey: `race-key-b-${randomUUID()}`,
        command,
      }),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    if (fulfilled[0]?.status === 'fulfilled') {
      expect(fulfilled[0].value).toMatchObject({ state: 'accepted', replayed: false });
    }
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === 'rejected') {
      expect(rejected[0].reason).toMatchObject({
        code: 'security_version_conflict',
        message: 'security_version_conflict',
      });
    }
  });

  it('keeps another target blocked active after resolving one incident', async () => {
    const repository = requireRepository(first);
    const acceptedA = asReviewReceipt(await reviewTargetAFresh(repository));
    const acceptedB = asReviewReceipt(await submitAndAcceptTargetB(repository));

    await repository.commandIncident({
      accessToken: reviewerAccessToken,
      incidentId: acceptedA.incidentId ?? '00000000-0000-4000-8000-000000000000',
      idempotencyKey: `independent-resolve-a-${randomUUID()}`,
      command: {
        version: 1,
        action: 'resolve',
        incidentId: acceptedA.incidentId ?? '',
        expectedIncidentVersion: 1,
        evidenceId: fixture.targetA.evidenceId,
        resultingSeverity: 'critical',
        publicSummary,
        reasonCode: 'mitigation_verified',
        note: null,
      },
    });

    const resolvedDetail = await repository.getIncident({
      accessToken: reviewerAccessToken,
      incidentId: acceptedA.incidentId ?? '00000000-0000-4000-8000-000000000000',
    });
    expect(resolvedDetail.incident.state).toBe('resolved');

    const stillActive = await repository.getIncident({
      accessToken: reviewerAccessToken,
      incidentId: acceptedB.incidentId ?? '00000000-0000-4000-8000-000000000001',
    });
    expect(stillActive.incident).toMatchObject({ state: 'active', currentPosture: 'blocked' });
  });

  async function reviewTargetAFresh(repository: SecurityReviewRepository) {
    const submitted = await repository.submitManualCandidate({
      accessToken: adminAccessToken,
      idempotencyKey: `block-a-submit-${randomUUID()}`,
      command: manualCommand(fixture.targetA.projectId, fixture.targetA.evidenceId, fixture.targetA.domain),
    });
    return repository.reviewCandidate({
      accessToken: reviewerAccessToken,
      candidateId: submitted.candidateId,
      idempotencyKey: `block-a-review-${randomUUID()}`,
      command: acceptAndOpenCommand(
        submitted.candidateId,
        fixture.targetA.projectId,
        fixture.targetA.evidenceId,
        fixture.targetA.domain,
      ),
    });
  }

  async function submitAndAcceptTargetB(repository: SecurityReviewRepository) {
    const submitted = await repository.submitManualCandidate({
      accessToken: adminAccessToken,
      idempotencyKey: `block-b-submit-${randomUUID()}`,
      command: manualCommand(fixture.targetB.projectId, fixture.targetB.evidenceId, fixture.targetB.domain),
    });
    return repository.reviewCandidate({
      accessToken: reviewerAccessToken,
      candidateId: submitted.candidateId,
      idempotencyKey: `block-b-review-${randomUUID()}`,
      command: acceptAndOpenCommand(
        submitted.candidateId,
        fixture.targetB.projectId,
        fixture.targetB.evidenceId,
        fixture.targetB.domain,
      ),
    });
  }
});

function asReviewReceipt(
  result: Awaited<ReturnType<SecurityReviewRepository['reviewCandidate']>>,
): SecurityCandidateReviewReceiptV1 {
  if (!('decisionId' in result)) throw new Error('security_review_receipt_missing');
  return result;
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
  registerUserId: (userId: string) => void,
): Promise<{ readonly userId: string; readonly accessToken: string }> {
  const signUp = await client.auth.signUp({ email, password: fixturePassword });
  if (signUp.error !== null || signUp.data.user === null) {
    throw new Error('security_review_auth_fixture_signup_failed');
  }
  const userId = signUp.data.user.id;
  registerUserId(userId);
  let session = signUp.data.session;
  if (session === null) {
    await owner`
      update auth.users set email_confirmed_at = now(), updated_at = now()
      where id = ${userId}::uuid
    `;
    const signIn = await client.auth.signInWithPassword({ email, password: fixturePassword });
    if (signIn.error !== null || signIn.data.session === null) {
      throw new Error('security_review_auth_fixture_signin_failed');
    }
    session = signIn.data.session;
  }
  return { userId, accessToken: session.access_token };
}

async function seedFixtures(
  sql: postgres.Sql,
  userIds: readonly string[],
): Promise<void> {
  const [adminUserId, reviewerUserId, ordinaryUserId, revokedUserId] = userIds;
  if (adminUserId === undefined || reviewerUserId === undefined
    || ordinaryUserId === undefined || revokedUserId === undefined) {
    throw new Error('security_review_fixture_user_missing');
  }
  await sql`
    insert into public.user_roles (user_id, role, granted_at, revoked_at) values
      (${adminUserId}::uuid, 'admin', now() - interval '2 hours', null),
      (${reviewerUserId}::uuid, 'security_reviewer', now() - interval '2 hours', null),
      (${ordinaryUserId}::uuid, 'user', now() - interval '2 hours', null),
      (${revokedUserId}::uuid, 'security_reviewer',
        now() - interval '2 hours', now() - interval '1 hour')
  `;
  for (const target of [fixture.targetA, fixture.targetB]) {
    await sql`
      insert into public.projects (id, slug, name, lifecycle)
      values (
        ${target.projectId}::uuid,
        ${`security-review-${target.projectId}`},
        'Security Review Integration Target', 'active'
      )
    `;
    await sql`
      insert into public.sources (id, source_type, name, canonical_url, status)
      values (
        ${target.sourceId}::uuid, 'official_web', 'Security Review Integration Source',
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
        'feed_article_html', 'text/html',
        ${`Suspicious claim activity at ${target.domain}; do not visit.`},
        ${randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')},
        now()
      )
    `;
    await sql`
      insert into public.evidence (
        id, source_id, raw_item_id, source_field, quote_text,
        normalized_quote_sha256, verified_at, created_at
      ) values (
        ${target.evidenceId}::uuid, ${target.sourceId}::uuid, ${target.rawItemId}::uuid,
        'article_raw_text',
        ${`Observed phishing page at ${target.domain}.`},
        ${String(await quoteSha256(sql, `Observed phishing page at ${target.domain}.`))},
        now(), now()
      )
    `;
  }
}

async function quoteSha256(sql: postgres.Sql, quoteText: string): Promise<string> {
  const rows = await sql`select public.evidence_quote_sha256_v1(${quoteText}) as sha`;
  const sha = rows[0]?.sha;
  if (typeof sha !== 'string' || sha.length !== 64) {
    throw new Error('security_review_fixture_sha_missing');
  }
  return sha;
}

function manualCommand(projectId: string, evidenceId: string, domain: string) {
  return {
    version: 1 as const,
    target: { type: 'project' as const, id: projectId },
    evidenceId,
    indicator: { type: 'domain' as const, value: domain },
    summary: 'Reviewer submitted this manual phishing report.',
    note: null,
  };
}

function acceptAndOpenCommand(candidateId: string, projectId: string, evidenceId: string, domain: string) {
  return {
    version: 1 as const,
    candidateId,
    expectedCandidateVersion: 1,
    decision: 'accept_and_open' as const,
    target: { type: 'project' as const, id: projectId },
    indicator: { type: 'domain' as const, value: domain },
    category: 'phishing' as const,
    resultingPosture: 'blocked' as const,
    resultingSeverity: 'critical' as const,
    publicSummary,
    evidenceId,
    reasonCode: 'evidence_verified' as const,
    note: null,
  };
}

function needsReviewCommand(candidateId: string, expectedCandidateVersion: number) {
  return {
    version: 1 as const,
    candidateId,
    expectedCandidateVersion,
    decision: 'needs_review' as const,
    reasonCode: 'insufficient_context' as const,
    note: null,
  };
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
): Promise<readonly string[]> {
  return owner.begin(async (transaction) => {
    await assertFixturePausedMarker(transaction);
    await transaction`set local session_replication_role = replica`;

    const candidateRows = await transaction`
      select id from public.security_indicator_candidates
      where project_id = any(${allFixtureProjectIds}::uuid[])
    `;
    const candidateIds = candidateRows.map((row) => row.id as string);
    const incidentRows = await transaction`
      select id from public.security_incidents
      where project_id = any(${allFixtureProjectIds}::uuid[])
    `;
    const incidentIds = incidentRows.map((row) => row.id as string);
    const linkedIndicatorRows = await transaction`
      select distinct link.indicator_id as id
      from public.security_incident_indicator_links as link
      where link.incident_id = any(${incidentIds}::uuid[])
    `;
    const decidedIndicatorRows = await transaction`
      select distinct decision.indicator_id as id
      from public.security_candidate_review_decisions as decision
      where decision.candidate_id = any(${candidateIds}::uuid[])
        and decision.indicator_id is not null
    `;
    const indicatorIds = [
      ...linkedIndicatorRows.map((row) => row.id as string),
      ...decidedIndicatorRows.map((row) => row.id as string),
    ];
    const aggregateIds = [...candidateIds, ...incidentIds, ...indicatorIds, ...allFixtureProjectIds];
    const ownedAggregateIds = [
      ...candidateIds,
      ...incidentIds,
      ...indicatorIds,
      ...allFixtureProjectIds,
      ...allFixtureSourceIds,
      ...allFixtureRawItemIds,
      ...allFixtureEvidenceIds,
    ];

    if (aggregateIds.length > 0) {
      await transaction`delete from public.outbox_events where aggregate_id = any(${aggregateIds}::uuid[])`;
    }
    await transaction`delete from public.security_incident_indicator_links where incident_id = any(${incidentIds}::uuid[])`;
    await transaction`delete from public.security_incident_decisions where incident_id = any(${incidentIds}::uuid[])`;
    await transaction`delete from public.security_incidents where id = any(${incidentIds}::uuid[])`;
    await transaction`delete from public.security_candidate_review_decisions where candidate_id = any(${candidateIds}::uuid[])`;
    await transaction`delete from public.security_review_commands where aggregate_id = any(${aggregateIds}::uuid[])`;
    await transaction`delete from public.security_indicator_evidence_links where indicator_id = any(${indicatorIds}::uuid[])`;
    await transaction`delete from public.security_indicators where id = any(${indicatorIds}::uuid[])`;
    await transaction`delete from public.security_events where aggregate_id = any(${aggregateIds}::uuid[])`;
    await transaction`delete from public.security_indicator_candidates where id = any(${candidateIds}::uuid[])`;
    await transaction`delete from public.evidence where id in ${transaction(allFixtureEvidenceIds)}`;
    await transaction`delete from public.raw_items where id in ${transaction(allFixtureRawItemIds)}`;
    await transaction`delete from public.sources where id in ${transaction(allFixtureSourceIds)}`;
    await transaction`delete from public.projects where id in ${transaction(allFixtureProjectIds)}`;
    if (userIds.length > 0) {
      await transaction`delete from public.user_roles where user_id = any(${[...userIds]}::uuid[])`;
      await transaction`delete from public.profiles where id = any(${[...userIds]}::uuid[])`;
      await transaction`delete from auth.users where id = any(${[...userIds]}::uuid[])`;
    }

    return ownedAggregateIds;
  });
}

/**
 * Runs after the cleanup transaction commits so a residue detection can never
 * roll the cleanup back. Every fixture aggregate this suite owns is a random
 * UUID generated per run (candidates, incidents, indicators, projects, sources,
 * raw items, and Evidence), so the filter can safely cover all of them without
 * touching another suite's fixtures.
 */
async function assertNoFixtureAggregateResidue(
  sql: postgres.Sql,
  aggregateIds: readonly string[],
  label: string,
): Promise<void> {
  if (aggregateIds.length === 0) {
    return;
  }

  const commandRows = await sql`
    select count(*)::int as total from public.security_review_commands
    where aggregate_id = any(${[...aggregateIds]}::uuid[])
  `;
  const eventRows = await sql`
    select count(*)::int as total from public.security_events
    where aggregate_id = any(${[...aggregateIds]}::uuid[])
  `;
  const outboxRows = await sql`
    select count(*)::int as total from public.outbox_events
    where aggregate_id = any(${[...aggregateIds]}::uuid[])
  `;
  const incidentRows = await sql`
    select count(*)::int as total from public.security_incidents
    where id = any(${[...aggregateIds]}::uuid[])
      or project_id = any(${[...aggregateIds]}::uuid[])
  `;
  const candidateRows = await sql`
    select count(*)::int as total from public.security_indicator_candidates
    where id = any(${[...aggregateIds]}::uuid[])
      or project_id = any(${[...aggregateIds]}::uuid[])
  `;

  const residue = {
    security_review_commands: commandRows[0]?.total ?? -1,
    security_events: eventRows[0]?.total ?? -1,
    outbox_events: outboxRows[0]?.total ?? -1,
    security_incidents: incidentRows[0]?.total ?? -1,
    security_indicator_candidates: candidateRows[0]?.total ?? -1,
  };
  if (Object.values(residue).some((total) => total !== 0)) {
    throw new Error(`fixture_aggregate_residue:${label}:${JSON.stringify(residue)}`);
  }
}

function requireRepository(
  repository: SecurityReviewRepository | null,
): SecurityReviewRepository {
  if (repository === null) throw new Error('Security review integration environment unavailable.');
  return repository;
}

function requireOwner(value: postgres.Sql | null): postgres.Sql {
  if (value === null) throw new Error('Security database integration environment unavailable.');
  return value;
}

function requireAuth(value: SupabaseClient<Database> | null): SupabaseClient<Database> {
  if (value === null) throw new Error('Security Auth integration environment unavailable.');
  return value;
}

function requireEnvironment(
  value: ReturnType<typeof readIntegrationEnvironment>,
): NonNullable<ReturnType<typeof readIntegrationEnvironment>> {
  if (value === null) throw new Error('Security integration environment unavailable.');
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
  const configuredValues = [databaseUrl, queueDatabaseUrl, supabaseUrl, anonKey].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );

  if (configuredValues.length === 0) {
    return null;
  }
  if (configuredValues.length !== 4 || databaseUrl === undefined || queueDatabaseUrl === undefined
    || supabaseUrl === undefined || anonKey === undefined) {
    throw new Error(
      'AIRDROP_DATABASE_TEST_URL, AIRDROP_QUEUE_ADMIN_DATABASE_TEST_URL, AIRDROP_ANON_SUPABASE_URL, and AIRDROP_ANON_SUPABASE_KEY must be configured together.',
    );
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
  const queueDatabase = new URL(queueDatabaseUrl);
  const api = new URL(supabaseUrl);
  if (!isExactDatabaseTunnel(database) || !isExactDatabaseTunnel(queueDatabase)) {
    throw new Error('integration_database_url_is_not_disposable_tunnel');
  }
  if (
    api.protocol !== 'http:' ||
    api.hostname !== '127.0.0.1' ||
    api.port !== '16433' ||
    api.pathname !== '/' ||
    api.username !== '' ||
    api.password !== '' ||
    api.search !== '' ||
    api.hash !== ''
  ) {
    throw new Error('integration_api_url_is_not_disposable_tunnel');
  }
}

function isExactDatabaseTunnel(url: URL): boolean {
  return (
    url.protocol === 'postgresql:' &&
    url.hostname === '127.0.0.1' &&
    url.port === '16432' &&
    url.pathname === '/postgres' &&
    url.search === '' &&
    url.hash === ''
  );
}
