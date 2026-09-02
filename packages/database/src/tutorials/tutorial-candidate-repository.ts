import type { TutorialCandidatePayload, TutorialKind } from '@airdrop/contracts';
import type postgres from 'postgres';

import type { Json } from '../generated/database.types.js';

/**
 * Tutorial generation is a worker-side stage: it reads verified participation
 * signals and the verified-reference allowlist, and appends pending candidates
 * only. Promotion, rejection, and publication stay behind the reviewer
 * commands, so this repository never touches the tutorial ledger itself.
 */
export interface TutorialMaterialSignal {
  readonly signalId: string;
  readonly kind: TutorialKind;
  readonly title: string;
  readonly summary: string;
  readonly publishedAt: string | null;
}

export interface TutorialMaterialReference {
  readonly referenceId: string;
  readonly kind: string;
  readonly label: string | null;
}

export interface TutorialGenerationMaterial {
  readonly projectId: string;
  readonly projectName: string;
  readonly signals: readonly TutorialMaterialSignal[];
  readonly references: readonly TutorialMaterialReference[];
}

export interface TutorialRunRecord {
  readonly inputId: string;
  readonly inputHash: string;
  readonly modelId: string;
  readonly status: string;
  readonly output: Json | null;
  readonly usage: Json | null;
  readonly latencyMs: number | null;
  readonly errorDetail: string | null;
}

export interface TutorialCandidateInsert {
  readonly runId: string;
  readonly projectId: string;
  readonly kind: TutorialKind;
  readonly payload: TutorialCandidatePayload;
  readonly sourceSignalIds: readonly string[];
  readonly confidence: number;
  readonly contentHash: string;
}

export interface TutorialCandidateRepository {
  listMaterials(limit: number): Promise<readonly TutorialGenerationMaterial[]>;
  hasSucceededRun(projectId: string, inputHash: string): Promise<boolean>;
  recordRun(input: TutorialRunRecord): Promise<string>;
  insertCandidate(input: TutorialCandidateInsert): Promise<boolean>;
}

// The six participable claim types from the extraction contract. Security and
// scam signals are coupling triggers, never tutorial material.
export const tutorialMaterialSignalTypes: readonly TutorialKind[] = [
  'airdrop_campaign',
  'points_program',
  'snapshot_notice',
  'task_launch',
  'token_launch',
  'eligibility_rule',
];

const stageName = 'tutorial_generation';
const inputKind = 'tutorial_material';
const promptVersion = 'tutorial-generator-v1';
const schemaVersion = 'tutorial-candidate-payload-v1';
const pipelineVersion = 'phase-8-tutorial-generation-v1';

export function createTutorialCandidateRepository(
  sql: postgres.Sql,
): TutorialCandidateRepository {
  return {
    async listMaterials(limit) {
      const projectRows = await sql<{
        id: string;
        name: string;
      }[]>`
        select p.id, p.name
        from public.projects as p
        where public.current_security_target_posture('project', p.id) <> 'blocked'
        order by p.slug
        limit ${limit}
      `;
      const projectIds = projectRows.map((row) => row.id);
      if (projectIds.length === 0) return [];

      const [signalRows, referenceRows] = await Promise.all([
        sql<{
          id: string;
          project_id: string;
          signal_type: string;
          title: string;
          summary: string;
          published_at: string | null;
        }[]>`
          select s.id, s.project_id, s.signal_type, s.title, s.summary, s.published_at
          from public.signals as s
          where s.project_id = any(${projectIds}::uuid[])
            and s.signal_type = any(${[...tutorialMaterialSignalTypes]}::text[])
            and s.verification in ('verified', 'corroborated')
            and s.lifecycle = 'published'
          order by s.project_id, s.published_at desc nulls last, s.id
        `,
        sql<{
          reference_id: string;
          project_id: string;
          kind: string;
          label: string | null;
        }[]>`
          select r.reference_id, r.project_id, r.kind, r.label
          from public.public_project_references as r
          where r.project_id = any(${projectIds}::uuid[])
          order by r.project_id, r.reference_id
        `,
      ]);

      return projectRows.map((project) => ({
        projectId: project.id,
        projectName: project.name,
        signals: signalRows
          .filter((row) => row.project_id === project.id)
          .map((row) => ({
            signalId: row.id,
            kind: row.signal_type as TutorialKind,
            title: row.title,
            summary: row.summary,
            publishedAt: row.published_at,
          })),
        references: referenceRows
          .filter((row) => row.project_id === project.id)
          .map((row) => ({
            referenceId: row.reference_id,
            kind: row.kind,
            label: row.label,
          })),
      }));
    },

    async hasSucceededRun(projectId, inputHash) {
      const rows = await sql`
        select 1 as present
        from public.ai_runs as r
        where r.input_kind = ${inputKind}
          and r.input_id = ${projectId}::uuid
          and r.input_hash = ${inputHash}
          and r.status = 'succeeded'
        limit 1
      `;
      return rows.length > 0;
    },

    async recordRun(input) {
      const rows = await sql<{ id: string }[]>`
        insert into public.ai_runs (
          stage, input_kind, input_id, input_hash, model_id, prompt_version,
          schema_version, pipeline_version, status, output, usage, latency_ms,
          error_detail
        ) values (
          ${stageName},
          ${inputKind},
          ${input.inputId}::uuid,
          ${input.inputHash},
          ${input.modelId},
          ${promptVersion},
          ${schemaVersion},
          ${pipelineVersion},
          ${input.status},
          ${input.output === null ? null : sql.json(input.output)},
          ${input.usage === null ? null : sql.json(input.usage)},
          ${input.latencyMs},
          ${input.errorDetail}
        )
        returning id
      `;
      const id = rows[0]?.id;
      if (id === undefined) throw new Error('tutorial_run_insert_failed');
      return id;
    },

    async insertCandidate(input) {
      const inserted = await sql<{ id: string }[]>`
        insert into public.tutorial_candidates (
          project_id, kind, payload, source_signal_ids, confidence,
          status, version, model_run_id, content_hash
        ) values (
          ${input.projectId}::uuid,
          ${input.kind},
          ${sql.json(asJsonValue(input.payload))},
          ${[...input.sourceSignalIds]}::uuid[],
          ${input.confidence},
          'pending',
          1,
          ${input.runId}::uuid,
          ${input.contentHash}
        )
        on conflict (project_id, kind, content_hash) do nothing
        returning id
      `;
      return inserted.length === 1;
    },
  };
}

/**
 * The payload is a validated contract object, so it is JSON-serialisable by
 * construction; the cast only bridges postgres.js' structural `JSONValue`.
 */
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}
