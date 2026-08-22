# Failed AI Run Review — Development Workbook

**Plan:** `docs/superpowers/plans/2026-08-22-failed-ai-run-review.md`  
**Spec:** `docs/superpowers/specs/2026-08-22-failed-ai-run-review-design.md`  
**Status legend:** `READY` · `IN_PROGRESS` · `REVIEW` · `DONE` · `DONE_WITH_CONCERNS` · `BLOCKED`

| Task | Status | Scope | RED evidence | GREEN evidence | Commit |
| --- | --- | --- | --- | --- | --- |
| 1 | DONE | Strict failed-run review contracts | Focused Vitest ran 12 tests; 7 failed as expected because the requested exports were undefined (`TypeError: Cannot read properties of undefined (reading 'parse')`). | Focused Vitest: 6 files / 77 tests passed; contracts lint and typecheck passed. | `feat(contracts): add failed AI run review contracts` |
| 2 | DONE | Append-only schema, protected reads, transactional command | With only 011 synchronized and the migration absent, all 7 initial object assertions failed before the suite terminated on absent tables. | Fix round 1 accepted: focused 011 Files=1 / Tests=87 / PASS; full pgTAP Files=11 / Tests=1031 / PASS; named `errorDetail` sensitivity RED then restored 87 PASS. Local `pnpm verify`: 663 tests, exit 0. | `27c4c4b`, `ede1971`, `de55a54` |
| 3 | DONE | Generated types and bearer-scoped repository | Repository unit suite failed before collection because `../review/failed-ai-run-review-repository.js` did not exist; package baseline remained 134 passed / 34 skipped. | Generated types were byte-identical across two remote generations; repository package tests 154 passed / 37 skipped; focused real integration 3/3 and full repository integration 37/37; lint, typecheck, root verify, and diff checks passed. | `feat(database): add failed AI run review repository` |
| 4 | READY | Authenticated review BFF and routes | — | — | — |
| 5 | READY | Reviewer session and browser API clients | — | — | — |
| 6 | READY | Sign-in, list, detail, history, and decision UI | — | — | — |
| 7 | READY | End-to-end regression and authorization matrix | — | — | — |
| 8 | READY | Runbook, security review, and repository gates | — | — | — |
| 9 | READY | Controlled production rollout checkpoint | — | — | — |

## Execution rules

- Follow `AGENTS.md` and the linked plan.
- Change one task to `IN_PROGRESS` at a time.
- Record the exact expected RED and observed failure before implementation.
- Record the exact GREEN command and result before marking `DONE`.
- Update `docs/HANDOVER.md` after every completed task.
- Preserve unrelated `.DS_Store` files and uncommitted user changes.
- Task 9 may stop at `PRODUCTION_READY — REVIEWER_ACCOUNT_REQUIRED`; guessed reviewer identity is forbidden.

## Task 1 execution log

| Phase | Command | Expected result | Actual result |
| --- | --- | --- | --- |
| RED | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test -- src/review/failed-ai-run.test.ts` | Fails because the failed-run review exports do not exist | `vitest run -- src/review/failed-ai-run.test.ts`: 12 focused tests, 7 failed as expected with `TypeError: Cannot read properties of undefined (reading 'parse')`; 5 negative tests were green only because the exports were absent. |
| GREEN | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test -- src/review/failed-ai-run.test.ts` | Strict contract tests pass | 6 files and 77 tests passed. |
| GREEN | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts lint` | Contracts lint passes | Passed; exit 0. |
| GREEN | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts typecheck` | Contracts typecheck passes | Passed; exit 0. |

Implementation notes: added strict Zod v1 schemas for the bounded failed-run status/review/decision data, validated base64url cursors, safe list/detail projections without raw errors or source content, command reason compatibility, trimmed bounded notes, and decision results. Public exports and inferred types are in `packages/contracts/src/index.ts`.

## Task 2 execution log

