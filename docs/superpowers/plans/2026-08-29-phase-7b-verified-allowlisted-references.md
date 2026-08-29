# Phase 7B Verified Allowlisted References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a canonical, append-only reference ledger so every user-visible official link resolves from a verified allowlisted reference, with synchronous Phase 7A security coupling, `last_verified_at` derivation, and complete reviewer and public Web flows.

**Architecture:** Add strict reference contracts and pure normalization/transition rules, one forward-only PostgreSQL Reference Ledger migration, bearer-scoped protected commands, safe public projections, and a synchronous indicator→reference flag coupling. The Catalog keeps `projects.official_website_url` as a stored lead; link rendering is gated by the ledger. Phase 7B reads Phase 7A posture and indicators read-only and never rewrites Catalog, scores, collection history, or security state.

**Tech Stack:** Node.js 22.22.2, pnpm 11.16.0, TypeScript strict mode, Zod 4, PostgreSQL/Supabase RLS and PostgREST, pgTAP, Vitest, Next.js 16 App Router, React 19.

**Spec:** `docs/superpowers/specs/2026-08-29-phase-7b-verified-allowlisted-references-design.md`

## Global Constraints

- Use Node.js 22.22.2 and pnpm 11.16.0 for every acceptance gate.
- AI/collector output is candidate-only. Only the current bearer session's active `reviewer`, `senior_reviewer`, or `admin` may execute canonical reference commands. No new `app_role` value.
- Every canonical verify/reverify/restore decision must trace to Evidence → Raw Item → Source, and that Evidence's source must not be blocked under Phase 7A.
- A verified domain never verifies a URL beneath it. Domain authority and URL entries are separate objects with separate decisions.
- Reference state never mutates project lifecycle, deterministic score values/history, score recommendation, `sources.reputation_score`, or `sources.status`.
- Derive current state from append-only decisions; never store mutable current state. An unreleased `reference_security_flags` row overrides the derived state to `flagged`.
- `last_verified_at` is derived from the most recent successful verify decision, never from registration time and never from a mutable column.
- Only canonical-row URLs may become `href`. Candidate payload text, notes, and indicator values stay inert.
- Use the existing Promotion Service boundary, command receipt, audit, transactional outbox, cursor, idempotency, and expected-version patterns.
- Use one forward-only migration after the existing 22 migrations (`20260829000100`); never edit an already applied migration.
- Add no production dependency and perform no network call inside a transaction. No DNS, WHOIS, or chain lookup.
- Run resets/integration only against the marker-verified disposable Supabase stack (remote tunnels `16432 -> 64322` / `16433 -> 64321`). Never access or mutate production or ports `54321`/`54322`.
- Preserve unrelated `.DS_Store` and all other user changes.
- After every task, update `docs/tasks/phase-7b-verified-allowlisted-references-workbook.md` and `docs/HANDOVER.md` before committing.

## Planned File Structure

- `packages/contracts/src/references/enums.ts` — reference kinds, states, decisions, reason codes, error codes.
- `packages/contracts/src/references/commands.ts` — domain-authority and reference command/result contracts.
- `packages/contracts/src/references/projections.ts` — strict database/public projection schemas and cursors.
- `packages/contracts/src/references/events.ts` — exact versioned outbox payload contracts.
- `packages/domain/src/references/normalize.ts` — deterministic URL and domain normalization.
- `packages/domain/src/references/rules.ts` — decision/state transition matrix and `last_verified_at` derivation.
- `packages/domain/src/references/flag-match.ts` — Phase 7A indicator ↔ reference matching rules.
- `supabase/migrations/20260829000100_phase_7b_verified_allowlisted_references.sql` — five ledger objects, protected commands, RLS, outbox, flag coupling, and public read models.
- `supabase/tests/014_phase_7b_verified_allowlisted_references.test.sql` — catalog, RLS, atomicity, projection, coupling, and gate matrix.
- `packages/database/src/references/reference-review-repository.ts` — bearer-scoped reviewer RPC repository.
- `packages/database/src/references/entry.ts` / `browser-denied.ts` — server-only package export.
- `packages/database/src/repositories/reference-public-repository.ts` — anon-safe verified reference reads.
- `apps/web/src/lib/reference-review-handlers.ts` and `reference-review-api-client.ts` — authenticated BFF and browser client.
- `apps/web/src/lib/reference-cursor.ts` — boundary validation for untrusted reference cursors.
- `/api/v1/review/references/*` and `/api/v1/references` Route Handlers.
- `/review/references` reviewer pages and reference components.
- Public project detail link resolution via verified references.
- `apps/worker/src/ai/fixtures/reference-golden.ts` and `apps/worker/src/ai/tests/reference-golden.test.ts` — extraction-boundary Golden Dataset extension.
- `docs/tasks/phase-7b-verified-allowlisted-references-workbook.md` and `docs/runbooks/local-development.md`.

