# Airdrop Intelligence OS Phase 0/1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible TypeScript monorepo and a secured Supabase data foundation for the approved Web3 airdrop intelligence product.

**Architecture:** Use a modular monolith with a Next.js web/BFF process, an independent TypeScript worker, shared contracts and pure domain packages, and one Supabase PostgreSQL database. Phase 0 creates executable boundaries and quality gates. Phase 1 creates identity, catalog, signal/score history, private execution data, RLS, read models, and typed repository access.

**Tech Stack:** pnpm workspaces, TypeScript strict mode, Next.js App Router, React, Vitest, Zod, Supabase CLI/PostgreSQL/Auth/RLS, pgTAP, ESLint, Prettier, GitHub Actions.

## Global Constraints

- Follow `AGENTS.md` before every task.
- Use TDD: failing test, observe the expected failure, minimal implementation, passing test, refactor.
- Browser code never receives service-role or model credentials.
- AI output remains candidate data; Phase 1 creates no AI-to-canonical write path.
- Enable and test RLS on every exposed table.
- Keep migrations forward-only and histories append-only.
- Use UTC `timestamptz`; inject clocks in TypeScript tests.
- Commit each task only after its acceptance command passes.

---

## Target Repository Structure

```text
.
├── AGENTS.md
├── README.md
├── .env.example
├── .github/workflows/ci.yml
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.mjs
├── prettier.config.mjs
├── vitest.workspace.ts
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   └── src/{app,lib,tests}/
│   └── worker/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/{index.ts,health.ts,tests/}
├── packages/
│   ├── contracts/src/{api,jobs,tests}/
│   ├── domain/src/{ids.ts,project.ts,tests/}
│   └── database/src/{client.ts,generated,repositories,tests}/
├── scripts/{check-placeholders.mjs,verify-env.mjs}
├── supabase/
│   ├── config.toml
│   ├── seed.sql
│   ├── migrations/
│   │   ├── 20260809000100_extensions_and_types.sql
│   │   ├── 20260809000200_identity.sql
│   │   ├── 20260809000300_catalog.sql
│   │   ├── 20260809000400_intelligence_and_scores.sql
│   │   ├── 20260809000500_execution.sql
│   │   ├── 20260809000600_rls.sql
│   │   └── 20260809000700_read_models.sql
│   └── tests/
│       ├── 001_schema.test.sql
│       ├── 002_identity_rls.test.sql
│       ├── 003_catalog_rls.test.sql
│       ├── 004_execution_rls.test.sql
│       └── 005_read_models.test.sql
└── docs/{architecture,runbooks,superpowers/plans,tasks}/
```

## Required Root Commands

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter @airdrop/web --filter @airdrop/worker dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "test:db": "supabase db reset && supabase test db",
    "db:types": "supabase gen types typescript --local > packages/database/src/generated/database.types.ts",
    "check:placeholders": "node scripts/check-placeholders.mjs",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:placeholders",
    "verify:full": "pnpm verify && pnpm test:db"
  }
}
```

Every workspace package must define `build`, `lint`, `typecheck`, and `test`; application packages also define `dev`. Use these implementations unless the package needs a stricter equivalent:

```text
Next.js web
  dev       next dev
  build     next build
  lint      eslint .
  typecheck tsc --noEmit
  test      vitest run

Worker
  dev       tsx watch src/index.ts
  build     tsc -p tsconfig.json
  lint      eslint .
  typecheck tsc --noEmit
  test      vitest run

Library package
  build     tsc -p tsconfig.json
  lint      eslint .
  typecheck tsc --noEmit
  test      vitest run
```

## Phase 1 Schema Contract

Migration and pgTAP implementation must use this contract exactly. Changes to values, nullability, ownership, or history rules require a reviewed forward migration.

### Enum values

```text
app_role = user | reviewer | senior_reviewer | security_reviewer | admin
project_lifecycle = rumored | active | paused | ended | archived
source_type = official_web | official_social | official_docs | code_repository |
              chain_explorer | independent_research | news | community
