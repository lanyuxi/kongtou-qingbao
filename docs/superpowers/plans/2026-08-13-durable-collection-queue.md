# Durable Collection Queue and Automatic Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably and automatically schedule eligible official sources, deliver `collect.source` jobs at least once through PostgreSQL leases, and operate the existing Collector with bounded retries, dead letters, administrator commands, and graceful Worker shutdown.

**Architecture:** PostgreSQL is the durable scheduler and queue system of record. Contracts and pure domain rules are implemented before a forward-only operational migration, typed repositories, protected `/api/v1` administrator commands, and injected Worker loops. The scheduler only creates jobs; queue consumers invoke the existing Collector outside queue transactions and use fenced leases plus Collector idempotency to recover safely from crashes.

**Tech Stack:** TypeScript strict mode, Zod 4, PostgreSQL/Supabase migrations and RLS, postgres.js 3.4, Supabase Auth, Next.js 16 Route Handlers, Vitest 4, pgTAP, pnpm 11, Node.js 22.

## Global Constraints

- Follow `AGENTS.md` and `docs/superpowers/specs/2026-08-13-durable-collection-queue-design.md` throughout.
- Use TDD for every behavior: observe the intended RED, implement the minimum GREEN, then refactor.
- Update shared contracts and their tests before any consumer.
- Keep queue payloads to object IDs, versions, trigger, and timestamps; never store source documents, headers, cookies, authorization, database URLs, stack traces, or model input.
- The default source interval is exactly 1,800 seconds; accepted intervals are exactly 300 through 604,800 seconds.
- The scheduler scan period is 30 seconds, automatic reconciliation/enqueue batches are at most 100, the initial consumer concurrency is 1, the lease is 120 seconds, and the default maximum is 5 distinct executions.
- Retry base delays are exactly 60, 300, 900, and 3,600 seconds plus deterministic bounded jitter.
- `anon`, `authenticated`, browser admins, and `service_role` cannot directly mutate schedule, command, job, or event tables.
- `collection_queue_worker`, `collection_worker`, and `collection_schedule_admin` remain separate `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS` roles; none gains canonical-intelligence DML or direct BFF table DML.
- Every schedule/job mutation and its append-only event or command receipt commit in the same short transaction.
- Do not hold a database transaction open during DNS, HTTP, Feed parsing, hashing, Collector persistence, sleep, or model work.
- Do not modify an already-applied migration; add `supabase/migrations/20260813000900_durable_collection_queue.sql`.
- Database shape changes include migration tests, generated types, and repository/RLS coverage in this plan.
- `pnpm test:db` and `pnpm verify:full` reset the explicitly local disposable Supabase database; never point them at shared, staging, or production data.
- Do not add AI calls, Candidate/Evidence records, Promotion Service, canonical writes, audit/outbox, complex cron expressions, external queue infrastructure, priority scheduling, or the final product UI.

---

## Planned File Map

### Test discovery baseline

- Create `packages/contracts/vitest.config.ts`, `packages/domain/vitest.config.ts`, and `packages/database/vitest.config.ts` to include only `src/**/*.test.ts` and prevent compiled `dist` tests from running twice.

### Contracts

- Create `packages/contracts/src/queue/durable-collection-queue.ts` for queue states/events, job payload, schedule commands, results, and stable errors.
- Create `packages/contracts/src/queue/durable-collection-queue.test.ts` for strict schema and boundary tests.
- Modify `packages/contracts/src/index.ts` to export the new canonical contracts.

### Domain

- Create `packages/domain/src/queue/schedule-policy.ts` and its test for eligibility, intervals, deterministic jitter, and next-run calculation.
- Create `packages/domain/src/queue/retry-policy.ts` and its test for result classification, attempt numbering, retry delay, and Collector idempotency keys.
- Modify `packages/domain/src/index.ts` to export only pure queue policies.

### Database

- Create `supabase/migrations/20260813000900_durable_collection_queue.sql` for enums, schedules, command receipts, schedule events, durable jobs/events, roles, functions, RLS, indexes, and health read model.
- Create `supabase/tests/009_durable_collection_queue.test.sql` for schema, grants, RLS, state/history, automatic scheduling, command, claim/fence, retry, dead-letter, cancellation, and health behavior.
- Modify `packages/database/src/generated/database.types.ts` only through `pnpm db:types`.
- Create `packages/database/src/queue/types.ts` for repository ports and mapped domain records.
- Create `packages/database/src/queue/durable-queue-repository.ts` for scheduler and consumer operations.
- Create `packages/database/src/queue/schedule-command-repository.ts` for protected command execution.
- Create `packages/database/src/queue/worker-entry.ts` and `packages/database/src/queue/admin-entry.ts` as separated server-only exports.
- Create `packages/database/src/queue/browser-denied.ts` and add conditional exports in `packages/database/package.json`.
- Create unit and real-database tests under `packages/database/src/tests/`.

### Web

- Create `apps/web/src/lib/authenticated-user.ts` for Supabase bearer-token verification behind an injected interface.
- Create `apps/web/src/lib/source-schedule-command-handler.ts` for header/body validation and shared envelopes.
- Create `apps/web/src/app/api/v1/admin/source-collection-schedules/[scheduleId]/route.ts` as the thin composition Route Handler.
- Create focused contract tests under `apps/web/src/tests/source-schedule-command.test.ts`.
- Modify `apps/web/src/lib/server-env.ts` and `apps/web/package.json` for server-only queue-admin configuration and imports.

### Worker