## Execution Preflight

Before Task 1, invoke `superpowers:using-git-worktrees`, create branch `codex/phase-7b-references` under the ignored `.worktrees/` directory, install strictly from the lockfile, and run:

```bash
env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm install --frozen-lockfile
env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm verify
```

Expected: exit 0 at the current mainline baseline (contracts 133 + domain 376 + database 257 + worker 236 + web 242 = 1,244 non-skipped and 68 environment-gated skips at plan approval). Record actual counts, worktree path, branch, HEAD, Node, and pnpm versions in the workbook and HANDOVER. Do not connect to production.

---

### Task 1: Define strict reference contracts

**Files:**
- Create: `packages/contracts/src/references/enums.ts`
- Create: `packages/contracts/src/references/enums.test.ts`
- Create: `packages/contracts/src/references/commands.ts`
- Create: `packages/contracts/src/references/commands.test.ts`
- Create: `packages/contracts/src/references/projections.ts`
- Create: `packages/contracts/src/references/projections.test.ts`
- Create: `packages/contracts/src/references/events.ts`
- Create: `packages/contracts/src/references/events.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `docs/tasks/phase-7b-verified-allowlisted-references-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: `apiErrorSchema`, API success envelope helpers, UUID/timestamp conventions, and existing source/project enums.
- Produces: all `reference*Schema` and inferred types named in design §6; later tasks import only from `@airdrop/contracts`.

- [ ] **Step 1: Write enum and strict-shape RED tests**

```ts
expect(referenceStateSchema.options).toEqual(['candidate', 'verified', 'flagged', 'withdrawn']);
expect(domainAuthorityStateSchema.options).toEqual(['candidate', 'granted', 'revoked']);
expect(registerReferenceCommandV1Schema.safeParse({
  version: 1,
  projectId,
  kind: 'official_site',
  url: 'https://Example.com:443/claim/?utm=x#frag',
  label: '官方领取页',
  evidenceId,
  note: null,
  reviewerUserId,
}).success).toBe(false);
```

Add table-driven failures for extra keys, unsupported enum values, invalid UUID/timestamp/version/cursor, url length 0/2049, label length 0/161, non-HTTPS and non-absolute URLs, malformed domains, and unsafe outbox keys (`reviewerUserId`, `note`, `locator`, `quote`, `payload`).

- [ ] **Step 2: Run contracts RED**

```bash
pnpm --filter @airdrop/contracts test -- references
```

- [ ] **Step 3: Implement the contract modules**

Use `.strict()`/`z.strictObject` and discriminated unions. Commands are versioned `1`; mutable aggregates require `expectedVersion`. Cursors use base64url envelopes. Export every schema/type through `packages/contracts/src/index.ts`.

- [ ] **Step 4: Run contracts GREEN**

```bash
pnpm --filter @airdrop/contracts test
pnpm --filter @airdrop/contracts lint
pnpm --filter @airdrop/contracts typecheck
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add packages/contracts/src/references packages/contracts/src/index.ts docs
git commit -m "feat(contracts): add verified reference contracts"
```

---

### Task 2: Implement pure normalization, transition, and derivation rules