source_status = active | degraded | suspended | retired
signal_verification = unverified | corroborated | verified | disputed | retracted
signal_lifecycle = detected | normalized | linked | under_review | published |
                   superseded | expired | rejected
risk_level = low | medium | high | critical
recommendation = act_now | watch | research | avoid | blocked
participation_status = interested | researching | participating | paused |
                       completed | abandoned
task_status = backlog | planned | in_progress | completed | skipped | blocked
task_priority = low | medium | high | urgent
```

### Identity tables

```text
profiles
  id uuid PK -> auth.users.id ON DELETE CASCADE
  display_name text NULL, trimmed length 1..80
  avatar_url text NULL, HTTPS when present
  timezone text NOT NULL DEFAULT 'UTC'
  created_at timestamptz NOT NULL DEFAULT now()
  updated_at timestamptz NOT NULL DEFAULT now()

user_roles
  user_id uuid NOT NULL -> profiles.id ON DELETE RESTRICT
  role app_role NOT NULL
  granted_by uuid NULL -> profiles.id ON DELETE RESTRICT
  granted_at timestamptz NOT NULL DEFAULT now()
  revoked_at timestamptz NULL, later than granted_at when present
  PK (user_id, role, granted_at)
```

Both `user_roles` foreign keys restrict profile deletion so neither grant ownership nor grant provenance can be physically deleted or silently rewritten.

### Catalog and decision-history tables

```text
projects
  id uuid PK DEFAULT gen_random_uuid()
  slug text UNIQUE NOT NULL, lowercase kebab case
  name text NOT NULL, trimmed length 1..120
  summary text NULL, length <= 1000
  lifecycle project_lifecycle NOT NULL DEFAULT 'rumored'
  primary_chain text NULL, trimmed length 1..80
  official_website_url text NULL, HTTPS when present
  version bigint NOT NULL DEFAULT 1, check > 0
  created_at timestamptz NOT NULL DEFAULT now()
  updated_at timestamptz NOT NULL DEFAULT now()

sources
  id uuid PK DEFAULT gen_random_uuid()
  source_type source_type NOT NULL
  name text NOT NULL, trimmed length 1..160
  canonical_url text UNIQUE NOT NULL, HTTPS
  status source_status NOT NULL DEFAULT 'active'
  reputation_score numeric(5,2) NOT NULL DEFAULT 50, check 0..100
  created_at timestamptz NOT NULL DEFAULT now()
  updated_at timestamptz NOT NULL DEFAULT now()

project_sources
  project_id uuid NOT NULL -> projects.id ON DELETE CASCADE
  source_id uuid NOT NULL -> sources.id ON DELETE RESTRICT
  authority_domains text[] NOT NULL DEFAULT '{}'
  is_official boolean NOT NULL DEFAULT false
  verified_at timestamptz NULL
  verified_by uuid NULL -> profiles.id ON DELETE SET NULL
  created_at timestamptz NOT NULL DEFAULT now()
  PK (project_id, source_id)
  official rows require authority_domains, verified_at, and verified_by

signals
  id uuid PK DEFAULT gen_random_uuid()
  project_id uuid NOT NULL -> projects.id ON DELETE RESTRICT
  signal_type text NOT NULL, trimmed length 1..100
  title text NOT NULL, trimmed length 1..200
  summary text NOT NULL, trimmed length 1..2000
  verification signal_verification NOT NULL DEFAULT 'unverified'
  lifecycle signal_lifecycle NOT NULL DEFAULT 'detected'
  confidence numeric(5,2) NOT NULL, check 0..100
  occurred_at timestamptz NULL
  published_at timestamptz NULL
  expires_at timestamptz NULL, later than occurred_at when both exist
  supersedes_signal_id uuid NULL -> signals.id ON DELETE RESTRICT, not self
  created_at timestamptz NOT NULL DEFAULT now()

