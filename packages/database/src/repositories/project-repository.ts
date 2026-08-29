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
        throw new OpportunityListQueryError(response.error.code);
      }

      return (response.data ?? []).map((row) => mapOpportunityListRow(parseOpportunityListRow(row)));
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
        throw new ProjectLookupQueryError(response.error.code);
      }
      if (response.data === null) {
        return null;
      }

      return mapProjectDetailRow(parseProjectCurrentStateRow(response.data));
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
        throw new ProjectSignalQueryError(response.error.code);
      }

      return (response.data ?? []).map((row) => mapProjectSignalRow(parseProjectSignalRow(row)));
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

  constructor(code: string) {
    super('Unable to read project details.');
    this.name = 'ProjectLookupQueryError';
    this.code = code;
  }
}

export class ProjectSignalQueryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super('Unable to read project signals.');
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

const projectSignalKeys = [
  'signal_type',
  'title',
  'summary',
  'verification',
  'confidence',
  'occurred_at',
  'published_at',
] as const;

function parseProjectSignalRow(value: unknown): SignalSelection {
  if (
    !isRecordWithExactKeys(value, projectSignalKeys) ||
    !isNonEmptyString(value.signal_type) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.summary) ||
    !isSignalVerification(value.verification) ||
    !isFiniteNumber(value.confidence) ||
    !isNullableIsoTimestamp(value.occurred_at) ||
    !isNullableIsoTimestamp(value.published_at)
  ) {
    throw new TypeError('Project repository returned unsafe signal projection.');
  }
  return value as SignalSelection;
}

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

  constructor(code: string) {
    super('Unable to read opportunities.');
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

interface ProjectCurrentStateRow {
  readonly project_id: string;
  readonly project_score_id: string | null;
  readonly slug: string;
  readonly name: string;
  readonly summary: string | null;
  readonly lifecycle: ProjectLifecycle;
  readonly primary_chain: string | null;
  readonly official_website_url: string | null;
  readonly project_updated_at: string;
  readonly opportunity_score: number | null;
  readonly risk_score: number | null;
  readonly score_confidence: number | null;
  readonly recommendation: Database['public']['Enums']['recommendation'] | null;
  readonly score_model_version: string | null;
  readonly score_input_version: string | null;
  readonly score_explanation: string | null;
  readonly score_calculated_at: string | null;
  readonly security_posture: SecurityPosture;
}

const opportunityListKeys = [
  'project_id',
  'slug',
  'name',
  'summary',
  'lifecycle',
  'primary_chain',
  'opportunity_score',
  'risk_score',
  'confidence',
  'recommendation',
  'calculated_at',
  'latest_published_signal_at',
  'security_posture',
] as const;

const projectCurrentStateKeys = [
  'project_id',
  'project_score_id',
  'slug',
  'name',
  'summary',
  'lifecycle',
  'primary_chain',
  'official_website_url',
  'project_updated_at',
  'opportunity_score',
  'risk_score',
  'score_confidence',
  'recommendation',
  'score_model_version',
  'score_input_version',
  'score_explanation',
  'score_calculated_at',
  'security_posture',
] as const;

function parseOpportunityListRow(value: unknown): OpportunityListRow {
  if (!isRecordWithExactKeys(value, opportunityListKeys)) {
    throw new TypeError('Project repository returned unsafe opportunity projection.');
  }
  if (
    !isUuid(value.project_id) ||
    !isNonEmptyString(value.slug) ||
    !isNonEmptyString(value.name) ||
    !isNullableString(value.summary) ||
    (value.lifecycle !== 'active' && value.lifecycle !== 'rumored') ||
    !isNullableString(value.primary_chain) ||
    !isFiniteNumber(value.opportunity_score) ||
    !isFiniteNumber(value.risk_score) ||
    !isFiniteNumber(value.confidence) ||
    !isRecommendation(value.recommendation) ||
    !isIsoTimestamp(value.calculated_at) ||
    !isNullableIsoTimestamp(value.latest_published_signal_at) ||
    !isSecurityPosture(value.security_posture)
  ) {
    throw new TypeError('Project repository returned unsafe opportunity projection.');
  }
  return value as OpportunityListRow;
}

function parseProjectCurrentStateRow(value: unknown): ProjectCurrentStateRow {
  if (!isRecordWithExactKeys(value, projectCurrentStateKeys)) {
    throw new TypeError('Project repository returned unsafe project projection.');
  }
  if (
    !isUuid(value.project_id) ||
    !isNonEmptyString(value.slug) ||
    !isNonEmptyString(value.name) ||
    !isNullableString(value.summary) ||
    !isProjectLifecycle(value.lifecycle) ||
    !isNullableString(value.primary_chain) ||
    !isNullableString(value.official_website_url) ||
    !isIsoTimestamp(value.project_updated_at) ||
    !isSecurityPosture(value.security_posture)
  ) {
    throw new TypeError('Project repository returned unsafe project projection.');
  }

  const scoreValues = [
    value.project_score_id,
    value.opportunity_score,
    value.risk_score,
    value.score_confidence,
    value.recommendation,
    value.score_model_version,
    value.score_input_version,
    value.score_explanation,
    value.score_calculated_at,
  ];
  if (scoreValues.every((scoreValue) => scoreValue === null)) {
    return value as unknown as ProjectCurrentStateRow;
  }
  if (
    !isUuid(value.project_score_id) ||
    !isFiniteNumber(value.opportunity_score) ||
    !isFiniteNumber(value.risk_score) ||
    !isFiniteNumber(value.score_confidence) ||
    !isRecommendation(value.recommendation) ||
    !isNonEmptyString(value.score_model_version) ||
    !isNonEmptyString(value.score_input_version) ||
    !isNonEmptyString(value.score_explanation) ||
    !isIsoTimestamp(value.score_calculated_at)
  ) {
    throw new TypeError('Project repository returned unsafe project projection.');
  }
  return value as unknown as ProjectCurrentStateRow;
}

function mapProjectDetailRow(row: ProjectCurrentStateRow): ProjectDetail {
  return {
    projectId: row.project_id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    lifecycle: row.lifecycle,
    primaryChain: row.primary_chain,
    officialWebsiteUrl: row.official_website_url,
    updatedAt: row.project_updated_at,
    securityPosture: row.security_posture,
    latestScore:
      row.opportunity_score === null
        ? null
        : {
            id: row.project_score_id as string,
            modelVersion: row.score_model_version as string,
            inputVersion: row.score_input_version as string,
            opportunityScore: row.opportunity_score,
            riskScore: row.risk_score as number,
            confidence: row.score_confidence as number,
            recommendation: row.recommendation as Database['public']['Enums']['recommendation'],
            explanation: row.score_explanation as string,
            calculatedAt: row.score_calculated_at as string,
          },
  };
}

function isRecordWithExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === [...expectedKeys].sort()[index])
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  );
}

function isNullableIsoTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value);
}

function isProjectLifecycle(value: unknown): value is ProjectLifecycle {
  return value === 'rumored' || value === 'active' || value === 'paused' || value === 'ended' || value === 'archived';
}

function isRecommendation(value: unknown): value is Database['public']['Enums']['recommendation'] {
  return (
    value === 'act_now' ||
    value === 'watch' ||
    value === 'research' ||
    value === 'avoid' ||
    value === 'blocked'
  );
}

function isSecurityPosture(value: unknown): value is SecurityPosture {
  return value === 'clear' || value === 'caution' || value === 'blocked';
}

function isSignalVerification(value: unknown): value is SignalVerification {
  return (
    value === 'unverified' ||
    value === 'corroborated' ||
    value === 'verified' ||
    value === 'disputed' ||
    value === 'retracted'
  );
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
