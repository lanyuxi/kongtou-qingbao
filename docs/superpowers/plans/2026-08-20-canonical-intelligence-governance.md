# Canonical Intelligence Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Evidence, human review, Promotion, audit, and transactional outbox records mandatory before canonical signals and their scores become publicly visible.

**Architecture:** Contracts and pure grounding rules land first. A forward-only PostgreSQL governance migration creates a dedicated `promotion_service` boundary and one protected idempotent review command; a second migration gates public reads and scoring inputs on Evidence. Server-only repositories and worker CLIs call the protected command, while a bounded reconciliation path adds Evidence to verifiable history and parks unverifiable history without deleting it.

**Tech Stack:** TypeScript strict mode, Zod 4, Node.js 22, postgres.js, PostgreSQL/Supabase, pgcrypto, pgTAP, Vitest, Next.js 16 read models.

**Spec:** `docs/superpowers/specs/2026-08-20-canonical-intelligence-governance-design.md`

## Global Constraints

- Follow `AGENTS.md`; AI and collector roles never write canonical signals, Evidence, review decisions, or security decisions.
- Use TDD for every behavior: write one failing test, run it and confirm the expected RED, add the minimum implementation, then run GREEN.
- Never edit the 16 existing applied migrations. Add only `20260820000100_canonical_intelligence_governance.sql` and `20260820000200_evidence_gated_read_models.sql`.
- Do not add a production dependency; existing Zod, postgres.js, Node crypto, Vitest, pgcrypto, and pgTAP are sufficient.
- Keep all historical Raw Items, AI runs, candidates, Evidence, signals, scores, decisions, audits, and outbox events. Corrections append records.
- Existing signals and scores without complete Evidence are preserved but hidden before reconciliation.
- Never put source bodies, Evidence quotes, candidate payloads, reviewer notes, URLs, credentials, headers, or stack traces in outbox payloads or logs.
- Do not call a model, DNS, HTTP service, or other external API inside a database transaction.
- Browser code uses the anon key and user session only. `AIRDROP_PROMOTION_DATABASE_URL` remains server-only.
- Run database reset/integration commands only against the explicitly disposable local Supabase topology.
- Preserve the user's three untracked `.DS_Store` files and unrelated worktree state.

---

## File map

### Contracts and domain

- `packages/contracts/src/intelligence/governance.ts` — strict Evidence, review command/result, reason, and outbox schemas.
- `packages/contracts/src/intelligence/governance.test.ts` — contract RED/GREEN coverage.
- `packages/contracts/src/index.ts` — canonical exports.
- `packages/domain/src/intelligence/evidence-grounding.ts` — pure normalization, grounding, and SHA-256 rules.
- `packages/domain/src/intelligence/evidence-grounding.test.ts` — TypeScript/PostgreSQL conformance vectors.
- `packages/domain/src/index.ts` — pure-rule exports.

### Database

- `supabase/migrations/20260820000100_canonical_intelligence_governance.sql` — governance role, tables, constraints, helpers, protected command, append-only triggers, grants, and legacy write revocations.
- `supabase/migrations/20260820000200_evidence_gated_read_models.sql` — signal/score Evidence helpers, public RLS replacement, read-model replacement, and scoring-stage helper grant.
- `supabase/tests/010_canonical_intelligence_governance.test.sql` — exact schema, role, RLS, command, atomicity, idempotency, concurrency, and visibility assertions.
- `packages/database/src/promotion/types.ts` — repository ports and typed errors.
- `packages/database/src/promotion/promotion-repository.ts` — canonical command hashing, role assumption, function invocation, and strict result/error parsing.
- `packages/database/src/promotion/worker-entry.ts` — server-only export.
- `packages/database/src/promotion/browser-denied.ts` — browser build denial.
- `packages/database/src/tests/promotion-repository.test.ts` — injected-client unit tests.
- `packages/database/src/tests/promotion-repository.integration.test.ts` — real PostgreSQL role/transaction tests.
- `packages/database/src/scoring/scoring-repository.ts` — Evidence-gated scoring input selection.
- `packages/database/src/tests/scoring-repository.integration.test.ts` — scoring input gate regression.
- `packages/database/package.json` — promotion export and integration-suite inclusion.
- `packages/database/src/generated/database.types.ts` — regenerated schema types.

### Worker and fixtures

- `apps/worker/src/promotion/review-candidate.ts` — server-only human review CLI.
- `apps/worker/src/promotion/reconcile-historical-evidence.ts` — bounded stable-order reconciliation runner and CLI.
- `apps/worker/src/promotion/tests/review-candidate.test.ts` — CLI parser/runner tests.
- `apps/worker/src/promotion/tests/reconcile-historical-evidence.test.ts` — bounded/idempotent reconciliation tests.
- `supabase/seed.sql` — fixed local Raw Item, Evidence, signal links, and score links.
- `supabase/fixtures/demo-projects.sql` — explicit fictional Evidence and links for every demo signal/score.
- `.env.example` — names-only Promotion configuration.
- `docs/runbooks/local-development.md` — safe reviewer/reconciliation commands.
- `docs/tasks/canonical-intelligence-governance-workbook.md` — per-task RED/GREEN evidence and commits.

---

### Task 1: Add strict governance contracts

