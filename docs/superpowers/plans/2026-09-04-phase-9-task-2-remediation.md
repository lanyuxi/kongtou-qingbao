# Phase 9 Task 2 Identity Boundary Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the submitted Phase 9 migration 30 implementation up to the already-approved Identity spec before any repository code is built on top of it.

**Architecture:** Preserve migration 30 unchanged and add one forward-only remediation migration. Browser principals retain owner-scoped reads but lose direct table writes; four security-definer commands own all mutations, receipts, append-only audit rows, and transactional outbox events. Anonymous public reads go through exact-column security-definer RPCs so private base rows and metadata never become reachable.

**Tech Stack:** PostgreSQL 15, Supabase Auth/RLS/PostgREST, pgTAP, TypeScript 6, Vitest 4, generated Supabase database types.

**Spec:** `docs/superpowers/specs/2026-09-03-phase-9-identity-private-data-design.md`

## Global Constraints

- Never store, request, log, or transmit seed phrases, private keys, mnemonics, wallet passwords, keystores, signing secrets, or recovery phrases.
- Do not edit `20260903000200_phase_9_identity.sql`; repair it with `20260904000100_phase_9_identity_command_boundary.sql`.
- Every mutable command requires an authenticated `auth.uid()`, exact JSON keys, an idempotency key, and a positive `expectedVersion`.
- Replaying the same key and input returns the original receipt without changing state; reusing the key with a different input raises `identity_idempotency_conflict` / `ID207`.
- `submit_add_wallet_address.expectedVersion` is the profile version, because the profile owns the address collection and its five-address invariant. Update-profile locks the profile version; visibility/remove lock the wallet-address version.
- All command state, receipt, audit, and outbox writes commit in one transaction. No external calls occur inside a transaction.
- Owner-private tables remain RLS protected; browser writes to profiles, wallet addresses, receipts, and audit tables are revoked.
- Public identity RPCs return exact safe columns only. They never expose email, visibility, versions, timestamps, counts, receipts, actor IDs, or event history.
- Database/disposable/remote actions require the existing fail-closed marker preflight and separate explicit authorization. Production migration application is out of scope.

---

### Task 1: Reconcile Phase 9 documentation and freeze interfaces

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-phase-9-identity-private-data-design.md`
- Modify: `docs/superpowers/plans/2026-09-03-phase-9-identity.md`
- Modify: `docs/tasks/phase-9-identity-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: approved D1-D6 decisions and the audit findings recorded on 2026-09-04.
- Produces: one authoritative Task 2 acceptance matrix and the version semantics in Global Constraints.

- [x] **Step 1: Correct stale status text**

Change the spec status from “draft/pending D1-D6” to approved, mark the original Task 2 as remediation in progress, and keep Task 3 unstarted.

- [x] **Step 2: Record the exact command and read interfaces**

Freeze these database functions for Task 3:

```sql
submit_update_profile(p_payload jsonb) returns jsonb
submit_add_wallet_address(p_payload jsonb) returns jsonb
submit_set_wallet_address_visibility(p_payload jsonb) returns jsonb
submit_remove_wallet_address(p_payload jsonb) returns jsonb
get_my_identity_profile() returns table (
  "userId" uuid,
  "displayName" text,
  "avatarUrl" text,
  timezone text,
  version bigint,
  "updatedAt" timestamptz
)
list_my_wallet_addresses() returns table (
  "walletAddressId" uuid,
  chain text,
  address text,
  label text,
  visibility text,
  version bigint,
  "createdAt" timestamptz,
  "updatedAt" timestamptz
)
get_public_identity_profile(p_user_id uuid) returns table (
  "userId" uuid,
  "displayName" text,
  "avatarUrl" text
)
list_public_identity_wallet_addresses(p_user_id uuid) returns table (
  "walletAddressId" uuid,
  chain text,
  address text,
  label text
)
```

Freeze the successful command response bodies as follows. `commandId` is the
UUID persisted in the receipt; an exact replay returns every original field
unchanged except `replayed`, which becomes `true`.

```json
{"version":1,"commandId":"uuid","profileId":"uuid","profileVersion":2,"replayed":false}
{"version":1,"commandId":"uuid","walletAddressId":"uuid","walletAddressVersion":1,"profileVersion":2,"replayed":false}
{"version":1,"commandId":"uuid","walletAddressId":"uuid","walletAddressVersion":2,"replayed":false}
{"version":1,"commandId":"uuid","walletAddressId":"uuid","walletAddressVersion":3,"replayed":false}
```

