# Phase 5 Orchestration Design — Automatic Extract → Score Pipeline

**Status:** Approved in conversation on 2026-08-15

## 1. Purpose

Turn the three manual CLIs (collect / extract / score) into one continuously running system: collection already runs automatically through the hardened durable queue; this slice adds automatic extraction and automatic scoring inside the worker process, so the chain 采集 → 抽取 →（人工 Promotion）→ 评分 flows without anyone typing commands.

Explicitly **not** in this slice:

- **Generalizing `durable_jobs` for per-object AI jobs.** The collection queue is hardened and collection-only by constraint (`job_type = 'collect.source'`, NOT NULL source/schedule, collection-specific payload validator, ~800 asserting tests). Extraction and scoring are idempotent whole-DB sweeps, not per-object jobs; wrapping them in per-object durable jobs would require relaxing hardened constraints and rewriting the queue test suite. That is a deliberate future task, recorded here as follow-on work.
- **The human promotion gate.** AGENTS.md: AI output is candidate data; canonical writes go through the Promotion Service after review. `promote-candidate.ts` stays manual. The automatable chain therefore ends at candidates; scoring picks up whatever has been promoted, whenever.
- Cron libraries, new dependencies, admin UI for the orchestrator, notifications.

## 2. Product rules honored

- Heavy work stays out of web requests; the worker owns the loops (AGENTS.md "heavy work must run through durable queues" applies to web isolation — the sweep loops run only in `apps/worker`).
- No DB transaction is held open during model calls: both stages already follow commit-per-input; the orchestrator only sequences them.
- Orchestration never writes canonical facts itself — it only invokes the existing stage runners, whose write boundaries are unchanged.
- Bounded, sanitized logs only: stage name, counters, durations, stable codes. No prompts, payloads, URLs, or stack traces.
- Token-cost protection: a tick with no pending work performs exactly one cheap SELECT and no model calls.

## 3. Architecture

```
worker process (apps/worker)
├── collection queue runtime        (existing, unchanged)
│     scheduler 30s + consumer (durable_jobs)
└── AI stage orchestration runtime  (this slice)
      ├── extraction timer ──▶ runExtractionOnce()   every EXTRACT_TICK (default 60s)
      └── scoring timer    ──▶ runScoringOnce()      every SCORING_TICK (default 300s)
```

One process, two runtimes, independent timers. Rationale: extraction and scoring share no transactional coupling — scoring consumes promoted signals, which arrive through the human gate at arbitrary times, so a timer is the correct decoupling; event-chaining would add coupling without removing the human latency.

Each tick: invoke the existing stage runner inside try/catch; a stage failure logs a bounded error event and never aborts the other stage or the loop. Consecutive failures of a stage apply exponential backoff to that stage's next attempt (base tick × 2^failures, capped at 15 minutes) to avoid hot loops when the database or provider is down; a success resets the counter.

Both stages are already idempotent sweeps (`ai_runs` conflict key; `project_scores` `(project_id, model_version, input_version)` conflict), so crash recovery needs no extra machinery: the next tick re-scans the same pending set, and committed rows are replayed as no-ops.

## 4. Poison-input protection — the critical behavioral change

`listPendingInputs` today excludes only runs with status `succeeded` / `skipped_no_content`. Inputs whose runs ended `schema_invalid_after_repair`, `grounding_failed`, or `provider_error` remain pending **forever**. Under manual CLI use this is tolerable; under a 60-second loop a poison input re-burns model tokens on every tick. The live database confirms the hazard: the single pending item is a `grounding_failed` input that would be re-processed on every orchestration tick.

**Why not a counting retry budget:** `ai_runs` has a unique key `(stage, input_kind, input_id, input_hash, pipeline_version)` and `recordExtractionRun` dedupes via `on conflict do nothing`, so at most **one** run row can ever exist per input + content hash + pipeline version. Attempt counts therefore can never exceed 1, and a counting budget is not expressible without a schema change (an `attempt` column + widened unique key). That is deferred as follow-on work rather than added now, keeping this slice forward-compatible and minimal.

**Rule (this slice):** align the pending filter with the recording dedup so an input is attempted at most once per pipeline version:

```
pending = no ai_runs row at all for (input, pipeline_version)
```

i.e. `listPendingInputs` excludes any input that already has a run of **any** status at the current pipeline version. Deterministic failures and provider errors are both terminal for the tick loop — no re-burn.

