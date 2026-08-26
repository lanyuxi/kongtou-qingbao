# Phase 7A Security Incidents and Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a protect-first, append-only security overlay for project/source incidents and indicators, with synchronous collection/Promotion/scoring/Evidence gates plus complete reviewer and public Web flows.

**Architecture:** Add strict security contracts and pure rules, one forward-only PostgreSQL Security Ledger migration, bearer-scoped protected commands, safe public projections, and shared target advisory locks. Existing module owners consume derived posture through narrow helpers; security commands never rewrite Catalog, scores, collection history, or ordinary intelligence.

**Tech Stack:** Node.js 22.22.2, pnpm 11.16.0, TypeScript strict mode, Zod 4, PostgreSQL/Supabase RLS and PostgREST, pgTAP, Vitest, Next.js 16 App Router, React 19.

**Spec:** `docs/superpowers/specs/2026-08-26-phase-7a-security-incidents-indicators-design.md`

## Global Constraints

- Use Node.js 22.22.2 and pnpm 11.16.0 for every acceptance gate.
- AI/collector output is candidate-only. Only the current bearer session's active `security_reviewer` or `admin` may execute canonical security commands.
- Every canonical indicator and posture decision must trace to Evidence → Raw Item → Source.
- Security posture never mutates project lifecycle, deterministic score values/history, or score recommendation.
- Derive posture from append-only decisions with `blocked > caution > clear`; never store mutable current posture/status/disclosure fields.
- Render summaries, source content, and indicator values as untrusted inert text; public-safe indicator values never become links.
- Use the existing Promotion Service boundary, command receipt, audit, transactional outbox, cursor, idempotency, and expected-version patterns.
- Use one forward-only migration after the existing 21 migrations; never edit an already applied migration.
- Add no production dependency. Reuse the repository's Zod, Supabase, postgres, React, pgTAP, and Vitest packages.
- Run resets/integration only against the marker-verified disposable Supabase stack. Never access or mutate production.
- Preserve unrelated `.DS_Store` and all other user changes.
- After every task, update `docs/tasks/phase-7a-security-incidents-indicators-workbook.md` and `docs/HANDOVER.md` before committing.

## Planned File Structure

- `packages/contracts/src/security/enums.ts` — canonical security enums and reason codes.
- `packages/contracts/src/security/candidate.ts` — manual submission, candidate list/detail, decision command/result contracts.
- `packages/contracts/src/security/incident.ts` — incident and disclosure command/detail contracts.
- `packages/contracts/src/security/projections.ts` — strict database/public projection schemas and cursors.
- `packages/contracts/src/security/events.ts` — exact versioned outbox payload contracts.
- `packages/domain/src/security/posture.ts` — strictest-posture derivation and target lock ordering.
- `packages/domain/src/security/review-rules.ts` — candidate/incident/disclosure transition compatibility.
- `packages/domain/src/security/indicator.ts` — indicator normalization and lexical validation.
- `supabase/migrations/20260826000100_phase_7a_security_incidents_indicators.sql` — nine ledger objects, commands, RLS, outbox, gates, and public read models.
- `supabase/tests/013_phase_7a_security_incidents_indicators.test.sql` — catalog, RLS, atomicity, projection, posture, and gate matrix.
- `packages/database/src/security/security-review-repository.ts` — bearer-scoped reviewer RPC repository.
- `packages/database/src/security/entry.ts` / `browser-denied.ts` — server-only package export.
- `packages/database/src/repositories/security-public-repository.ts` — anon-safe blocked/project security reads.
- Existing extraction, collection, Promotion, scoring, queue, and project repositories — module-owned synchronous gate integration.
- `apps/web/src/lib/security-review-handlers.ts` and `security-review-api-client.ts` — authenticated BFF and browser client.
- `/api/v1/review/security/*` and `/api/v1/security/blocked-projects` Route Handlers.
- `apps/web/src/components/review/security-*.tsx` and `/review/security/*` pages — reviewer workflow.
- `apps/web/src/components/security-elements.tsx` plus existing opportunity/project pages — public warnings and blocked view.
- `apps/worker/src/ai/fixtures/security-extraction-golden.ts` — deterministic security extraction Golden Dataset.
- `docs/tasks/phase-7a-security-incidents-indicators-workbook.md` — RED/GREEN, review, commit, and environment ledger.

## Execution Preflight

Before Task 1, invoke `superpowers:using-git-worktrees`, create branch `codex/phase-7a-security-ledger` under the ignored `.worktrees/` directory, install strictly from the lockfile, and run:

```bash
env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm install --frozen-lockfile
env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm verify
```

Expected: exit 0 at the current baseline (861 non-skipped tests and 46 environment-gated skips at plan approval). Record actual counts, worktree path, branch, HEAD, Node, and pnpm versions in the workbook and HANDOVER. Do not connect to production.

---

### Task 1: Define strict security contracts

**Files:**
- Create: `packages/contracts/src/security/enums.ts`
- Create: `packages/contracts/src/security/enums.test.ts`
- Create: `packages/contracts/src/security/candidate.ts`
- Create: `packages/contracts/src/security/candidate.test.ts`
- Create: `packages/contracts/src/security/incident.ts`
- Create: `packages/contracts/src/security/incident.test.ts`
- Create: `packages/contracts/src/security/projections.ts`
- Create: `packages/contracts/src/security/projections.test.ts`
- Create: `packages/contracts/src/security/events.ts`
- Create: `packages/contracts/src/security/events.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: `apiErrorSchema`, API success envelope helpers, UUID/timestamp conventions, and existing project/source/signal enums.
- Produces: all `security*Schema` and inferred types named in design §§6, 12, and 13; later tasks import only from `@airdrop/contracts`.

- [ ] **Step 1: Write enum and strict-shape RED tests**

```ts
expect(securityPostureSchema.options).toEqual(['clear', 'caution', 'blocked']);
expect(securityCandidateStateSchema.options).toEqual([
  'pending', 'needs_review', 'accepted', 'rejected',
]);
expect(manualSecurityCandidateCommandV1Schema.safeParse({
  version: 1,
  target: { type: 'project', id: projectId },
  evidenceId,
  indicator: { type: 'domain', value: 'claim.example' },
  summary: '该域名冒充项目领取页面。',
  note: null,
  reviewerUserId,
}).success).toBe(false);
```

Add table-driven failures for extra keys, unsupported enum values, mixed project/source targets, invalid UUID/timestamp/version/cursor, value length 0/501, public summary length 19/501, note length 0/1001, incompatible reason/action pairs, and unsafe outbox keys (`reviewerUserId`, `note`, `locator`, `quote`, `payload`, `indicatorValue`).

- [ ] **Step 2: Run contracts RED**

```bash
pnpm --filter @airdrop/contracts test -- security
```

Expected: FAIL because the security modules/exports do not exist; syntax or runner failures are not accepted RED evidence.

- [ ] **Step 3: Implement exact version-1 contracts**

```ts
export const securityTargetSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('project'), id: z.uuid() }),
  z.strictObject({ type: z.literal('source'), id: z.uuid() }),
]);

