import type { ClaimedCollectionJob } from '@airdrop/contracts';
import type { DurableCollectionQueueRepository } from '@airdrop/database/collection-queue-worker';

import type { Clock, ProcessorTimer, QueueLogger } from './ports.js';
import type { CollectionJobProcessor } from './process-collection-job.js';

const CLAIM_LIMIT = 1;
const IDLE_WAIT_MS = 1_000;
const CLAIM_FAILURE_BACKOFF_MS = 5_000;

export interface ConsumerDependencies {
  readonly repository: Pick<DurableCollectionQueueRepository, 'claim'>;
  readonly processor: CollectionJobProcessor;
  readonly workerId: string;
  readonly clock: Clock;
  readonly timer: ProcessorTimer;
  readonly logger: QueueLogger;
}

export function createConsumer(deps: ConsumerDependencies): {
  run(signal: AbortSignal): Promise<void>;
  waitForIdle(): Promise<void>;
} {
  let activeWork: Promise<void> = Promise.resolve();

  return {
    async run(signal: AbortSignal): Promise<void> {
      while (!signal.aborted) {
        let jobs: readonly ClaimedCollectionJob[];
        try {
          jobs = await deps.repository.claim(deps.workerId, deps.clock.now(), CLAIM_LIMIT);
        } catch {
          deps.logger.error({
            event: 'collection_claim_failed',
            code: 'queue_persistence_failed',
          });
          await deps.timer.sleep(CLAIM_FAILURE_BACKOFF_MS, signal);
          continue;
        }

        if (jobs.length === 0) {
          await deps.timer.sleep(IDLE_WAIT_MS, signal);
          continue;
        }

        for (const job of jobs) {
          const work = (async (): Promise<void> => {
            try {
              await deps.processor.process(job, signal);
            } catch {
              deps.logger.error({
                event: 'collection_job_processing_failed',
                jobId: job.jobId,
              });
            }
          })();
          activeWork = work;
          await work;
        }
      }
    },
    waitForIdle(): Promise<void> {
      return activeWork;
    },
  };
}
