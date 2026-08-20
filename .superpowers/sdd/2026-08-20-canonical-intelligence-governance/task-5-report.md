# Task 5 implementation report

Status: DONE (fix round 2 verified)

## Scope and commits

- Base: `df5dfdc0bdca51ff4cf15136aef0b8609e03f3c5`
- Prerequisite: `ac83778 fix(db): align promotion command hashing`
- Task commit: `fa5e1f9 feat(database): add promotion service repository`
- Added the server-only Promotion repository, injected function client and postgres adapter, strict result/error boundary, browser denial export, real integration coverage, and package integration entry.
- Removed the legacy typed `ExtractionRepository.promoteCandidate` method and its extraction-test double.
- By controller ruling, pulled forward Task 6 Step 4: the old `promote-candidate.ts` is now a fail-closed compatibility entry with a focused regression test.

## TDD evidence

### Repository unit RED/GREEN

- RED command: bundled-runtime `env -u NODE_OPTIONS pnpm --filter @airdrop/database test -- src/tests/promotion-repository.test.ts`
- RED result: the suite failed at the absent `../promotion/promotion-repository.js` import; the existing 80 database unit tests passed.
- GREEN result: the focused/package unit run passed 102 tests. Coverage includes the literal SHA-256 vector, exact payload keys/order, one transaction boundary, bigint/time input parsing, exact result keys before Zod, all `AI101..AI109` mappings, generic-error concealment, and browser denial.

### Real integration RED/GREEN and hashing prerequisite

- Initial fixture setup errors were corrected before accepting RED (`revoked_at > granted_at`, valid collection enums).
- Meaningful RED: all 6 real repository cases returned `AI106` because the required compact JS bytes hash to `b42169ab608fa7f3087bfa75f1b92f723a73c4d3debe8ad4024e2534fae00ef5`, while the previous PostgreSQL `jsonb::text` bytes were reordered/spaced and hashed to `bae33381fd21a1b03f1fa1b5b985a2836bbac526e2fa8b86e63d53c1f8cc5d5f`.
- Controller ruling: the fixed-order JS `JSON.stringify` bytes are binding. The not-yet-production-applied migration now reconstructs those exact bytes after strict payload validation and hashes them end to end. The adapter never substitutes a second database-specific hash.
- This RED is also the required hash sensitivity: restoring the prior `jsonb::text` hashing makes every real integration command fail `AI106`.
- After a safety-checked isolated reset, focused pgTAP passed 142/142 and full pgTAP passed 929/929. Production remained healthy and untouched.
- Focused real integration GREEN: 6/6 passed through the disposable non-superuser login. It proves direct signal/governance INSERT denial, protected approval, exact replay and conflicting replay, stale version, revoked reviewer, reject, needs-review, two-session concurrency, and complete rollback when outbox insertion is forced to fail.
- Full serialized integration GREEN (controller, isolated DB/API variables): 6 files, 28/28 tests, zero skips.

### Legacy CLI retirement RED/GREEN

- RED: the focused compatibility test observed the old configuration stack trace instead of the stable fail-closed message.
- GREEN: worker tests passed 164 with 2 unrelated environment-gated skips; worker typecheck passed. The retired entry imports no postgres/database code, reads no environment value, retains no actor/list/repository path, writes only `legacy_promotion_cli_disabled_use_review_candidate`, and exits nonzero.

## Verification

- `@airdrop/database` lint: passed.
- `@airdrop/database` typecheck: passed.
- `@airdrop/database` unit run: 102 passed; 28 environment-gated integration tests skipped in this unit-only command.
- Focused Promotion integration: 6/6 passed.
- Full serialized database integration: 28/28 passed, zero skips.
- Affected worker suite/typecheck: 164 passed with 2 unrelated environment skips; typecheck passed.
- Repository `pnpm verify`: passed lint, typecheck, unit tests, builds, and placeholder scan. The local bundled runtime is Node 24.19 and emitted the known Node 22 engine warning.
- `git diff --check`: passed.
- Sensitive-string scan over all Task 5 implementation/test/workbook paths: no credential URL, key block, wallet secret, seed phrase, or mnemonic match.
- Boundary scan: exactly one production `SET LOCAL ROLE promotion_service`; browser denial imports no postgres; retired CLI contains no legacy repository/environment/actor path.

## Self-review

- Canonical command keys use the mandated order and a hand-derived literal hash vector.
- Result rows are rejected on any missing/extra key before contract parsing; PostgreSQL bigint values are range checked before conversion.
- Error branching uses SQLSTATE only. Unexpected error messages, queries, source bodies, and credentials are not propagated.
- The postgres adapter uses one `sql.begin`, one `SET LOCAL ROLE promotion_service`, and one protected function call; no external work occurs inside the transaction.
- Integration fixture creation/cleanup is owner-only. Cleanup uses `session_replication_role=replica` solely for disposable test IDs, and append-only production behavior is not weakened.
- No database URL, generated disposable login value, source body, note, or credential is logged or committed.

## Rulings and cost

1. Fixed-order JS JSON bytes bind command hashing. Cost if wrong: changing canonical bytes later needs a versioned compatibility strategy for existing receipts.
2. Legacy CLI retirement moved forward from Task 6 because removing the typed repository method otherwise leaves a compile failure and unsafe runtime path. Cost if wrong: the legacy `list` command is unavailable one task earlier; Task 6 supplies its governed replacement.

## Concerns

- None blocking. The known Node 24 local warning remains; the plan's final Node 22 gate is handled by Task 8.

## Fix round 1

### Review findings and TDD evidence

