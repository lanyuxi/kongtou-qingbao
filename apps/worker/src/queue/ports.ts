import type { CollectSourceJob, CollectSourceResult } from '@airdrop/contracts';
import type { DurableCollectionQueueRepository, ReconcileResult } from '@airdrop/database/collection-queue-worker';

export interface Clock {
  now(): Date;
}

export interface Ids {
  generate(): string;
}

export interface SchedulerTimer {
  sleep(milliseconds: number): Promise<void>;
}

export interface ProcessorTimer {
  sleep(milliseconds: number, signal: AbortSignal): Promise<void>;
}

export interface QueueLogger {
  info(record: Record<string, unknown>): void;
  error(record: Record<string, unknown>): void;
}

export interface SourceCollectorPort {
  collect(job: CollectSourceJob): Promise<CollectSourceResult>;
}

export interface SchedulerDependencies {
  readonly repository: Pick<DurableCollectionQueueRepository, 'reconcile'>;
  readonly clock: Clock;
  readonly timer: SchedulerTimer;
  readonly logger: QueueLogger;
}

export interface ProcessorDependencies {
  readonly repository: Pick<
    DurableCollectionQueueRepository,
    'isEligible' | 'renew' | 'succeed' | 'retry' | 'deadLetter' | 'cancel'
  >;
  readonly collector: SourceCollectorPort;
  readonly clock: Clock;
  readonly timer: ProcessorTimer;
  readonly ids: Ids;
  readonly logger: QueueLogger;
}

export type { ReconcileResult };
