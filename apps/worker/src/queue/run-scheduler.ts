import type { ReconcileResult } from '@airdrop/database/collection-queue-worker';

import type { SchedulerDependencies } from './ports.js';

const RECONCILE_BATCH_LIMIT = 100;
const SCHEDULER_INTERVAL_MS = 30_000;

export function createScheduler(deps: SchedulerDependencies): {
  scanOnce(): Promise<ReconcileResult>;
  run(signal: AbortSignal): Promise<void>;
} {
  const scanOnce = async (): Promise<ReconcileResult> => {
    const startedAt = deps.clock.now();
    try {
      const result = await deps.repository.reconcile(startedAt, RECONCILE_BATCH_LIMIT);
      if (result.lockAcquired) {
        deps.logger.info({
          event: 'collection_schedule_reconciled',
          createdScheduleCount: result.createdScheduleCount,
          enqueuedCount: result.enqueuedCount,
          canceledCount: result.canceledCount,
          durationMs: Math.max(0, deps.clock.now().getTime() - startedAt.getTime()),
        });
      }
      return result;
    } catch (error) {
      void error;
      deps.logger.error({
        event: 'collection_schedule_reconcile_failed',
        code: 'queue_persistence_failed',
      });
      throw error;
    }
  };

  return {
    scanOnce,
    async run(signal: AbortSignal): Promise<void> {
      while (!signal.aborted) {
        await scanOnce();
        if (signal.aborted) return;
        await deps.timer.sleep(SCHEDULER_INTERVAL_MS);
      }
    },
  };
}