- Create `apps/worker/src/queue/ports.ts` for scheduler, consumer, lease, clock, timer, logger, and Collector ports.
- Create `apps/worker/src/queue/run-scheduler.ts` for one scan and the stoppable 30-second loop.
- Create `apps/worker/src/queue/process-collection-job.ts` for preflight eligibility, lease renewal, Collector invocation, and fenced terminal action.
- Create `apps/worker/src/queue/run-consumer.ts` for concurrency-one claims and bounded idle polling.
- Create `apps/worker/src/queue/create-queue-runtime.ts` for postgres.js composition and environment validation.
- Create tests next to the queue code under `apps/worker/src/queue/tests/`.
- Refactor `apps/worker/src/index.ts` into an injected runtime lifecycle without changing the existing health envelope.

### Documentation and tracking

- Create `docs/tasks/durable-collection-queue-workbook.md` and update it after every accepted task.
- Modify `README.md`, `docs/architecture/phase-2-source-collection.md`, and `docs/runbooks/local-development.md` for automatic scheduling, configuration names, startup/shutdown, and safe verification.

---

### Task 1: Make Library Test Discovery Source-Only

**Files:**
- Create: `packages/contracts/vitest.config.ts`
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/database/vitest.config.ts`
- Test: existing library test suites

**Interfaces:**
- Consumes: Vitest package-local execution through each existing `test` script.
- Produces: exactly one discovery of each `src/**/*.test.ts` file regardless of existing `dist/` artifacts.

- [ ] **Step 1: Prove the current duplicate-discovery regression**

Run after existing builds are present:

```bash
pnpm --filter @airdrop/contracts test
pnpm --filter @airdrop/domain test
pnpm --filter @airdrop/database test
```

Expected RED evidence: contracts reports 6 files rather than 3, domain reports 8 rather than 4, and database reports 12 rather than 6 because both `src` and `dist` tests are collected.

- [ ] **Step 2: Add explicit package test includes**

Create the same focused configuration in all three library packages:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Verify one source discovery and all existing behavior**

Run:

```bash
pnpm --filter @airdrop/contracts test
pnpm --filter @airdrop/domain test
pnpm --filter @airdrop/database test
pnpm --filter @airdrop/contracts typecheck
pnpm --filter @airdrop/domain typecheck
pnpm --filter @airdrop/database typecheck
```

Expected GREEN: 3 contracts files, 4 domain files, and 6 database files are discovered; existing integration tests remain explicitly skipped when their three required local database variables are absent.

- [ ] **Step 4: Commit the test baseline**

```bash
git add packages/contracts/vitest.config.ts packages/domain/vitest.config.ts packages/database/vitest.config.ts
git commit -m "test: isolate source test discovery"
```

---

### Task 2: Add Durable Queue and Schedule Contracts

**Files:**
- Create: `packages/contracts/src/queue/durable-collection-queue.ts`
- Create: `packages/contracts/src/queue/durable-collection-queue.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `docs/tasks/durable-collection-queue-workbook.md`

**Interfaces:**
- Consumes: `createJobEnvelopeSchema()` and the shared API envelope types.
- Produces:

```ts
durableJobStateSchema
durableJobEventTypeSchema
sourceScheduleCommandTypeSchema
collectionJobTriggerSchema
queueResultCodeSchema
scheduledCollectSourcePayloadSchema
scheduledCollectSourceJobSchema
sourceScheduleCommandSchema
sourceScheduleCommandResultSchema
claimedCollectionJobSchema
queueHealthSnapshotSchema
```

- [ ] **Step 1: Write strict failing contract tests**

Cover the exact happy path and rejection of unknown fields, invalid UUIDs/timestamps, version other than 1, interval 299/604801, idempotency keys that are blank or longer than 255, payload content fields, and illegal enums. The representative test must include:

```ts
const payload = {
  projectId,
  sourceId,
  scheduleId,
  scheduleVersion: 3,
  collectionRuleVersion: 'collection-v1',
  trigger: 'scheduled',
  scheduledFor: '2026-08-13T12:00:00.000Z',
};

expect(scheduledCollectSourcePayloadSchema.parse(payload)).toEqual(payload);
expect(() => scheduledCollectSourcePayloadSchema.parse({ ...payload, rawText: '<html />' })).toThrow();
```

Define schedule command input as:

```ts
{
  version: 1;
  command: 'pause' | 'resume' | 'change_interval' | 'collect_now';
  expectedVersion: number;
  intervalSeconds: number | null;
}
```

Require `intervalSeconds` only for `change_interval`, and require it to be null for the other three commands.

- [ ] **Step 2: Run the contract RED**

Run:

```bash
pnpm --filter @airdrop/contracts test -- src/queue/durable-collection-queue.test.ts
```

Expected: FAIL because `durable-collection-queue.ts` and its exports do not exist.

- [ ] **Step 3: Implement the schemas and inferred types**

Use `.strict()` on every object. Use these exact enums:

```ts
export const durableJobStateSchema = z.enum([
  'queued', 'leased', 'retry_wait', 'succeeded', 'dead_letter', 'canceled',
]);
export const durableJobEventTypeSchema = z.enum([
  'enqueued', 'claimed', 'lease_renewed', 'lease_expired',
  'retry_scheduled', 'succeeded', 'dead_lettered', 'canceled',
]);
export const sourceScheduleCommandTypeSchema = z.enum([
  'pause', 'resume', 'change_interval', 'collect_now',
]);
export const collectionJobTriggerSchema = z.enum(['scheduled', 'manual']);
```

