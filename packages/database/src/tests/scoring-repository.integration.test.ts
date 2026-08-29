import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createScoringRepository } from '../scoring/scoring-repository.js';

const projectId = '84000000-0000-4000-8000-000000000010';
const unevidencedOnlyProjectId = '84000000-0000-4000-8000-000000000011';
const sourceId = '84000000-0000-4000-8000-000000000020';
const rawItemId = '84000000-0000-4000-8000-000000000030';
const evidenceId = '84000000-0000-4000-8000-000000000070';
const evidencedSignalId = '84000000-0000-4000-8000-000000000080';
const unevidencedSignalId = '84000000-0000-4000-8000-000000000081';
const unevidencedOnlySignalId = '84000000-0000-4000-8000-000000000082';

const integrationDatabaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
const describeIntegration = integrationDatabaseUrl === undefined ? describe.skip : describe;

describeIntegration('ScoringRepository PostgreSQL integration', () => {
  const database =
    integrationDatabaseUrl === undefined ? null : postgres(integrationDatabaseUrl, { max: 1 });
  const repository = database === null ? null : createScoringRepository(database);

  beforeAll(async () => {
    if (database === null) {
      throw new Error('Database integration environment is unavailable.');
    }

    await database.unsafe('begin');
    await database`
      insert into public.projects (id, slug, name, lifecycle, created_at, updated_at)
      values
        (
          ${projectId}::uuid, 'scoring-evidence-gate', 'Scoring Evidence Gate', 'active',
          '2026-08-20T02:00:00.000Z', '2026-08-20T02:00:00.000Z'
        ),
        (
          ${unevidencedOnlyProjectId}::uuid, 'scoring-unevidenced-only',
          'Scoring Unevidenced Only', 'active',
          '2026-08-20T02:00:00.000Z', '2026-08-20T02:00:00.000Z'
        )
      on conflict (id) do nothing
    `;
    await database`
      insert into public.sources (
        id, source_type, name, canonical_url, status, created_at, updated_at
      ) values (
        ${sourceId}::uuid, 'official_web', 'Scoring Evidence Source',
        'https://scoring-evidence.example/', 'active',
        '2026-08-20T02:00:00.000Z', '2026-08-20T02:00:00.000Z'
      )
      on conflict (id) do nothing
    `;
    await database`
      insert into public.raw_items (
        id, project_id, source_id, logical_url, final_url, content_kind, media_type,
        raw_text, sha256, collected_at
      ) values (
        ${rawItemId}::uuid, ${projectId}::uuid, ${sourceId}::uuid,
        'https://scoring-evidence.example/article',
        'https://scoring-evidence.example/article',
        'feed_article_html', 'text/html',
        'A deterministic scoring Evidence fixture quote appears here.',
        ${'8'.repeat(64)}, '2026-08-20T02:01:00.000Z'
      )
      on conflict (id) do nothing
    `;
    await database`
      insert into public.signals (
        id, project_id, signal_type, title, summary, verification, lifecycle,
        confidence, published_at, created_at
      ) values
        (
          ${evidencedSignalId}::uuid, ${projectId}::uuid, 'evidenced',
          'Evidenced scoring signal', 'This scoring input has valid Evidence.',
          'unverified', 'published', 80,
          '2026-08-20T02:02:00.000Z', '2026-08-20T02:02:00.000Z'
        ),
        (
          ${unevidencedSignalId}::uuid, ${projectId}::uuid, 'unevidenced',
          'Unevidenced scoring signal', 'This scoring input has no Evidence.',
          'unverified', 'published', 70,
          '2026-08-20T02:03:00.000Z', '2026-08-20T02:03:00.000Z'
        ),
        (
          ${unevidencedOnlySignalId}::uuid, ${unevidencedOnlyProjectId}::uuid,
          'unevidenced', 'Only unevidenced scoring signal',
          'This project has no Evidence-gated scoring input.',
          'unverified', 'published', 60,
          '2026-08-20T02:03:00.000Z', '2026-08-20T02:03:00.000Z'
        )
      on conflict (id) do nothing
    `;
    await database`
      insert into public.evidence (
        id, source_id, raw_item_id, source_field, quote_text,
        normalized_quote_sha256, verified_at, created_at
      ) values (
        ${evidenceId}::uuid, ${sourceId}::uuid, ${rawItemId}::uuid,
        'article_raw_text', 'deterministic scoring Evidence fixture quote',
        public.evidence_quote_sha256_v1('deterministic scoring Evidence fixture quote'),
        '2026-08-20T02:04:00.000Z', '2026-08-20T02:04:00.000Z'
      )
      on conflict (id) do nothing
    `;
    await database`
      insert into public.signal_evidence_links (signal_id, evidence_id, created_at)
      values (
        ${evidencedSignalId}::uuid, ${evidenceId}::uuid,
        '2026-08-20T02:04:00.000Z'
      )
      on conflict (signal_id, evidence_id) do nothing
    `;
  });

  afterAll(async () => {
    if (database !== null) {
      try {
        // The single-connection transaction preserves append-only governance
        // history while keeping repeatable integration fixtures disposable.
        await database.unsafe('rollback');
      } finally {
        await database.end({ timeout: 5 });
      }
    }
  });

  it('returns only Evidence-gated published signals as scoring inputs', async () => {
    if (repository === null) {
      throw new Error('Database integration environment is unavailable.');
    }

    const inputs = await repository.listScoringInputs(1000);
    const fixture = inputs.find((input) => input.projectId === projectId);

    expect(fixture).toEqual({
      projectId,
      projectLifecycle: 'active',
      signals: [
        {
          signalId: evidencedSignalId,
          verification: 'unverified',
          confidence: 80,
          publishedAt: '2026-08-20T02:02:00.000Z',
          expiresAt: null,
          provenance: 'unknown',
        },
      ],
    });
    expect(fixture?.signals.map((signal) => signal.signalId)).not.toContain(unevidencedSignalId);
    expect(inputs.map((input) => input.projectId)).not.toContain(unevidencedOnlyProjectId);
  });
});