project_scores
  id uuid PK DEFAULT gen_random_uuid()
  project_id uuid NOT NULL -> projects.id ON DELETE RESTRICT
  model_version text NOT NULL, trimmed length 1..80
  input_version text NOT NULL, trimmed length 1..128
  opportunity_score numeric(5,2) NOT NULL, check 0..100
  risk_score numeric(5,2) NOT NULL, check 0..100
  confidence numeric(5,2) NOT NULL, check 0..100
  recommendation recommendation NOT NULL
  explanation text NOT NULL, trimmed length 1..4000
  calculated_at timestamptz NOT NULL
  created_at timestamptz NOT NULL DEFAULT now()
  UNIQUE (project_id, model_version, input_version)
```

### Private execution tables

```text
watchlists
  id uuid PK DEFAULT gen_random_uuid()
  user_id uuid NOT NULL -> profiles.id ON DELETE CASCADE
  name text NOT NULL, trimmed length 1..80
  is_default boolean NOT NULL DEFAULT false
  created_at timestamptz NOT NULL DEFAULT now()
  updated_at timestamptz NOT NULL DEFAULT now()
  UNIQUE (user_id, name)
  partial UNIQUE (user_id) WHERE is_default

watchlist_projects
  watchlist_id uuid NOT NULL -> watchlists.id ON DELETE CASCADE
  project_id uuid NOT NULL -> projects.id ON DELETE CASCADE
  added_at timestamptz NOT NULL DEFAULT now()
  PK (watchlist_id, project_id)

user_projects
  user_id uuid NOT NULL -> profiles.id ON DELETE CASCADE
  project_id uuid NOT NULL -> projects.id ON DELETE CASCADE
  participation_status participation_status NOT NULL DEFAULT 'interested'
  notes text NULL, length <= 4000
  started_at timestamptz NULL
  updated_at timestamptz NOT NULL DEFAULT now()
  PK (user_id, project_id)

user_tasks
  id uuid PK DEFAULT gen_random_uuid()
  user_id uuid NOT NULL -> profiles.id ON DELETE CASCADE
  project_id uuid NULL -> projects.id ON DELETE SET NULL
  title text NOT NULL, trimmed length 1..200
  status task_status NOT NULL DEFAULT 'backlog'
  priority task_priority NOT NULL DEFAULT 'medium'
  due_at timestamptz NULL
  completed_at timestamptz NULL, present exactly when status = 'completed'
  version bigint NOT NULL DEFAULT 1, check > 0
  created_at timestamptz NOT NULL DEFAULT now()
  updated_at timestamptz NOT NULL DEFAULT now()