export const securityCandidateReviewCommandV1Schema = z.discriminatedUnion('decision', [
  needsReviewCandidateCommandSchema,
  rejectCandidateCommandSchema,
  acceptAndOpenCandidateCommandSchema,
  acceptAndAttachCandidateCommandSchema,
]);
```

Use `.strict()`/`z.strictObject`, discriminated unions, base64url cursor envelopes, exact bounds from the spec, and separate internal reviewer/public projection schemas. Outbox schemas must enumerate exact safe keys and exclude indicator values even when public-safe. Export every schema/type through `packages/contracts/src/index.ts`.

- [ ] **Step 4: Run focused GREEN and package guards**

```bash
pnpm --filter @airdrop/contracts test
pnpm --filter @airdrop/contracts lint
pnpm --filter @airdrop/contracts typecheck
```

Expected: all exit 0 with strict additional-property and leakage tests passing.

- [ ] **Step 5: Update workbook/HANDOVER and commit**

Record RED cause, GREEN counts, exact exported names, and that no database/application behavior changed.

```bash
git add packages/contracts/src/security packages/contracts/src/index.ts \
  docs/tasks/phase-7a-security-incidents-indicators-workbook.md docs/HANDOVER.md
git commit -m "feat(contracts): define phase 7a security contracts"
```

---

### Task 2: Implement pure posture, transition, and indicator rules

**Files:**
- Create: `packages/domain/src/security/posture.ts`
- Create: `packages/domain/src/security/posture.test.ts`
- Create: `packages/domain/src/security/review-rules.ts`
- Create: `packages/domain/src/security/review-rules.test.ts`
- Create: `packages/domain/src/security/indicator.ts`
- Create: `packages/domain/src/security/indicator.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: Phase 7A enum/reason types from `@airdrop/contracts`.
- Produces: `deriveSecurityPosture`, `compareSecurityPosture`, `orderSecurityTargetsForLock`, `validateCandidateDecision`, `validateIncidentTransition`, `validateDisclosureDecision`, `normalizeSecurityIndicatorValueV1`, and `isSecurityIndicatorLexicallyValid`.

- [ ] **Step 1: Write exhaustive RED tests**

```ts
expect(deriveSecurityPosture([])).toBe('clear');
expect(deriveSecurityPosture(['caution', 'blocked', 'caution'])).toBe('blocked');
expect(validateIncidentTransition({
  current: { state: 'active', posture: 'blocked', severity: 'critical', summary: '风险仍在持续。' },
  command: { action: 'resolve', reasonCode: 'false_positive_verified', evidenceId },
}).ok).toBe(true);
expect(orderSecurityTargetsForLock([
  { type: 'source', id: sourceId }, { type: 'project', id: projectId },
])).toEqual([{ type: 'project', id: projectId }, { type: 'source', id: sourceId }]);
```

Cover all posture combinations, independent incident resolution, open/reopen/adjust/attach/no-op rules, reason compatibility, target deduplication/order, Unicode whitespace, unpaired surrogates/control characters, domain 253/254, URL schemes, and exact occurrence matching.

- [ ] **Step 2: Run domain RED**

```bash
pnpm --filter @airdrop/domain test -- security
```

Expected: FAIL on missing security exports.

- [ ] **Step 3: Implement minimal pure functions**

```ts
const rank = { clear: 0, caution: 1, blocked: 2 } as const;

export function deriveSecurityPosture(
  active: readonly ActiveSecurityPosture[],
): SecurityPosture {
  return active.reduce<SecurityPosture>(
    (current, candidate) => rank[candidate] > rank[current] ? candidate : current,
    'clear',
  );
}
```

Keep functions dependency-free except contract types. Return typed validation results/codes; never throw human-readable copy from domain rules. Match the database reason matrix exactly.

- [ ] **Step 4: Run domain/contracts GREEN**

```bash
pnpm --filter @airdrop/domain test
pnpm --filter @airdrop/domain lint
pnpm --filter @airdrop/domain typecheck
pnpm --filter @airdrop/contracts test
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add packages/domain/src/security packages/domain/src/index.ts \
  docs/tasks/phase-7a-security-incidents-indicators-workbook.md docs/HANDOVER.md
git commit -m "feat(domain): add security ledger rules"
```

---

### Task 3: Add the Security Ledger migration, protected commands, and authorization matrix

**Files:**
- Create: `supabase/tests/013_phase_7a_security_incidents_indicators.test.sql`
- Create: `supabase/migrations/20260826000100_phase_7a_security_incidents_indicators.sql`
- Modify: `packages/database/src/generated/database.types.ts`
- Modify: `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: existing Evidence/Raw Item/Source, `user_roles`, Promotion Service, outbox, extraction candidate, collection eligibility, score eligibility, and project read-model objects.
- Produces: the nine approved ledger tables; posture/lock/eligibility helpers; candidate ingress/review, incident/disclosure, list/detail RPCs; security-aware public views; updated ordinary Promotion/read gates; generated database types.

- [ ] **Step 1: Write pgTAP catalog/RLS RED assertions**

```sql
select has_table('public', 'security_indicator_candidates');
select has_table('public', 'security_candidate_review_decisions');
select has_table('public', 'security_indicators');
select has_table('public', 'security_indicator_evidence_links');
select has_table('public', 'security_incidents');
select has_table('public', 'security_incident_indicator_links');
select has_table('public', 'security_incident_decisions');
select has_table('public', 'security_events');
select has_table('public', 'security_review_commands');
select has_function('public', 'current_security_target_posture', array['text', 'uuid']);
select has_view('public', 'public_blocked_projects');
```

Add named assertions for exact columns/checks/FKs/indexes, forced RLS, append-only triggers, function owner/search path/grants, view security options, outbox exact payload/event constraints, and the full subject matrix from spec §16.

- [ ] **Step 2: Run focused disposable RED**

```bash
supabase test db supabase/tests/013_phase_7a_security_incidents_indicators.test.sql
```

Expected: named missing-object failures on the marker-verified disposable project only.

- [ ] **Step 3: Create all ledger tables and immutable history guards**

Use constrained text/check columns and shape constraints. Candidate version derives as `1` when no decision exists; first decision is version `2`. Incident open and indicator creation are version `1`. Add reject-update/delete triggers to all history/canonical objects and revoke broad table privileges before minimum grants.

```sql
create function public.current_security_target_posture(p_target_type text, p_target_id uuid)
returns text language sql stable security definer
set search_path = pg_catalog, public as $$
  select case coalesce(max(case latest.resulting_posture
    when 'blocked' then 2 when 'caution' then 1 else 0 end), 0)
    when 2 then 'blocked' when 1 then 'caution' else 'clear' end
  from public.security_incidents as incident
  join lateral (
    select decision.resulting_posture
    from public.security_incident_decisions as decision
    where decision.incident_id = incident.id
    order by decision.incident_version desc
    limit 1
  ) as latest on latest.resulting_posture is not null
  where incident.target_type = p_target_type
    and coalesce(incident.project_id, incident.source_id) = p_target_id;
