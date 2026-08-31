import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import {
  createReferenceReviewRepository,
  type ReferenceReviewRepository,
} from '../references/reference-review-repository.js';

const fixturePausedMarker = {
  id: '90000000-0000-4000-8000-000000000019',
  slug: 'disposable-integration-database-marker',
  name: 'Disposable Integration Database Marker',
  lifecycle: 'paused',
} as const;

const fixturePassword = `reference-security-${randomUUID()}`;
const fixtureTargets = [
  fixtureTarget('reference-flag-first'),
  fixtureTarget('reference-verify-first'),
  fixtureTarget('authority-revoke-first'),
  fixtureTarget('authority-verify-first'),
  fixtureTarget('restore'),
  fixtureTarget('source-block'),
] as const;
const projectIds = fixtureTargets.map((target) => target.projectId);
const sourceIds = fixtureTargets.map((target) => target.sourceId);
const rawItemIds = fixtureTargets.map((target) => target.rawItemId);
const mismatchedEvidenceId = randomUUID();
const evidenceIds = [...fixtureTargets.map((target) => target.evidenceId), mismatchedEvidenceId];
const integrationEnvironment = readIntegrationEnvironment();
const describeIntegration = integrationEnvironment === null ? describe.skip : describe;

describeIntegration('reference security coupling PostgREST integration', () => {
  const owner = integrationEnvironment === null
    ? null
    : postgres(integrationEnvironment.databaseUrl, { max: 1, onnotice: () => {} });
  const blocker = integrationEnvironment === null
    ? null
    : postgres(integrationEnvironment.databaseUrl, { max: 1, onnotice: () => {} });
  const inserter = integrationEnvironment === null
    ? null
    : postgres(integrationEnvironment.databaseUrl, { max: 1, onnotice: () => {} });
  const authClients = integrationEnvironment === null
    ? []
    : [
      createAuthClient(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey),
      createAuthClient(integrationEnvironment.supabaseUrl, integrationEnvironment.anonKey),
    ];
  const createdUserIds = new Set<string>();
  const referenceIds = new Set<string>();
  const authorityIds = new Set<string>();
  const indicatorIds = new Set<string>();
  const incidentIds = new Set<string>();
  let adminAccessToken = '';
  let reviewerAccessToken = '';
  let reviewerUserId = '';
  let repository: ReferenceReviewRepository | null = null;
  let cleaned = false;

  beforeAll(async () => {
    const database = requireConnection(owner, 'owner');
    const environment = requireEnvironment(integrationEnvironment);
    await assertFixturePausedMarker(database);
    if (authClients.length !== 2) throw new Error('reference_security_auth_clients_missing');

    const [admin, reviewer] = await Promise.all([
      signUpFixture(
        authClients[0]!,
        database,
        `reference-security-admin-${randomUUID()}@example.invalid`,
        fixturePassword,
        createdUserIds,
      ),
      signUpFixture(
        authClients[1]!,
        database,
        `reference-security-reviewer-${randomUUID()}@example.invalid`,
        fixturePassword,
        createdUserIds,
      ),
    ]);
    adminAccessToken = admin.accessToken;
    reviewerAccessToken = reviewer.accessToken;
    reviewerUserId = reviewer.userId;
    await seedFixtures(database, admin.userId, reviewer.userId);
    repository = createReferenceReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.anonKey,
    });
  });

  afterAll(async () => {
    adminAccessToken = '';
    reviewerAccessToken = '';
    try {
      if (owner !== null && !cleaned) {
        await removeExactFixtures(
          owner, [...createdUserIds], referenceIds, authorityIds, indicatorIds, incidentIds,
        );
        await assertNoFixtureResidue(
          owner, [...createdUserIds], referenceIds, authorityIds, indicatorIds, incidentIds,
        );
      }
    } finally {
      await Promise.all([
        owner?.end({ timeout: 5 }),
        blocker?.end({ timeout: 5 }),
        inserter?.end({ timeout: 5 }),
      ]);
    }
  });

  it('serializes flag-first and verify-first on the same reference advisory key', async () => {
    const review = requireRepository(repository);
    const database = requireConnection(owner, 'owner');
    const blockingConnection = requireConnection(blocker, 'blocker');
    const indicatorConnection = requireConnection(inserter, 'inserter');

    const flagFirst = await registerReadyReference(review, fixtureTargets[0]);
    const flagFirstRace = await raceOnSecurityKey({
      blocker: blockingConnection,
      observer: database,
      targetType: 'reference',
      targetId: flagFirst.referenceId,
      first: async () => {
        const inserted = await insertMatchingDomainIndicator(indicatorConnection, flagFirst.domain);
        indicatorIds.add(inserted.indicatorId);
        return inserted;
      },
      second: () => review.decideReference({
        accessToken: reviewerAccessToken,
        referenceId: flagFirst.referenceId,
        idempotencyKey: `flag-first-verify-${randomUUID()}`,
        command: referenceDecision(flagFirst.referenceId, 1, 'verify', flagFirst.evidenceId),
      }),
    });
    expect(flagFirstRace.first).toMatchObject({ indicatorId: expect.any(String) });
    expect(flagFirstRace.second).toMatchObject({ code: 'reference_not_decidable' });
    await expectReferenceProjection(database, flagFirst.referenceId, 'flagged', false);
    await expectActiveFlag(database, flagFirst.referenceId, true);

    const verifyFirst = await registerReadyReference(review, fixtureTargets[1]);
    const verifyFirstRace = await raceOnSecurityKey({
      blocker: blockingConnection,
      observer: database,
      targetType: 'reference',
      targetId: verifyFirst.referenceId,
      first: () => review.decideReference({
        accessToken: reviewerAccessToken,
        referenceId: verifyFirst.referenceId,
        idempotencyKey: `verify-first-verify-${randomUUID()}`,
        command: referenceDecision(verifyFirst.referenceId, 1, 'verify', verifyFirst.evidenceId),
      }),
      second: async () => {
        const inserted = await insertMatchingDomainIndicator(indicatorConnection, verifyFirst.domain);
        indicatorIds.add(inserted.indicatorId);
        return inserted;
      },
    });
    expect(verifyFirstRace.first).toMatchObject({ referenceVersion: 2, state: 'verified' });
    expect(verifyFirstRace.second).toMatchObject({ indicatorId: expect.any(String) });
    await expectReferenceProjection(database, verifyFirst.referenceId, 'flagged', false);
    await expectActiveFlag(database, verifyFirst.referenceId, true);
  });

  it('serializes revoke-first and verify-first on the same authority advisory key', async () => {
    const review = requireRepository(repository);
    const database = requireConnection(owner, 'owner');
    const blockingConnection = requireConnection(blocker, 'blocker');

    const revokeFirst = await registerReadyReference(review, fixtureTargets[2]);
    const revokeFirstRace = await raceOnSecurityKey({
      blocker: blockingConnection,
      observer: database,
      targetType: 'domain_authority',
      targetId: revokeFirst.authorityId,
      first: () => review.decideDomainAuthority({
        accessToken: reviewerAccessToken,
        authorityId: revokeFirst.authorityId,
        idempotencyKey: `revoke-first-revoke-${randomUUID()}`,
        command: authorityDecision(revokeFirst.authorityId, 2, 'revoke', null),
      }),
      second: () => review.decideReference({
        accessToken: reviewerAccessToken,
        referenceId: revokeFirst.referenceId,
        idempotencyKey: `revoke-first-verify-${randomUUID()}`,
        command: referenceDecision(revokeFirst.referenceId, 1, 'verify', revokeFirst.evidenceId),
      }),
    });
    expect(revokeFirstRace.first).toMatchObject({ authorityVersion: 3, state: 'revoked' });
    expect(revokeFirstRace.second).toMatchObject({ code: 'reference_not_decidable' });
    await expectAuthorityState(database, revokeFirst.authorityId, 'revoked');
    await expectPublicReference(database, revokeFirst.referenceId, false);

    const verifyFirst = await registerReadyReference(review, fixtureTargets[3]);
    const verifyFirstRace = await raceOnSecurityKey({
      blocker: blockingConnection,
      observer: database,
      targetType: 'domain_authority',
      targetId: verifyFirst.authorityId,
      first: () => review.decideReference({
        accessToken: reviewerAccessToken,
        referenceId: verifyFirst.referenceId,
        idempotencyKey: `authority-verify-first-verify-${randomUUID()}`,
        command: referenceDecision(verifyFirst.referenceId, 1, 'verify', verifyFirst.evidenceId),
      }),
      second: () => review.decideDomainAuthority({
        accessToken: reviewerAccessToken,
        authorityId: verifyFirst.authorityId,
        idempotencyKey: `authority-verify-first-revoke-${randomUUID()}`,
        command: authorityDecision(verifyFirst.authorityId, 2, 'revoke', null),
      }),
    });
    expect(verifyFirstRace.first).toMatchObject({ referenceVersion: 2, state: 'verified' });
    expect(verifyFirstRace.second).toMatchObject({ authorityVersion: 3, state: 'revoked' });
    await expectAuthorityState(database, verifyFirst.authorityId, 'revoked');
    await expectPublicReference(database, verifyFirst.referenceId, false);
    const decisions = await database`
      select count(*)::integer as count from public.project_reference_decisions
      where reference_id = ${verifyFirst.referenceId}::uuid
    `;
    expect(decisions[0]?.count).toBe(2);
  });

  it('requires Evidence to restore and retains the released flag plus decision history', async () => {
    const review = requireRepository(repository);
    const database = requireConnection(owner, 'owner');
    const indicatorConnection = requireConnection(inserter, 'inserter');
    const target = await registerReadyReference(review, fixtureTargets[4]);
    await expect(review.decideReference({
      accessToken: reviewerAccessToken,
      referenceId: target.referenceId,
      idempotencyKey: `restore-verify-${randomUUID()}`,
      command: referenceDecision(target.referenceId, 1, 'verify', target.evidenceId),
    })).resolves.toMatchObject({ referenceVersion: 2, state: 'verified' });
    const restoreIndicator = await insertMatchingDomainIndicator(indicatorConnection, target.domain);
    indicatorIds.add(restoreIndicator.indicatorId);
    await expectReferenceProjection(database, target.referenceId, 'flagged', false);
    const before = await readReferenceMutationCounts(database, target.referenceId);
    const historyBeforeRestore = await readReferenceDecisionHistory(database, target.referenceId);
    const flagsBeforeRestore = await database`
      select released_at, released_by, release_evidence_id
      from public.reference_security_flags where reference_id = ${target.referenceId}::uuid
    `;
    expect(flagsBeforeRestore).toEqual([
      { released_at: null, released_by: null, release_evidence_id: null },
    ]);

    await expect(callDecideReferenceRestore(
      authClients[1]!,
      target.referenceId,
      `restore-missing-evidence-${randomUUID()}`,
      null,
    )).rejects.toMatchObject({ code: 'AR209' });
    expect(await readReferenceMutationCounts(database, target.referenceId)).toEqual(before);
    expect(await readReferenceDecisionHistory(database, target.referenceId)).toEqual(historyBeforeRestore);

    const mismatchedRawItem = fixtureTargets[5];
    expect(mismatchedRawItem.sourceId).not.toBe(target.sourceId);
    await insertMismatchedEvidence(database, target.sourceId, mismatchedRawItem);
    const mismatchedEvidence = await database`
      select evidence_row.source_id as evidence_source_id,
        raw_item_row.source_id as raw_item_source_id
      from public.evidence as evidence_row
      join public.raw_items as raw_item_row on raw_item_row.id = evidence_row.raw_item_id
      where evidence_row.id = ${mismatchedEvidenceId}::uuid
    `;
    expect(mismatchedEvidence).toEqual([{
      evidence_source_id: target.sourceId,
      raw_item_source_id: mismatchedRawItem.sourceId,
    }]);
    await expect(callDecideReferenceRestore(
      authClients[1]!,
      target.referenceId,
      `restore-mismatched-evidence-${randomUUID()}`,
      mismatchedEvidenceId,
    )).rejects.toMatchObject({ code: 'AR209' });
    expect(await readReferenceMutationCounts(database, target.referenceId)).toEqual(before);
    expect(await readReferenceDecisionHistory(database, target.referenceId)).toEqual(historyBeforeRestore);
    expect(await database`
      select released_at, released_by, release_evidence_id
      from public.reference_security_flags where reference_id = ${target.referenceId}::uuid
    `).toEqual(flagsBeforeRestore);

    await expect(review.decideReference({
      accessToken: reviewerAccessToken,
      referenceId: target.referenceId,
      idempotencyKey: `restore-with-evidence-${randomUUID()}`,
      command: referenceDecision(target.referenceId, 2, 'restore', target.evidenceId),
    })).resolves.toMatchObject({ referenceVersion: 3, state: 'verified' });
    await expectReferenceProjection(database, target.referenceId, 'verified', true);
    const flags = await database`
      select released_at, released_by, release_evidence_id
      from public.reference_security_flags where reference_id = ${target.referenceId}::uuid
    `;
    expect(flags).toHaveLength(1);
    const releasedAt = flags[0]?.released_at;
    expect(releasedAt).toBeInstanceOf(Date);
    expect(releasedAt?.getTime()).toSatisfy(Number.isFinite);
    expect(flags[0]).toMatchObject({
      released_by: reviewerUserId,
      release_evidence_id: target.evidenceId,
    });
    const after = await readReferenceMutationCounts(database, target.referenceId);
    expect(after).toEqual({ version: 3, decisions: before.decisions + 1, outbox: before.outbox + 1 });
    const historyAfterRestore = await readReferenceDecisionHistory(database, target.referenceId);
    expect(historyAfterRestore).toHaveLength(historyBeforeRestore.length + 1);
    expect(historyAfterRestore.slice(0, historyBeforeRestore.length)).toEqual(historyBeforeRestore);
    expect(historyAfterRestore.slice(historyBeforeRestore.length)).toEqual([
      expect.objectContaining({
        decision: 'restore',
        resultingState: 'verified',
        evidenceId: target.evidenceId,
        aggregateVersion: 3,
      }),
    ]);
  });

  it('waits on the Evidence source key and rejects verification when source blocking wins', async () => {
    const review = requireRepository(repository);
    const database = requireConnection(owner, 'owner');
    const blockingConnection = requireConnection(blocker, 'blocker');
    const target = await registerReadyReference(review, fixtureTargets[5]);
    const before = await readReferenceMutationCounts(database, target.referenceId);
    const blocked = await blockSourceBeforeVerification({
      blocker: blockingConnection,
      observer: database,
      sourceId: target.sourceId,
      evidenceId: target.evidenceId,
      reviewerUserId,
      ownedIncidentIds: incidentIds,
      verify: () => review.decideReference({
        accessToken: reviewerAccessToken,
        referenceId: target.referenceId,
        idempotencyKey: `source-block-verify-${randomUUID()}`,
        command: referenceDecision(target.referenceId, 1, 'verify', target.evidenceId),
      }),
    });
    expect(blocked.outcome).toMatchObject({ code: 'reference_evidence_required' });
    expect(await readReferenceMutationCounts(database, target.referenceId)).toEqual(before);
  });

  it('removes every Task 5 fixture and outbox row', async () => {
    const database = requireConnection(owner, 'owner');
    await removeExactFixtures(
      database, [...createdUserIds], referenceIds, authorityIds, indicatorIds, incidentIds,
    );
    await assertNoFixtureResidue(
      database, [...createdUserIds], referenceIds, authorityIds, indicatorIds, incidentIds,
    );
    cleaned = true;
  });

  async function registerReadyReference(
    review: ReferenceReviewRepository,
    target: FixtureTarget,
  ): Promise<RegisteredReference> {
    const domain = `reference-security-${target.projectId.replaceAll('-', '')}.example.invalid`;
    const authority = await review.registerDomainAuthority({
      accessToken: adminAccessToken,
      idempotencyKey: `authority-register-${randomUUID()}`,
      command: {
        version: 1,
        projectId: target.projectId,
        domain,
        evidenceId: target.evidenceId,
        note: 'Task 5 authority registration fixture.',
      },
    });
    await review.decideDomainAuthority({
      accessToken: reviewerAccessToken,
      authorityId: authority.authorityId,
      idempotencyKey: `authority-grant-${randomUUID()}`,
      command: authorityDecision(authority.authorityId, 1, 'grant', target.evidenceId),
    });
    const reference = await review.registerReference({
      accessToken: adminAccessToken,
      idempotencyKey: `reference-register-${randomUUID()}`,
      command: {
        version: 1,
        projectId: target.projectId,
        kind: 'claim_portal',
        url: `https://${domain}/claim`,
        label: 'Task 5 claim portal',
        evidenceId: target.evidenceId,
        note: 'Task 5 reference registration fixture.',
      },
    });
    authorityIds.add(authority.authorityId);
    referenceIds.add(reference.referenceId);
    return {
      authorityId: authority.authorityId,
      referenceId: reference.referenceId,
      domain,
      evidenceId: target.evidenceId,
      sourceId: target.sourceId,
    };
  }
});