const securityProjectId = '85000000-0000-4000-8000-000000000010';
const securityClearSourceId = '85000000-0000-4000-8000-000000000020';
const securityAlternateSourceId = '85000000-0000-4000-8000-000000000021';
const securitySignalId = '85000000-0000-4000-8000-000000000080';
const securityReviewerId = '85000000-0000-4000-8000-000000000090';
const securityClearEvidenceId = '85000000-0000-4000-8000-000000000070';
const securityAlternateEvidenceId = '85000000-0000-4000-8000-000000000071';
const securityProjectIncidentId = '85000000-0000-4000-8000-000000000100';
const securityCautionSourceIncidentId = '85000000-0000-4000-8000-000000000101';
const securityAlternateBlockIncidentId = '85000000-0000-4000-8000-000000000102';
const securityRaceIncidentId = '85000000-0000-4000-8000-000000000103';

describeIntegration('ScoringRepository security gates and races', () => {
  const owner = integrationDatabaseUrl === undefined ? null : postgres(integrationDatabaseUrl, { max: 1 });
  const scorer = integrationDatabaseUrl === undefined ? null : postgres(integrationDatabaseUrl, { max: 1 });
  const blocker = integrationDatabaseUrl === undefined ? null : postgres(integrationDatabaseUrl, { max: 1 });
  const repository = scorer === null ? null : createScoringRepository(scorer);

  beforeAll(async () => {
    if (owner === null) throw new Error('Database integration environment is unavailable.');
    await removeSecurityScoringFixtures(owner);
    await owner`
      insert into auth.users (
        id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        ${securityReviewerId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'scoring-security@example.invalid',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
      )
    `;
    await owner`
      insert into public.projects (id, slug, name, lifecycle)
      values (${securityProjectId}::uuid, 'scoring-security-gate', 'Scoring Security Gate', 'active')
    `;
    await owner`
      insert into public.sources (id, source_type, name, canonical_url, status)
      values
        (${securityClearSourceId}::uuid, 'official_web', 'Scoring Clear Source',
          'https://scoring-clear.example/', 'active'),
        (${securityAlternateSourceId}::uuid, 'official_web', 'Scoring Alternate Source',
          'https://scoring-alternate.example/', 'active')
    `;
    await owner`
      insert into public.raw_items (
        id, project_id, source_id, logical_url, final_url, content_kind,
        media_type, raw_text, sha256, collected_at
      ) values
        (
          '85000000-0000-4000-8000-000000000030'::uuid,
          ${securityProjectId}::uuid, ${securityClearSourceId}::uuid,
          'https://scoring-clear.example/article', 'https://scoring-clear.example/article',
          'official_html', 'text/html', 'Clear scoring security evidence fixture text.',
          ${'a'.repeat(64)}, '2026-08-28T00:00:00.000Z'
        ),
        (
          '85000000-0000-4000-8000-000000000031'::uuid,
          ${securityProjectId}::uuid, ${securityAlternateSourceId}::uuid,
          'https://scoring-alternate.example/article', 'https://scoring-alternate.example/article',
          'official_html', 'text/html', 'Alternate scoring security evidence fixture text.',
          ${'b'.repeat(64)}, '2026-08-28T00:00:01.000Z'
        )
    `;
    await owner`
      insert into public.signals (
        id, project_id, signal_type, title, summary, verification, lifecycle,
        confidence, published_at, created_at
      ) values (
        ${securitySignalId}::uuid, ${securityProjectId}::uuid, 'security-gated',
        'Security-gated scoring signal', 'Security gate integration fixture.',
        'verified', 'published', 90,
        '2026-08-28T00:00:02.000Z', '2026-08-28T00:00:02.000Z'
      )
    `;
    await owner`
      insert into public.evidence (
        id, source_id, raw_item_id, source_field, quote_text,
        normalized_quote_sha256, verified_at, created_at
      ) values
        (
          ${securityClearEvidenceId}::uuid, ${securityClearSourceId}::uuid,
          '85000000-0000-4000-8000-000000000030'::uuid,
          'article_raw_text', 'Clear scoring security evidence fixture text.',
          public.evidence_quote_sha256_v1('Clear scoring security evidence fixture text.'),
          '2026-08-28T00:00:03.000Z', '2026-08-28T00:00:03.000Z'
        ),
        (
          ${securityAlternateEvidenceId}::uuid, ${securityAlternateSourceId}::uuid,
          '85000000-0000-4000-8000-000000000031'::uuid,
          'article_raw_text', 'Alternate scoring security evidence fixture text.',
          public.evidence_quote_sha256_v1('Alternate scoring security evidence fixture text.'),
          '2026-08-28T00:00:04.000Z', '2026-08-28T00:00:04.000Z'
        )
    `;
    await owner`
      insert into public.signal_evidence_links (signal_id, evidence_id, created_at)
      values
        (${securitySignalId}::uuid, ${securityClearEvidenceId}::uuid, '2026-08-28T00:00:05.000Z'),
        (${securitySignalId}::uuid, ${securityAlternateEvidenceId}::uuid, '2026-08-28T00:00:05.000Z')
    `;
  });

  afterAll(async () => {
    if (owner === null || scorer === null || blocker === null) return;
    try {
      await removeSecurityScoringFixtures(owner);
    } finally {
      await Promise.all([
        scorer.end({ timeout: 5 }),
        blocker.end({ timeout: 5 }),
      ]);
      await owner.end({ timeout: 5 });
    }
  });

  it('excludes caution projects and resumes automatic scoring after clear', async () => {
    if (repository === null || owner === null) throw new Error('Database integration environment is unavailable.');
    expect((await repository.listScoringInputs(1000)).map((input) => input.projectId)).toContain(
      securityProjectId,
    );
    await insertScoringIncident(owner, {
      incidentId: securityProjectIncidentId,
      decisionId: '85000000-0000-4000-8000-000000000110',
      targetType: 'project',
      targetId: securityProjectId,
      posture: 'caution',
      evidenceId: securityClearEvidenceId,
    });
    expect((await repository.listScoringInputs(1000)).map((input) => input.projectId)).not.toContain(
      securityProjectId,
    );
    await expect(repository.recordProjectScore(scoringRecord('project-caution'))).resolves.toEqual({
      projectScoreId: null,
      created: false,
      skippedReason: 'security_restricted',
    });

    await resolveScoringIncident(
      owner,
      securityProjectIncidentId,
      '85000000-0000-4000-8000-000000000111',
      securityClearEvidenceId,
    );
    expect((await repository.listScoringInputs(1000)).map((input) => input.projectId)).toContain(
      securityProjectId,
    );
  });

  it('excludes caution Evidence sources but keeps a clear alternative to blocked Evidence', async () => {
    if (repository === null || owner === null) throw new Error('Database integration environment is unavailable.');
    await insertScoringIncident(owner, {
      incidentId: securityCautionSourceIncidentId,
      decisionId: '85000000-0000-4000-8000-000000000112',
      targetType: 'source',
      targetId: securityClearSourceId,
      posture: 'caution',
      evidenceId: securityClearEvidenceId,
    });
    expect((await repository.listScoringInputs(1000)).map((input) => input.projectId)).not.toContain(
      securityProjectId,
    );
    await expect(repository.recordProjectScore(scoringRecord('source-caution'))).resolves.toEqual({
      projectScoreId: null,
      created: false,
      skippedReason: 'security_restricted',
    });
    await resolveScoringIncident(
      owner,
      securityCautionSourceIncidentId,
      '85000000-0000-4000-8000-000000000113',
      securityClearEvidenceId,
    );
    await insertScoringIncident(owner, {
      incidentId: securityAlternateBlockIncidentId,
      decisionId: '85000000-0000-4000-8000-000000000114',
      targetType: 'source',
      targetId: securityAlternateSourceId,
      posture: 'blocked',
      evidenceId: securityAlternateEvidenceId,
    });

    const input = (await repository.listScoringInputs(1000)).find(
      (candidate) => candidate.projectId === securityProjectId,
    );
    expect(input?.signals.map((signal) => signal.signalId)).toEqual([securitySignalId]);
    await expect(repository.recordProjectScore(scoringRecord('blocked-alternative'))).resolves.toMatchObject({
      created: true,
      skippedReason: null,
    });
  });

  it('skips persistence when a source block wins the advisory-lock race', async () => {
    if (repository === null || owner === null || blocker === null) {
      throw new Error('Database integration environment is unavailable.');
    }
    await blocker.unsafe('begin');
    let transactionOpen = true;
    let pendingScore: ReturnType<typeof repository.recordProjectScore> | null = null;
    try {
      await blocker`
        select pg_catalog.pg_advisory_xact_lock(
          public.security_target_lock_key_v1('source', ${securityClearSourceId}::uuid)
        )
      `;
      pendingScore = repository.recordProjectScore(scoringRecord('race-block-first'));
      await waitForAdvisoryWait(owner);
      await insertScoringIncident(blocker, {
        incidentId: securityRaceIncidentId,
        decisionId: '85000000-0000-4000-8000-000000000115',
        targetType: 'source',
        targetId: securityClearSourceId,
        posture: 'blocked',
        evidenceId: securityClearEvidenceId,
      });
      await blocker.unsafe('commit');
      transactionOpen = false;
      await expect(pendingScore).resolves.toEqual({
        projectScoreId: null,
        created: false,
        skippedReason: 'security_restricted',
      });
    } catch (error) {
      if (transactionOpen) await blocker.unsafe('rollback');
      throw error;
    } finally {
      await pendingScore?.catch(() => undefined);
    }
    const rows = await owner`
      select id from public.project_scores
      where project_id = ${securityProjectId}::uuid and input_version = 'race-block-first'
    `;
    expect(rows).toHaveLength(0);
  });

  it('locks blocked alternative Evidence before accepting a blocked-to-caution transition', async () => {
    if (repository === null || owner === null || blocker === null) {
      throw new Error('Database integration environment is unavailable.');
    }
    await resolveScoringIncident(
      owner,
      securityRaceIncidentId,
      '85000000-0000-4000-8000-000000000120',
      securityClearEvidenceId,
    );
    await blocker.unsafe('begin');
    let transactionOpen = true;
    let pendingScore: ReturnType<typeof repository.recordProjectScore> | null = null;
    try {
      await blocker`
        select pg_catalog.pg_advisory_xact_lock(
          public.security_target_lock_key_v1('source', ${securityClearSourceId}::uuid)
        )
      `;
      await blocker`
        select pg_catalog.pg_advisory_xact_lock(
          public.security_target_lock_key_v1('source', ${securityAlternateSourceId}::uuid)
        )
      `;
      pendingScore = repository.recordProjectScore(
        scoringRecord('race-blocked-to-caution'),
      );
      await waitForAdvisoryWait(owner);
      await adjustScoringIncidentToCaution(
        blocker,
        securityAlternateBlockIncidentId,
        '85000000-0000-4000-8000-000000000118',
        securityAlternateEvidenceId,
      );
      await blocker.unsafe('commit');
      transactionOpen = false;
      await expect(pendingScore).resolves.toEqual({
        projectScoreId: null,
        created: false,
        skippedReason: 'security_restricted',
      });
    } catch (error) {
      if (transactionOpen) await blocker.unsafe('rollback');
      throw error;
    } finally {
      await pendingScore?.catch(() => undefined);
    }
    const rows = await owner`
      select
        (select count(*)::integer from public.project_scores
          where project_id = ${securityProjectId}::uuid
            and input_version = 'race-blocked-to-caution') as scores,
        (select count(*)::integer from public.score_factors as factor
          join public.project_scores as score on score.id = factor.project_score_id
          where score.project_id = ${securityProjectId}::uuid
            and score.input_version = 'race-blocked-to-caution') as factors,
        (select count(*)::integer from public.score_signal_links as link
          join public.project_scores as score on score.id = link.project_score_id
          where score.project_id = ${securityProjectId}::uuid
            and score.input_version = 'race-blocked-to-caution') as links
    `;
    expect(rows[0]).toEqual({ scores: 0, factors: 0, links: 0 });
    await resolveScoringIncident(
      owner,
      securityAlternateBlockIncidentId,
      '85000000-0000-4000-8000-000000000119',
      securityAlternateEvidenceId,
      3,
    );
  });

  it('retains a score that committed before a later source block', async () => {
    if (repository === null || owner === null) throw new Error('Database integration environment is unavailable.');
    const committed = await repository.recordProjectScore(scoringRecord('ordinary-first'));
    expect(committed).toMatchObject({ created: true, skippedReason: null });
    await insertScoringIncident(owner, {
      incidentId: '85000000-0000-4000-8000-000000000104',
      decisionId: '85000000-0000-4000-8000-000000000117',
      targetType: 'source',
      targetId: securityClearSourceId,
      posture: 'blocked',
      evidenceId: securityClearEvidenceId,
    });
    const rows = await owner`
      select id::text from public.project_scores where id = ${committed.projectScoreId}::uuid
    `;
    expect(rows).toEqual([{ id: committed.projectScoreId }]);
  });
});

