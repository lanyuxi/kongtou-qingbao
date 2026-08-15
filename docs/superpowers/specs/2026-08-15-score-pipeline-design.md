# Phase 4 Score Pipeline Design (score-model-v1)

**Status:** Approved in conversation on 2026-08-15

## 1. Purpose

Turn published signals into decision output: deterministic, versioned opportunity / risk / confidence scores plus a recommendation, replacing the `seed-fixture-v1` placeholder rows and letting `opportunity_list` carry real pipeline data.

Not in this slice: AI-drafted explanations (template text only), durable-queue orchestration (manual CLI like `run-extract.ts`), the Evidence/Raw-Item link tables, tutorials, notifications, and the security workflow. `blocked` is never produced by scoring; it is reserved for the future protect-first security workflow.

## 2. Product rules honored

- Opportunity, risk, confidence are computed independently; a high opportunity value never reduces risk. Recommendation is a separate deterministic mapping over the three.
- Score math is deterministic and versioned (`model_version = 'score-model-v1'`). Same inputs produce the same `input_version`, so re-runs are idempotent via the existing `unique (project_id, model_version, input_version)`.
- No model calls. Explanation is a deterministic Chinese template assembled from factor codes and computed values — stricter than the allowed "AI drafts from supplied factor IDs".
- Every score row links to the exact signals it consumed (`score_signal_links`), and every axis is decomposed into `score_factors` rows. Signals already trace to candidates → ai_runs → discovered_items → raw_items, satisfying factor traceability until the Evidence model exists.
- Historical score rows are never deleted or overwritten; corrections supersede by `calculated_at` order (read model picks the latest row).

## 3. Inputs

For each project with `lifecycle in ('active','rumored')` and at least one published signal:

- signals: `verification`, `confidence` (AI-proposed 0-100), `published_at`, `occurred_at`, `expires_at`. Signals with `expires_at <= now` are excluded from scoring. `retracted`/`disputed` signals count for risk only.
- provenance per signal: `official` when the promoted candidate's source is linked to the project through `project_sources.is_official = true`; otherwise `third_party`; `unknown` when no promoted candidate row exists.

## 4. Score math (all constants exported, all values clamped to 0..100, rounded to 2 decimals)

Shared weights: verification weights verified 1.0 / corroborated 0.8 / unverified 0.6 / disputed 0.2 / retracted 0.0.

### Opportunity (eligible = non-expired, non-retracted signals)

```
strength   = mean(confidence * verificationWeight) / 100        # 0..1
recency    = 1.0 if newest published_at within 7d, 0.8 within 30d, 0.5 within 90d, else 0.25
volume     = min(eligibleCount, 5) / 5
opportunity = 100 * (0.60*strength + 0.25*recency + 0.15*volume)
```

### Risk (all non-expired signals)

```
unverifiedShare      = share of unverified signals
hostileShare         = share where disputed counts 0.5 and retracted counts 1.0
provenanceShare      = share of signals whose provenance is not official
risk = 100 * (0.40*unverifiedShare + 0.40*hostileShare + 0.20*provenanceShare)
```

Risk depends only on verification, hostility, and provenance — never on opportunity inputs.

### Confidence

```
volumeTerm        = 30 * min(signalCount, 5) / 5
verificationTerm  = 25 * weightedShare where weightedShare uses weights verified 1 / corroborated 0.6 / unverified 0.2 / disputed 0.1 / retracted 0
provenanceTerm    = 25 * officialShare
confidence = volumeTerm + verificationTerm + provenanceTerm
```

### Recommendation (decision table, evaluated in order)

```
hostileShare >= 0.5                -> avoid
opportunity < 30                   -> research
opportunity >= 60 and confidence >= 60 and risk < 50 -> act_now
opportunity >= 45                  -> watch
otherwise                          -> research
```

Note: a composite `risk >= threshold` avoid branch is provably unreachable while the hostile-dominance branch sits at 0.5 (risk is bounded by 40·unverifiedShare + 40·hostileShare + 20·provenanceShare ≤ 60 whenever hostileShare < 0.5), so it is deliberately omitted rather than shipped as dead code.

Confidence is capped at 80 by construction (30 + 25 + 25): the model never claims certainty.

### Explanation template (zh-CN)

`评分模型 score-model-v1：基于 {n} 条已发布信号。机会分 {X}（信号强度 {a}、新鲜度 {b}、数量 {c}）；风险分 {Y}（未验证占比 {p}、争议/撤回 {q}、来源 {r}）；置信度 {Z}%。`

## 5. Database changes (migration 20260815000100_scoring_factors)

```
score_factors(
  id uuid pk,
  project_score_id uuid not null -> project_scores(id) on delete restrict,
  axis text check in ('opportunity','risk','confidence'),
  factor_code text 1..80 trimmed,
  contribution numeric(6,2) not null check 0..100,
  input_value numeric(10,4) null,
  detail text null <=500,
  created_at timestamptz default now(),
  unique (project_score_id, factor_code)
)
score_signal_links(
  project_score_id uuid -> project_scores(id) on delete restrict,
  signal_id uuid -> signals(id) on delete restrict,
  primary key (project_score_id, signal_id)
)
```

RLS enabled on both. `ai_stage_worker` receives insert+select (the stage-worker boundary is reused rather than adding a new role; scoring runs inside `apps/worker` next to the extraction stage). anon/authenticated receive select when the parent project is active/rumored, mirroring `project_scores` policy style. The migration additionally grants `ai_stage_worker` select on `signals`, `projects`, `sources`, `project_sources` and insert on `project_scores`, with matching RLS policies.

`input_version` format: `v1:` + sha256 hex of the canonical JSON signal snapshot (signals sorted by id; fields id/verification/confidence/published_at/expires_at/provenance + project lifecycle).

## 6. Code layout

- `packages/domain/src/scoring/score-model.ts` — pure math, exported constants, no dependencies beyond contracts enums. Throws `ScoringModelError` on invalid input (empty signal set, out-of-range values).
- `packages/database/src/scoring/scoring-repository.ts` — postgres.js repository: `listScoringInputs(limit)` and `recordProjectScore(...)` (score + factors + links in one transaction; on-conflict lookup mirrors the extraction repository pattern).
- `apps/worker/src/scoring/score-projects.ts` — runner: fetch inputs, group by project, call domain, persist. Returns summary counters.
- `apps/worker/src/scoring/run-scoring.ts` — CLI with self-invoking entry (lessons §6.5), env `AIRDROP_AI_STAGE_DATABASE_URL`, `AI_SCORE_MAX_PROJECTS` default 25 clamp 1..100.

## 7. Verification plan

1. Domain unit tests: Ethereum-shaped fixture (6 unverified third-party signals), disputed/retracted escalation, expired exclusion, empty set rejection, recommendation boundaries, `input_version` determinism.
2. Worker runner tests with mock repository: grouping, skip-zero-signal projects, idempotent re-run reporting.
3. Remote run against the live tunnel: Ethereum gets a `score-model-v1` row superseding the seed row in `project_current_state`; `/projects/ethereum` and `/opportunities` render pipeline scores.
4. `env -u NODE_OPTIONS pnpm verify` fully green.

## 8. Known trade-offs

- Reusing `ai_stage_worker` for a deterministic stage blurs the "AI stage" naming; accepted to avoid a new role/migration pair before orchestration exists. Rename or split when the durable queue wiring lands.
- `signal_type` semantics are intentionally ignored (free-form AI strings); the model uses only schema-controlled fields so scoring cannot drift with prompt wording.
- No outbox events yet (consistent with the promotion path today); audit trail = versioned score rows + factor rows + signal links.
