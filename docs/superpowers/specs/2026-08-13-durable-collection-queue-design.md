# Durable Collection Queue and Automatic Scheduling Design

**Status:** Approved in conversation on 2026-08-13

## 1. Purpose

This slice turns the dormant Phase 2 source collector into a reliably operated background capability. It adds PostgreSQL-backed automatic scheduling, durable at-least-once delivery, leases, bounded retry, dead-letter handling, administrative schedule commands, and worker lifecycle integration.

The slice does not add AI processing, Candidate or Evidence records, canonical intelligence writes, Promotion Service, audit/outbox, a complete administration interface, or the public airdrop intelligence experience. Collection output remains immutable untrusted source material. Later stages must still ground, review, and promote claims through the approved boundaries.

## 2. Approved Product Behavior

- Every eligible official source relationship receives an automatic schedule with a default 30-minute interval.
- An administrator can pause, resume, change the interval, or request one immediate collection without changing the recurring schedule.
- The allowed recurring interval is 5 minutes through 7 days.
- Worker startup promptly schedules eligible overdue sources. Deterministic jitter prevents a startup request burst.
- A source is eligible only when its project lifecycle and `sources.status` are both `active` and its `project_sources` relationship is official and has both verification time and verifier provenance.
- `degraded`, `suspended`, and `retired` sources do not produce new automatic jobs. Eligibility restoration resumes an enabled schedule but never overrides an administrator's manual pause.
- Disabling or invalidating a relationship preserves schedules, jobs, attempts, events, Raw Items, and collection history.

## 3. Architecture

```text
project_sources + sources
        |
        v
Source Schedule Repository <--- protected /api/v1 admin commands
        |
        v
Automatic Scheduler
        |
        v
PostgreSQL Durable Queue
        |
        v
Queue Consumer ----> existing createSourceCollector()
        |                         |
        |                         v
        |              collection_attempts / raw_items /
        |                    discovered_items
        v
Durable Job Events and Health Snapshot
```

`packages/contracts` owns versioned schedule commands, job payloads, results, states, events, and stable error codes. Queue payloads contain object references and versions, never source documents or credentials.

`packages/domain` owns pure eligibility, next-run, deterministic-jitter, retry-delay, and result-classification rules. It has no database, HTTP, queue, or framework dependency.

`packages/database` owns the forward-only migration, generated types, schedule command receipts, append-only schedule/job events, queue transactions, RLS, roles, repositories, and health read model.

`apps/worker` owns the scheduler loop, queue consumer loop, lease renewal, Collector invocation, bounded logs, and graceful shutdown. Scheduling only enqueues; it never performs collection inside a scheduling transaction.

`apps/web` owns authenticated, administrator-only `/api/v1` Route Handlers for operational schedule commands. Browser code never receives a database URL, service credential, queue mutation primitive, or collection-worker export.

## 4. Contracts

### 4.1 Queue payload

The only first-slice job type is `collect.source`. Its versioned payload contains:

```text
projectId
sourceId
scheduleId (nullable for a future non-scheduled producer, non-null in this slice)
scheduleVersion
collectionRuleVersion
trigger = scheduled | manual
scheduledFor
```

The durable row also stores normalized project, source, schedule, version, trigger, and timing columns for constraints and queries. A strict JSONB payload preserves the versioned contract but is not the only queryable representation.

The payload must not contain Raw Item text, Feed XML, article text, arbitrary URLs, request or response headers, cookies, authorization values, connection strings, stack traces, model input, or secrets.

### 4.2 Stable queue states

```text
queued
leased
retry_wait
succeeded
dead_letter
canceled
```

Allowed transitions are explicit:

```text
queued -> leased
retry_wait -> leased              when available_at is due
leased -> succeeded
leased -> retry_wait
leased -> dead_letter
queued | retry_wait -> canceled   on administrative or eligibility stop
leased -> queued                  when a lease expires
```

Terminal rows remain stored. No application role physically deletes succeeded, dead-lettered, or canceled jobs.

### 4.3 Stable events

Schedule events include `auto_created`, `paused`, `resumed`, and `interval_changed`. Job events include `enqueued`, `claimed`, `lease_renewed`, `lease_expired`, `retry_scheduled`, `succeeded`, `dead_lettered`, and `canceled`.

Every state mutation and its event commit in one transaction. Events are append-only and carry event time, job or schedule version, execution-attempt number where applicable, lease epoch where applicable, actor/worker identity, stable code, and a bounded non-sensitive detail.

### 4.4 Administrative commands

The supported commands are `pause`, `resume`, `change_interval`, and `collect_now`. Every HTTP mutation requires:

- an authenticated active `admin` role;
- `Idempotency-Key`;
- `expectedVersion` for the schedule aggregate;
- strict versioned input and shared API success/error envelopes.