function scoringRecord(inputVersion: string) {
  return {
    projectId: securityProjectId,
    modelVersion: 'security-race-v1',
    inputVersion,
    opportunityScore: 70,
    riskScore: 40,
    confidence: 80,
    recommendation: 'watch' as const,
    explanation: 'Security race integration score.',
    calculatedAtIso: '2026-08-28T01:00:00.000Z',
    factors: [],
    linkedSignalIds: [securitySignalId],
  };
}

async function insertScoringIncident(sql: postgres.Sql, input: {
  readonly incidentId: string;
  readonly decisionId: string;
  readonly targetType: 'project' | 'source';
  readonly targetId: string;
  readonly posture: 'caution' | 'blocked';
  readonly evidenceId: string;
}): Promise<void> {
  if (input.targetType === 'project') {
    await sql`
      insert into public.security_incidents (id, target_type, project_id, category)
      values (${input.incidentId}::uuid, 'project', ${input.targetId}::uuid, 'source_compromise')
    `;
  } else {
    await sql`
      insert into public.security_incidents (id, target_type, source_id, category)
      values (${input.incidentId}::uuid, 'source', ${input.targetId}::uuid, 'source_compromise')
    `;
  }
  await sql`
    insert into public.security_incident_decisions (
      id, incident_id, incident_version, reviewer_user_id, action, reason_code,
      resulting_posture, resulting_severity, public_summary, evidence_id
    ) values (
      ${input.decisionId}::uuid, ${input.incidentId}::uuid, 1, ${securityReviewerId}::uuid,
      'open', 'precautionary_evidence', ${input.posture}, 'high',
      'Scoring security restriction fixture.', ${input.evidenceId}::uuid
    )
  `;
}

