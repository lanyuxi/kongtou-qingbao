import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import { ProjectEvidenceCitationQueryError } from '../repositories/project-score-evidence.js';
import { createProjectRepository } from '../repositories/project-repository.js';
import { createSecurityPublicRepository } from '../repositories/security-public-repository.js';

const fixtureProjectIds = [
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
] as const;
const fixtureProjectIdSet = new Set<string>(fixtureProjectIds);
const fixtureBlockedSourceId = randomUUID();
const fixtureAlternativeSourceId = randomUUID();
const fixtureRawItemIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()] as const;
const fixtureSignalIds = [randomUUID(), randomUUID(), randomUUID()] as const;
const fixtureEvidenceIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()] as const;
const fixtureScoreIds = [
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
] as const;
const fixtureFactorIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()] as const;
const fixtureProjectSecurityIncidentId = randomUUID();
const fixtureProjectSecurityDecisionId = randomUUID();
const fixtureBlockedSourceIncidentId = randomUUID();
const fixtureBlockedSourceDecisionId = randomUUID();
const fixtureAlternativeSourceIncidentId = randomUUID();
const fixtureAlternativeSourceDecisionId = randomUUID();
const fixtureSlugSuffixes = fixtureProjectIds.map((projectId) => projectId.replaceAll('-', ''));
const fixtureBlockedSourceHost = `${fixtureBlockedSourceId}.example.invalid`;
const fixtureAlternativeSourceHost = `${fixtureAlternativeSourceId}.example.invalid`;
const disposableMarker = {
  id: '90000000-0000-4000-8000-000000000019',
  slug: 'disposable-integration-database-marker',
  name: 'Disposable Integration Database Marker',
  lifecycle: 'paused',
} as const;

const integrationEnvironment = readIntegrationEnvironment();
const describeIntegration = integrationEnvironment === null ? describe.skip : describe;