**Files:**
- Create: `packages/contracts/src/intelligence/governance.ts`
- Create: `packages/contracts/src/intelligence/governance.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `docs/tasks/canonical-intelligence-governance-workbook.md`

**Interfaces:**
- Produces `evidenceLocatorV1Schema`, `candidateReviewDecisionSchema`, `candidateReviewReasonCodeSchema`, `candidateReviewCommandV1Schema`, `candidateReviewResultV1Schema`, `governanceOutboxEventV1Schema` and their inferred types.
- Later tasks consume the exact camelCase fields defined here; database row mapping remains snake_case inside `packages/database`.

- [ ] **Step 1: Create the workbook and mark Task 1 IN_PROGRESS**

Create a table with Tasks 1–8 and statuses `IN_PROGRESS` for Task 1 and `READY` for Tasks 2–8. Record every RED command, expected failure, GREEN command, result count, and commit as implementation proceeds.

- [ ] **Step 2: Write strict contract tests**

Add tests with this public shape:

```ts
const command = {
  version: 1,
  candidateId: '10000000-0000-4000-8000-000000000001',
  reviewerUserId: '10000000-0000-4000-8000-000000000002',
  expectedCandidateVersion: 1,
  decision: 'approve',
  reasonCode: 'evidence_verified',
  note: null,
} as const;

expect(candidateReviewCommandV1Schema.parse(command)).toEqual(command);
expect(() => candidateReviewCommandV1Schema.parse({ ...command, extra: true })).toThrow();
expect(() => candidateReviewCommandV1Schema.parse({
  ...command,
  decision: 'reject',
  reasonCode: 'evidence_verified',
})).toThrow();
```

Cover all allowed decision/reason combinations, version exactly `1`, UUIDs, positive safe-integer candidate versions, note trimming/max length, exact-quote bounds, strict unknown-key rejection, nullable result IDs by outcome, and outbox payload rejection when a key such as `quote`, `url`, `payload`, `note`, `headers`, or `credentials` appears.

- [ ] **Step 3: Run contract RED**

Run:

```bash
env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test -- src/intelligence/governance.test.ts
```

Expected: FAIL because `governance.ts` and its exports do not exist.

- [ ] **Step 4: Implement the minimum strict Zod schemas**

Use discriminated unions so invalid decision/reason combinations cannot parse:

```ts
const commandBase = z.object({
  version: z.literal(1),
  candidateId: z.string().uuid(),
  reviewerUserId: z.string().uuid(),
  expectedCandidateVersion: z.number().int().safe().positive(),
  note: z.string().trim().min(1).max(1000).nullable(),
});

export const candidateReviewCommandV1Schema = z.discriminatedUnion('decision', [
  commandBase.extend({
    decision: z.literal('approve'),
    reasonCode: z.literal('evidence_verified'),
  }).strict(),
  commandBase.extend({
    decision: z.literal('reject'),
    reasonCode: z.enum(['claim_not_supported', 'source_mismatch']),
  }).strict(),
  commandBase.extend({
    decision: z.literal('needs_review'),
    reasonCode: z.enum([
      'source_mismatch',
      'grounding_failed',
      'insufficient_context',
      'historical_reconciliation_failed',
    ]),
  }).strict(),
]);
```

Define `EvidenceLocatorV1` with `kind: 'exact_quote'`, source field `article_raw_text | discovered_summary`, and quote length `10..500`. Define outbox events as a discriminated union over `intelligence.signal.promoted.v1` and `intelligence.candidate.reviewed.v1`; the reviewed event accepts outcome `promoted | rejected | needs_review` so historical Evidence reconciliation can report a successful link without pretending to create the signal again. Enumerate every allowed ID/version/outcome/time field rather than accepting a record.

- [ ] **Step 5: Export and run GREEN**

Run:

```bash
env -u NODE_OPTIONS pnpm --filter @airdrop/contracts lint
env -u NODE_OPTIONS pnpm --filter @airdrop/contracts typecheck
env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test
```

Expected: all contract tests pass with no skipped governance test.

- [ ] **Step 6: Update workbook and commit**

```bash
git add packages/contracts/src/intelligence/governance.ts \
  packages/contracts/src/intelligence/governance.test.ts \
  packages/contracts/src/index.ts \
  docs/tasks/canonical-intelligence-governance-workbook.md
git commit -m "feat(contracts): add intelligence governance contracts"
```

---

### Task 2: Add deterministic Evidence grounding rules

**Files:**
- Create: `packages/domain/src/intelligence/evidence-grounding.ts`
- Create: `packages/domain/src/intelligence/evidence-grounding.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `docs/tasks/canonical-intelligence-governance-workbook.md`

**Interfaces:**
- Produces `normalizeEvidenceText(value: string): string`.
- Produces `groundExactEvidence(input: { sourceText: string; quote: string }): { normalizedQuote: string; normalizedQuoteSha256: string }`.
- Throws `EvidenceGroundingError` with code `evidence_quote_invalid | evidence_quote_not_found`.

- [ ] **Step 1: Write TypeScript conformance tests**

Use the exact Unicode whitespace set shared with PostgreSQL:

```ts
const whitespace = '\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680' +
  '\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A' +
  '\u2028\u2029\u202F\u205F\u3000';

expect(normalizeEvidenceText(`alpha${whitespace}beta`)).toBe('alpha beta');
expect(groundExactEvidence({
  sourceText: 'Case, punctuation! stay unchanged.',
  quote: 'Case, punctuation!',
})).toEqual({
  normalizedQuote: 'Case, punctuation!',
  normalizedQuoteSha256: '5762bcef2d4e2810b7a6ccff1ebbfe76f54f3cf0761a49c7ee5f41f16657de4f',
});
```