type FixtureTarget = {
  readonly projectId: string;
  readonly sourceId: string;
  readonly rawItemId: string;
  readonly evidenceId: string;
  readonly slug: string;
};

type RegisteredReference = {
  readonly authorityId: string;
  readonly referenceId: string;
  readonly domain: string;
  readonly evidenceId: string;
  readonly sourceId: string;
};

function fixtureTarget(suffix: string): FixtureTarget {
  const projectId = randomUUID();
  return {
    projectId,
    sourceId: randomUUID(),
    rawItemId: randomUUID(),
    evidenceId: randomUUID(),
    slug: `reference-security-${suffix}-${projectId}`,
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
  password: string,
  userIds: Set<string>,
): Promise<{ readonly userId: string; readonly accessToken: string }> {
  const signUp = await client.auth.signUp({ email, password });
  if (signUp.error !== null || signUp.data.user === null) {
    throw new Error('reference_security_fixture_signup_failed');
  }
  const userId = signUp.data.user.id;
  userIds.add(userId);
  let session = signUp.data.session;
  if (session === null) {
    await owner`
      update auth.users set email_confirmed_at = now(), updated_at = now()
      where id = ${userId}::uuid
    `;
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error !== null || signIn.data.session === null) {
      throw new Error('reference_security_fixture_signin_failed');
    }
    session = signIn.data.session;
  }
  return { userId, accessToken: session.access_token };
}

