import { describe, expect, it } from 'vitest';

import type { ProcessorTimer } from '../../queue/ports.js';
import type { OrchestratorLogger, StageRunner } from '../ports.js';
import { createStageLoop } from '../ai-stage-orchestrator.js';

const NOW = new Date('2026-08-15T00:00:00.000Z');

describe('orchestration stage loop', () => {
  it('runs the first tick immediately and logs bounded success counters', async () => {
    const fixture = createFixture();
    const abort = new AbortController();
    fixture.timer.onSleep = () => abort.abort();

    await fixture.loop.run(abort.signal);

    expect(fixture.runner.calls).toBe(1);
    expect(fixture.logger.records).toEqual([
      {
        event: 'extraction_tick_succeeded',
        durationMs: 0,
        processed: 2,
        succeeded: 2,
      },
    ]);
    expect(fixture.timer.delays).toEqual([60_000]);
  });

  it('keeps the base interval between successful ticks', async () => {
    const fixture = createFixture();
    const abort = new AbortController();
    let sleeps = 0;
    fixture.timer.onSleep = () => {
      sleeps += 1;
      if (sleeps === 2) abort.abort();
    };

    await fixture.loop.run(abort.signal);

    expect(fixture.runner.calls).toBe(2);
    expect(fixture.timer.delays).toEqual([60_000, 60_000]);
  });

  it('backs off exponentially after a failed tick without leaking error detail', async () => {
    const fixture = createFixture();
    fixture.runner.mode = 'fail';
    fixture.runner.errorMessage = 'https://secret.example/a with token';
    const abort = new AbortController();
    let sleeps = 0;
    fixture.timer.onSleep = () => {
      sleeps += 1;
      if (sleeps === 3) abort.abort();
    };

    await fixture.loop.run(abort.signal);

    expect(fixture.runner.calls).toBe(3);
    expect(fixture.timer.delays).toEqual([120_000, 240_000, 480_000]);
    expect(fixture.logger.records).toEqual([
      { event: 'extraction_tick_failed', code: 'stage_failed', consecutiveFailures: 1 },
      { event: 'extraction_tick_failed', code: 'stage_failed', consecutiveFailures: 2 },
      { event: 'extraction_tick_failed', code: 'stage_failed', consecutiveFailures: 3 },
    ]);
  });

  it('caps the backoff delay at fifteen minutes', async () => {
    const fixture = createFixture();
    fixture.runner.mode = 'fail';
    const abort = new AbortController();
    let sleeps = 0;
    fixture.timer.onSleep = () => {
      sleeps += 1;
      if (sleeps === 5) abort.abort();
    };

    await fixture.loop.run(abort.signal);

    expect(fixture.timer.delays).toEqual([
      120_000, 240_000, 480_000, 900_000, 900_000,
    ]);
  });

  it('resets to the base interval once a failing stage recovers', async () => {
    const fixture = createFixture();
    fixture.runner.script = ['fail', 'fail', 'succeed', 'succeed'];
    const abort = new AbortController();
    let sleeps = 0;
    fixture.timer.onSleep = () => {
      sleeps += 1;
      if (sleeps === 4) abort.abort();
    };

    await fixture.loop.run(abort.signal);

    expect(fixture.timer.delays).toEqual([120_000, 240_000, 60_000, 60_000]);
  });

  it('stops before the next tick when aborted during sleep', async () => {
    const fixture = createFixture();
    const abort = new AbortController();
    fixture.timer.onSleep = () => abort.abort();

    await fixture.loop.run(abort.signal);

    expect(fixture.runner.calls).toBe(1);
  });

  it('never runs a tick when aborted before start', async () => {
    const fixture = createFixture();
    const abort = new AbortController();
    abort.abort();

    await fixture.loop.run(abort.signal);

    expect(fixture.runner.calls).toBe(0);
    expect(fixture.logger.records).toEqual([]);
  });
});

class FakeRunner implements StageRunner {
  mode: 'succeed' | 'fail' = 'succeed';
  script: ReadonlyArray<'succeed' | 'fail'> = [];
  errorMessage = 'boom';
  calls = 0;

  async run(): Promise<Record<string, number>> {
    this.calls += 1;
    const outcome = this.script[this.calls - 1] ?? this.mode;
    if (outcome === 'fail') {
      throw new Error(this.errorMessage);
    }
    return { processed: 2, succeeded: 2 };
  }
}

class FakeTimer implements ProcessorTimer {
  readonly delays: number[] = [];
  onSleep: (() => void) | null = null;

  async sleep(milliseconds: number): Promise<void> {
    this.delays.push(milliseconds);
    this.onSleep?.();
  }
}

class FakeLogger implements OrchestratorLogger {
  readonly records: Array<Record<string, unknown>> = [];
  info(record: Record<string, unknown>): void { this.records.push(record); }
  error(record: Record<string, unknown>): void { this.records.push(record); }
}

function createFixture() {
  const runner = new FakeRunner();
  const timer = new FakeTimer();
  const logger = new FakeLogger();
  return {
    runner,
    timer,
    logger,
    loop: createStageLoop({
      stage: 'extraction',
      runner,
      intervalMs: 60_000,
      clock: { now: () => NOW },
      timer,
      logger,
    }),
  };
}