Also test case sensitivity, punctuation sensitivity, contiguous matching, empty/short/overlong normalized quotes, and a missing quote.

- [ ] **Step 2: Run domain RED**

```bash
env -u NODE_OPTIONS pnpm --filter @airdrop/domain test -- src/intelligence/evidence-grounding.test.ts
```

Expected: FAIL because the grounding module is absent.

- [ ] **Step 3: Implement the pure rule**

```ts
import { createHash } from 'node:crypto';

const evidenceWhitespace = /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/gu;

export function normalizeEvidenceText(value: string): string {
  return value.replace(evidenceWhitespace, ' ').trim();
}
```

`groundExactEvidence` validates the normalized quote length, checks one contiguous `includes` match without changing case/punctuation, and hashes the normalized quote as UTF-8 lowercase SHA-256.

- [ ] **Step 4: Run domain GREEN and package gates**

```bash
env -u NODE_OPTIONS pnpm --filter @airdrop/domain lint
env -u NODE_OPTIONS pnpm --filter @airdrop/domain typecheck
env -u NODE_OPTIONS pnpm --filter @airdrop/domain test
```

- [ ] **Step 5: Update workbook and commit**

```bash
git add packages/domain/src/intelligence/evidence-grounding.ts \
  packages/domain/src/intelligence/evidence-grounding.test.ts \
  packages/domain/src/index.ts \
  docs/tasks/canonical-intelligence-governance-workbook.md
git commit -m "feat(domain): add deterministic evidence grounding"
```

---

### Task 3: Add the governance schema and protected Promotion command

**Files:**
- Create: `supabase/tests/010_canonical_intelligence_governance.test.sql`
- Create: `supabase/migrations/20260820000100_canonical_intelligence_governance.sql`
- Modify: `docs/tasks/canonical-intelligence-governance-workbook.md`

**Interfaces:**
- Produces `promotion_service` NOLOGIN role.
- Produces tables `evidence`, `signal_evidence_links`, `candidate_review_decisions`, `promotion_commands`, and `outbox_events`.
- Extends `extraction_candidates` with `version` and `review_status`; extends `promotion_events` with reviewer/decision foreign keys.
- Produces `normalize_evidence_text_v1(text)`, `evidence_quote_sha256_v1(text)`, and protected `execute_extraction_candidate_review(uuid,jsonb,text,text,timestamptz)`.
- Produces protected `reconcile_extraction_candidate_evidence(uuid,uuid,bigint,text,timestamptz)` for already-promoted historical candidates.
- The protected command returns one row with `command_id`, `candidate_id`, `candidate_version`, `decision_id`, `outcome`, `signal_id`, `evidence_id`, and `replayed`.

- [ ] **Step 1: Write structural pgTAP RED**

Add exact assertions for tables, columns, constraints, foreign keys, indexes, RLS, role flags, grants, and function signatures. Include tests proving:

```sql
select is(
  (select rolcanlogin from pg_roles where rolname = 'promotion_service'),
  false,
  'promotion_service cannot login directly'
);

select ok(
  not has_table_privilege('ai_stage_worker', 'public.signals', 'INSERT'),
  'ai_stage_worker cannot insert canonical signals'
);

select function_privs_are(
  'public', 'promote_extraction_candidate', array['uuid', 'text'],
  'ai_stage_worker', array[]::text[],
  'ai_stage_worker cannot execute the legacy Promotion primitive'
);
```

Assert that browser roles, service role, AI worker, collection worker, and queue worker have no direct DML on governance tables.

- [ ] **Step 2: Write command behavior pgTAP RED**

Create fixed auth users, active/revoked reviewer grants, projects, sources, Raw Items, discovered items, AI runs, and candidates inside the test transaction. Cover:

- approve creates exactly one Evidence, signal, link, review decision, hardened promotion event, command receipt, and outbox event;
- exact replay returns the same IDs with `replayed = true` and no new rows;
- same key/different hash raises SQLSTATE `AI104`;
- stale version raises `AI103` and writes nothing;
- unauthorized/revoked reviewer raises `AI105`;
- reject creates no Evidence or signal and records `decided` candidate state;
- explicit needs-review keeps candidate status pending and sets review status needs_review;
- article/source mismatch produces needs-review and no signal;
- summary grounding uses the Feed Raw Item;
- malformed decision/reason/UUID/version inputs raise `AI106`;
- direct update/delete of Evidence, links, decisions, commands, or audit history fails.

Use savepoints or `throws_ok` for rejected commands so the surrounding pgTAP transaction survives.

- [ ] **Step 3: Run database RED**

```bash
pnpm db:start
pnpm test:db
```

Expected: file 010 fails because governance relations and functions are absent. Confirm the database is the disposable local Supabase instance before reset.

- [ ] **Step 4: Implement role, tables, constraints, and revocations**

The migration must create the role with the same hardened role block pattern as `ai_stage_worker`, then apply:

```sql
revoke insert on table public.signals from ai_stage_worker;
drop policy if exists signals_ai_stage_worker_insert on public.signals;
revoke execute on function public.promote_extraction_candidate(uuid, text)
from ai_stage_worker;
```

Create the five tables exactly as specified, with bounded text, SHA-256 checks, decision/result shape checks, deterministic unique keys, RLS enabled, and explicit revoke-all statements. Use `ON DELETE RESTRICT` for all historical references.

