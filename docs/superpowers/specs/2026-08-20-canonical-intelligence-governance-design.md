# Phase 6A Canonical Intelligence Governance Design

**Status:** Approved in conversation and written-spec review on 2026-08-20

## 1. Purpose

Close the governance gap between AI extraction candidates and canonical, publicly visible intelligence. Phase 6A makes Evidence, human review, the Promotion Service, audit history, and transactional outbox events enforceable database boundaries rather than CLI conventions.

This phase preserves the existing collection, extraction, scoring, and orchestration behavior. It does not add the reviewer UI, automatic retry of failed AI runs, tutorial generation, notification delivery, security incidents, third-party source intake, or a general-purpose outbox dispatcher.

## 2. Accepted safety decision

Existing signals and scores remain stored and immutable, but they are not publicly visible unless they can trace through valid Evidence to a Raw Item and Source. Historical reconciliation may append Evidence and links after deterministic verification. A historical record that cannot be verified remains preserved and receives an append-only `needs_review` decision; it is never deleted, overwritten, or silently treated as verified.

Demo fixtures follow the same rule. They must include explicit fixture Evidence and links rather than bypassing the public visibility gate.

## 3. Product rules enforced

- AI output remains candidate data. `ai_stage_worker` may write AI runs and extraction candidates but may not insert canonical signals or execute Promotion commands.
- Every publicly visible signal has at least one valid `signal_evidence_links` row whose Evidence resolves to a Raw Item and Source.
- A publicly visible score has at least one `score_signal_links` row, and every signal consumed by that score satisfies the signal Evidence gate.
- Promotion requires an active human reviewer identity, an append-only review decision, a grounded Evidence locator, optimistic version agreement, and an idempotent command.
- The signal, Evidence, links, review decision, Promotion audit event, candidate transition, command receipt, and outbox event commit in one PostgreSQL transaction.
- Source content remains untrusted. Grounding uses deterministic normalization and exact containment; no model or network call occurs in the Promotion transaction.
- Raw Items, Evidence, review decisions, Promotion events, signals, scores, and outbox records are append-only through application roles.
- Conflicting evidence is preserved. Phase 6A does not collapse contradictory Evidence into one truth value.

## 4. Scope boundaries

### Included

- Strict contracts for Evidence locators, review decisions, Promotion commands/results, and outbox events.
- Pure domain rules for whitespace normalization, exact-quote grounding, reviewer decision validation, and public Evidence eligibility.
- Forward-only database migrations for the governance records and role boundary.
- A dedicated `promotion_service` NOLOGIN role with the minimum required privileges.
- A protected, idempotent, version-checked database command for approve/promote, reject, and needs-review outcomes.
- Server-only repository and CLI entry points for local human review while the UI is absent.
- Public signal and score visibility gates based on Evidence completeness.
- Deterministic reconciliation of existing promoted candidates and fixture records.
- Contract, domain, pgTAP, repository integration, worker/CLI, and regression tests.

### Excluded

- Reviewer web pages and public/admin review HTTP endpoints.
- Automatic reprocessing or retry budgets for `provider_error`, `schema_invalid_after_repair`, or `grounding_failed` AI runs.
- A general review queue for failed AI runs; Phase 6A records historical reconciliation failures but the interactive failed-run workflow is Phase 6B.
- Outbox delivery to an external broker. Phase 6A creates durable unpublished events and server-only outbox access; delivery is added when a consumer exists.
- Tutorials, notifications, incidents, indicators, allowlisted official-link publication, and third-party source admission.
- Rewriting previously applied migrations or deleting historical rows.

## 5. Architecture and trust boundaries

```text
collector / ai_stage_worker
        |
        | append untrusted Raw Items, AI runs, candidates
        v
extraction_candidates + candidate payload evidenceQuote
        |
        | human operator chooses a decision
        v
server-only Promotion CLI / future reviewer BFF
        |
        | dedicated promotion_service login; reviewer UUID,
        | expected candidate version, Idempotency-Key
        v
execute_extraction_candidate_review(...)
        |
        +-- deterministic grounding against immutable source data
        +-- active reviewer-role check
        +-- one database transaction
        v
Evidence + signal + links + decision + audit + outbox
        |
        v
evidence-gated public read models and deterministic scoring inputs
```

`apps/web` does not receive the Promotion database URL in this phase. The local CLI is a server-only operational entry point. A future thin reviewer BFF may call the same command after authenticating a session, but browser principals never receive direct table DML or function execution privileges.

