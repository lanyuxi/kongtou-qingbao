import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  createProjectRepository,
  type OpportunityListRow,
} from '../repositories/project-repository.js';
import type { Database } from '../generated/database.types.js';

const rows: readonly OpportunityListRow[] = [
  {
    project_id: '10000000-0000-4000-8000-000000000003',
    slug: 'active-later-id',
    name: 'Active Later ID',
    summary: 'A scored active project.',
    lifecycle: 'active',
    primary_chain: 'Ethereum',
    opportunity_score: 90,
    risk_score: 20,
    confidence: 80,
    recommendation: 'act_now',
    calculated_at: '2026-08-09T00:00:00.000Z',
    latest_published_signal_at: '2026-08-08T00:00:00.000Z',
    security_posture: 'clear',
  },
  {
    project_id: '10000000-0000-4000-8000-000000000001',
    slug: 'active-earlier-id',
    name: 'Active Earlier ID',
    summary: null,
    lifecycle: 'active',
    primary_chain: null,
    opportunity_score: 90,
    risk_score: 30,
    confidence: 70,
    recommendation: 'watch',
    calculated_at: '2026-08-08T00:00:00.000Z',
    latest_published_signal_at: null,
    security_posture: 'caution',
  },
];

describe('ProjectRepository.listOpportunities', () => {
  it('maps safe opportunity rows from the typed view query', async () => {
    const client = createSupabaseClient(rows);

    const result = await createProjectRepository(client).listOpportunities({
      limit: 2,
      afterScore: null,
      afterProjectId: null,
    });

    expect(result).toEqual([
      {
        projectId: '10000000-0000-4000-8000-000000000003',
        slug: 'active-later-id',
        name: 'Active Later ID',
        summary: 'A scored active project.',
        lifecycle: 'active',
        primaryChain: 'Ethereum',
        opportunityScore: 90,
        riskScore: 20,
        confidence: 80,
        recommendation: 'act_now',
        calculatedAt: '2026-08-09T00:00:00.000Z',
        latestPublishedSignalAt: '2026-08-08T00:00:00.000Z',
        securityPosture: 'clear',
      },
      {
        projectId: '10000000-0000-4000-8000-000000000001',
        slug: 'active-earlier-id',
        name: 'Active Earlier ID',
        summary: null,
        lifecycle: 'active',
        primaryChain: null,
        opportunityScore: 90,
        riskScore: 30,
        confidence: 70,
        recommendation: 'watch',
        calculatedAt: '2026-08-08T00:00:00.000Z',
        latestPublishedSignalAt: null,
        securityPosture: 'caution',
      },
    ]);
    expect(client.orders).toEqual([
      ['opportunity_score', { ascending: false }],
      ['project_id', { ascending: true }],
    ]);
    expect(client.selections).toEqual([
      'project_id,slug,name,summary,lifecycle,primary_chain,opportunity_score,risk_score,confidence,recommendation,calculated_at,latest_published_signal_at,security_posture',
    ]);
  });

  it('uses the validated compound cursor in its PostgREST filter', async () => {
    const client = createSupabaseClient(rows);

    await createProjectRepository(client).listOpportunities({
      limit: 1,
      afterScore: 90,
      afterProjectId: '10000000-0000-4000-8000-000000000001',
    });

    expect(client.orFilters).toEqual([
      'opportunity_score.lt.90,and(opportunity_score.eq.90,project_id.gt.10000000-0000-4000-8000-000000000001)',
    ]);
  });

  it.each([0, 101, 1.5, Number.NaN])('rejects an invalid limit of %s', async (limit) => {
    await expect(
      createProjectRepository(createSupabaseClient(rows)).listOpportunities({
        limit,
        afterScore: null,
        afterProjectId: null,
      }),
    ).rejects.toThrow(RangeError);
  });

  it('requires a score and project identifier together for a cursor', async () => {
    await expect(
      createProjectRepository(createSupabaseClient(rows)).listOpportunities({
        limit: 1,
        afterScore: 90,
        afterProjectId: null,
      }),
    ).rejects.toThrow(TypeError);
  });
});