The same actor, schedule, command type, and idempotency key returns the previously committed receipt. A reused key with different input fails with a stable idempotency-conflict code. A stale expected version returns HTTP 409 and never silently overwrites the schedule.

## 5. Data Model

One forward-only migration adds the following operational records.

### 5.1 `source_collection_schedules`

One row exists per `(project_id, source_id)` relationship.

```text
id uuid primary key
project_id uuid not null
source_id uuid not null
enabled boolean not null default true
enablement_origin automatic | manual
interval_seconds integer not null default 1800, check 300..604800
next_run_at timestamptz not null
last_enqueued_at timestamptz null
version bigint not null default 1, check > 0
created_at timestamptz not null
updated_at timestamptz not null
unique (project_id, source_id)
foreign key (project_id, source_id) -> project_sources on delete restrict
```

Material changes advance `version` and a strictly monotonic `updated_at`. No-op commands preserve both. `enabled = false` is a sticky manual pause and is never reversed by the automatic eligibility reconciler.

### 5.2 `source_schedule_commands`

This append-only table stores administrator command receipts and input hashes. It provides HTTP retry idempotency without using human-readable messages as behavior. It stores the actor, schedule, command type, bounded idempotency key, input hash, expected version, resulting version, stable result, and timestamp. It contains no session token or request headers.

### 5.3 `source_schedule_events`

This append-only history preserves automatic creation and administrator changes. Corrections append a new event; existing events cannot be updated or deleted by application roles.

### 5.4 `durable_jobs`

```text
id uuid primary key
job_type = collect.source
contract_version = 1
project_id uuid not null
source_id uuid not null
schedule_id uuid not null
schedule_version bigint not null
collection_rule_version text not null
trigger scheduled | manual
scheduled_for timestamptz not null
idempotency_key text unique not null
payload jsonb not null
payload_hash text not null
state durable_job_state not null
execution_attempt integer not null default 0
delivery_count integer not null default 0
max_attempts integer not null default 5
available_at timestamptz not null
lease_owner text null
lease_epoch bigint not null default 0
lease_expires_at timestamptz null
last_result_code text null
last_error_detail text null
created_at / updated_at / completed_at timestamptz
```

Constraints keep lease fields present only while leased, terminal completion timestamps present only for terminal states, attempt counts bounded by the maximum, payload identity equal to normalized identity, and text fields bounded. Scheduled-job uniqueness covers project, source, logical schedule window, schedule version, and collection rule version. Manual jobs use the administrator command receipt identity.

### 5.5 `durable_job_events`

This append-only table records every enqueue, delivery, lease renewal/recovery, retry, completion, dead letter, and cancellation. It never stores collected content, unbounded errors, or secrets.

### 5.6 Queue health read model

A server-only read function or view reports queued, retry-wait, leased, expired-lease, and dead-letter counts plus oldest runnable-job age. It exposes no payload body or error detail and is unavailable to browser roles.

## 6. Eligibility and Schedule Calculation

Eligibility is computed from current canonical catalog state and schedule state; it is not an AI decision.

```text
eligible =
  schedule.enabled
  and project.lifecycle = active
  and source.status = active
  and project_source.is_official
  and project_source.verified_at is not null
  and project_source.verified_by is not null
```

The scheduler performs a 30-second scan tick. One transaction obtains a transaction-scoped advisory lock, reconciles at most 100 eligible relationships missing schedules, and enqueues at most 100 due schedules. Every inserted job and the associated schedule advancement commit together.

Automatic schedule creation sets the first logical `next_run_at` to the current scheduler time, so the same startup scan immediately creates its first durable job. Jitter is applied to that job's `available_at`, not to whether it is durably enqueued. It is derived from stable project/source identity and the logical window, never from process-local randomness, and is bounded to prevent more than a small fraction of the configured interval from being delayed.

The deterministic algorithm is FNV-1a 32-bit over the UTF-8 bytes of `projectId|sourceId|scheduledFor`, using unsigned 32-bit multiplication. The jitter bound is `min(300, floor(intervalSeconds / 10))`; the offset is `hash mod (bound + 1)` seconds. TypeScript and SQL use the same conformance vectors.

An overdue source creates only one catch-up job per scan. Missed historical windows are coalesced instead of producing a request storm. After enqueue, `next_run_at` is exactly the current scheduler time plus the configured interval; the job's `available_at` is current scheduler time plus deterministic jitter. The job records the consumed logical `scheduled_for` value so repeated scanning produces the same unique identity.

If a source becomes ineligible, no new automatic job is created. Queued or retry-wait jobs are canceled during reconciliation. A leased job is not rewritten by the scheduler; immediately before DNS/HTTP, the consumer reloads eligibility. An ineligible task terminates as `canceled` with `source_ineligible` and performs no network request. Previously stored collection records remain unchanged.