Bound Worker IDs and result/detail strings to 255/100/500 characters. `claimedCollectionJobSchema` must expose job identity, payload, execution attempt, delivery count, lease owner, lease epoch, and lease expiry, but not internal SQL or credentials. `queueHealthSnapshotSchema` exposes counts and nullable oldest runnable age seconds only.

- [ ] **Step 4: Export and verify the canonical contracts**

Run:

```bash
pnpm --filter @airdrop/contracts lint
pnpm --filter @airdrop/contracts typecheck
pnpm --filter @airdrop/contracts test
```

Expected: PASS with one new source test file and no duplicate `dist` discovery.

- [ ] **Step 5: Create the workbook and commit**

Create `docs/tasks/durable-collection-queue-workbook.md` with Tasks 1–9 and statuses `READY`, `IN_PROGRESS`, `REVIEW`, `DONE`; record Task 1 and Task 2 RED/GREEN commands and exact commits as they become available.

```bash
git add packages/contracts/src/queue packages/contracts/src/index.ts docs/tasks/durable-collection-queue-workbook.md
git commit -m "feat(contracts): add durable collection queue contracts"
```

---

### Task 3: Implement Pure Scheduling and Retry Policies

**Files:**
- Create: `packages/domain/src/queue/schedule-policy.ts`
- Create: `packages/domain/src/queue/schedule-policy.test.ts`
- Create: `packages/domain/src/queue/retry-policy.ts`
- Create: `packages/domain/src/queue/retry-policy.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `docs/tasks/durable-collection-queue-workbook.md`

**Interfaces:**
- Consumes: `SourceStatus`, `CollectionOutcome`, `CollectionJobTrigger`, and queue result-code types from `@airdrop/contracts`.
- Produces:

```ts
export const DEFAULT_COLLECTION_INTERVAL_SECONDS = 1_800;
export const MIN_COLLECTION_INTERVAL_SECONDS = 300;
export const MAX_COLLECTION_INTERVAL_SECONDS = 604_800;
export const DEFAULT_MAX_COLLECTION_ATTEMPTS = 5;

export function isAutomaticCollectionEligible(input: EligibilityInput): boolean;
export function assertCollectionInterval(seconds: number): number;
export function deterministicJitterSeconds(input: JitterInput): number;
export function calculateNextRunAt(input: NextRunInput): Date;
export function classifyCollectionOutcome(outcome: CollectionOutcome):
  | 'succeeded' | 'retry' | 'dead_letter';
export function retryDelaySeconds(input: RetryDelayInput): number;
export function collectorIdempotencyKey(jobId: string, executionAttempt: number): string;
```

- [ ] **Step 1: Write failing eligibility and schedule tests**

Use table-driven cases for all source statuses, missing official/verification fields, disabled schedules, interval boundaries, stable jitter, and catch-up coalescing. The eligibility shape is:

```ts
export interface EligibilityInput {
  readonly enabled: boolean;
  readonly projectLifecycle: ProjectLifecycle;
  readonly sourceStatus: SourceStatus;
  readonly isOfficial: boolean;
  readonly verifiedAt: string | null;
  readonly verifiedBy: string | null;
}
```

Assert the same `(projectId, sourceId, logicalWindow)` always returns the same jitter; different identities produce values within `0..min(300, floor(intervalSeconds / 10))`.

- [ ] **Step 2: Write failing retry and idempotency tests**

Assert:

```text
stored_new_content, not_modified, unchanged_content -> succeeded
timeout, http_error, persistence_failed -> retry
rejected_url, rejected_dns_target, redirect_rejected,
unsupported_content_type, invalid_text_encoding,
response_too_large, invalid_feed -> dead_letter
discovered_only, body_fetch_budget_exhausted -> dead_letter as unexpected top-level outcomes
```

Assert retry base steps `60, 300, 900, 3600`, maximum-attempt terminal behavior, same attempt key on delivery replay, and different key when execution attempt advances.

- [ ] **Step 3: Run the domain RED**

```bash
pnpm --filter @airdrop/domain test -- src/queue/schedule-policy.test.ts src/queue/retry-policy.test.ts
```

Expected: FAIL on missing modules and exports.

- [ ] **Step 4: Implement deterministic pure rules**

Use FNV-1a 32-bit over `new TextEncoder().encode(`${projectId}|${sourceId}|${scheduledFor}`)`, with `Math.imul` and unsigned normalization after every multiplication. The jitter bound is `Math.min(300, Math.floor(intervalSeconds / 10))` and the result is `hash % (bound + 1)`. Do not use `Math.random()` or read the wall clock inside the policy. `calculateNextRunAt` returns exactly `now + intervalSeconds`; job availability is `now + deterministicJitterSeconds(...)`. Throw a domain-specific `CollectionIntervalError` with code `invalid_collection_interval` outside the exact range.

Generate Collector keys in the bounded form:

```ts
`queue:${jobId}:attempt:${executionAttempt}`
```

Validate the UUID and positive integer before returning it.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @airdrop/domain lint
pnpm --filter @airdrop/domain typecheck
pnpm --filter @airdrop/domain test
git add packages/domain/src/queue packages/domain/src/index.ts docs/tasks/durable-collection-queue-workbook.md
git commit -m "feat(domain): add collection scheduling policies"
```

---

### Task 4: Add the Queue Schema, RLS, Roles, and Database Functions

**Files:**
- Create: `supabase/migrations/20260813000900_durable_collection_queue.sql`
- Create: `supabase/tests/009_durable_collection_queue.test.sql`
- Modify generated: `packages/database/src/generated/database.types.ts`
- Modify: `docs/tasks/durable-collection-queue-workbook.md`

