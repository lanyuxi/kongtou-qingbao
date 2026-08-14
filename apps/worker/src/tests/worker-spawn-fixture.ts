// Spawned-process fixture for worker lifecycle tests.
//
// The real production entry point (dist/index.js) reads server environment
// configuration and connects to PostgreSQL, so signal-lifecycle tests spawn
// this fixture instead. It wires the exported runWorker to a fake runtime
// with observable start/stop timing and reports stop calls on stdout.
import { runWorker } from '../index.js';

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => { setTimeout(resolve, milliseconds); });

let stopCalls = 0;

const runtime = {
  async start(): Promise<void> { await sleep(50); },
  async stop(): Promise<void> {
    stopCalls += 1;
    process.stdout.write(`${JSON.stringify({ probe: 'stop_calls', stopCalls })}\n`);
    await sleep(120);
  },
};

await runWorker(runtime, {
  emit: (health) => { process.stdout.write(`${JSON.stringify(health)}\n`); },
  onSignal: (handler) => {
    process.on('SIGTERM', handler);
    process.on('SIGINT', handler);
  },
});
