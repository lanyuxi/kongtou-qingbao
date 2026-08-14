import { describe, expect, it } from 'vitest';

import type { ClaimedCollectionJob } from '@airdrop/contracts';

import type { Clock, ProcessorTimer, QueueLogger } from '../ports.js';
import type { CollectionJobProcessor } from '../process-collection-job.js';
import { createConsumer } from '../run-consumer.js';

const JOB_ID = '10000000-0000-4000-8000-000000000011';
const PROJECT_ID = '10000000-0000-4000-8000-000000000012';
const SOURCE_ID = '10000000-0000-4000-8000-000000000013';
const SCHEDULE_ID = '10000000-0000-4000-8000-000000000014';
const WORKER_ID = 'worker-consumer-1';
const NOW = new Date('2026-08-14T01:00:00.000Z');

describe('queue consumer loop', () => {
  it('claims exactly one job at a time and does not claim again while processing is pending', async () => {
    const fixture = createFixture();
    fixture.repository.script = [[claimedJob()], []];
    const pending = deferred<void>();
    fixture.processor.pending = pending;
    const controller = new AbortController();
    const running = fixture.consumer.run(controller.signal);

    await waitFor(() => fixture.repository.calls.length === 1);
    expect(fixture.repository.calls[0]).toEqual({ workerId: WORKER_ID, now: NOW, limit: 1 });
    expect(fixture.processor.jobs.length).toBe(1);
    await flushMicrotasks();
    expect(fixture.repository.calls.length).toBe(1);

    pending.resolve();
    await waitFor(() => fixture.repository.calls.length === 2);
    controller.abort();
    await running;
  });

  it('claims again immediately after a completion without an idle wait', async () => {
    const fixture = createFixture();
    fixture.repository.script = [[claimedJob()], [claimedJob()]];
    const secondPending = deferred<void>();
    fixture.processor.pending = secondPending;
    fixture.processor.holdFrom = 2;
    const controller = new AbortController();
    const running = fixture.consumer.run(controller.signal);

    await waitFor(() => fixture.repository.calls.length === 2);
    expect(fixture.timer.delays).toEqual([]);

    secondPending.resolve();
    await flushMicrotasks();
    controller.abort();
    await running;
  });

  it('waits the bounded one-second idle wait when no job is claimable', async () => {
    const fixture = createFixture();
    fixture.repository.script = [[]];
    const controller = new AbortController();
    const running = fixture.consumer.run(controller.signal);

    await waitFor(() => fixture.repository.calls.length === 1);
    expect(fixture.timer.delays).toEqual([1_000]);
    fixture.timer.releaseOne();
    await waitFor(() => fixture.repository.calls.length === 2);

    controller.abort();
    await running;
  });

  it('stops the idle wait and exits when the abort signal fires', async () => {
    const fixture = createFixture();
    fixture.repository.script = [[]];
    const controller = new AbortController();
    const running = fixture.consumer.run(controller.signal);

    await waitFor(() => fixture.repository.calls.length === 1);
    controller.abort();
    await running;

    expect(fixture.repository.calls.length).toBe(1);
    expect(fixture.processor.jobs.length).toBe(0);
  });

  it('backs off for a bounded delay after a claim persistence failure and tries again', async () => {
    const fixture = createFixture();
    fixture.repository.script = [new Error('claim unavailable'), [claimedJob()]];
    const controller = new AbortController();
    const running = fixture.consumer.run(controller.signal);

    await waitFor(() => fixture.repository.calls.length === 1);
    expect(fixture.logger.records).toContainEqual({
      event: 'collection_claim_failed',
      code: 'queue_persistence_failed',
    });
    expect(fixture.timer.delays).toEqual([5_000]);

    fixture.timer.releaseOne();
    await waitFor(() => fixture.repository.calls.length === 2);
    expect(fixture.processor.jobs.length).toBe(1);

    controller.abort();
    await running;
  });

  it('keeps consuming after a processor failure', async () => {
    const fixture = createFixture();
    fixture.repository.script = [[claimedJob()], []];
    fixture.processor.error = new Error('processor failed');
    const controller = new AbortController();
    const running = fixture.consumer.run(controller.signal);

    await waitFor(() => fixture.repository.calls.length === 2);
    expect(fixture.logger.records).toContainEqual({
      event: 'collection_job_processing_failed',
      jobId: JOB_ID,
    });

    controller.abort();
    await running;
  });

  it('reports idleness only after the active processing settles', async () => {
    const fixture = createFixture();
    fixture.repository.script = [[claimedJob()]];
    const pending = deferred<void>();
    fixture.processor.pending = pending;
    const controller = new AbortController();
    const running = fixture.consumer.run(controller.signal);

    await waitFor(() => fixture.processor.jobs.length === 1);
    let idle = false;
    void fixture.consumer.waitForIdle().then(() => { idle = true; });
    await flushMicrotasks();
    expect(idle).toBe(false);

    pending.resolve();
    await waitFor(() => idle === true);

    controller.abort();
    await running;
  });
});