**Files:**
- Create: `packages/domain/src/references/normalize.ts`
- Create: `packages/domain/src/references/normalize.test.ts`
- Create: `packages/domain/src/references/rules.ts`
- Create: `packages/domain/src/references/rules.test.ts`
- Create: `packages/domain/src/references/flag-match.ts`
- Create: `packages/domain/src/references/flag-match.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: reference enums and the Phase 7A indicator value shape.
- Produces: deterministic normalization, the decision × state transition matrix, `last_verified_at` derivation, and indicator↔reference matching used by both the database comments and the application layer.

- [ ] **Step 1: Write normalization and rule RED tests**

```ts
expect(normalizeReferenceUrl('https://Example.com:443/claim/?utm=x#frag'))
  .toBe('https://example.com/claim/?utm=x');
expect(normalizeReferenceDomain('WWW.Example.com.')).toBe('www.example.com');
expect(canDecideReference('candidate', 'verify')).toBe(false); // domain authority not granted
expect(deriveReferenceState([verify, withdraw])).toBe('withdrawn');
expect(deriveLastVerifiedAt([register, verify, withdraw])).toBe(verify.createdAt);
```

Cover: default-port removal, fragment removal, empty-path normalization, punycode-safe bounds, IDN case handling, tab/newline rejection, `http`/`https` only, the full decision × state matrix, and flag-over-verified precedence.

**Normalization decision to confirm while implementing:** normalization lowercases scheme and host, strips the trailing dot and the default port, removes the fragment, and normalizes an empty path — but it deliberately does **not** strip `www.` and does not collapse query strings. `www.example.com` and `example.com` are therefore distinct authorities and must be granted separately. This is the conservative choice for a security-sensitive allowlist; if product later wants apex folding, it must be an explicit decision with its own test rather than an implicit normalization side effect.

- [ ] **Step 2: Run domain RED**

```bash
pnpm --filter @airdrop/domain test -- references
```

- [ ] **Step 3: Implement the rules with no I/O and no Date.now()**

- [ ] **Step 4: Run domain GREEN**

```bash
pnpm --filter @airdrop/domain test
pnpm --filter @airdrop/domain lint
pnpm --filter @airdrop/domain typecheck
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add packages/domain/src/references packages/domain/src/index.ts docs
git commit -m "feat(domain): add reference normalization and rules"
```

---

### Task 3: Add the Reference Ledger migration, protected commands, and authorization matrix

**Files:**
- Create: `supabase/migrations/20260829000100_phase_7b_verified_allowlisted_references.sql`
- Create: `supabase/tests/014_phase_7b_verified_allowlisted_references.test.sql`

**Interfaces:**
- Consumes: existing `sources`, `project_sources`, `projects`, `evidence`, and the Phase 7A ledger functions.
- Produces: five ledger tables, three views, protected commands, RLS, outbox event types, and the synchronous flag coupling.

- [ ] **Step 1: Write the pgTAP RED test**

Cover: exact table/column/grant shape; RLS denial for every browser principal; `auth.uid()` attribution; append-only enforcement on every decision table; idempotent replay; stale `expectedVersion` rejection; `reference_evidence_required`; revocation taking effect on the next call; domain-first verify gating; unreleased-flag override; `last_verified_at` derivation; transactional rollback with outbox; and the Phase 7A coupling — an accepted domain indicator flags the matching reference, an accepted URL indicator flags only that URL and not sibling URLs under a granted domain, a blocked project suppresses all of its public references, and a flagged project reference stays flagged after a `verify` decision until a human releases it.

- [ ] **Step 2: Run the pgTAP RED**

```bash
pnpm test:db
```

- [ ] **Step 3: Implement the migration**

Create `project_domain_authorities`, `project_domain_authority_decisions`, `project_references`, `project_reference_decisions`, and `reference_security_flags`. Add `public_project_references`, `public_project_domain_authorities`, and `project_reference_current_state`. Protected functions follow the Phase 6A/7A pattern: service-role ownership, `revoke all … from public, anon, authenticated, service_role` then narrow grants, caller identity only from `auth.uid()`, and database-owned timestamps. Extend the `outbox_events` allowlist with the new version-1 event types.

Implement the Phase 7A coupling in the same migration: normalize both sides with the shared functions from Task 2 so a value cannot verify under one form and be flagged under another, and make the public view read the derived state rather than the last verification so the flag is synchronous without a background job. Ship the coupling with this task; editing the migration after it has been reset once would break the forward-only rule.

- [ ] **Step 4: Run the pgTAP GREEN**

```bash
pnpm test:db
pnpm db:types
git diff --exit-code packages/database/src/generated/database.types.ts
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add supabase/migrations/20260829000100_phase_7b_verified_allowlisted_references.sql \
  supabase/tests/014_phase_7b_verified_allowlisted_references.test.sql \
  packages/database/src/generated/database.types.ts docs