**Interfaces:**
- Consumes: existing `projects`, `sources`, `project_sources`, `profiles`, `user_roles`, and `public.has_active_role()`.
- Produces database types/tables and narrow functions:

```sql
public.reconcile_due_source_schedules(now_at timestamptz, batch_limit integer)
public.claim_collection_jobs(worker_id text, now_at timestamptz, batch_limit integer)
public.renew_collection_job_lease(job_id uuid, worker_id text, lease_epoch bigint, now_at timestamptz)
public.complete_collection_job(job_id uuid, worker_id text, lease_epoch bigint, result_code text, now_at timestamptz)
public.retry_collection_job(job_id uuid, worker_id text, lease_epoch bigint, result_code text, detail text, available_at timestamptz, now_at timestamptz)
public.dead_letter_collection_job(job_id uuid, worker_id text, lease_epoch bigint, result_code text, detail text, now_at timestamptz)
public.cancel_collection_job(job_id uuid, worker_id text, lease_epoch bigint, result_code text, now_at timestamptz)
public.is_source_collection_eligible(project_id uuid, source_id uuid)
public.execute_source_schedule_command(actor_id uuid, schedule_id uuid, command_payload jsonb, idempotency_key text, input_hash text, now_at timestamptz)
public.collection_queue_health(now_at timestamptz)
```

- [ ] **Step 1: Write the pgTAP schema and principal-matrix RED**

The test plan must assert exact enum values/order; columns, nullability, defaults, foreign keys, uniqueness, indexes, functions, security-definer `search_path`, `NOLOGIN/NOINHERIT/NOBYPASSRLS` queue role, RLS enabled/forced, table ACLs, function execute ACLs, and append-only triggers.

Include principals for database owner, anonymous, authenticated owner, authenticated non-owner, browser admin, service role, `collection_worker`, `collection_queue_worker`, and `collection_schedule_admin`. Explicitly prove `service_role` cannot insert/update/delete schedules/jobs/events, the queue role cannot write projects/sources/signals/scores, and the schedule-admin role can execute only the protected command function without direct table DML.

- [ ] **Step 2: Run the migration RED against disposable local Supabase**

```bash
pnpm db:start
pnpm test:db
```

Expected: FAIL only because migration 009 objects and behavior are absent. If the local container runtime is unavailable, stop and use the repository-approved remote disposable Supabase acceptance path; do not weaken or skip the database gate.

- [ ] **Step 3: Implement enums and tables**

Create exact enums for job state, job event, schedule command, schedule event, trigger, and origin. Implement the four tables from the design with bounded checks. Use composite foreign keys so job project/source/schedule identity cannot cross aggregates. Add an immutable validation function for strict payload keys and normalized-column equality.

Implement append-only triggers for command receipts, schedule events, and job events. Schedules and jobs are mutable aggregates but may change only through narrow functions; revoke direct table DML from every exposed/app role.

- [ ] **Step 4: Implement automatic reconciliation atomically**

`reconcile_due_source_schedules` must:

1. validate `batch_limit` in `1..100`;
2. obtain `pg_try_advisory_xact_lock` on a fixed queue scheduler namespace;
3. insert at most 100 missing schedules for currently eligible official relationships with `next_run_at = now_at`, making them due in the same scan;
4. cancel queued/retry-wait jobs for newly ineligible schedules without enabling manually paused schedules;
5. lock at most 100 due eligible schedules with `FOR UPDATE SKIP LOCKED`;
6. insert one unique scheduled job per consumed `next_run_at`;
7. set the job `available_at` to `now_at + deterministic jitter`, then update `last_enqueued_at`, set `next_run_at` exactly to `now_at + interval_seconds`, and advance schedule version/monotonic timestamp;
8. append schedule/job events in the same transaction;
9. return created schedule count, enqueued count, canceled count, and whether the advisory lock was acquired.

Implement the same FNV-1a algorithm in SQL over `convert_to(project_id::text || '|' || source_id::text || '|' || scheduled_for_text, 'UTF8')`, iterating `get_byte`, applying 32-bit modulo after multiplication by `16777619`, and using the same bound/modulus formula. Store fixed TypeScript/SQL conformance vectors in both test suites.

- [ ] **Step 5: Implement fenced delivery functions**

Claim must first recover expired leases with `lease_expired` events, then lease due queued/retry-wait rows using `FOR UPDATE SKIP LOCKED`. Use 120-second expiry. Increment `execution_attempt` only when claiming queued initial work or work returned from `retry_wait`; do not increment it when redelivering a recovered expired lease. Increment `delivery_count` and `lease_epoch` for every delivery.

Renew/complete/retry/dead-letter/cancel must match exact job, owner, `leased` state, unexpired lease, and lease epoch. Return zero rows or a stable fenced error on stale ownership. Each transition clears lease fields, updates the aggregate version/timestamps, and appends its event atomically.

- [ ] **Step 6: Implement protected administrator commands**

`execute_source_schedule_command` must verify `actor_id` has an active `admin` grant, validate the strict JSON payload and input hash, lock the schedule, replay an identical prior receipt, reject key/input mismatch, enforce `expectedVersion`, apply pause/resume/change/collect-now semantics, append the command receipt and schedule/job events, and return a strict result row. `collect_now` rejects current ineligibility, advances schedule version while preserving the recurring cursor, and keys its manual job from the command receipt. Only `collection_schedule_admin` may execute the function; the repository transaction first executes `set local role collection_schedule_admin`. No browser role receives execute permission.

