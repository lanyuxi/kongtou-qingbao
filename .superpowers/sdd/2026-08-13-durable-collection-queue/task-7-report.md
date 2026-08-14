# Task 7 — Scheduler and Fenced Collection Processor Report

## Scope

Implemented pure injected scheduler and collection job processor under `apps/worker/src/queue`. The task brief’s short database entrypoint name was reconciled with the audited existing export: all worker queue imports use `@airdrop/database/collection-queue-worker`; no alias or Task 5 export change was introduced.

## TDD evidence

### RED

Initial command without `CI=true` was blocked by pnpm’s no-TTY modules-dir safeguard. With the configured runtime available, the required command was run as:

```text
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH CI=true pnpm --filter @airdrop/worker test -- src/queue/tests/run-scheduler.test.ts src/queue/tests/process-collection-job.test.ts
```

It failed as expected: Vitest reported `Cannot find module '../run-scheduler.js'`, `Cannot find module '../process-collection-job.js'`, and missing `../ports.js`. The all-worker test command also exposed health compilation failures caused by those missing modules. This RED was observed after deleting the initially premature production files and before rewriting the implementation.

### GREEN

```text
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH CI=true pnpm --filter @airdrop/worker test -- src/queue/tests/run-scheduler.test.ts src/queue/tests/process-collection-job.test.ts
```

Passed: 8 files, 112 tests.

```text
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH CI=true pnpm --filter @airdrop/worker lint
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH CI=true pnpm --filter @airdrop/worker typecheck
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH CI=true pnpm --filter @airdrop/worker test
```

All passed; full worker test result: 8 files, 112 tests.

## Behavior delivered

- Scheduler immediately reconciles with batch size 100, logs only aggregate counts/duration, treats advisory lock misses as no-op, logs bounded persistence errors, ticks each 30 seconds, and honors abort before a subsequent scan.
- Processor performs eligibility preflight and cancels `source_ineligible` without calling the collector.
- Collector receives the strict existing envelope: durable job ID, deterministic attempt idempotency key, injected correlation ID/current time, and project/source-only payload.
- Success, retry timing, non-retryable dead letters, exhausted fifth attempts, lease renewal every 40 seconds, lease-loss suppression of terminal writes, and structured no-payload/no-URL logs are covered.

## Self-review and concerns

- No real timers, HTTP, environment reads, `process`, Postgres client, or queue transactions are used by these use cases.
- Terminal queue operations occur only after collection and renewal are checked; an in-flight renewal is awaited after collection before terminal confirmation. A collector rejection stops renewal and propagates, preserving at-least-once redelivery without terminal mutation.
- Collector exceptions currently propagate without a terminal queue mutation, preserving at-least-once redelivery rather than guessing an ungrounded outcome.
- The runtime is Node 24.19.0 while package engines request `>=22 <23`; every pnpm command emits that warning. It did not cause a test/typecheck/lint failure.

## Fix round 1 — clean lease-renewal shutdown

### RED

The focused processor test command exposed four failures: fast collection completion and collector rejection both left a pending renewal wait; a timer wait rejection produced an unhandled rejection and allowed terminal success; an in-flight renewal rejection could race terminal confirmation. The final race was traced to the outer catch treating every rejection after abort as benign, including a renewal that had already started before stop.

### GREEN

`ProcessorTimer.sleep` now accepts an `AbortSignal`. A per-job renewal `AbortController` wakes/cancels the injected timer; `stop()` awaits the owned renewal task. Timer failures are contained and latch lease loss. In-flight renewals have a dedicated inner catch, so their failure latches lease loss even when stop has aborted future waits. The processor awaits stop before reading the latch or issuing a terminal queue mutation.

Focused Worker processor tests passed twice: 8 files / 115 tests. Worker typecheck and lint passed. Fresh root verification follows this report update.