const projectDetailRow = {
  project_id: '20000000-0000-4000-8000-000000000001',
  project_score_id: '20000000-0000-4000-8000-000000000002',
  slug: 'demo-project',
  name: 'Demo Project',
  summary: 'A demo project.',
  lifecycle: 'active',
  primary_chain: 'Ethereum',
  official_website_url: 'https://demo.example.dev',
  project_updated_at: '2026-08-10T00:00:00.000Z',
  opportunity_score: 84,
  risk_score: 22,
  score_confidence: 80,
  recommendation: 'act_now',
  score_model_version: 'seed-fixture-v1',
  score_input_version: 'seed-2026-08-14',
  score_explanation: 'Fixture sample score.',
  score_calculated_at: '2026-08-13T00:00:00.000Z',
  security_posture: 'blocked',
} as const;

const signalRows: readonly {
  signal_type: string;
  title: string;
  summary: string;
  verification: 'verified';
  confidence: number;
  occurred_at: string;
  published_at: string;
}[] = [
  {
    signal_type: 'points_program',
    title: 'Points program extended',
    summary: 'Official blog confirms extension.',
    verification: 'verified',
    confidence: 90,
    occurred_at: '2026-08-13T00:00:00.000Z',
    published_at: '2026-08-13T00:00:00.000Z',
  },
];

describe('ProjectRepository.getProjectBySlug', () => {
  it('maps a project row with its latest score', async () => {
    const client = createProjectLookupClient(projectDetailRow);

    const result = await createProjectRepository(client).getProjectBySlug('demo-project');

    expect(result).toEqual({
      projectId: '20000000-0000-4000-8000-000000000001',
      slug: 'demo-project',
      name: 'Demo Project',
      summary: 'A demo project.',
      lifecycle: 'active',
      primaryChain: 'Ethereum',
      officialWebsiteUrl: 'https://demo.example.dev',
      updatedAt: '2026-08-10T00:00:00.000Z',
      securityPosture: 'blocked',
      latestScore: {
        id: '20000000-0000-4000-8000-000000000002',
        modelVersion: 'seed-fixture-v1',
        inputVersion: 'seed-2026-08-14',
        opportunityScore: 84,
        riskScore: 22,
        confidence: 80,
        recommendation: 'act_now',
        explanation: 'Fixture sample score.',
        calculatedAt: '2026-08-13T00:00:00.000Z',
      },
    });
  });

  it('reads the immutable score identity and displayed score fields in one exact current-state query', async () => {
    const client = createProjectLookupClient(projectDetailRow);

    await createProjectRepository(client).getProjectBySlug('demo-project');

    expect(client.relationCalls).toEqual(['project_current_state']);
    expect(client.selections).toEqual([
      'project_id,project_score_id,slug,name,summary,lifecycle,primary_chain,official_website_url,project_updated_at,opportunity_score,risk_score,score_confidence,recommendation,score_model_version,score_input_version,score_explanation,score_calculated_at,security_posture',
    ]);
  });

  it('returns null when no project matches', async () => {
    const client = createProjectLookupClient(null);

    const result = await createProjectRepository(client).getProjectBySlug('demo-project');

    expect(result).toBeNull();
  });

  it('reports a project without a score as scoreless', async () => {
    const unscored = { ...projectDetailRow, opportunity_score: null, score_calculated_at: null };
    const client = createProjectLookupClient(unscored);

    const result = await createProjectRepository(client).getProjectBySlug('demo-project');

    expect(result?.latestScore).toBeNull();
  });

  it.each(['clear', 'caution', 'blocked'] as const)(
    'prevents the %s security posture from being omitted from a current project projection',
    async (securityPosture) => {
      const result = await createProjectRepository(
        createProjectLookupClient({ ...projectDetailRow, security_posture: securityPosture }),
      ).getProjectBySlug('demo-project');

      expect(result?.securityPosture).toBe(securityPosture);
    },
  );

  it('rejects a malformed slug', async () => {
    await expect(
      createProjectRepository(createProjectLookupClient(projectDetailRow)).getProjectBySlug('Bad Slug!'),
    ).rejects.toThrow(RangeError);
  });
});

