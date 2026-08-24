import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import { createProjectRepository } from '../repositories/project-repository.js';

const fixtureProjectIds = [
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
] as const;
const fixtureProjectIdSet = new Set<string>(fixtureProjectIds);
const fixtureSourceId = randomUUID();
const fixtureRawItemIds = [randomUUID(), randomUUID(), randomUUID()] as const;
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
const fixtureSlugSuffixes = fixtureProjectIds.map((projectId) => projectId.replaceAll('-', ''));
const fixtureSourceHost = `${fixtureSourceId}.example.invalid`;
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
      values (
        ${fixtureSourceId}::uuid, 'official_web', 'Repository Evidence Source',
        ${`https://${fixtureSourceHost}/`}, 'active'
      )
    `;
    await database`
      insert into public.project_sources (
        project_id, source_id, authority_domains, is_official,
        verified_at, verified_by, created_at
      ) values
        (${fixtureProjectIds[0]}::uuid, ${fixtureSourceId}::uuid, ${[fixtureSourceHost]}, true, '2026-08-23T12:00:00.000Z', '90000000-0000-4000-8000-000000000001'::uuid, '2026-08-23T12:00:00.000Z'),
        (${fixtureProjectIds[1]}::uuid, ${fixtureSourceId}::uuid, ${[fixtureSourceHost]}, true, '2026-08-23T12:00:00.000Z', '90000000-0000-4000-8000-000000000001'::uuid, '2026-08-23T12:00:00.000Z'),
        (${fixtureProjectIds[2]}::uuid, ${fixtureSourceId}::uuid, '{}', false, null, null, '2026-08-23T12:00:00.000Z')
    `;
    await database`
      insert into public.raw_items (
        id, project_id, source_id, logical_url, final_url, content_kind, media_type,
        raw_text, sha256, collected_at
      ) values
        (${fixtureRawItemIds[0]}::uuid, ${fixtureProjectIds[0]}::uuid, ${fixtureSourceId}::uuid, ${`https://${fixtureSourceHost}/active`}, ${`https://${fixtureSourceHost}/active`}, 'feed_article_html', 'text/html', 'First active repository citation. Second active repository citation.', ${'a'.repeat(64)}, '2026-08-09T00:00:00.000Z'),
        (${fixtureRawItemIds[1]}::uuid, ${fixtureProjectIds[1]}::uuid, ${fixtureSourceId}::uuid, ${`https://${fixtureSourceHost}/active-b`}, ${`https://${fixtureSourceHost}/active-b`}, 'feed_article_html', 'text/html', 'Repository Evidence quote one.', ${'b'.repeat(64)}, '2026-08-09T00:00:00.000Z'),
        (${fixtureRawItemIds[2]}::uuid, ${fixtureProjectIds[2]}::uuid, ${fixtureSourceId}::uuid, ${`https://${fixtureSourceHost}/rumored`}, ${`https://${fixtureSourceHost}/rumored`}, 'feed_article_html', 'text/html', 'Repository Evidence quote two.', ${'c'.repeat(64)}, '2026-08-09T00:00:00.000Z')
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
        (${fixtureEvidenceIds[0]}::uuid, ${fixtureSourceId}::uuid, ${fixtureRawItemIds[0]}::uuid, 'article_raw_text', 'First active repository citation.', public.evidence_quote_sha256_v1('First active repository citation.'), '2026-08-09T00:02:00.000Z', '2026-08-09T00:02:00.000Z'),
        (${fixtureEvidenceIds[1]}::uuid, ${fixtureSourceId}::uuid, ${fixtureRawItemIds[0]}::uuid, 'article_raw_text', 'Second active repository citation.', public.evidence_quote_sha256_v1('Second active repository citation.'), '2026-08-09T00:01:00.000Z', '2026-08-09T00:01:00.000Z'),
        (${fixtureEvidenceIds[2]}::uuid, ${fixtureSourceId}::uuid, ${fixtureRawItemIds[1]}::uuid, 'article_raw_text', 'Repository Evidence quote one.', public.evidence_quote_sha256_v1('Repository Evidence quote one.'), '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z'),
        (${fixtureEvidenceIds[3]}::uuid, ${fixtureSourceId}::uuid, ${fixtureRawItemIds[2]}::uuid, 'article_raw_text', 'Repository Evidence quote two.', public.evidence_quote_sha256_v1('Repository Evidence quote two.'), '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z')
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
    await database.end({ timeout: 5 });
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

    const citations = await repository.listCurrentScoreEvidenceCitations(
      fixtureProjectIds[0],
      fixtureScoreIds[0],
    );
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
});

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
