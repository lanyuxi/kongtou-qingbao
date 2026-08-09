export type WorkerHealth = {
  service: 'worker';
  status: 'starting' | 'ready' | 'stopping';
  startedAt: string;
  checkedAt: string;
};

export type Clock = () => Date;

export class WorkerLifecycleTransitionError extends Error {
  public constructor(from: WorkerHealth['status'], to: WorkerHealth['status']) {
    super(`Worker health cannot transition from ${from} to ${to}.`);
    this.name = 'WorkerLifecycleTransitionError';
  }
}

const validTransitions: Readonly<Record<WorkerHealth['status'], readonly WorkerHealth['status'][]>> = {
  starting: ['ready', 'stopping'],
  ready: ['stopping'],
  stopping: []
};

export const createWorkerHealth = (clock: Clock): WorkerHealth => {
  const timestamp = clock().toISOString();

  return {
    service: 'worker',
    status: 'starting',
    startedAt: timestamp,
    checkedAt: timestamp
  };
};

export const transitionWorkerHealth = (
  health: WorkerHealth,
  status: WorkerHealth['status'],
  clock: Clock
): WorkerHealth => {
  if (!validTransitions[health.status].includes(status)) {
    throw new WorkerLifecycleTransitionError(health.status, status);
  }

  return {
    ...health,
    status,
    checkedAt: clock().toISOString()
  };
};