The existing `ai_stage_worker` direct `signals` INSERT policy and grant are revoked by a new forward migration. Execute permission on `promote_extraction_candidate(uuid,text)` is revoked from `ai_stage_worker`; the legacy function remains present for migration history but is not callable by application roles. New Promotion uses only the dedicated command owned by `postgres` and executable by `promotion_service`.

## 6. Contracts

`packages/contracts` remains the only source of cross-boundary schemas.

### 6.1 Evidence locator

The first version supports exact text quotes only:

```ts
type EvidenceLocatorV1 = {
  version: 1;
  kind: 'exact_quote';
  sourceField: 'article_raw_text' | 'discovered_summary';
  quote: string; // 10..500 characters before normalization
};
```

Objects are strict. The quote must contain non-whitespace content. `sourceField` determines which immutable input is grounded. For `article_raw_text`, Evidence uses the candidate's article Raw Item. For `discovered_summary`, Evidence uses the discovered item's Feed Raw Item and verifies against the normalized discovered summary.

### 6.2 Review command

```ts
type CandidateReviewCommandV1 = {
  version: 1;
  candidateId: string;
  reviewerUserId: string;
  expectedCandidateVersion: number;
  decision: 'approve' | 'reject' | 'needs_review';
  reasonCode:
    | 'evidence_verified'
    | 'claim_not_supported'
    | 'source_mismatch'
    | 'grounding_failed'
    | 'insufficient_context'
    | 'historical_reconciliation_failed';
  note: string | null; // trimmed, at most 1000 characters
};
```

The transport supplies an `Idempotency-Key` separately. The persisted command receipt stores a SHA-256 hash of the canonical command JSON; it does not store session tokens, request headers, database URLs, or source bodies.

`approve` requires `reasonCode = 'evidence_verified'`. `reject` requires `claim_not_supported` or `source_mismatch`. `needs_review` accepts grounding, context, source, or reconciliation reasons. Invalid combinations fail before database mutation.

### 6.3 Command result

```ts
type CandidateReviewResultV1 = {
  version: 1;
  commandId: string;
  candidateId: string;
  candidateVersion: number;
  decisionId: string;
  outcome: 'promoted' | 'rejected' | 'needs_review';
  signalId: string | null;
  evidenceId: string | null;
  replayed: boolean;
};
```

### 6.4 Outbox event

The approve path writes `intelligence.signal.promoted.v1`. Reject and needs-review paths write `intelligence.candidate.reviewed.v1`. Payloads contain IDs, versions, decision/outcome enums, and occurrence time only. They never contain source text, Evidence quotes, candidate payloads, reviewer notes, credentials, or URLs.

## 7. Data model

Two forward-only migrations add the records below: `20260820000100_canonical_intelligence_governance.sql` owns roles, tables, constraints, protected commands, and write revocations; `20260820000200_evidence_gated_read_models.sql` owns public policies, read-model replacements, and scoring-input visibility. No applied migration is edited.

### 7.1 `evidence`

```text
id uuid primary key
source_id uuid not null -> sources on delete restrict
raw_item_id uuid not null -> raw_items on delete restrict
discovered_item_id uuid null -> discovered_items on delete restrict
locator_version smallint not null = 1
locator_kind text not null = exact_quote
source_field text not null = article_raw_text | discovered_summary
quote_text text not null, trimmed length 10..500
normalized_quote_sha256 text not null, lowercase SHA-256
verification_method text not null = deterministic_exact_quote_v1
verified_at timestamptz not null
created_at timestamptz not null
```

The source must match the Raw Item and, when present, the discovered item. Database command logic validates this identity before insertion. Evidence is append-only. A deterministic uniqueness key prevents duplicate Evidence for the same Raw Item, discovered item, source field, and normalized quote hash.

### 7.2 `signal_evidence_links`

```text
signal_id uuid -> signals on delete restrict
evidence_id uuid -> evidence on delete restrict
created_at timestamptz not null
primary key (signal_id, evidence_id)
```

Links are append-only. Application roles cannot update or delete them.

### 7.3 `candidate_review_decisions`

```text
id uuid primary key
candidate_id uuid not null -> extraction_candidates on delete restrict
candidate_version bigint not null
reviewer_user_id uuid not null -> profiles on delete restrict
decision text not null = approve | reject | needs_review
reason_code text not null
note text null
evidence_id uuid null -> evidence on delete restrict
signal_id uuid null -> signals on delete restrict
created_at timestamptz not null
```

