# Failed AI Run Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated active reviewers safely inspect failed AI extraction runs and append idempotent, version-checked investigation or dismissal decisions with transactional outbox events.

**Architecture:** Keep `ai_runs` immutable and add an append-only review ledger. A thin Next.js BFF verifies the Supabase bearer session and calls reviewer-only security-definer RPCs with the same token; strict shared contracts bound every projection, command, and cursor. A review-specific client UI provides minimal sign-in, list, detail, history, and decision flows without exposing raw AI or source content.

**Tech Stack:** Node.js 22, TypeScript strict mode, Zod 4, Next.js 16 App Router, React 19, Supabase Auth/PostgREST/PostgreSQL, pgTAP, Vitest, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-08-22-failed-ai-run-review-design.md`

## Global Constraints

- Follow `AGENTS.md`; never expose or log seed phrases, private keys, signing secrets, database credentials, bearer tokens, raw AI errors, source bodies, model output, prompts, usage payloads, or hidden URLs.
- Use Node.js `>=22 <23` and pnpm `11.16.0`; run commands with the bundled runtime path when the shell has no Node.
- Use strict TDD for every behavior-bearing TypeScript change: observe RED, add the minimal implementation, observe GREEN, then refactor.
- Add only forward migration `20260822000100_failed_ai_run_review.sql`; never edit any of the 19 applied migrations.
- `ai_runs`, decisions, command receipts, and outbox history are append-only.
- Reviewer identity is `auth.uid()` from a verified Supabase session; no command accepts a reviewer UUID.
- Only `provider_error`, `schema_invalid_after_repair`, and `grounding_failed` are reviewable.
- Browser code receives only the public Supabase URL, anon key, and the user's own session.
- Update `docs/tasks/failed-ai-run-review-workbook.md` and `docs/HANDOVER.md` after each task acceptance check.
- Commit each task only after its focused acceptance checks pass; preserve unrelated `.DS_Store` files and user changes.

---

## Target File Map

```text
packages/contracts/src/
  review/failed-ai-run.ts                 strict schemas, types, reason compatibility
  review/failed-ai-run.test.ts            contract RED/GREEN tests
  index.ts                                public contract exports

supabase/
  migrations/20260822000100_failed_ai_run_review.sql
  tests/011_failed_ai_run_review.test.sql

packages/database/src/review/
  failed-ai-run-review-repository.ts       bearer-scoped Supabase RPC repository
  entry.ts                                 server-only export
  browser-denied.ts                        browser fail-closed export
packages/database/src/tests/
  failed-ai-run-review-repository.test.ts
  failed-ai-run-review-repository.integration.test.ts
packages/database/
  package.json                             add explicit review export/integration file
  src/generated/database.types.ts          regenerate after migration

apps/web/src/lib/
  failed-ai-run-review-handlers.ts         list/detail/decision BFF handlers
  review-api-client.ts                     browser fetch wrapper, no token persistence
  review-session.ts                        injected Supabase session/sign-in controller
  supabase-browser.ts                      public browser client factory
apps/web/src/tests/
  failed-ai-run-review-handlers.test.ts
  review-api-client.test.ts
  review-session.test.ts
  review-components.test.ts
apps/web/src/app/api/v1/review/ai-runs/
  route.ts
  [runId]/route.ts
  [runId]/decisions/route.ts
apps/web/src/app/review/
  review-shell.tsx
  sign-in/page.tsx
  ai-runs/page.tsx
  ai-runs/[runId]/page.tsx
apps/web/src/components/review/
  sign-in-form.tsx
  failed-ai-run-list.tsx
  failed-ai-run-detail.tsx
  failed-ai-run-decision-form.tsx
apps/web/src/app/globals.css              scoped review UI styles only

docs/tasks/failed-ai-run-review-workbook.md
docs/HANDOVER.md
docs/runbooks/local-development.md
```

## Runtime command prefix

Use this exact prefix where `node` is otherwise unavailable:

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS
```

---

### Task 1: Add strict failed-run review contracts

**Files:**
- Create: `packages/contracts/src/review/failed-ai-run.test.ts`
- Create: `packages/contracts/src/review/failed-ai-run.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `docs/tasks/failed-ai-run-review-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Produces: `failedAiRunStatusSchema`, `failedAiRunReviewStateSchema`, `failedAiRunDecisionSchema`, `failedAiRunReasonCodeSchema`, `failedAiRunListQuerySchema`, `failedAiRunListItemSchema`, `failedAiRunDetailSchema`, `failedAiRunDecisionCommandSchema`, `failedAiRunDecisionResultSchema`, and inferred types.
- Decision commands use camelCase JSON, `version: 1`, `expectedReviewVersion >= 0`, and `note: string | null`.

