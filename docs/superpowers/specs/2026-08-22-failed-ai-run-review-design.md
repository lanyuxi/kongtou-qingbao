# Phase 6B Failed AI Run Review Design

**Status:** Approved in conversation on 2026-08-22

## 1. Purpose

Phase 6B adds a human review workflow for failed AI extraction runs. Active reviewers can sign in with a real Supabase session, inspect a safe projection of failed runs, and append either a `needs_investigation` or `dismiss` decision. Every accepted decision is version checked, idempotent, attributable to the authenticated user, and committed with a transactional outbox event.

This phase does not retry AI work. The current `ai_runs` uniqueness key admits one run per stage, input, input hash, and pipeline version, so retry and attempt history require a separate later design.

## 2. Product and safety rules

- `ai_runs` remains historical, append-only input. Review never edits its status, output, error detail, or timestamps.
- Only `provider_error`, `schema_invalid_after_repair`, and `grounding_failed` are reviewable failures.
- `succeeded` and `skipped_no_content` never enter this queue.
- Review decisions are append-only and retain contradictory or superseding history.
- Reviewer identity comes from the verified Supabase session. APIs and database functions do not accept a caller-selected reviewer ID.
- Active `reviewer`, `senior_reviewer`, `security_reviewer`, or `admin` grants authorize access. Revoked grants do not.
- Browser and API responses never expose raw source bodies, AI output, prompts, usage payloads, credentials, URLs, reviewer email addresses, or raw `error_detail`.
- Source and provider text remains untrusted data. The UI renders only bounded, normalized metadata and stable reason codes.
- The review decision, idempotency receipt, and outbox event commit in one PostgreSQL transaction.
- Ordinary authenticated users, anonymous users, AI workers, collectors, and browser code receive no table DML path.

## 3. Scope

### Included

- Strict cross-boundary contracts for list/detail projections, filters, cursors, decisions, and results.
- A forward-only database migration for append-only review decisions and command receipts.
- Security-definer read and command functions that derive the caller from `auth.uid()` and enforce an active reviewer role.
- Cursor-paginated list and detail BFF endpoints under `/api/v1/review/ai-runs`.
- An idempotent, optimistic-concurrency decision endpoint.
- Minimal email/password sign-in, failed-run list, failed-run detail, decision history, and decision form pages.
- Contract, database/RLS, repository, handler, authentication-state, and UI behavior tests.
- Handover and development workbook updates after each completed implementation task.

### Excluded

- Retrying, replaying, repairing, or deleting failed AI runs.
- Changing the existing AI pipeline idempotency key or adding attempt numbers.
- Registration, invitation, password reset, account administration, or reviewer-role administration.
- Displaying raw source text, raw model output, raw provider errors, prompts, token usage, or hidden URLs.
- Editing or retracting a prior review decision.
- Automatic incident creation, notification delivery, or general dead-letter handling for non-AI jobs.
- A general-purpose outbox dispatcher.

## 4. Accepted architecture

The accepted option is an append-only review ledger behind authenticated Supabase RPC functions and a thin Next.js BFF.

```text
reviewer browser
  | email/password session; anon key only
  | Bearer access token
  v
Next.js /api/v1/review/ai-runs
  | verify token with Supabase Auth
  | call RPC using the same access token
  v
security-definer PostgreSQL functions
  | auth.uid() + active reviewer-role check
  | bounded projections only
  | lock ai_run + expected version + idempotency
  v
ai_run_review_decisions + ai_run_review_commands + outbox_events
```

Rejected alternatives:

1. Mutating review fields on `ai_runs` would erase review history and mix immutable execution evidence with human workflow state.
2. A server database login plus an environment reviewer UUID would not preserve real per-human attribution.
3. Direct browser table access would widen the exposed data surface and make it harder to guarantee that raw provider details stay hidden.
4. Reusing candidate-review tables would conflate failed execution triage with canonical intelligence Promotion.

## 5. Contracts

`packages/contracts/src/review/failed-ai-run.ts` is the only cross-boundary contract source. Every object is strict.

### 5.1 Failure and review enums