Create `is_source_collection_eligible` as a stable server-only boolean read for `collection_queue_worker`. It applies the same active-source and verified-official relationship conditions as collection context loading but returns no URL or authority-domain data.

- [ ] **Step 7: Complete pgTAP behavior coverage and reach GREEN**

Add behavioral assertions for default automatic 1,800-second schedule, min/max intervals, sticky pause, prompt resume, one catch-up job, duplicate scan, two claims, lease renewal/fence, expiry recovery, retry attempt progression, terminal dead letter, cancellation, command replay/conflict/version conflict, health counts, and history immutability.

```bash
pnpm test:db
```

Expected: all existing files plus `009_durable_collection_queue.test.sql` pass with no skipped assertions.

- [ ] **Step 8: Regenerate types and verify reproducibility**

```bash
pnpm db:types
git diff --exit-code packages/database/src/generated/database.types.ts
```

The second command is run after a second generation pass; it must exit 0.

- [ ] **Step 9: Commit the database boundary**

```bash
git add supabase/migrations/20260813000900_durable_collection_queue.sql \
  supabase/tests/009_durable_collection_queue.test.sql \
  packages/database/src/generated/database.types.ts \
  docs/tasks/durable-collection-queue-workbook.md
git commit -m "feat(db): add durable collection queue"
```

---

### Task 5: Add Typed Scheduler and Queue Repositories

**Files:**
- Create: `packages/database/src/queue/types.ts`
- Create: `packages/database/src/queue/durable-queue-repository.ts`
- Create: `packages/database/src/queue/worker-entry.ts`
- Create: `packages/database/src/queue/browser-denied.ts`
- Create: `packages/database/src/tests/durable-queue-repository.test.ts`
- Create: `packages/database/src/tests/durable-queue-repository.integration.test.ts`
- Modify: `packages/database/package.json`
- Modify: `packages/database/src/tests/entrypoints.test.ts`
- Modify: `packages/database/src/tests/integration-preflight.test.ts`
- Modify: `docs/tasks/durable-collection-queue-workbook.md`

**Interfaces:**
- Consumes: generated migration-009 functions and queue contracts.
- Produces:

```ts
export interface DurableCollectionQueueRepository {
  reconcile(now: Date, batchLimit: number): Promise<ReconcileResult>;
  claim(workerId: string, now: Date, limit: number): Promise<readonly ClaimedCollectionJob[]>;
  renew(fence: LeaseFence, now: Date): Promise<Date>;
  succeed(fence: LeaseFence, resultCode: QueueResultCode, now: Date): Promise<void>;
  retry(fence: LeaseFence, result: QueueFailure, availableAt: Date, now: Date): Promise<void>;
  deadLetter(fence: LeaseFence, result: QueueFailure, now: Date): Promise<void>;
  cancel(fence: LeaseFence, resultCode: 'source_ineligible', now: Date): Promise<void>;
  health(now: Date): Promise<QueueHealthSnapshot>;
  isEligible(projectId: string, sourceId: string): Promise<boolean>;
}
```

- [ ] **Step 1: Write unit REDs against an injected query port**

Test strict row parsing, stable error mapping, no human-message branching, batch bounds, fence parameter forwarding, UTC serialization, eligibility reads, and browser entry denial. The repository constructor must accept a small injected `QueueFunctionClient` in unit tests and postgres.js in production.

- [ ] **Step 2: Run the repository RED**

```bash
pnpm --filter @airdrop/database test -- src/tests/durable-queue-repository.test.ts
```

Expected: FAIL because queue repository modules and package export do not exist.

- [ ] **Step 3: Implement the typed repository and export boundary**

Expose `@airdrop/database/collection-queue-worker` with a browser condition pointing to `browser-denied.ts`. Production construction creates postgres.js with `max: 2`, `idle_timeout: 20`, and `connect_timeout: 5`; every operation runs a short transaction, executes `set local role collection_queue_worker`, and invokes only the migration functions.

Map all unexpected SQL/parse failures to `DurableQueuePersistenceError` with code `queue_persistence_failed`; map stale fences to `LeaseFenceError` with code `lease_fence_lost`.

- [ ] **Step 4: Add real database integration RED/GREEN**

Cover two concurrent claims using separate connections, duplicate reconciliation, expired lease recovery preserving execution attempt, intentional retry advancing it, stale completion rejection, health mapping, and rollback on invalid event transition. Add the file to `test:integration`; it must never silently skip under the explicit integration command.

```bash
pnpm --filter @airdrop/database test
pnpm --filter @airdrop/database test:integration
```

Expected local unit GREEN; explicit integration GREEN with all required local database environment values and zero skipped tests.

- [ ] **Step 5: Verify package gates and commit**

```bash
pnpm --filter @airdrop/database lint
pnpm --filter @airdrop/database typecheck
pnpm --filter @airdrop/database test
git add packages/database docs/tasks/durable-collection-queue-workbook.md
git commit -m "feat(database): add durable queue repository"
```

---

### Task 6: Add Schedule Command Repository and Protected Admin API