git commit -m "feat(db): add verified reference ledger"
```

---

### Task 4: Build bearer-scoped reference review repositories and real race tests

**Files:**
- Create: `packages/database/src/references/reference-review-repository.ts`
- Create: `packages/database/src/references/entry.ts`
- Create: `packages/database/src/references/browser-denied.ts`
- Create: `packages/database/src/tests/reference-review-repository.test.ts`
- Create: `packages/database/src/tests/reference-review-repository.integration.test.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `packages/database/package.json`

**Interfaces:**
- Consumes: the protected RPCs and the strict projection schemas from Task 1.
- Produces: a per-call-bearer reviewer repository, stable `AR2xx` error mapping, and a browser-denied export boundary.

- [ ] **Step 1: Write repository RED tests**

Cover: strict parse-before-map, exact selected columns, safe error mapping, cursor order `(created_at desc, id desc)`, empty pages, fresh bearer per call, fresh idempotency key per mutation, and browser export denial.

- [ ] **Step 2: Run database RED**

```bash
pnpm --filter @airdrop/database test
```

- [ ] **Step 3: Implement the repository and export boundary**

- [ ] **Step 4: Run authorized disposable integration**

Require explicit user authorization. Fail-closed preflight before any reset: remote workdir `/root/airdrop-governance-test`, project `airdrop-intelligence-governance-test`, database/Kong ports `64322`/`64321`, local tunnels `16432`/`16433`, the paused seed marker, and the migration/test/seed hashes. Prove the tunnel endpoint by comparing a tunnel-side PostgREST count with a remote `docker exec psql` count of the same relation.

```bash
pnpm --filter @airdrop/database test:integration
```

Two-session races to cover: flag-vs-verify serialization, revoked domain authority un-verifying its URLs, and concurrent duplicate registration collapsing to one canonical row.

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add packages/database/src/references packages/database/src/tests packages/database/src/index.ts \
  packages/database/package.json docs
git commit -m "feat(database): add reference review repository"
```

---

### Task 5: Prove the Phase 7A security coupling under real races

> The coupling SQL and its pgTAP coverage ship with the Task 3 migration, so this task adds no migration edit. Editing an already-reset migration would break the forward-only rule.

**Files:**
- Create: `packages/database/src/tests/reference-security-coupling.integration.test.ts`
- Modify: `packages/database/src/tests/reference-review-repository.integration.test.ts`

**Interfaces:**
- Consumes: Phase 7A `security_indicators`, `security_incidents`, and `current_security_target_posture()` read-only.
- Produces: disposable-stack proof that the coupling is synchronous, human-restorable, and race-safe.

- [ ] **Step 1: Write coupling integration RED tests**

Cover: flag-vs-verify serialization under two sessions; `restore` requiring Evidence and appending a decision instead of deleting the flag row; released flags retaining their release history; revoked domain authority un-verifying its URLs while a concurrent verify is in flight; and a blocked source's Evidence being rejected as verification input.

- [ ] **Step 2: Run the authorized disposable integration**

Require explicit user authorization and the same fail-closed preflight as Task 4. Do not reset again unless the previous task left fixture residue.

- [ ] **Step 3: Update workbook/HANDOVER and commit**

```bash
git add packages/database/src/tests docs
git commit -m "test(db): prove reference security coupling races"
```

---

### Task 6: Add strict public reference repositories and projections

**Files:**
- Create: `packages/database/src/repositories/reference-public-repository.ts`
- Create: `packages/database/src/tests/reference-public-repository.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- Consumes: `public_project_references`, `public_project_domain_authorities`, and Phase 7A public posture.
- Produces: anon-safe verified reference reads with an opaque cursor and no base-table fallback.

