import postgres from 'postgres';

import {
  createExtractionRepository,
  createScoringRepository,
  createTutorialCandidateRepository,
} from '@airdrop/database';

import { createOpenAiCompatibleModelClient } from '../ai/model-client.js';
import { runExtractionOnce } from '../ai/extract-discovered.js';
import { runScoringOnce } from '../scoring/score-projects.js';
import { runTutorialGenerationOnce } from '../tutorials/generate-candidates.js';

/**
 * One bounded pass of the AI stage, for environments that cannot host a daemon
 * (Vercel Cron calls this through an HTTP route).
 *
 * The daemon loops the same three runners on a timer; here each runs exactly
 * once, with hard caps on how much work each may take, so the call finishes
 * inside a serverless time limit. Whatever is left is picked up by the next
 * scheduled pass.
 *
 * IMPORTANT: extraction only ever writes *candidates*. Turning a candidate into
 * a published signal is a human review step (see the /review workspace) — this
 * function cannot and must not bypass that.
 */
export interface AiStageOnceOptions {
  readonly databaseUrl: string;
  readonly modelApiKey: string;
  readonly modelBaseUrl: string;
  readonly modelId: string;
  readonly maxInputs?: number;
  readonly maxProjects?: number;
  readonly maxPublish?: number;
}

export interface AiStageOnceResult {
  readonly extraction: {
    readonly processed: number;
    readonly succeeded: number;
    readonly schemaInvalid: number;
    readonly providerErrors: number;
    readonly candidatesInserted: number;
  };
  readonly published: number;
  readonly scoring: {
    readonly projectsScored: number;
    readonly projectsSkipped: number;
    readonly securitySkipped: number;
  };
  readonly tutorials: {
    readonly processed: number;
    readonly skippedNoMaterial: number;
    readonly candidatesInserted: number;
  };
}

// Deliberately small: each model call is seconds of latency, and one pass has
// to stay inside the function ceiling.
const DEFAULT_MAX_INPUTS = 2;
const DEFAULT_MAX_PROJECTS = 2;
const DEFAULT_MAX_PUBLISH = 10;

/**
 * Publishes every pending candidate as an unverified signal.
 *
 * The pipeline was originally review-gated: AI output stayed a candidate until
 * a human promoted it. The owner asked for candidates to surface without a
 * review step, being the only operator and having no way to vet model output.
 *
 * This does NOT assert that the content is true. promote_extraction_candidate
 * writes verification = 'unverified' with lifecycle = 'published' — visible,
 * but explicitly not vouched for — and the signal keeps its evidence quote and
 * source link so a reader can check it. That distinction is the whole reason
 * those are two separate columns, and it is what keeps this honest.
 */
async function publishPendingCandidates(
  sql: postgres.Sql,
  limit: number,
): Promise<number> {
  const rows = await sql<readonly { id: string }[]>`
    select id from public.extraction_candidates
    where status = 'pending'
    order by created_at
    limit ${limit}`;

  let published = 0;
  for (const row of rows) {
    try {
      await sql`
        select public.promote_extraction_candidate(${row.id}::uuid, ${'auto:ai-stage'})`;
      published += 1;
    } catch {
      // Raced with another pass, or already decided. Not an error for us.
    }
  }
  return published;
}

export async function runAiStageOnce(options: AiStageOnceOptions): Promise<AiStageOnceResult> {
  const sql = postgres(options.databaseUrl, {
    max: 2,
    idle_timeout: 20,
    connect_timeout: 8,
  });

  try {
    const modelClient = createOpenAiCompatibleModelClient({
      baseUrl: options.modelBaseUrl,
      apiKey: options.modelApiKey,
      model: options.modelId,
    });

    const extraction = await runExtractionOnce({
      repository: createExtractionRepository(sql),
      modelClient,
      maxInputs: options.maxInputs ?? DEFAULT_MAX_INPUTS,
    });

    // Before scoring: scoring reads published signals, so candidates have to be
    // promoted first or there is nothing to score.
    const published = await publishPendingCandidates(
      sql,
      options.maxPublish ?? DEFAULT_MAX_PUBLISH,
    );

    const scoring = await runScoringOnce({
      repository: createScoringRepository(sql),
      maxProjects: options.maxProjects ?? DEFAULT_MAX_PROJECTS,
    });

    const tutorials = await runTutorialGenerationOnce({
      repository: createTutorialCandidateRepository(sql),
      modelClient,
      maxProjects: options.maxProjects ?? DEFAULT_MAX_PROJECTS,
    });

    return {
      extraction: {
        processed: extraction.processed,
        succeeded: extraction.succeeded,
        schemaInvalid: extraction.schemaInvalid,
        providerErrors: extraction.providerErrors,
        candidatesInserted: extraction.candidatesInserted,
      },
      published,
      scoring: {
        projectsScored: scoring.projectsScored,
        projectsSkipped: scoring.projectsSkipped,
        securitySkipped: scoring.securitySkipped,
      },
      tutorials: {
        processed: tutorials.processed,
        skippedNoMaterial: tutorials.skippedNoMaterial,
        candidatesInserted: tutorials.candidatesInserted,
      },
    };
  } finally {
    // Without this the pool keeps the event loop alive and the invocation
    // hangs until it times out.
    await sql.end();
  }
}