async function seedFixtures(sql: postgres.Sql, adminUserId: string, reviewerUserId: string): Promise<void> {
  await sql`
    insert into public.user_roles (user_id, role, granted_at, revoked_at) values
      (${adminUserId}::uuid, 'admin', now() - interval '2 hours', null),
      (${reviewerUserId}::uuid, 'reviewer', now() - interval '2 hours', null)
  `;
  for (const target of fixtureTargets) {
    await sql`
      insert into public.projects (id, slug, name, lifecycle)
      values (${target.projectId}::uuid, ${target.slug}, 'Reference Security Fixture', 'active')
    `;
    await sql`
      insert into public.sources (id, source_type, name, canonical_url, status)
      values (
        ${target.sourceId}::uuid, 'official_web', 'Reference Security Source',
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
        'feed_article_html', 'text/html', 'Task 5 grounded reference evidence.',
        ${randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')}, now()
      )
    `;
    const quote = `Task 5 grounded reference evidence for ${target.projectId}.`;
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

async function insertMismatchedEvidence(
  sql: postgres.Sql,
  evidenceSourceId: string,
  rawItemTarget: FixtureTarget,
): Promise<void> {
  const quote = `Task 5 mismatched evidence for ${rawItemTarget.projectId}.`;
  await sql`
    insert into public.evidence (
      id, source_id, raw_item_id, source_field, quote_text,
      normalized_quote_sha256, verified_at, created_at
    ) values (
      ${mismatchedEvidenceId}::uuid, ${evidenceSourceId}::uuid, ${rawItemTarget.rawItemId}::uuid,
      'article_raw_text', ${quote}, ${await quoteSha256(sql, quote)}, now(), now()
    )
  `;
}

function authorityDecision(
  authorityId: string,
  expectedVersion: number,
  decision: 'grant' | 'revoke',
  evidenceId: string | null,
) {
  return {
    version: 1 as const,
    authorityId,
    expectedVersion,
    decision,
    reasonCode: decision === 'grant' ? 'evidence_verified' as const : 'source_no_longer_official' as const,
    evidenceId,
    note: null,
  };
}

function referenceDecision(
  referenceId: string,
  expectedVersion: number,
  decision: 'verify' | 'restore',
  evidenceId: string,
) {
  return {
    version: 1 as const,
    referenceId,
    expectedVersion,
    decision,
    reasonCode: decision === 'restore' ? 'security_flag_cleared' as const : 'evidence_verified' as const,
    evidenceId,
    note: null,
  };
}

async function insertMatchingDomainIndicator(
  sql: postgres.Sql,
  domain: string,
): Promise<{ readonly indicatorId: string }> {
  const indicatorId = randomUUID();
  await sql`
    insert into public.security_indicators (
      id, indicator_type, value_text, normalized_value_sha256
    ) values (
      ${indicatorId}::uuid, 'domain', ${domain}, public.security_indicator_value_sha256_v1(${domain})
    )
  `;
  return { indicatorId };
}

async function raceOnSecurityKey<First, Second>(input: {
  readonly blocker: postgres.Sql;
  readonly observer: postgres.Sql;
  readonly targetType: 'reference' | 'domain_authority';
  readonly targetId: string;
  readonly first: () => Promise<First>;
  readonly second: () => Promise<Second>;
}): Promise<{ readonly first: First | unknown; readonly second: Second | unknown }> {
  const ready = deferred<number>();
  const release = deferred<boolean>();
  const blockerTransaction = input.blocker.begin(async (transaction) => {
    const pidRows = await transaction<readonly { pid: number }[]>`select pg_backend_pid() as pid`;
    const pid = pidRows[0]?.pid;
    if (pid === undefined) throw new Error('reference_security_blocker_pid_missing');
    await transaction`
      select pg_catalog.pg_advisory_xact_lock(
        public.security_target_lock_key_v1(${input.targetType}, ${input.targetId}::uuid)
      )
    `;
    ready.resolve(pid);
    if (!await release.promise) throw new Error('reference_security_blocker_rollback');
  });
  let released = false;
  let first: Promise<First> | null = null;
  let second: Promise<Second> | null = null;
  try {
    const blockerPid = await ready.promise;
    first = input.first();
    await waitForBlockedAdvisoryLock(input.observer, blockerPid, 1);
    second = input.second();
    await waitForBlockedAdvisoryLock(input.observer, blockerPid, 2);
    release.resolve(true);
    released = true;
    await blockerTransaction;
    const [firstOutcome, secondOutcome] = await Promise.allSettled([first, second]);
    return {
      first: firstOutcome.status === 'fulfilled' ? firstOutcome.value : firstOutcome.reason,
      second: secondOutcome.status === 'fulfilled' ? secondOutcome.value : secondOutcome.reason,
    };
  } finally {
    if (!released) {
      release.resolve(false);
      await expectBlockerRollback(blockerTransaction, 'reference_security_blocker_rollback');
      await Promise.allSettled([first, second].filter(
        (operation): operation is Exclude<typeof operation, null> => operation !== null,
      ));
    }
  }
}

async function blockSourceBeforeVerification<Result>(input: {
  readonly blocker: postgres.Sql;
  readonly observer: postgres.Sql;
  readonly sourceId: string;
  readonly evidenceId: string;
  readonly reviewerUserId: string;
  readonly ownedIncidentIds: Set<string>;
  readonly verify: () => Promise<Result>;
}): Promise<{ readonly outcome: Result | unknown; readonly incidentId: string }> {
  const ready = deferred<number>();
  const writeSourceBlock = deferred<boolean>();
  const sourceBlockWritten = deferred<void>();
  const release = deferred<boolean>();
  const incidentId = randomUUID();
  input.ownedIncidentIds.add(incidentId);
  const blockerTransaction = input.blocker.begin(async (transaction) => {
    const pidRows = await transaction<readonly { pid: number }[]>`select pg_backend_pid() as pid`;
    const pid = pidRows[0]?.pid;
    if (pid === undefined) throw new Error('reference_security_source_blocker_pid_missing');
    await transaction`
      select pg_catalog.pg_advisory_xact_lock(
        public.security_target_lock_key_v1('source', ${input.sourceId}::uuid)
      )
    `;
    ready.resolve(pid);
    if (!await writeSourceBlock.promise) {
      throw new Error('reference_security_source_blocker_rollback');
    }
    await insertBlockedSourceIncident(
      transaction,
      incidentId,
      input.sourceId,
      input.evidenceId,
      input.reviewerUserId,
    );
    sourceBlockWritten.resolve();
    if (!await release.promise) throw new Error('reference_security_source_blocker_rollback');
  });
  let released = false;
  let verification: Promise<Result> | null = null;
  try {
    const blockerPid = await ready.promise;
    verification = input.verify();
    await waitForBlockedAdvisoryLock(input.observer, blockerPid, 1);
    writeSourceBlock.resolve(true);
    await sourceBlockWritten.promise;
    release.resolve(true);
    released = true;
    await blockerTransaction;
    const outcome = await verification.then(
      (value) => value,
      (error: unknown) => error,
    );
    return { outcome, incidentId };
  } finally {
    if (!released) {
      writeSourceBlock.resolve(false);
      release.resolve(false);
      await expectBlockerRollback(blockerTransaction, 'reference_security_source_blocker_rollback');
      if (verification !== null) await Promise.allSettled([verification]);
    }
  }
}

async function insertBlockedSourceIncident(
  sql: postgres.Sql | TransactionSql,
  incidentId: string,
  sourceId: string,
  evidenceId: string,
  reviewerUserId: string,
): Promise<void> {
  await sql`
    insert into public.security_incidents (id, target_type, source_id, category)
    values (${incidentId}::uuid, 'source', ${sourceId}::uuid, 'source_compromise')
  `;
  await sql`
    insert into public.security_incident_decisions (
      incident_id, incident_version, reviewer_user_id, action, reason_code,
      resulting_posture, resulting_severity, public_summary, note, evidence_id
    ) values (
      ${incidentId}::uuid, 1, ${reviewerUserId}::uuid, 'open', 'precautionary_evidence',
      'blocked', 'critical', 'Task 5 blocks the Evidence source before reference verification.',
      null, ${evidenceId}::uuid
    )
  `;
}

async function waitForBlockedAdvisoryLock(
  observer: postgres.Sql,
  blockerPid: number,
  expectedWaiters: number,
): Promise<void> {
  const deadline = performance.now() + 1_000;
  do {
    const rows = await observer<readonly { waiting: number }[]>`
      select count(*)::integer as waiting
      from pg_catalog.pg_locks as waiting
      where waiting.locktype = 'advisory'
        and not waiting.granted
        and exists (
          select 1
          from pg_catalog.pg_locks as held
          where held.pid = ${blockerPid}
            and held.locktype = 'advisory'
            and held.granted
            and held.classid = waiting.classid
            and held.objid = waiting.objid
            and held.objsubid = waiting.objsubid
        )
    `;
    if ((rows[0]?.waiting ?? 0) === expectedWaiters) return;
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(10, remaining)));
  } while (performance.now() < deadline);
  throw new Error(`reference_security_advisory_wait_not_observed:${expectedWaiters}`);
}