- [ ] **Step 1: Write public projection RED tests**

Cover: verified-only rows, flagged/withdrawn/candidate exclusion, blocked-project suppression, granted-domain-only rows, exact selected columns, malformed-row failure, no fallback base-table reads, cursor order, empty pages, and absence of Evidence ids, locators, notes, actor identity, and normalization diagnostics.

- [ ] **Step 2: Run database RED**

```bash
pnpm --filter @airdrop/database test
```

- [ ] **Step 3: Implement the repository**

- [ ] **Step 4: Run database GREEN**

```bash
pnpm --filter @airdrop/database test
pnpm --filter @airdrop/database lint
pnpm --filter @airdrop/database typecheck
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add packages/database/src/repositories packages/database/src/tests packages/database/src/index.ts docs
git commit -m "feat(database): expose safe public reference projections"
```

---

### Task 7: Add authenticated reference BFF routes and browser client

**Files:**
- Create: `apps/web/src/lib/reference-review-handlers.ts`
- Create: `apps/web/src/lib/reference-review-api-client.ts`
- Create: `apps/web/src/lib/reference-cursor.ts`
- Create: `apps/web/src/app/api/v1/review/references/authorities/route.ts`
- Create: `apps/web/src/app/api/v1/review/references/authorities/[authorityId]/decisions/route.ts`
- Create: `apps/web/src/app/api/v1/review/references/route.ts`
- Create: `apps/web/src/app/api/v1/review/references/[referenceId]/decisions/route.ts`
- Create: `apps/web/src/app/api/v1/references/route.ts`
- Create: `apps/web/src/tests/reference-review-handlers.test.ts`
- Create: `apps/web/src/tests/reference-review-api-client.test.ts`
- Create: `apps/web/src/tests/reference-cursor.test.ts`

**Interfaces:**
- Consumes: the Task 4 and Task 6 repositories.
- Produces: thin authenticated handlers, a strict browser client, and a public verified-reference endpoint.

- [ ] **Step 1: Write handler and client RED tests**

Cover: missing/malformed auth, auth verifier failure, unknown/repeated query keys, malformed cursor/body/idempotency key/UUID, every stable `AR2xx` mapping, exact success envelope, fresh token and key per mutation, and typed `409` without retry. Cover the public endpoint cursor behavior and the untrusted-cursor boundary validation.

- [ ] **Step 2: Run Web RED**

```bash
pnpm --filter @airdrop/web test -- reference
```

- [ ] **Step 3: Implement the handlers, client, and cursor helper**

Route Handlers perform no long-running work. Validate untrusted cursors at the page boundary with `safeParse` and fall back to the first page rather than surfacing a server error.

- [ ] **Step 4: Run Web GREEN and verify bundle isolation**

```bash
pnpm --filter @airdrop/web test
pnpm --filter @airdrop/web lint
pnpm --filter @airdrop/web typecheck
pnpm --filter @airdrop/web build
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add apps/web/src/lib apps/web/src/app apps/web/src/tests docs
git commit -m "feat(web): add reference review bff"
```

---

### Task 8: Build the reviewer reference workflow

**Files:**
- Create: `apps/web/src/components/reference/authority-list.tsx`
- Create: `apps/web/src/components/reference/authority-detail.tsx`
- Create: `apps/web/src/components/reference/reference-list.tsx`
- Create: `apps/web/src/components/reference/reference-detail.tsx`
- Create: `apps/web/src/app/review/references/page.tsx`
- Create: `apps/web/src/app/review/references/authorities/[authorityId]/page.tsx`
- Create: `apps/web/src/app/review/references/[referenceId]/page.tsx`
- Modify: `apps/web/src/app/review/review-shell.tsx`
- Create: `apps/web/src/tests/reference-review-components.test.ts`