**Files:**
- Create: `packages/database/src/queue/schedule-command-repository.ts`
- Create: `packages/database/src/queue/admin-entry.ts`
- Create: `packages/database/src/tests/schedule-command-repository.test.ts`
- Create: `packages/database/src/tests/schedule-command-repository.integration.test.ts`
- Modify: `packages/database/package.json`
- Create: `apps/web/src/lib/authenticated-user.ts`
- Create: `apps/web/src/lib/source-schedule-command-handler.ts`
- Create: `apps/web/src/app/api/v1/admin/source-collection-schedules/[scheduleId]/route.ts`
- Create: `apps/web/src/tests/source-schedule-command.test.ts`
- Modify: `apps/web/src/lib/server-env.ts`
- Modify: `apps/web/package.json`
- Modify: `.env.example`
- Modify: `docs/tasks/durable-collection-queue-workbook.md`

**Interfaces:**
- Consumes: schedule command contracts and `execute_source_schedule_command`.
- Produces:

```ts
export interface ScheduleCommandRepository {
  execute(input: ExecuteScheduleCommandInput): Promise<SourceScheduleCommandResult>;
}

export interface AuthenticatedUserVerifier {
  verifyAuthorizationHeader(value: string | null): Promise<{ userId: string } | null>;
}

export function createSourceScheduleCommandHandler(deps: {
  auth: AuthenticatedUserVerifier;
  schedules: ScheduleCommandRepository;
  ids: { generate(): string };
}): (request: Request, context: { params: Promise<{ scheduleId: string }> }) => Promise<Response>;
```

- [ ] **Step 1: Write database command-repository REDs**

Test exact input hashing over canonical JSON, actor/schedule/idempotency forwarding, strict result mapping, and these error mappings:

```text
schedule_version_conflict -> HTTP-layer 409 code schedule_version_conflict
idempotency_conflict -> HTTP-layer 409 code idempotency_conflict
schedule_not_found -> HTTP-layer 404 code schedule_not_found
admin_required -> HTTP-layer 403 code admin_required
unexpected SQL -> schedule_command_persistence_failed
```

- [ ] **Step 2: Implement the server-only admin repository**

Expose `@airdrop/database/schedule-admin` with browser denial. Use a dedicated postgres.js connection configured from `AIRDROP_QUEUE_ADMIN_DATABASE_URL`; the underlying login receives only execute on the command function and cannot perform direct table DML. Never accept a service-role key as a queue mutation credential.

- [ ] **Step 3: Write Web handler REDs**

Use injected fake auth/repository dependencies. Cover missing/malformed bearer header (401), non-user token (401), missing/blank/overlong `Idempotency-Key` (400), invalid UUID/body/unknown field (400), repository 403/404/409 mapping, success shared envelope, and generated request IDs. Assert the response never echoes authorization or database details.

Representative call:

```ts
const request = new Request(`http://localhost/api/v1/admin/source-collection-schedules/${scheduleId}`, {
  method: 'POST',
  headers: {
    authorization: 'Bearer local-test-token',
    'content-type': 'application/json',
    'idempotency-key': 'pause-schedule-1',
  },
  body: JSON.stringify({
    version: 1,
    command: 'pause',
    expectedVersion: 4,
    intervalSeconds: null,
  }),
});
```

- [ ] **Step 4: Implement bearer verification and the thin Route Handler**

Use `createClient` from a direct `@supabase/supabase-js` Web dependency with `persistSession`, `autoRefreshToken`, and `detectSessionInUrl` all disabled. Configure it with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, pass only the bearer token to `auth.getUser(token)`, and return only the user ID. The handler validates all inputs and delegates admin authorization to the protected database function. Route composition may cache server clients/pools at module scope but tests use the injected handler directly.

- [ ] **Step 5: Run Web and database GREEN**

```bash
pnpm --filter @airdrop/database test -- src/tests/schedule-command-repository.test.ts
pnpm --filter @airdrop/web lint
pnpm --filter @airdrop/web typecheck
pnpm --filter @airdrop/web test
pnpm --filter @airdrop/web build
```

Expected: all pass; no schedule or queue primitive appears in the browser-safe root database export.

- [ ] **Step 6: Run real command integration and commit**

Run the explicit database integration suite with the local disposable topology and prove real pause/replay/conflict/resume/interval/collect-now behavior through the protected function.

```bash
git add packages/database apps/web .env.example docs/tasks/durable-collection-queue-workbook.md
git commit -m "feat(web): add source schedule commands"
```

---

### Task 7: Implement Scheduler and Collection Job Processing

**Files:**
- Create: `apps/worker/src/queue/ports.ts`
- Create: `apps/worker/src/queue/run-scheduler.ts`
- Create: `apps/worker/src/queue/process-collection-job.ts`
- Create: `apps/worker/src/queue/tests/run-scheduler.test.ts`
- Create: `apps/worker/src/queue/tests/process-collection-job.test.ts`
- Modify: `docs/tasks/durable-collection-queue-workbook.md`

**Interfaces:**
- Consumes: `DurableCollectionQueueRepository`, domain retry policies, `CollectSourceJob`, and the existing Collector `collect()` method.
- Produces:

```ts
export interface CollectionJobProcessor {
  process(job: ClaimedCollectionJob, signal: AbortSignal): Promise<void>;
}

export function createScheduler(deps: SchedulerDependencies): {
  scanOnce(): Promise<ReconcileResult>;
  run(signal: AbortSignal): Promise<void>;
};

