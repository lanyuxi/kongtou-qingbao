import type { Recommendation, ScoringProvenance, SignalVerification } from '@airdrop/contracts';
import type { Sql, TransactionSql } from 'postgres';

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

export type RecordProjectScoreResult =
  | {
      readonly projectScoreId: string;
      readonly created: true;
      readonly skippedReason: null;
    }
  | {
      readonly projectScoreId: string;
      readonly created: false;
      readonly skippedReason: null;
    }
  | {
      readonly projectScoreId: null;
      readonly created: false;
      readonly skippedReason: 'security_restricted';
    };

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
            and public.current_security_target_posture('project', signal.project_id) = 'clear'
            and public.signal_has_valid_evidence(signal.id)
            and not exists (
              select 1
              from public.signal_evidence_links as security_link
              join public.evidence as security_evidence
                on security_evidence.id = security_link.evidence_id
              join public.raw_items as security_raw
                on security_raw.id = security_evidence.raw_item_id
                and security_raw.project_id = signal.project_id
                and security_raw.source_id = security_evidence.source_id
              left join public.discovered_items as security_discovery
                on security_discovery.id = security_evidence.discovered_item_id
              where security_link.signal_id = signal.id
                and public.current_security_target_posture(
                  'source', security_evidence.source_id
                ) = 'caution'
                and (
                  security_evidence.discovered_item_id is null
                  or (
                    security_discovery.project_id = signal.project_id
                    and security_discovery.source_id = security_evidence.source_id
                    and (
                      security_evidence.source_field <> 'discovered_summary'
                      or security_discovery.feed_raw_item_id = security_evidence.raw_item_id
                    )
                  )
                )
            )
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
            and public.current_security_target_posture('project', signal.project_id) = 'clear'
            and public.signal_has_valid_evidence(signal.id)
            and not exists (
              select 1
              from public.signal_evidence_links as security_link
              join public.evidence as security_evidence
                on security_evidence.id = security_link.evidence_id
              join public.raw_items as security_raw
                on security_raw.id = security_evidence.raw_item_id
                and security_raw.project_id = signal.project_id
                and security_raw.source_id = security_evidence.source_id
              left join public.discovered_items as security_discovery
                on security_discovery.id = security_evidence.discovered_item_id
              where security_link.signal_id = signal.id
                and public.current_security_target_posture(
                  'source', security_evidence.source_id
                ) = 'caution'
                and (
                  security_evidence.discovered_item_id is null
                  or (
                    security_discovery.project_id = signal.project_id
                    and security_discovery.source_id = security_evidence.source_id
                    and (
                      security_evidence.source_field <> 'discovered_summary'
                      or security_discovery.feed_raw_item_id = security_evidence.raw_item_id
                    )
                  )
                )
            )
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
          await lockSecurityTarget(tx, 'project', input.projectId);
          const evidenceRows = await tx<readonly { signal_id: string; source_id: string }[]>`
            select distinct signal.id as signal_id, evidence_record.source_id
            from public.signals as signal
            join public.signal_evidence_links as evidence_link
              on evidence_link.signal_id = signal.id
            join public.evidence as evidence_record
              on evidence_record.id = evidence_link.evidence_id
            join public.raw_items as raw_item
              on raw_item.id = evidence_record.raw_item_id
              and raw_item.project_id = signal.project_id
              and raw_item.source_id = evidence_record.source_id
            left join public.discovered_items as discovered_item
              on discovered_item.id = evidence_record.discovered_item_id
            where signal.project_id = ${input.projectId}::uuid
              and signal.id = any(${input.linkedSignalIds}::uuid[])
              and signal.lifecycle = 'published'
              and (
                evidence_record.discovered_item_id is null
                or (
                  discovered_item.project_id = signal.project_id
                  and discovered_item.source_id = evidence_record.source_id
                  and (
                    evidence_record.source_field <> 'discovered_summary'
                    or discovered_item.feed_raw_item_id = evidence_record.raw_item_id
                  )
                )
              )
            order by signal.id asc, evidence_record.source_id asc
          `;
          const requiredSignalIds = new Set(input.linkedSignalIds);
          const sourceIds = [...new Set(evidenceRows.map((row) => row.source_id))].sort();
          for (const sourceId of sourceIds) {
            await lockSecurityTarget(tx, 'source', sourceId);
          }
          const projectPosture = await loadSecurityPosture(tx, 'project', input.projectId);
          const sourcePostureEntries = await Promise.all(
            sourceIds.map(async (sourceId) => [
              sourceId,
              await loadSecurityPosture(tx, 'source', sourceId),
            ] as const),
          );
          const sourcePostures = new Map(sourcePostureEntries);
          const evidenceSourcesBySignal = new Map<string, Set<string>>();
          for (const row of evidenceRows) {
            const sources = evidenceSourcesBySignal.get(row.signal_id) ?? new Set<string>();
            sources.add(row.source_id);
            evidenceSourcesBySignal.set(row.signal_id, sources);
          }
          const evidenceRestricted = [...requiredSignalIds].some((signalId) => {
            const postures = [...(evidenceSourcesBySignal.get(signalId) ?? [])]
              .map((sourceId) => sourcePostures.get(sourceId));
            return !postures.includes('clear') || postures.includes('caution');
          });
          if (
            projectPosture !== 'clear'
            || evidenceRestricted
          ) {
            return {
              projectScoreId: null,
              created: false,
              skippedReason: 'security_restricted',
            };
          }

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
            return { projectScoreId: existingRow.id, created: false, skippedReason: null };
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
          return { projectScoreId, created: true, skippedReason: null };
        });
      });
    },
  };
}

type SecurityTargetType = 'project' | 'source';
type SecurityPosture = 'clear' | 'caution' | 'blocked';

async function lockSecurityTarget(
  sql: TransactionSql,
  targetType: SecurityTargetType,
  targetId: string,
): Promise<void> {
  await sql`
    select pg_catalog.pg_advisory_xact_lock(
      public.security_target_lock_key_v1(${targetType}, ${targetId}::uuid)
    )
  `;
}

async function loadSecurityPosture(
  sql: TransactionSql,
  targetType: SecurityTargetType,
  targetId: string,
): Promise<SecurityPosture> {
  const rows = await sql<readonly { posture: string }[]>`
    select public.current_security_target_posture(${targetType}, ${targetId}::uuid) as posture
  `;
  const posture = rows[0]?.posture;
  if (posture !== 'clear' && posture !== 'caution' && posture !== 'blocked') {
    throw new ScoringPersistenceError();
  }
  return posture;
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
