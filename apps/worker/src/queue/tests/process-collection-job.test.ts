import { describe, expect, it } from 'vitest';

import type { ClaimedCollectionJob, CollectSourceJob, CollectSourceResult } from '@airdrop/contracts';
import type { DurableCollectionQueueRepository, LeaseFence, QueueFailure } from '@airdrop/database/collection-queue-worker';

import type { ProcessorTimer, QueueLogger, SourceCollectorPort } from '../ports.js';
import { createCollectionJobProcessor } from '../process-collection-job.js';

const JOB_ID = '10000000-0000-4000-8000-000000000001';
const PROJECT_ID = '10000000-0000-4000-8000-000000000002';
const SOURCE_ID = '10000000-0000-4000-8000-000000000003';
const CORRELATION_ID = '10000000-0000-4000-8000-000000000004';
const NOW = new Date('2026-08-14T00:00:00.000Z');

describe('collection job processor', () => {
  it('cancels an ineligible source before collection', async () => {
    const fixture = createFixture();
    fixture.repository.eligible = false;

    await fixture.processor.process(claimedJob(), new AbortController().signal);

    expect(fixture.collector.jobs).toEqual([]);
    expect(fixture.repository.cancellations).toEqual([{ fence: fence(), resultCode: 'source_ineligible', now: NOW }]);
  });

  it('uses the durable job and execution attempt to create the collector envelope', async () => {
    const fixture = createFixture();

    await fixture.processor.process(claimedJob(), new AbortController().signal);

    expect(fixture.collector.jobs).toEqual([
      {
        jobId: JOB_ID,
        type: 'collect.source',
        version: 1,
        idempotencyKey: `queue:${JOB_ID}:attempt:1`,
        correlationId: CORRELATION_ID,
        occurredAt: NOW.toISOString(),
        payload: { projectId: PROJECT_ID, sourceId: SOURCE_ID },
      },
    ]);
    expect(fixture.repository.successes).toEqual([{ fence: fence(), resultCode: 'stored_new_content', now: NOW }]);
  });

  it('retries retryable results at their deterministic delay', async () => {
    const fixture = createFixture();
    fixture.collector.result = result('timeout');

    await fixture.processor.process(claimedJob(), new AbortController().signal);

    expect(fixture.repository.retries).toEqual([
      {
        fence: fence(),
        result: { resultCode: 'timeout', detail: null },
        availableAt: new Date(NOW.getTime() + 62_000),
        now: NOW,
      },
    ]);
  });

  it.each(['rejected_url', 'invalid_feed'] as const)('dead-letters non-retryable %s outcomes', async (outcome) => {
    const fixture = createFixture();
    fixture.collector.result = result(outcome);

    await fixture.processor.process(claimedJob(), new AbortController().signal);

    expect(fixture.repository.deadLetters).toEqual([
      { fence: fence(), result: { resultCode: outcome, detail: null }, now: NOW },
    ]);
  });

  it('dead-letters a retryable outcome on its fifth execution', async () => {
    const fixture = createFixture();
    fixture.collector.result = result('timeout');

    await fixture.processor.process(claimedJob({ executionAttempt: 5 }), new AbortController().signal);

    expect(fixture.repository.retries).toEqual([]);
    expect(fixture.repository.deadLetters).toEqual([
      { fence: fence(), result: { resultCode: 'timeout', detail: null }, now: NOW },
    ]);
  });

  it('renews its lease while collection is pending', async () => {
    const fixture = createFixture();
    const pending = deferred<CollectSourceResult>();
    fixture.collector.pending = pending;
    const processing = fixture.processor.process(claimedJob(), new AbortController().signal);
    await Promise.resolve();

    fixture.timer.releaseOne();
    await Promise.resolve();
    pending.resolve(result('not_modified'));
    await processing;

    expect(fixture.repository.renewals).toEqual([{ fence: fence(), now: NOW }]);
    expect(fixture.timer.delays).toContain(40_000);
  });

  it('does not confirm a terminal state after losing its lease', async () => {
    const fixture = createFixture();
    const pending = deferred<CollectSourceResult>();
    fixture.collector.pending = pending;
    fixture.repository.renewError = new Error('stale lease');
    const processing = fixture.processor.process(claimedJob(), new AbortController().signal);
    await Promise.resolve();

    fixture.timer.releaseOne();
    await Promise.resolve();
    pending.resolve(result('stored_new_content'));
    await processing;

    expect(fixture.repository.successes).toEqual([]);
    expect(fixture.repository.retries).toEqual([]);
    expect(fixture.repository.deadLetters).toEqual([]);
    expect(fixture.logger.records).toContainEqual({ event: 'collection_job_lease_lost', code: 'lease_fence_lost' });
  });

  it('stops lease renewal when collection rejects', async () => {
    const fixture = createFixture();
    fixture.collector.error = new Error('collector failed');

    await expect(fixture.processor.process(claimedJob(), new AbortController().signal)).rejects.toThrow('collector failed');
    fixture.timer.releaseOne();
    await Promise.resolve();

    expect(fixture.repository.renewals).toEqual([]);
  });

  it('logs only structured outcome metadata', async () => {
    const fixture = createFixture();
    fixture.collector.result = result('http_error');

    await fixture.processor.process(claimedJob(), new AbortController().signal);

    expect(fixture.logger.records).toContainEqual({
      event: 'collection_job_retry_scheduled',
      jobId: JOB_ID,
      executionAttempt: 1,
      resultCode: 'http_error',
    });
    expect(JSON.stringify(fixture.logger.records)).not.toContain('https:');
    expect(JSON.stringify(fixture.logger.records)).not.toContain('payload');
  });
});