class FakeClaimRepository {
  readonly calls: Array<{ workerId: string; now: Date; limit: number }> = [];
  script: Array<readonly ClaimedCollectionJob[] | Error> = [];

  async claim(workerId: string, now: Date, limit: number): Promise<readonly ClaimedCollectionJob[]> {
    this.calls.push({ workerId, now, limit });
    const next = this.script.shift() ?? [];
    if (next instanceof Error) throw next;
    return next;
  }
}

class FakeProcessor implements CollectionJobProcessor {
  readonly jobs: ClaimedCollectionJob[] = [];
  pending: Deferred<void> | null = null;
  holdFrom = 1;
  error: Error | null = null;

  async process(job: ClaimedCollectionJob): Promise<void> {
    this.jobs.push(job);
    if (this.error !== null) throw this.error;
    if (this.jobs.length >= this.holdFrom && this.pending !== null) await this.pending.promise;
  }
}

class FakeTimer implements ProcessorTimer {
  readonly delays: number[] = [];
  private readonly pending: Array<Deferred<void>> = [];

  sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
    this.delays.push(milliseconds);
    const wait = deferred<void>();
    const cancel = (): void => {
      const index = this.pending.indexOf(wait);
      if (index >= 0) this.pending.splice(index, 1);
      wait.resolve();
    };
    signal.addEventListener('abort', cancel, { once: true });
    this.pending.push(wait);
    return wait.promise.finally(() => signal.removeEventListener('abort', cancel));
  }

  releaseOne(): void { this.pending.shift()?.resolve(); }
}

class FakeLogger implements QueueLogger {
  readonly records: Array<Record<string, unknown>> = [];
  info(record: Record<string, unknown>): void { this.records.push(record); }
  error(record: Record<string, unknown>): void { this.records.push(record); }
}

function createFixture() {
  const repository = new FakeClaimRepository();
  const processor = new FakeProcessor();
  const timer = new FakeTimer();
  const logger = new FakeLogger();
  const clock: Clock = { now: () => NOW };
  const consumer = createConsumer({ repository, processor, workerId: WORKER_ID, clock, timer, logger });
  return { repository, processor, timer, logger, consumer };
}

function claimedJob(): ClaimedCollectionJob {
  return {
    jobId: JOB_ID,
    payload: {
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      scheduleId: SCHEDULE_ID,
      scheduleVersion: 1,
      collectionRuleVersion: 'v1',
      trigger: 'scheduled',
      scheduledFor: NOW.toISOString(),
    },
    executionAttempt: 1,
    deliveryCount: 1,
    maxAttempts: 5,
    leaseOwner: WORKER_ID,
    leaseEpoch: 1,
    leaseExpiresAt: new Date(NOW.getTime() + 120_000).toISOString(),
  };
}

interface Deferred<T> { readonly promise: Promise<T>; resolve(value: T): void; }
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20 && !condition(); attempt += 1) await flushMicrotasks();
  expect(condition()).toBe(true);
}