describeIntegration('ProjectRepository PostgREST integration', () => {
  const database =
    integrationEnvironment === null
      ? null
      : postgres(integrationEnvironment.databaseUrl, { max: 1 });
  const repository =
    integrationEnvironment === null
      ? null
      : createProjectRepository(
          createClient<Database>(
            integrationEnvironment.supabaseUrl,
            integrationEnvironment.anonKey,
            {
              auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
            },
          ),
        );
  const publicSecurity =
    integrationEnvironment === null
      ? null
      : createSecurityPublicRepository(
          createClient<Database>(
            integrationEnvironment.supabaseUrl,
            integrationEnvironment.anonKey,
            {
              auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
            },
          ),
        );

  beforeAll(async () => {
    if (database === null) {
      throw new Error('PostgREST integration environment is unavailable.');
    }
    await assertDisposableDatabase(database);
    await database`
      insert into public.projects (id, slug, name, lifecycle)
      values
        (${fixtureProjectIds[0]}, ${`repository-active-${fixtureSlugSuffixes[0]}`}, 'Repository Active A', 'active'),
        (${fixtureProjectIds[1]}, ${`repository-active-${fixtureSlugSuffixes[1]}`}, 'Repository Active B', 'active'),
        (${fixtureProjectIds[2]}, ${`repository-rumored-${fixtureSlugSuffixes[2]}`}, 'Repository Rumored', 'rumored'),
        (${fixtureProjectIds[3]}, ${`repository-paused-${fixtureSlugSuffixes[3]}`}, 'Repository Paused', 'paused'),
        (${fixtureProjectIds[4]}, ${`repository-zero-links-${fixtureSlugSuffixes[4]}`}, 'Repository Zero Links', 'active')
    `;
    await database`
      insert into public.sources (id, source_type, name, canonical_url, status)
      values
        (${fixtureBlockedSourceId}::uuid, 'official_web', 'Repository Blocked Evidence Source', ${`https://${fixtureBlockedSourceHost}/`}, 'active'),
        (${fixtureAlternativeSourceId}::uuid, 'official_web', 'Repository Alternative Evidence Source', ${`https://${fixtureAlternativeSourceHost}/`}, 'active')
    `;
    await database`
      insert into public.project_sources (
        project_id, source_id, authority_domains, is_official,
        verified_at, verified_by, created_at
      ) values
        (${fixtureProjectIds[0]}::uuid, ${fixtureBlockedSourceId}::uuid, ${[fixtureBlockedSourceHost]}, true, '2026-08-23T12:00:00.000Z', '90000000-0000-4000-8000-000000000001'::uuid, '2026-08-23T12:00:00.000Z'),
        (${fixtureProjectIds[0]}::uuid, ${fixtureAlternativeSourceId}::uuid, ${[fixtureAlternativeSourceHost]}, true, '2026-08-23T12:00:00.000Z', '90000000-0000-4000-8000-000000000001'::uuid, '2026-08-23T12:00:00.000Z'),
        (${fixtureProjectIds[1]}::uuid, ${fixtureBlockedSourceId}::uuid, ${[fixtureBlockedSourceHost]}, true, '2026-08-23T12:00:00.000Z', '90000000-0000-4000-8000-000000000001'::uuid, '2026-08-23T12:00:00.000Z'),
        (${fixtureProjectIds[2]}::uuid, ${fixtureBlockedSourceId}::uuid, '{}', false, null, null, '2026-08-23T12:00:00.000Z')
    `;
    await database`
      insert into public.raw_items (
        id, project_id, source_id, logical_url, final_url, content_kind, media_type,
        raw_text, sha256, collected_at
      ) values
        (${fixtureRawItemIds[0]}::uuid, ${fixtureProjectIds[0]}::uuid, ${fixtureBlockedSourceId}::uuid, ${`https://${fixtureBlockedSourceHost}/active`}, ${`https://${fixtureBlockedSourceHost}/active`}, 'feed_article_html', 'text/html', 'First active repository citation.', ${'a'.repeat(64)}, '2026-08-09T00:00:00.000Z'),
        (${fixtureRawItemIds[1]}::uuid, ${fixtureProjectIds[0]}::uuid, ${fixtureAlternativeSourceId}::uuid, ${`https://${fixtureAlternativeSourceHost}/active`}, ${`https://${fixtureAlternativeSourceHost}/active`}, 'feed_article_html', 'text/html', 'Second active repository citation.', ${'b'.repeat(64)}, '2026-08-09T00:00:00.000Z'),
        (${fixtureRawItemIds[2]}::uuid, ${fixtureProjectIds[1]}::uuid, ${fixtureBlockedSourceId}::uuid, ${`https://${fixtureBlockedSourceHost}/active-b`}, ${`https://${fixtureBlockedSourceHost}/active-b`}, 'feed_article_html', 'text/html', 'Repository Evidence quote one.', ${'c'.repeat(64)}, '2026-08-09T00:00:00.000Z'),
        (${fixtureRawItemIds[3]}::uuid, ${fixtureProjectIds[2]}::uuid, ${fixtureBlockedSourceId}::uuid, ${`https://${fixtureBlockedSourceHost}/rumored`}, ${`https://${fixtureBlockedSourceHost}/rumored`}, 'feed_article_html', 'text/html', 'Repository Evidence quote two.', ${'d'.repeat(64)}, '2026-08-09T00:00:00.000Z')
    `;
    await database`
      insert into public.signals (
        id, project_id, signal_type, title, summary, verification, lifecycle, confidence,
        published_at, created_at
      ) values
        (${fixtureSignalIds[0]}::uuid, ${fixtureProjectIds[0]}::uuid, 'repository_fixture', 'Repository signal zero', 'Evidence-complete signal zero.', 'verified', 'published', 80, '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z'),
        (${fixtureSignalIds[1]}::uuid, ${fixtureProjectIds[1]}::uuid, 'repository_fixture', 'Repository signal one', 'Evidence-complete signal one.', 'corroborated', 'published', 80, '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z'),
        (${fixtureSignalIds[2]}::uuid, ${fixtureProjectIds[2]}::uuid, 'repository_fixture', 'Repository signal two', 'Evidence-complete signal two.', 'corroborated', 'published', 80, '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z')
      on conflict (id) do nothing
    `;
    await database`
      insert into public.evidence (
        id, source_id, raw_item_id, source_field, quote_text,
        normalized_quote_sha256, verified_at, created_at
      ) values
        (${fixtureEvidenceIds[0]}::uuid, ${fixtureBlockedSourceId}::uuid, ${fixtureRawItemIds[0]}::uuid, 'article_raw_text', 'First active repository citation.', public.evidence_quote_sha256_v1('First active repository citation.'), '2026-08-09T00:02:00.000Z', '2026-08-09T00:02:00.000Z'),
        (${fixtureEvidenceIds[1]}::uuid, ${fixtureAlternativeSourceId}::uuid, ${fixtureRawItemIds[1]}::uuid, 'article_raw_text', 'Second active repository citation.', public.evidence_quote_sha256_v1('Second active repository citation.'), '2026-08-09T00:01:00.000Z', '2026-08-09T00:01:00.000Z'),
        (${fixtureEvidenceIds[2]}::uuid, ${fixtureBlockedSourceId}::uuid, ${fixtureRawItemIds[2]}::uuid, 'article_raw_text', 'Repository Evidence quote one.', public.evidence_quote_sha256_v1('Repository Evidence quote one.'), '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z'),
        (${fixtureEvidenceIds[3]}::uuid, ${fixtureBlockedSourceId}::uuid, ${fixtureRawItemIds[3]}::uuid, 'article_raw_text', 'Repository Evidence quote two.', public.evidence_quote_sha256_v1('Repository Evidence quote two.'), '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z')
    `;
    await database`
      insert into public.signal_evidence_links (signal_id, evidence_id)
      values
        (${fixtureSignalIds[0]}::uuid, ${fixtureEvidenceIds[0]}::uuid),
        (${fixtureSignalIds[0]}::uuid, ${fixtureEvidenceIds[1]}::uuid),
        (${fixtureSignalIds[1]}::uuid, ${fixtureEvidenceIds[2]}::uuid),
        (${fixtureSignalIds[2]}::uuid, ${fixtureEvidenceIds[3]}::uuid)
    `;
    await database`
      insert into public.project_scores (
        id,
        project_id,
        model_version,
        input_version,
        opportunity_score,
        risk_score,
        confidence,
        recommendation,
        explanation,
        calculated_at
      )
      values
        (${fixtureScoreIds[0]}::uuid, ${fixtureProjectIds[0]}, 'repository-test', 'active-a', 90, 20, 80, 'act_now', 'Fixture score.', '2026-08-09T00:00:00.000Z'),
        (${fixtureScoreIds[1]}::uuid, ${fixtureProjectIds[1]}, 'repository-test', 'active-b', 90, 30, 70, 'watch', 'Fixture score.', '2026-08-08T00:00:00.000Z'),
        (${fixtureScoreIds[2]}::uuid, ${fixtureProjectIds[2]}, 'repository-test', 'rumored', 80, 40, 60, 'research', 'Fixture score.', '2026-08-07T00:00:00.000Z'),
        (${fixtureScoreIds[3]}::uuid, ${fixtureProjectIds[3]}, 'repository-test', 'paused', 99, 10, 90, 'act_now', 'Fixture score.', '2026-08-10T00:00:00.000Z'),
        (${fixtureScoreIds[4]}::uuid, ${fixtureProjectIds[4]}, 'repository-test', 'zero-links', 100, 1, 99, 'act_now', 'Zero-link fixture score.', '2026-08-11T00:00:00.000Z'),
        (${fixtureScoreIds[5]}::uuid, ${fixtureProjectIds[0]}, 'repository-test', 'active-a-historical', 70, 50, 60, 'watch', 'Historical fixture score.', '2026-08-08T00:00:00.000Z')
    `;
    await database`
      insert into public.score_signal_links (project_score_id, signal_id)
      values
        (${fixtureScoreIds[0]}::uuid, ${fixtureSignalIds[0]}::uuid),
        (${fixtureScoreIds[1]}::uuid, ${fixtureSignalIds[1]}::uuid),
        (${fixtureScoreIds[2]}::uuid, ${fixtureSignalIds[2]}::uuid),
        (${fixtureScoreIds[5]}::uuid, ${fixtureSignalIds[0]}::uuid)
    `;
    await database`
      insert into public.score_factors (
        id, project_score_id, axis, factor_code, contribution, input_value, detail
      ) values
        (${fixtureFactorIds[0]}::uuid, ${fixtureScoreIds[0]}::uuid, 'opportunity', 'active_opportunity', 80, 80, 'Active opportunity factor.'),
        (${fixtureFactorIds[1]}::uuid, ${fixtureScoreIds[0]}::uuid, 'risk', 'active_risk', 30, 30, 'Active risk factor.'),
        (${fixtureFactorIds[2]}::uuid, ${fixtureScoreIds[0]}::uuid, 'confidence', 'active_confidence', 70, 70, 'Active confidence factor.'),
        (${fixtureFactorIds[3]}::uuid, ${fixtureScoreIds[2]}::uuid, 'opportunity', 'rumored_opportunity', 60, 60, 'Rumored opportunity factor.'),
        (${fixtureFactorIds[4]}::uuid, ${fixtureScoreIds[5]}::uuid, 'opportunity', 'historical_opportunity', 40, 40, 'Historical opportunity factor.')
    `;
  });

  afterAll(async () => {
    if (database === null) {
      return;
    }
    try {
      await database.begin(async (transaction) => {
        await assertDisposableDatabase(transaction);
        await transaction`set local session_replication_role = replica`;
        await deleteFixtureRows(transaction);
        await assertFixtureRowsDeleted(transaction);
      });
    } finally {
      await database.end({ timeout: 5 });
    }
  });

  it('returns only scored active or rumored fixtures in deterministic order', async () => {
    if (repository === null) {
      throw new Error('PostgREST integration environment is unavailable.');
    }
    const opportunities = await listAllOpportunities(repository);
    const equalScoreProjectIds = [fixtureProjectIds[0], fixtureProjectIds[1]].sort(
      (left, right) => left.localeCompare(right),
    );

    expect(
      opportunities
        .filter((opportunity) => fixtureProjectIdSet.has(opportunity.projectId))
        .map((opportunity) => opportunity.projectId),
    ).toEqual([...equalScoreProjectIds, fixtureProjectIds[2]]);
  });

  it('continues the real PostgREST cursor without a gap or duplicate', async () => {
    if (repository === null) {
      throw new Error('PostgREST integration environment is unavailable.');
    }
    const opportunities = await listAllOpportunities(repository);
    const opportunityIds = opportunities.map((opportunity) => opportunity.projectId);

    expect(new Set(opportunityIds)).toHaveLength(opportunityIds.length);
    expect(opportunityIds).toContain(fixtureProjectIds[0]);
    expect(opportunityIds).toContain(fixtureProjectIds[1]);
    expect(opportunityIds).toContain(fixtureProjectIds[2]);
  });

  it('preserves a zero-link score while excluding it from opportunities', async () => {
    if (database === null || repository === null) {
      throw new Error('PostgREST integration environment is unavailable.');
    }

    const scoreRows = await database`
      select count(*)::integer as count from public.project_scores
      where id = ${fixtureScoreIds[4]}::uuid
    `;
    const opportunities = await listAllOpportunities(repository);

    expect(scoreRows[0]?.count).toBe(1);
    expect(opportunities.map((opportunity) => opportunity.projectId)).not.toContain(
      fixtureProjectIds[4],
    );
  });

  it('reads one immutable current snapshot with its three independent score axes', async () => {
    if (repository === null) {
      throw new Error('PostgREST integration environment is unavailable.');
    }

    const detail = await repository.getProjectBySlug(
      `repository-active-${fixtureSlugSuffixes[0]}`,
    );
    const factors = await repository.listCurrentScoreFactors(
      fixtureProjectIds[0],
      fixtureScoreIds[0],
    );

    expect(detail?.latestScore?.id).toBe(fixtureScoreIds[0]);
    expect(factors).toHaveLength(3);
    expect(factors.map((factor) => factor.axis)).toEqual([
      'opportunity',
      'risk',
      'confidence',
    ]);
    expect(factors.map((factor) => Object.keys(factor).sort())).toEqual([
      ['axis', 'contribution', 'detail', 'factorCode', 'inputValue'],
      ['axis', 'contribution', 'detail', 'factorCode', 'inputValue'],
      ['axis', 'contribution', 'detail', 'factorCode', 'inputValue'],
    ]);
  });

  it('preserves two distinct grounded Evidence citations without unsafe metadata keys', async () => {
    if (repository === null) {
      throw new Error('PostgREST integration environment is unavailable.');
    }

    const citations = await repository
      .listCurrentScoreEvidenceCitations(fixtureProjectIds[0], fixtureScoreIds[0])
      .catch((error: unknown) => {
        if (error instanceof ProjectEvidenceCitationQueryError) {
          throw new Error(`project_evidence_citation_query_error_code:${error.code}`);
        }
        throw error;
      });
    const citedEvidence = citations
      .map((citation) => ({
        evidenceId: citation.evidenceId,
        citationText: citation.citationText,
      }))
      .sort((left, right) => left.citationText.localeCompare(right.citationText));

    expect(citations).toHaveLength(2);
    expect(citedEvidence).toEqual([
      {
        evidenceId: fixtureEvidenceIds[0],
        citationText: 'First active repository citation.',
      },
      {
        evidenceId: fixtureEvidenceIds[1],
        citationText: 'Second active repository citation.',
      },
    ]);
    expect(citations.map((citation) => Object.keys(citation).sort())).toEqual([
      [
        'citationText',
        'evidenceId',
        'evidenceSourceField',
        'evidenceVerifiedAt',
        'signalId',
        'signalPublishedAt',
        'signalTitle',
        'signalVerification',
        'sourceId',
        'sourceIsOfficial',
        'sourceName',
        'sourceRelationVerifiedAt',
        'sourceType',
      ],
      [
        'citationText',
        'evidenceId',
        'evidenceSourceField',
        'evidenceVerifiedAt',
        'signalId',
        'signalPublishedAt',
        'signalTitle',
        'signalVerification',
        'sourceId',
        'sourceIsOfficial',
        'sourceName',
        'sourceRelationVerifiedAt',
        'sourceType',
      ],
    ]);
    expect(
      citations.flatMap((citation) => Object.keys(citation)).filter((key) =>
        /url|raw|hash|reviewer|governance/i.test(key),
      ),
    ).toEqual([]);
  });

  it('exposes rumored current factors while keeping rumored citations private', async () => {
    if (repository === null) {
      throw new Error('PostgREST integration environment is unavailable.');
    }

    const factors = await repository.listCurrentScoreFactors(
      fixtureProjectIds[2],
      fixtureScoreIds[2],
    );
    const citations = await repository.listCurrentScoreEvidenceCitations(
      fixtureProjectIds[2],
      fixtureScoreIds[2],
    );

    expect(factors).toHaveLength(1);
    expect(factors[0]?.factorCode).toBe('rumored_opportunity');
    expect(citations).toEqual([]);
  });

  it('denies factors and citations for an active historical score ID', async () => {
    if (repository === null) {
      throw new Error('PostgREST integration environment is unavailable.');
    }

    expect(
      await repository.listCurrentScoreFactors(fixtureProjectIds[0], fixtureScoreIds[5]),
    ).toEqual([]);
    expect(
      await repository.listCurrentScoreEvidenceCitations(
        fixtureProjectIds[0],
        fixtureScoreIds[5],
      ),
    ).toEqual([]);
  });

  it('excludes blocked-source citations, retains a clear alternative, then removes the current score after the final eligible source is blocked', async () => {
    if (database === null || repository === null || publicSecurity === null) {
      throw new Error('PostgREST integration environment is unavailable.');
    }

    await database`
      insert into public.security_incidents (id, target_type, source_id, category)
      values (${fixtureBlockedSourceIncidentId}::uuid, 'source', ${fixtureBlockedSourceId}::uuid, 'phishing')
    `;
    await database`
      insert into public.security_incident_decisions (
        id, incident_id, incident_version, reviewer_user_id, action, reason_code,
        resulting_posture, resulting_severity, public_summary, evidence_id
      ) values (
        ${fixtureBlockedSourceDecisionId}::uuid, ${fixtureBlockedSourceIncidentId}::uuid, 1,
        '90000000-0000-4000-8000-000000000001'::uuid, 'open', 'precautionary_evidence',
        'blocked', 'critical',
        'The first source is blocked while a separately grounded alternative remains public.',
        ${fixtureEvidenceIds[0]}::uuid
      )
    `;

    const clearAlternativeCitations = await repository.listCurrentScoreEvidenceCitations(
      fixtureProjectIds[0],
      fixtureScoreIds[0],
    );
    expect(clearAlternativeCitations).toEqual([
      expect.objectContaining({
        evidenceId: fixtureEvidenceIds[1],
        citationText: 'Second active repository citation.',
        sourceId: fixtureAlternativeSourceId,
      }),
    ]);
    expect(
      await repository.listCurrentScoreFactors(fixtureProjectIds[0], fixtureScoreIds[0]),
    ).toHaveLength(3);
    expect(
      (await repository.getProjectBySlug(`repository-active-${fixtureSlugSuffixes[0]}`))?.latestScore?.id,
    ).toBe(fixtureScoreIds[0]);
    expect(await publicSecurity.getProjectSecurity(fixtureProjectIds[0])).toMatchObject({
      projectId: fixtureProjectIds[0],
      posture: 'clear',
    });

    await database`
      insert into public.security_incidents (id, target_type, source_id, category)
      values (${fixtureAlternativeSourceIncidentId}::uuid, 'source', ${fixtureAlternativeSourceId}::uuid, 'phishing')
    `;
    await database`
      insert into public.security_incident_decisions (
        id, incident_id, incident_version, reviewer_user_id, action, reason_code,
        resulting_posture, resulting_severity, public_summary, evidence_id
      ) values (
        ${fixtureAlternativeSourceDecisionId}::uuid, ${fixtureAlternativeSourceIncidentId}::uuid, 1,
        '90000000-0000-4000-8000-000000000001'::uuid, 'open', 'precautionary_evidence',
        'blocked', 'critical',
        'The final eligible source is blocked, so the complete score becomes historical only.',
        ${fixtureEvidenceIds[1]}::uuid
      )
    `;

    expect(
      await repository.listCurrentScoreEvidenceCitations(fixtureProjectIds[0], fixtureScoreIds[0]),
    ).toEqual([]);
    expect(
      await repository.listCurrentScoreFactors(fixtureProjectIds[0], fixtureScoreIds[0]),
    ).toEqual([]);
    expect(
      (await repository.getProjectBySlug(`repository-active-${fixtureSlugSuffixes[0]}`))?.latestScore,
    ).toBeNull();
    expect(await publicSecurity.getProjectSecurity(fixtureProjectIds[0])).toMatchObject({
      projectId: fixtureProjectIds[0],
      posture: 'clear',
    });
  });

  it('exposes a blocked project only through anonymous safe security projections', async () => {
    if (database === null || publicSecurity === null) {
      throw new Error('PostgREST integration environment is unavailable.');
    }

    await database`
      insert into public.security_incidents (id, target_type, project_id, category)
      values (${fixtureProjectSecurityIncidentId}::uuid, 'project', ${fixtureProjectIds[0]}::uuid, 'phishing')
    `;
    await database`
      insert into public.security_incident_decisions (
        id, incident_id, incident_version, reviewer_user_id, action, reason_code,
        resulting_posture, resulting_severity, public_summary, evidence_id
      ) values (
        ${fixtureProjectSecurityDecisionId}::uuid, ${fixtureProjectSecurityIncidentId}::uuid, 1,
        '90000000-0000-4000-8000-000000000001'::uuid, 'open', 'precautionary_evidence',
        'blocked', 'critical',
        'A grounded phishing incident requires an immediate public participation block.',
        ${fixtureEvidenceIds[0]}::uuid
      )
    `;

    const state = await publicSecurity.getProjectSecurity(fixtureProjectIds[0]);
    const blocked = await publicSecurity.listBlockedProjects({ cursor: null, limit: 100 });
    const row = blocked.items.find((item) => item.project.id === fixtureProjectIds[0]);

    expect(state).toMatchObject({ projectId: fixtureProjectIds[0], posture: 'blocked' });
    expect(row).toMatchObject({
      project: { id: fixtureProjectIds[0] },
      posture: 'blocked',
      target: { type: 'project', id: fixtureProjectIds[0] },
    });
    expect(Object.keys(row ?? {}).join(',')).not.toMatch(/evidence|reviewer|note|raw|url/i);
  });
});

async function deleteFixtureRows(transaction: TransactionSql): Promise<void> {
  await transaction`
    delete from public.security_incident_decisions
    where id in (
      ${fixtureProjectSecurityDecisionId}::uuid,
      ${fixtureBlockedSourceDecisionId}::uuid,
      ${fixtureAlternativeSourceDecisionId}::uuid
    )
  `;
  await transaction`
    delete from public.security_incidents
    where id in (
      ${fixtureProjectSecurityIncidentId}::uuid,
      ${fixtureBlockedSourceIncidentId}::uuid,
      ${fixtureAlternativeSourceIncidentId}::uuid
    )
  `;
  await transaction`
    delete from public.score_factors
    where id in (
      ${fixtureFactorIds[0]}::uuid, ${fixtureFactorIds[1]}::uuid, ${fixtureFactorIds[2]}::uuid,
      ${fixtureFactorIds[3]}::uuid, ${fixtureFactorIds[4]}::uuid
    )
  `;
  await transaction`
    delete from public.score_signal_links
    where project_score_id in (
      ${fixtureScoreIds[0]}::uuid, ${fixtureScoreIds[1]}::uuid, ${fixtureScoreIds[2]}::uuid,
      ${fixtureScoreIds[3]}::uuid, ${fixtureScoreIds[4]}::uuid, ${fixtureScoreIds[5]}::uuid
    )
  `;
  await transaction`
    delete from public.signal_evidence_links
    where signal_id in (
      ${fixtureSignalIds[0]}::uuid, ${fixtureSignalIds[1]}::uuid, ${fixtureSignalIds[2]}::uuid
    )
  `;
  await transaction`
    delete from public.evidence
    where id in (
      ${fixtureEvidenceIds[0]}::uuid, ${fixtureEvidenceIds[1]}::uuid,
      ${fixtureEvidenceIds[2]}::uuid, ${fixtureEvidenceIds[3]}::uuid
    )
  `;
  await transaction`
    delete from public.project_scores
    where id in (
      ${fixtureScoreIds[0]}::uuid, ${fixtureScoreIds[1]}::uuid, ${fixtureScoreIds[2]}::uuid,
      ${fixtureScoreIds[3]}::uuid, ${fixtureScoreIds[4]}::uuid, ${fixtureScoreIds[5]}::uuid
    )
  `;
  await transaction`
    delete from public.signals
    where id in (
      ${fixtureSignalIds[0]}::uuid, ${fixtureSignalIds[1]}::uuid, ${fixtureSignalIds[2]}::uuid
    )
  `;
  await transaction`
    delete from public.raw_items
    where id in (
      ${fixtureRawItemIds[0]}::uuid, ${fixtureRawItemIds[1]}::uuid,
      ${fixtureRawItemIds[2]}::uuid, ${fixtureRawItemIds[3]}::uuid
    )
  `;
  await transaction`
    delete from public.project_sources
    where (project_id, source_id) in (
      (${fixtureProjectIds[0]}::uuid, ${fixtureBlockedSourceId}::uuid),
      (${fixtureProjectIds[0]}::uuid, ${fixtureAlternativeSourceId}::uuid),
      (${fixtureProjectIds[1]}::uuid, ${fixtureBlockedSourceId}::uuid),
      (${fixtureProjectIds[2]}::uuid, ${fixtureBlockedSourceId}::uuid)
    )
  `;
  await transaction`
    delete from public.sources
    where id in (${fixtureBlockedSourceId}::uuid, ${fixtureAlternativeSourceId}::uuid)
  `;
  await transaction`
    delete from public.projects
    where id in (
      ${fixtureProjectIds[0]}::uuid, ${fixtureProjectIds[1]}::uuid, ${fixtureProjectIds[2]}::uuid,
      ${fixtureProjectIds[3]}::uuid, ${fixtureProjectIds[4]}::uuid
    )
  `;
}

async function assertFixtureRowsDeleted(transaction: TransactionSql): Promise<void> {
  const rows = await transaction`
    select
      exists(select 1 from public.security_incident_decisions where id in (${fixtureProjectSecurityDecisionId}::uuid, ${fixtureBlockedSourceDecisionId}::uuid, ${fixtureAlternativeSourceDecisionId}::uuid)) as security_decisions,
      exists(select 1 from public.security_incidents where id in (${fixtureProjectSecurityIncidentId}::uuid, ${fixtureBlockedSourceIncidentId}::uuid, ${fixtureAlternativeSourceIncidentId}::uuid)) as security_incidents,
      exists(select 1 from public.score_factors where id in (${fixtureFactorIds[0]}::uuid, ${fixtureFactorIds[1]}::uuid, ${fixtureFactorIds[2]}::uuid, ${fixtureFactorIds[3]}::uuid, ${fixtureFactorIds[4]}::uuid)) as score_factors,
      exists(select 1 from public.score_signal_links where project_score_id in (${fixtureScoreIds[0]}::uuid, ${fixtureScoreIds[1]}::uuid, ${fixtureScoreIds[2]}::uuid, ${fixtureScoreIds[3]}::uuid, ${fixtureScoreIds[4]}::uuid, ${fixtureScoreIds[5]}::uuid)) as score_signal_links,
      exists(select 1 from public.project_scores where id in (${fixtureScoreIds[0]}::uuid, ${fixtureScoreIds[1]}::uuid, ${fixtureScoreIds[2]}::uuid, ${fixtureScoreIds[3]}::uuid, ${fixtureScoreIds[4]}::uuid, ${fixtureScoreIds[5]}::uuid)) as project_scores,
      exists(select 1 from public.signals where id in (${fixtureSignalIds[0]}::uuid, ${fixtureSignalIds[1]}::uuid, ${fixtureSignalIds[2]}::uuid)) as signals,
      exists(select 1 from public.signal_evidence_links where signal_id in (${fixtureSignalIds[0]}::uuid, ${fixtureSignalIds[1]}::uuid, ${fixtureSignalIds[2]}::uuid)) as signal_evidence_links,
      exists(select 1 from public.evidence where id in (${fixtureEvidenceIds[0]}::uuid, ${fixtureEvidenceIds[1]}::uuid, ${fixtureEvidenceIds[2]}::uuid, ${fixtureEvidenceIds[3]}::uuid)) as evidence,
      exists(select 1 from public.raw_items where id in (${fixtureRawItemIds[0]}::uuid, ${fixtureRawItemIds[1]}::uuid, ${fixtureRawItemIds[2]}::uuid, ${fixtureRawItemIds[3]}::uuid)) as raw_items,
      exists(select 1 from public.project_sources where (project_id, source_id) in ((${fixtureProjectIds[0]}::uuid, ${fixtureBlockedSourceId}::uuid), (${fixtureProjectIds[0]}::uuid, ${fixtureAlternativeSourceId}::uuid), (${fixtureProjectIds[1]}::uuid, ${fixtureBlockedSourceId}::uuid), (${fixtureProjectIds[2]}::uuid, ${fixtureBlockedSourceId}::uuid))) as project_sources,
      exists(select 1 from public.sources where id in (${fixtureBlockedSourceId}::uuid, ${fixtureAlternativeSourceId}::uuid)) as sources,
      exists(select 1 from public.projects where id in (${fixtureProjectIds[0]}::uuid, ${fixtureProjectIds[1]}::uuid, ${fixtureProjectIds[2]}::uuid, ${fixtureProjectIds[3]}::uuid, ${fixtureProjectIds[4]}::uuid)) as projects
  `;
  if (rows[0] === undefined || Object.values(rows[0]).some(Boolean)) {
    throw new Error('project_repository_fixture_cleanup_residue');
  }
}

async function listAllOpportunities(
  repository: ReturnType<typeof createProjectRepository>,
): Promise<Awaited<ReturnType<typeof repository.listOpportunities>>> {
  const opportunities: Awaited<ReturnType<typeof repository.listOpportunities>> = [];
  let afterScore: number | null = null;
  let afterProjectId: string | null = null;

  for (let pageNumber = 0; pageNumber < 500; pageNumber += 1) {
    const page = await repository.listOpportunities({ limit: 2, afterScore, afterProjectId });
    opportunities.push(...page);
    if (page.length < 2) {
      return opportunities;
    }

    const cursor = page.at(-1);
    if (cursor === undefined) {
      throw new Error('Expected an opportunity cursor.');
    }
    afterScore = cursor.opportunityScore;
    afterProjectId = cursor.projectId;
  }

  throw new Error('Opportunity cursor traversal exceeded 500 pages.');
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
  if (configuredValues.length !== 4) {
    throw new Error(
      'AIRDROP_DATABASE_TEST_URL, AIRDROP_QUEUE_ADMIN_DATABASE_TEST_URL, AIRDROP_ANON_SUPABASE_URL, and AIRDROP_ANON_SUPABASE_KEY must be configured together.',
    );
  }
  if (
    databaseUrl === undefined ||
    queueDatabaseUrl === undefined ||
    supabaseUrl === undefined ||
    anonKey === undefined
  ) {
    throw new Error('PostgREST integration environment values are invalid.');
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