## 7. Delivery, Leasing, and Idempotency

The queue provides at-least-once delivery. Exactly-once behavior is not claimed.

Claiming uses a short `FOR UPDATE SKIP LOCKED` transaction over due `queued` and `retry_wait` rows. It sets a two-minute lease, increments `delivery_count` and `lease_epoch`, records `claimed`, and returns strict job data. Initial execution sets `execution_attempt` to 1. A retryable collection result schedules the next distinct execution attempt; lease redelivery after a crash keeps the same execution-attempt number.

The Collector command idempotency key is deterministically derived from durable job ID and execution-attempt number. This distinction is required:

- a crash after the Collector commits but before the queue confirms causes lease redelivery with the same Collector key, so the existing committed result is replayed without another HTTP request;
- an intentional queue retry uses the next execution-attempt number, so a transient failure can perform a new collection request.

Lease ownership is fenced by `(job_id, lease_owner, lease_epoch)`. Renewal, success, retry, and dead-letter operations fail closed when the fence no longer matches. A stale worker cannot confirm a lease owned by another process.

The consumer renews an active lease before expiry. Collection may include one Feed and up to 20 sequential article requests, so lease renewal continues independently while the Collector is running. If renewal is lost, the consumer does not confirm the queue job. It stops before starting any later safe boundary it controls; already committed immutable collection history remains valid and redelivery relies on Collector idempotency.

Lease recovery atomically returns an expired leased job to `queued`, clears its owner/expiry, advances the lease epoch, and appends `lease_expired`. Recovery does not consume a new execution attempt.

## 8. Retry and Terminal Classification

The default maximum is five distinct collection executions. Retry delays are deterministic exponential steps of 1, 5, 15, and 60 minutes plus a small bounded identity-derived jitter.

Successful terminal Collector outcomes are `stored_new_content`, `not_modified`, and `unchanged_content`. Feed/article counts remain result metadata and do not change queue success semantics.

Retryable outcomes are `timeout`, `http_error`, and `persistence_failed`. They retry until the maximum is reached, then enter `dead_letter`.

Deterministic collection outcomes enter `dead_letter` immediately: `rejected_url`, `rejected_dns_target`, `redirect_rejected`, `unsupported_content_type`, `invalid_text_encoding`, `response_too_large`, and `invalid_feed`.

`source_ineligible`, an administrator pause, a retired/suspended source, or a lost official verification produces `canceled`, not dead letter. Process shutdown and lease loss do not manufacture a collection result; the lease remains available for recovery.

Human-readable detail is never used for branching. Stored detail is sanitized, bounded, and optional.

## 9. Administrative API

Route Handlers live under `/api/v1/admin/source-collection-schedules`. They authenticate the Supabase session, require an active `admin` role, validate strict shared contracts, require `Idempotency-Key`, and invoke a database service rather than mutating tables directly.

The server service has execute permission only on narrow schedule-command functions. Browser principals and browser administrators receive no direct schedule, command, job, event, or health-row DML. The command function independently verifies that the supplied actor has an active admin grant so a Route Handler bug cannot convert an ordinary user into an operational administrator.

`pause` disables the schedule and atomically cancels its queued/retry-wait jobs. `resume` enables it and sets the next logical run to command time so the following scheduler scan durably enqueues it with job-availability jitter. `change_interval` validates 300 through 604800 seconds and recalculates the next run from command time. `collect_now` requires current collection eligibility, creates one manual job, advances the aggregate version, and leaves the recurring cursor unchanged.

## 10. Database Roles and Trust Boundaries

The migration creates a `collection_queue_worker` `NOLOGIN` role with no password. Deployment provisions a separate login that may `SET ROLE collection_queue_worker`. Its privileges are limited to the queue/schedule functions and required server-only health read.

The migration also creates a `collection_schedule_admin` `NOLOGIN` role with no password. A separate server-only BFF login may `SET ROLE collection_schedule_admin`; that role may execute only the schedule-command function. The function independently verifies the authenticated actor's active `admin` grant. The role receives no direct schedule/job table DML and no canonical-intelligence DML.

The existing `collection_worker` continues to own only source-collection persistence. It gains no schedule or durable-job mutation privilege. The queue runtime and Collector therefore use separate server-only connection configuration:

- `AIRDROP_QUEUE_DATABASE_URL`
- `AIRDROP_COLLECTION_DATABASE_URL`
- `AIRDROP_COLLECTION_USER_AGENT`
- `AIRDROP_QUEUE_WORKER_ID`
- `AIRDROP_QUEUE_ADMIN_DATABASE_URL` (web BFF only)

Values are never logged, committed, sent to browsers, stored in jobs, or returned in errors. A deployment may use one login for the two Worker pools only if it has explicitly provisioned membership in both narrow Worker roles; the application still keeps the pools and role boundaries separate. The BFF schedule-admin login remains separate from Worker logins.

