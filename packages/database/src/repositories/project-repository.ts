import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../generated/database.types.js';
import {
  listCurrentScoreEvidenceCitations as queryCurrentScoreEvidenceCitations,
  listCurrentScoreFactors as queryCurrentScoreFactors,
  type ProjectEvidenceCitation,
  type ProjectScoreFactor,
} from './project-score-evidence.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OpportunityListRow = Database['public']['Views']['opportunity_list']['Row'];
export type ProjectScoreRow = Database['public']['Tables']['project_scores']['Row'];
export type SignalRow = Database['public']['Tables']['signals']['Row'];

export type ProjectLifecycle = Database['public']['Enums']['project_lifecycle'];
export type SignalVerification = Database['public']['Enums']['signal_verification'];
export type SecurityPosture = 'clear' | 'caution' | 'blocked';

export interface ProjectScore {
  readonly id: string;
  readonly modelVersion: string;
  readonly inputVersion: string;
  readonly opportunityScore: number;
  readonly riskScore: number;
  readonly confidence: number;
  readonly recommendation: Database['public']['Enums']['recommendation'];
  readonly explanation: string;
  readonly calculatedAt: string;
}

export interface ProjectDetail {
  readonly projectId: string;
  readonly slug: string;
  readonly name: string;
  readonly summary: string | null;
  readonly lifecycle: ProjectLifecycle;
  readonly primaryChain: string | null;
  readonly officialWebsiteUrl: string | null;
  readonly updatedAt: string;
  readonly securityPosture: SecurityPosture;
  readonly latestScore: ProjectScore | null;
}

export interface ProjectSignal {
  readonly signalType: string;
  readonly title: string;
  readonly summary: string;
  readonly verification: SignalVerification;
  readonly confidence: number;
  readonly occurredAt: string | null;
  readonly publishedAt: string | null;
}

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
  readonly securityPosture: SecurityPosture;
}

export interface ProjectRepository {
  listOpportunities(input: {
    limit: number;
    afterScore: number | null;
    afterProjectId: string | null;
  }): Promise<OpportunityListItem[]>;
  getProjectBySlug(slug: string): Promise<ProjectDetail | null>;
  listProjectSignals(projectId: string, limit: number): Promise<ProjectSignal[]>;
  listCurrentScoreFactors(
    projectId: string,
    projectScoreId: string,
  ): Promise<ProjectScoreFactor[]>;
  listCurrentScoreEvidenceCitations(
    projectId: string,
    projectScoreId: string,
  ): Promise<ProjectEvidenceCitation[]>;
}

export function createProjectRepository(client: SupabaseClient<Database>): ProjectRepository {
  return {
    async listOpportunities(input) {
      const cursor = validateOpportunityCursor(input);
      const query = client
        .from('opportunity_list')
        .select(
          'project_id,slug,name,summary,lifecycle,primary_chain,opportunity_score,risk_score,confidence,recommendation,calculated_at,latest_published_signal_at,security_posture',
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

    async getProjectBySlug(slug) {
      if (!isValidSlug(slug)) {
        throw new RangeError('Project slug format is invalid.');
      }
      const response = await client
        .from('project_current_state')
        .select(
          'project_id,project_score_id,slug,name,summary,lifecycle,primary_chain,official_website_url,project_updated_at,opportunity_score,risk_score,score_confidence,recommendation,score_model_version,score_input_version,score_explanation,score_calculated_at,security_posture',
        )
        .eq('slug', slug)
        .maybeSingle();

      if (response.error !== null) {
        throw new ProjectLookupQueryError(response.error.code, response.error.message);
      }
      if (response.data === null) {
        return null;
      }

      const row = response.data;
      const lifecycle = requiredString(row.lifecycle, 'lifecycle') as ProjectLifecycle;
      return {
        projectId: requiredString(row.project_id, 'project_id'),
        slug: requiredString(row.slug, 'slug'),
        name: requiredString(row.name, 'name'),
        summary: row.summary,
        lifecycle,
        primaryChain: row.primary_chain,
        officialWebsiteUrl: row.official_website_url,
        updatedAt: requiredString(row.project_updated_at, 'project_updated_at'),
        securityPosture: requiredSecurityPosture(row.security_posture),
        latestScore:
          row.opportunity_score === null || row.score_calculated_at === null
            ? null
            : {
                id: requiredString(row.project_score_id, 'project_score_id'),
                modelVersion: requiredString(row.score_model_version, 'score_model_version'),
                inputVersion: requiredString(row.score_input_version, 'score_input_version'),
                opportunityScore: requiredNumber(row.opportunity_score, 'opportunity_score'),
                riskScore: requiredNumber(row.risk_score, 'risk_score'),
                confidence: requiredNumber(row.score_confidence, 'score_confidence'),
                recommendation: requiredRecommendation(row.recommendation),
                explanation: requiredString(row.score_explanation, 'score_explanation'),
                calculatedAt: row.score_calculated_at,
              },
      };
    },

    async listProjectSignals(projectId, limit) {
      if (!uuidPattern.test(projectId)) {
        throw new RangeError('Project ID format is invalid.');
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new RangeError('Project signal limit must be an integer from 1 through 100.');
      }
      const response = await client
        .from('signals')
        .select('signal_type,title,summary,verification,confidence,occurred_at,published_at')
        .eq('project_id', projectId)
        .eq('lifecycle', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .range(0, limit - 1);

      if (response.error !== null) {
        throw new ProjectSignalQueryError(response.error.code, response.error.message);
      }

      return (response.data ?? []).map(mapProjectSignalRow);
    },

    listCurrentScoreFactors(projectId, projectScoreId) {
      return queryCurrentScoreFactors(client, projectId, projectScoreId);
    },

    listCurrentScoreEvidenceCitations(projectId, projectScoreId) {
      return queryCurrentScoreEvidenceCitations(client, projectId, projectScoreId);
    },
  };
}

export class ProjectLookupQueryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProjectLookupQueryError';
    this.code = code;
  }
}

export class ProjectSignalQueryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProjectSignalQueryError';
    this.code = code;
  }
}

function isValidSlug(slug: string): boolean {
  return (
    slug.length >= 1 &&
    slug.length <= 120 &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
  );
}

type SignalSelection = Pick<
  SignalRow,
  'signal_type' | 'title' | 'summary' | 'verification' | 'confidence' | 'occurred_at' | 'published_at'
>;

function mapProjectSignalRow(row: SignalSelection): ProjectSignal {
  return {
    signalType: requiredString(row.signal_type, 'signal_type'),
    title: requiredString(row.title, 'title'),
    summary: requiredString(row.summary, 'summary'),
    verification: row.verification,
    confidence: requiredNumber(row.confidence, 'confidence'),
    occurredAt: row.occurred_at,
    publishedAt: row.published_at,
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
    securityPosture: requiredSecurityPosture(row.security_posture),
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

function requiredSecurityPosture(value: string | null): SecurityPosture {
  if (value === 'clear' || value === 'caution' || value === 'blocked') {
    return value;
  }
  throw new TypeError('Project projection returned an invalid security_posture.');
}