- Node export RED: the default `@airdrop/database/promotion-worker` subprocess import failed because `worker-entry.ts` imported `server-only`. The minimal fix removed that import only from the conditional worker entry; the server-client and admin entries retain their server-only guards. GREEN proves the default Node/tsx import exposes `createPromotionRepository`, while the existing browser-condition subprocess still throws the exact denial message and imports no postgres code.
- PostgreSQL-text RED: the contracts test accepted NUL and both lone-surrogate forms in review notes, while six repository cases reached transaction setup with invalid note/idempotency text. GREEN rejects all six before a transaction and preserves permitted controls, BMP Unicode, and valid astral pairs.
- Canonical-byte regression protection now contains seven independent literal JSON/SHA vectors: null, quotes, backslashes, permitted controls, BMP Unicode, astral Unicode, and `Number.MAX_SAFE_INTEGER`. The identical pgTAP vectors use an explicit ordinal on both result sides; no runtime-generated expectation can mask JS/SQL drift.
- Role-boundary integration now creates a randomized `promotion_repo_test_<32 hex>` non-superuser login, grants only SET membership in `promotion_service`, and uses separate transactions for every denial. It proves `42501` for direct signal INSERT, candidate state UPDATE, promotion-event INSERT, and INSERT/UPDATE/DELETE across Evidence, links, decisions, receipts, and outbox, then proves the protected approval succeeds.
- Negative-path assertions now compare complete candidate state plus Evidence, signals, links, decisions, audit, receipt, and outbox counters. Stale, revoked, conflicting replay, and forced rollback remain exactly unchanged; reject/needs-review create no canonical rows; replay and concurrency retain exactly one history/result set.

### Disposable integration safety

- The first marker design deliberately failed the isolated reset with `permission denied to set parameter app.airdrop_disposable_seed_marker`; no migration or production database failed. It was replaced with a database-resident, paused seed project at fixed ID `90000000-0000-4000-8000-000000000019`, with exact slug/name/lifecycle checks and no source or score.
- Every Task 5 owner cleanup/rollback-trigger operation and role create/drop boundary verifies that exact marker before mutation. The guard RED test tampers with the marker inside a transaction and proves cleanup refuses authorization without changing the candidate snapshot, then restores the marker in the same disposable test transaction.
- Owner cleanup continues to use `session_replication_role=replica` only within these guarded disposable tests. Production append-only triggers were not changed.
- The marker's paused lifecycle is explicitly hidden from anonymous `project_current_state`; the service support-view count was updated fixture-only. No view, policy, or production behavior changed.

### Fix-round verification

- Isolated pgTAP after safety-checked reset: affected 003/007/010 passed 285/285; focused 006 passed 81/81; full database suite passed 10 files and 932/932. Production remained untouched.
- Focused Promotion integration through the isolated 16432 tunnel: 1 file, 7/7 passed.
- Full serialized integration with isolated DB/API credentials (controller): 6/6 files, 29/29 tests, zero skips, exit 0. One preceding run had only a legacy source-collection 5000 ms timeout; the exact case passed alone in 1885 ms, and a post-run check showed zero lock waiters, fixture rows, attempts, or test role. The clean full rerun confirmed transient remote/tunnel latency, so no code or timeout was changed.
- Contracts: lint/typecheck passed; 61/61 tests passed. Database: lint/typecheck passed; 117 unit tests passed with 29 environment-gated integration skips. Worker: lint/typecheck passed; 164 tests passed with 2 unrelated environment-gated skips.
- Repository `pnpm verify` passed lint, typecheck, unit tests, builds, and placeholder scan. `git diff --check` and the sensitive-string scan passed. Node 24.19 emitted only the known Node 22 engine warning.

## Fix round 2

### Remaining review finding and TDD evidence

- Review verification confirmed one cross-language boundary mismatch: JavaScript's prior `string.length`/Zod `.max()` limits counted UTF-16 code units, while PostgreSQL `char_length` counts Unicode code points. Valid astral-only values therefore failed at note length 501 and idempotency-key length 101 even though the database contract allowed 1000 and 200 code points.
- RED contracts run: the new exact astral 1000 and former 501 cases failed with Zod `too_big`; 62 other tests passed. BMP 1000/1001 already matched the intended boundary.
- RED database run: exact astral 200 and former 101 idempotency keys failed before transaction with the concealed persistence error; 118 other tests passed with 29 environment-gated integration skips. BMP 200/201 already matched the intended boundary.
- GREEN uses `Array.from(value).length` only after the existing note trim/PostgreSQL-text rules and idempotency representability rules. The conflicting code-unit maximum checks were removed; no database, seed, migration, canonical payload order, or hash logic changed.
- Boundary coverage proves BMP and astral note lengths 1000 accepted/1001 rejected, BMP and astral idempotency-key lengths 200 accepted/201 rejected, and the former astral 501/101 failures accepted. Accepted idempotency text is asserted byte-for-byte at the function-client boundary.

### Fix-round verification

- Contracts full package tests: 64/64 passed; lint and typecheck passed.
- Database unit package tests: 120 passed with 29 environment-gated integration skips; lint and typecheck passed.
- Affected worker tests: 164 passed with 2 unrelated environment-gated skips; lint and typecheck passed.
- Repository `pnpm verify`, `git diff --check`, boundary scan, and sensitive-string scan passed. Node 24.19 emitted only the known Node 22 engine warning.
- Database reset/integration was intentionally not run: this fix changes only pre-transaction TypeScript validation and tests, with no SQL, seed, migration, or adapter behavior change.
