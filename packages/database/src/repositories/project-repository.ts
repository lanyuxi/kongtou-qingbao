import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../generated/database.types.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OpportunityListRow = Database['public']['Views']['opportunity_list']['Row'];

export interface OpportunityListItem {
  readonly projectId: string;
  readonly slug: string;
  readonly name: string;
  readonly summary: string | null;
  readonly lifecycle: 'active' | 'rumored';
  readonly primaryChain: string | null;
  readonly opportunityScore: number;
  readonly riskScore: number;
  readonly confidence: number;
  readonly recommendation: Database['public']['Enums']['recommendation'];
  readonly calculatedAt: string;
  readonly latestPublishedSignalAt: string | null;
}

export interface ProjectRepository {
  listOpportunities(input: {
    limit: number;
    afterScore: number | null;
    afterProjectId: string | null;
  }): Promise<OpportunityListItem[]>;
}

export function createProjectRepository(client: SupabaseClient<Database>): ProjectRepository {
  return {
    async listOpportunities(input) {
      const cursor = validateOpportunityCursor(input);
      const query = client
        .from('opportunity_list')
        .select(
          'project_id,slug,name,summary,lifecycle,primary_chain,opportunity_score,risk_score,confidence,recommendation,calculated_at,latest_published_signal_at',
        )
        .order('opportunity_score', { ascending: false })
        .order('project_id', { ascending: true });
      const response =
        cursor === null
          ? await query.range(0, input.limit - 1)
          : await query
              .or(
                `opportunity_score.lt.${cursor.afterScore},and(opportunity_score.eq.${cursor.afterScore},project_id.gt.${cursor.afterProjectId})`,
              )
              .range(0, input.limit - 1);

      if (response.error !== null) {
        throw new OpportunityListQueryError(response.error.code, response.error.message);
      }

      return (response.data ?? []).map(mapOpportunityListRow);
    },
  };
}

export class OpportunityListQueryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'OpportunityListQueryError';
    this.code = code;
  }
}

function validateOpportunityCursor(input: {
  readonly limit: number;
  readonly afterScore: number | null;
  readonly afterProjectId: string | null;
}): { readonly afterScore: number; readonly afterProjectId: string } | null {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new RangeError('Opportunity list limit must be an integer from 1 through 100.');
  }

  if (input.afterScore === null && input.afterProjectId === null) {
    return null;
  }
  if (input.afterScore === null || input.afterProjectId === null) {
    throw new TypeError('Opportunity list cursors require both score and project ID.');
  }
  if (
    !Number.isFinite(input.afterScore) ||
    input.afterScore < 0 ||
    input.afterScore > 100 ||
    !uuidPattern.test(input.afterProjectId)
  ) {
    throw new RangeError('Opportunity list cursor values are invalid.');
  }

  return { afterScore: input.afterScore, afterProjectId: input.afterProjectId };
}

function mapOpportunityListRow(row: OpportunityListRow): OpportunityListItem {
  const lifecycle = requiredString(row.lifecycle, 'lifecycle');
  if (lifecycle !== 'active' && lifecycle !== 'rumored') {
    throw new TypeError('Opportunity list returned an unsupported lifecycle.');
  }

  return {
    projectId: requiredString(row.project_id, 'project_id'),
    slug: requiredString(row.slug, 'slug'),
    name: requiredString(row.name, 'name'),
    summary: row.summary,
    lifecycle,
    primaryChain: row.primary_chain,
    opportunityScore: requiredNumber(row.opportunity_score, 'opportunity_score'),
    riskScore: requiredNumber(row.risk_score, 'risk_score'),
    confidence: requiredNumber(row.confidence, 'confidence'),
    recommendation: requiredRecommendation(row.recommendation),
    calculatedAt: requiredString(row.calculated_at, 'calculated_at'),
    latestPublishedSignalAt: row.latest_published_signal_at,
  };
}

function requiredString(value: string | null, field: string): string {
  if (value === null || value.length === 0) {
    throw new TypeError(`Opportunity list returned an invalid ${field}.`);
  }
  return value;
}

function requiredNumber(value: number | null, field: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw new TypeError(`Opportunity list returned an invalid ${field}.`);
  }
  return value;
}

function requiredRecommendation(
  value: Database['public']['Enums']['recommendation'] | null,
): Database['public']['Enums']['recommendation'] {
  if (value === null) {
    throw new TypeError('Opportunity list returned an invalid recommendation.');
  }
  return value;
}