`anon`, `authenticated`, browser admins, and `service_role` receive no table DML that bypasses the approved functions. The queue role cannot write projects, sources, project-source verification, signals, scores, future Evidence, or other canonical intelligence.

## 11. Worker Runtime

The Worker composition root validates configuration, creates the scheduler repository, queue repository, existing Collector, clock, IDs, and bounded logger, then starts:

- one scheduler loop with a 30-second tick;
- one queue-consumer loop with initial concurrency 1;
- lease renewal for the active delivery;
- bounded idle polling when no runnable job exists.

The scheduler and consumer do not share an open database transaction. No database transaction remains open during DNS, HTTP, parsing, hashing, or Collector persistence work.

On SIGTERM or SIGINT, the Worker stops schedule scans and new claims, allows the active call to reach its supported safe boundary within a bounded grace period, refrains from confirming after a lost lease, closes the Collector pool, closes the queue pool, and exits. Abrupt exit is recovered by lease expiry.

Logs contain only stable IDs, state, attempt/delivery counts, stable result codes, and durations. They exclude raw/final URLs, query strings, bodies, headers, cookies, authorization, connection values, and stack traces.

## 12. Testing Strategy

### Contracts

Test strict objects, unknown fields, version mismatch, UUIDs, timestamps, empty/overlong idempotency keys, states, event types, commands, interval limits, and payload/body exclusion.

### Domain

Test eligibility for every source/relation/schedule state, the 30-minute default, 5-minute and 7-day limits, deterministic bounded jitter, catch-up coalescing, retry steps, maximum attempts, and every stable result classification.

### Database and pgTAP

Test schema/constraint contracts, every exposed table's RLS matrix, grants for anonymous/authenticated/admin/service/collection-worker/queue-worker principals, append-only schedule and job events, browser denial, schedule command idempotency/version conflicts, automatic eligibility, atomic enqueue/cursor advancement, lease fences, cancellation, and history preservation.

### Repository integration

Against local Supabase/PostgreSQL, test duplicate scheduling, duplicate manual command replay, two consumers racing to claim, stale fence rejection, renewal, expired-lease recovery, crash-boundary replay identity, retry, dead letter, cancellation, health counts, and transaction rollback.

### Worker

With injected clocks and repositories, test startup reconciliation, prompt overdue enqueue, 30-second scans, no collection in scheduler transactions, pre-network eligibility checks, Collector key derivation, retries, lease renewal/loss, idle polling, concurrency 1, bounded logs, and graceful shutdown.

### Regression and sensitivity

Prove repeated delivery cannot duplicate Raw Items, cross-project/source idempotency cannot return another aggregate, a stale worker cannot confirm a transferred lease, removing queue RLS fails the principal matrix, removing `SKIP LOCKED` or fencing fails the concurrency suite, and placing body text in a payload fails contract validation.

Run narrow RED/GREEN commands during implementation, then `pnpm verify`. Run `pnpm verify:full` only against the explicitly local disposable Supabase topology because it resets local data.

## 13. Acceptance Gates

Completion requires all of the following:

- Eligible official sources automatically receive default 30-minute schedules.
- Startup promptly enqueues one coalesced overdue job per eligible relationship with deterministic jitter.
- Pause, resume, interval change, and collect-now commands are authenticated, administrator-only, idempotent, and version checked.
- Multiple scheduler/consumer instances cannot duplicate a logical scheduled job or hold the same valid lease.
- Crash after Collector commit replays the same Collector result without duplicate HTTP; an intentional retry can execute again with a new attempt key.
- Every queue/schedule state mutation has an atomic append-only event or command receipt.
- Browser principals and `service_role` cannot directly mutate operational or canonical tables.
- Queue/Collector roles remain separate and neither can write canonical intelligence.
- Jobs, events, errors, and logs contain no source bodies, arbitrary headers, cookies, credentials, or stack traces.
- No network or model call occurs inside a database transaction.
- `pnpm verify` and the local disposable-database `pnpm verify:full` pass with generated types reproducible and both worktrees clean.

## 14. Explicit Exclusions and Follow-on Work

This slice does not include real-source production deployment, complex cron expressions, dynamic multi-node concurrency tuning, priority queues, a public queue dashboard, AI calls, Candidate/Evidence persistence, Grounding, conflict handling, human review, Promotion Service, canonical writes, audit/outbox, scoring, tutorials, notifications, or the final product UI.

After acceptance, Phase 2 continues in this order:

```text
AI Run and Candidate records
  -> Grounding verification
  -> Deduplication and conflict preservation
  -> Human review
  -> Promotion Service, audit, and transactional outbox
  -> deterministic scoring and user-facing intelligence pages
```