async function expectBlockerRollback(
  transaction: Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await transaction;
  } catch (error) {
    if (error instanceof Error && error.message === expectedMessage) return;
    throw error;
  }
  throw new Error(`reference_security_blocker_committed_during_rollback:${expectedMessage}`);
}

async function callDecideReferenceRestore(
  client: SupabaseClient<Database>,
  referenceId: string,
  idempotencyKey: string,
  evidenceId: string | null,
): Promise<void> {
  const response = await client.rpc('submit_decide_reference', {
    p_reference_id: referenceId,
    p_command_payload: {
      version: 1,
      referenceId,
      expectedVersion: 2,
      decision: 'restore',
      reasonCode: 'security_flag_cleared',
      evidenceId,
      note: null,
    },
    p_idempotency_key: idempotencyKey,
  });
  if (response.error !== null) throw response.error;
  throw new Error('reference_security_restore_with_invalid_evidence_succeeded');
}

async function readReferenceMutationCounts(
  sql: postgres.Sql,
  referenceId: string,
): Promise<{ readonly version: number; readonly decisions: number; readonly outbox: number }> {
  const rows = await sql<readonly { version: number; decisions: number; outbox: number }[]>`
    select
      reference_row.version::integer as version,
      (select count(*)::integer from public.project_reference_decisions
        where reference_id = ${referenceId}::uuid) as decisions,
      (select count(*)::integer from public.outbox_events
        where aggregate_type = 'reference' and aggregate_id = ${referenceId}::uuid) as outbox
    from public.project_references as reference_row
    where reference_row.id = ${referenceId}::uuid
  `;
  const row = rows[0];
  if (row === undefined) throw new Error('reference_security_reference_counts_missing');
  return row;
}