async function resolveScoringIncident(
  sql: postgres.Sql,
  incidentId: string,
  decisionId: string,
  evidenceId: string,
  incidentVersion = 2,
): Promise<void> {
  await sql`
    insert into public.security_incident_decisions (
      id, incident_id, incident_version, reviewer_user_id, action, reason_code,
      resulting_posture, resulting_severity, public_summary, evidence_id
    ) values (
      ${decisionId}::uuid, ${incidentId}::uuid, ${incidentVersion}, ${securityReviewerId}::uuid,
      'resolve', 'mitigation_verified', null, 'low',
      'Scoring security restriction resolved.', ${evidenceId}::uuid
    )
  `;
}

async function adjustScoringIncidentToCaution(
  sql: postgres.Sql,
  incidentId: string,
  decisionId: string,
  evidenceId: string,
): Promise<void> {
  await sql`
    insert into public.security_incident_decisions (
      id, incident_id, incident_version, reviewer_user_id, action, reason_code,
      resulting_posture, resulting_severity, public_summary, evidence_id
    ) values (
      ${decisionId}::uuid, ${incidentId}::uuid, 2, ${securityReviewerId}::uuid,
      'adjust', 'evidence_deescalated', 'caution', 'medium',
      'Scoring security restriction reduced.', ${evidenceId}::uuid
    )
  `;
}