Shape constraints require approve decisions to reference both Evidence and signal, while reject/needs-review decisions reference neither. Decisions are append-only. Corrections append a later decision against a later candidate version; they never rewrite an earlier decision.

### 7.4 `promotion_commands`

```text
id uuid primary key
reviewer_user_id uuid not null -> profiles on delete restrict
candidate_id uuid not null -> extraction_candidates on delete restrict
idempotency_key text not null, exact bytes, length 1..200
input_hash text not null, lowercase SHA-256
expected_candidate_version bigint not null
resulting_candidate_version bigint not null
decision_id uuid not null -> candidate_review_decisions on delete restrict
outcome text not null
signal_id uuid null -> signals on delete restrict
evidence_id uuid null -> evidence on delete restrict
created_at timestamptz not null
unique (reviewer_user_id, idempotency_key)
```

An exact replay returns the stored result. Reuse with a different input hash fails with `promotion_idempotency_conflict`. A stale expected version fails with `promotion_version_conflict` and creates no receipt.

### 7.5 `outbox_events`

```text
id uuid primary key
aggregate_type text not null
aggregate_id uuid not null
aggregate_version bigint not null
event_type text not null
event_version smallint not null = 1
payload jsonb not null
occurred_at timestamptz not null
created_at timestamptz not null
published_at timestamptz null
delivery_attempts integer not null default 0
last_error_code text null
unique (aggregate_type, aggregate_id, aggregate_version, event_type, event_version)
```

Only `promotion_service` may insert the event through the protected command. A future narrow outbox worker role will claim and publish records; Phase 6A exposes server-only read access for verification but does not grant a browser principal access.

### 7.6 Promotion audit hardening

`promotion_events` gains nullable `review_decision_id` and `reviewer_user_id` foreign keys for legacy compatibility. A new shape constraint requires both fields on every new event created by the protected Phase 6A command. Historical rows remain unchanged and identifiable as legacy audit events. New code does not use the free-form `actor` value as authorization or reviewer identity; it stores the bounded compatibility value `user:<reviewer UUID>` and treats the foreign key as authoritative.

### 7.7 Candidate versioning

`extraction_candidates` gains `version bigint not null default 1` and `review_status text not null default 'pending'` constrained to `pending | needs_review | decided`. The latest decision is resolved deterministically from `candidate_review_decisions` by `created_at desc, id desc`; no mutable latest-decision pointer is added. Every material review transition increments version exactly once. No-op or idempotent replay preserves the version.

Existing `status` remains compatible with `pending | promoted | rejected`. A new forward constraint allows a rejected candidate to have `decided_at` without a signal. `needs_review` remains a review status while the canonical candidate status stays pending, allowing later human resolution without resurrecting a rejected record.

## 8. Deterministic grounding

The normalization algorithm is versioned as `deterministic_exact_quote_v1`:

1. Replace every maximal Unicode whitespace sequence with one ASCII space.
2. Trim leading and trailing whitespace.
3. Preserve case, punctuation, and all non-whitespace characters exactly.
4. Reject normalized quotes shorter than 10 characters or longer than 500 characters.
5. Accept only when the normalized source contains the normalized quote as one contiguous substring.

TypeScript implements the pure rule for contract/domain tests and preflight feedback. The protected PostgreSQL command performs the authoritative check against stored immutable data so callers cannot bypass grounding by supplying a favorable result.

For `article_raw_text`, the command requires `candidate.raw_item_id` and verifies that Raw Item's source/project identity. For `discovered_summary`, it verifies the quote against `discovered_items.summary`, uses the discovered item's `feed_raw_item_id` as `evidence.raw_item_id`, and verifies matching project/source identity.

The command derives locator data from the stored candidate payload and stored source records. Callers do not supply Raw Item IDs, Source IDs, quote text, or signal fields.

## 9. Review and Promotion transaction

The protected command accepts the validated command JSON, exact Idempotency-Key, input hash, and transaction time.

### Common checks

1. Require a nonblank Idempotency-Key and a canonical input hash.
2. Look up an existing `(reviewer_user_id, idempotency_key)` receipt. Return it for the same hash or fail for a different hash.
3. Verify that the reviewer has an active `reviewer`, `senior_reviewer`, `security_reviewer`, or `admin` grant. Revoked grants do not authorize.
4. Lock the candidate with `FOR UPDATE` and compare `expectedCandidateVersion`.
5. Validate the candidate state and decision/reason combination.

