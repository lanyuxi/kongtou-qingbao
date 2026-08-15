import type { Recommendation, ScoringProvenance, SignalVerification } from '@airdrop/contracts';
import type { Sql } from 'postgres';

export interface ScoringSignalRecord {
  readonly signalId: string;
  readonly verification: SignalVerification;
  readonly confidence: number;
  readonly publishedAt: string | null;
  readonly expiresAt: string | null;
  readonly provenance: ScoringProvenance;
}

export interface ScoringProjectInput {
  readonly projectId: string;
  readonly projectLifecycle: 'active' | 'rumored';
  readonly signals: readonly ScoringSignalRecord[];
}

export interface ScoreFactorRecord {
  readonly axis: 'opportunity' | 'risk' | 'confidence';
  readonly factorCode: string;
  readonly contribution: number;
  readonly inputValue: number;
  readonly detail: string;
}

export interface RecordProjectScoreInput {
  readonly projectId: string;
  readonly modelVersion: string;
  readonly inputVersion: string;
  readonly opportunityScore: number;
  readonly riskScore: number;
  readonly confidence: number;
  readonly recommendation: Recommendation;
  readonly explanation: string;
  readonly calculatedAtIso: string;
  readonly factors: readonly ScoreFactorRecord[];
  readonly linkedSignalIds: readonly string[];
}

export interface RecordProjectScoreResult {
  readonly projectScoreId: string;
  readonly created: boolean;
}

export class ScoringPersistenceError extends Error {
  readonly code = 'scoring_persistence_failed' as const;

  constructor(options?: { readonly cause?: unknown }) {
    super('scoring_persistence_failed', options);
    this.name = 'ScoringPersistenceError';
  }
}

export interface ScoringRepository {
  listScoringInputs(limit: number): Promise<readonly ScoringProjectInput[]>;
  recordProjectScore(input: RecordProjectScoreInput): Promise<RecordProjectScoreResult>;
}

export function createScoringRepository(sql: Sql): ScoringRepository {
  async function run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ScoringPersistenceError) {
        throw error;
      }
      throw new ScoringPersistenceError({ cause: error });
    }
  }

  return {
    async listScoringInputs(limit) {
      return run(async () => {
        const projectRows = await sql`
          select signal.project_id, project.lifecycle as project_lifecycle
          from public.signals as signal
          join public.projects as project on project.id = signal.project_id
          where signal.lifecycle = 'published'
            and project.lifecycle in ('active', 'rumored')
          group by signal.project_id, project.lifecycle
          order by min(signal.created_at) asc, signal.project_id asc
          limit ${limit}
        `;
        if (projectRows.length === 0) {
          return [];
        }
        const projectIds = projectRows.map((row) => row.project_id);
        const signalRows = await sql`
          select
            signal.project_id,
            signal.id as signal_id,
            signal.verification,
            signal.confidence,
            signal.published_at,
            signal.expires_at,
            case
              when relation.is_official is true then 'official'
              when candidate.id is null then 'unknown'
              else 'third_party'
            end as provenance
          from public.signals as signal
          left join public.extraction_candidates as candidate
            on candidate.signal_id = signal.id
          left join public.project_sources as relation
            on relation.project_id = signal.project_id
            and relation.source_id = candidate.source_id
          where signal.project_id = any(${projectIds})
            and signal.lifecycle = 'published'
          order by signal.project_id asc, signal.published_at desc nulls last, signal.id asc
        `;

        const lifecycleByProject = new Map<string, 'active' | 'rumored'>();
        for (const project of projectRows) {
          lifecycleByProject.set(project.project_id, project.project_lifecycle);
        }
        const signalsByProject = new Map<string, ScoringSignalRecord[]>();
        for (const row of signalRows) {
          if (!lifecycleByProject.has(row.project_id)) {
            continue;
          }
          const bucket = signalsByProject.get(row.project_id) ?? [];
          bucket.push(mapScoringSignal(row));
          signalsByProject.set(row.project_id, bucket);
        }
        return projectRows.map((project) => ({
          projectId: project.project_id,
          projectLifecycle: lifecycleByProject.get(project.project_id) ?? 'active',
          signals: signalsByProject.get(project.project_id) ?? [],
        }));
      });
    },

    async recordProjectScore(input) {
      return run(async () => {
        return sql.begin(async (tx) => {
          const inserted = await tx`
            insert into public.project_scores (
              project_id, model_version, input_version,
              opportunity_score, risk_score, confidence,
              recommendation, explanation, calculated_at
            )
            values (
              ${input.projectId}, ${input.modelVersion}, ${input.inputVersion},
              ${input.opportunityScore}, ${input.riskScore}, ${input.confidence},
              ${input.recommendation}, ${input.explanation}, ${input.calculatedAtIso}
            )
            on conflict (project_id, model_version, input_version) do nothing
            returning id
          `;
          const insertedRow = inserted.at(0);
          if (insertedRow === undefined) {
            const existing = await tx`
              select id from public.project_scores
              where project_id = ${input.projectId}
                and model_version = ${input.modelVersion}
                and input_version = ${input.inputVersion}
            `;
            const existingRow = existing.at(0);
            if (existingRow === undefined) {
              throw new ScoringPersistenceError();
            }
            return { projectScoreId: existingRow.id, created: false };
          }

          const projectScoreId = insertedRow.id;
          for (const factor of input.factors) {
            await tx`
              insert into public.score_factors (
                project_score_id, axis, factor_code, contribution, input_value, detail
              )
              values (
                ${projectScoreId}, ${factor.axis}, ${factor.factorCode},
                ${factor.contribution}, ${factor.inputValue}, ${factor.detail}
              )
            `;
          }
          for (const signalId of input.linkedSignalIds) {
            await tx`
              insert into public.score_signal_links (project_score_id, signal_id)
              values (${projectScoreId}, ${signalId})
            `;
          }
          return { projectScoreId, created: true };
        });
      });
    },
  };
}

type ScoringSignalRow = Record<string, unknown>;

function mapScoringSignal(row: ScoringSignalRow): ScoringSignalRecord {
  return {
    signalId: requireString(row.signal_id),
    verification: requireEnumeration(row.verification),
    confidence: Number(row.confidence),
    publishedAt: toIsoOrNull(row.published_at),
    expiresAt: toIsoOrNull(row.expires_at),
    provenance: requireProvenance(row.provenance),
  };
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ScoringPersistenceError();
  }
  return value;
}

function requireEnumeration(value: unknown): SignalVerification {
  if (
    value !== 'unverified' &&
    value !== 'corroborated' &&
    value !== 'verified' &&
    value !== 'disputed' &&
    value !== 'retracted'
  ) {
    throw new ScoringPersistenceError();
  }
  return value;
}

function requireProvenance(value: unknown): ScoringProvenance {
  if (value !== 'official' && value !== 'third_party' && value !== 'unknown') {
    throw new ScoringPersistenceError();
  }
  return value;
}

function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) {
    throw new ScoringPersistenceError();
  }
  return parsed.toISOString();
}