| Phase | Command/check | Expected result | Actual result |
| --- | --- | --- | --- |
| Topology preflight | Inspect the existing test Supabase project, API/DB ports, and database container | Prove the target is an established disposable test topology before any database command | Confirmed project `airdrop-intelligence-governance-test`, API port `64321`, DB port `64322`, and a healthy matching container. Production was not accessed. |
| RED | Synchronize only 011 while leaving the Task 2 migration absent | Initial catalog assertions fail because the review objects are absent | All 7 initial object assertions failed, then the suite terminated because the tables were absent. |
| First GREEN compile | Reset the disposable stack with all 20 migrations and run focused 011 | Migration compiles and focused pgTAP passes | PostgreSQL exposed 9 illegal schema-qualified `coalesce` uses; 5 ambiguous pgTAP catalog overloads also misreported present objects, and anonymous correctly received `42501` because it has no EXECUTE grant. Commit `ede1971` fixed SQL/tests without granting anonymous access. |
| Final accepted artifact identity | SHA-256 the migration and focused pgTAP source | Executed artifacts match the committed sources | Migration `5150c830cf2cec7850c179f0fbf7254b6c658287fa96789420c6cb75dbb755ae`; updated test `e9158648ea970d930a1fd9cd240d67d4d6e380b41c00d0c32754563368cda7e1`. |
| Initial focused GREEN | Run the pre-fix 011 against the disposable stack | All focused assertions pass | 80/80 PASS before fix round 1. |
| Sensitivity 1 | Remove all three `revoked_at` predicates, then restore the exact source | Revoked reviewer access assertions fail | Assertions 41–43 failed explicitly; additional failures were collateral state pollution. Original source restored. |
| Sensitivity 2 | Use a compilable false branch to skip outbox insertion, then restore the exact source | Atomic side-effect/outbox assertions fail | Assertions 64, 67–68, and 73–74 failed (5 total). Original source restored. |
| Sensitivity 3 | Add a real `errorDetail` output column, then restore the exact source | A named exact-result-signature assertion rejects the extra field before any later structural mismatch | Mutated migration SHA `1140d556d19821e3a57bb68772811febbc64a83cd8762620be432500bb8e537e`; focused exit 1 with `Failed test 31: failed AI run review command has the exact safe result signature without errorDetail`, followed by the expected later INSERT shape abort. Original migration restored. |
| Restored GREEN | Restore migration SHA, reset, and rerun updated 011 | Focused suite returns GREEN | Migration restored to `5150c830cf2cec7850c179f0fbf7254b6c658287fa96789420c6cb75dbb755ae`; reset exit 0; Files=1 / Tests=87 / PASS. |
| Full database gate | Run the full pgTAP suite with updated 011 | All pgTAP files pass | Files=11 / Tests=1031 / Result: PASS. |
| Repository gate | Run root `pnpm verify` | Repository gate exits 0 | 663 tests passed; exit 0. The Node 24 versus required Node 22 engine warning remains recorded. |

Implementation notes: the command derives the reviewer only from `auth.uid()`, re-checks an active reviewer-class grant, serializes reviewer/idempotency-key reuse, locks the reviewable run before version calculation, and appends the decision, receipt, and `intelligence.ai_run.reviewed.v1` outbox row in one transaction. List/detail projections expose only Task 1 contract fields; review tables have RLS with no direct application-role privileges. Fix round 1 is database-accepted on the disposable stack. The new `ai_runs` append-only trigger requires Task 3/7 to replace existing integration-fixture DELETE cleanup with rollback or disposable-reset cleanup semantics.

## Task 2 fix round 1

