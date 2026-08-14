import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createWorkerHealth,
  transitionWorkerHealth,
  WorkerLifecycleTransitionError
} from '../health.js';
import { runWorker } from '../index.js';

type WorkerExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

type ParsedLine = { status?: string; probe?: string; stopCalls?: number };

const workerDirectory = fileURLToPath(new URL('../../', import.meta.url));

const waitForWorkerExit = (worker: ChildProcess): Promise<WorkerExit> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Worker did not exit within 1 second.'));
    }, 1_000);

    worker.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

const stopWorkerIfRunning = async (worker: ChildProcess): Promise<void> => {
  if (worker.exitCode !== null || worker.signalCode !== null) {
    return;
  }

  worker.kill('SIGKILL');
  await waitForWorkerExit(worker);
};

const cleanEnvironment = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
});

const runFixtureWithSignals = async (signals: readonly NodeJS.Signals[]): Promise<{
  lines: ParsedLine[];
  exit: WorkerExit;
}> => {
  const worker = spawn(process.execPath, ['--import', 'tsx', 'src/tests/worker-spawn-fixture.ts'], {
    cwd: workerDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanEnvironment()
  });
  const output: string[] = [];
  const outputFlushed = new Promise<void>((resolve) => {
    worker.stdout?.once('close', () => resolve());
  });

  try {
    const ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker did not emit ready within 1 second.'));
      }, 1_000);

      worker.stdout?.setEncoding('utf8');
      worker.stdout?.on('data', (chunk: string) => {
        output.push(...chunk.split('\n').filter(Boolean));

        if (output.some((line) => JSON.parse(line).status === 'ready')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    await ready;
    const [firstSignal, ...remainingSignals] = signals;

    if (firstSignal === undefined) {
      throw new Error('At least one shutdown signal is required.');
    }

    const stopping =
      remainingSignals.length === 0
        ? undefined
        : new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Worker did not emit stopping within 1 second.'));
            }, 1_000);

            worker.stdout?.on('data', () => {
              if (output.some((line) => JSON.parse(line).status === 'stopping')) {
                clearTimeout(timeout);
                resolve();
              }
            });
          });

    worker.kill(firstSignal);

    if (stopping !== undefined) {
      await stopping;
      remainingSignals.forEach((signal) => worker.kill(signal));
    }

    const exit = await waitForWorkerExit(worker);
    await outputFlushed;
    return { lines: output.map((line) => JSON.parse(line) as ParsedLine), exit };
  } finally {
    await stopWorkerIfRunning(worker);
  }
};