async function waitForAdvisoryWait(sql: postgres.Sql): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await sql<readonly { waiting: number }[]>`
      select count(*)::integer as waiting
      from pg_catalog.pg_locks
      where locktype = 'advisory' and not granted
    `;
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('scoring_advisory_wait_not_observed');
}

async function removeSecurityScoringFixtures(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (transaction) => {
    await transaction`set local session_replication_role = replica`;
    await transaction`
      delete from public.score_signal_links
      where project_score_id in (
        select id from public.project_scores where project_id = ${securityProjectId}::uuid
      )
    `;
    await transaction`
      delete from public.score_factors
      where project_score_id in (
        select id from public.project_scores where project_id = ${securityProjectId}::uuid
      )
    `;
    await transaction`delete from public.project_scores where project_id = ${securityProjectId}::uuid`;
    await transaction`
      delete from public.security_incident_decisions
      where incident_id in (
        select id from public.security_incidents
        where project_id = ${securityProjectId}::uuid
          or source_id = any(${[securityClearSourceId, securityAlternateSourceId]}::uuid[])
      )
    `;
    await transaction`
      delete from public.security_incidents
      where project_id = ${securityProjectId}::uuid
        or source_id = any(${[securityClearSourceId, securityAlternateSourceId]}::uuid[])
    `;
    await transaction`delete from public.signal_evidence_links where signal_id = ${securitySignalId}::uuid`;
    await transaction`
      delete from public.evidence
      where id = any(${[securityClearEvidenceId, securityAlternateEvidenceId]}::uuid[])
    `;
    await transaction`delete from public.signals where project_id = ${securityProjectId}::uuid`;
    await transaction`delete from public.raw_items where project_id = ${securityProjectId}::uuid`;
    await transaction`
      delete from public.sources
      where id = any(${[securityClearSourceId, securityAlternateSourceId]}::uuid[])
    `;
    await transaction`delete from public.projects where id = ${securityProjectId}::uuid`;
    await transaction`delete from public.profiles where id = ${securityReviewerId}::uuid`;
    await transaction`delete from auth.users where id = ${securityReviewerId}::uuid`;
  });
}