export function createCollectionJobProcessor(deps: ProcessorDependencies): CollectionJobProcessor;
```

- [ ] **Step 1: Write scheduler REDs with fake time**

Test immediate startup `scanOnce`, 30-second subsequent ticks, batch 100, advisory-lock-not-acquired as a successful no-op, bounded persistence-error log, and AbortSignal stopping before another scan. The logger record may contain counts and duration but no payload or URL.

- [ ] **Step 2: Write processing REDs**

Cover pre-network `isEligible`; `source_ineligible` cancellation with zero Collector calls; exact `collectorIdempotencyKey(job.id, executionAttempt)`; success; retry delay; immediate dead letter; fifth retryable execution dead letter; lease renewal while Collector is pending; lease loss causing no terminal confirmation; and sanitized structured logs.

The injected Collector port is:

```ts
export interface SourceCollectorPort {
  collect(job: CollectSourceJob): Promise<CollectSourceResult>;
}
```

The processor constructs the existing strict envelope with `jobId` equal to durable job ID, deterministic Collector key, a generated correlation ID, current occurred-at time, and only project/source payload accepted by the existing Collector.

- [ ] **Step 3: Run Worker RED**

```bash
pnpm --filter @airdrop/worker test -- src/queue/tests/run-scheduler.test.ts src/queue/tests/process-collection-job.test.ts
```

Expected: FAIL because queue Worker modules are absent.

- [ ] **Step 4: Implement scheduler and fenced processor**

Use injected `Clock`, `Timer`, `Ids`, `QueueLogger`, repository, and Collector. Do not import `process`, postgres.js, or environment values in these two use-case files. Run lease renewal every 40 seconds for the 120-second lease; latch the first renewal failure, abort future controlled work, and never call success/retry/dead-letter after the fence is lost.

Only `stored_new_content`, `not_modified`, and `unchanged_content` succeed. Use domain classification for all other outcomes. `source_ineligible` is created by processor preflight and is never passed to Collector.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @airdrop/worker lint
pnpm --filter @airdrop/worker typecheck
pnpm --filter @airdrop/worker test
git add apps/worker/src/queue docs/tasks/durable-collection-queue-workbook.md
git commit -m "feat(worker): process scheduled collection jobs"
```

---

### Task 8: Add the Consumer Loop and Activate the Queue Runtime

**Files:**
- Create: `apps/worker/src/queue/run-consumer.ts`
- Create: `apps/worker/src/queue/create-queue-runtime.ts`
- Create: `apps/worker/src/queue/index.ts`
- Create: `apps/worker/src/queue/tests/run-consumer.test.ts`
- Create: `apps/worker/src/queue/tests/create-queue-runtime.test.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/src/tests/health.test.ts`
- Modify: `apps/worker/package.json`
- Modify: `.env.example`
- Modify: `docs/tasks/durable-collection-queue-workbook.md`

**Interfaces:**
- Consumes: scheduler, processor, queue repository, `createSourceCollector()`, and Worker health transitions.
- Produces:

```ts
export interface QueueRuntimeOptions {
  readonly queueDatabaseUrl: string;
  readonly collectionDatabaseUrl: string;
  readonly collectionUserAgent: string;
  readonly workerId: string;
}

export function createQueueRuntime(options: QueueRuntimeOptions): {
  start(): Promise<void>;
  stop(): Promise<void>;
};
```

- [ ] **Step 1: Write consumer-loop REDs**

Test one claim at a time, no second claim while processing is pending, immediate next claim after completion, bounded 1-second idle wait when empty, abort stopping idle wait, claim persistence failure using bounded backoff, and processor failure not crashing the loop after the processor has already recorded/left recoverable state.

- [ ] **Step 2: Write composition and lifecycle REDs**

Test invalid/missing queue URL, collection URL, user agent, and Worker ID fail with `invalid_queue_runtime_configuration` without echoing values. Assert production composition creates separate queue and Collector pools. Extend the spawned Worker test to inject a fake runtime so `ready` occurs only after `start`, repeated signals call `stop` once, and exit waits for bounded asynchronous cleanup.

- [ ] **Step 3: Implement the concurrency-one consumer and composition root**

Create one postgres.js queue pool (`max: 2`, `idle_timeout: 20`, `connect_timeout: 5`) and one existing Collector pool. Compose scheduler and consumer under one AbortController. `start()` performs the first schedule scan before resolving ready and then runs both loops. `stop()` aborts new scans/claims, awaits the active processor up to a documented 30-second shutdown bound, closes Collector first and queue pool second, and is idempotent.

- [ ] **Step 4: Refactor the Worker entry safely**

Keep stdout health records limited to `starting`, `ready`, and `stopping`. Parse only these server environment names:

```text
AIRDROP_QUEUE_DATABASE_URL
AIRDROP_COLLECTION_DATABASE_URL
AIRDROP_COLLECTION_USER_AGENT
AIRDROP_QUEUE_WORKER_ID
```

Do not start automatic collection when configuration is absent in unit test imports. The production executable must fail closed with a bounded configuration error; tests invoke an exported `runWorker(runtime, ports)` function with fake dependencies.

- [ ] **Step 5: Run full Worker GREEN and build**

```bash
pnpm --filter @airdrop/worker lint
pnpm --filter @airdrop/worker typecheck
pnpm --filter @airdrop/worker test
pnpm --filter @airdrop/worker build
```

Expected: all scheduler, processor, consumer, composition, and existing signal lifecycle tests pass with no leaked timers or open pools.

- [ ] **Step 6: Commit runtime activation**

```bash
git add apps/worker .env.example docs/tasks/durable-collection-queue-workbook.md
git commit -m "feat(worker): activate automatic source collection"
```

---

### Task 9: End-to-End Verification, Documentation, and Exit Review

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/phase-2-source-collection.md`
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/tasks/durable-collection-queue-workbook.md`
- Modify only if a verified defect requires it: files from Tasks 2–8 plus corresponding regression tests

