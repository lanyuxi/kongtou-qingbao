# Failed AI Run Review — Development Workbook

**Plan:** `docs/superpowers/plans/2026-08-22-failed-ai-run-review.md`  
**Spec:** `docs/superpowers/specs/2026-08-22-failed-ai-run-review-design.md`  
**Status legend:** `READY` · `IN_PROGRESS` · `REVIEW` · `DONE` · `DONE_WITH_CONCERNS` · `BLOCKED`

| Task | Status | Scope | RED evidence | GREEN evidence | Commit |
| --- | --- | --- | --- | --- | --- |
| 1 | DONE | Strict failed-run review contracts | Focused Vitest ran 12 tests; 7 failed as expected because the requested exports were undefined (`TypeError: Cannot read properties of undefined (reading 'parse')`). | Focused Vitest: 6 files / 77 tests passed; contracts lint and typecheck passed. | `feat(contracts): add failed AI run review contracts` |
| 2 | DONE_WITH_CONCERNS | Append-only schema, protected reads, transactional command | Authored `011_failed_ai_run_review.test.sql` before the migration; remote RED execution was denied before test transfer, so no observed database RED is claimed. | Migration and pgTAP suite received static/diff review; remote GREEN, three sensitivity mutations, and full pgTAP were not run because remote test execution permission was denied. | `feat(db): add failed AI run review boundary` |
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
| Topology preflight | Inspect the existing SSH tunnel, remote Supabase project config, database port, and matching database container | Prove the target is the established disposable test topology before any database command | Confirmed the existing local tunnel targets remote database port `64322`; project `airdrop-intelligence-governance-test` and its matching database container were healthy. Production ports were not targeted. |
| RED authoring | Create `supabase/tests/011_failed_ai_run_review.test.sql` before the migration | Catalog and behavior assertions fail because the review objects are absent | Suite was authored first. The execution environment rejected remote test transfer/execution and explicitly prohibited workarounds, so observed RED evidence is unavailable. |
| GREEN implementation | Add only `supabase/migrations/20260822000100_failed_ai_run_review.sql` | Focused pgTAP passes against the disposable database | Implemented the two append-only tables, protected list/detail RPCs, transactional idempotent decision RPC, stable SQLSTATEs, least-privilege grants, and bounded outbox event. Database execution was not permitted. |
| Sensitivity | Remove revoked-role predicate; omit outbox insert; expose `error_detail`, restoring each mutation | Each named assertion turns RED, then focused suite returns GREEN | Not run because database execution was denied. Static review confirmed dedicated assertions exist for all three mutations. |
| Full database gate | `supabase test db` | All pgTAP files pass | Not run because database execution was denied. |
| Non-database verification | `git diff --check`, scope/security scan, root `pnpm verify` | No whitespace/scope/security regression; repository gate exits 0 | Recorded in the Task 2 report with fresh command results. |

Implementation notes: the command derives the reviewer only from `auth.uid()`, re-checks an active reviewer-class grant, serializes reviewer/idempotency-key reuse, locks the reviewable run before version calculation, and appends the decision, receipt, and `intelligence.ai_run.reviewed.v1` outbox row in one transaction. List/detail projections expose only Task 1 contract fields; review tables have RLS with no direct application-role privileges. Task 3 must not begin real database integration until focused and full pgTAP are run on the established disposable topology.
