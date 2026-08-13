import type {
  ClaimedCollectionJob,
  QueueHealthSnapshot,
  QueueResultCode,
} from '@airdrop/contracts';

export interface ReconcileResult {
  readonly createdScheduleCount: number;
  readonly enqueuedCount: number;
  readonly canceledCount: number;
  readonly lockAcquired: boolean;
}

export interface LeaseFence {
  readonly jobId: string;
  readonly workerId: string;
  readonly leaseEpoch: number;
}

export interface QueueFailure {
  readonly resultCode: QueueResultCode;
  readonly detail: string | null;
}

export interface DurableCollectionQueueRepository {
  reconcile(now: Date, batchLimit: number): Promise<ReconcileResult>;
  claim(workerId: string, now: Date, limit: number): Promise<readonly ClaimedCollectionJob[]>;
  renew(fence: LeaseFence, now: Date): Promise<Date>;
  succeed(fence: LeaseFence, resultCode: QueueResultCode, now: Date): Promise<void>;
  retry(
    fence: LeaseFence,
    result: QueueFailure,
    availableAt: Date,
    now: Date,
  ): Promise<void>;
  deadLetter(fence: LeaseFence, result: QueueFailure, now: Date): Promise<void>;
  cancel(
    fence: LeaseFence,
    resultCode: 'source_ineligible',
    now: Date,
  ): Promise<void>;
  health(now: Date): Promise<QueueHealthSnapshot>;
  isEligible(projectId: string, sourceId: string): Promise<boolean>;
}