- [ ] **Step 1: Write strict failing contract tests**

```ts
import { describe, expect, it } from 'vitest';
import * as contracts from '../index.js';

const validListItem = {
  version: 1,
  runId: 'a1000000-0000-4000-8000-000000000001',
  status: 'provider_error',
  safeFailureCode: 'provider_error',
  stage: 'extract_discovered_item',
  inputKind: 'discovered_item',
  modelId: 'review-test-model',
  promptVersion: 'extract-v1',
  schemaVersion: 'candidate-v1',
  pipelineVersion: 'pipeline-v1',
  project: null,
  source: null,
  createdAt: '2026-08-22T00:00:00.000Z',
  reviewState: 'unreviewed',
  reviewVersion: 0,
  latestDecisionAt: null,
} as const;

describe('failed AI run review contracts', () => {
  it('accepts an investigation command with a compatible reason', () => {
    const schema = contracts.failedAiRunDecisionCommandSchema;
    expect(schema.parse({
      version: 1,
      expectedReviewVersion: 0,
      decision: 'needs_investigation',
      reasonCode: 'provider_instability',
      note: 'Check provider status.',
    })).toEqual({
      version: 1,
      expectedReviewVersion: 0,
      decision: 'needs_investigation',
      reasonCode: 'provider_instability',
      note: 'Check provider status.',
    });
  });

  it('rejects a dismissal-only reason on an investigation decision', () => {
    expect(() => contracts.failedAiRunDecisionCommandSchema.parse({
      version: 1,
      expectedReviewVersion: 0,
      decision: 'needs_investigation',
      reasonCode: 'no_action_needed',
      note: null,
    })).toThrow();
  });

  it('rejects unknown fields and raw error projections', () => {
    expect(() => contracts.failedAiRunListItemSchema.parse({
      ...validListItem,
      errorDetail: 'provider password=secret',
    })).toThrow();
  });
});
```

Add literal cases for all enums, `limit` boundaries 1 and 100, default query values, malformed UUID/timestamp/cursor values, whitespace-only notes, notes over 1000 characters, negative versions, and every incompatible decision/reason pair. The production change each test catches is either accepting an unsafe projection or accepting an invalid command branch.

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test -- src/review/failed-ai-run.test.ts
```

Expected: FAIL because the failed-run review exports do not exist.

- [ ] **Step 3: Add the minimal strict Zod contracts**

Use `z.strictObject`, bounded strings, UUIDs, ISO timestamps, integer bounds, and a single `superRefine` that enforces:

```ts
const investigationReasons = new Set([
  'provider_instability',
  'schema_regression',
  'grounding_regression',
  'source_data_problem',
  'suspected_prompt_injection',
  'other',
]);
```

Dismiss reasons are `transient_failure`, `duplicate_or_superseded`, `expected_invalid_input`, `no_action_needed`, and `other`. Export the schemas and inferred types from `packages/contracts/src/index.ts`.

- [ ] **Step 4: Run GREEN and package gates**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test -- src/review/failed-ai-run.test.ts
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts lint
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts typecheck
```

Expected: all commands exit 0.

- [ ] **Step 5: Update workbook/HANDOVER and commit**

Record the exact RED/GREEN output and commit:

```bash
git commit -m "feat(contracts): add failed AI run review contracts"
```

---

### Task 2: Add append-only review schema, protected reads, and transactional command