describe('worker health lifecycle', () => {
  const now = () => new Date('2026-08-09T12:00:00.000Z');

  it('transitions from starting to ready to stopping using the injected clock', () => {
    const starting = createWorkerHealth(now);
    const ready = transitionWorkerHealth(starting, 'ready', now);
    const stopping = transitionWorkerHealth(ready, 'stopping', now);

    expect(starting).toEqual({
      service: 'worker',
      status: 'starting',
      startedAt: '2026-08-09T12:00:00.000Z',
      checkedAt: '2026-08-09T12:00:00.000Z'
    });
    expect(ready).toEqual({ ...starting, status: 'ready' });
    expect(stopping).toEqual({ ...starting, status: 'stopping' });
  });

  it('rejects a transition from stopping to ready', () => {
    const stopping = transitionWorkerHealth(
      transitionWorkerHealth(createWorkerHealth(now), 'ready', now),
      'stopping',
      now
    );

    expect(() => transitionWorkerHealth(stopping, 'ready', now)).toThrow(
      WorkerLifecycleTransitionError
    );
  });

  it('fails cleanup when a SIGKILLed child does not exit within its bound', async () => {
    const unfinishedWorker = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: () => true
    }) as unknown as ChildProcess;

    await expect(stopWorkerIfRunning(unfinishedWorker)).rejects.toThrow(
      'Worker did not exit within 1 second.'
    );
  }, 3_000);

  it('emits stopping and exits with code 0 when it receives SIGTERM', async () => {
    const { exit, lines } = await runFixtureWithSignals(['SIGTERM']);

    expect(exit.code).toBe(0);
    expect(exit.signal).toBeNull();
    expect(lines.map((line) => line.status).filter(Boolean)).toEqual([
      'starting',
      'ready',
      'stopping'
    ]);
    const probe = lines.find((line) => line.probe === 'stop_calls');
    expect(probe?.stopCalls).toBe(1);
  }, 5_000);

  it('exits with code 0 after repeated SIGTERM signals and stops the runtime once', async () => {
    const { exit, lines } = await runFixtureWithSignals(['SIGTERM', 'SIGTERM', 'SIGINT']);

    expect(exit.code).toBe(0);
    expect(exit.signal).toBeNull();
    expect(lines.map((line) => line.status).filter(Boolean)).toEqual([
      'starting',
      'ready',
      'stopping'
    ]);
    const probe = lines.find((line) => line.probe === 'stop_calls');
    expect(probe?.stopCalls).toBe(1);
  }, 5_000);

  it('fails closed with a bounded configuration error when the environment is absent', async () => {
    const worker = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: workerDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: cleanEnvironment()
    });
    let stdout = '';
    worker.stdout?.setEncoding('utf8');
    worker.stdout?.on('data', (chunk: string) => { stdout += chunk; });

    const exit = await waitForWorkerExit(worker);

    expect(exit.code).toBe(1);
    expect(stdout).not.toContain('postgres');
    expect(stdout).not.toContain('ready');
  }, 5_000);
});

describe('runWorker lifecycle use case', () => {
  const clock = () => new Date('2026-08-14T02:00:00.000Z');

  const createRecordingPorts = (): {
    statuses: string[];
    signalHandlers: Array<() => void>;
    emit: (health: { status: string }) => void;
    onSignal: (handler: () => void) => void;
  } => {
    const statuses: string[] = [];
    const signalHandlers: Array<() => void> = [];
    return {
      statuses,
      signalHandlers,
      emit: (health) => { statuses.push(health.status); },
      onSignal: (handler) => { signalHandlers.push(handler); }
    };
  };

  it('emits ready only after start resolves and stopping only once after repeated signals', async () => {
    const ports = createRecordingPorts();
    let stopCalls = 0;
    const runtime = {
      start: async (): Promise<void> => { await sleep(10); },
      stop: async (): Promise<void> => { stopCalls += 1; await sleep(10); }
    };

    const running = runWorker(runtime, ports, { clock });
    await flushMicrotasks();
    expect(ports.statuses).toEqual(['starting']);

    await sleep(20);
    expect(ports.statuses).toEqual(['starting', 'ready']);

    ports.signalHandlers.forEach((trigger) => trigger());
    ports.signalHandlers.forEach((trigger) => trigger());
    await running;

    expect(ports.statuses).toEqual(['starting', 'ready', 'stopping']);
    expect(stopCalls).toBe(1);
  });

  it('stops waiting for runtime cleanup at the bounded shutdown deadline', async () => {
    const ports = createRecordingPorts();
    const runtime = {
      start: async (): Promise<void> => undefined,
      stop: (): Promise<void> => new Promise<void>(() => undefined)
    };

    const startedAt = Date.now();
    const running = runWorker(runtime, ports, { clock, shutdownBoundMs: 60 });
    await sleep(20);
    ports.signalHandlers.forEach((trigger) => trigger());
    await running;
    const elapsed = Date.now() - startedAt;

    expect(ports.statuses).toEqual(['starting', 'ready', 'stopping']);
    expect(elapsed).toBeGreaterThanOrEqual(50);
    expect(elapsed).toBeLessThan(1_000);
  }, 3_000);
});

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, milliseconds); });
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
