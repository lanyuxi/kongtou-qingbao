import { pathToFileURL } from 'node:url';

import { createQueueRuntime } from './queue/index.js';
import {
  createAiStageRuntime,
  DEFAULT_EXTRACT_TICK_MS,
  DEFAULT_SCORING_TICK_MS,
  type AiStageRuntimeOptions,
} from './orchestration/create-ai-stage-runtime.js';
import { createWorkerHealth, transitionWorkerHealth, type WorkerHealth } from './health.js';

const DEFAULT_SHUTDOWN_BOUND_MS = 30_000;
const KEEP_ALIVE_INTERVAL_MS = 60_000;

const QUEUE_DATABASE_URL = 'AIRDROP_QUEUE_DATABASE_URL';
const COLLECTION_DATABASE_URL = 'AIRDROP_COLLECTION_DATABASE_URL';
const COLLECTION_USER_AGENT = 'AIRDROP_COLLECTION_USER_AGENT';
const QUEUE_WORKER_ID = 'AIRDROP_QUEUE_WORKER_ID';

const AI_STAGE_DATABASE_URL = 'AIRDROP_AI_STAGE_DATABASE_URL';
const AI_MODEL_API_KEY = 'AI_MODEL_API_KEY';
const AI_MODEL_BASE_URL = 'AI_MODEL_BASE_URL';
const AI_MODEL_ID = 'AI_MODEL_ID';
const AI_EXTRACT_MAX_INPUTS = 'AI_EXTRACT_MAX_INPUTS';
const AI_SCORE_MAX_PROJECTS = 'AI_SCORE_MAX_PROJECTS';
const ORCHESTRATION_EXTRACT_TICK_MS = 'AIRDROP_ORCHESTRATION_EXTRACT_TICK_MS';
const ORCHESTRATION_SCORING_TICK_MS = 'AIRDROP_ORCHESTRATION_SCORING_TICK_MS';

const DEFAULT_MODEL_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL_ID = 'deepseek-chat';

export interface WorkerEnvironment {
  readonly queueDatabaseUrl: string;
  readonly collectionDatabaseUrl: string;
  readonly collectionUserAgent: string;
  readonly workerId: string;
}

export class WorkerConfigurationError extends Error {
  readonly code = 'invalid_queue_runtime_configuration' as const;

  constructor() {
    super('Worker configuration is invalid.');
    this.name = 'WorkerConfigurationError';
  }
}