**Files:**
- Create: `supabase/migrations/20260822000100_failed_ai_run_review.sql`
- Create: `supabase/tests/011_failed_ai_run_review.test.sql`
- Modify: `docs/tasks/failed-ai-run-review-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: Task 1 enums and shapes as the external contract.
- Produces: `ai_run_review_decisions`, `ai_run_review_commands`, `list_failed_ai_runs`, `get_failed_ai_run`, `execute_failed_ai_run_review`, SQLSTATEs `AR101`–`AR105`.

- [ ] **Step 1: Write the pgTAP RED suite before the migration**

The test fixture creates exact UUIDs for one active reviewer, one revoked reviewer, one ordinary user, three failed runs, one success, and one skipped run. Start the plan with catalog and authorization assertions:

```sql
select has_table('public', 'ai_run_review_decisions');
select has_table('public', 'ai_run_review_commands');
select has_function('public', 'list_failed_ai_runs');
select has_function('public', 'get_failed_ai_run');
select has_function('public', 'execute_failed_ai_run_review');
```

Then exercise real functions with request claims:

```sql
select set_config('request.jwt.claim.sub', :'active_reviewer_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$ select * from public.list_failed_ai_runs('all', 'all', null, null, 25) $$,
  'active reviewer can list failures'
);
```

Assert ordinary/revoked users receive `AR104`, success/skipped runs receive `AR103`, output keys do not include `error_detail`, `output`, `usage`, `raw_text`, or URL fields, and table SELECT/INSERT/UPDATE/DELETE remain denied.

Command behavior assertions must cover:

- first decision creates exactly one decision, receipt, and outbox event;
- exact replay returns the same IDs with `replayed=true` and row counts unchanged;
- changed input under the same key raises `AR102` and creates no row;
- stale version raises `AR101` and creates no row;
- invalid reason combination raises `AR105` and creates no row;
- decisions and receipts reject UPDATE/DELETE with SQLSTATE `55000`;
- forced outbox failure rolls back decision and receipt;
- outbox payload contains only version, run/decision IDs, reviewVersion, decision, reasonCode, and occurredAt.

- [ ] **Step 2: Run RED on an isolated disposable Supabase database**

```bash
supabase test db supabase/tests/011_failed_ai_run_review.test.sql
```

Expected: FAIL because the tables and functions are absent. Confirm the database endpoint is the disposable test project before running any reset.

- [ ] **Step 3: Add the forward migration**

Implement the two tables, exact constraints/indexes, RLS, append-only triggers, fixed-search-path security-definer functions, and least-privilege grants from the spec. The command must derive identity exactly as:

```sql
requested_reviewer_id := auth.uid();
if requested_reviewer_id is null then
  raise exception 'reviewer_required' using errcode = 'AR104';
end if;
```

Lock the run before reading the latest review version:

```sql
select * into strict run_record
from public.ai_runs
where id = p_ai_run_id
  and status in ('provider_error', 'schema_invalid_after_repair', 'grounding_failed')
for update;
```

Insert the decision, command receipt, and existing `outbox_events` row in the same function transaction. Do not catch unexpected exceptions inside the function.

- [ ] **Step 4: Run focused GREEN and sensitivity checks**

```bash
supabase db reset --yes
supabase test db supabase/tests/011_failed_ai_run_review.test.sql
```

Expected: focused file exits 0. Perform and restore three sensitivity mutations: remove the revoked-role predicate, omit the outbox insert, and allow `error_detail` in the list projection. Each mutation must turn a named assertion RED; restore exact bytes and rerun GREEN.

- [ ] **Step 5: Run the full database gate**

```bash
supabase test db
```

Expected: every pgTAP file exits 0. Do not proceed if an existing file regresses.

- [ ] **Step 6: Update workbook/HANDOVER and commit**

```bash
git commit -m "feat(db): add failed AI run review boundary"
```

---

### Task 3: Regenerate database types and add the bearer-scoped repository

**Files:**
- Create: `packages/database/src/review/failed-ai-run-review-repository.ts`
- Create: `packages/database/src/review/entry.ts`
- Create: `packages/database/src/review/browser-denied.ts`
- Create: `packages/database/src/tests/failed-ai-run-review-repository.test.ts`
- Create: `packages/database/src/tests/failed-ai-run-review-repository.integration.test.ts`
- Modify: `packages/database/package.json`
- Modify: `packages/database/src/generated/database.types.ts`
- Modify: `docs/tasks/failed-ai-run-review-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Produces:

```ts
interface FailedAiRunReviewRepository {
  list(input: { accessToken: string; query: FailedAiRunListQuery }): Promise<FailedAiRunListResult>;
  get(input: { accessToken: string; runId: string }): Promise<FailedAiRunDetail>;
  decide(input: {
    accessToken: string;
    runId: string;
    idempotencyKey: string;
    command: FailedAiRunDecisionCommand;
  }): Promise<FailedAiRunDecisionResult>;
}
```

- Produces an injected unit-test port:

```ts
type FailedAiRunReviewRpcCall = {
  accessToken: string;
  functionName: 'list_failed_ai_runs' | 'get_failed_ai_run' | 'execute_failed_ai_run_review';
  args: Readonly<Record<string, string | number | null>>;
};

interface FailedAiRunReviewRpc {
  invoke(call: FailedAiRunReviewRpcCall): Promise<unknown>;
}
```

- Produces stable repository errors: `reviewer_required`, `review_run_not_found`, `review_version_conflict`, `review_idempotency_conflict`, `invalid_review_command`, `review_query_failed`, and `review_persistence_failed`.
- The token is request-local and is never stored on a singleton, included in errors, or logged.

- [ ] **Step 1: Regenerate types twice and prove determinism**

```bash
pnpm db:types
shasum -a 256 packages/database/src/generated/database.types.ts
pnpm db:types
shasum -a 256 packages/database/src/generated/database.types.ts
```

Expected: hashes match. Generated code is exempt from test-first only; no manual edits are permitted.

- [ ] **Step 2: Write repository RED tests against an injected RPC port**

```ts
it('uses the caller token only for the current list RPC', async () => {
  const calls: FailedAiRunReviewRpcCall[] = [];
  const rpc: FailedAiRunReviewRpc = {
    invoke: async (call) => {
      calls.push(call);
      return [];
    },
  };
  const repository = createFailedAiRunReviewRepositoryFromRpc(rpc);

  await repository.list({
    accessToken: 'session-token',
    query: { reviewState: 'all', status: 'all', cursor: null, limit: 25 },
  });

  expect(calls).toEqual([{
    accessToken: 'session-token',
    functionName: 'list_failed_ai_runs',
    args: { p_review_state: 'all', p_status: 'all', p_cursor_created_at: null,
      p_cursor_id: null, p_limit: 26 },
  }]);
});
```

Add behavior cases for strict result parsing, `limit + 1`, next cursor from the final returned item, malformed cursors rejected before RPC, exact command fields, exact replay parsing, SQLSTATE mappings, unexpected-error sanitization, and browser export failure.

- [ ] **Step 3: Run RED**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/database test -- src/tests/failed-ai-run-review-repository.test.ts
```

Expected: FAIL because the repository module/export is absent.

- [ ] **Step 4: Implement the minimal repository**

Use a per-call Supabase client configured with `persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false`, and the one request's `Authorization: Bearer <token>` header. The injected port remains the unit-test boundary. Parse all rows with Task 1 schemas and discard the extra pagination row after forming the next cursor.

Add package export:

```json
"./failed-ai-run-review": {
  "browser": "./src/review/browser-denied.ts",
  "default": "./src/review/entry.ts"
}
```

- [ ] **Step 5: Run GREEN and real integration**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/database test -- src/tests/failed-ai-run-review-repository.test.ts
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/database lint
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/database typecheck
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/database test:integration
```

The integration fixture obtains real active-reviewer and ordinary-user access tokens from the disposable Supabase Auth endpoint, verifies the safe list/detail/decision flow, and cleans up exact fixture IDs only.

- [ ] **Step 6: Update workbook/HANDOVER and commit**

```bash
git commit -m "feat(database): add failed AI run review repository"
```

---

### Task 4: Add authenticated review BFF handlers and routes

**Files:**
- Create: `apps/web/src/lib/failed-ai-run-review-handlers.ts`
- Create: `apps/web/src/tests/failed-ai-run-review-handlers.test.ts`
- Create: `apps/web/src/app/api/v1/review/ai-runs/route.ts`
- Create: `apps/web/src/app/api/v1/review/ai-runs/[runId]/route.ts`
- Create: `apps/web/src/app/api/v1/review/ai-runs/[runId]/decisions/route.ts`
- Modify: `docs/tasks/failed-ai-run-review-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: existing `AuthenticatedUserVerifier`, Task 1 contracts, and Task 3 repository.
- Produces: `createFailedAiRunListHandler`, `createFailedAiRunDetailHandler`, and `createFailedAiRunDecisionHandler`.

- [ ] **Step 1: Write handler RED tests**

Use real `Request`/`Response` objects and injected auth/repository ports. Cover:

```ts
it('does not call the repository when bearer authentication fails', async () => {
  const reviews = new RecordingReviewRepository();
  const response = await listHandler({ auth: new StaticAuth(null), reviews })(
    new Request('http://local/api/v1/review/ai-runs'),
  );
  expect(response.status).toBe(401);
  expect(reviews.calls).toEqual([]);
});
```

Add literal assertions for shared success metadata, filters/cursor/limit, UUID validation, strict JSON, missing/invalid Idempotency-Key, every stable 403/404/409 mapping, and sanitized 500 responses. Include a thrown error containing fake token/database/password/source text and assert none appears in serialized output.

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web test -- src/tests/failed-ai-run-review-handlers.test.ts
```