### Approve path

1. Resolve the candidate's stored `evidenceQuote` and authoritative source field.
2. Perform exact-quote grounding and identity checks.
3. If grounding or identity fails, record a `needs_review` decision with the corresponding stable reason, increment the candidate version, write the reviewed outbox event and command receipt, and return `needs_review`. No signal or Evidence is created.
4. If grounding succeeds, insert or retrieve deterministic Evidence.
5. Insert one unverified published signal from the stored, schema-validated candidate payload.
6. Link the signal to Evidence.
7. Append the approve review decision and Promotion audit event.
8. Mark the candidate promoted and increment its version.
9. Insert the `intelligence.signal.promoted.v1` outbox event and command receipt.

### Reject path

Append the reject decision, set candidate status to rejected with `decided_at`, increment version, write the reviewed outbox event and command receipt, and create no signal or Evidence.

### Needs-review path

Append the needs-review decision, keep canonical candidate status pending, set review status to needs_review, increment version, write the reviewed outbox event and command receipt, and create no signal or Evidence.

Any unexpected constraint, permission, or persistence failure rolls back the entire command. Human-readable messages are not used for branching.

## 10. Authorization and RLS

- `promotion_service` is NOLOGIN, NOINHERIT, NOBYPASSRLS, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, and NOREPLICATION.
- Deployment provisions a separate server-only login that may `SET ROLE promotion_service`; credentials are never committed, logged, stored in commands, or exposed to browsers.
- `promotion_service` receives execute permission only on the protected review command plus the minimum read needed through security-definer ownership. It receives no general table UPDATE/DELETE permission.
- `ai_stage_worker` loses direct signal INSERT and legacy Promotion execute permission. It retains only the candidate-stage and deterministic scoring capabilities needed by current workers.
- `anon` and `authenticated` may read only Evidence-gated signals and Evidence-safe public projections. Raw quote text is not automatically public; public pages may expose bounded citation text only in a later explicitly reviewed read model.
- Ordinary admins do not gain direct table DML. Active reviewer roles authorize the command through explicit database checks, not through broad grants.
- Service role does not gain a bypass path for canonical writes.

RLS tests cover anonymous, authenticated owner/non-owner where applicable, reviewer, revoked reviewer, admin, service role, AI worker, Promotion service, collection worker, and queue worker behavior.

## 11. Public read and scoring gates

New forward migrations replace affected policies/views without editing historical migrations.

A signal is public only when all existing public conditions hold and at least one linked Evidence record passes the structural validity constraints. Project detail signal timelines use this same gate.

A project score is public only when:

- it has at least one `score_signal_links` record; and
- every linked signal satisfies the Evidence gate.

The scoring repository consumes only Evidence-gated published signals. This prevents a newly calculated score from laundering an unevidenced claim into a public recommendation. Existing unevidenced scores remain stored but are excluded from `project_current_state` and `opportunity_list` until reconciliation or recalculation produces a fully linked score.

## 12. Historical reconciliation

Reconciliation is a bounded, idempotent server-only command; it is not an unbounded migration-time model or network operation.

It processes existing promoted candidates in stable ID order:

1. Resolve the linked signal and candidate's stored Evidence quote.
2. Apply the same deterministic grounding and identity rules as live Promotion.
3. On success, append Evidence, signal link, reconciliation review decision, audit metadata, and an outbox event using a deterministic idempotency key.
4. On failure, append a `needs_review` decision with `historical_reconciliation_failed`; do not change or delete the signal.

The public gate takes effect before reconciliation. Therefore a crash or partial run cannot accidentally expose an unverified historical record. Re-running the reconciliation command returns existing receipts and creates no duplicate Evidence, links, decisions, or events.

Fixture reconciliation is deterministic and contains no real credentials, wallets, contracts, or personal data.

## 13. Error codes

Behavior branches on stable codes:

```text
promotion_candidate_not_found
promotion_candidate_not_reviewable
promotion_version_conflict
promotion_idempotency_conflict
promotion_reviewer_not_authorized
promotion_command_invalid
promotion_evidence_quote_invalid
promotion_source_identity_mismatch
promotion_grounding_failed
promotion_persistence_failed
```

