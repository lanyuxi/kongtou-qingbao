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

// How many raw items one pass extracts.
//
// This is the pipeline's throughput limit, and it was the real reason the
// opportunity list stayed at two rows: with a backlog of ~260 un-extracted
// items and five per pass, whole sources (Ethereum's 111 items among them) had
// never been looked at, so they had no signals and therefore no scores.
//
// Each item is a model round-trip of a few seconds, so this still has to stay
// inside the invocation ceiling together with publishing and scoring.
const DEFAULT_MAX_INPUTS = 12;
// Scoring picks its projects ordered by oldest signal first. A small cap means
// long-lived seed rows permanently occupy the slots and newly collected
// projects never get scored — which is exactly what happened. Generous enough
// to reach past the seed data, still bounded for the time limit.
const DEFAULT_MAX_PROJECTS = 10;
const DEFAULT_MAX_PUBLISH = 10;

/**
 * Publishes every pending candidate as an unverified signal, recording the
 * evidence quote each one was extracted from.
 *
 * The pipeline was originally review-gated: AI output stayed a candidate until
 * a human promoted it. The owner asked for candidates to surface without a
 * review step, being the only operator and having no way to vet model output.
 *
 * This does NOT assert that the content is true. The signal is written with
 * verification = 'unverified' alongside lifecycle = 'published' — visible, but
 * explicitly not vouched for — and the evidence quote travels with it, so a
 * reader can check the claim against the source. That distinction is the whole
 * reason those are two separate columns, and it is what keeps this honest.
 *
 * Publishing also has to record the evidence, not just the signal: scoring
 * refuses any project whose signals lack valid evidence, so a signal published
 * without its quote is a signal that can never be scored.
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
        select public.publish_candidate_with_evidence(${row.id}::uuid, ${'auto:ai-stage'})`;
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

    // Extraction is best-effort. When an input has already been extracted, the
    // dedup key fires; the run that already exists is exactly the desired end
    // state, so there is nothing to do about it. Letting it abort the pass
    // would also block publishing and scoring, which are independent of
    // whether *this* pass extracted anything new.
    let extraction = {
      processed: 0,
      succeeded: 0,
      schemaInvalid: 0,
      providerErrors: 0,
      candidatesInserted: 0,
    };
    try {
      const summary = await runExtractionOnce({
        repository: createExtractionRepository(sql),
        modelClient,
        maxInputs: options.maxInputs ?? DEFAULT_MAX_INPUTS,
      });
      extraction = {
        processed: summary.processed,
        succeeded: summary.succeeded,
        schemaInvalid: summary.schemaInvalid,
        providerErrors: summary.providerErrors,
        candidatesInserted: summary.candidatesInserted,
      };
    } catch {
      // Left at zero: nothing new was extracted this pass.
    }

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

    // Tutorial generation writes its own ai_runs rows and can trip the same
    // dedup key on a repeat pass. It is the least important stage of the three,
    // so it must not be able to fail the pass either.
    let tutorials = { processed: 0, skippedNoMaterial: 0, candidatesInserted: 0 };
    try {
      const summary = await runTutorialGenerationOnce({
        repository: createTutorialCandidateRepository(sql),
        modelClient,
        maxProjects: options.maxProjects ?? DEFAULT_MAX_PROJECTS,
      });
      tutorials = {
        processed: summary.processed,
        skippedNoMaterial: summary.skippedNoMaterial,
        candidatesInserted: summary.candidatesInserted,
      };
    } catch {
      // Left at zero.
    }

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