export interface WorkerRuntimePort {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface RunWorkerPorts {
  readonly emit: (health: WorkerHealth) => void;
  readonly onSignal: (handler: () => void) => void;
}

export interface RunWorkerOptions {
  readonly clock?: () => Date;
  readonly shutdownBoundMs?: number;
}

export function parseWorkerEnvironment(environment: NodeJS.ProcessEnv): WorkerEnvironment {
  const queueDatabaseUrl = environment[QUEUE_DATABASE_URL];
  const collectionDatabaseUrl = environment[COLLECTION_DATABASE_URL];
  const collectionUserAgent = environment[COLLECTION_USER_AGENT];
  const workerId = environment[QUEUE_WORKER_ID];

  if (
    queueDatabaseUrl === undefined || queueDatabaseUrl.length === 0 ||
    collectionDatabaseUrl === undefined || collectionDatabaseUrl.length === 0 ||
    collectionUserAgent === undefined || collectionUserAgent.length === 0 ||
    workerId === undefined || workerId.length === 0
  ) {
    throw new WorkerConfigurationError();
  }

  return { queueDatabaseUrl, collectionDatabaseUrl, collectionUserAgent, workerId };
}

/**
 * AI stage orchestration is opt-in: it starts only when the stage database URL
 * and the model API key are both present. Absent configuration leaves the
 * worker collection-only and is never an error. Malformed optional values
 * (batch sizes, tick intervals) are rejected loudly.
 */
export function parseAiStageOptions(
  environment: NodeJS.ProcessEnv,
): AiStageRuntimeOptions | null {
  const databaseUrl = environment[AI_STAGE_DATABASE_URL];
  const modelApiKey = environment[AI_MODEL_API_KEY];

  if (databaseUrl === undefined || databaseUrl.length === 0) return null;
  if (modelApiKey === undefined || modelApiKey.length === 0) return null;

  return {
    databaseUrl,
    modelApiKey,
    modelBaseUrl: environment[AI_MODEL_BASE_URL] ?? DEFAULT_MODEL_BASE_URL,
    modelId: environment[AI_MODEL_ID] ?? DEFAULT_MODEL_ID,
    maxInputs: parseBoundedInteger(environment[AI_EXTRACT_MAX_INPUTS], 5, 1, 50),
    maxProjects: parseBoundedInteger(environment[AI_SCORE_MAX_PROJECTS], 25, 1, 100),
    extractTickMs: parseBoundedInteger(
      environment[ORCHESTRATION_EXTRACT_TICK_MS],
      DEFAULT_EXTRACT_TICK_MS,
      5_000,
      Number.MAX_SAFE_INTEGER,
    ),
    scoringTickMs: parseBoundedInteger(
      environment[ORCHESTRATION_SCORING_TICK_MS],
      DEFAULT_SCORING_TICK_MS,
      5_000,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.length === 0) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new WorkerConfigurationError();
  }
  return parsed;
}

export async function runWorker(
  runtime: WorkerRuntimePort,
  ports: RunWorkerPorts,
  options: RunWorkerOptions = {},
): Promise<void> {
  const clock = options.clock ?? ((): Date => new Date());
  const shutdownBoundMs = options.shutdownBoundMs ?? DEFAULT_SHUTDOWN_BOUND_MS;

  let health = createWorkerHealth(clock);
  ports.emit(health);

  await runtime.start();
  health = transitionWorkerHealth(health, 'ready', clock);
  ports.emit(health);

  const keepAlive = setInterval(() => undefined, KEEP_ALIVE_INTERVAL_MS);
  try {
    await new Promise<void>((resolve) => {
      let stopped = false;
      const finish = (): void => {
        if (stopped) return;
        stopped = true;
        resolve();
      };
      ports.onSignal((): void => {
        if (health.status !== 'ready') return;
        health = transitionWorkerHealth(health, 'stopping', clock);
        ports.emit(health);
        void boundedStop(runtime, shutdownBoundMs).then(finish);
      });
    });
  } finally {
    clearInterval(keepAlive);
  }
}

async function boundedStop(runtime: WorkerRuntimePort, boundMs: number): Promise<void> {
  await Promise.race([
    runtime.stop(),
    new Promise<void>((resolve) => {
      const deadline = setTimeout(resolve, boundMs);
      deadline.unref?.();
    }),
  ]);
}

const isDirectExecution = (): boolean =>
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution()) {
  void main();
}

async function main(): Promise<void> {
  try {
    const environment = parseWorkerEnvironment(process.env);
    const queueRuntime = createQueueRuntime(environment);
    const aiStageOptions = parseAiStageOptions(process.env);
    const aiStageRuntime = aiStageOptions === null
      ? null
      : createAiStageRuntime(aiStageOptions);

    if (aiStageRuntime === null) {
      process.stderr.write(
        `${JSON.stringify({ event: 'ai_stage_orchestration_disabled', code: 'configuration_absent' })}\n`,
      );
    }

    const runtime: WorkerRuntimePort = {
      async start() {
        await queueRuntime.start();
        await aiStageRuntime?.start();
      },
      async stop() {
        await aiStageRuntime?.stop();
        await queueRuntime.stop();
      },
    };

    await runWorker(runtime, {
      emit: (health) => { process.stdout.write(`${JSON.stringify(health)}\n`); },
      onSignal: (handler) => {
        process.on('SIGTERM', handler);
        process.on('SIGINT', handler);
      },
    });
    process.exitCode = 0;
  } catch {
    process.stderr.write(
      `${JSON.stringify({ event: 'worker_startup_failed', code: 'invalid_queue_runtime_configuration' })}\n`,
    );
    process.exitCode = 1;
  }
}