| Phase | Evidence |
| --- | --- |
| Review finding root cause | The production migration already enforces active reviewer-class authorization, strict safe projections, `(created_at desc, id desc)` cursor behavior, `p_limit` 1..101, and exact non-negative bigint `expectedReviewVersion`. The findings were missing proof strength in 011, so the migration remains byte-identical at SHA-256 `5150c830cf2cec7850c179f0fbf7254b6c658287fa96789420c6cb75dbb755ae`. |
| Tests first | The ordinary authenticated fixture now has an active `user` grant; equal-created-at failures prove UUID tie-break ordering and cursor continuation; 101 lives and 102 returns AR105; detail `run` has exact allowed keys plus explicit prompt/output/error/model-response/request/response/raw-content exclusions; overflow, negative, and fractional expected versions each return AR105 and write no receipt. |
| Signature sensitivity | A named `pg_proc` assertion fixes the exact `execute_failed_ai_run_review` input/output modes, types, and names. With a real `errorDetail` output column and mutated migration SHA `1140d556d19821e3a57bb68772811febbc64a83cd8762620be432500bb8e537e`, focused pgTAP exited 1 at named Failed test 31 before the later INSERT shape abort. The original migration was restored. |
| Binding scope | Detail/history retain bounded `note` and `reviewerUserId`; reviewer email/display and all note/reviewer identity fields remain excluded from outbox. No dblink/concurrency harness was added; two-independent-connection proof is binding Task 3/7 work. |
| Local verification | Updated 011 SHA-256: `e9158648ea970d930a1fd9cd240d67d4d6e380b41c00d0c32754563368cda7e1`. Static/diff checks pass. Root `pnpm verify` passed 663 tests with exit 0; Node 24 engine warning remains. |
| Database evidence | On `airdrop-intelligence-governance-test` (API 64321 / DB 64322), reset applied all 20 migrations with exit 0; updated focused 011 passed Files=1 / Tests=87; full pgTAP passed Files=11 / Tests=1031. After sensitivity restoration, reset again exited 0 and focused 011 again passed 87 tests. Production was untouched. |

## Task 3 execution log

| Phase | Command/check | Expected result | Actual result |
| --- | --- | --- | --- |
| Generated types | Run `pnpm db:types` twice against only the preflighted disposable stack and compare SHA-256 | Both generated files are byte-identical; no manual edit | Both runs produced `058c11dac49a44065f7bb9b509c0ac000df67b38f6ab4a925b29676ed479078d`; `cmp` succeeded; local synchronized file has the same hash and size 82687 bytes. |
| RED | `pnpm --filter @airdrop/database test -- src/tests/failed-ai-run-review-repository.test.ts` before adding the repository | Fails because the repository module/export is absent | Failed before collecting the 20 new tests with `Cannot find module '../review/failed-ai-run-review-repository.js'`; existing package baseline was 134 passed / 34 skipped. |
| Unit GREEN | Run the same package test, then database lint and typecheck | Strict parsing, cursor, bearer forwarding, exact command/replay, error sanitization, and browser denial pass | Package tests 154 passed / 37 skipped; lint and typecheck exit 0. |
| Focused real integration | Run only `failed-ai-run-review-repository.integration.test.ts` with disposable database/API tunnels | Real Auth reviewer succeeds, active ordinary user is denied, and both two-client races have exact side effects | 1 file / 3 tests passed. Same reviewer + same key produced one decision/receipt/outbox and one exact replay; different keys at the same expected version produced one success and one `review_version_conflict`, also with one decision/receipt/outbox. |
| Full repository integration | Freshly preflight/reset only `airdrop-intelligence-governance-test`, then run package `test:integration` | Existing repositories and new review repository remain green | 7 files / 37 tests passed, exit 0, duration 82.74s. Exact fixture cleanup ran only after verifying the disposable marker; the production `ai_runs` append-only trigger was not changed. |
| Root gate | `pnpm verify` and `git diff --check` under Node 22.22.2 / pnpm 11.16.0 | Entire repository and patch hygiene pass on the required runtime | 683 tests passed; lint, typecheck, build, placeholders, and diff check exit 0. Lockfile SHA-256 remained `fb999bf94d561a0e541238790817a834ef17f326ce2a2f22c8f42c0e5d74d9f2`. |

Implementation notes: `@airdrop/database/failed-ai-run-review` is server-only and creates a fresh non-persisting Supabase client for each RPC with only that request's bearer token. Task 1 schemas strictly parse every list/detail/decision result; the extra pagination row is discarded after deriving a cursor from the final returned item. Stable SQLSTATEs map to bounded repository error codes, while unexpected query/persistence details are concealed. Tokens and credentials are not logged, stored in errors, or retained on a singleton.