**Interfaces:**
- Consumes: the Task 7 client, the reviewer shell, the session/pending-action gate, and `safe-review-text.ts`.
- Produces: the domain-authority and reference review workflow with high-impact confirmations.

- [ ] **Step 1: Write component RED tests**

Cover: authority list/detail with grant, revoke, and regrant; reference list/detail with register, verify, reverify, restore, and withdraw; verify/restore requiring an explicit Evidence selection with no auto-selection; high-impact confirmations bound to the authoritative aggregate version; confirmation clearing on field edit or `409`; inert rendering of notes and hostile free text; and internal links formed only from validated UUIDs.

- [ ] **Step 2: Run Web RED**

```bash
pnpm --filter @airdrop/web test -- reference-review-components
```

- [ ] **Step 3: Implement the components and pages**

- [ ] **Step 4: Run Web GREEN**

```bash
pnpm --filter @airdrop/web test
pnpm --filter @airdrop/web lint
pnpm --filter @airdrop/web typecheck
pnpm --filter @airdrop/web build
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add apps/web/src/components apps/web/src/app/review apps/web/src/tests docs
git commit -m "feat(web): build reference reviewer workflow"
```

---

### Task 9: Add public link resolution and unverified-link marking

**Files:**
- Create: `apps/web/src/components/reference-elements.tsx`
- Modify: `apps/web/src/app/projects/[slug]/page.tsx`
- Modify: `apps/web/src/lib/project-detail-loader.ts`
- Modify: `apps/web/src/lib/opportunity-queries.ts`
- Modify: `apps/web/src/tests/project-detail-loader.test.ts`
- Create: `apps/web/src/tests/reference-elements.test.ts`

**Interfaces:**
- Consumes: `ReferencePublicRepository` and Phase 7A public posture.
- Produces: link resolution that renders an anchor only for verified references and marks everything else unverified and inert.

- [ ] **Step 1: Write public rendering RED tests**

Cover: clear-project regression equivalence, verified reference rendered as an anchor with `last_verified_at` and `rel="noreferrer noopener"`; granted domain rendered as a chip and never as a link; unverified official URL rendered as inert text with an explicit marker and no anchor; blocked project rendering no reference links; and hostile reference labels rendered inert.

- [ ] **Step 2: Run Web RED**

```bash
pnpm --filter @airdrop/web test -- reference-elements project-detail-loader
```

- [ ] **Step 3: Implement link resolution**

Load project identity, the current immutable score, and the public reference state separately, then compose them without allowing a later score read to change the reference snapshot. Render `projects.official_website_url` as an anchor only when a verified reference matches its normalized form.

- [ ] **Step 4: Run Web GREEN**

