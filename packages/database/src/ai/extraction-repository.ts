import type { ExtractionCandidatePayload, ExtractionRunStatus } from '@airdrop/contracts';
import type { Sql } from 'postgres';

import type { Database, Json } from '../generated/database.types.js';

export type ExtractionCandidateRow = Database['public']['Tables']['extraction_candidates']['Row'];

export interface PendingExtractionInput {
  readonly discoveredItemId: string;
  readonly projectId: string;
  readonly sourceId: string;
  readonly articleRawItemId: string | null;
  readonly title: string | null;
  readonly summary: string | null;
  readonly entryUrl: string | null;
  readonly publishedAt: string | null;
  readonly articleText: string | null;
}

export interface RecordExtractionRunInput {
  readonly inputId: string;
  readonly inputHash: string;
  readonly modelId: string;
  readonly status: ExtractionRunStatus;
  readonly output: Json | null;
  readonly usage: Json | null;
  readonly latencyMs: number | null;
  readonly errorDetail: string | null;
}

export interface ExtractionCandidateInput {
  readonly projectId: string;
  readonly sourceId: string;
  readonly discoveredItemId: string;
  readonly rawItemId: string | null;
  readonly payload: ExtractionCandidatePayload;
  readonly payloadSha256: string;
}

export interface PendingCandidateRecord {
  readonly id: string;
  readonly projectId: string;
  readonly discoveredItemId: string;
  readonly payload: ExtractionCandidatePayload;
  readonly createdAt: string;
}

export class ExtractionPersistenceError extends Error {
  readonly code = 'extraction_persistence_failed' as const;

  constructor() {
    super('extraction_persistence_failed');
    this.name = 'ExtractionPersistenceError';
  }
}

export interface ExtractionRepository {
  listPendingInputs(limit: number): Promise<PendingExtractionInput[]>;
  recordExtractionRun(input: RecordExtractionRunInput): Promise<string>;
  insertCandidates(
    aiRunId: string,
    candidates: readonly ExtractionCandidateInput[],
  ): Promise<number>;
  listPendingCandidates(limit: number): Promise<PendingCandidateRecord[]>;
}

export function createExtractionRepository(sql: Sql): ExtractionRepository {
  async function run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch {
      throw new ExtractionPersistenceError();
    }
  }

  return {
    async listPendingInputs(limit) {
      return run(async () => {
        // Poison-input protection for the automatic orchestration loop: an
        // input is attempted at most once per pipeline version. The filter
        // aligns with recordExtractionRun's dedup key — any run row at the
        // current pipeline version (succeeded, failed, or skipped) settles
        // the input. Failed inputs stay visible to the human review flow via
        // ai_runs history; they never re-burn model tokens on a timer.
        const rows = await sql`
          select
            discovered.id as discovered_item_id,
            discovered.project_id,
            discovered.source_id,
            discovered.article_raw_item_id,
            discovered.title,
            discovered.summary,
            discovered.entry_url,
            discovered.published_at,
            article.raw_text as article_text
          from public.discovered_items as discovered
          left join public.raw_items as article
            on article.id = discovered.article_raw_item_id
          where (
            discovered.article_raw_item_id is not null
            or discovered.summary is not null
          )
          and not exists (
            select 1
            from public.ai_runs as processed
            where processed.input_kind = 'discovered_item'
              and processed.input_id = discovered.id
              and processed.pipeline_version = 'extract-pipeline-v1'
          )
          order by discovered.created_at desc
          limit ${limit}
        `;
        return rows.map((row) => ({
          discoveredItemId: row.discovered_item_id,
          projectId: row.project_id,
          sourceId: row.source_id,
          articleRawItemId: row.article_raw_item_id,
          title: row.title,
          summary: row.summary,
          entryUrl: row.entry_url,
          publishedAt: row.published_at === null ? null : new Date(row.published_at).toISOString(),
          articleText: row.article_text,
        }));
      });
    },

    async recordExtractionRun(input) {
      return run(async () => {
        const inserted = await sql`
          insert into public.ai_runs (
            stage, input_kind, input_id, input_hash, model_id,
            prompt_version, schema_version, pipeline_version,
            status, output, usage, latency_ms, error_detail
          )
          values (
            'extract.v1', 'discovered_item', ${input.inputId}, ${input.inputHash}, ${input.modelId},
            'extract-prompt-v1', 'extract-schema-v1', 'extract-pipeline-v1',
            ${input.status},
            ${input.output === null ? null : sql.json(input.output)},
            ${input.usage === null ? null : sql.json(input.usage)},
            ${input.latencyMs},
            ${input.errorDetail}
          )
          on conflict (
            stage, input_kind, input_id, input_hash, pipeline_version
          ) do nothing
          returning id
        `;
        const insertedRow = inserted.at(0);
        if (insertedRow !== undefined) {
          return insertedRow.id;
        }
        const existing = await sql`
          select id from public.ai_runs
          where input_kind = 'discovered_item'
            and input_id = ${input.inputId}
            and input_hash = ${input.inputHash}
            and pipeline_version = 'extract-pipeline-v1'
        `;
        const existingRow = existing.at(0);
        if (existingRow === undefined) {
          throw new ExtractionPersistenceError();
        }
        return existingRow.id;
      });
    },

    async insertCandidates(aiRunId, candidates) {
      return run(async () => {
        let inserted = 0;
        for (const candidate of candidates) {
          const rows = await sql`
            insert into public.extraction_candidates (
              ai_run_id, project_id, source_id, discovered_item_id, raw_item_id,
              payload, payload_sha256
            )
            values (
              ${aiRunId}, ${candidate.projectId}, ${candidate.sourceId},
              ${candidate.discoveredItemId}, ${candidate.rawItemId},
              ${sql.json(candidate.payload)}, ${candidate.payloadSha256}
            )
            on conflict (discovered_item_id, payload_sha256) do nothing
            returning id
          `;
          inserted += rows.length;
        }
        return inserted;
      });
    },

    async listPendingCandidates(limit) {
      return run(async () => {
        const rows = await sql`
          select id, project_id, discovered_item_id, payload, created_at
          from public.extraction_candidates
          where status = 'pending'
          order by created_at desc
          limit ${limit}
        `;
        return rows.map((row) => ({
          id: row.id,
          projectId: row.project_id,
          discoveredItemId: row.discovered_item_id,
          payload: row.payload as ExtractionCandidatePayload,
          createdAt: new Date(row.created_at).toISOString(),
        }));
      });
    },
  };
}
