# Failed AI Run Review — Development Workbook

**Plan:** `docs/superpowers/plans/2026-08-22-failed-ai-run-review.md`  
**Spec:** `docs/superpowers/specs/2026-08-22-failed-ai-run-review-design.md`  
**Status legend:** `READY` · `IN_PROGRESS` · `REVIEW` · `DONE` · `DONE_WITH_CONCERNS` · `BLOCKED`

| Task | Status | Scope | RED evidence | GREEN evidence | Commit |
| --- | --- | --- | --- | --- | --- |
| 1 | DONE | Strict failed-run review contracts | Focused Vitest ran 12 tests; 7 failed as expected because the requested exports were undefined (`TypeError: Cannot read properties of undefined (reading 'parse')`). | Focused Vitest: 6 files / 77 tests passed; contracts lint and typecheck passed. | `feat(contracts): add failed AI run review contracts` |
| 2 | DONE | Append-only schema, protected reads, transactional command | With only 011 synchronized and the migration absent, all 7 initial object assertions failed before the suite terminated on absent tables. | Focused 011: 80/80 PASS after all mutations were restored; full pgTAP: 11 files / 1024 tests PASS; root `pnpm verify`: 663 tests, exit 0. | `27c4c4b`, `ede1971` |
| 3 | READY | Generated types and bearer-scoped repository | — | — | — |
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
| Final artifact identity | SHA-256 the migration and focused pgTAP source | Executed artifacts match the committed sources | Migration `5150c830cf2cec7850c179f0fbf7254b6c658287fa96789420c6cb75dbb755ae`; test `fa0b227f9acbede8db1dce6c05684920f9ea4b4c58e21e30b09bc0b081a55e27`. |
| Focused GREEN | Run 011 against the disposable stack | All focused assertions pass | 80/80 PASS. |
| Sensitivity 1 | Remove all three `revoked_at` predicates, then restore the exact source | Revoked reviewer access assertions fail | Assertions 41–43 failed explicitly; additional failures were collateral state pollution. Original source restored. |
| Sensitivity 2 | Use a compilable false branch to skip outbox insertion, then restore the exact source | Atomic side-effect/outbox assertions fail | Assertions 64, 67–68, and 73–74 failed (5 total). Original source restored. |
| Sensitivity 3 | Add a real `errorDetail` output column, then restore the exact source | Exact safe projection test rejects the extra field | Focused execution exited 1 on INSERT column-count mismatch, proving the exact projection is sensitive. Original source restored. |
| Restored GREEN | Re-run 011 after restoring both recorded SHA-256 artifacts | Focused suite returns GREEN | 80/80 PASS. |
| Full database gate | Run the full pgTAP suite | All pgTAP files pass | 11 files / 1024 tests / PASS. |
| Repository gate | Run root `pnpm verify` | Repository gate exits 0 | 663 tests passed; exit 0. The Node 24 versus required Node 22 engine warning remains recorded. |

Implementation notes: the command derives the reviewer only from `auth.uid()`, re-checks an active reviewer-class grant, serializes reviewer/idempotency-key reuse, locks the reviewable run before version calculation, and appends the decision, receipt, and `intelligence.ai_run.reviewed.v1` outbox row in one transaction. List/detail projections expose only Task 1 contract fields; review tables have RLS with no direct application-role privileges. Task 2 is database-accepted. The new `ai_runs` append-only trigger requires Task 3/7 to replace existing integration-fixture DELETE cleanup with rollback or disposable-reset cleanup semantics.