$$;
```

Add deterministic `security_target_lock_key_v1` and acquire target locks in project-then-source order in every protected write.

- [ ] **Step 4: Implement protected ingress/review/incident/disclosure RPCs**

Each authenticated reviewer RPC begins with:

```sql
requested_reviewer_id := auth.uid();
if requested_reviewer_id is null
  or not public.actor_has_active_security_role(requested_reviewer_id)
then
  raise exception 'security_reviewer_required' using errcode = 'AS104';
end if;
```

Validate exact JSON keys/types, idempotency hash, expected versions, reason compatibility, target identity, deterministic grounding, and database transaction timestamps. A grounding failure commits only `needs_review` history/receipt/event/outbox. Successful canonical commands atomically commit indicator/Evidence links, incident decisions, events, receipts, and safe outbox events. The extraction ingress RPC is executable only by `ai_stage_worker`, writes candidate version 1 plus `security.candidate.submitted.v1`, and cannot write canonical objects.

- [ ] **Step 5: Implement synchronous database gates and safe projections**

Recreate `signal_has_valid_evidence(uuid)` so only Evidence from non-blocked sources counts; keep `score_has_complete_evidence(uuid)` score-level. Recreate `is_source_collection_eligible`, `load_source_collection_context`, ordinary candidate review, `project_current_state`, and `opportunity_list` with the approved posture behavior. Create exact-column `public_project_security_state`, `public_security_incident_summaries`, `public_safe_security_indicators`, and `public_blocked_projects` views with `security_invoker`/`security_barrier` and narrow underlying policies/column grants.

- [ ] **Step 6: Prove atomicity, concurrency, and leakage behavior**

Add pgTAP fixtures for two simultaneous incidents, independent resolve, blocked-source alternative/last Evidence, internal Security Ledger use of already grounded blocked-source Evidence, clear/caution/blocked ordinary Promotion, indicator-required incident open, database-owned timestamps, forged identity, revoked role, direct DML denial, and public-safe disclosure reversal. Force failures before receipt and outbox inserts and assert every canonical/history count remains unchanged.

- [ ] **Step 7: Reset disposable database and run focused/full GREEN**

```bash
supabase db reset --yes
supabase test db supabase/tests/013_phase_7a_security_incidents_indicators.test.sql
supabase test db
```

Expected: reset and all pgTAP files exit 0. Update older exact catalog/view expectations only for intentional forward changes; never weaken unrelated assertions.

- [ ] **Step 8: Regenerate and deterministically verify database types**

Generate types twice from the disposable schema, require byte equality and identical SHA-256, then replace `packages/database/src/generated/database.types.ts`. Confirm all nine tables, RPCs, and views exist in the generated type.

- [ ] **Step 9: Update workbook/HANDOVER and commit**

Record disposable topology, RED failures, focused/full pgTAP counts, generated-type SHA, role matrix, and explicit production non-access.

```bash
git add supabase/migrations/20260826000100_phase_7a_security_incidents_indicators.sql \
  supabase/tests/013_phase_7a_security_incidents_indicators.test.sql \
  packages/database/src/generated/database.types.ts \
  docs/tasks/phase-7a-security-incidents-indicators-workbook.md docs/HANDOVER.md
git commit -m "feat(db): add phase 7a security ledger"
```

---
### Task 4: Build bearer-scoped security review repositories and real race tests

**Files:**
- Create: `packages/database/src/security/security-review-repository.ts`
- Create: `packages/database/src/security/entry.ts`
- Create: `packages/database/src/security/browser-denied.ts`
- Create: `packages/database/src/tests/security-review-repository.test.ts`
- Create: `packages/database/src/tests/security-review-repository.integration.test.ts`
- Modify: `packages/database/src/tests/entrypoints.test.ts`
- Modify: `packages/database/package.json`
- Modify: `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: generated Security Ledger RPC types and all strict security contracts.
- Produces: `SecurityReviewRepository`, `SecurityReviewRepositoryError`, and `createSecurityReviewRepository({ url, anonKey })` through server-only export `@airdrop/database/security-review`.

- [ ] **Step 1: Write repository RED tests for exact RPC calls**

```ts
const repository = createSecurityReviewRepositoryFromRpc(rpc);
await repository.reviewCandidate({
  accessToken,
  candidateId,
  idempotencyKey: 'security-review-1',
  command: {
    version: 1,
    expectedCandidateVersion: 1,
    decision: 'accept_and_open',
    target: { type: 'project', id: projectId },
    indicator: { type: 'domain', value: 'claim.example' },
    category: 'phishing',
    posture: 'blocked',
    severity: 'critical',
    publicSummary: '发现仿冒领取页面，请勿访问。',
    evidenceId,
    reasonCode: 'active_exploitation',
    note: null,
  },
});
expect(rpc.calls[0]?.accessToken).toBe(accessToken);
expect(rpc.calls[0]?.functionName).toBe('execute_security_candidate_review');
```

Assert fresh bearer use, canonical key order, no reviewer/timestamp injection, strict one-row parsing, cursor order `(createdAt desc, id desc)`, empty pages, safe error mapping, and browser export denial.