```ts
type FailedAiRunStatus =
  | 'provider_error'
  | 'schema_invalid_after_repair'
  | 'grounding_failed';

type FailedAiRunReviewState =
  | 'unreviewed'
  | 'needs_investigation'
  | 'dismissed';

type FailedAiRunDecision = 'needs_investigation' | 'dismiss';

type FailedAiRunReasonCode =
  | 'provider_instability'
  | 'schema_regression'
  | 'grounding_regression'
  | 'source_data_problem'
  | 'suspected_prompt_injection'
  | 'transient_failure'
  | 'duplicate_or_superseded'
  | 'expected_invalid_input'
  | 'no_action_needed'
  | 'other';
```

Valid decision/reason combinations are deterministic:

- `needs_investigation`: `provider_instability`, `schema_regression`, `grounding_regression`, `source_data_problem`, `suspected_prompt_injection`, or `other`.
- `dismiss`: `transient_failure`, `duplicate_or_superseded`, `expected_invalid_input`, `no_action_needed`, or `other`.

### 5.2 List query and cursor

```ts
type FailedAiRunListQuery = {
  reviewState: 'all' | FailedAiRunReviewState;
  status: 'all' | FailedAiRunStatus;
  cursor: string | null;
  limit: number; // integer 1..100, default 25
};
```

The opaque base64url cursor encodes strict JSON `{ createdAt: string, id: string }`. Ordering is always `ai_runs.created_at desc, ai_runs.id desc`. A malformed cursor returns `invalid_request`; clients cannot supply arbitrary SQL sort keys.

### 5.3 Safe list item

```ts
type FailedAiRunListItem = {
  version: 1;
  runId: string;
  status: FailedAiRunStatus;
  safeFailureCode: FailedAiRunStatus;
  stage: string;
  inputKind: 'discovered_item' | 'raw_item';
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  pipelineVersion: string;
  project: { id: string; slug: string; name: string } | null;
  source: { id: string; name: string; sourceType: string } | null;
  createdAt: string;
  reviewState: FailedAiRunReviewState;
  reviewVersion: number;
  latestDecisionAt: string | null;
};
```

`safeFailureCode` deliberately repeats the bounded run status in version 1. It does not parse or reveal `error_detail`.

### 5.4 Detail and decision history

The list result and detail projection use these exact shapes:

```ts
type FailedAiRunListResult = {
  version: 1;
  items: FailedAiRunListItem[];
};

type FailedAiRunDetail = {
  version: 1;
  run: FailedAiRunListItem;
  input: {
    kind: 'discovered_item' | 'raw_item';
    id: string;
    collectedAt: string | null;
  };
  decisions: FailedAiRunReviewDecisionRecord[];
};
```

The detail projection adds the bounded input reference and all review decisions ordered by `review_version asc`. It does not add raw content. `collectedAt` is the Raw Item collection time when the input resolves to a Raw Item and otherwise `null`; it is not inferred from publication time.

```ts
type FailedAiRunReviewDecisionRecord = {
  version: 1;
  decisionId: string;
  reviewVersion: number;
  decision: FailedAiRunDecision;
  reasonCode: FailedAiRunReasonCode;
  note: string | null;
  reviewerUserId: string;
  createdAt: string;
};
```

Reviewer UUID is retained for audit attribution. Reviewer email and profile display name are not returned in version 1.

### 5.5 Decision command and result

```ts
type FailedAiRunDecisionCommand = {
  version: 1;
  expectedReviewVersion: number; // integer >= 0
  decision: FailedAiRunDecision;
  reasonCode: FailedAiRunReasonCode;
  note: string | null; // trim; 1..1000 when present
};

type FailedAiRunDecisionResult = {
  version: 1;
  commandId: string;
  runId: string;
  decisionId: string;
  reviewVersion: number;
  reviewState: Exclude<FailedAiRunReviewState, 'unreviewed'>;
  replayed: boolean;
};
```

The HTTP transport supplies `Idempotency-Key` separately. It must be trimmed and 1..255 characters.

## 6. Data model

One forward-only migration, `20260822000100_failed_ai_run_review.sql`, adds the following tables and functions. Previously applied migrations are never edited.

### 6.1 `ai_run_review_decisions`

