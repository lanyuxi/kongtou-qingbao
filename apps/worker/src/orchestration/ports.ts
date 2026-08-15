import type { Clock, ProcessorTimer } from '../queue/ports.js';

/** A stage runner executes one bounded sweep and returns plain counters. */
export interface StageRunner {
  run(): Promise<Record<string, number>>;
}

export interface OrchestratorLogger {
  info(record: Record<string, unknown>): void;
  error(record: Record<string, unknown>): void;
}

export interface StageLoopDependencies {
  readonly stage: string;
  readonly runner: StageRunner;
  readonly intervalMs: number;
  readonly clock: Clock;
  readonly timer: ProcessorTimer;
  readonly logger: OrchestratorLogger;
}

export interface StageLoop {
  run(signal: AbortSignal): Promise<void>;
}