- [ ] **Step 2: Run repository RED**

```bash
pnpm --filter @airdrop/database test -- security-review-repository.test.ts entrypoints.test.ts
```

- [ ] **Step 3: Implement the focused repository**

```ts
export interface SecurityReviewRepository {
  listCandidates(input: CandidateListInput): Promise<SecurityCandidateListResult>;
  getCandidate(input: CandidateGetInput): Promise<SecurityCandidateDetail>;
  submitManualCandidate(input: ManualCandidateInput): Promise<SecurityCandidateCommandResult>;
  reviewCandidate(input: CandidateReviewInput): Promise<SecurityCandidateCommandResult>;
  listIncidents(input: IncidentListInput): Promise<SecurityIncidentListResult>;
  getIncident(input: IncidentGetInput): Promise<SecurityIncidentDetail>;
  openIncident(input: IncidentOpenInput): Promise<SecurityIncidentCommandResult>;
  commandIncident(input: IncidentCommandInput): Promise<SecurityIncidentCommandResult>;
  setIndicatorDisclosure(input: IndicatorDisclosureInput): Promise<IndicatorDisclosureResult>;
}
```

Create one non-persistent Supabase client per call with the supplied bearer. Parse every input/result through contracts and map only stable database error codes. Add conditional `browser` export that throws before any credential/client construction.

- [ ] **Step 4: Write and run real reviewer/authorization/concurrency integration tests**

Use independent bearer-scoped clients to prove: active security reviewer/admin success, ordinary/revoked reviewer denial, same-key replay, same-key different-payload conflict, stale candidate/incident/disclosure version conflict, two incident commands racing, and one incident resolve leaving the other target block active.

```bash
pnpm --filter @airdrop/database exec vitest run --no-file-parallelism \
  src/tests/security-review-repository.integration.test.ts
```

- [ ] **Step 5: Run package GREEN**

```bash
pnpm --filter @airdrop/database test
pnpm --filter @airdrop/database lint
pnpm --filter @airdrop/database typecheck
```

- [ ] **Step 6: Update workbook/HANDOVER and commit**

```bash
git add packages/database/src/security packages/database/src/tests/security-review-repository* \
  packages/database/src/tests/entrypoints.test.ts packages/database/package.json \
  docs/tasks/phase-7a-security-incidents-indicators-workbook.md docs/HANDOVER.md
git commit -m "feat(database): add security review repository"
```

---

### Task 5: Route security extraction candidates and harden ordinary Promotion

**Files:**
- Modify: `packages/database/src/ai/extraction-repository.ts`
- Modify: `packages/database/src/tests/promotion-repository.test.ts`
- Modify: `packages/database/src/tests/promotion-repository.integration.test.ts`
- Create: `packages/database/src/tests/security-candidate-ingress.integration.test.ts`
- Modify: `apps/worker/src/ai/extract-discovered.ts`
- Modify: `apps/worker/src/ai/tests/extract-discovered.test.ts`
- Modify: `apps/worker/src/promotion/review-candidate.ts`
- Modify: `apps/worker/src/promotion/tests/review-candidate.test.ts`
- Modify: `packages/database/package.json`
- Modify: `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: `route_security_extraction_candidate`, existing `insertCandidates`, and ordinary Promotion RPC guards from Task 3.
- Produces: atomic extraction/security candidate routing; ordinary candidate queries that cannot surface security claims; stable Promotion errors `security_review_required` and `security_promotion_blocked`.

- [ ] **Step 1: Write routing and Promotion RED tests**

```ts
await repository.insertCandidates(aiRunId, [securityCandidate]);
expect(transaction.calls).toEqual([
  { operation: 'insert_extraction_candidate', claimType: 'security_risk' },
  { operation: 'route_security_extraction_candidate', extractionCandidateId },
]);
```

Add cases for `scam_indicator`, duplicate retry, mixed ordinary/security batches, rollback when routing fails, pending-list exclusion, ordinary CLI error copy, caution reviewer-role matrix, and blocked denial for every ordinary Promotion actor. The database guard itself was RED/GREEN in Task 3; Task 5 RED must come from the missing extraction routing and repository/CLI error mapping, while guard assertions remain regression tests.

- [ ] **Step 2: Run focused RED**

```bash
pnpm --filter @airdrop/database test -- promotion-repository security-candidate-ingress
pnpm --filter @airdrop/worker test -- extract-discovered review-candidate
```

- [ ] **Step 3: Implement one extraction transaction per batch**

Wrap existing candidate inserts in `sql.begin`. For security claim types, call `route_security_extraction_candidate` before commit; for ordinary types, perform no security routing. Keep the existing inserted-candidate count semantic and unique `(discovered_item_id, payload_sha256)` replay behavior. Add the claim-type exclusion to `listPendingCandidates` even though the database Promotion command also rejects it.

```ts
return sql.begin(async (tx) => {
  const candidateId = await insertExtractionCandidate(tx, aiRunId, candidate);
  if (candidateId !== null && isSecurityClaimType(candidate.payload.claimType)) {
    await tx`select public.route_security_extraction_candidate(${candidateId}::uuid)`;
  }
  return candidateId === null ? 0 : 1;
});
```

- [ ] **Step 4: Map protected Promotion outcomes without leaking SQL**

Extend `PromotionCommandRejectionCode` and worker copy for the two stable security codes. Do not branch on exception text; use SQLSTATE/database code mapping already used by the repository.

```ts
if (databaseCode === 'AS111') return 'security_review_required';
if (databaseCode === 'AS112') return 'security_promotion_blocked';
```

- [ ] **Step 5: Run focused integration and package GREEN**

```bash
pnpm --filter @airdrop/database exec vitest run --no-file-parallelism \
  src/tests/security-candidate-ingress.integration.test.ts \
  src/tests/promotion-repository.integration.test.ts
pnpm --filter @airdrop/database test
pnpm --filter @airdrop/worker test
pnpm --filter @airdrop/worker typecheck
```

- [ ] **Step 6: Update workbook/HANDOVER and commit**

```bash
git add packages/database/src/ai/extraction-repository.ts packages/database/src/tests/promotion-repository* \
  packages/database/src/tests/security-candidate-ingress.integration.test.ts packages/database/package.json \
  apps/worker/src/ai apps/worker/src/promotion \
  docs/tasks/phase-7a-security-incidents-indicators-workbook.md docs/HANDOVER.md
