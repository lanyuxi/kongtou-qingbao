import { randomUUID } from 'node:crypto';

import { createDurableCollectionQueueRepository } from '@airdrop/database/collection-queue-worker';

import { createSourceCollector } from '../collection/create-collector.js';
import type { Clock, ProcessorTimer, QueueLogger } from './ports.js';
import { createCollectionJobProcessor } from './process-collection-job.js';
import { createConsumer } from './run-consumer.js';
import { createScheduler } from './run-scheduler.js';

/** Documented shutdown bound for waiting on an in-flight collection processor. */
const PROCESSOR_SHUTDOWN_BOUND_MS = 30_000;

export interface QueueRuntimeOptions {
  readonly queueDatabaseUrl: string;
  readonly collectionDatabaseUrl: string;
  readonly collectionUserAgent: string;
  readonly workerId: string;
}

export class QueueRuntimeConfigurationError extends Error {
  readonly code = 'invalid_queue_runtime_configuration' as const;

  constructor() {
    super('Queue runtime configuration is invalid.');
    this.name = 'QueueRuntimeConfigurationError';
  }
}

export function createQueueRuntime(options: QueueRuntimeOptions): {
  start(): Promise<void>;
  stop(): Promise<void>;
} {
  validateOptions(options);

  const queueRepository = createDurableCollectionQueueRepository(options.queueDatabaseUrl);
  const collector = createSourceCollector({
    databaseUrl: options.collectionDatabaseUrl,
    userAgent: options.collectionUserAgent,
  });

  const controller = new AbortController();
  const clock: Clock = { now: () => new Date() };
  const timer = createNodeProcessorTimer();
  const logger = createStderrQueueLogger();

  const scheduler = createScheduler({
    repository: queueRepository,
    clock,
    timer: { sleep: (milliseconds: number) => timer.sleep(milliseconds, controller.signal) },
    logger,
  });
  const processor = createCollectionJobProcessor({
    repository: queueRepository,
    collector,
    clock,
    timer,
    ids: { generate: () => randomUUID() },
    logger,
  });
  const consumer = createConsumer({
    repository: queueRepository,
    processor,
    workerId: options.workerId,
    clock,
    timer,
    logger,
  });

  let stopPromise: Promise<void> | null = null;

  return {
    async start(): Promise<void> {
      await scheduler.scanOnce();
      void scheduler.run(controller.signal).catch(() => undefined);
      void consumer.run(controller.signal).catch(() => undefined);
    },
    stop(): Promise<void> {
      stopPromise ??= (async (): Promise<void> => {
        controller.abort();
        await Promise.race([
          consumer.waitForIdle(),
          timer.sleep(PROCESSOR_SHUTDOWN_BOUND_MS, new AbortController().signal),
        ]);
        await collector.close();
        await queueRepository.close();
      })();
      return stopPromise;
    },
  };
}

function validateOptions(options: QueueRuntimeOptions): void {
  if (!isPostgresUrl(options.queueDatabaseUrl) || !isPostgresUrl(options.collectionDatabaseUrl)) {
    throw new QueueRuntimeConfigurationError();
  }
  if (!isAcceptableToken(options.collectionUserAgent, 255)) {
    throw new QueueRuntimeConfigurationError();
  }
  if (!isAcceptableToken(options.workerId, 64)) {
    throw new QueueRuntimeConfigurationError();
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

function isAcceptableToken(value: string, maxLength: number): boolean {
  return (
    value.trim() === value &&
    value.length >= 1 &&
    value.length <= maxLength &&
    /^[\x20-\x7e]+$/.test(value)
  );
}

export function createNodeProcessorTimer(): ProcessorTimer {
  return {
    sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
      return new Promise((resolve) => {
        const handle = setTimeout(() => resolve(), milliseconds);
        handle.unref?.();
        const cancel = (): void => {
          clearTimeout(handle);
          resolve();
        };
        if (signal.aborted) {
          cancel();
          return;
        }
        signal.addEventListener('abort', cancel, { once: true });
      });
    },
  };
}

export function createStderrQueueLogger(): QueueLogger {
  const write = (record: Record<string, unknown>): void => {
    process.stderr.write(`${JSON.stringify(record)}\n`);
  };
  return { info: write, error: write };
}