Expected: FAIL because the handlers do not exist.

- [ ] **Step 3: Implement minimal handlers and thin route composition**

Parse the bearer token only after the existing verifier succeeds. Pass the token request-locally to the repository and never include it in an error object. Route modules only compose environment values, verifier, repository, UUID generator, and handler.

Error messages remain bounded English API copy; reviewer-facing Chinese text belongs to the UI.

- [ ] **Step 4: Run GREEN and web static gates**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web test -- src/tests/failed-ai-run-review-handlers.test.ts
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web lint
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web typecheck
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git commit -m "feat(web): add failed AI run review API"
```

---

### Task 5: Add minimal reviewer session and API clients

**Files:**
- Create: `apps/web/src/lib/supabase-browser.ts`
- Create: `apps/web/src/lib/review-session.ts`
- Create: `apps/web/src/lib/review-api-client.ts`
- Create: `apps/web/src/tests/review-session.test.ts`
- Create: `apps/web/src/tests/review-api-client.test.ts`
- Modify: `docs/tasks/failed-ai-run-review-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Produces the following injected boundary and controller:

```ts
interface ReviewAuthPort {
  signInWithPassword(input: { email: string; password: string }): Promise<{
    accessToken: string | null;
  }>;
  getAccessToken(): Promise<string | null>;
  signOut(): Promise<void>;
}

interface ReviewSessionController {
  signIn(email: string, password: string): Promise<
    { ok: true } | { ok: false; code: 'sign_in_failed' }
  >;
  getAccessToken(): Promise<string | null>;
  signOut(): Promise<void>;
}
```

- Produces `ReviewApiClient` with `list`, `get`, and `decide`; all methods obtain a current token from the injected session controller.

- [ ] **Step 1: Write session and API client RED tests**

```ts
it('returns a bounded sign-in failure without provider text', async () => {
  const auth: ReviewAuthPort = {
    signInWithPassword: async () => {
      throw new Error('Supabase password=secret internal provider detail');
    },
    getAccessToken: async () => null,
    signOut: async () => undefined,
  };
  const controller = createReviewSessionController(auth);
  await expect(controller.signIn('reviewer@example.test', 'password'))
    .resolves.toEqual({ ok: false, code: 'sign_in_failed' });
});

it('adds the current token and a fresh idempotency key to a decision request', async () => {
  const recordedHeaders = new Headers();
  const client = createReviewApiClient({
    session: {
      signIn: async () => ({ ok: true as const }),
      getAccessToken: async () => 'access-token',
      signOut: async () => undefined,
    },
    fetch: async (_input, init) => {
      new Headers(init?.headers).forEach((value, key) => recordedHeaders.set(key, value));
      return Response.json({
        ok: true,
        data: {
          version: 1,
          commandId: 'a2000000-0000-4000-8000-000000000001',
          runId: 'a1000000-0000-4000-8000-000000000001',
          decisionId: 'a3000000-0000-4000-8000-000000000001',
          reviewVersion: 1,
          reviewState: 'needs_investigation',
          replayed: false,
        },
        meta: { requestId: 'request-1', nextCursor: null },
      });
    },
    ids: { generate: () => 'review-run-1' },
  });
  await client.decide('a1000000-0000-4000-8000-000000000001', {
    version: 1,
    expectedReviewVersion: 0,
    decision: 'needs_investigation',
    reasonCode: 'provider_instability',
    note: null,
  });
  expect(recordedHeaders.get('authorization')).toBe('Bearer access-token');
  expect(recordedHeaders.get('idempotency-key')).toBe('review-run-1');
});
```

Cover missing/expired sessions, generic sign-in failures, sign-out, shared envelope parsing, 401 redirect signal, 403 forbidden state, 409 conflict result, and malformed success payload rejection.

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web test -- src/tests/review-session.test.ts src/tests/review-api-client.test.ts
```

- [ ] **Step 3: Implement the minimal clients**

The browser client uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do not add service-role or database environment values. Never persist a copy of the access token outside the Supabase session implementation.

- [ ] **Step 4: Run GREEN**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web test -- src/tests/review-session.test.ts src/tests/review-api-client.test.ts
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web lint
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web typecheck
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git commit -m "feat(web): add reviewer session client"
```

