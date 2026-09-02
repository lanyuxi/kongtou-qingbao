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
import { createNodeProcessorTimer, createStderrQueueLogger } from '../queue/create-queue-runtime.js';
import type { Clock } from '../queue/ports.js';
import { createStageLoop } from './ai-stage-orchestrator.js';
import type { StageRunner } from './ports.js';

/** Documented shutdown bound for waiting on an in-flight stage tick. */
const STAGE_SHUTDOWN_BOUND_MS = 30_000;

export const DEFAULT_EXTRACT_TICK_MS = 60_000;
export const DEFAULT_SCORING_TICK_MS = 300_000;
export const DEFAULT_TUTORIAL_TICK_MS = 600_000;

export interface AiStageRuntimeOptions {
  readonly databaseUrl: string;
  readonly modelApiKey: string;
  readonly modelBaseUrl: string;
  readonly modelId: string;
  readonly maxInputs: number;
  readonly maxProjects: number;
  readonly extractTickMs: number;
  readonly scoringTickMs: number;
  readonly tutorialTickMs: number;
}

export class AiStageRuntimeConfigurationError extends Error {
  readonly code = 'invalid_ai_stage_runtime_configuration' as const;

  constructor() {
    super('AI stage runtime configuration is invalid.');
    this.name = 'AiStageRuntimeConfigurationError';
  }
}

export function createAiStageRuntime(options: AiStageRuntimeOptions): {
  start(): Promise<void>;
  stop(): Promise<void>;
} {
  validateOptions(options);

  const sql = postgres(options.databaseUrl, {
    max: 2,
    idle_timeout: 20,
    connect_timeout: 5,
  });
  const extractionRepository = createExtractionRepository(sql);
  const scoringRepository = createScoringRepository(sql);
  const tutorialRepository = createTutorialCandidateRepository(sql);
  const modelClient = createOpenAiCompatibleModelClient({
    baseUrl: options.modelBaseUrl,
    apiKey: options.modelApiKey,
    model: options.modelId,
  });

  const extractionRunner: StageRunner = {
    async run() {
      const summary = await runExtractionOnce({
        repository: extractionRepository,
        modelClient,
        maxInputs: options.maxInputs,
      });
      return {
        processed: summary.processed,
        succeeded: summary.succeeded,
        candidatesInserted: summary.candidatesInserted,
      };
    },
  };
  const scoringRunner: StageRunner = {
    async run() {
      const summary = await runScoringOnce({
        repository: scoringRepository,
        maxProjects: options.maxProjects,
      });
      return {
        projectsScored: summary.projectsScored,
        projectsSkipped: summary.projectsSkipped,
        duplicatesSkipped: summary.duplicatesSkipped,
      };
    },
  };

  const tutorialRunner: StageRunner = {
    async run() {
      const summary = await runTutorialGenerationOnce({
        repository: tutorialRepository,
        modelClient,
        maxProjects: options.maxProjects,
      });
      return {
        processed: summary.processed,
        succeeded: summary.succeeded,
        candidatesInserted: summary.candidatesInserted,
        droppedUnallowlisted: summary.droppedUnallowlisted,
      };
    },
  };

  const controller = new AbortController();
  const clock: Clock = { now: () => new Date() };
  const timer = createNodeProcessorTimer();
  const logger = createStderrQueueLogger();

  const extractionLoop = createStageLoop({
    stage: 'extraction',
    runner: extractionRunner,
    intervalMs: options.extractTickMs,
    clock,
    timer,
    logger,
  });
  const scoringLoop = createStageLoop({
    stage: 'scoring',
    runner: scoringRunner,
    intervalMs: options.scoringTickMs,
    clock,
    timer,
    logger,
  });
  const tutorialLoop = createStageLoop({
    stage: 'tutorial_generation',
    runner: tutorialRunner,
    intervalMs: options.tutorialTickMs,
    clock,
    timer,
    logger,
  });

  let extractionDone = Promise.resolve();
  let scoringDone = Promise.resolve();
  let tutorialDone = Promise.resolve();
  let stopPromise: Promise<void> | null = null;

  return {
    async start(): Promise<void> {
      extractionDone = extractionLoop.run(controller.signal).catch(() => undefined);
      scoringDone = scoringLoop.run(controller.signal).catch(() => undefined);
      tutorialDone = tutorialLoop.run(controller.signal).catch(() => undefined);
    },
    stop(): Promise<void> {
      stopPromise ??= (async (): Promise<void> => {
        controller.abort();
        await Promise.race([
          Promise.all([extractionDone, scoringDone, tutorialDone]),
          new Promise<void>((resolve) => {
            const deadline = setTimeout(resolve, STAGE_SHUTDOWN_BOUND_MS);
            deadline.unref?.();
          }),
        ]);
        await sql.end({ timeout: 5 });
      })();
      return stopPromise;
    },
  };
}

function validateOptions(options: AiStageRuntimeOptions): void {
  if (!isPostgresUrl(options.databaseUrl)) {
    throw new AiStageRuntimeConfigurationError();
  }
  if (!isAcceptableToken(options.modelApiKey, 500)) {
    throw new AiStageRuntimeConfigurationError();
  }
  if (!isHttpUrl(options.modelBaseUrl)) {
    throw new AiStageRuntimeConfigurationError();
  }
  if (!isAcceptableToken(options.modelId, 120)) {
    throw new AiStageRuntimeConfigurationError();
  }
  if (!Number.isInteger(options.maxInputs) || options.maxInputs < 1 || options.maxInputs > 50) {
    throw new AiStageRuntimeConfigurationError();
  }
  if (!Number.isInteger(options.maxProjects) || options.maxProjects < 1 || options.maxProjects > 100) {
    throw new AiStageRuntimeConfigurationError();
  }
  if (!Number.isInteger(options.extractTickMs) || options.extractTickMs < 5_000) {
    throw new AiStageRuntimeConfigurationError();
  }
  if (!Number.isInteger(options.scoringTickMs) || options.scoringTickMs < 5_000) {
    throw new AiStageRuntimeConfigurationError();
  }
  if (!Number.isInteger(options.tutorialTickMs) || options.tutorialTickMs < 5_000) {
    throw new AiStageRuntimeConfigurationError();
  }
}

function isPostgresUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:') &&
    parsed.hostname.length > 0
  );
}

function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
}

function isAcceptableToken(value: string, maxLength: number): boolean {
  return (
    value.trim() === value &&
    value.length >= 1 &&
    value.length <= maxLength &&
    /^[\x20-\x7e]+$/.test(value)
  );
}
