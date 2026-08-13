import type { ClaimedCollectionJob, CollectSourceJob, CollectionOutcome } from '@airdrop/contracts';
import { collectorIdempotencyKey, classifyCollectionOutcome, retryDelaySeconds } from '@airdrop/domain';
import type { LeaseFence, QueueFailure } from '@airdrop/database/collection-queue-worker';

import type { ProcessorDependencies } from './ports.js';

const LEASE_RENEWAL_INTERVAL_MS = 40_000;

export interface CollectionJobProcessor {
  process(job: ClaimedCollectionJob, signal: AbortSignal): Promise<void>;
}

export function createCollectionJobProcessor(deps: ProcessorDependencies): CollectionJobProcessor {
  return {
    async process(job, signal): Promise<void> {
      const fence = toFence(job);
      if (!await deps.repository.isEligible(job.payload.projectId, job.payload.sourceId)) {
        await deps.repository.cancel(fence, 'source_ineligible', deps.clock.now());
        deps.logger.info({ event: 'collection_job_canceled', jobId: job.jobId, resultCode: 'source_ineligible' });
        return;
      }

      const lease = renewLeaseWhileCollecting(deps, fence, signal);
      let result;
      try {
        result = await deps.collector.collect(
          toCollectorJob(job, deps.ids.generate(), deps.clock.now()),
        );
      } catch (error) {
        lease.stop();
        await lease.waitForRenewal();
        throw error;
      }
      lease.stop();
      await lease.waitForRenewal();
      if (lease.lost() || signal.aborted) return;
      await settle(deps, fence, job, result.outcome);
    },
  };
}

function toCollectorJob(job: ClaimedCollectionJob, correlationId: string, occurredAt: Date): CollectSourceJob {
  return {
    jobId: job.jobId,
    type: 'collect.source',
    version: 1,
    idempotencyKey: collectorIdempotencyKey(job.jobId, job.executionAttempt),
    correlationId,
    occurredAt: occurredAt.toISOString(),
    payload: { projectId: job.payload.projectId, sourceId: job.payload.sourceId },
  };
}

function toFence(job: ClaimedCollectionJob): LeaseFence {
  return { jobId: job.jobId, workerId: job.leaseOwner, leaseEpoch: job.leaseEpoch };
}

async function settle(
  deps: ProcessorDependencies,
  fence: LeaseFence,
  job: ClaimedCollectionJob,
  resultCode: CollectionOutcome,
): Promise<void> {
  const now = deps.clock.now();
  const failure: QueueFailure = { resultCode, detail: null };
  const classification = classifyCollectionOutcome(resultCode);
  if (classification === 'succeeded') {
    await deps.repository.succeed(fence, resultCode, now);
    deps.logger.info({ event: 'collection_job_succeeded', jobId: job.jobId, executionAttempt: job.executionAttempt, resultCode });
    return;
  }
  if (classification === 'dead_letter' || job.executionAttempt >= job.maxAttempts) {
    await deps.repository.deadLetter(fence, failure, now);
    deps.logger.info({ event: 'collection_job_dead_lettered', jobId: job.jobId, executionAttempt: job.executionAttempt, resultCode });
    return;
  }
  const delaySeconds = retryDelaySeconds({
    jobId: job.jobId,
    executionAttempt: job.executionAttempt,
    maxAttempts: job.maxAttempts,
  });
  await deps.repository.retry(
    fence,
    failure,
    new Date(now.getTime() + delaySeconds * 1_000),
    now,
  );
  deps.logger.info({ event: 'collection_job_retry_scheduled', jobId: job.jobId, executionAttempt: job.executionAttempt, resultCode });
}

function renewLeaseWhileCollecting(
  deps: ProcessorDependencies,
  fence: LeaseFence,
  signal: AbortSignal,
): { stop(): void; lost(): boolean; waitForRenewal(): Promise<void> } {
  let stopped = false;
  let leaseLost = false;
  let activeRenewal: Promise<Date> | null = null;
  void (async (): Promise<void> => {
    while (!stopped && !signal.aborted) {
      await deps.timer.sleep(LEASE_RENEWAL_INTERVAL_MS);
      if (stopped || signal.aborted) return;
      try {
        activeRenewal = deps.repository.renew(fence, deps.clock.now());
        await activeRenewal;
      } catch {
        leaseLost = true;
        deps.logger.error({ event: 'collection_job_lease_lost', code: 'lease_fence_lost' });
        return;
      } finally {
        activeRenewal = null;
      }
    }
  })();
  return {
    stop: () => { stopped = true; },
    lost: () => leaseLost,
    waitForRenewal: async () => { await activeRenewal; },
  };
}
