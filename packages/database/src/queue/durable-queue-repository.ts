import {
  claimedCollectionJobSchema,
  queueHealthSnapshotSchema,
  queueResultCodeSchema,
} from '@airdrop/contracts';
import postgres, { type Sql, type TransactionSql } from 'postgres';

import type {
  DurableCollectionQueueRepository,
  LeaseFence,
  QueueFailure,
} from './types.js';

type QueueFunctionName =
  | 'reconcile_due_source_schedules'
  | 'claim_collection_jobs'
  | 'renew_collection_job_lease'
  | 'complete_collection_job'
  | 'retry_collection_job'
  | 'dead_letter_collection_job'
  | 'cancel_collection_job'
  | 'collection_queue_health'
  | 'is_source_collection_eligible';

export interface QueueFunctionCall {
  readonly functionName: QueueFunctionName;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface QueueFunctionTransaction {
  invoke(call: QueueFunctionCall): Promise<unknown>;
}

export interface QueueFunctionClient {
  transaction<T>(work: (transaction: QueueFunctionTransaction) => Promise<T>): Promise<T>;
}

export class DurableQueuePersistenceError extends Error {
  readonly code = 'queue_persistence_failed' as const;

  constructor() {
    super('queue_persistence_failed');
    this.name = 'DurableQueuePersistenceError';
  }
}

export class LeaseFenceError extends Error {
  readonly code = 'lease_fence_lost' as const;