**Interfaces:**
- Consumes: the complete automatic scheduling and durable delivery slice.
- Produces: reproducible operational documentation, completed task evidence, and a clean accepted branch ready for the AI Run/Candidate design phase.

- [ ] **Step 1: Add a deterministic local end-to-end fixture test**

Using the local disposable database and injected fake HTTPS adapter, prove this sequence:

```text
eligible official relationship
-> default schedule reconciliation
-> scheduled durable job
-> claim with execution attempt 1
-> Collector commits immutable attempt/Raw Item
-> queue success + event
-> next schedule cursor equals scheduler time + 1,800 seconds
-> first job is already enqueued and its available_at equals scheduler time + the bounded deterministic jitter vector
```

Then simulate crash after Collector commit but before queue success, expire/recover the lease, and prove redelivery uses the same Collector key and performs zero additional HTTP.

- [ ] **Step 2: Run narrow package and database acceptance**

```bash
pnpm --filter @airdrop/contracts test
pnpm --filter @airdrop/domain test
pnpm --filter @airdrop/database test
pnpm --filter @airdrop/worker test
pnpm --filter @airdrop/web test
pnpm test:db
pnpm --filter @airdrop/database test:integration
```

Expected: all source tests pass; explicit database integration runs with zero skipped tests.

- [ ] **Step 3: Run sensitivity mutations one at a time and restore**

Temporarily make each production defect, run the named test to observe RED, then restore exactly before the next mutation:

```text
remove schedule eligibility verification -> pgTAP eligibility assertions fail
remove scheduled-job uniqueness          -> duplicate reconciliation integration fails
remove SKIP LOCKED                       -> concurrent claim integration fails or blocks its bound
ignore lease_epoch on completion         -> stale-fence test fails
increment attempt on lease recovery      -> crash-boundary replay test fails
allow rawText in job payload             -> contract payload-exclusion test fails
grant service_role job insert            -> pgTAP ACL/RLS matrix fails
start Collector inside reconcile txn     -> Worker transaction-boundary test fails
```

- [ ] **Step 4: Update operational documentation**

Document exact scope, the five server-only environment names without values, dedicated login/role provisioning, default 30-minute schedule, 5-minute to 7-day admin range, 30-second scanner, concurrency 1, lease/retry/dead-letter semantics, health snapshot, safe shutdown, targeted test commands, and the fact that `verify:full` resets only local disposable data.

State explicitly that automatic collection stores untrusted Raw Items and does not publish verified airdrop claims or bypass future Evidence/review/Promotion.

- [ ] **Step 5: Run the final repository gates**

Using Node.js 22 and pnpm 11.16.0:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm verify:full
pnpm db:types
git diff --exit-code packages/database/src/generated/database.types.ts
git diff --check
git status --short
```

Expected: every command exits 0; generated types are reproducible; only intended documentation/workbook changes remain before the final commit.

- [ ] **Step 6: Inspect security-sensitive matches**

```bash
rg -n "seed phrase|private key|mnemonic|authorization|cookie|rawText|DATABASE_URL|stack" \
  apps packages supabase docs README.md .env.example
```

Review every match. It must be a prohibition, strict test fixture, approved environment-variable name, existing Raw Item field inside the isolated Collector, or a bounded type—not a real value, logged secret, or queue payload field.

- [ ] **Step 7: Complete workbook and commit exit documentation**

Record every task's exact commit, RED/GREEN evidence, review findings, database test counts, sensitivity results, and acceptance commands. Mark a card `DONE` only after its checks pass.

```bash
git add README.md docs
git commit -m "docs: complete automatic collection queue"
```

---

## Final Review Checklist

- [ ] Test discovery runs each source test exactly once even after builds exist.
- [ ] Contracts are strict, version 1, and queue payloads contain no source document or credential.
- [ ] Eligibility requires active source plus verified official project-source provenance.
- [ ] Missing schedules are automatically created at the exact 1,800-second default.
- [ ] Administrator pauses remain sticky across eligibility reconciliation.
- [ ] Intervals accept exactly 300 through 604,800 seconds.
- [ ] Startup promptly coalesces overdue work and deterministic jitter avoids a burst.
- [ ] Scheduled uniqueness prevents duplicate logical jobs across scheduler instances.
- [ ] Claims use `FOR UPDATE SKIP LOCKED`, 120-second leases, and `(job, owner, epoch)` fencing.
- [ ] Crash redelivery keeps the execution attempt and Collector key; deliberate retry advances both.
- [ ] Retry classification and 60/300/900/3,600-second base delays match the domain policy.
- [ ] Source ineligibility cancels without DNS/HTTP and preserves all historical records.
- [ ] Schedule/job mutations and their events/receipts are atomic.
- [ ] Events and command receipts are append-only.
- [ ] Browser roles and `service_role` have no direct operational DML.
- [ ] Queue and Collector roles remain separate and cannot write canonical intelligence.
- [ ] Web commands require authentication, active admin authorization, idempotency, and expected version.
- [ ] Scheduler transactions never contain collection network work.
- [ ] Worker concurrency starts at 1 and shutdown is bounded, idempotent, and pool-safe.
- [ ] Logs, jobs, events, and errors contain no bodies, arbitrary headers, cookies, credentials, query strings, or stacks.
- [ ] Generated types, unit tests, pgTAP, real repository integration, builds, `pnpm verify`, and `pnpm verify:full` are fresh and GREEN.
- [ ] The branch contains no AI, Candidate/Evidence, Promotion, canonical write, audit/outbox, or final UI implementation.