```

### Required indexes and visibility

```text
projects(lifecycle, updated_at desc)
sources(status, updated_at desc)
project_sources(source_id)
GIN project_sources(authority_domains)
signals(project_id, created_at desc)
signals(lifecycle, published_at desc)
project_scores(project_id, calculated_at desc, id desc)
user_roles(user_id, role) WHERE revoked_at IS NULL
user_tasks(user_id, status, due_at)
```

- Public read: active catalog rows, published signals, approved score history, approved views.
- Owner-only: profiles, watchlists, watchlist projects, user projects, user tasks.
- Service-only write: projects, sources, project sources, signals, project scores.
- Append-only through exposed roles: role history, signals, project scores.

# Phase 0 — Executable Repository Foundation

## Task 0.1: Bootstrap the workspace

**Files:** Create `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.mjs`, `vitest.workspace.ts`, `.npmrc`, `.gitignore`, `.env.example`, `README.md`, `scripts/check-placeholders.mjs`, `scripts/verify-env.mjs`.

- [ ] Run `git init` if `.git/` is absent.
- [ ] Create private root package `airdrop-intelligence-os`; add the commands above and workspace globs `apps/*`, `packages/*`.
- [ ] Run `pnpm add -D typescript vitest eslint @eslint/js typescript-eslint prettier supabase tsx concurrently` and commit `pnpm-lock.yaml`.
- [ ] Enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and `useUnknownInCatchVariables`.
- [ ] Make `verify-env.mjs` require, without printing values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.
- [ ] Run `node scripts/verify-env.mjs` with no values; expect exit `1` and only missing names.
- [ ] Add non-secret examples to `.env.example`; rerun with temporary shell values and expect exit `0`.
- [ ] Make `check-placeholders.mjs` fail on unfinished markers in owned files while excluding dependencies, generated files, and lockfiles.
- [ ] Document install, database start/reset, development, verification, and shutdown.

**Acceptance:** `pnpm install --frozen-lockfile && pnpm check:placeholders`

**Commit:** `chore: bootstrap monorepo foundation`

## Task 0.2: Add shared contracts and domain primitives

**Files:** Create `packages/contracts/{package.json,tsconfig.json,src/index.ts,src/api/envelope.ts,src/jobs/envelope.ts,src/tests/envelope.test.ts}` and `packages/domain/{package.json,tsconfig.json,src/index.ts,src/ids.ts,src/project.ts,src/tests/project.test.ts}`.

**Required contracts:**

```ts
export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta: { requestId: string; nextCursor: string | null };
};
export type ApiError = {
  ok: false;
  error: { code: string; message: string; requestId: string; details: Record<string, unknown> | null };
};
export type JobEnvelope<TType extends string, TPayload> = {
  jobId: string;
  type: TType;
  version: 1;
  idempotencyKey: string;
  correlationId: string;
  occurredAt: string;
  payload: TPayload;
};
```

- [ ] Write tests rejecting unknown keys, invalid UUID/timestamp, blank idempotency keys, and job versions other than `1`.
- [ ] Run `pnpm --filter @airdrop/contracts test`; expect missing-schema failure.
- [ ] Implement strict Zod schemas and inferred types; rerun to green.
- [ ] Write tests for UUID-backed `ProjectId`, `SignalId`, `EvidenceId`, `UserId`.
- [ ] Test lifecycle `rumored|active|paused|ended|archived` and recommendation `act_now|watch|research|avoid|blocked`.
- [ ] Run domain tests; observe failure, implement pure parsers, rerun to green.

**Acceptance:** `pnpm --filter @airdrop/contracts typecheck && pnpm --filter @airdrop/contracts test && pnpm --filter @airdrop/domain typecheck && pnpm --filter @airdrop/domain test`

**Commit:** `feat(contracts): add api job and domain primitives`

## Task 0.3: Add web shell and health endpoint

**Files:** Create `apps/web/{package.json,next.config.ts,tsconfig.json,vitest.config.ts}`, `apps/web/src/app/{globals.css,layout.tsx,page.tsx,api/v1/health/route.ts}`, `apps/web/src/lib/env.ts`, `apps/web/src/tests/health.test.ts`.

- [ ] Add Next.js, React, React DOM, Zod, type packages, and workspace dependency `@airdrop/contracts`.
- [ ] Write a direct Route Handler test expecting HTTP `200`, JSON content type, `service: web`, `status: healthy`, UUID request ID, and `nextCursor: null`.
- [ ] Run `pnpm --filter @airdrop/web test -- health.test.ts`; expect missing-route failure.
- [ ] Implement the handler with a per-request UUID and no environment, version, or database details.
- [ ] Add a minimal semantic root page and separated public/server environment parsing.
- [ ] Rerun tests, type check, and production build.

**Acceptance:** `pnpm --filter @airdrop/web lint && pnpm --filter @airdrop/web typecheck && pnpm --filter @airdrop/web test && pnpm --filter @airdrop/web build`

**Commit:** `feat(web): add application shell and health endpoint`

## Task 0.4: Add lifecycle-safe worker shell

**Files:** Create `apps/worker/{package.json,tsconfig.json,vitest.config.ts}`, `apps/worker/src/{health.ts,index.ts,tests/health.test.ts}`.

```ts
export type WorkerHealth = {
  service: 'worker';
  status: 'starting' | 'ready' | 'stopping';
  startedAt: string;
  checkedAt: string;
};
```

- [ ] Write deterministic tests with an injected clock for `starting -> ready -> stopping`.
- [ ] Test that `stopping -> ready` is rejected.
- [ ] Run worker tests; expect missing-state-machine failure.
- [ ] Implement a pure state machine and `SIGTERM`/`SIGINT` handlers; add no queue consumer.
- [ ] Start worker, send `SIGTERM`, and verify stopping event plus exit `0`.

**Acceptance:** `pnpm --filter @airdrop/worker lint && pnpm --filter @airdrop/worker typecheck && pnpm --filter @airdrop/worker test && pnpm --filter @airdrop/worker build`

**Commit:** `feat(worker): add lifecycle-safe worker shell`

## Task 0.5: Add CI and local runbooks

**Files:** Create `.github/workflows/ci.yml`, `docs/architecture/phase-0-1.md`, `docs/runbooks/local-development.md`; modify `README.md`.

- [ ] CI triggers on pull requests and default-branch pushes, uses the root Node/pnpm majors, installs frozen lockfile, and runs `pnpm verify`.
- [ ] Add a separate database job that starts Supabase and runs `pnpm test:db` once Phase 1 lands.
- [ ] Cache pnpm's store, not `node_modules`.
- [ ] Document dependency direction: apps -> packages; database -> contracts/domain; domain -> no infrastructure.
- [ ] Document prerequisites, ports, environment files, startup order, local-only reset, and shutdown.

**Acceptance:** `pnpm install --frozen-lockfile && pnpm verify`

**Commit:** `ci: enforce repository quality gates`

# Phase 1 — Secured Core Data Foundation

## Task 1.1: Add Supabase extensions and enums

**Files:** Create `supabase/config.toml`, `supabase/seed.sql`, `supabase/migrations/20260809000100_extensions_and_types.sql`, `supabase/tests/001_schema.test.sql`, `packages/contracts/src/enums.ts`, `packages/contracts/src/tests/enums.test.ts`, `packages/domain/src/source.ts`, `packages/domain/src/signal.ts`, `packages/domain/src/task.ts`; modify both package roots, domain compatibility modules, and workspace dependency metadata; extend domain tests.

**Schema:** `pgcrypto` and every enum listed in the Phase 1 Schema Contract.

- [ ] Run `pnpm exec supabase init` only if config is absent; pin and document local ports.
- [ ] Add strict canonical schemas in `packages/contracts` for every enum before adding its PostgreSQL equivalent; `packages/domain` compatibility-imports and re-exports those same schema instances.
- [ ] Write pgTAP tests for the extension's exact `extensions` namespace and exact enum values/order.
- [ ] Run `pnpm test:db`; expect missing-schema failure.
- [ ] Implement only extensions and enums in this migration; rerun to green.

**Acceptance:** `pnpm db:start && pnpm test:db`

**Commit:** `feat(db): add extensions and domain enums`

## Task 1.2: Add identity and role history

**Files:** Create `supabase/migrations/20260809000200_identity.sql`, `supabase/tests/002_identity_rls.test.sql`; modify `supabase/seed.sql`.

**Tables:**

- `profiles(id -> auth.users, display_name, avatar_url, timezone, created_at, updated_at)`
- `user_roles(user_id, role, granted_by, granted_at, revoked_at)` with append-only grant history.

**Functions:** `handle_new_user()`, `has_active_role(app_role)`, `set_updated_at()`; all security-definer functions use a fixed safe `search_path`.

- [ ] Write tests with two users and one admin: automatic profile, self read/update, cross-user denial, ordinary role-grant denial, active admin lookup, revoked role denial.
- [ ] Run database tests; observe identity failures.
- [ ] Implement tables, triggers, active-role index, explicit grants, and RLS.
- [ ] Keep revocation as `revoked_at`; never delete role history.
- [ ] Restrict deletion of profiles referenced by role history, including grant provenance.

**Acceptance:** `pnpm test:db`

**Commit:** `feat(auth): add profiles roles and identity policies`

## Task 1.3: Add secured project/source catalog

**Files:** Create `supabase/migrations/20260809000300_catalog.sql`, `supabase/tests/003_catalog_rls.test.sql`; modify `supabase/seed.sql`.

**Tables:**

- `projects(id, slug, name, summary, lifecycle, primary_chain, official_website_url, version, created_at, updated_at)`
- `sources(id, source_type, name, canonical_url, status, reputation_score 0..100, created_at, updated_at)`
- `project_sources(project_id, source_id, authority_domains[], is_official, verified_at, verified_by, created_at)`

- [ ] Test lowercase kebab slugs, nonblank names, valid HTTPS URLs, reputation bounds.
- [ ] Test official relation requires authority domain, verification time, and verifier.
- [ ] Test public reads of active catalog and denial of all ordinary/admin browser writes.
- [ ] Run database tests; observe failures.
- [ ] Implement constraints, material-update project versioning, updated-at triggers, indexes, RLS, and explicit grants.
- [ ] Reserve canonical writes for service backend and the future Promotion Service.

**Acceptance:** `pnpm test:db`

**Commit:** `feat(db): add secured project and source catalog`

## Task 1.4: Add append-only signals and scores

**Files:** Create `supabase/migrations/20260809000400_intelligence_and_scores.sql`; extend schema/catalog tests.

**Tables:**

- `signals(id, project_id, signal_type, title, summary, verification, lifecycle, confidence, occurred_at, published_at, expires_at, supersedes_signal_id, created_at)`
- `project_scores(id, project_id, model_version, input_version, opportunity_score, risk_score, confidence, recommendation, explanation, calculated_at, created_at)`; unique `(project_id, model_version, input_version)`.

- [ ] Test score/confidence bounds, no self-supersede, valid expiry order, duplicate input rejection.
- [ ] Test ordinary/reviewer update-delete denial and published-only public signal reads.
- [ ] Run database tests; observe failures.
- [ ] Implement constraints and project/time/version indexes without generic update policies.
- [ ] Model corrections as superseding signals or new score inputs.

**Acceptance:** `pnpm test:db`

**Commit:** `feat(intelligence): add signal and score history`

## Task 1.5: Add private watchlists, tracking, and tasks

**Files:** Create `supabase/migrations/20260809000500_execution.sql`, `supabase/tests/004_execution_rls.test.sql`.

**Tables:** `watchlists`, `watchlist_projects`, `user_projects`, `user_tasks`; every private aggregate carries or resolves to `user_id`.

- [ ] Test owner-only CRUD, cross-owner denial, immutable ownership, and cross-owner watchlist attachment denial.
- [ ] Test one default watchlist per user via partial unique index.
- [ ] Test `completed_at` is present exactly for completed tasks.
- [ ] Test versioned `update_user_task(task_id, expected_version, patch)` rejects stale versions with a stable conflict code.
- [ ] Run database tests; observe failures.
- [ ] Implement constraints, both `using` and `with check` RLS clauses, safe function search path, and allowed patch fields.
- [ ] Confirm admin cannot read private notes without a separately approved support workflow.

**Acceptance:** `pnpm test:db`

**Commit:** `feat(tasks): add private tracking and task ownership`

## Task 1.6: Consolidate RLS and add read models

**Files:** Create `supabase/migrations/20260809000600_rls.sql`, `supabase/migrations/20260809000700_read_models.sql`, `supabase/tests/005_read_models.test.sql`; extend prior RLS tests.

**Views:** `project_current_state` selects the deterministic latest score and latest published signal time; `opportunity_list` contains only active/rumored scored projects and no private fields.

- [ ] Test RLS enabled on every public table, no anon mutations, no broad authenticated private reads.
- [ ] Test latest score ordering by `calculated_at desc, id desc` including tied timestamps.
- [ ] Test paused/ended/archived/unscored projects are absent from opportunities.
- [ ] Run tests; observe policy/view failures.
- [ ] Consolidate policies with names `<table>_<operation>_<principal>` and comments.
- [ ] Implement invoker-safe views, deterministic ordering, narrow select grants, and no private columns.

**Acceptance:** `pnpm test:db`

**Commit:** `feat(db): add policy matrix and opportunity read models`

## Task 1.7: Add generated types and typed repository

**Files:** Create `packages/database/{package.json,tsconfig.json,src/index.ts,src/client.ts,src/repositories/project-repository.ts,src/tests/project-repository.integration.test.ts}`; generate `packages/database/src/generated/database.types.ts`.

```ts
export interface ProjectRepository {
  listOpportunities(input: {
    limit: number;
    afterScore: number | null;
    afterProjectId: string | null;
  }): Promise<OpportunityListItem[]>;
}
```

- [ ] Reset local DB and run `pnpm db:types`; commit generated types.
- [ ] Write integration fixtures for active, rumored, paused, scored, and unscored projects.
- [ ] Test ordering `opportunity_score desc, project_id asc` and cursor continuation without gaps/duplicates.
- [ ] Run package tests; expect missing-repository failure.
- [ ] Implement browser-safe anon client and separate server-only service entry point.
- [ ] Implement limit range `1..100`, explicit cursor inputs, view query, and snake-to-camel mapping.

**Acceptance:** `pnpm db:types && git diff --exit-code packages/database/src/generated/database.types.ts && pnpm --filter @airdrop/database typecheck && pnpm --filter @airdrop/database test`

**Commit:** `feat(database): add typed opportunity repository`

## Task 1.8: Seed and verify Phase 0/1

**Files:** Modify `supabase/seed.sql`, `README.md`, `docs/architecture/phase-0-1.md`, `docs/runbooks/local-development.md`.

- [ ] Seed fixed fictional UUIDs: active scored project, rumored scored project, paused project; verified official source; independent source; two published and one non-public signal; two score versions.
- [ ] Add pgTAP smoke assertions for exact seed and opportunity view rows; observe failure before completing seed.
- [ ] Make seed deterministic and free of real user, wallet, contract, and credential data.
- [ ] Restart/reset Supabase, run all database tests, regenerate types, and confirm no diff.
- [ ] Run repository verification and inspect `git status --short` for intended files only.

**Acceptance:**

```bash
pnpm install --frozen-lockfile
pnpm db:start
pnpm test:db
pnpm db:types
git diff --exit-code packages/database/src/generated/database.types.ts
pnpm verify
```

**Commit:** `chore: complete phase zero and one foundation`

---

## Phase 0/1 Exit Criteria

- [ ] Fresh clone installs with frozen lockfile.
- [ ] `pnpm verify` passes without Supabase; `pnpm verify:full` passes with local Supabase.
- [ ] Web health and worker shutdown contracts pass.
- [ ] Every exposed table has a tested RLS principal matrix.
- [ ] Anonymous users cannot mutate; users access only their private rows.
- [ ] Browser admins cannot directly mutate canonical catalog, signal, or score data.
- [ ] Signal and score histories are append-only through exposed roles.
- [ ] Opportunity view is deterministic and contains no private fields.
- [ ] Generated types are committed and reproducible.
- [ ] Fixtures contain no real secrets, keys, personal data, wallets, or contracts.
- [ ] CI separates repository verification from database integration tests.

## Phase Boundary

Phase 2 begins raw collection, durable queues, OpenAI Structured Outputs, candidate grounding, deduplication, conflicts, Promotion Service, audit/outbox, review queues, security escalation, deterministic score calculation, tutorials, notifications, and admin UI. None belongs in Phase 0/1.

## References

- `AGENTS.md`
- `docs/tasks/phase-0-1-development-workbook.md`
- <https://learn.chatgpt.com/docs/agent-configuration/agents-md>
- <https://nextjs.org/docs/app/getting-started>
- <https://supabase.com/docs/guides/local-development>
- <https://supabase.com/docs/guides/database/postgres/row-level-security>
