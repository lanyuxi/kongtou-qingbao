import { randomUUID } from 'node:crypto';

import {
  createDurableCollectionQueueRepository,
  type ReconcileResult,
} from '@airdrop/database/collection-queue-worker';

import { createSourceCollector } from '../collection/create-collector.js';
import type { Clock, ProcessorTimer, QueueLogger, SchedulerTimer } from './ports.js';
import { createCollectionJobProcessor } from './process-collection-job.js';
import { createScheduler } from './run-scheduler.js';

/**
 * One bounded pass of the collection pipeline.
 *
 * The long-running runtime loops three things forever: the scheduler reconciles
 * due schedules, the consumer claims jobs, and the processor collects each one.
 * Environments that cannot host a daemon (Vercel Cron) instead run each of
 * those exactly once, with a hard cap on how many jobs to take, so the call
 * always finishes well inside a serverless time limit.
 *
 * Safe to invoke repeatedly: `reconcile` only enqueues jobs that are due, and
 * each job is claimed under a lease so two concurrent passes cannot collect the
 * same one twice.
 */
export interface CollectionOnceOptions {
  readonly queueDatabaseUrl: string;
  readonly collectionDatabaseUrl: string;
  readonly collectionUserAgent: string;
  readonly workerId: string;
  readonly maxJobs?: number;
  /**
   * Stop *starting* new jobs once this many milliseconds have elapsed. A job
   * already in flight is allowed to finish, because abandoning it mid-lease
   * would just hand the same work to the next pass.
   */
  readonly budgetMs?: number;
}

export interface CollectionOnceResult {
  /** False when another pass held the reconcile lock; nothing was scanned. */
  readonly lockAcquired: boolean;
  readonly enqueuedCount: number;
  readonly canceledCount: number;
  readonly processedCount: number;
  /** One entry per job that failed; the pass continues with the rest. */
  readonly failures: readonly string[];
}

// Deliberately small: a serverless invocation has a hard wall-clock ceiling,
// and one job (fetch a feed, fetch each new article, write the rows) is
// already seconds of work. The next scheduled pass picks up the rest.
const DEFAULT_MAX_JOBS = 2;
const DEFAULT_BUDGET_MS = 40_000;

export async function runCollectionOnce(
  options: CollectionOnceOptions,
): Promise<CollectionOnceResult> {
  const repository = createDurableCollectionQueueRepository(options.queueDatabaseUrl);
  const collector = createSourceCollector({
    databaseUrl: options.collectionDatabaseUrl,
    userAgent: options.collectionUserAgent,
  });

  const clock: Clock = { now: () => new Date() };
  const logger: QueueLogger = {
    info: (record) => console.log(JSON.stringify({ level: 'info', ...record })),
    error: (record) => console.error(JSON.stringify({ level: 'error', ...record })),
  };

  const controller = new AbortController();
  const processorTimer: ProcessorTimer = {
    sleep: (milliseconds, signal) =>
      new Promise<void>((resolve, reject) => {
        const handle = setTimeout(resolve, milliseconds);
        const onAbort = (): void => {
          clearTimeout(handle);
          reject(new Error('Sleep aborted.'));
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }),
  };
  // The scheduler's timer contract has no signal; it always runs before the
  // pass takes any job, so there is nothing to interrupt yet.
  const schedulerTimer: SchedulerTimer = {
    sleep: (milliseconds) => processorTimer.sleep(milliseconds, controller.signal),
  };

  const failures: string[] = [];
  let processedCount = 0;
  // Left undefined rather than null-initialised: it is assigned on the first
  // statement of the try block, and the reads below use optional chaining.
  let reconcile: ReconcileResult | undefined;

  try {
    const scheduler = createScheduler({
      repository,
      clock,
      timer: schedulerTimer,
      logger,
    });
    reconcile = await scheduler.scanOnce();

    const processor = createCollectionJobProcessor({
      repository,
      collector,
      clock,
      timer: processorTimer,
      ids: { generate: () => randomUUID() },
      logger,
    });

    const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS;
    const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
    const startedAt = Date.now();

    for (let index = 0; index < maxJobs; index += 1) {
      if (Date.now() - startedAt >= budgetMs) break;
      const jobs = await repository.claim(options.workerId, clock.now(), 1);
      if (jobs.length === 0) break;
      for (const job of jobs) {
        try {
          await processor.process(job, controller.signal);
          processedCount += 1;
        } catch (error) {
          failures.push(
            `${job.jobId}: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      }
    }
  } finally {
    controller.abort();
    await repository.close();
  }

  return {
    lockAcquired: reconcile?.lockAcquired ?? false,
    enqueuedCount: reconcile?.enqueuedCount ?? 0,
    canceledCount: reconcile?.canceledCount ?? 0,
    processedCount,
    failures,
  };
}