git commit -m "feat(worker): route security extraction candidates"
```

---

### Task 6: Enforce protect-first collection and scoring races

**Files:**
- Modify: `packages/contracts/src/collection/source-collection.ts`
- Modify: `packages/contracts/src/collection/source-collection.test.ts`
- Modify: `packages/domain/src/queue/retry-policy.ts`
- Modify: `packages/domain/src/queue/retry-policy.test.ts`
- Modify: `packages/database/src/collection/types.ts`
- Modify: `packages/database/src/collection/source-collection-repository.ts`
- Modify: `packages/database/src/collection/worker-entry.ts`
- Modify: `packages/database/src/tests/source-collection-repository.test.ts`
- Modify: `packages/database/src/tests/source-collection-repository.integration.test.ts`
- Modify: `packages/database/src/scoring/scoring-repository.ts`
- Modify: `packages/database/src/tests/scoring-repository.integration.test.ts`
- Modify: `apps/worker/src/collection/collect-source.ts`
- Modify: `apps/worker/src/collection/tests/collect-source.test.ts`
- Modify: `apps/worker/src/queue/process-collection-job.ts`
- Modify: `apps/worker/src/queue/tests/process-collection-job.test.ts`
- Modify: `apps/worker/src/scoring/score-projects.ts`
- Modify: `apps/worker/src/scoring/tests/score-projects.test.ts`
- Modify: `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: `current_security_target_posture`, `security_target_lock_key_v1`, security-aware collection eligibility, and Evidence helpers.
- Produces: terminal `security_blocked` collection outcome; post-fetch source-lock recheck; clear-only automatic score persistence across project and eligible Evidence sources.

- [ ] **Step 1: Write collection/scoring RED tests**

```ts
await expect(repository.commitFeed(input)).rejects.toMatchObject({
  code: 'source_security_blocked',
});
expect(transaction.calls.slice(0, 2)).toEqual([
  ['lockSecurityTarget', 'source', sourceId],
  ['loadSecurityPosture', 'source', sourceId],
]);
```

Cover blocked after schedule, before fetch, during fetch-before-persist, response-body discard, queue cancellation, caution collection, blocked project with clear source still collecting, scoring project caution, caution eligible Evidence source, blocked Evidence with clear alternative, and resumption after clear.

- [ ] **Step 2: Run focused RED**

```bash
pnpm --filter @airdrop/contracts test -- source-collection
pnpm --filter @airdrop/database test -- source-collection scoring-repository
pnpm --filter @airdrop/worker test -- collect-source process-collection-job score-projects
```

- [ ] **Step 3: Add the terminal collection outcome and repository gate**

Add `security_blocked` to the strict outcome enum and classify it as non-retryable. Before any Raw Item/discovery insert, the repository transaction locks the source target, re-reads posture, and throws a typed `SourceSecurityBlockedError`. `collect-source` maps only that typed error to an inert result with no Raw Item; other errors remain `persistence_failed`. Queue settlement cancels with sanitized `source_security_blocked`.

```ts
await transaction.lockSecurityTarget('source', input.attempt.sourceId);
if (await transaction.loadSecurityPosture('source', input.attempt.sourceId) === 'blocked') {
  throw new SourceSecurityBlockedError();
}
```

- [ ] **Step 4: Gate deterministic score inputs and persistence**

In `listScoringInputs`, include only clear projects and signals whose security-eligible Evidence sources are all clear. In `recordProjectScore`, query the linked signals' currently eligible source IDs, acquire project/source locks in stable order, re-check all postures, and return `{ created: false, skippedReason: 'security_restricted' }` without inserting score/factors/links when non-clear.

Update `RecordProjectScoreResult` and the worker summary to count security skips separately; do not treat them as persistence failures or retry storms.

```ts
export type RecordProjectScoreResult =
  | { readonly created: true; readonly projectScoreId: string; readonly skippedReason: null }
  | { readonly created: false; readonly projectScoreId: string; readonly skippedReason: null }
  | { readonly created: false; readonly projectScoreId: null; readonly skippedReason: 'security_restricted' };
```

- [ ] **Step 5: Run real race integration GREEN**

Use two independent SQL sessions: pause collection/scoring after external/pure computation, commit the block in the second session, then release persistence and prove zero new Raw Item/score rows. Reverse ordering and prove the earlier ordinary write is retained as history.

```bash
pnpm --filter @airdrop/database exec vitest run --no-file-parallelism \
  src/tests/source-collection-repository.integration.test.ts \
  src/tests/scoring-repository.integration.test.ts
pnpm --filter @airdrop/worker test
pnpm --filter @airdrop/contracts test
pnpm --filter @airdrop/domain test
```

- [ ] **Step 6: Update workbook/HANDOVER and commit**

```bash
git add packages/contracts/src/collection packages/domain/src/queue/retry-policy* \
  packages/database/src/collection packages/database/src/scoring packages/database/src/tests/source-collection* \
  packages/database/src/tests/scoring-repository.integration.test.ts apps/worker/src/collection \
  apps/worker/src/queue/process-collection-job.ts apps/worker/src/queue/tests/process-collection-job.test.ts \
  apps/worker/src/scoring docs/tasks/phase-7a-security-incidents-indicators-workbook.md docs/HANDOVER.md
git commit -m "feat(security): enforce collection and scoring gates"
```

---

### Task 7: Add strict public security repositories and project projections

**Files:**
- Create: `packages/database/src/repositories/security-public-repository.ts`
- Create: `packages/database/src/tests/security-public-repository.test.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `packages/database/src/repositories/project-repository.ts`
- Modify: `packages/database/src/tests/project-repository.test.ts`
- Modify: `packages/database/src/tests/project-repository.integration.test.ts`
- Modify: `packages/database/src/tests/project-score-evidence.test.ts`
- Modify: `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: Task 3 public views and strict public projection contracts.
- Produces: `SecurityPublicRepository.listBlockedProjects`, `SecurityPublicRepository.getProjectSecurity`, `ProjectRepository` rows with `securityPosture`, and security-aware factor/citation reads.

- [ ] **Step 1: Write anon repository RED tests**

```ts
const page = await securityRepository.listBlockedProjects({ cursor: null, limit: 20 });
expect(client.relationCalls).toEqual(['public_blocked_projects']);
expect(page.items[0]).toEqual(publicBlockedProjectSchema.parse(blockedProject));
expect(page.nextCursor).toBe(expectedCursor);
```

