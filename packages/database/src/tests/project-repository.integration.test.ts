import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import { createProjectRepository } from '../repositories/project-repository.js';

const fixtureProjectIds = [
  '70000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000005',
] as const;
const fixtureProjectIdSet = new Set<string>(fixtureProjectIds);
const fixtureSourceId = '70000000-0000-4000-8000-000000000020';
const fixtureSignalIds = [
  '70000000-0000-4000-8000-000000000030',
  '70000000-0000-4000-8000-000000000031',
  '70000000-0000-4000-8000-000000000032',
] as const;
const fixtureScoreIds = [
  '70000000-0000-4000-8000-000000000040',
  '70000000-0000-4000-8000-000000000041',
  '70000000-0000-4000-8000-000000000042',
  '70000000-0000-4000-8000-000000000043',
  '70000000-0000-4000-8000-000000000044',
] as const;

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
    await database`
      insert into public.projects (id, slug, name, lifecycle)
      values
        (${fixtureProjectIds[0]}, 'repository-active-a', 'Repository Active A', 'active'),
        (${fixtureProjectIds[1]}, 'repository-active-b', 'Repository Active B', 'active'),
        (${fixtureProjectIds[2]}, 'repository-rumored', 'Repository Rumored', 'rumored'),
        (${fixtureProjectIds[3]}, 'repository-paused', 'Repository Paused', 'paused'),
        (${fixtureProjectIds[4]}, 'repository-unscored', 'Repository Unscored', 'active')
      on conflict (id) do nothing
    `;
    await database`
      insert into public.sources (id, source_type, name, canonical_url, status)
      values (
        ${fixtureSourceId}::uuid, 'official_web', 'Repository Evidence Source',
        'https://repository-evidence.example.invalid/', 'active'
      )
      on conflict (id) do nothing
    `;
    await database`
      insert into public.raw_items (
        id, project_id, source_id, logical_url, final_url, content_kind, media_type,
        raw_text, sha256, collected_at
      ) values
        ('70000000-0000-4000-8000-000000000050', ${fixtureProjectIds[0]}::uuid, ${fixtureSourceId}::uuid, 'https://repository-evidence.example.invalid/0', 'https://repository-evidence.example.invalid/0', 'feed_article_html', 'text/html', 'Repository Evidence quote zero.', ${'a'.repeat(64)}, '2026-08-09T00:00:00.000Z'),
        ('70000000-0000-4000-8000-000000000051', ${fixtureProjectIds[1]}::uuid, ${fixtureSourceId}::uuid, 'https://repository-evidence.example.invalid/1', 'https://repository-evidence.example.invalid/1', 'feed_article_html', 'text/html', 'Repository Evidence quote one.', ${'b'.repeat(64)}, '2026-08-09T00:00:00.000Z'),
        ('70000000-0000-4000-8000-000000000052', ${fixtureProjectIds[2]}::uuid, ${fixtureSourceId}::uuid, 'https://repository-evidence.example.invalid/2', 'https://repository-evidence.example.invalid/2', 'feed_article_html', 'text/html', 'Repository Evidence quote two.', ${'c'.repeat(64)}, '2026-08-09T00:00:00.000Z')
      on conflict (id) do nothing
    `;
    await database`
      insert into public.signals (
        id, project_id, signal_type, title, summary, lifecycle, confidence,
        published_at, created_at
      ) values
        (${fixtureSignalIds[0]}::uuid, ${fixtureProjectIds[0]}::uuid, 'repository_fixture', 'Repository signal zero', 'Evidence-complete signal zero.', 'published', 80, '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z'),
        (${fixtureSignalIds[1]}::uuid, ${fixtureProjectIds[1]}::uuid, 'repository_fixture', 'Repository signal one', 'Evidence-complete signal one.', 'published', 80, '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z'),
        (${fixtureSignalIds[2]}::uuid, ${fixtureProjectIds[2]}::uuid, 'repository_fixture', 'Repository signal two', 'Evidence-complete signal two.', 'published', 80, '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z')
      on conflict (id) do nothing
    `;
    await database`
      insert into public.evidence (
        id, source_id, raw_item_id, source_field, quote_text,
        normalized_quote_sha256, verified_at, created_at
      ) values
        ('70000000-0000-4000-8000-000000000060', ${fixtureSourceId}::uuid, '70000000-0000-4000-8000-000000000050', 'article_raw_text', 'Repository Evidence quote zero.', public.evidence_quote_sha256_v1('Repository Evidence quote zero.'), '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z'),
        ('70000000-0000-4000-8000-000000000061', ${fixtureSourceId}::uuid, '70000000-0000-4000-8000-000000000051', 'article_raw_text', 'Repository Evidence quote one.', public.evidence_quote_sha256_v1('Repository Evidence quote one.'), '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z'),
        ('70000000-0000-4000-8000-000000000062', ${fixtureSourceId}::uuid, '70000000-0000-4000-8000-000000000052', 'article_raw_text', 'Repository Evidence quote two.', public.evidence_quote_sha256_v1('Repository Evidence quote two.'), '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z')
      on conflict (id) do nothing
    `;
    await database`
      insert into public.signal_evidence_links (signal_id, evidence_id)
      values
        (${fixtureSignalIds[0]}::uuid, '70000000-0000-4000-8000-000000000060'),
        (${fixtureSignalIds[1]}::uuid, '70000000-0000-4000-8000-000000000061'),
        (${fixtureSignalIds[2]}::uuid, '70000000-0000-4000-8000-000000000062')
      on conflict (signal_id, evidence_id) do nothing
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
        (${fixtureScoreIds[4]}::uuid, ${fixtureProjectIds[4]}, 'repository-test', 'zero-links', 100, 1, 99, 'act_now', 'Zero-link fixture score.', '2026-08-11T00:00:00.000Z')
      on conflict (id) do nothing
    `;
    await database`
      insert into public.score_signal_links (project_score_id, signal_id)
      values
        (${fixtureScoreIds[0]}::uuid, ${fixtureSignalIds[0]}::uuid),
        (${fixtureScoreIds[1]}::uuid, ${fixtureSignalIds[1]}::uuid),
        (${fixtureScoreIds[2]}::uuid, ${fixtureSignalIds[2]}::uuid)
      on conflict (project_score_id, signal_id) do nothing
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

    expect(
      opportunities
        .filter((opportunity) => fixtureProjectIdSet.has(opportunity.projectId))
        .map((opportunity) => opportunity.projectId),
    ).toEqual([fixtureProjectIds[0], fixtureProjectIds[1], fixtureProjectIds[2]]);
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

function readIntegrationEnvironment(): {
  readonly databaseUrl: string;
  readonly supabaseUrl: string;
  readonly anonKey: string;
} | null {
  const databaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
  const supabaseUrl = process.env.AIRDROP_ANON_SUPABASE_URL;
  const anonKey = process.env.AIRDROP_ANON_SUPABASE_KEY;
  const configuredValues = [databaseUrl, supabaseUrl, anonKey].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );

  if (configuredValues.length === 0) {
    return null;
  }
  if (configuredValues.length !== 3) {
    throw new Error(
      'AIRDROP_DATABASE_TEST_URL, AIRDROP_ANON_SUPABASE_URL, and AIRDROP_ANON_SUPABASE_KEY must be configured together.',
    );
  }
  if (databaseUrl === undefined || supabaseUrl === undefined || anonKey === undefined) {
    throw new Error('PostgREST integration environment values are invalid.');
  }

  return { databaseUrl, supabaseUrl, anonKey };
}
