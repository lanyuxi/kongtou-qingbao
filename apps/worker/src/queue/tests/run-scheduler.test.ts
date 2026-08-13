import { describe, expect, it } from 'vitest';

import type { DurableCollectionQueueRepository, ReconcileResult } from '@airdrop/database/collection-queue-worker';

import type { QueueLogger, SchedulerTimer } from '../ports.js';
import { createScheduler as createSchedulerUseCase } from '../run-scheduler.js';

const NOW = new Date('2026-08-14T00:00:00.000Z');

describe('collection scheduler', () => {
  it('reconciles immediately with the current time and batch size 100', async () => {
    const fixture = createFixture();

    await expect(fixture.scheduler.scanOnce()).resolves.toEqual(fixture.repository.result);

    expect(fixture.repository.reconciles).toEqual([{ now: NOW, batchLimit: 100 }]);
    expect(fixture.logger.records).toEqual([
      {
        event: 'collection_schedule_reconciled',
        createdScheduleCount: 2,
        enqueuedCount: 3,
        canceledCount: 1,
        durationMs: 0,
      },
    ]);
  });

  it('waits thirty seconds between successful scans and stops before another scan after abort', async () => {
    const fixture = createFixture();
    const abort = new AbortController();
    fixture.timer.onSleep = () => abort.abort();

    await fixture.scheduler.run(abort.signal);

    expect(fixture.repository.reconciles).toEqual([{ now: NOW, batchLimit: 100 }]);
    expect(fixture.timer.delays).toEqual([30_000]);
  });

  it('runs subsequent scans after thirty-second ticks', async () => {
    const fixture = createFixture();
    const abort = new AbortController();
    let sleeps = 0;
    fixture.timer.onSleep = () => {
      sleeps += 1;
      if (sleeps === 2) abort.abort();
    };

    await fixture.scheduler.run(abort.signal);

    expect(fixture.repository.reconciles).toEqual([
      { now: NOW, batchLimit: 100 },
      { now: NOW, batchLimit: 100 },
    ]);
    expect(fixture.timer.delays).toEqual([30_000, 30_000]);
  });

  it('treats an advisory lock miss as a successful no-op', async () => {
    const fixture = createFixture();
    fixture.repository.result = { ...fixture.repository.result, lockAcquired: false };

    await expect(fixture.scheduler.scanOnce()).resolves.toEqual(fixture.repository.result);

    expect(fixture.logger.records).toEqual([]);
  });

  it('logs a bounded persistence failure without queue payloads or URLs', async () => {
    const fixture = createFixture();
    fixture.repository.reconcileError = new Error('https://secret.example/a payload');

    await expect(fixture.scheduler.scanOnce()).rejects.toThrow('https://secret.example/a payload');

    expect(fixture.logger.records).toEqual([
      { event: 'collection_schedule_reconcile_failed', code: 'queue_persistence_failed' },
    ]);
  });
});

class FakeRepository implements Pick<DurableCollectionQueueRepository, 'reconcile'> {
  result: ReconcileResult = {
    createdScheduleCount: 2,
    enqueuedCount: 3,
    canceledCount: 1,
    lockAcquired: true,
  };
  reconcileError: Error | null = null;
  readonly reconciles: Array<{ now: Date; batchLimit: number }> = [];

  async reconcile(now: Date, batchLimit: number): Promise<ReconcileResult> {
    this.reconciles.push({ now, batchLimit });
    if (this.reconcileError !== null) throw this.reconcileError;
    return this.result;
  }
}

class FakeTimer implements SchedulerTimer {
  readonly delays: number[] = [];
  onSleep: (() => void) | null = null;

  async sleep(milliseconds: number): Promise<void> {
    this.delays.push(milliseconds);
    this.onSleep?.();
  }
}

class FakeLogger implements QueueLogger {
  readonly records: Array<Record<string, unknown>> = [];
  info(record: Record<string, unknown>): void { this.records.push(record); }
  error(record: Record<string, unknown>): void { this.records.push(record); }
}

function createFixture() {
  const repository = new FakeRepository();
  const timer = new FakeTimer();
  const logger = new FakeLogger();
  return {
    repository,
    timer,
    logger,
    scheduler: createSchedulerUseCase({
      repository,
      clock: { now: () => NOW },
      timer,
      logger,
    }),
  };
}