Assert exact selected columns, `(restrictedAt desc, projectId desc)` cursor, malformed-row failure, no fallback base-table reads, clear/caution/blocked project mapping, blocked-source citation exclusion, alternative Evidence retention, and whole-score/factor-set disappearance after last Evidence loss.

- [ ] **Step 2: Run public repository RED**

```bash
pnpm --filter @airdrop/database test -- security-public project-repository project-score-evidence
```

- [ ] **Step 3: Implement strict mapping and immutable-score composition**

```ts
export interface SecurityPublicRepository {
  listBlockedProjects(input: PublicBlockedProjectQuery): Promise<PublicBlockedProjectPage>;
  getProjectSecurity(projectId: string): Promise<PublicProjectSecurityState>;
}
```

Use anon Supabase only. Parse every row before camel-case mapping. Extend project current-state selection with `security_posture`; keep the exact immutable score ID for score/factor/Evidence composition. Do not expose Evidence IDs, source URLs, reviewer data, internal notes, or indicator values lacking current public-safe approval.

- [ ] **Step 4: Run unit and real anon integration GREEN**

```bash
pnpm --filter @airdrop/database test
pnpm --filter @airdrop/database exec vitest run --no-file-parallelism \
  src/tests/project-repository.integration.test.ts
pnpm --filter @airdrop/database lint
pnpm --filter @airdrop/database typecheck
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add packages/database/src/repositories packages/database/src/index.ts packages/database/src/tests/project* \
  packages/database/src/tests/security-public-repository.test.ts \
  docs/tasks/phase-7a-security-incidents-indicators-workbook.md docs/HANDOVER.md
git commit -m "feat(database): expose safe public security projections"
```

---

### Task 8: Add authenticated security BFF routes and browser client

