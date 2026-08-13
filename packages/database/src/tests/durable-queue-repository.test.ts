import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  createDurableCollectionQueueRepositoryFromClient,
  DurableQueuePersistenceError,
  LeaseFenceError,
  type QueueFunctionCall,
  type QueueFunctionClient,
  type QueueFunctionTransaction,
} from '../queue/durable-queue-repository.js';
import type { LeaseFence, QueueFailure } from '../queue/types.js';

const projectId = '50000000-0000-4000-8000-000000000001';
const sourceId = '50000000-0000-4000-8000-000000000002';
const scheduleId = '50000000-0000-4000-8000-000000000003';
const jobId = '50000000-0000-4000-8000-000000000004';
const now = new Date('2026-08-13T04:05:06.789Z');
const availableAt = new Date('2026-08-13T04:10:06.789Z');
const fence: LeaseFence = { jobId, workerId: 'worker-one', leaseEpoch: 7 };
const failure: QueueFailure = { resultCode: 'timeout', detail: 'bounded detail' };

describe('DurableCollectionQueueRepository', () => {
  it('serializes UTC inputs and parses strict reconcile rows', async () => {
    const client = new RecordingClient([[
      {
        created_schedule_count: 1,
        enqueued_count: 2,
        canceled_count: 3,
        lock_acquired: true,
      },
    ]]);
    const repository = createDurableCollectionQueueRepositoryFromClient(client);

    await expect(repository.reconcile(now, 100)).resolves.toEqual({
      createdScheduleCount: 1,
      enqueuedCount: 2,
      canceledCount: 3,
      lockAcquired: true,
    });
    expect(client.calls).toEqual([
      {
        functionName: 'reconcile_due_source_schedules',
        args: { now_at: '2026-08-13T04:05:06.789Z', batch_limit: 100 },
      },
    ]);
    expect(client.roleAssumptions).toBe(1);
    expect(client.transactions).toBe(1);
  });

  it.each([0, 101, 1.5])('rejects reconcile batch limit %s before opening a transaction', async (limit) => {
    const client = new RecordingClient([]);
    const repository = createDurableCollectionQueueRepositoryFromClient(client);

    await expect(repository.reconcile(now, limit)).rejects.toMatchObject({
      code: 'queue_persistence_failed',
    });
    expect(client.transactions).toBe(0);
  });

  it('strictly parses claimed jobs through the shared payload contract', async () => {
    const client = new RecordingClient([[
      {
        job_id: jobId,
        payload: {
          projectId,
          sourceId,
          scheduleId,
          scheduleVersion: 2,
          collectionRuleVersion: 'collection-v1',
          trigger: 'scheduled',
          scheduledFor: '2026-08-13T04:00:00.000Z',
        },
        execution_attempt: 1,
        delivery_count: 1,
        max_attempts: 5,
        lease_owner: 'worker-one',
        lease_epoch: '7',
        lease_expires_at: '2026-08-13T04:07:06.789Z',
      },
    ]]);
    const repository = createDurableCollectionQueueRepositoryFromClient(client);

    await expect(repository.claim('worker-one', now, 1)).resolves.toEqual([
      {
        jobId,
        payload: {
          projectId,
          sourceId,
          scheduleId,
          scheduleVersion: 2,
          collectionRuleVersion: 'collection-v1',
          trigger: 'scheduled',
          scheduledFor: '2026-08-13T04:00:00.000Z',
        },
        executionAttempt: 1,
        deliveryCount: 1,
        maxAttempts: 5,
        leaseOwner: 'worker-one',
        leaseEpoch: 7,
        leaseExpiresAt: '2026-08-13T04:07:06.789Z',
      },
    ]);
  });

  it('maps PostgreSQL bigint strings and timestamp Date values without losing precision', async () => {
    const client = new RecordingClient([[
      {
        job_id: jobId,
        payload: {
          projectId,
          sourceId,
          scheduleId,
          scheduleVersion: 2,
          collectionRuleVersion: 'collection-v1',
          trigger: 'scheduled',
          scheduledFor: '2026-08-13T04:00:00.000Z',
        },
        execution_attempt: 1,
        delivery_count: 1,
        max_attempts: 5,
        lease_owner: 'worker-one',
        lease_epoch: '7',
        lease_expires_at: new Date('2026-08-13T04:07:06.789Z'),
      },
    ], [{
      queued_count: '2',
      retry_wait_count: '3',
      leased_count: '1',
      expired_lease_count: '0',
      dead_letter_count: '4',
      oldest_runnable_age_seconds: 15,
    }]]);
    const repository = createDurableCollectionQueueRepositoryFromClient(client);

    await expect(repository.claim('worker-one', now, 1)).resolves.toMatchObject([
      { leaseEpoch: 7, leaseExpiresAt: '2026-08-13T04:07:06.789Z' },
    ]);
    await expect(repository.health(now)).resolves.toMatchObject({
      queuedCount: 2,
      retryWaitCount: 3,
      leasedCount: 1,
      expiredLeaseCount: 0,
      deadLetterCount: 4,
    });
  });

  it.each(['-1', '1.5', '9007199254740992', '1e2', ' 7'])('rejects invalid PostgreSQL bigint %s', async (leaseEpoch) => {
    const client = new RecordingClient([[
      {
        job_id: jobId,
        payload: {
          projectId,
          sourceId,
          scheduleId,
          scheduleVersion: 2,
          collectionRuleVersion: 'collection-v1',
          trigger: 'scheduled',
          scheduledFor: '2026-08-13T04:00:00.000Z',
        },
        execution_attempt: 1,
        delivery_count: 1,
        max_attempts: 5,
        lease_owner: 'worker-one',
        lease_epoch: leaseEpoch,
        lease_expires_at: new Date('2026-08-13T04:07:06.789Z'),
      },
    ]]);

    await expect(
      createDurableCollectionQueueRepositoryFromClient(client).claim('worker-one', now, 1),
    ).rejects.toMatchObject({ code: 'queue_persistence_failed' });
  });

  it.each([
    { field: 'extra', value: true },
    { field: 'max_attempts', value: 4 },
  ])('fails closed for malformed claim row $field', async ({ field, value }) => {
    const row: Record<string, unknown> = {
      job_id: jobId,
      payload: {
        projectId,
        sourceId,
        scheduleId,
        scheduleVersion: 2,
        collectionRuleVersion: 'collection-v1',
        trigger: 'scheduled',
        scheduledFor: '2026-08-13T04:00:00.000Z',
      },
      execution_attempt: 1,
      delivery_count: 1,
      max_attempts: 5,
      lease_owner: 'worker-one',
      lease_epoch: 7,
      lease_expires_at: '2026-08-13T04:07:06.789Z',
    };
    row[field] = value;
    const repository = createDurableCollectionQueueRepositoryFromClient(new RecordingClient([[row]]));

    await expect(repository.claim('worker-one', now, 1)).rejects.toBeInstanceOf(
      DurableQueuePersistenceError,
    );
  });

  it('forwards lease fences and timestamps to every mutation function', async () => {
    const client = new RecordingClient([
      [{ lease_expires_at: '2026-08-13T04:07:06.789Z' }],
      [{ completed_job_id: jobId }],
      [{ retried_job_id: jobId }],
      [{ dead_lettered_job_id: jobId }],
      [{ canceled_job_id: jobId }],
    ]);
    const repository = createDurableCollectionQueueRepositoryFromClient(client);

    await repository.renew(fence, now);
    await repository.succeed(fence, 'stored_new_content', now);
    await repository.retry(fence, failure, availableAt, now);
    await repository.deadLetter(fence, failure, now);
    await repository.cancel(fence, 'source_ineligible', now);

    expect(client.calls).toEqual([
      {
        functionName: 'renew_collection_job_lease',
        args: fenceArgs(),
      },
      {
        functionName: 'complete_collection_job',
        args: { ...fenceArgs(), result_code: 'stored_new_content' },
      },
      {
        functionName: 'retry_collection_job',
        args: {
          ...fenceArgs(),
          result_code: 'timeout',
          detail: 'bounded detail',
          available_at: '2026-08-13T04:10:06.789Z',
        },
      },
      {
        functionName: 'dead_letter_collection_job',
        args: { ...fenceArgs(), result_code: 'timeout', detail: 'bounded detail' },
      },
      {
        functionName: 'cancel_collection_job',
        args: { ...fenceArgs(), result_code: 'source_ineligible' },
      },
    ]);
    expect(client.transactions).toBe(5);
    expect(client.roleAssumptions).toBe(5);
  });

  it('maps fence SQLSTATE without branching on the human-readable message', async () => {
    const fenceFailure = new RecordingClient(
      [],
      Object.assign(new Error('totally changed wording'), { code: 'AQL01' }),
    );
    const genericPlpgsqlFailure = new RecordingClient(
      [],
      Object.assign(new Error('lease_fence_lost'), { code: 'P0001' }),
    );

    await expect(
      createDurableCollectionQueueRepositoryFromClient(fenceFailure).succeed(
        fence,
        'stored_new_content',
        now,
      ),
    ).rejects.toBeInstanceOf(LeaseFenceError);
    await expect(
      createDurableCollectionQueueRepositoryFromClient(genericPlpgsqlFailure).succeed(
        fence,
        'stored_new_content',
        now,
      ),
    ).rejects.toBeInstanceOf(DurableQueuePersistenceError);
  });

  it('strictly maps queue health and eligibility results', async () => {
    const client = new RecordingClient([[
      {
        queued_count: '2',
        retry_wait_count: '3',
        leased_count: '1',
        expired_lease_count: '0',
        dead_letter_count: '4',
        oldest_runnable_age_seconds: 15,
      },
    ], true]);
    const repository = createDurableCollectionQueueRepositoryFromClient(client);

    await expect(repository.health(now)).resolves.toEqual({
      queuedCount: 2,
      retryWaitCount: 3,
      leasedCount: 1,
      expiredLeaseCount: 0,
      deadLetterCount: 4,
      oldestRunnableAgeSeconds: 15,
    });
    await expect(repository.isEligible(projectId, sourceId)).resolves.toBe(true);
  });

  it('rejects collection queue entry under browser resolution', () => {
    const result = spawnSync(
      process.execPath,
      ['--conditions=browser', '--import=tsx', '--eval', "import('@airdrop/database/collection-queue-worker')"],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '@airdrop/database/collection-queue-worker is unavailable in browser code.',
    );
    expect(result.stderr).not.toMatch(/postgres(?:\.js)?/i);
  });
});

class RecordingClient implements QueueFunctionClient {
  readonly calls: QueueFunctionCall[] = [];
  roleAssumptions = 0;
  transactions = 0;

  constructor(
    private readonly responses: unknown[] = [],
    private readonly error?: Error,
  ) {}

  async transaction<T>(work: (transaction: QueueFunctionTransaction) => Promise<T>): Promise<T> {
    this.transactions += 1;
    this.roleAssumptions += 1;
    if (this.error !== undefined) throw this.error;
    return work({
      invoke: async (call) => {
        this.calls.push(call);
        return this.responses.shift();
      },
    });
  }
}

function fenceArgs() {
  return {
    job_id: jobId,
    worker_id: 'worker-one',
    lease_epoch: 7,
    now_at: '2026-08-13T04:05:06.789Z',
  };
}