The response lines correspond in order to update profile, add address, change
visibility, and remove address. A successful remove records the tombstone
version in its receipt/audit/outbox even though the current address row is gone.

- [x] **Step 3: Run documentation gates**

Run:

```bash
pnpm check:placeholders
git diff --check
```

Expected: both exit 0.

### Task 2: Write load-bearing pgTAP and PostgREST RED tests

**Files:**
- Modify: `supabase/tests/021_phase_9_identity.test.sql`
- Create: `packages/database/src/tests/identity-command-boundary.integration.test.ts`
- Modify: `packages/database/package.json`
- Modify: `docs/tasks/phase-9-identity-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: the eight frozen RPC signatures from Task 1.
- Produces: behavioral tests that fail against migration 30 for missing interfaces or wrong behavior.

- [x] **Step 1: Expand pgTAP 021 before production SQL changes**

Add literal assertions for:

```sql
-- ACL and roles
-- anon: public read RPCs only
-- authenticated owner: private read RPCs + four mutation RPCs
-- authenticated non-owner: zero private rows and no cross-owner mutation
-- no JWT/auth.uid(): every mutation raises identity_session_required

-- command behavior
-- update profile: success, exact replay, changed-payload ID207, stale ID206
-- add wallet: success, exact replay without a second row, changed-payload ID207,
--             stale profile version ID206, sixth address ID205, duplicate ID204
-- visibility: version increment, audit row, replay, stale ID206
-- remove: deleted current row, append-only removal audit, replay, stale ID206

-- integrity
-- browser direct writes denied
-- receipt/profile-event/wallet-event UPDATE and DELETE rejected
-- every success adds one exact outbox event; every failure adds nothing
-- hidden addresses absent from public RPC; public addresses visible to anon
-- public RPC column lists exclude private metadata
```

- [x] **Step 2: Add a real PostgREST/Auth integration test**

Use two Supabase auth clients plus the marker-verified owner PostgreSQL connection. Create run-scoped users and assert owner/non-owner separation, all four command RPCs, replay, version conflict, anonymous public reads, rollback, and exact cleanup. Add this file once to the database `test:integration` script.

- [x] **Step 3: Run local static gates**

Run the database TypeScript test without integration environment variables; it must be discovered and skipped only by the existing environment gate. Run database lint and typecheck; all must exit 0.

- [x] **Step 4: Obtain explicit disposable RED authorization**

The authorized scope must name: read-only identity/hash/marker preflight, exact test sync if the disposable checkout is remote, one focused pgTAP 021 run, one focused identity integration run, and mandatory cleanup. It must explicitly exclude reset, migration sync/application, typegen, production, and a second run.

- [x] **Step 5: Verify RED on migration 30**

Expected failure reasons must be the missing two commands, broken replay/version behavior, missing append-only guards/outbox events, public read denial, or direct-write bypass. SQL parse errors, fixture errors, missing plan, environment mismatch, or cleanup residue are not accepted RED evidence.

### Task 3: Add the forward-only remediation migration

**Files:**
- Create: `supabase/migrations/20260904000100_phase_9_identity_command_boundary.sql`
- Modify: `supabase/tests/006_read_models.test.sql`
- Modify: `docs/tasks/phase-9-identity-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: migration 30 tables and the eight RPC signatures.
- Produces: complete database-owned Identity mutation and read boundary.

- [x] **Step 1: Harden tables and append-only audit**

Add receipt input hashes and resulting versions; add append-only profile events;
make `profiles.timezone` nullable to match the approved command/projection
contracts; add one Identity ledger mutation rejection function and triggers for
receipts, profile events, and wallet events. Revoke browser
INSERT/UPDATE/DELETE on private tables and remove the duplicate pre-Phase-9
profile policies while preserving one owner-select policy.

- [x] **Step 2: Extend the outbox allowlist and strict payload constraint**

Append exactly these event types while preserving every previous branch verbatim:

```text
identity.profile.updated.v1
identity.wallet_address.added.v1
identity.wallet_address.visibility_changed.v1
identity.wallet_address.removed.v1
```

Each payload contains only `version`, `eventType`, `aggregateId`, `aggregateVersion`, and `occurredAt`.

- [x] **Step 3: Replace the two incomplete commands and add the missing two**