async function readReferenceDecisionHistory(
  sql: postgres.Sql,
  referenceId: string,
): Promise<readonly {
  readonly id: string;
  readonly decision: string;
  readonly resultingState: string;
  readonly evidenceId: string | null;
  readonly aggregateVersion: number;
}[]> {
  return sql<readonly {
    readonly id: string;
    readonly decision: string;
    readonly resultingState: string;
    readonly evidenceId: string | null;
    readonly aggregateVersion: number;
  }[]>`
    select
      decision.id,
      decision.decision,
      decision.resulting_state as "resultingState",
      decision.evidence_id as "evidenceId",
      decision.aggregate_version::integer as "aggregateVersion"
    from public.project_reference_decisions as decision
    where decision.reference_id = ${referenceId}::uuid
    order by decision.aggregate_version asc, decision.created_at asc, decision.id asc
  `;
}

async function expectReferenceProjection(
  sql: postgres.Sql,
  referenceId: string,
  state: string,
  publicVisible: boolean,
): Promise<void> {
  const rows = await sql`
    select current_state as state from public.project_reference_current_state
    where reference_id = ${referenceId}::uuid
  `;
  expect(rows[0]?.state).toBe(state);
  await expectPublicReference(sql, referenceId, publicVisible);
}

async function expectPublicReference(
  sql: postgres.Sql,
  referenceId: string,
  visible: boolean,
): Promise<void> {
  const rows = await sql`
    select count(*)::integer as count from public.public_project_references as public_reference
    where public_reference.reference_id = ${referenceId}::uuid
  `;
  expect(rows[0]?.count).toBe(visible ? 1 : 0);
}

