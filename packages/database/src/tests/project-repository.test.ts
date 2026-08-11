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
      },
    ]);
    expect(client.orders).toEqual([
      ['opportunity_score', { ascending: false }],
      ['project_id', { ascending: true }],
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

function createSupabaseClient(
  fixtureRows: readonly OpportunityListRow[],
): SupabaseClient<Database> & {
  readonly orders: readonly [string, { readonly ascending: boolean }][];
  readonly orFilters: readonly string[];
} {
  const orders: [string, { readonly ascending: boolean }][] = [];
  const orFilters: string[] = [];
  const query = {
    select: () => query,
    order: (column: string, options: { readonly ascending: boolean }) => {
      orders.push([column, options]);
      return query;
    },
    or: (filter: string) => {
      orFilters.push(filter);
      return query;
    },
    range: () => query,
    then: <TResult1 = { data: readonly OpportunityListRow[]; error: null }>(
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
    from: () => query,
  } as unknown as SupabaseClient<Database> & {
    readonly orders: readonly [string, { readonly ascending: boolean }][];
    readonly orFilters: readonly string[];
  };
}