Add:

```sql
alter table public.extraction_candidates
  add column version bigint not null default 1 check (version > 0),
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'needs_review', 'decided'));
```

Drop and replace only the old candidate status-shape constraint so rejected candidates require `signal_id is null` and `decided_at is not null`, promoted candidates require both, and pending candidates require neither.

- [ ] **Step 5: Implement normalization helpers with conformance vectors**

Normalize the same explicit whitespace set as Task 2. Convert U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, and U+3000 to ASCII spaces with `translate`, collapse `[[:space:]]+`, then trim. Hash with pgcrypto:

```sql
select encode(
  digest(convert_to(public.normalize_evidence_text_v1(input_text), 'UTF8'), 'sha256'),
  'hex'
);
```

Add pgTAP conformance assertions using the same normalized text and SHA-256 vectors as Task 2.

- [ ] **Step 6: Implement the protected command as one transaction**

The function signature is:

```sql
public.execute_extraction_candidate_review(
  p_reviewer_user_id uuid,
  p_command_payload jsonb,
  p_idempotency_key text,
  p_input_hash text,
  p_now timestamptz
)
returns table (
  command_id uuid,
  candidate_id uuid,
  candidate_version bigint,
  decision_id uuid,
  outcome text,
  signal_id uuid,
  evidence_id uuid,
  replayed boolean
)
```

Implement checks in this order: validate bounded inputs and exact JSON keys/types; replay lookup; active reviewer-role lookup directly against `user_roles`; candidate `FOR UPDATE`; expected version; decision/reason combination; stored quote/source resolution; grounding; writes. The caller supplies no source IDs, Raw Item IDs, quote, or signal fields.

Use SQLSTATEs `AI101` through `AI109` exactly as mapped in the spec error-code order. An approve request whose stored quote cannot be grounded returns a committed `needs_review` result with reason `grounding_failed` or `source_mismatch`; it does not raise and does not create Evidence/signal.

The approve branch inserts audit/outbox data shaped like:

```json
{
  "version": 1,
  "eventType": "intelligence.signal.promoted.v1",
  "candidateId": "10000000-0000-4000-8000-000000000001",
  "candidateVersion": 2,
  "decisionId": "10000000-0000-4000-8000-000000000002",
  "signalId": "10000000-0000-4000-8000-000000000003",
  "evidenceId": "10000000-0000-4000-8000-000000000004",
  "occurredAt": "2026-08-20T00:00:00.000Z"
}
```

The implementation must construct these values from stored/generated IDs; no caller-provided JSON is copied into outbox payloads.

Create `reconcile_extraction_candidate_evidence` in this same migration. It accepts an active reviewer, a promoted candidate ID, the expected candidate version, an Idempotency-Key, and transaction time. It accepts only candidates with an existing signal and no Evidence link, applies the same stored-source grounding checks, and increments version without changing canonical candidate status. Grounded history appends Evidence, link, approve decision, hardened audit, reviewed outbox event, and receipt; an ungrounded record appends a needs-review decision, reviewed outbox event, and receipt without Evidence. Exact replay returns the original IDs.

- [ ] **Step 7: Add append-only triggers and minimum grants**

Create `reject_governance_history_mutation()` with a fixed search path and attach it to Evidence, signal links, review decisions, and Promotion commands. Existing `promotion_events_append_only` continues to protect Promotion audit history. `outbox_events` receives no direct application-role update/delete grant; future delivery mutates it only through a new narrow command.

Grant `promotion_service` execute only on `execute_extraction_candidate_review` and `reconcile_extraction_candidate_evidence`; do not grant direct table DML. Grant `postgres` SET membership for local/integration administration. Keep service role and browser roles closed.

- [ ] **Step 8: Run database GREEN and sensitivity checks**

```bash
pnpm test:db
```

Expected: all 10 pgTAP files pass. Temporarily restore AI signal INSERT in a local uncommitted mutation, confirm file 010 turns RED, restore exact bytes, and rerun GREEN. Repeat for skipping outbox insertion and weakening the reviewer-role predicate.

- [ ] **Step 9: Update workbook and commit the complete migration once**

```bash
git add supabase/tests/010_canonical_intelligence_governance.test.sql \
  supabase/migrations/20260820000100_canonical_intelligence_governance.sql \
  docs/tasks/canonical-intelligence-governance-workbook.md
git commit -m "feat(db): add governed promotion boundary"
```

---

### Task 4: Gate public reads and scoring inputs on Evidence

**Files:**
- Create: `supabase/migrations/20260820000200_evidence_gated_read_models.sql`
- Modify: `supabase/tests/010_canonical_intelligence_governance.test.sql`
- Modify: `packages/database/src/scoring/scoring-repository.ts`
- Create: `packages/database/src/tests/scoring-repository.integration.test.ts`
- Modify: `packages/database/package.json`
- Modify: `docs/tasks/canonical-intelligence-governance-workbook.md`

**Interfaces:**
- Produces `signal_has_valid_evidence(uuid): boolean` and `score_has_complete_evidence(uuid): boolean` as fixed-search-path security-definer read helpers.
- `ScoringRepository.listScoringInputs(limit)` returns only signals satisfying `signal_has_valid_evidence`.
- `project_current_state` and `opportunity_list` retain their current column order and types while selecting only complete scores/signals.

- [ ] **Step 1: Extend pgTAP and integration tests for RED**

Add fixtures with:

- one published signal without Evidence;
- one published signal with Evidence;
- one score linked only to the evidenced signal;
- one newer score linked to both evidenced and unevidenced signals;
- one score with zero signal links.

Assert anon sees only the evidenced signal; latest public project state chooses the older complete score rather than the newer incomplete score; zero-link scores never appear; and removing the only Evidence link makes the project disappear from opportunities without deleting history.

In `scoring-repository.integration.test.ts`, assert `listScoringInputs` returns only the evidenced signal.

- [ ] **Step 2: Run RED**

```bash
pnpm test:db
AIRDROP_DATABASE_TEST_URL="$AIRDROP_DATABASE_TEST_URL" \
  pnpm --filter @airdrop/database test -- src/tests/scoring-repository.integration.test.ts
```

Expected: public/read-model assertions fail and the scoring repository returns the unevidenced signal.

- [ ] **Step 3: Implement helper functions and policy replacement**

`signal_has_valid_evidence` returns true only when a link joins Evidence whose `source_id` matches its Raw Item and discovered item identities. `score_has_complete_evidence` requires at least one score link and rejects the score if any linked signal fails the signal helper.

Drop and recreate only `signals_select_anon` and `signals_select_authenticated` so the existing active-project published visibility also requires `signal_has_valid_evidence(id)`. Grant helper execution to anon, authenticated, service role, and `ai_stage_worker`; grant no direct Evidence-table SELECT to browser roles.

- [ ] **Step 4: Replace read models without changing their contract**

Recreate `project_current_state` with the current appended columns. Add `score_has_complete_evidence(score.id)` to the latest-score lateral subquery and `signal_has_valid_evidence(signal.id)` to the latest-signal subquery. Recreate `opportunity_list` with its existing deterministic order and grants.

- [ ] **Step 5: Gate scoring inputs**

Add `public.signal_has_valid_evidence(signal.id)` to both the project-ID scan and signal-row query in `listScoringInputs`. Do not change score math, factor math, input hashing, or write behavior.

- [ ] **Step 6: Run GREEN**

```bash
pnpm test:db
pnpm --filter @airdrop/database test:integration
env -u NODE_OPTIONS pnpm --filter @airdrop/database lint
env -u NODE_OPTIONS pnpm --filter @airdrop/database typecheck
env -u NODE_OPTIONS pnpm --filter @airdrop/database test
```

Expected: no governance integration skip when the documented local variables are supplied.

- [ ] **Step 7: Update workbook and commit**

```bash
git add supabase/migrations/20260820000200_evidence_gated_read_models.sql \
  supabase/tests/010_canonical_intelligence_governance.test.sql \
  packages/database/src/scoring/scoring-repository.ts \
  packages/database/src/tests/scoring-repository.integration.test.ts \
  packages/database/package.json \
  docs/tasks/canonical-intelligence-governance-workbook.md
git commit -m "feat(db): gate public intelligence on evidence"
```

---

### Task 5: Add the server-only Promotion repository

**Files:**
- Create: `packages/database/src/promotion/types.ts`
- Create: `packages/database/src/promotion/promotion-repository.ts`
- Create: `packages/database/src/promotion/worker-entry.ts`
- Create: `packages/database/src/promotion/browser-denied.ts`
- Create: `packages/database/src/tests/promotion-repository.test.ts`
- Create: `packages/database/src/tests/promotion-repository.integration.test.ts`
- Modify: `packages/database/src/ai/extraction-repository.ts`
- Modify: `apps/worker/src/ai/tests/extract-discovered.test.ts`
- Modify: `packages/database/package.json`
- Modify: `docs/tasks/canonical-intelligence-governance-workbook.md`

**Interfaces:**
- Produces `PromotionRepository.reviewCandidate(input: ExecuteCandidateReviewInput): Promise<CandidateReviewResultV1>`.
- `ExecuteCandidateReviewInput` has `command`, `idempotencyKey`, and `occurredAt: Date` only.
- Produces `PromotionCommandRejectionError` carrying one stable rejection code and `PromotionPersistenceError` carrying only `promotion_persistence_failed`.

- [ ] **Step 1: Write injected-client repository RED**

Follow the schedule-command repository pattern. Test exact canonical payload/hash, one `SET LOCAL ROLE promotion_service` per transaction, strict result keys, PostgreSQL bigint/timestamp parsing, SQLSTATE mapping, unexpected-error concealment, and browser export denial.

Canonical JSON key order is fixed:

```ts
const canonical = JSON.stringify({
  candidateId: command.candidateId,
  decision: command.decision,
  expectedCandidateVersion: command.expectedCandidateVersion,
  note: command.note,
  reasonCode: command.reasonCode,
  reviewerUserId: command.reviewerUserId,
  version: command.version,
});
```

Assert the SHA-256 for one fixed command as a literal vector.

- [ ] **Step 2: Run repository RED**

```bash
env -u NODE_OPTIONS pnpm --filter @airdrop/database test -- src/tests/promotion-repository.test.ts
```

Expected: FAIL because the Promotion repository modules do not exist.

- [ ] **Step 3: Implement types, repository, and adapter**

The injected client mirrors:

```ts
export interface PromotionFunctionCall {
  readonly functionName: 'execute_extraction_candidate_review';
  readonly args: Readonly<Record<string, string>>;
}

export interface PromotionFunctionClient {
  transaction<T>(work: (transaction: PromotionFunctionTransaction) => Promise<T>): Promise<T>;
}
```

