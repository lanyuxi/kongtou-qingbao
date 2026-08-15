import { backoffDelayMs } from '@airdrop/domain';

import type { OrchestratorLogger, StageLoop, StageLoopDependencies } from './ports.js';

/**
 * One timer-driven stage loop for the AI stage orchestration.
 *
 * Semantics:
 * - The first tick runs immediately on start (the stages are cheap no-ops when
 *   nothing is pending, so startup latency matters more than spread).
 * - Success sleeps for the base interval; the summary counters are logged
 *   verbatim (they are bounded numbers, never payloads).
 * - Failure sleeps for `backoffDelayMs(consecutiveFailures, intervalMs)`,
 *   capped at 15 minutes, and logs a bounded record without error detail —
 *   human-readable messages are never used for branching and never stored.
 * - Recovery resets the consecutive-failure count to zero.
 * - Each stage loop is independent: a failing stage never blocks the other.
 */
export function createStageLoop(deps: StageLoopDependencies): StageLoop {
  return {
    async run(signal: AbortSignal): Promise<void> {
      let consecutiveFailures = 0;
      while (!signal.aborted) {
        const startedAt = deps.clock.now();
        try {
          const summary = await deps.runner.run();
          consecutiveFailures = 0;
          deps.logger.info({
            event: `${deps.stage}_tick_succeeded`,
            durationMs: Math.max(0, deps.clock.now().getTime() - startedAt.getTime()),
            ...summary,
          });
          await deps.timer.sleep(deps.intervalMs, signal);
        } catch {
          consecutiveFailures += 1;
          logStageFailure(deps.logger, deps.stage, consecutiveFailures);
          await deps.timer.sleep(
            backoffDelayMs(consecutiveFailures, deps.intervalMs),
            signal,
          );
        }
      }
    },
  };
}

function logStageFailure(
  logger: OrchestratorLogger,
  stage: string,
  consecutiveFailures: number,
): void {
  logger.error({
    event: `${stage}_tick_failed`,
    code: 'stage_failed',
    consecutiveFailures,
  });
}