async function expectActiveFlag(sql: postgres.Sql, referenceId: string, active: boolean): Promise<void> {
  const rows = await sql`
    select count(*)::integer as count from public.reference_security_flags
    where reference_id = ${referenceId}::uuid and released_at is null
  `;
  expect(rows[0]?.count).toBe(active ? 1 : 0);
}

async function expectAuthorityState(sql: postgres.Sql, authorityId: string, state: string): Promise<void> {
  const rows = await sql`
    select public.domain_authority_current_state_v1(${authorityId}::uuid) as state
  `;
  expect(rows[0]?.state).toBe(state);
}

async function quoteSha256(sql: postgres.Sql, quote: string): Promise<string> {
  const rows = await sql`select public.evidence_quote_sha256_v1(${quote}) as sha`;
  const sha = rows[0]?.sha;
  if (typeof sha !== 'string' || sha.length !== 64) {
    throw new Error('reference_security_quote_sha_missing');
  }
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
  ownedReferenceIds: ReadonlySet<string>,
  ownedAuthorityIds: ReadonlySet<string>,
  ownedIndicatorIds: ReadonlySet<string>,
  ownedIncidentIds: ReadonlySet<string>,
): Promise<void> {
  await owner.begin(async (transaction) => {
    await assertFixturePausedMarker(transaction);
    await transaction`set local session_replication_role = replica`;
    const referenceRows = await transaction`
      select id from public.project_references where project_id = any(${projectIds}::uuid[])
    `;
    const authorityRows = await transaction`
      select id from public.project_domain_authorities where project_id = any(${projectIds}::uuid[])
    `;
    const referenceIdsForCleanup = [...new Set([
      ...referenceRows.map((row) => row.id as string),
      ...ownedReferenceIds,
    ])];
    const authorityIdsForCleanup = [...new Set([
      ...authorityRows.map((row) => row.id as string),
      ...ownedAuthorityIds,
    ])];
    const indicatorIdsForCleanup = [...ownedIndicatorIds];
    const incidentIdsForCleanup = [...ownedIncidentIds];
    const aggregateIds = [
      ...projectIds,
      ...sourceIds,
      ...rawItemIds,
      ...evidenceIds,
      ...referenceIdsForCleanup,
      ...authorityIdsForCleanup,
      ...indicatorIdsForCleanup,
      ...incidentIdsForCleanup,
    ];

    await transaction`delete from public.outbox_events where aggregate_id = any(${aggregateIds}::uuid[])`;
    await transaction`delete from public.security_events where aggregate_id = any(${aggregateIds}::uuid[])`;
    await transaction`
      delete from public.security_incident_indicator_links
      where incident_id = any(${incidentIdsForCleanup}::uuid[])
    `;
    await transaction`
      delete from public.security_incident_decisions where incident_id = any(${incidentIdsForCleanup}::uuid[])
    `;
    await transaction`
      delete from public.security_indicator_evidence_links
      where indicator_id = any(${indicatorIdsForCleanup}::uuid[])
    `;
    await transaction`
      delete from public.reference_security_flags where reference_id = any(${referenceIdsForCleanup}::uuid[])
    `;
    await transaction`
      delete from public.project_reference_decisions where reference_id = any(${referenceIdsForCleanup}::uuid[])
    `;
    await transaction`
      delete from public.project_domain_authority_decisions
      where authority_id = any(${authorityIdsForCleanup}::uuid[])
    `;
    await transaction`
      delete from public.reference_review_commands
      where aggregate_id = any(${aggregateIds}::uuid[]) or actor_user_id = any(${userIds}::uuid[])
    `;
    await transaction`delete from public.security_indicators where id = any(${indicatorIdsForCleanup}::uuid[])`;
    await transaction`delete from public.security_incidents where id = any(${incidentIdsForCleanup}::uuid[])`;
    await transaction`delete from public.project_references where id = any(${referenceIdsForCleanup}::uuid[])`;
    await transaction`
      delete from public.project_domain_authorities where id = any(${authorityIdsForCleanup}::uuid[])
    `;
    await transaction`delete from public.evidence where id = any(${evidenceIds}::uuid[])`;
    await transaction`delete from public.raw_items where id = any(${rawItemIds}::uuid[])`;
    await transaction`delete from public.sources where id = any(${sourceIds}::uuid[])`;
    await transaction`delete from public.projects where id = any(${projectIds}::uuid[])`;
    await transaction`delete from public.user_roles where user_id = any(${userIds}::uuid[])`;
    await transaction`delete from public.profiles where id = any(${userIds}::uuid[])`;
    await transaction`delete from auth.users where id = any(${userIds}::uuid[])`;
  });
}

