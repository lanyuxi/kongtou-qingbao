# Phase 7B Task 5 Reference Security Locking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and implement deterministic Phase 7A indicator/source coupling with reference verification and domain-authority decisions under real database races.

**Architecture:** Keep migrations 23 and 24 byte-immutable. Add migration 25 to replace only the indicator trigger function and the two decision RPC bodies, using `security_target_lock_key_v1()` with deterministic `source → domain_authority → reference → row lock` ordering. A dedicated integration suite observes real advisory waits and both winner orders; pgTAP 016 supplies structural and non-concurrent regression coverage.

**Tech Stack:** Node.js 22.22.2, pnpm 11.16.0, TypeScript strict mode, Vitest 4, `postgres` 3, Supabase/PostgreSQL, pgTAP, Supabase CLI 2.112.0.

**Spec:** `docs/superpowers/specs/2026-08-29-phase-7b-verified-allowlisted-references-design.md`

## Global Constraints

- Work only in `.worktrees/phase-7b-references` on `codex/phase-7b-references`; do not edit the main checkout except its required `docs/HANDOVER.md` mirror.
- Never edit `20260829000100_phase_7b_verified_allowlisted_references.sql` or `20260830000100_phase_7b_reference_review_boundary.sql`; their approved SHA-256 values are `75e038d8…5966` and `570e6b89…aad8`.
- Add no production dependency, public RPC, table, column, enum, or RPC signature. Generated database types must remain byte-identical to the Task 4 artifact: 158,662 bytes / SHA-256 `e5dc3861ebab1eda8206f7fca1a23d760d7c5a75b01b9ff3732bd734f17aedef`.
- Caller identity remains `auth.uid()` and only active `reviewer`, `senior_reviewer`, or `admin` may decide references/authorities.
- Replay returns its committed receipt without acquiring target locks; every non-replay security/mutable-state check happens after the required advisory locks.
- Lock order is Evidence `source`, matching `domain_authority`, `reference`, aggregate row. Within a class, UUID text order is ascending.
- The indicator trigger locks matched `reference` keys in UUID order before inserting flags; never use project-wide locks for this coupling.
- Every verify/reverify/restore Evidence must still resolve through Evidence → Raw Item → Source and its source must not be blocked after the source lock is acquired.
- Tests may use a manual blocker transaction only as an observation barrier. Both production paths must themselves appear as waiters on the same advisory key.
- Every database action requires fresh explicit authorization. Use only `/root/airdrop-governance-test`, project `airdrop-intelligence-governance-test`, remote DB/Kong ports `64322`/`64321`, local `127.0.0.1:16432`/`16433`, and the paused marker. Never access `airdrop-intelligence-os` or ports `54321`/`54322`.
- Update worktree `docs/HANDOVER.md`, main-checkout `docs/HANDOVER.md`, and `docs/tasks/phase-7b-verified-allowlisted-references-workbook.md` after every completed step.

## File Map

- Create `packages/database/src/tests/reference-security-coupling.integration.test.ts`: self-contained Task 5 fixtures, exact advisory-wait observation, both race orders, restore/history, blocked-source Evidence, and exact cleanup.
- Modify `packages/database/package.json`: append the new integration file to the explicit `test:integration` command.
- Create `supabase/tests/016_phase_7b_reference_security_locking.test.sql`: RED structural lock assertions plus privilege/signature/rollback regressions.
- Create `supabase/migrations/20260831000100_phase_7b_reference_security_locking.sql`: replace exactly three function bodies with shared aggregate locks; preserve owners/grants/contracts.
- Modify `docs/superpowers/plans/2026-08-29-phase-7b-verified-allowlisted-references.md`: point Task 5 at this approved detailed plan and mark completed steps.
- Modify both HANDOVER files and the Phase 7B workbook after every step.

---

### Task 1: Prove and implement reference security locking

**Files:**
- Create: `packages/database/src/tests/reference-security-coupling.integration.test.ts`
- Modify: `packages/database/package.json`
- Create: `supabase/tests/016_phase_7b_reference_security_locking.test.sql`
- Create: `supabase/migrations/20260831000100_phase_7b_reference_security_locking.sql`
- Modify: `docs/superpowers/plans/2026-08-29-phase-7b-verified-allowlisted-references.md`
- Modify: `docs/HANDOVER.md`
- Modify: `docs/tasks/phase-7b-verified-allowlisted-references-workbook.md`