  constructor() {
    super('lease_fence_lost');
    this.name = 'LeaseFenceError';
  }
}

type ReconcileRow = {
  created_schedule_count: number;
  enqueued_count: number;
  canceled_count: number;
  lock_acquired: boolean;
};

type ClaimRow = {
  job_id: string;
  payload: unknown;
  execution_attempt: number;
  delivery_count: number;
  max_attempts: 5;
  lease_owner: string;
  lease_epoch: number;
  lease_expires_at: string;
};

type HealthRow = {
  queued_count: number;
  retry_wait_count: number;
  leased_count: number;
  expired_lease_count: number;
  dead_letter_count: number;
  oldest_runnable_age_seconds: number | null;
};

export function createDurableCollectionQueueRepository(
  databaseUrl: string,
): DurableCollectionQueueRepository & { close(): Promise<void> } {
  const sql = postgres(databaseUrl, {
    max: 2,
    idle_timeout: 20,
    connect_timeout: 5,
  });
  const repository = createDurableCollectionQueueRepositoryFromClient(
    createPostgresQueueFunctionClient(sql),
  );
  return Object.assign(repository, { close: async () => sql.end() });
}

export function createDurableCollectionQueueRepositoryFromClient(
  client: QueueFunctionClient,
): DurableCollectionQueueRepository {
  const run = async <T>(
    work: (transaction: QueueFunctionTransaction) => Promise<T>,
    options: { fenceOperation?: boolean } = {},
  ): Promise<T> => {
    try {
      return await client.transaction(work);
    } catch (error) {
      if (options.fenceOperation === true && sqlState(error) === 'AQL01') {
        throw new LeaseFenceError();
      }
      throw new DurableQueuePersistenceError();
    }
  };

  const fenced = async <T>(
    buildCall: () => QueueFunctionCall,
    parse: (value: unknown) => T,
  ): Promise<T> => run(async (transaction) => {
    const response = await transaction.invoke(buildCall());
    return oneRow(parse, response);
  }, { fenceOperation: true });

  return {
    reconcile: async (now, batchLimit) => {
      const parsed = validateInput(() => ({
        serializedNow: serializeDate(now),
        parsedLimit: parseBatchLimit(batchLimit),
      }));
      return run(async (transaction) => {
        const response = await transaction.invoke({
          functionName: 'reconcile_due_source_schedules',
          args: { now_at: parsed.serializedNow, batch_limit: parsed.parsedLimit },
        });
        const row = oneRow(parseReconcileRow, response);
        return {
          createdScheduleCount: row.created_schedule_count,
          enqueuedCount: row.enqueued_count,
          canceledCount: row.canceled_count,
          lockAcquired: row.lock_acquired,
        };
      });
    },
    claim: async (workerId, now, limit) => {
      return run(async (transaction) => {
        const parsedWorkerId = parseWorkerId(workerId);
        const serializedNow = serializeDate(now);
        const parsedLimit = parseBatchLimit(limit);
        const response = await transaction.invoke({
          functionName: 'claim_collection_jobs',
          args: { worker_id: parsedWorkerId, now_at: serializedNow, batch_limit: parsedLimit },
        });
        const rows = parseRows(response).map(parseClaimRow);
        return rows.map((row) => claimedCollectionJobSchema.parse({
          jobId: row.job_id,
          payload: row.payload,
          executionAttempt: row.execution_attempt,
          deliveryCount: row.delivery_count,
          maxAttempts: row.max_attempts,
          leaseOwner: row.lease_owner,
          leaseEpoch: row.lease_epoch,
          leaseExpiresAt: row.lease_expires_at,
        }));
      });
    },
    renew: async (fence, now) => {
      const row = await fenced(
        () => functionCall('renew_collection_job_lease', fence, now),
        (value) => parseUuidOrTimestampRow(value, 'lease_expires_at', parseTimestamp),
      );
      return new Date(row.lease_expires_at);
    },
    succeed: async (fence, resultCode, now) => {
      const row = await fenced(
        () => functionCall('complete_collection_job', fence, now, {
          result_code: queueResultCodeSchema.parse(resultCode),
        }),
        (value) => parseUuidOrTimestampRow(value, 'completed_job_id', parseUuid),
      );
      assertReturnedJob(row.completed_job_id, fence.jobId);
    },
    retry: async (fence, result, availableAt, now) => {
      const row = await fenced(
        () => {
          const parsed = parseFailure(result);
          return functionCall('retry_collection_job', fence, now, {
            result_code: parsed.resultCode,
            detail: parsed.detail,
            available_at: serializeDate(availableAt),
          });
        },
        (value) => parseUuidOrTimestampRow(value, 'retried_job_id', parseUuid),
      );
      assertReturnedJob(row.retried_job_id, fence.jobId);
    },
    deadLetter: async (fence, result, now) => {
      const row = await fenced(
        () => {
          const parsed = parseFailure(result);
          return functionCall('dead_letter_collection_job', fence, now, {
            result_code: parsed.resultCode,
            detail: parsed.detail,
          });
        },
        (value) => parseUuidOrTimestampRow(value, 'dead_lettered_job_id', parseUuid),
      );
      assertReturnedJob(row.dead_lettered_job_id, fence.jobId);
    },
    cancel: async (fence, resultCode, now) => {
      const row = await fenced(
        () => functionCall('cancel_collection_job', fence, now, { result_code: resultCode }),
        (value) => parseUuidOrTimestampRow(value, 'canceled_job_id', parseUuid),
      );
      assertReturnedJob(row.canceled_job_id, fence.jobId);
    },
    health: async (now) => run(async (transaction) => {
      const response = await transaction.invoke({
        functionName: 'collection_queue_health',
        args: { now_at: serializeDate(now) },
      });
      const row = oneRow(parseHealthRow, response);
      return queueHealthSnapshotSchema.parse({
        queuedCount: row.queued_count,
        retryWaitCount: row.retry_wait_count,
        leasedCount: row.leased_count,
        expiredLeaseCount: row.expired_lease_count,
        deadLetterCount: row.dead_letter_count,
        oldestRunnableAgeSeconds: row.oldest_runnable_age_seconds,
      });
    }),
    isEligible: async (projectId, sourceId) => {
      return run(async (transaction) => {
        const parsedProjectId = parseUuid(projectId);
        const parsedSourceId = parseUuid(sourceId);
        const response = await transaction.invoke({
          functionName: 'is_source_collection_eligible',
          args: { project_id: parsedProjectId, source_id: parsedSourceId },
        });
        if (typeof response !== 'boolean') throw new Error('invalid_boolean');
        return response;
      });
    },
  };
}

export function createPostgresQueueFunctionClient(sql: Sql): QueueFunctionClient {
  return {
    transaction: async <T>(work: (transaction: QueueFunctionTransaction) => Promise<T>) => {
      const result = await sql.begin(async (transactionSql) => {
        await transactionSql`set local role collection_queue_worker`;
        return [await work(createPostgresTransaction(transactionSql))] as const;
      });
      return result[0];
    },
  };
}

function createPostgresTransaction(sql: TransactionSql): QueueFunctionTransaction {
  return {
    invoke: async ({ functionName, args }) => {
      switch (functionName) {
        case 'reconcile_due_source_schedules':
          return sql`select * from public.reconcile_due_source_schedules(${args.now_at as string}::timestamptz, ${args.batch_limit as number}::integer)`;
        case 'claim_collection_jobs':
          return sql`select * from public.claim_collection_jobs(${args.worker_id as string}::text, ${args.now_at as string}::timestamptz, ${args.batch_limit as number}::integer)`;
        case 'renew_collection_job_lease':
          return sql`select * from public.renew_collection_job_lease(${args.job_id as string}::uuid, ${args.worker_id as string}::text, ${args.lease_epoch as number}::bigint, ${args.now_at as string}::timestamptz)`;
        case 'complete_collection_job':
          return sql`select * from public.complete_collection_job(${args.job_id as string}::uuid, ${args.worker_id as string}::text, ${args.lease_epoch as number}::bigint, ${args.result_code as string}::text, ${args.now_at as string}::timestamptz)`;
        case 'retry_collection_job':
          return sql`select * from public.retry_collection_job(${args.job_id as string}::uuid, ${args.worker_id as string}::text, ${args.lease_epoch as number}::bigint, ${args.result_code as string}::text, ${args.detail as string | null}::text, ${args.available_at as string}::timestamptz, ${args.now_at as string}::timestamptz)`;
        case 'dead_letter_collection_job':
          return sql`select * from public.dead_letter_collection_job(${args.job_id as string}::uuid, ${args.worker_id as string}::text, ${args.lease_epoch as number}::bigint, ${args.result_code as string}::text, ${args.detail as string | null}::text, ${args.now_at as string}::timestamptz)`;
        case 'cancel_collection_job':
          return sql`select * from public.cancel_collection_job(${args.job_id as string}::uuid, ${args.worker_id as string}::text, ${args.lease_epoch as number}::bigint, ${args.result_code as string}::text, ${args.now_at as string}::timestamptz)`;
        case 'collection_queue_health':
          return sql`select * from public.collection_queue_health(${args.now_at as string}::timestamptz)`;
        case 'is_source_collection_eligible': {
          const rows = await sql<readonly { eligible: boolean }[]>`select public.is_source_collection_eligible(${args.project_id as string}::uuid, ${args.source_id as string}::uuid) as eligible`;
          return rows[0]?.eligible;
        }
      }
    },
  };
}

function functionCall(
  functionName: QueueFunctionName,
  fence: LeaseFence,
  now: Date,
  extra: Readonly<Record<string, unknown>> = {},
): QueueFunctionCall {
  return {
    functionName,
    args: {
      job_id: parseUuid(fence.jobId),
      worker_id: parseWorkerId(fence.workerId),
      lease_epoch: parsePositiveInteger(fence.leaseEpoch),
      now_at: serializeDate(now),
      ...extra,
    },
  };
}

function parseFailure(result: QueueFailure): QueueFailure {
  if (result.detail !== null && (typeof result.detail !== 'string' || result.detail.length > 500)) {
    throw new Error('invalid_failure_detail');
  }
  return {
    resultCode: queueResultCodeSchema.parse(result.resultCode),
    detail: result.detail,
  };
}

function oneRow<T>(parse: (value: unknown) => T, response: unknown): T {
  const rows = parseRows(response);
  if (rows.length !== 1) throw new Error('expected_one_row');
  return parse(rows[0]);
}

function serializeDate(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error('invalid_date');
  return value.toISOString();
}

function assertReturnedJob(returnedJobId: string, expectedJobId: string): void {
  if (returnedJobId !== expectedJobId) throw new Error('queue_job_identity_mismatch');
}

function sqlState(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function validateInput<T>(validate: () => T): T {
  try {
    return validate();
  } catch {
    throw new DurableQueuePersistenceError();
  }
}

function parseRows(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('invalid_rows');
  return value;
}

function parseReconcileRow(value: unknown): ReconcileRow {
  const row = strictRecord(value, [
    'created_schedule_count', 'enqueued_count', 'canceled_count', 'lock_acquired',
  ]);
  return {
    created_schedule_count: parseNonnegativeInteger(row.created_schedule_count),
    enqueued_count: parseNonnegativeInteger(row.enqueued_count),
    canceled_count: parseNonnegativeInteger(row.canceled_count),
    lock_acquired: parseBoolean(row.lock_acquired),
  };
}

function parseClaimRow(value: unknown): ClaimRow {
  const row = strictRecord(value, [
    'job_id', 'payload', 'execution_attempt', 'delivery_count', 'max_attempts',
    'lease_owner', 'lease_epoch', 'lease_expires_at',
  ]);
  const executionAttempt = parsePositiveInteger(row.execution_attempt);
  const maxAttempts = parsePositiveInteger(row.max_attempts);
  if (executionAttempt > 5 || maxAttempts !== 5) throw new Error('invalid_attempt_count');
  return {
    job_id: parseUuid(row.job_id),
    payload: row.payload,
    execution_attempt: executionAttempt,
    delivery_count: parsePositiveInteger(row.delivery_count),
    max_attempts: 5,
    lease_owner: parseWorkerId(row.lease_owner),
    lease_epoch: parsePositivePgBigint(row.lease_epoch),
    lease_expires_at: parseTimestamp(row.lease_expires_at),
  };
}

function parseHealthRow(value: unknown): HealthRow {
  const row = strictRecord(value, [
    'queued_count', 'retry_wait_count', 'leased_count', 'expired_lease_count',
    'dead_letter_count', 'oldest_runnable_age_seconds',
  ]);
  return {
    queued_count: parseNonnegativePgBigint(row.queued_count),
    retry_wait_count: parseNonnegativePgBigint(row.retry_wait_count),
    leased_count: parseNonnegativePgBigint(row.leased_count),
    expired_lease_count: parseNonnegativePgBigint(row.expired_lease_count),
    dead_letter_count: parseNonnegativePgBigint(row.dead_letter_count),
    oldest_runnable_age_seconds: row.oldest_runnable_age_seconds === null
      ? null
      : parseNonnegativeInteger(row.oldest_runnable_age_seconds),
  };
}

function parseUuidOrTimestampRow<Key extends string>(
  value: unknown,
  key: Key,
  parse: (value: unknown) => string,
): Record<Key, string> {
  const row = strictRecord(value, [key]);
  return { [key]: parse(row[key]) } as Record<Key, string>;
}

function strictRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_row');
  }
  const row = value as Record<string, unknown>;
  const actualKeys = Object.keys(row).sort();
  const expectedKeys = [...keys].sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('invalid_row_keys');
  }
  return row;
}

