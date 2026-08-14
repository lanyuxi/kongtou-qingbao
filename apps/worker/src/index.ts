import { pathToFileURL } from 'node:url';

import { createQueueRuntime } from './queue/index.js';
import { createWorkerHealth, transitionWorkerHealth, type WorkerHealth } from './health.js';

const DEFAULT_SHUTDOWN_BOUND_MS = 30_000;
const KEEP_ALIVE_INTERVAL_MS = 60_000;

const QUEUE_DATABASE_URL = 'AIRDROP_QUEUE_DATABASE_URL';
const COLLECTION_DATABASE_URL = 'AIRDROP_COLLECTION_DATABASE_URL';
const COLLECTION_USER_AGENT = 'AIRDROP_COLLECTION_USER_AGENT';
const QUEUE_WORKER_ID = 'AIRDROP_QUEUE_WORKER_ID';

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
    const runtime = createQueueRuntime(environment);
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