```bash
pnpm --filter @airdrop/web test
pnpm --filter @airdrop/web lint
pnpm --filter @airdrop/web typecheck
pnpm --filter @airdrop/web build
```

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add apps/web/src/components apps/web/src/app/projects apps/web/src/lib apps/web/src/tests docs
git commit -m "feat(web): resolve official links from verified references"
```

---

### Task 10: Complete Golden Dataset, end-to-end gates, runbook, and full verification

**Files:**
- Create: `apps/worker/src/ai/fixtures/reference-golden.ts`
- Create: `apps/worker/src/ai/tests/reference-golden.test.ts`
- Modify: `packages/contracts/src/references/projections.test.ts`
- Modify: `packages/database/src/tests/reference-review-repository.integration.test.ts`
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/tasks/phase-7b-verified-allowlisted-references-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: the complete Phase 7B vertical slice.
- Produces: Golden Dataset regression, final authorization/race proof, operator instructions, and the repository-wide acceptance record.

- [ ] **Step 1: Write Golden Dataset RED cases**

Add reference-proposal fixtures: explicit official announcement, social-account impersonation, near-miss domain, injected instruction, and invented Evidence locator. Assert that a proposal can only ever become a `candidate` reference and never a canonical verification, and run a mutation check to prove the negative cases actually discriminate.

- [ ] **Step 2: Run Golden RED, then implement the fixture harness**

```bash
pnpm --filter @airdrop/worker test -- reference-golden
```

- [ ] **Step 3: Run the authorized disposable database and integration matrix**

Require explicit user authorization. Fail-closed preflight first, then, in the remote disposable workdir with the pinned CLI 2.112.0:

```bash
cd /root/airdrop-governance-test && ./cli/node_modules/.bin/supabase db reset --yes
cd /root/airdrop-governance-test && ./cli/node_modules/.bin/supabase test db
pnpm --filter @airdrop/database test:integration
```

Require the full pgTAP matrix, reference/security/promotion/scoring/project integration suites, two-session races, revoked-role behavior, and fixture cleanup to pass. Record actual counts and cleanup proof.

- [ ] **Step 4: Update the runbook**

Document reference provisioning, authority-vs-URL decision workflow, `last_verified_at` semantics, the security-flag coupling and restoration path, stable `AR2xx` error meanings, focused disposable test commands, append-only recovery, and production rollout exclusion. No credentials and no production commands.

- [ ] **Step 5: Run secret/unsafe-field review and repository verification**

```bash
rg -n 'service_role|DATABASE_URL|reviewer_user_id|internal_note|evidence_locator|candidate_payload' \
  apps/web packages/contracts/src/references packages/database/src/references
pnpm verify
git diff --check
```

Classify every match manually as a server-only boundary, an explicit denial/leakage test, an internal schema, or a defect. Fix defects before continuing.

- [ ] **Step 6: Invoke completion/code-review skills**

Use `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. Resolve every validated Critical/Important finding with a new RED regression and focused/full GREEN evidence.

- [ ] **Step 7: Final workbook/HANDOVER update and commit**

Record exact focused/full counts, runtime, migration/type hashes, review findings/resolutions, production non-access, and local-versus-production status.

```bash
git add apps/worker/src/ai/fixtures apps/worker/src/ai/tests/reference-golden.test.ts \
  packages/contracts/src/references packages/database/src/tests docs/runbooks/local-development.md \
  docs/tasks/phase-7b-verified-allowlisted-references-workbook.md docs/HANDOVER.md
git commit -m "test(security): complete phase 7b acceptance gates"
```

---

## Final Acceptance Checklist

- [ ] Five Reference Ledger objects, protected commands, RLS, append-only guards, receipts, audit, and outbox are live in disposable tests.
- [ ] No user-visible official link renders unless it resolves from a `verified` reference under a granted domain authority.
- [ ] A verified domain does not by itself verify any URL beneath it, proven by an explicit test.
- [ ] Every verify/reverify/restore decision traces to Evidence → Raw Item → Source whose source is not blocked.
- [ ] `last_verified_at` is derived from the latest successful verify decision and is always shown next to a verified link.
- [ ] A matching Phase 7A indicator removes a reference from public rendering synchronously, and only a human Evidence-grounded decision can restore it, with flag history retained.
- [ ] A blocked project renders no reference links.
- [ ] AI/collector paths cannot create canonical verification.
- [ ] Active bearer reviewer/senior reviewer/admin is required; revoked, forged, and ordinary actors fail closed.
- [ ] Shared target locks prove protect-first ordering for flag-vs-verify and authority-revoke-vs-verify races.
- [ ] Public projections expose no Evidence locator, note, actor identity, candidate row, or normalization diagnostic.
- [ ] Reviewer and public UI render all untrusted text inertly and leak no internal data.
- [ ] Golden Dataset, full pgTAP, all repository integration, Web build, and `pnpm verify` pass.
- [ ] HANDOVER/workbook/runbook distinguish local completion from production deployment; production remains untouched.