For every command: validate exact keys/types, compute a canonical input hash,
check an existing receipt before locking/mutating, return the exact response
shape frozen in Task 1, lock the target aggregate, enforce expected version,
write state + audit + receipt + outbox, and map only
`ID201`-`ID208`/`ID299` stable failures. Nullable profile and wallet label
fields use key presence rather than `coalesce`, so an explicit JSON `null`
clears the field instead of silently retaining the previous value.

- [x] **Step 4: Add private and public read RPCs**

Private RPCs use `auth.uid()` and exact owner filters. Public RPCs are security-definer, return only the contract-safe fields, filter addresses to `visibility = 'public'`, and receive EXECUTE for anon/authenticated only. Revoke function execution from PUBLIC and unrelated worker roles.

- [x] **Step 5: Update exact policy/function catalog assertions**

Keep the two strict lists in `006_read_models.test.sql` alphabetically ordered and add comments for every new policy/function that the catalogue requires.

### Task 4: Verify GREEN and regenerate types

**Files:**
- Modify mechanically: `packages/database/src/generated/database.types.ts`
- Modify: `docs/tasks/phase-9-identity-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: remediation migration and RED tests.
- Produces: PostgreSQL-proven schema and stable generated TypeScript interfaces.

- [x] **Step 1: Obtain explicit disposable GREEN authorization**

Authorize fail-closed preflight, exact migration/test sync, one reset through migration 31, focused 021, full pgTAP, focused identity integration, full integration, double typegen, residue checks, and cleanup. Production remains excluded.

The first authorization was consumed safely: reset through migration 31 and focused 021 passed, but full pgTAP exposed four stale direct-profile-write assertions in 002. The run stopped before integration/typegen, cleaned to zero residue, and the stale test was repaired locally. A fresh no-reset rerun authorization is required before Step 2 can be completed.

The no-reset rerun proved focused 002 (61 tests) and the full 001–021 pgTAP matrix (1,644 tests) GREEN. Its focused integration command omitted `CI=true`, so pnpm stopped before Vitest with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`; no fixture or database behavior ran. The checkout was restored and cleaned. A narrower integration/typegen-only authorization with `CI=true` is required; the passing pgTAP matrix must not be rerun.

The CI-corrected focused integration then passed 3/3 behaviors, but an independent gate found three wallet outbox rows left behind after the remove command. Cleanup only read current wallet rows, so it lost the deleted wallet aggregate ID, and its own assertion did not inspect outbox/profile events. The run stopped before full integration/typegen and removed exactly those three owned events. The harness now unions current wallets with the append-only wallet event ledger and asserts both additional residue classes. A fresh cleanup-corrected integration/typegen-only authorization is required.

- [x] **Step 2: Run reset and focused GREEN**

After reset, first assert migration count/max version and the paused marker. Run 021 and the identity integration test. Stop immediately on any failure.

- [x] **Step 3: Run full database matrices**

Run all pgTAP files, then the complete database integration command once. Require zero SQL errors, unhandled rejections, timeouts, or fixture residue.

- [x] **Step 4: Generate types twice**

Generate twice from the same reset schema, compare byte-for-byte, then mechanically replace `packages/database/src/generated/database.types.ts` with the first stable result.

- [x] **Step 5: Run local package gates**

Run database unit tests, lint, typecheck, and `git diff --check`. Expected: all exit 0.

### Task 5: Final acceptance and handoff to Task 3

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-phase-9-identity-private-data-design.md`
- Modify: `docs/superpowers/plans/2026-09-03-phase-9-identity.md`
- Modify: `docs/tasks/phase-9-identity-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: all GREEN evidence.
- Produces: a trustworthy Task 2 completion checkpoint for repository work.

- [x] **Step 1: Run mutation checks**

Prove at least these mutations are caught: skip receipt lookup, ignore `expectedVersion`, grant browser direct write, omit an audit insert, omit an outbox insert, remove `visibility = 'public'`, and remove the non-owner filter.

Disposable mutation protocol (requires a separate explicit authorization):

