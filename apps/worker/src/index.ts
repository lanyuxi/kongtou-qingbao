import { createWorkerHealth, transitionWorkerHealth, type WorkerHealth } from './health.js';

const clock = (): Date => new Date();
let health: WorkerHealth = createWorkerHealth(clock);
const keepAlive = setInterval(() => undefined, 60_000);

const emitHealth = (): void => {
  process.stdout.write(`${JSON.stringify(health)}\n`);
};

const stop = (): void => {
  if (health.status === 'stopping') {
    return;
  }

  health = transitionWorkerHealth(health, 'stopping', clock);
  emitHealth();
  clearInterval(keepAlive);
  process.exitCode = 0;
};

process.once('SIGTERM', stop);
process.once('SIGINT', stop);

emitHealth();
health = transitionWorkerHealth(health, 'ready', clock);
emitHealth();
