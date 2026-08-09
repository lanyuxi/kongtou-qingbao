import { EventEmitter, once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createWorkerHealth,
  transitionWorkerHealth,
  WorkerLifecycleTransitionError
} from '../health.js';

type WorkerExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

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

const runWorkerWithSignals = async (signals: readonly NodeJS.Signals[]): Promise<{
  output: string[];
  exit: WorkerExit;
}> => {
  const workerDirectory = fileURLToPath(new URL('../../', import.meta.url));
  const typescriptCli = join(workerDirectory, '../../node_modules/typescript/bin/tsc');
  const compiler = spawn(process.execPath, [typescriptCli, '-p', 'tsconfig.json'], {
    cwd: workerDirectory,
    stdio: 'inherit'
  });
  const [compileCode] = await once(compiler, 'exit') as [number | null, NodeJS.Signals | null];

  if (compileCode !== 0) {
    throw new Error(`Worker compilation failed with exit code ${String(compileCode)}.`);
  }

  const worker = spawn(process.execPath, ['dist/index.js'], {
    cwd: workerDirectory,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output: string[] = [];

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

    return { output, exit: await waitForWorkerExit(worker) };
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
  }, 1_100);

  it('emits stopping and exits with code 0 when it receives SIGTERM', async () => {
    const { exit, output } = await runWorkerWithSignals(['SIGTERM']);

    expect(exit.code).toBe(0);
    expect(exit.signal).toBeNull();
    expect(output.map((line) => JSON.parse(line).status)).toEqual([
      'starting',
      'ready',
      'stopping'
    ]);
  }, 5_000);

  it('exits with code 0 after repeated SIGTERM signals', async () => {
    const { exit, output } = await runWorkerWithSignals(['SIGTERM', 'SIGTERM']);

    expect(exit.code).toBe(0);
    expect(exit.signal).toBeNull();
    expect(output.map((line) => JSON.parse(line).status)).toEqual([
      'starting',
      'ready',
      'stopping'
    ]);
  }, 5_000);
});