---

### Task 6: Add sign-in and safe failed-run review pages

**Files:**
- Create: `apps/web/src/app/review/review-shell.tsx`
- Create: `apps/web/src/app/review/sign-in/page.tsx`
- Create: `apps/web/src/app/review/ai-runs/page.tsx`
- Create: `apps/web/src/app/review/ai-runs/[runId]/page.tsx`
- Create: `apps/web/src/components/review/sign-in-form.tsx`
- Create: `apps/web/src/components/review/failed-ai-run-list.tsx`
- Create: `apps/web/src/components/review/failed-ai-run-detail.tsx`
- Create: `apps/web/src/components/review/failed-ai-run-decision-form.tsx`
- Create: `apps/web/src/tests/review-components.test.ts`
- Modify: `apps/web/src/app/globals.css`
- Modify: `docs/tasks/failed-ai-run-review-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: Task 1 DTOs and Task 5 clients.
- Produces accessible review pages with no raw content rendering path.

- [ ] **Step 1: Write component behavior RED tests**

Use `react-dom/server` for stateless view components and pure submitted-state helpers for interactive transitions. Named breaks include exposing an unsafe field, offering an incompatible reason, losing the expected version, and rendering a decision as editable.

```ts
it('renders safe metadata but never renders provider error detail', () => {
  const html = renderToStaticMarkup(createElement(FailedAiRunDetail, {
    detail: {
      version: 1,
      run: {
        version: 1,
        runId: 'a1000000-0000-4000-8000-000000000001',
        status: 'provider_error',
        safeFailureCode: 'provider_error',
        stage: 'extract_discovered_item',
        inputKind: 'discovered_item',
        modelId: 'review-test-model',
        promptVersion: 'extract-v1',
        schemaVersion: 'candidate-v1',
        pipelineVersion: 'pipeline-v1',
        project: null,
        source: null,
        createdAt: '2026-08-22T00:00:00.000Z',
        reviewState: 'unreviewed',
        reviewVersion: 0,
        latestDecisionAt: null,
      },
      input: {
        kind: 'discovered_item',
        id: 'a4000000-0000-4000-8000-000000000001',
        collectedAt: null,
      },
      decisions: [],
    },
  }));
  expect(html).toContain('provider_error');
  expect(html).toContain('pipeline-v1');
  expect(html).not.toMatch(/password|raw_text|error_detail|https?:\/\//i);
});
```

Add cases for email/password labels, generic login error, loading state, empty list, all filters, safe dates, chronological history, reason options per decision, `expectedReviewVersion`, 409 refresh copy, 403 copy, and sign-out.

- [ ] **Step 2: Run RED**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web test -- src/tests/review-components.test.ts
```

- [ ] **Step 3: Implement minimal review UI**

Use a separate review shell. Keep all rendering fields enumerated; never spread database/API objects into JSX. The detail page refetches after accepted/replayed decisions and on version conflict. The sign-in page contains no registration/reset links.

Add only `.review-*` scoped CSS selectors to `globals.css`; do not restyle public pages.

- [ ] **Step 4: Run GREEN and build**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web test
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web lint
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web typecheck
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web build
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git commit -m "feat(web): add failed AI run review interface"
```

---

### Task 7: Run end-to-end review regression and security matrix

**Files:**
- Modify: `packages/database/src/tests/failed-ai-run-review-repository.integration.test.ts`
- Modify: `apps/web/src/tests/failed-ai-run-review-handlers.test.ts`
- Modify: `docs/tasks/failed-ai-run-review-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Validates the completed contract → database → repository → BFF boundary.

- [ ] **Step 1: Add a RED regression for a real reviewer session**

The real integration creates exact fixture users and runs, signs in the active reviewer through Supabase Auth, lists only the three failed statuses, opens one safe detail, appends `needs_investigation`, replays it, appends `dismiss` at the next version, and verifies two immutable decisions/two outbox events. The ordinary and revoked users must receive reviewer denial.

Add an HTTP-level handler regression proving a fake raw `error_detail` in a malformed repository result becomes a sanitized 500 rather than reaching JSON.

- [ ] **Step 2: Observe RED, implement only missing boundary corrections, and return GREEN**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/database test:integration
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web test
```

If the test is already green, strengthen it until a realistic mutation—returning raw error detail or skipping role denial—turns it red before accepting it as regression coverage.

- [ ] **Step 3: Run the explicit security matrix**

Verify these principals separately:

```text
anon                     list/get/decide denied; tables denied
ordinary authenticated   list/get/decide AR104; tables denied
revoked reviewer         list/get/decide AR104; tables denied
active reviewer          safe RPCs allowed; tables denied
ai_stage_worker           review tables/functions denied
collection_worker         review tables/functions denied
service_role              review tables denied; no canonical bypass added
```

- [ ] **Step 4: Update workbook/HANDOVER and commit**

```bash
git commit -m "test(review): cover failed AI run workflow"
```

---

### Task 8: Complete documentation and repository verification

**Files:**
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/tasks/failed-ai-run-review-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Documents local reviewer provisioning, sign-in, focused tests, migration safety, scope exclusions, and production prerequisites without credentials.

- [ ] **Step 1: Document the operator flow**

Add commands for running the app, provisioning an Auth user and active role through the existing trusted administrative process, opening `/review/sign-in`, and running focused tests. State that the UI never creates accounts or roles and that failed-run retry remains excluded.

- [ ] **Step 2: Run focused and full verification with fresh output**

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/database test
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/web test
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm verify
supabase test db
git diff --check
```

Expected: all applicable commands exit 0. Database verification must use the disposable environment; do not reset production.

- [ ] **Step 3: Perform a secret and unsafe-field review**

```bash
rg -n "service_role|private_key|seed phrase|mnemonic|password=|Bearer |error_detail|raw_text|AI_MODEL_API_KEY" \
  apps/web packages/contracts packages/database supabase/migrations/20260822000100_failed_ai_run_review.sql
```

Review every match. Allowed matches are prohibitions, test fixtures, server-only bearer plumbing, database predicates, and fields explicitly omitted from safe projections. No actual secret may appear.

- [ ] **Step 4: Update final workbook/HANDOVER and commit**

```bash
git commit -m "docs: complete failed AI run review"
```

---

### Task 9: Prepare production rollout as a separate controlled checkpoint

**Files:**
- Modify: `docs/tasks/failed-ai-run-review-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: all locally verified Phase 6B artifacts.
- Produces: a deployment-ready state or a documented external prerequisite; this task does not invent a human reviewer account.

- [ ] **Step 1: Confirm production prerequisites without mutation**

Verify the current production migration ledger, Auth/API reachability, backup/recovery posture, and existence of a user-approved human reviewer Auth account with an active reviewer role. Never print its password or access token.

- [ ] **Step 2: Stop if human reviewer provisioning is absent**

Record `PRODUCTION_READY — REVIEWER_ACCOUNT_REQUIRED` in the workbook and HANDOVER. Ask the project owner to provision or identify the human reviewer account. Do not reuse the operational fixture reviewer as a human login and do not create an account with guessed identity data.

- [ ] **Step 3: After explicit rollout authority, apply and register the migration atomically**

Use the established Phase 6A remote procedure: exact server/container preflight, transaction-wrapped migration, migration-ledger registration, schema/grant verification, and no credential output.

- [ ] **Step 4: Run production smoke checks**

Verify active reviewer login/list/detail/decision against a designated non-canonical failed-run fixture, exact idempotent replay, anonymous and ordinary-user denial, safe response-key scan, one decision/receipt/outbox set, append-only protection, and unchanged public health/opportunity/project routes.

- [ ] **Step 5: Update deployment evidence and commit**

Record exact counts, HTTP statuses, migration version, and sanitized security-matrix results in the workbook and HANDOVER. Commit only documentation created by the rollout:

```bash
git commit -m "docs: record failed AI run review rollout"
```

Production is marked deployed only after these smoke checks pass.

---

## Plan self-review

- Every approved spec requirement maps to Tasks 1–9.
- No task mutates `ai_runs`, retries AI work, exposes raw content, or provisions guessed human identity.
- Contract property names are consistent across database projections, repository inputs, handlers, and UI.
- The only generated file is regenerated twice and not manually edited.
- Every behavior task includes a named RED failure, focused GREEN command, documentation update, and commit boundary.
- Production remains a distinct controlled checkpoint after local verification.