- Parked (failed) inputs stay in `discovered_items` with their `ai_runs` history intact — they are **dead-lettered by semantics, not by deletion**. The future review flow (HANDOVER not-started #3) lists them; no data is lost or hidden.

**Known limitation (documented, accepted):** transient provider outages park inputs permanently instead of auto-retrying. A durable outage was not occurring (0 `provider_error` rows live), and adding automatic retry requires the `attempt`-column migration above. Recorded as follow-on work.

Scoring needs no budget: it is deterministic and model-free.

## 5. Configuration

Env (all optional; absent ⇒ orchestration runtime does not start and the worker remains collection-only — non-breaking for `pnpm dev`):

| Variable | Default | Meaning |
|---|---|---|
| `AIRDROP_AI_STAGE_DATABASE_URL` | — (required for orchestration) | stage-worker connection (existing) |
| `AI_MODEL_API_KEY` / `AI_MODEL_BASE_URL` / `AI_MODEL_ID` | — / DeepSeek / deepseek-chat (existing semantics) | extraction model |
| `AI_EXTRACT_MAX_INPUTS` | 5 | extraction batch per tick (existing clamp 1..50) |
| `AI_SCORE_MAX_PROJECTS` | 25 | scoring batch per tick (existing clamp 1..100) |
| `AIRDROP_ORCHESTRATION_EXTRACT_TICK_MS` | 60000 | extraction timer |
| `AIRDROP_ORCHESTRATION_SCORING_TICK_MS` | 300000 | scoring timer |

## 6. Lifecycle and shutdown

The composition root (`createAiStageRuntime`) mirrors `createQueueRuntime`: validates config, builds repositories/model client with DI, owns its own AbortController. `index.ts` composes both runtimes behind the single `WorkerRuntimePort` (composite start/stop). On SIGTERM/SIGINT the existing bounded-stop races both runtimes' stops against the 30s bound; each stage invocation checks the abort signal between inputs (extraction) / is bounded by batch size (scoring), so an in-flight tick either completes its current input or is abandoned and recovered by the next process start. `tsx` SIGTERM interception (HANDOVER §6.11) is already handled by the same-process signal design.

## 7. Code layout

- `packages/domain/src/orchestration/backoff.ts` — pure: `backoffMs(failures, baseMs, capMs)` exponential step with deterministic cap. Unit tests.
- `packages/database/src/ai/extraction-repository.ts` — `listPendingInputs` excludes any input already attempted at the current pipeline version (any status), matching the `recordExtractionRun` dedup. Unit test of the query intent via mock + integration test against remote DB.
- `apps/worker/src/orchestration/ports.ts` — `StageRunner`, timer, clock, logger ports (mirrors queue ports style).
- `apps/worker/src/orchestration/ai-stage-orchestrator.ts` — the two timer loops, error isolation, backoff. Unit tests with fake timers/stages (pattern of `run-scheduler.test.ts`).
- `apps/worker/src/orchestration/create-ai-stage-runtime.ts` — composition root: env validation, postgres pool, repositories, model client, runtime handle.
- `apps/worker/src/index.ts` — parse orchestration env (nullable), composite runtime; absent env logs one info line and runs collection-only.

## 8. Verification plan

1. Domain unit tests: backoff sequence, cap, and invalid-input rejection.
2. Orchestrator unit tests: tick cadence per timer, extraction failure does not stop scoring tick, backoff on consecutive failures, reset on success, abort stops before next tick, no stage invoked after abort, bounded log shape (no payloads).
3. Database integration tests (remote env): a `grounding_failed` input is no longer returned by `listPendingInputs` after one attempt (poison-input protection).
4. Live end-to-end (task: 端到端验证): start worker with orchestration env → observe extraction tick pick up any pending discovered_items → promote one candidate manually → observe scoring tick supersede with a new `score-model-v1` row → verify `project_current_state` and pages; second run of each stage is a no-op (idempotency).
5. `env -u NODE_OPTIONS pnpm verify` fully green; collection-only worker start (no AI env) still works.

## 9. Known trade-offs

- Timer polling (60s/300s) instead of event-driven chaining: accepted — latency tolerance is minutes for an intelligence product, and the human promotion gate already decouples the stages by hours.
- The retry budget is enforced in a query, not a state machine: budget-exhausted inputs have no explicit `dead_letter` row yet (no review module exists). Their `ai_runs` history is the audit trail; the review flow will surface them.
- Orchestration state is process-local (no advisory lock): running two workers would double-execute stages. Both stages are idempotent so the consequence is wasted model tokens, not corruption. A distributed lock is deferred until multi-worker deployment exists.
- `ai_stage_worker` role is reused unchanged (no new migration needed for this slice).