```text
id uuid primary key
ai_run_id uuid not null -> ai_runs on delete restrict
review_version bigint not null check > 0
reviewer_user_id uuid not null -> profiles on delete restrict
decision text not null = needs_investigation | dismiss
reason_code text not null
note text null, trimmed length 1..1000
created_at timestamptz not null
unique (ai_run_id, review_version)
```

A shape constraint enforces the decision/reason combinations from the contracts. An append-only trigger rejects updates and deletes.

### 6.2 `ai_run_review_commands`

```text
id uuid primary key
reviewer_user_id uuid not null -> profiles on delete restrict
ai_run_id uuid not null -> ai_runs on delete restrict
idempotency_key text not null, exact trimmed bytes, length 1..255
expected_review_version bigint not null check >= 0
decision text not null
reason_code text not null
note text null
resulting_review_version bigint not null check > 0
decision_id uuid not null -> ai_run_review_decisions on delete restrict
created_at timestamptz not null
unique (reviewer_user_id, idempotency_key)
```

The receipt stores the validated command fields directly. An exact replay compares every stored input field. Reusing a key with different input returns `review_idempotency_conflict`. Receipts are append-only.

### 6.3 Outbox event

The command inserts `intelligence.ai_run.reviewed.v1` into the existing `outbox_events` table with:

```json
{
  "version": 1,
  "runId": "uuid",
  "reviewVersion": 1,
  "decisionId": "uuid",
  "decision": "needs_investigation",
  "reasonCode": "provider_instability",
  "occurredAt": "UTC timestamp"
}
```

The payload excludes notes, source data, errors, reviewer identity, URLs, credentials, and tokens. Aggregate type is `ai_run`; aggregate ID is the run ID; aggregate version is the resulting review version.

## 7. Database functions and authorization

### 7.1 `list_failed_ai_runs`

- Runs as a fixed-search-path security definer owned by `postgres`.
- Requires non-null `auth.uid()` and an active reviewer role.
- Accepts validated state/status filters, cursor fields, and limit.
- Reads only the three reviewable failure statuses.
- Derives the latest decision by `review_version desc`.
- Resolves project/source metadata through the input relationships but returns only the safe projection.
- Fetches `limit + 1` rows so the BFF can produce the next cursor.

### 7.2 `get_failed_ai_run`

- Enforces the same session and reviewer checks.
- Returns one safe detail projection plus append-only decision history.
- Returns `review_run_not_found` for absent or non-reviewable runs so callers cannot distinguish hidden statuses.

### 7.3 `execute_failed_ai_run_review`

The function receives the run ID, validated command JSON, Idempotency-Key, and request time. Reviewer identity is always `auth.uid()`.

Transaction steps:

1. Require an authenticated active reviewer.
2. Validate the exact command key set and bounded fields.
3. Look up `(auth.uid(), idempotency_key)`. Return an exact stored replay or reject conflicting reuse.
4. Lock the selected `ai_runs` row with `FOR UPDATE` and require a reviewable failure status.
5. Calculate current review version from the latest appended decision and compare `expectedReviewVersion`.
6. Append the next review decision.
7. Append the command receipt.
8. Append the outbox event.
9. Return the strict result row.

Stable SQLSTATE mappings:

```text
AR101 review_version_conflict
AR102 review_idempotency_conflict
AR103 review_run_not_found
AR104 reviewer_required
AR105 invalid_review_command
```

The BFF maps only these stable codes. Unexpected database details become a sanitized `review_persistence_failed` response.

### 7.4 Grants and RLS

- Enable RLS on both new tables.
- Revoke all table privileges from `public`, `anon`, `authenticated`, `service_role`, and application worker roles.
- Revoke function execution from `public` and `anon`.
- Grant only the three protected functions to `authenticated`.
- Functions re-check `auth.uid()` and active reviewer grants internally; authenticated is not sufficient by itself.
- No function returns `error_detail`, `output`, `usage`, raw item bodies, source URLs, or auth claims.

## 8. HTTP API

All endpoints use shared success/error envelopes and generated request IDs.

### `GET /api/v1/review/ai-runs`

Parses `reviewState`, `status`, `cursor`, and `limit`; defaults to `reviewState=all`, `status=all`, `limit=25`. Returns safe list items and `meta.nextCursor`.