**Interfaces:**
- Consumes: `public.security_target_lock_key_v1(text, uuid)`, `public.current_security_target_posture(text, uuid)`, `public.flag_references_for_new_indicator()`, `public.submit_decide_reference(uuid, jsonb, text)`, `public.submit_decide_domain_authority(uuid, jsonb, text)`, and the Task 4 `ReferenceReviewRepository`.
- Produces: migration 25, pgTAP 016, and a registered disposable integration suite proving the shared-lock semantics without changing any TypeScript database shape.
- Stable errors: missing/blocked Evidence → `AR209`; flag/authority state makes the transition illegal → `AR202`; stale aggregate → `AR206`.

- [x] **Step 1: Verify the isolated clean baseline and immutable bytes**

Run from `.worktrees/phase-7b-references`:

```bash
git status --short
git branch --show-current
shasum -a 256 \
  supabase/migrations/20260829000100_phase_7b_verified_allowlisted_references.sql \
  supabase/migrations/20260830000100_phase_7b_reference_review_boundary.sql \
  supabase/tests/015_phase_7b_reference_review_boundary.test.sql \
  packages/database/src/generated/database.types.ts
```

Expected: clean status; branch `codex/phase-7b-references`; migrations 23/24 and 015 match the recorded handover hashes; generated types are 158,662 bytes with SHA `e5dc3861…aedef`. Record the preflight in all three handover/workbook locations.

- [x] **Step 2: Write the real-race integration RED**

Create a self-contained integration file gated by the existing four environment variables. Use three `postgres` connections with `max: 1` (`owner`, `blocker`, `inserter`) plus fresh Supabase auth clients and the real `ReferenceReviewRepository`. Generate every fixture ID with `randomUUID()` and retain owned IDs for cleanup.

The exact test cases are:

```ts
it('serializes flag-first and verify-first on the same reference advisory key', async () => {});
it('serializes revoke-first and verify-first on the same authority advisory key', async () => {});
it('requires Evidence to restore and retains the released flag plus decision history', async () => {});
it('waits on the Evidence source key and rejects verification when source blocking wins', async () => {});
it('removes every Task 5 fixture and outbox row', async () => {});
```

Use the blocker PID to observe only waiters conflicting with the exact blocker lock, not any unrelated advisory wait:

```ts
async function waitForBlockedAdvisoryLock(
  observer: postgres.Sql,
  blockerPid: number,
  expectedWaiters: number,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await observer<readonly { waiting: number }[]>`
      select count(*)::integer as waiting
      from pg_catalog.pg_locks as waiting
      where waiting.locktype = 'advisory'
        and not waiting.granted
        and exists (
          select 1
          from pg_catalog.pg_locks as held
          where held.pid = ${blockerPid}
            and held.locktype = 'advisory'
            and held.granted
            and held.classid = waiting.classid
            and held.objid = waiting.objid
            and held.objsubid = waiting.objsubid
        )
    `;
    if ((rows[0]?.waiting ?? 0) === expectedWaiters) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`reference_security_advisory_wait_not_observed:${expectedWaiters}`);
}
```

For each two-winner race, begin the blocker transaction, record `pg_backend_pid()`, acquire the exact key, start the intended winner first and observe one waiter, start the loser and observe two waiters, then commit the blocker. Assert both returned results/errors and the final canonical/public state. Always roll back the blocker in `finally` when the test exits early.

Expected outcomes:

- flag-first: indicator insert succeeds; verify returns `AR202`; flag row is active; public row absent.
- verify-first: verify reaches version 2; indicator then creates the active flag; final derived state `flagged`; public row absent.
- revoke-first: authority reaches `revoked`; verify/reverify returns `AR202`; public row absent.
- verify-first: verify/reverify succeeds; revoke then reaches `revoked`; public row absent while decision history remains append-only.
- restore without Evidence: `AR209`, no decision/version/release change.
- restore with usable Evidence: one new `restore` decision, reference version increments once, original flag row remains and has non-null `released_at`, reviewer `released_by`, and exact `release_evidence_id`.
- source-block-first: verification is observed waiting on the source key; after the blocker writes a `blocked` source incident decision and commits, verification returns `AR209` with no new decision/version/outbox row.

Cleanup must use `session_replication_role = replica` only inside its transaction, delete exact owned security indicator links/indicators/incidents/decisions/events/reference flags/reference decisions/commands/outbox/authorities/references/Evidence/raw/source/project/roles/profiles/auth users, then run a separate post-commit zero-residue query.