The postgres adapter starts `sql.begin`, executes `set local role promotion_service`, and calls the protected function. Parse the returned row through `candidateReviewResultV1Schema` after exact-key validation. Map `AI101..AI109` by SQLSTATE, never by message text.

- [ ] **Step 4: Add real integration tests**

Provision a non-superuser test login with SET membership in `promotion_service`. Create fixtures through the owner connection. Prove the login cannot directly insert a signal or governance row, but the repository can approve through the function. Add exact replay, stale version, revoked reviewer, rejection, needs-review, and concurrent approval cases.

Force atomic rollback with a transaction-local trigger that raises on `outbox_events` INSERT; assert Evidence, signal, link, decision, audit, receipt, candidate version, and outbox counts all remain unchanged.

- [ ] **Step 5: Remove the legacy Promotion method from the AI repository**

Delete `promoteCandidate(candidateId, actor)` from `ExtractionRepository` and `createExtractionRepository`. Remove the unused mock method from `apps/worker/src/ai/tests/extract-discovered.test.ts`. This leaves no typed application path that uses the disabled legacy database function.

- [ ] **Step 6: Export the server boundary and deny browsers**

Add package export:

```json
"./promotion-worker": {
  "browser": "./src/promotion/browser-denied.ts",
  "default": "./src/promotion/worker-entry.ts"
}
```

`browser-denied.ts` throws only `@airdrop/database/promotion-worker is unavailable in browser code.` and imports no postgres module.

- [ ] **Step 7: Run GREEN**

```bash
env -u NODE_OPTIONS pnpm --filter @airdrop/database lint
env -u NODE_OPTIONS pnpm --filter @airdrop/database typecheck
env -u NODE_OPTIONS pnpm --filter @airdrop/database test
pnpm --filter @airdrop/database test:integration
```

- [ ] **Step 8: Update workbook and commit**

```bash
git add packages/database/src/promotion \
  packages/database/src/tests/promotion-repository.test.ts \
  packages/database/src/tests/promotion-repository.integration.test.ts \
  packages/database/src/ai/extraction-repository.ts \
  apps/worker/src/ai/tests/extract-discovered.test.ts \
  packages/database/package.json \
  docs/tasks/canonical-intelligence-governance-workbook.md
git commit -m "feat(database): add promotion service repository"
```

---

### Task 6: Replace the legacy Promotion CLI with governed review commands

**Files:**
- Create: `apps/worker/src/promotion/review-candidate.ts`
- Create: `apps/worker/src/promotion/tests/review-candidate.test.ts`
- Modify: `apps/worker/src/ai/promote-candidate.ts`
- Modify: `.env.example`
- Modify: `docs/tasks/canonical-intelligence-governance-workbook.md`

**Interfaces:**
- Produces `parseReviewCandidateOptions(argv, env)` and `runReviewCandidate(options, ports)`.
- Commands are `approve`, `reject`, and `needs-review` with candidate ID, expected version, Idempotency-Key, and reason code where applicable.
- Uses `AIRDROP_PROMOTION_DATABASE_URL` and `AIRDROP_PROMOTION_REVIEWER_USER_ID`; never falls back to `AIRDROP_AI_STAGE_DATABASE_URL` or a hard-coded actor.

- [ ] **Step 1: Write CLI RED**

Test this exact usage:

```text
review-candidate approve 10000000-0000-4000-8000-000000000001 1 review-approve-10000000-v1
review-candidate reject 10000000-0000-4000-8000-000000000001 1 review-reject-10000000-v1 claim_not_supported
review-candidate needs-review 10000000-0000-4000-8000-000000000001 1 review-park-10000000-v1 grounding_failed
```

Assert missing/invalid env, malformed UUID/version/key/reason, bounded stdout, no connection values, no stack trace, and exact result lines containing IDs/outcome only. Inject repository and clock ports so tests make no database connection.

- [ ] **Step 2: Run worker RED**

```bash
env -u NODE_OPTIONS pnpm --filter @airdrop/worker test -- src/promotion/tests/review-candidate.test.ts
```

- [ ] **Step 3: Implement parser, runner, and self-invoking CLI**

`approve` constructs reason `evidence_verified`; other commands accept only their contract-allowed reasons. All commands use `note: null`. The main function opens the Promotion repository, invokes once with an injected/current clock, prints one bounded result line, and closes in `finally`.

Catch output uses stable error codes only:

```ts
const code = error instanceof PromotionCommandRejectionError ||
  error instanceof PromotionPersistenceError
  ? error.code
  : 'promotion_cli_failed';
process.stderr.write(`${code}\n`);
```

- [ ] **Step 4: Retire the unsafe legacy CLI path**

Keep `apps/worker/src/ai/promote-candidate.ts` only as a self-invoking fail-closed compatibility message that exits nonzero with `legacy_promotion_cli_disabled_use_review_candidate`. Remove its repository Promotion call and hard-coded `human:local-admin`. Do not delete the file because operational references may still invoke it.

- [ ] **Step 5: Document names-only environment values and run GREEN**

Add safe local placeholder names to `.env.example` without real URLs/passwords. Run:

```bash
env -u NODE_OPTIONS pnpm --filter @airdrop/worker lint
env -u NODE_OPTIONS pnpm --filter @airdrop/worker typecheck
env -u NODE_OPTIONS pnpm --filter @airdrop/worker test
```

- [ ] **Step 6: Update workbook and commit**