1. Freeze the final migration-31 SHA and create seven untracked temporary variants. Each variant changes exactly one anchor and must parse as SQL before remote use.
2. For each variant, overwrite only the remote migration-31 filename, verify its unique SHA, run one disposable reset, then run focused 021 exactly once. A kill is valid only when all 82 planned TAP assertions execute without parse/Bad-plan noise and at least the mapped assertion fails:
   - receipt lookup → update replay/side-effect assertions;
   - `expectedVersion` → stale profile-version assertion;
   - browser direct-write grant → browser write-privilege assertion;
   - profile audit insert → profile-event count assertion;
   - identity outbox insert → outbox count/type assertions;
   - public visibility predicate → hidden-wallet public-read assertion;
   - `auth.uid()` owner predicate → private profile/wallet isolation assertions.
3. Do not run integration, full pgTAP, or typegen on a mutant. After each accepted kill, proceed only by replacing migration 31 with the next prevalidated variant and resetting the same disposable database.
4. In all success or failure paths, overwrite migration 31 with the frozen final file, verify its SHA, perform the eighth and final clean reset, then require focused 021 PASS, migration count/max, marker, and zero owned residue before deleting every mutation temp.
5. Hard maximum: eight exact migration-file syncs, eight disposable resets, and eight focused-021 invocations (seven expected RED kills plus one final GREEN restoration). Production and ports 54321/54322 remain excluded.

- [x] **Step 2: Run the root gate**

Run exact Node 22.22.2 / pnpm 11.16.0 `pnpm verify`, `pnpm check:placeholders`, and `git diff --check`. Record pass counts and gated skips without treating skips as behavior proof.

#### Review Fix Round 1（blocks Steps 3–4）

- [x] **R1 Step 1: Add load-bearing RED assertions**

Extend 021 without changing production SQL. Require: `identity_profile_events`
RLS plus cross-owner filtering and browser write denial; zero direct Identity
table DML for `service_role` and unrelated worker roles; an exact eight-RPC role
matrix; changed-payload same-key `ID207` for visibility and remove; value-level
outbox aggregate/payload/time correlations; and an injected persistence failure
that returns `ID299` with zero side effects.

- [x] **R1 Step 2: Obtain and run one test-only disposable RED**

Use the current restored final migration 31. After local/remote fail-closed
preflight, back up and sync only 021, run it once, accept RED only if every
planned assertion completes and failures are limited to the service/worker DML
boundary and missing `ID299` mapper, then prove zero residue and restore the
remote 021. No reset, migration sync, integration, typegen, full pgTAP, second
run, production, or ports 54321/54322.

- [x] **R1 Step 3: Implement the minimum migration fix**

Extend existing table DML revokes to `service_role` and unrelated workers. Add
one exception boundary to each mutation RPC that rethrows stable
`ID201`–`ID208`/`ID299` and maps every other caught persistence failure to
`identity_persistence_failed` / `ID299`. Do not change command ordering,
payloads, versions, read projections, schemas, or generated types.

- [x] **R1 Step 4: Obtain and run disposable GREEN**

Sync the repaired migration 31 and 021 with exact hashes, perform one reset,
then require focused 021, full pgTAP, focused Identity integration, the complete
database integration matrix, zero residue, and final state/hash cleanup. The
function/table shapes do not change, so generated types must remain byte-identical;
verify their committed hash rather than hand-editing generated output. Production
remains excluded.

Before sync, back up the remote migration 31, 002, and 021 as exact local
restore anchors. The normal path has exactly one reset. A second reset is
authorized only if the repaired migration or a required GREEN gate fails: first
restore all three anchors, then use the second reset plus the restored focused
021 to prove the prior disposable baseline and stop. On the successful path,
temporarily sync the corrected 002 for the full pgTAP matrix and restore only
that test file after evidence; keep the repaired migration 31 and R1 021 as the
new disposable checkout state. Run one remote type generation and require its
bytes to match the committed generated file; do not replace the file.

- [x] **R1 Step 5: Re-run local gates and scoped review**

Run fresh root `pnpm verify`, placeholders, diff check, and independent scoped
review. PostgreSQL `RETURNS TABLE` OUT parameters do not expose nullability to
the generator; keep the deterministic generated file unchanged and require the
Task 3 repository boundary to use the approved nullable contracts rather than
trusting raw RPC return nullability.

- [x] **Step 3: Reconcile documentation**

Mark Task 2 complete only if every acceptance item has fresh evidence. Keep migration 31 production-unapplied and Task 3 as the next task.

- [ ] **Step 4: Commit the independently testable Task 2 repair**

Use conventional subject:

```text
fix(db): complete identity command boundary
```

Do not deploy or apply migration 30/31 to production in this task.