**Files:**
- Create: `apps/web/src/lib/security-review-handlers.ts`
- Create: `apps/web/src/tests/security-review-handlers.test.ts`
- Create: `apps/web/src/lib/security-review-api-client.ts`
- Create: `apps/web/src/tests/security-review-api-client.test.ts`
- Create: `apps/web/src/app/api/v1/review/security/candidates/route.ts`
- Create: `apps/web/src/app/api/v1/review/security/candidates/[candidateId]/route.ts`
- Create: `apps/web/src/app/api/v1/review/security/candidates/[candidateId]/decisions/route.ts`
- Create: `apps/web/src/app/api/v1/review/security/incidents/route.ts`
- Create: `apps/web/src/app/api/v1/review/security/incidents/[incidentId]/route.ts`
- Create: `apps/web/src/app/api/v1/review/security/incidents/[incidentId]/commands/route.ts`
- Create: `apps/web/src/app/api/v1/review/security/indicators/[indicatorId]/disclosure/route.ts`
- Create: `apps/web/src/app/api/v1/security/blocked-projects/route.ts`
- Modify: `apps/web/src/tests/review-client-bundle.test.ts`
- Modify: `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: `AuthenticatedUserVerifier`, server-only `SecurityReviewRepository`, `SecurityPublicRepository`, shared envelopes, and Task 1 contracts.
- Produces: all approved `/api/v1/review/security/*` mutations/queries, public blocked-project endpoint, and `createSecurityReviewApiClient` for reviewer pages.

- [ ] **Step 1: Write handler/client RED tests**

```ts
const response = await handlers.reviewCandidate(new Request(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': key },
  body: JSON.stringify(command),
}), { params: Promise.resolve({ candidateId }) });
expect(response.status).toBe(200);
expect(await response.json()).toEqual(candidateDecisionEnvelope);
```

Cover missing/malformed auth, auth verifier failure, unknown/repeated query keys, malformed cursor/body/idempotency key/UUID, every stable 400/401/403/404/409/500 mapping, exact success envelope, fresh token/key per client mutation, and public endpoint cursor behavior.

- [ ] **Step 2: Run Web RED**

```bash
pnpm --filter @airdrop/web test -- security-review-handlers security-review-api-client
```

- [ ] **Step 3: Implement thin handlers and route composition**

```ts
export type SecurityReviewHandlerDependencies = {
  readonly auth: AuthenticatedUserVerifier;
  readonly reviews: SecurityReviewRepository;
  readonly publicSecurity: SecurityPublicRepository;
  readonly ids: { generate(): string };
};
```

Authenticate first, extract only a canonical Bearer token, validate query/path/body/idempotency, call one repository method, and return shared envelopes. Route files construct dependencies from static server env and contain no business rules or long work.

- [ ] **Step 4: Implement strict browser API client**

Every call asks the session controller for a fresh access token; every mutation generates a fresh idempotency key and sends the caller's explicit expected version. Strictly parse success/error envelopes. HTTP 409 returns a typed conflict to the UI and never rewrites/retries the command.

```ts
const token = await session.getAccessToken();
if (token === null) throw new SecurityReviewApiError('unauthorized');
return requestSecurityApi({
  token,
  idempotencyKey: ids.generate(),
  body: securityCandidateReviewCommandV1Schema.parse(command),
});
```

- [ ] **Step 5: Prove browser bundle isolation and run GREEN**

Extend bundle markers to require public Supabase/auth/client code and reject database URLs, service-role/promotion/worker env names, postgres imports, internal note/locator/payload projection names, and server repository constructors.

```bash
pnpm --filter @airdrop/web test
pnpm --filter @airdrop/web lint
pnpm --filter @airdrop/web typecheck
pnpm --filter @airdrop/web build
```

- [ ] **Step 6: Update workbook/HANDOVER and commit**

```bash
git add apps/web/src/lib/security-review* apps/web/src/tests/security-review* \
  apps/web/src/tests/review-client-bundle.test.ts apps/web/src/app/api/v1/review/security \
  apps/web/src/app/api/v1/security docs/tasks/phase-7a-security-incidents-indicators-workbook.md \
  docs/HANDOVER.md
git commit -m "feat(web): add security review bff"
```

---

### Task 9: Build the complete reviewer security workflow

**Files:**
- Create: `apps/web/src/components/review/security-candidate-list.tsx`
- Create: `apps/web/src/components/review/security-candidate-detail.tsx`
- Create: `apps/web/src/components/review/security-candidate-form.tsx`
- Create: `apps/web/src/components/review/security-incident-list.tsx`
- Create: `apps/web/src/components/review/security-incident-detail.tsx`
- Create: `apps/web/src/components/review/security-incident-command-form.tsx`
- Create: `apps/web/src/components/review/security-indicator-disclosure-form.tsx`
- Create: `apps/web/src/tests/security-review-components.test.ts`
- Create: `apps/web/src/app/review/security/page.tsx`
- Create: `apps/web/src/app/review/security/candidates/new/page.tsx`
- Create: `apps/web/src/app/review/security/candidates/[candidateId]/page.tsx`
- Create: `apps/web/src/app/review/security/incidents/[incidentId]/page.tsx`
- Modify: `apps/web/src/app/review/review-shell.tsx`
- Modify: `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: `createSecurityReviewApiClient`, existing review session/pending-action utilities, and reviewer projection types.
- Produces: `/review/security` candidate/incident navigation, manual candidate, accept/open/attach, adjust/resolve/reopen, disclosure approval/withdrawal, and immutable history presentation.

- [ ] **Step 1: Write inert-rendering and workflow RED tests**

```tsx
const html = renderToStaticMarkup(
  <SecurityCandidateDetail candidate={candidateWithScriptLikeText} />,
);
expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
expect(html).not.toContain('<script>');
expect(html).not.toContain('<a');
```

Cover candidate filters/cursor, Evidence chain display, manual Evidence-only form, explicit target selection, accept-and-open/attach payloads, full incident history, high-impact confirmation summary, stale 409 reload copy, role revocation, public-safe approval/withdrawal, disabled duplicate submit, and no implicit retry.

- [ ] **Step 2: Run component RED**

```bash
pnpm --filter @airdrop/web test -- security-review-components
```

- [ ] **Step 3: Implement focused client components and pages**

Use the existing `/review` shell/session controller. Keep API state orchestration in client components and pure formatting in small helpers. Candidate/detail text uses the existing safe review text utility. Confirmation panels always display target, current/proposed posture, severity, category, reason, Evidence reference, and public summary before enabling submission.

```tsx
<SecurityCommandConfirmation
  target={command.target}
  currentPosture={incident.posture}
  proposedPosture={command.posture}
  severity={command.severity}
  reasonCode={command.reasonCode}
  evidenceId={command.evidenceId}
  publicSummary={command.publicSummary}
/>
```

- [ ] **Step 4: Implement conflict/revocation behavior**

On 409, clear pending state, display “安全记录已更新，请检查最新版本后重新提交。” and reload the detail. On 401/403, clear the reviewer session and return to sign-in/permission copy. Never generate a replacement expected version automatically.

```ts
if (error.code === 'security_version_conflict') {
  setPending(false);
  setMessage('安全记录已更新，请检查最新版本后重新提交。');
  await reload();
  return;
}
```

- [ ] **Step 5: Run reviewer UI GREEN and bundle guard**

```bash
pnpm --filter @airdrop/web test
pnpm --filter @airdrop/web typecheck
pnpm --filter @airdrop/web build
```

- [ ] **Step 6: Update workbook/HANDOVER and commit**

```bash
git add apps/web/src/components/review/security-* apps/web/src/tests/security-review-components.test.ts \
  apps/web/src/app/review/security apps/web/src/app/review/review-shell.tsx \
  docs/tasks/phase-7a-security-incidents-indicators-workbook.md docs/HANDOVER.md
git commit -m "feat(web): add security reviewer workflow"
```

---

### Task 10: Add public blocked opportunities and project security presentation

**Files:**
- Create: `apps/web/src/components/security-elements.tsx`
- Create: `apps/web/src/tests/security-elements.test.ts`
- Modify: `apps/web/src/components/opportunity-elements.tsx`
- Modify: `apps/web/src/app/opportunities/page.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/projects/[slug]/page.tsx`
- Modify: `apps/web/src/lib/opportunity-queries.ts`
- Modify: `apps/web/src/lib/project-detail-loader.ts`
- Modify: `apps/web/src/tests/project-detail-loader.test.ts`
- Modify: `apps/web/src/tests/project-score-evidence.test.ts`
- Modify: `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: strict `SecurityPublicRepository`, project `securityPosture`, safe incidents/indicators, and existing opportunity/project loaders.
- Produces: independent “安全封锁” view, caution badges, blocked-list pagination, warning-first blocked detail, disabled actions, and historical score labeling.

- [ ] **Step 1: Write public rendering/query RED tests**

```tsx
const html = renderToStaticMarkup(<ProjectSecurityBanner state={blockedState} />);
expect(html).toContain('当前项目已被安全封锁');
expect(html).toContain('历史评分快照');
expect(html).not.toContain('<a');
expect(html).not.toContain('reviewerUserId');
```

Cover clear regression-equivalence, caution retaining ordinary order, blocked removal from tabs/counts, blocked cursor list, accessible detail, disabled action affordances, resolved incident label, public-safe value, withdrawn/unapproved value absence, inert URL/HTML/Markdown, and official-source disclaimer.

- [ ] **Step 2: Run public Web RED**

```bash
pnpm --filter @airdrop/web test -- security-elements project-detail-loader project-score-evidence
```

- [ ] **Step 3: Implement security-aware loaders**

Load project identity/current immutable score and public security state separately, then compose them without allowing a later score read to change the snapshot. The opportunity loader dispatches ordinary tabs to `opportunity_list` and `blocked` to `public_blocked_projects`; counts use the same security-filtered data source as rows.

```ts
const project = await projects.getProjectBySlug(slug);
if (project === null) return null;
const scoreId = project.latestScore?.id;
const [signals, factors, citations, security] = await Promise.all([
  projects.listProjectSignals(project.projectId, 20),
  scoreId === undefined ? [] : projects.listCurrentScoreFactors(project.projectId, scoreId),
  scoreId === undefined ? [] : projects.listCurrentScoreEvidenceCitations(project.projectId, scoreId),
  publicSecurity.getProjectSecurity(project.projectId),
]);
```

- [ ] **Step 4: Implement minimal public components/copy**

Render `caution` as a badge and warning without reordering. Render `blocked` warning before metrics, mark retained metrics/factors historical, and disable action affordances. `SafeSecurityIndicatorText` uses only text nodes and never renders anchor/HTML/Markdown/copy-to-wallet behavior.

```tsx
export function SafeSecurityIndicatorText({ value }: { readonly value: string }) {
  return <code className="security-indicator-text">{value}</code>;
}
```

- [ ] **Step 5: Run public and full Web GREEN**

```bash
pnpm --filter @airdrop/web test
pnpm --filter @airdrop/web lint
pnpm --filter @airdrop/web typecheck
pnpm --filter @airdrop/web build
```

- [ ] **Step 6: Update workbook/HANDOVER and commit**

```bash
git add apps/web/src/components apps/web/src/app/opportunities apps/web/src/app/page.tsx \
  'apps/web/src/app/projects/[slug]/page.tsx' apps/web/src/lib/opportunity-queries.ts \
  apps/web/src/lib/project-detail-loader.ts apps/web/src/tests/security-elements.test.ts \
  apps/web/src/tests/project-detail-loader.test.ts apps/web/src/tests/project-score-evidence.test.ts \
  docs/tasks/phase-7a-security-incidents-indicators-workbook.md docs/HANDOVER.md
git commit -m "feat(web): expose public security posture"
```

---

### Task 11: Complete Golden Dataset, end-to-end gates, runbook, and full verification

**Files:**
- Create: `apps/worker/src/ai/fixtures/security-extraction-golden.ts`
- Create: `apps/worker/src/ai/tests/security-extraction-golden.test.ts`
- Modify: `packages/database/src/tests/security-review-repository.integration.test.ts`
- Modify: `packages/database/src/tests/source-collection-repository.integration.test.ts`
- Modify: `packages/database/src/tests/scoring-repository.integration.test.ts`
- Modify: `packages/database/src/tests/promotion-repository.integration.test.ts`
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: the complete Phase 7A vertical slice.
- Produces: Golden Dataset regression, final multi-session authorization/race proof, operator instructions, security review evidence, and repository-wide acceptance record.

- [ ] **Step 1: Write Golden Dataset RED cases**

```ts
export const securityExtractionGoldenCases = [
  { id: 'explicit-phishing', expectedClaimTypes: ['security_risk'], expectedGrounded: 1 },
  { id: 'negated-scam', expectedClaimTypes: [], expectedGrounded: 0 },
  { id: 'historical-incident', expectedClaimTypes: [], expectedGrounded: 0 },
  { id: 'wrong-entity', expectedClaimTypes: [], expectedGrounded: 0 },
  { id: 'prompt-injection', expectedClaimTypes: [], expectedGrounded: 0 },
  { id: 'locator-mismatch', expectedClaimTypes: [], expectedGrounded: 0 },
] as const;
```

Include domain, URL, contract, transaction, conflicting Evidence, and invented-reference fixtures. Model clients remain deterministic mocks; success is a grounded candidate or safe rejection, never a canonical incident.

- [ ] **Step 2: Run Golden RED, then implement fixtures/minimal runner support**

```bash
pnpm --filter @airdrop/worker test -- security-extraction-golden
```

Expected RED: fixture/runner missing. Add only the fixture harness needed to feed existing extraction schemas/grounding with deterministic mock outputs, then rerun GREEN.

```ts
for (const fixture of securityExtractionGoldenCases) {
  const result = await runExtractionFixture(fixture, createDeterministicModelClient(fixture));
  expect(result.claimTypes).toEqual(fixture.expectedClaimTypes);
  expect(result.groundedCount).toBe(fixture.expectedGrounded);
  expect(result.canonicalIncidentCount).toBe(0);
}
```

- [ ] **Step 3: Run final disposable database and integration matrix**

```bash
supabase db reset --yes
supabase test db
pnpm --filter @airdrop/database test:integration
```

Require all pgTAP/repository integration tests, two-session races, revoked-role behavior, collection in-flight block, Promotion gates, score gates, safe projections, and cleanup to pass. Record actual counts and fixture cleanup proof.

- [ ] **Step 4: Update runbook with safe operations**

Document reviewer provisioning/revocation, `/review/security` sign-in, candidate/incident/disclosure workflows, stable error meanings, blocked-source queue behavior, focused disposable test commands, append-only recovery, and production rollout exclusion. Do not include credentials or production commands.

- [ ] **Step 5: Run secret/unsafe-field review and repository verification**

```bash
rg -n 'service_role|DATABASE_URL|reviewer_user_id|internal_note|evidence_locator|candidate_payload' \
  apps/web packages/contracts/src/security packages/database/src/security
pnpm verify
git diff --check
```

Classify every match manually: server-only boundary, explicit denial/leakage test, internal schema, or defect. Fix defects before continuing. Expected: `pnpm verify` and `git diff --check` exit 0 under the declared runtime.

- [ ] **Step 6: Invoke completion/code-review skills**

Use `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. Resolve every validated Critical/Important finding with a new RED regression and focused/full GREEN evidence.

- [ ] **Step 7: Final workbook/HANDOVER update and commit**

Record exact focused/full counts, runtime, migration/type hashes, review findings/resolutions, production non-access, and local-versus-production status.

```bash
git add apps/worker/src/ai/fixtures apps/worker/src/ai/tests/security-extraction-golden.test.ts \
  packages/database/src/tests docs/runbooks/local-development.md \
  docs/tasks/phase-7a-security-incidents-indicators-workbook.md docs/HANDOVER.md
git commit -m "test(security): complete phase 7a acceptance gates"
```

---

## Final Acceptance Checklist

- [ ] Nine Security Ledger objects, protected commands, RLS, append-only guards, receipts, audit, and outbox are live in disposable tests.
- [ ] Every canonical indicator/decision traces to Evidence → Raw Item → Source.
- [ ] AI/collector paths cannot create canonical state or ordinary-promote security claims.
- [ ] Active bearer security reviewer/admin is required; revoked/forged/ordinary actors fail closed.
- [ ] Posture derives as `blocked > caution > clear`; incidents resolve independently.
- [ ] Shared target locks prove protect-first ordering for collection, Promotion, and scoring races.
- [ ] Blocked-source history is retained, internal security Evidence remains usable, and ordinary public Evidence/score eligibility remains closed.
- [ ] Alternative Evidence preserves signals; last eligible Evidence loss removes consuming scores/factor sets from current ranking.
- [ ] Caution and blocked project/source behaviors match the approved public and canonical gates.
- [ ] Reviewer and public UI render all untrusted text inertly and leak no internal data.
- [ ] Golden Dataset, full pgTAP, all repository integration, Web build, and `pnpm verify` pass.
- [ ] HANDOVER/workbook/runbook distinguish local completion from production deployment; production remains untouched.
