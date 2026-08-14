import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DurableCollectionQueueRepository } from '@airdrop/database/collection-queue-worker';

import { createQueueRuntime, QueueRuntimeConfigurationError } from '../create-queue-runtime.js';

const harness = vi.hoisted(() => {
  const state = {
    queueFactoryUrls: [] as string[],
    collectorFactoryOptions: [] as Array<{ databaseUrl: string; userAgent: string }>,
    closeOrder: [] as string[],
    scanOnceCalls: 0,
    schedulerRunSignals: [] as AbortSignal[],
    consumerRunSignals: [] as AbortSignal[],
    idleGate: { promise: Promise.resolve() } as { promise: Promise<void> },
  };
  return state;
});

vi.mock('@airdrop/database/collection-queue-worker', () => ({
  createDurableCollectionQueueRepository: vi.fn((databaseUrl: string) => {
    harness.queueFactoryUrls.push(databaseUrl);
    return {
      close: async (): Promise<void> => { harness.closeOrder.push('queue'); },
    } as unknown as DurableCollectionQueueRepository;
  }),
}));

vi.mock('../../collection/create-collector.js', () => ({
  createSourceCollector: vi.fn((options: { databaseUrl: string; userAgent: string }) => {
    harness.collectorFactoryOptions.push(options);
    return {
      collect: vi.fn(),
      close: async (): Promise<void> => { harness.closeOrder.push('collector'); },
    };
  }),
}));

vi.mock('../run-scheduler.js', () => ({
  createScheduler: vi.fn(() => ({
    scanOnce: async (): Promise<void> => { harness.scanOnceCalls += 1; },
    run: (signal: AbortSignal): Promise<void> => {
      harness.schedulerRunSignals.push(signal);
      return new Promise<void>(() => undefined);
    },
  })),
}));

vi.mock('../run-consumer.js', () => ({
  createConsumer: vi.fn(() => ({
    run: (signal: AbortSignal): Promise<void> => {
      harness.consumerRunSignals.push(signal);
      return new Promise<void>(() => undefined);
    },
    waitForIdle: (): Promise<void> => harness.idleGate.promise,
  })),
}));

const QUEUE_URL = 'postgresql://queue-user:queue-secret@127.0.0.1:54322/postgres';
const COLLECTION_URL = 'postgresql://collection-user:collection-secret@127.0.0.1:54322/postgres';
const USER_AGENT = 'airdrop-intelligence-os/0.0.0 (+https://example.invalid)';
const WORKER_ID = 'worker-runtime-1';

function validOptions(): {
  queueDatabaseUrl: string;
  collectionDatabaseUrl: string;
  collectionUserAgent: string;
  workerId: string;
} {
  return {
    queueDatabaseUrl: QUEUE_URL,
    collectionDatabaseUrl: COLLECTION_URL,
    collectionUserAgent: USER_AGENT,
    workerId: WORKER_ID,
  };
}

describe('queue runtime composition', () => {
  beforeEach(() => {
    harness.queueFactoryUrls = [];
    harness.collectorFactoryOptions = [];
    harness.closeOrder = [];
    harness.scanOnceCalls = 0;
    harness.schedulerRunSignals = [];
    harness.consumerRunSignals = [];
    harness.idleGate = { promise: Promise.resolve() };
  });

  it.each([
    ['missing queue URL', { ...validOptions(), queueDatabaseUrl: '' }],
    ['non-postgres queue URL', { ...validOptions(), queueDatabaseUrl: 'http://127.0.0.1:54322' }],
    ['unparsable queue URL', { ...validOptions(), queueDatabaseUrl: 'not a url' }],
    ['missing collection URL', { ...validOptions(), collectionDatabaseUrl: '' }],
    ['non-postgres collection URL', { ...validOptions(), collectionDatabaseUrl: 'mysql://127.0.0.1' }],
    ['missing user agent', { ...validOptions(), collectionUserAgent: '' }],
    ['padded user agent', { ...validOptions(), collectionUserAgent: ` ${USER_AGENT}` }],
    ['missing worker id', { ...validOptions(), workerId: '' }],
    ['padded worker id', { ...validOptions(), workerId: ' worker-1 ' }],
  ])('rejects %s without echoing the value', (_name, options) => {
    expect(() => createQueueRuntime(options)).toThrow(QueueRuntimeConfigurationError);

    const error = captureConfigurationError((): void => {
      createQueueRuntime(options);
    });
    expect(error.code).toBe('invalid_queue_runtime_configuration');
    expect(error.message).not.toContain('queue-secret');
    expect(error.message).not.toContain('collection-secret');
    expect(error.message).not.toContain(USER_AGENT);
    expect(harness.queueFactoryUrls).toEqual([]);
    expect(harness.collectorFactoryOptions).toEqual([]);
  });

  it('creates one queue pool and one separate collector pool from their own URLs', async () => {
    const runtime = createQueueRuntime(validOptions());

    expect(harness.queueFactoryUrls).toEqual([QUEUE_URL]);
    expect(harness.collectorFactoryOptions).toEqual([
      { databaseUrl: COLLECTION_URL, userAgent: USER_AGENT },
    ]);

    await runtime.stop();
  });

  it('resolves start only after the first schedule scan and then runs both loops', async () => {
    const runtime = createQueueRuntime(validOptions());
    expect(harness.scanOnceCalls).toBe(0);

    await runtime.start();

    expect(harness.scanOnceCalls).toBe(1);
    expect(harness.schedulerRunSignals.length).toBe(1);
    expect(harness.consumerRunSignals.length).toBe(1);
    expect(harness.schedulerRunSignals[0]?.aborted).toBe(false);

    await runtime.stop();
  });

  it('stop aborts both loops, waits for the active processor, and closes the collector before the queue pool', async () => {
    const runtime = createQueueRuntime(validOptions());
    await runtime.start();

    let releaseIdle: () => void = () => undefined;
    harness.idleGate = {
      promise: new Promise<void>((resolve) => { releaseIdle = resolve; }),
    };

    let stopped = false;
    const stopping = runtime.stop().then(() => { stopped = true; });
    await flushMicrotasks();

    expect(harness.schedulerRunSignals[0]?.aborted).toBe(true);
    expect(harness.consumerRunSignals[0]?.aborted).toBe(true);
    expect(harness.closeOrder).toEqual([]);
    expect(stopped).toBe(false);

    releaseIdle();
    await stopping;

    expect(harness.closeOrder).toEqual(['collector', 'queue']);
  });

  it('stop is idempotent across repeated calls', async () => {
    const runtime = createQueueRuntime(validOptions());
    await runtime.start();

    const first = runtime.stop();
    const second = runtime.stop();
    await Promise.all([first, second]);

    expect(harness.closeOrder).toEqual(['collector', 'queue']);
  });
});

function captureConfigurationError(operate: () => void): { code: string; message: string } {
  try {
    operate();
  } catch (error) {
    if (error instanceof QueueRuntimeConfigurationError) {
      return { code: error.code, message: error.message };
    }
    throw error;
  }
  throw new Error('Expected createQueueRuntime to throw.');
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