### `GET /api/v1/review/ai-runs/[runId]`

Returns the safe detail projection and full append-only decision history.

### `POST /api/v1/review/ai-runs/[runId]/decisions`

Requires Bearer authentication and `Idempotency-Key`. Validates the strict command and calls the transactional RPC.

HTTP mappings:

```text
400 invalid_request | invalid_cursor
401 unauthorized
403 reviewer_required
404 review_run_not_found
409 review_version_conflict | review_idempotency_conflict
500 review_query_failed | review_persistence_failed
```

No response contains the bearer token, Supabase error text, SQL text, database URL, provider error, or source body.

## 9. Browser authentication

`/review/sign-in` is a client-side page using the existing public Supabase URL and anon key. It calls `signInWithPassword`, stores the normal Supabase browser session, and redirects to `/review/ai-runs` on success.

The phase adds no custom password storage and no privileged browser key. Failure copy is intentionally generic. The review application obtains the access token from the Supabase session and sends it only in the BFF Authorization header.

The protected review pages render a neutral loading state until session resolution. Missing or expired sessions redirect to `/review/sign-in`. A valid session without an active reviewer grant receives the BFF `403` state and cannot see review data.

Sign-out clears the Supabase session and returns to `/review/sign-in`.

## 10. User interface

### Sign-in

- Email and password fields.
- Submit and generic error states.
- No registration, reset, or role-management links.

### List

- Filters for all/unreviewed/needs investigation/dismissed and failure status.
- Columns for status, stage, model, project/source, pipeline version, occurred time, and review state.
- Cursor-based next navigation.
- Explicit empty, unauthorized, expired-session, and sanitized failure states.

### Detail

- Safe run metadata and bounded input reference.
- Stable failure explanation derived from status.
- Chronological decision history.
- Decision, compatible reason, optional note, and submit action.
- The form submits the currently displayed `reviewVersion`; a `409` prompts a refetch rather than overwriting a concurrent decision.
- After an accepted decision or idempotent replay, refetch detail and history.

The existing public application shell is not reused for sign-in. Review pages use a small review-specific shell so public navigation does not imply that the reviewer area is public.

## 11. Testing

TDD applies to every behavior-bearing TypeScript change.

- Contract tests reject unknown keys, invalid cursors, incompatible reason combinations, invalid limits, and unsafe notes.
- pgTAP tests cover table shapes, append-only enforcement, anonymous and ordinary-authenticated denial, active reviewer access, revoked reviewer denial, bounded projections, idempotent replay, key conflicts, version conflicts, hidden success/skipped runs, and transactional outbox writes.
- Repository tests verify strict result parsing, bearer-scoped RPC calls, cursor encoding, and stable error mapping without secret leakage.
- Handler tests cover 400/401/403/404/409/500 mappings and shared envelopes.
- Authentication/UI tests cover sign-in success/failure, expired-session redirect, safe list/detail rendering, compatible reason options, concurrent-version refresh, and sign-out.
- Existing AI extraction, Promotion, scoring, and public page tests remain unchanged and passing.

The narrowest relevant tests run after each red-green cycle. Completion requires `pnpm verify`; database completion also requires the migration/RLS suite against the available Supabase environment.

## 12. Rollout and success criteria

Local acceptance precedes production rollout. Production migration is forward-only and registered only after its transaction commits. Reviewer accounts and active roles are provisioned separately from the sign-in page.

Phase 6B is complete when:

1. An active reviewer can sign in, list safe failed runs, open a detail, and append both supported decision types.
2. Anonymous, ordinary authenticated, revoked reviewer, AI worker, collector, and service-role table access is denied.
3. No API or page exposes `error_detail`, output, usage, prompts, source bodies, credentials, URLs, or tokens.
4. Idempotent replay creates no duplicate decision or outbox event.
5. Conflicting idempotency reuse and stale review versions return `409` without mutation.
6. Decision, receipt, and outbox rows commit or roll back together.
7. Historical review decisions cannot be updated or deleted.
8. Existing extraction and public intelligence flows remain passing under `pnpm verify`.
9. The production smoke matrix confirms authenticated reviewer success and anonymous/ordinary-user denial before the phase is marked deployed.
