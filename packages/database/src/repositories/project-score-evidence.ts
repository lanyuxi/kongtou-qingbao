import {
  publicProjectEvidenceCitationRowSchema,
  publicProjectScoreFactorRowSchema,
  type PublicProjectEvidenceCitationRow,
  type PublicProjectScoreFactorRow,
} from '@airdrop/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../generated/database.types.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const factorSelection =
  'project_id,project_score_id,axis,factor_code,contribution,input_value,detail';
const citationSelection =
  'project_id,project_score_id,signal_id,signal_title,signal_verification,signal_published_at,evidence_id,citation_text,evidence_source_field,evidence_verified_at,source_id,source_name,source_type,source_is_official,source_relation_verified_at';
const citationPageSize = 1_000;

const axisOrder = { opportunity: 0, risk: 1, confidence: 2 } as const;

export interface ProjectScoreFactor {
  readonly axis: PublicProjectScoreFactorRow['axis'];
  readonly factorCode: string;
  readonly contribution: number;
  readonly inputValue: number;
  readonly detail: string;
}

export interface ProjectEvidenceCitation {
  readonly signalId: string;
  readonly signalTitle: string;
  readonly signalVerification: PublicProjectEvidenceCitationRow['signal_verification'];
  readonly signalPublishedAt: string | null;
  readonly evidenceId: string;
  readonly citationText: string;
  readonly evidenceSourceField: PublicProjectEvidenceCitationRow['evidence_source_field'];
  readonly evidenceVerifiedAt: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceType: PublicProjectEvidenceCitationRow['source_type'];
  readonly sourceIsOfficial: boolean;
  readonly sourceRelationVerifiedAt: string | null;
}

export async function listCurrentScoreFactors(
  client: SupabaseClient<Database>,
  projectId: string,
  projectScoreId: string,
): Promise<ProjectScoreFactor[]> {
  validateIdentifiers(projectId, projectScoreId);

  const response = await client
    .from('project_current_score_factors')
    .select(factorSelection)
    .eq('project_id', projectId)
    .eq('project_score_id', projectScoreId);

  if (response.error !== null) {
    throw new ProjectScoreFactorQueryError(response.error.code);
  }

  const factors = (response.data ?? []).map((row) =>
    mapProjectScoreFactor(publicProjectScoreFactorRowSchema.parse(row)),
  );
  factors.sort(
    (left, right) =>
      axisOrder[left.axis] - axisOrder[right.axis] ||
      right.contribution - left.contribution ||
      left.factorCode.localeCompare(right.factorCode),
  );
  return factors;
}

export async function listCurrentScoreEvidenceCitations(
  client: SupabaseClient<Database>,
  projectId: string,
  projectScoreId: string,
): Promise<ProjectEvidenceCitation[]> {
  validateIdentifiers(projectId, projectScoreId);

  const rows: PublicProjectEvidenceCitationRow[] = [];
  const rowKeys = new Set<string>();
  let expectedCount: number | undefined;

  for (let from = 0; ; from += citationPageSize) {
    const response = await client
      .from('project_current_score_evidence_citations')
      .select(citationSelection, { count: 'exact' })
      .eq('project_id', projectId)
      .eq('project_score_id', projectScoreId)
      .order('signal_published_at', { ascending: false, nullsFirst: false })
      .order('signal_id', { ascending: true })
      .order('evidence_verified_at', { ascending: false })
      .order('evidence_id', { ascending: true })
      .range(from, from + citationPageSize - 1);

    if (response.error !== null) {
      throw new ProjectEvidenceCitationQueryError(response.error.code);
    }
    if (
      response.count === null ||
      !Number.isSafeInteger(response.count) ||
      response.count < 0
    ) {
      throw new ProjectEvidenceCitationQueryError('citation_count_missing');
    }
    if (expectedCount === undefined) {
      expectedCount = response.count;
    } else if (response.count !== expectedCount) {
      throw new ProjectEvidenceCitationQueryError('citation_count_changed');
    }

    const page = response.data ?? [];
    const expectedPageLength = Math.min(citationPageSize, expectedCount - from);
    if (page.length !== expectedPageLength) {
      throw new ProjectEvidenceCitationQueryError('citation_page_size_mismatch');
    }

    for (const value of page) {
      const row = publicProjectEvidenceCitationRowSchema.parse(value);
      const rowKey = `${row.signal_id}:${row.evidence_id}`;
      if (rowKeys.has(rowKey)) {
        throw new ProjectEvidenceCitationQueryError('citation_duplicate_row');
      }
      rowKeys.add(rowKey);
      rows.push(row);
    }

    if (rows.length === expectedCount) {
      break;
    }
  }

  if (expectedCount === undefined || rows.length !== expectedCount) {
    throw new ProjectEvidenceCitationQueryError('citation_count_mismatch');
  }

  const citations = rows.map(mapProjectEvidenceCitation);
  citations.sort(compareProjectEvidenceCitations);
  return citations;
}

export class ProjectScoreFactorQueryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super('Unable to read current project score factors.');
    this.name = 'ProjectScoreFactorQueryError';
    this.code = code;
  }
}

export class ProjectEvidenceCitationQueryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super('Unable to read current project score Evidence citations.');
    this.name = 'ProjectEvidenceCitationQueryError';
    this.code = code;
  }
}

function validateIdentifiers(projectId: string, projectScoreId: string): void {
  if (!uuidPattern.test(projectId)) {
    throw new RangeError('Project ID format is invalid.');
  }
  if (!uuidPattern.test(projectScoreId)) {
    throw new RangeError('Project score ID format is invalid.');
  }
}

function mapProjectScoreFactor(row: PublicProjectScoreFactorRow): ProjectScoreFactor {
  return {
    axis: row.axis,
    factorCode: row.factor_code,
    contribution: row.contribution,
    inputValue: row.input_value,
    detail: row.detail,
  };
}

function mapProjectEvidenceCitation(
  row: PublicProjectEvidenceCitationRow,
): ProjectEvidenceCitation {
  return {
    signalId: row.signal_id,
    signalTitle: row.signal_title,
    signalVerification: row.signal_verification,
    signalPublishedAt: row.signal_published_at,
    evidenceId: row.evidence_id,
    citationText: row.citation_text,
    evidenceSourceField: row.evidence_source_field,
    evidenceVerifiedAt: row.evidence_verified_at,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceType: row.source_type,
    sourceIsOfficial: row.source_is_official,
    sourceRelationVerifiedAt: row.source_relation_verified_at,
  };
}

function compareProjectEvidenceCitations(
  left: ProjectEvidenceCitation,
  right: ProjectEvidenceCitation,
): number {
  return (
    compareNullableTimestampsDescending(left.signalPublishedAt, right.signalPublishedAt) ||
    left.signalId.localeCompare(right.signalId) ||
    Date.parse(right.evidenceVerifiedAt) - Date.parse(left.evidenceVerifiedAt) ||
    left.evidenceId.localeCompare(right.evidenceId)
  );
}

function compareNullableTimestampsDescending(left: string | null, right: string | null): number {
  if (left === null) {
    return right === null ? 0 : 1;
  }
  if (right === null) {
    return -1;
  }
  return Date.parse(right) - Date.parse(left);
}