describe('ProjectRepository.listProjectSignals', () => {
  it('returns published signals newest first', async () => {
    const client = createSignalClient(signalRows);

    const result = await createProjectRepository(client).listProjectSignals(
      '20000000-0000-4000-8000-000000000001',
      10,
    );

    expect(result).toEqual([
      {
        signalType: 'points_program',
        title: 'Points program extended',
        summary: 'Official blog confirms extension.',
        verification: 'verified',
        confidence: 90,
        occurredAt: '2026-08-13T00:00:00.000Z',
        publishedAt: '2026-08-13T00:00:00.000Z',
      },
    ]);
  });

  it('rejects a malformed project identifier or limit', async () => {
    const repository = createProjectRepository(createSignalClient(signalRows));
    await expect(repository.listProjectSignals('not-a-uuid', 10)).rejects.toThrow(RangeError);
    await expect(
      repository.listProjectSignals('20000000-0000-4000-8000-000000000001', 0),
    ).rejects.toThrow(RangeError);
  });
});

function createProjectLookupClient(
  fixtureRow:
    | (Omit<typeof projectDetailRow, 'security_posture'> & { readonly security_posture: string })
    | { readonly opportunity_score: null; readonly security_posture: string }
    | null,
): SupabaseClient<Database> & {
  readonly relationCalls: string[];
  readonly selections: string[];
} {
  const relationCalls: string[] = [];
  const selections: string[] = [];
  const query = {
    select: (columns: string) => {
      selections.push(columns);
      return query;
    },
    eq: () => query,
    maybeSingle: () =>
      Promise.resolve({
        data: fixtureRow === null ? null : structuredClone(fixtureRow),
        error: null,
      }),
  };
  return {
    relationCalls,
    selections,
    from: (relation: string) => {
      relationCalls.push(relation);
      if (relation !== 'project_current_state') {
        throw new Error('Project lookup queried an unexpected relation.');
      }
      if (relationCalls.length !== 1) {
        throw new Error('Project lookup must query project_current_state exactly once.');
      }
      return query;
    },
  } as unknown as SupabaseClient<Database> & {
    readonly relationCalls: string[];
    readonly selections: string[];
  };
}

function createSignalClient(
  fixtureRows: readonly (typeof signalRows)[number][],
): SupabaseClient<Database> {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    range: () => query,
    then: <TResult1 = { data: readonly (typeof signalRows)[number][]; error: null }>(
      onfulfilled?:
        | ((value: {
            data: readonly (typeof signalRows)[number][];
            error: null;
          }) => TResult1 | PromiseLike<TResult1>)
        | null,
    ) => Promise.resolve({ data: fixtureRows, error: null }).then(onfulfilled),
  };
  return { from: () => query } as unknown as SupabaseClient<Database>;
}

function createSupabaseClient(
  fixtureRows: readonly OpportunityListRow[],
): SupabaseClient<Database> & {
  readonly orders: readonly [string, { readonly ascending: boolean }][];
  readonly orFilters: readonly string[];
  readonly selections: readonly string[];
} {
  const orders: [string, { readonly ascending: boolean }][] = [];
  const orFilters: string[] = [];
  const selections: string[] = [];
  const query = {
    select: (columns: string) => {
      selections.push(columns);
      return query;
    },
    order: (column: string, options: { readonly ascending: boolean }) => {
      orders.push([column, options]);
      return query;
    },
    or: (filter: string) => {
      orFilters.push(filter);
      return query;
    },
    range: () => query,
    then: <
      TResult1 = {
        data: readonly OpportunityListRow[];
        error: null;
      },
    >(
      onfulfilled?:
        | ((value: {
            data: readonly OpportunityListRow[];
            error: null;
          }) => TResult1 | PromiseLike<TResult1>)
        | null,
    ) => Promise.resolve({ data: fixtureRows, error: null }).then(onfulfilled),
  };

  return {
    orders,
    orFilters,
    selections,
    from: () => query,
  } as unknown as SupabaseClient<Database> & {
    readonly orders: readonly [string, { readonly ascending: boolean }][];
    readonly orFilters: readonly string[];
    readonly selections: readonly string[];
  };
}