async function assertNoFixtureResidue(
  sql: postgres.Sql,
  userIds: readonly string[],
  ownedReferenceIds: ReadonlySet<string>,
  ownedAuthorityIds: ReadonlySet<string>,
  ownedIndicatorIds: ReadonlySet<string>,
  ownedIncidentIds: ReadonlySet<string>,
): Promise<void> {
  const aggregateIds = [
    ...projectIds,
    ...sourceIds,
    ...rawItemIds,
    ...evidenceIds,
    ...ownedReferenceIds,
    ...ownedAuthorityIds,
    ...ownedIndicatorIds,
    ...ownedIncidentIds,
  ];
  const rows = await sql`
    select
      (select count(*)::integer from public.project_references
        where project_id = any(${projectIds}::uuid[]) or id = any(${[...ownedReferenceIds]}::uuid[])) as references,
      (select count(*)::integer from public.project_domain_authorities
        where project_id = any(${projectIds}::uuid[]) or id = any(${[...ownedAuthorityIds]}::uuid[])) as authorities,
      (select count(*)::integer from public.reference_review_commands
        where aggregate_id = any(${aggregateIds}::uuid[]) or actor_user_id = any(${userIds}::uuid[])) as commands,
      (select count(*)::integer from public.user_roles
        where user_id = any(${userIds}::uuid[])) as user_roles,
      (select count(*)::integer from public.profiles
        where id = any(${userIds}::uuid[])) as profiles,
      (select count(*)::integer from public.reference_security_flags
        where reference_id = any(${[...ownedReferenceIds]}::uuid[])) as flags,
      (select count(*)::integer from public.project_reference_decisions
        where reference_id = any(${[...ownedReferenceIds]}::uuid[])) as reference_decisions,
      (select count(*)::integer from public.project_domain_authority_decisions
        where authority_id = any(${[...ownedAuthorityIds]}::uuid[])) as authority_decisions,
      (select count(*)::integer from public.security_indicators
        where id = any(${[...ownedIndicatorIds]}::uuid[])) as indicators,
      (select count(*)::integer from public.security_incidents
        where id = any(${[...ownedIncidentIds]}::uuid[])) as incidents,
      (select count(*)::integer from public.security_incident_decisions
        where incident_id = any(${[...ownedIncidentIds]}::uuid[])) as incident_decisions,
      (select count(*)::integer from public.security_incident_indicator_links
        where incident_id = any(${[...ownedIncidentIds]}::uuid[])
          or indicator_id = any(${[...ownedIndicatorIds]}::uuid[])) as incident_indicator_links,
      (select count(*)::integer from public.security_indicator_evidence_links
        where indicator_id = any(${[...ownedIndicatorIds]}::uuid[])) as indicator_evidence_links,
      (select count(*)::integer from public.security_events
        where aggregate_id = any(${aggregateIds}::uuid[])) as security_events,
      (select count(*)::integer from public.outbox_events
        where aggregate_id = any(${aggregateIds}::uuid[])) as outbox,
      (select count(*)::integer from public.evidence where id = any(${evidenceIds}::uuid[])) as evidence,
      (select count(*)::integer from public.raw_items where id = any(${rawItemIds}::uuid[])) as raw_items,
      (select count(*)::integer from public.sources where id = any(${sourceIds}::uuid[])) as sources,
      (select count(*)::integer from public.projects where id = any(${projectIds}::uuid[])) as projects,
      (select count(*)::integer from auth.users where id = any(${userIds}::uuid[])) as users
  `;
  const residue = rows[0];
  if (residue === undefined) {
    throw new Error('reference_security_fixture_residue:missing');
  }
  expect(residue.user_roles).toBe(0);
  expect(residue.profiles).toBe(0);
  expect(residue.incident_decisions).toBe(0);
  expect(residue.incident_indicator_links).toBe(0);
  expect(residue.indicator_evidence_links).toBe(0);
  if (Object.values(residue).some((count) => count !== 0)) {
    throw new Error(`reference_security_fixture_residue:${JSON.stringify(residue)}`);
  }
}

function deferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
} {
  let resolvePromise: ((value: Value) => void) | null = null;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (resolvePromise === null) throw new Error('reference_security_deferred_unavailable');
      resolvePromise(value);
    },
  };
}

function requireRepository(value: ReferenceReviewRepository | null): ReferenceReviewRepository {
  if (value === null) throw new Error('Reference security integration environment unavailable.');
  return value;
}

function requireConnection(value: postgres.Sql | null, label: string): postgres.Sql {
  if (value === null) throw new Error(`Reference security ${label} connection unavailable.`);
  return value;
}

function requireEnvironment(
  value: ReturnType<typeof readIntegrationEnvironment>,
): NonNullable<ReturnType<typeof readIntegrationEnvironment>> {
  if (value === null) throw new Error('Reference security integration environment unavailable.');
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
    throw new Error('reference_security_integration_environment_incomplete');
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