- [x] **Step 3: Register the new integration file and run local static/gated RED checks**

Append `src/tests/reference-security-coupling.integration.test.ts` to `packages/database/package.json#scripts.test:integration` without reformatting the script.

Run with Node 22.22.2 directly from `packages/database`:

```bash
/Users/xixi/.workbuddy/binaries/node/versions/22.22.2/bin/node ../../node_modules/eslint/bin/eslint.js .
/Users/xixi/.workbuddy/binaries/node/versions/22.22.2/bin/node ../../node_modules/typescript/bin/tsc --noEmit
/Users/xixi/.workbuddy/binaries/node/versions/22.22.2/bin/node ../../node_modules/vitest/vitest.mjs run \
  src/tests/reference-security-coupling.integration.test.ts
```

Expected without integration variables: lint/typecheck exit 0; the new integration file is environment-gated skipped, not executed. Update all three handover/workbook locations with the test names, file hash, and explicit statement that behavioral RED still requires disposable authorization.

- [x] **Step 4: Write pgTAP 016 RED before migration 25**

Create `supabase/tests/016_phase_7b_reference_security_locking.test.sql`. Use `begin; select plan(18); … select * from finish(); rollback;`. Allocate the 18 assertions exactly as follows: 3 trigger lock/order checks; 6 reference source/authority/reference/order/re-check checks; 5 authority source/authority/order/re-check checks; and 4 aggregate security-definer/owner/signature/privilege checks.

- `flag_references_for_new_indicator()` definition calls `security_target_lock_key_v1('reference', …)` before inserting `reference_security_flags` and orders matched reference IDs.
- `submit_decide_reference(...)` definition contains source, authority, then reference lock calls before its aggregate `FOR UPDATE` and before `reference_evidence_is_usable()`/current-state checks.
- `submit_decide_domain_authority(...)` contains source then authority lock calls before aggregate `FOR UPDATE` and Evidence/state checks.
- all three functions remain security-definer with their existing owners; trigger and RPC signatures are unchanged.
- RPC execute privileges remain authenticated-only and direct ledger tables remain denied.
- malformed, unauthorized, replay, receipt, audit/outbox, and error contracts already proved by 014/015 are not duplicated.

Use `pg_get_functiondef()` only as a structural supplement. The integration RED is the load-bearing behavioral proof.

Run `git diff --check`, verify 016 contains a complete plan/finish/rollback, and update the three handover/workbook locations. Do not create migration 25 yet.

- [x] **Step 5: Obtain explicit test-only disposable RED authorization**

Stop and request authorization for only these actions: read-only fail-closed remote preflight; sync 016 only; open temporary tunnels and a 0600 four-variable environment; run focused 016 and the one new integration file against the current 24-migration schema; exact cleanup; close tunnels/remove temp files. Do not reset or sync a migration during RED.

- [x] **Step 6: Prove focused RED against migration 24**

> **2026-08-31 execution record — BLOCKED:** exact disposable preflight, 016-only sync, focused structural RED, IPv4 tunnel/env/parity, and cleanup completed; the sole integration run exposed a `public_reference.normalized_url` harness query error plus three 5s timeouts, not an acceptable behavioral missing-lock RED. Remote 016 and all temporary state were removed; this checkbox remains unchecked pending an authorized local test-byte repair and a fresh RED authorization. See `.superpowers/sdd/2026-08-31-phase-7b-task-5-reference-security-locking/task-1-red-verification-report.md`.

> **2026-08-31 repaired rerun — BLOCKED:** the repaired run accepted focused 016 structural RED and produced all three intended fast `reference_security_advisory_wait_not_observed:1` failures without timeout/SQL/TAP noise, but restore/history incorrectly asserts raw `postgres` `released_at` (`Date`) as a string. Its resulting 4 failed / 1 passed shape is not the required 3 failed / 2 passed behavioral RED. Cleanup and final remote state checks passed; this checkbox remains unchecked pending an authorized Date-assertion repair and fresh single-use rerun. See `.superpowers/sdd/2026-08-31-phase-7b-task-5-reference-security-locking/task-1-red-rerun-report.md`.