class FakeRepository implements Pick<DurableCollectionQueueRepository, 'isEligible' | 'renew' | 'succeed' | 'retry' | 'deadLetter' | 'cancel'> {
  eligible = true;
  renewError: Error | null = null;
  readonly renewals: Array<{ fence: LeaseFence; now: Date }> = [];
  readonly successes: Array<{ fence: LeaseFence; resultCode: string; now: Date }> = [];
  readonly retries: Array<{ fence: LeaseFence; result: QueueFailure; availableAt: Date; now: Date }> = [];
  readonly deadLetters: Array<{ fence: LeaseFence; result: QueueFailure; now: Date }> = [];
  readonly cancellations: Array<{ fence: LeaseFence; resultCode: 'source_ineligible'; now: Date }> = [];
  async isEligible(): Promise<boolean> { return this.eligible; }
  async renew(leaseFence: LeaseFence, now: Date): Promise<Date> { this.renewals.push({ fence: leaseFence, now }); if (this.renewError) throw this.renewError; return new Date(NOW.getTime() + 120_000); }
  async succeed(leaseFence: LeaseFence, resultCode: string, now: Date): Promise<void> { this.successes.push({ fence: leaseFence, resultCode, now }); }
  async retry(leaseFence: LeaseFence, result: QueueFailure, availableAt: Date, now: Date): Promise<void> { this.retries.push({ fence: leaseFence, result, availableAt, now }); }
  async deadLetter(leaseFence: LeaseFence, result: QueueFailure, now: Date): Promise<void> { this.deadLetters.push({ fence: leaseFence, result, now }); }
  async cancel(leaseFence: LeaseFence, resultCode: 'source_ineligible', now: Date): Promise<void> { this.cancellations.push({ fence: leaseFence, resultCode, now }); }
}

class FakeCollector implements SourceCollectorPort {
  result: CollectSourceResult = result('stored_new_content');
  pending: Deferred<CollectSourceResult> | null = null;
  error: Error | null = null;
  readonly jobs: CollectSourceJob[] = [];
  async collect(job: CollectSourceJob): Promise<CollectSourceResult> { this.jobs.push(job); if (this.error !== null) throw this.error; return this.pending === null ? this.result : this.pending.promise; }
}

class FakeTimer implements ProcessorTimer {
  readonly delays: number[] = [];
  private readonly pending: Array<() => void> = [];
  sleep(milliseconds: number): Promise<void> { this.delays.push(milliseconds); return new Promise((resolve) => this.pending.push(resolve)); }
  releaseOne(): void { this.pending.shift()?.(); }
}

class FakeLogger implements QueueLogger {
  readonly records: Array<Record<string, unknown>> = [];
  info(record: Record<string, unknown>): void { this.records.push(record); }
  error(record: Record<string, unknown>): void { this.records.push(record); }
}

function createFixture() {
  const repository = new FakeRepository();
  const collector = new FakeCollector();
  const timer = new FakeTimer();
  const logger = new FakeLogger();
  return { repository, collector, timer, logger, processor: createCollectionJobProcessor({ repository, collector, clock: { now: () => NOW }, timer, ids: { generate: () => CORRELATION_ID }, logger }) };
}

function claimedJob(input: Partial<ClaimedCollectionJob> = {}): ClaimedCollectionJob {
  return { jobId: JOB_ID, payload: { projectId: PROJECT_ID, sourceId: SOURCE_ID, scheduleId: '10000000-0000-4000-8000-000000000005', scheduleVersion: 1, collectionRuleVersion: 'v1', trigger: 'scheduled', scheduledFor: NOW.toISOString() }, executionAttempt: 1, deliveryCount: 1, maxAttempts: 5, leaseOwner: 'worker-a', leaseEpoch: 1, leaseExpiresAt: new Date(NOW.getTime() + 120_000).toISOString(), ...input };
}
function fence(): LeaseFence { return { jobId: JOB_ID, workerId: 'worker-a', leaseEpoch: 1 }; }
function result(outcome: CollectSourceResult['outcome']): CollectSourceResult { return { attemptId: '10000000-0000-4000-8000-000000000006', projectId: PROJECT_ID, sourceId: SOURCE_ID, outcome, rawItemId: null, discoveredCount: 0, bodyFetchCount: 0 }; }
interface Deferred<T> { readonly promise: Promise<T>; resolve(value: T): void; }
function deferred<T>(): Deferred<T> { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