The server-only repository maps database codes to typed domain errors without returning source bodies, candidate payloads, notes, stack traces, or database details. Future HTTP adapters map version and idempotency conflicts to HTTP 409, authorization failure to 403, missing candidates to 404, and invalid commands to 400.

## 14. Code layout

```text
packages/contracts/src/intelligence/governance.ts
packages/contracts/src/intelligence/governance.test.ts
packages/domain/src/intelligence/evidence-grounding.ts
packages/domain/src/intelligence/evidence-grounding.test.ts
packages/database/src/promotion/promotion-repository.ts
packages/database/src/promotion/types.ts
packages/database/src/promotion/worker-entry.ts
packages/database/src/promotion/browser-denied.ts
packages/database/src/tests/promotion-repository.test.ts
packages/database/src/tests/promotion-repository.integration.test.ts
apps/worker/src/promotion/review-candidate.ts
apps/worker/src/promotion/reconcile-historical-evidence.ts
apps/worker/src/promotion/tests/review-candidate.test.ts
apps/worker/src/promotion/tests/reconcile-historical-evidence.test.ts
supabase/migrations/20260820000100_canonical_intelligence_governance.sql
supabase/migrations/20260820000200_evidence_gated_read_models.sql
supabase/tests/010_canonical_intelligence_governance.test.sql
docs/tasks/canonical-intelligence-governance-workbook.md
```

The final implementation plan assigns exact migration filenames and task-level file edits. No production dependency is required; existing Zod, postgres.js, Node crypto, Vitest, and pgTAP primitives are sufficient.

## 15. Testing strategy

### Contracts

Test strict objects, unknown fields, UUIDs, versions, decision/reason combinations, expected version bounds, nullable note normalization, locator bounds, result shapes, and body-free outbox payloads.

### Domain

Test Unicode whitespace normalization, exact contiguous containment, case/punctuation preservation, article versus summary locators, empty/short/overlong quotes, source identity mismatch, and deterministic quote hashes.

### pgTAP and RLS

Test exact schema, constraints, foreign keys, indexes, append-only triggers, role attributes, grants, direct AI signal INSERT denial, legacy function denial, reviewer authorization including revocation, public signal/score gating, and denial of broad application-role DML.

### Repository integration

Against disposable Supabase/PostgreSQL, test approve atomically creates every required record; forced outbox, Evidence-link, or audit failure rolls the entire command back; reject and needs-review create no canonical signal; exact replay returns the same IDs; conflicting replay and stale version mutate nothing; two concurrent approvals yield one canonical result; and source/grounding mismatch cannot publish.

### Worker and reconciliation

Test CLI configuration without printing values, bounded output, real reviewer IDs, stable input order, exact replay, successful historical backfill, failed historical review parking, and abort between records without corrupting committed history.

### Regression sensitivity

Demonstrate RED when temporarily restoring AI direct INSERT, removing the Evidence public gate, skipping the outbox insert, accepting a stale version, weakening the reviewer-role check, or allowing a mismatched Source/Raw Item. Restore each exact change and rerun GREEN.

## 16. Acceptance gates

Phase 6A is complete only when all conditions hold:

- AI and collection roles cannot directly write canonical signals or execute Promotion.
- An unauthorized, revoked, stale, non-idempotent, ungrounded, or source-mismatched command cannot publish a signal.
- Every newly promoted signal has Evidence, Raw Item, Source, review decision, audit event, command receipt, and outbox traceability.
- All approve-path records commit atomically; a forced failure leaves none of them committed.
- Existing history is preserved and unevidenced history is hidden before reconciliation.
- Public scores consume only Evidence-gated signals.
- Reconciliation is bounded and idempotent and never calls a model or network service.
- Generated database types are reproducible.
- Focused tests pass under TDD, then `pnpm verify` passes under Node 22.
- `pnpm verify:full` passes against an explicitly disposable local Supabase database with no skipped governance integration tests.
- The worktree contains no secret values and only task-scoped changes.

## 17. Follow-on order

After Phase 6A:

1. Phase 6B adds the failed-AI-run review/dead-letter API and reviewer UI.
2. Project detail exposes safe score factors and Evidence citations through reviewed public read models.
3. Security incidents, indicators, and verified allowlisted references establish prerequisites for tutorials.
4. Tutorials, authentication-backed execution features, notifications, and formal third-party source intake follow in that order.