```bash
git add apps/worker/src/promotion/review-candidate.ts \
  apps/worker/src/promotion/tests/review-candidate.test.ts \
  apps/worker/src/ai/promote-candidate.ts \
  .env.example \
  docs/tasks/canonical-intelligence-governance-workbook.md
git commit -m "feat(worker): add governed candidate review CLI"
```

---

### Task 7: Reconcile historical Evidence and update fixtures

**Files:**
- Create: `apps/worker/src/promotion/reconcile-historical-evidence.ts`
- Create: `apps/worker/src/promotion/tests/reconcile-historical-evidence.test.ts`
- Modify: `packages/database/src/promotion/types.ts`
- Modify: `packages/database/src/promotion/promotion-repository.ts`
- Modify: `packages/database/src/tests/promotion-repository.test.ts`
- Modify: `packages/database/src/tests/promotion-repository.integration.test.ts`
- Modify: `supabase/seed.sql`
- Modify: `supabase/fixtures/demo-projects.sql`
- Modify: `supabase/tests/007_seed_smoke.test.sql`
- Modify: `docs/tasks/canonical-intelligence-governance-workbook.md`

**Interfaces:**
- Extends the repository with `listHistoricalCandidates({ afterCandidateId, limit })` and `reconcileHistoricalCandidate({ candidateId, reviewerUserId, expectedCandidateVersion, idempotencyKey, occurredAt })` calling the Task 3 function `reconcile_extraction_candidate_evidence(uuid,uuid,bigint,text,timestamptz)`.
- Produces `runHistoricalEvidenceReconciliation(ports): Promise<{ processed; linked; needsReview; nextCursor }>`.
- Batch limit is `1..100`; order is candidate UUID ascending; cursor is the last processed candidate ID.

- [ ] **Step 1: Write reconciliation runner RED**

Use a fake repository with three stable IDs. Assert limit propagation, ascending cursor continuation, one committed result per candidate, counts for linked/needs-review, stop after abort between records, and exact replay on a second run.

- [ ] **Step 2: Write repository/integration RED for promoted history**

Live review accepts only pending candidates, so add a dedicated reconciliation command that accepts only `status = promoted` with an existing signal and no signal Evidence link. It uses the same authoritative grounding/source helpers, reviewer authorization, idempotency receipts, review decisions, audit identity, and outbox rules. It never inserts or rewrites a signal and never changes the candidate's canonical status.

Test a grounded promoted candidate, an ungrounded promoted candidate, a candidate already linked, an exact replay, and stable cursor pagination.

- [ ] **Step 3: Run RED**

```bash
env -u NODE_OPTIONS pnpm --filter @airdrop/worker test -- src/promotion/tests/reconcile-historical-evidence.test.ts
env -u NODE_OPTIONS pnpm --filter @airdrop/database test -- src/tests/promotion-repository.test.ts
```

- [ ] **Step 4: Implement bounded reconciliation**

Use deterministic idempotency key `` `historical-evidence-v1:${candidateId}` `` and reviewer ID from `AIRDROP_PROMOTION_REVIEWER_USER_ID`. The CLI accepts optional `AIRDROP_EVIDENCE_RECONCILE_LIMIT` default `25`, clamped by validation to `1..100`, and `AIRDROP_EVIDENCE_RECONCILE_AFTER_ID` as an optional UUID cursor.

Print one summary containing integer counts and the next cursor only. Never print candidate titles, source URLs, quote text, notes, or payloads.

- [ ] **Step 5: Add fixed Evidence to `supabase/seed.sql`**

Add fixed Raw Item IDs for the active and rumored published fixture signals, with fictional `.example.invalid` URLs and raw text containing the exact fixture summaries. Insert fixed Evidence IDs and `signal_evidence_links`. Link every fixture score to its project's published signal through `score_signal_links` so the latest active/rumored fixture scores remain visible under the new gate.

Extend `007_seed_smoke.test.sql` to assert the exact Evidence/Raw/Source path and complete score links.

- [ ] **Step 6: Add explicit demo Evidence**

For every demo project signal, insert or reuse a fictional per-project source and Raw Item whose body contains the signal summary, insert deterministic Evidence keyed by project/source/logical URL/quote hash, link the signal, and link every demo score to that project's signal. Use set-based SQL and existing project IDs; do not add real domains or claim the fixtures are verified production intelligence.

- [ ] **Step 7: Run GREEN**

```bash
pnpm test:db
env -u NODE_OPTIONS pnpm --filter @airdrop/database test
pnpm --filter @airdrop/database test:integration
env -u NODE_OPTIONS pnpm --filter @airdrop/worker test
```

- [ ] **Step 8: Update workbook and commit**

```bash
git add apps/worker/src/promotion/reconcile-historical-evidence.ts \
  apps/worker/src/promotion/tests/reconcile-historical-evidence.test.ts \
  packages/database/src/promotion \
  packages/database/src/tests/promotion-repository.test.ts \
  packages/database/src/tests/promotion-repository.integration.test.ts \
  supabase/seed.sql supabase/fixtures/demo-projects.sql \
  supabase/tests/007_seed_smoke.test.sql \
  docs/tasks/canonical-intelligence-governance-workbook.md
git commit -m "feat(intelligence): reconcile historical evidence"
```

---

### Task 8: Regenerate types, document operations, and run final gates

