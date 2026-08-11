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
    await removeFixtures(database);
    await database`
      insert into public.projects (id, slug, name, lifecycle)
      values
        (${fixtureProjectIds[0]}, 'repository-active-a', 'Repository Active A', 'active'),
        (${fixtureProjectIds[1]}, 'repository-active-b', 'Repository Active B', 'active'),
        (${fixtureProjectIds[2]}, 'repository-rumored', 'Repository Rumored', 'rumored'),
        (${fixtureProjectIds[3]}, 'repository-paused', 'Repository Paused', 'paused'),
        (${fixtureProjectIds[4]}, 'repository-unscored', 'Repository Unscored', 'active')
    `;
    await database`
      insert into public.project_scores (
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
        (${fixtureProjectIds[0]}, 'repository-test', 'active-a', 90, 20, 80, 'act_now', 'Fixture score.', '2026-08-09T00:00:00.000Z'),
        (${fixtureProjectIds[1]}, 'repository-test', 'active-b', 90, 30, 70, 'watch', 'Fixture score.', '2026-08-08T00:00:00.000Z'),
        (${fixtureProjectIds[2]}, 'repository-test', 'rumored', 80, 40, 60, 'research', 'Fixture score.', '2026-08-07T00:00:00.000Z'),
        (${fixtureProjectIds[3]}, 'repository-test', 'paused', 99, 10, 90, 'act_now', 'Fixture score.', '2026-08-10T00:00:00.000Z')
    `;
  });

  afterAll(async () => {
    if (database === null) {
      return;
    }
    await removeFixtures(database);
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

async function removeFixtures(database: postgres.Sql): Promise<void> {
  await database`
    delete from public.project_scores
    where project_id = any(${fixtureProjectIds}::uuid[])
  `;
  await database`
    delete from public.projects
    where id = any(${fixtureProjectIds}::uuid[])
  `;
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
