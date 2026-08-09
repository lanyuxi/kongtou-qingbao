import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createWorkerHealth,
  transitionWorkerHealth,
  WorkerLifecycleTransitionError
} from '../health.js';

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

  it('emits stopping and exits with code 0 when it receives SIGTERM', async () => {
    const workerDirectory = fileURLToPath(new URL('../../', import.meta.url));
    const typescriptCli = join(workerDirectory, '../../node_modules/typescript/bin/tsc');
    const compiler = spawn(process.execPath, [typescriptCli, '-p', 'tsconfig.json'], {
      cwd: workerDirectory,
      stdio: 'inherit'
    });
    const [compileCode] = await once(compiler, 'exit') as [number | null, NodeJS.Signals | null];

    expect(compileCode).toBe(0);

    const worker = spawn(process.execPath, ['dist/index.js'], {
      cwd: workerDirectory,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const output: string[] = [];
    let terminationRequested = false;

    worker.stdout.setEncoding('utf8');
    worker.stdout.on('data', (chunk: string) => {
      output.push(...chunk.split('\n').filter(Boolean));

      if (!terminationRequested && output.some((line) => JSON.parse(line).status === 'ready')) {
        terminationRequested = true;
        worker.kill('SIGTERM');
      }
    });

    const [code, signal] = await once(worker, 'exit') as [number | null, NodeJS.Signals | null];

    expect(code).toBe(0);
    expect(signal).toBeNull();
    expect(output.map((line) => JSON.parse(line).status)).toEqual([
      'starting',
      'ready',
      'stopping'
    ]);
  }, 5_000);
});