**Files:**
- Modify: `packages/database/src/generated/database.types.ts`
- Modify: `docs/runbooks/local-development.md`
- Modify: `README.md`
- Modify: `docs/HANDOVER.md`
- Modify: `docs/tasks/canonical-intelligence-governance-workbook.md`

**Interfaces:**
- Documents the names `AIRDROP_PROMOTION_DATABASE_URL`, `AIRDROP_PROMOTION_REVIEWER_USER_ID`, `AIRDROP_EVIDENCE_RECONCILE_LIMIT`, and `AIRDROP_EVIDENCE_RECONCILE_AFTER_ID` without real values.
- Makes governance integration tests part of the explicit database integration command.

- [ ] **Step 1: Verify the explicit integration suite includes governance**

Confirm `packages/database/package.json` `test:integration` explicitly includes promotion and scoring integration files alongside the four existing files. Integration tests create their narrow login roles from `AIRDROP_DATABASE_TEST_URL`, so no extra credential variable is introduced. Run `node packages/database/scripts/require-integration-env.mjs` without variables and confirm it exits nonzero while printing names only.

- [ ] **Step 2: Regenerate database types twice**

Against the disposable local database after all migrations:

```bash
pnpm db:types
cp packages/database/src/generated/database.types.ts /tmp/governance-database.types.ts
pnpm db:types
diff -u /tmp/governance-database.types.ts packages/database/src/generated/database.types.ts
```

Expected: zero diff. Do not use Python or shell redirection to author the committed file outside the existing `db:types` script.

- [ ] **Step 3: Update operational documentation**

Document:

- creation of a dedicated login with SET membership in `promotion_service` using flat SQL rather than SSH `DO $$` blocks;
- governed approve/reject/needs-review CLI commands;
- bounded historical reconciliation and cursor continuation;
- Evidence-gated public visibility and the expected temporary hiding of unlinked history;
- the disabled legacy Promotion CLI;
- local-only database reset warnings;
- no model/network call in review transactions.

Update HANDOVER current HEAD/status only after all gates pass; do not rewrite historical snapshots as if they had included Phase 6A.

- [ ] **Step 4: Run focused security sensitivity checks**

For each mutation, confirm RED, restore exact bytes, and rerun GREEN:

1. grant AI worker signal INSERT;
2. remove Evidence condition from signal policy;
3. remove complete-score condition from the read model;
4. skip outbox insertion;
5. ignore expected candidate version;
6. accept a revoked reviewer;
7. accept a mismatched Raw Item source;
8. put quote text into an outbox payload.

Record commands and failing assertion names in the workbook.

- [ ] **Step 5: Run the complete Node 22 repository gate**

```bash
env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm verify
```

Expected: lint, typecheck, all non-integration tests, builds, and placeholder scan pass with zero failures.

- [ ] **Step 6: Run the disposable database gate**

```bash
env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm verify:full
pnpm --filter @airdrop/database test:integration
```

Expected: all 10 pgTAP files pass; promotion/scoring/source/queue repository integrations run with zero skipped governance tests; generated types remain unchanged.

- [ ] **Step 7: Inspect scope and secret-sensitive matches**

```bash
git diff --check
git status --short
rg -n --hidden -g '!node_modules/**' -g '!pnpm-lock.yaml' \
  '(seed phrase|private key|mnemonic|wallet password|service_role|AIRDROP_PROMOTION_DATABASE_URL|evidenceQuote|outbox)' \
  apps packages supabase docs .env.example
```

Review every match. Environment-variable names, prohibition text, fixture-only untrusted quotes, and server-only role boundaries are acceptable; secret values, source bodies in events/logs, or browser imports are not.

- [ ] **Step 8: Complete workbook and commit final documentation/types**

```bash
git add packages/database/src/generated/database.types.ts \
  packages/database/package.json \
  docs/runbooks/local-development.md README.md docs/HANDOVER.md \
  docs/tasks/canonical-intelligence-governance-workbook.md
git commit -m "docs: complete canonical intelligence governance"
```

---

## Final review checklist

- [ ] `ai_stage_worker`, collectors, queue workers, browser roles, ordinary admins, and service role cannot directly insert canonical signals.
- [ ] Only the dedicated protected command can create a new promoted signal.
- [ ] The command validates active reviewer role, exact idempotency input hash, candidate version, candidate state, decision/reason pair, stored source identity, and deterministic grounding.
- [ ] Approve atomically writes Evidence, signal, link, decision, hardened audit, receipt, candidate transition, and outbox event.
- [ ] Reject and needs-review create no signal or Evidence.
- [ ] Exact replay creates no duplicate; conflicting replay and stale version mutate nothing.
- [ ] Evidence, review, audit, signal, score, Raw Item, and candidate history is never deleted or overwritten.
- [ ] Public signals and scores have complete Evidence paths; unlinked history remains stored but hidden.
- [ ] Scoring consumes only Evidence-gated signals and keeps opportunity/risk/confidence independent.
- [ ] Historical reconciliation is bounded, stable-order, cursor-based, idempotent, body-free in logs, and model/network free.
- [ ] Demo and local seed records use explicit fictional Evidence rather than bypasses.
- [ ] Browser package resolution rejects the Promotion repository.
- [ ] Outbox payloads contain IDs, versions, outcomes, and timestamps only.
- [ ] Both new migrations are forward-only and generated types are reproducible.
- [ ] `pnpm verify` and disposable-local `pnpm verify:full` are fresh and GREEN under Node 22.
- [ ] Worktree changes are task-scoped and contain no credentials or unrelated cleanup.