function parseBatchLimit(value: unknown): number {
  const parsed = parsePositiveInteger(value);
  if (parsed > 100) throw new Error('invalid_batch_limit');
  return parsed;
}

function parsePositiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('invalid_positive_integer');
  }
  return value;
}

function parseNonnegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('invalid_nonnegative_integer');
  }
  return value;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('invalid_boolean');
  return value;
}

function parseWorkerId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 255 || value !== value.trim()) {
    throw new Error('invalid_worker_id');
  }
  return value;
}

function parseUuid(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('invalid_uuid');
  }
  return value;
}

function parseTimestamp(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('invalid_timestamp');
    return value.toISOString();
  }
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error('invalid_timestamp');
  }
  return value;
}

function parsePositivePgBigint(value: unknown): number {
  const parsed = parsePgBigint(value);
  if (parsed <= 0) throw new Error('invalid_positive_bigint');
  return parsed;
}

function parseNonnegativePgBigint(value: unknown): number {
  const parsed = parsePgBigint(value);
  if (parsed < 0) throw new Error('invalid_nonnegative_bigint');
  return parsed;
}

function parsePgBigint(value: unknown): number {
  if (typeof value !== 'string' || !/^-?(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error('invalid_bigint');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('unsafe_bigint');
  return parsed;
}