> **2026-08-31 second-repaired rerun — COMPLETE:** authorization-record HEAD `2d1afea` passed exact local/remote identity, hash, health, marker, port, and absence preflight. The one 016-only sync verified SHA `0fa44939…bd20` / 292 lines. Focused 016 returned **Files=1 / Tests=18 / Failed=14 / exit 1** with expected missing-lock failures 1–14 and passes 15–18, without SQL/TAP/plan noise. IPv4 tunnel/env parity was exact (remote psql=tunnel PostgreSQL=anon PostgREST count 2). The one SHA `946c475d…23b2` integration returned **1 file / 5 tests / 3 failed / 2 passed / exit 1**: the three named `reference_security_advisory_wait_not_observed:1` behavioral REDs failed fast; restore/history and cleanup passed. Independent residue was zero in all 20 categories; remote 016, tunnels, env/socket were removed and final remote state remained 24/max `20260830000100`, marker=1, migration25/016 absent. See `.superpowers/sdd/2026-08-31-phase-7b-task-5-reference-security-locking/task-1-red-second-repair-rerun-report.md`.

After authorization, verify exact remote workdir/project/CLI/healthy ports/paused marker, 24 applied migrations with max `20260830000100`, local/remote seed + migrations 23/24 + tests 014/015 hashes, absent remote migration25/016, and closed local 16432/16433.

Sync only 016 and verify its SHA. Run focused 016: expected failure only on the three missing lock-order assertions. Establish tunnels/env, prove remote psql = tunnel DB = anon PostgREST parity, then run only the new integration file. Expected: lock-wait/race assertions fail because current production functions do not acquire the shared reference/authority/source keys; restore/history and already-existing fail-closed behavior may pass. Record exact counts and failure names. Always run exact cleanup and close/remove all temporary state before continuing.

- [x] **Step 7: Implement migration 25 minimally**

> **2026-08-31 local implementation COMPLETE:** `20260831000100_phase_7b_reference_security_locking.sql` is 583 lines / SHA-256 `2e8013ccd041be9de2ed7910a707401ee96e051d132fa47b34bf90011242ce37`. It replaces only the three specified function bodies, keeps owner/signature/security-definer semantics, locks with the exact target classes/order, rechecks after waits, and does not access a database, remote, or production.

Create `supabase/migrations/20260831000100_phase_7b_reference_security_locking.sql`. Copy the current function bodies from migration 23 (`flag_references_for_new_indicator`) and migration 24 (`submit_decide_reference`, `submit_decide_domain_authority`) verbatim, then make only these changes:

```sql
-- indicator trigger loop: select IDs in deterministic order, then lock and re-read version
perform pg_catalog.pg_advisory_xact_lock(
  public.security_target_lock_key_v1('reference', v_reference_id)
);

-- reference decision, after replay lookup and identity resolution
perform pg_catalog.pg_advisory_xact_lock(
  public.security_target_lock_key_v1('source', v_evidence_source_id)
);
perform pg_catalog.pg_advisory_xact_lock(
  public.security_target_lock_key_v1('domain_authority', v_authority_id)
);
perform pg_catalog.pg_advisory_xact_lock(
  public.security_target_lock_key_v1('reference', p_reference_id)
);

-- authority decision, after replay lookup and identity resolution
perform pg_catalog.pg_advisory_xact_lock(
  public.security_target_lock_key_v1('source', v_evidence_source_id)
);
perform pg_catalog.pg_advisory_xact_lock(
  public.security_target_lock_key_v1('domain_authority', p_authority_id)
);
```

Skip the source call when Evidence is null and the authority call when no matching authority exists. Resolve IDs before locks but do not trust their posture/state/version until after locks. Move `reference_evidence_is_usable()` and authority Evidence usability checks after source/aggregate locks. After locks, re-select aggregate version with `FOR UPDATE`, then derive current state and authority state. Preserve exact validation, replay hashing, note persistence, error mapping, receipt, audit/outbox, owner, revoke, and grant text.

The trigger must select matched reference IDs ordered by UUID text, acquire each reference key, re-read its current version after the wait, and only then insert the idempotent flag/outbox event.

- [x] **Step 8: Run local GREEN/static alignment**

> **2026-08-31 local GREEN/static alignment COMPLETE:** `git diff --check`, immutable migration/test/type hashes, and static three-body/lock/order/no-schema checks passed. Under direct Node 22.22.2, database eslint and `tsc --noEmit` exited 0; focused Vitest was **1 passed file / 1 gated skipped file; 29 passed / 5 skipped tests / exit 0**. This is local/static evidence only: disposable SQL compile and behavioral GREEN remain unauthorized.

Run:

```bash
git diff --check
shasum -a 256 supabase/migrations/20260829000100_phase_7b_verified_allowlisted_references.sql \
  supabase/migrations/20260830000100_phase_7b_reference_review_boundary.sql
/Users/xixi/.workbuddy/binaries/node/versions/22.22.2/bin/node ../../node_modules/eslint/bin/eslint.js .
/Users/xixi/.workbuddy/binaries/node/versions/22.22.2/bin/node ../../node_modules/typescript/bin/tsc --noEmit
/Users/xixi/.workbuddy/binaries/node/versions/22.22.2/bin/node ../../node_modules/vitest/vitest.mjs run \
  src/tests/reference-review-repository.test.ts \
  src/tests/reference-security-coupling.integration.test.ts
```

Expected: immutable hashes unchanged; lint/typecheck/unit tests pass; integration remains gated without environment. Review migration25 diff against the copied source functions and account for every changed line. Update all three handover/workbook locations.

- [ ] **Step 9: Obtain explicit disposable GREEN authorization**

Request authorization for: fresh fail-closed preflight; sync migration25 and final 016 only; disposable reset; focused 016; full pgTAP; double typegen/no-drift comparison; temporary tunnels/env/parity; focused Task4+Task5 reference integration; exact remote/local cleanup. Production and ports 54321/54322 remain prohibited.

- [ ] **Step 10: Run disposable migration/pgTAP/typegen GREEN**

After authorization and exact preflight, sync only migration25/016 and verify byte hashes. Reset the disposable stack. Fail closed in this order:

1. reset exit 0; 25 migrations/max `20260831000100`; paused marker count 1;
2. focused 016 PASS;
3. full pgTAP files 001–016 PASS;
4. typegen twice on the same schema, byte-identical to each other;
5. both outputs byte-identical to the committed 158,662-byte `database.types.ts` SHA `e5dc3861…aedef`.

Any failure stops later actions and enters systematic debugging. Do not replace generated types because shape drift is forbidden.

- [ ] **Step 11: Run focused real-race GREEN and exact cleanup**

Create the same two IPv4-only tunnels and 0600 four-variable environment used by Task 4; prove endpoint parity without printing credentials. Run sequentially:

```bash
/Users/xixi/.workbuddy/binaries/node/versions/22.22.2/bin/node ../../node_modules/vitest/vitest.mjs run --no-file-parallelism \
  src/tests/reference-review-repository.integration.test.ts \
  src/tests/reference-security-coupling.integration.test.ts
```

Expected: every Task 4 repository case and every Task 5 race/history/Evidence case passes. Then independently query zero residue for all owned reference/authority/security/command/outbox/project/source/raw/evidence/user IDs, verify marker/migration count, terminate tunnels, and delete local env/typegen plus remote typegen temp. Update all three handover/workbook locations after integration and after cleanup.

- [ ] **Step 12: Run fresh local task gate**

Using Node 22.22.2 direct entry points, run five workspace lint/typecheck/tests/build, placeholder checks, sensitive-field scan, `git diff --check`, closed-port/temp checks, and verify migrations 23/24 hashes plus generated types SHA again. Record exact counts. No success claim may reuse Task 4 output.

- [ ] **Step 13: Review, update the master plan, and commit**

Mark the master Phase 7B Task 5 steps complete, update workbook/HANDOVER with exact RED/GREEN counts, migration/test hashes, typegen no-drift proof, cleanup, review findings, production non-access, and local-vs-production state.

Generate the review package required by subagent-driven-development, dispatch the Task 5 reviewer, and resolve validated Critical/Important findings with new RED→GREEN evidence. Then stage only Task 5 files:

```bash
git add \
  packages/database/package.json \
  packages/database/src/tests/reference-security-coupling.integration.test.ts \
  supabase/migrations/20260831000100_phase_7b_reference_security_locking.sql \
  supabase/tests/016_phase_7b_reference_security_locking.test.sql \
  docs/superpowers/plans/2026-08-29-phase-7b-verified-allowlisted-references.md \
  docs/superpowers/plans/2026-08-31-phase-7b-task-5-reference-security-locking.md \
  docs/tasks/phase-7b-verified-allowlisted-references-workbook.md \
  docs/HANDOVER.md
git commit -m "test(db): prove reference security coupling races"
```

After the implementation commit, record its hash in both HANDOVER copies and the workbook in a docs-only follow-up commit so the worktree finishes clean.
