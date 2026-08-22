# Failed AI Run Review — Development Workbook

**Plan:** `docs/superpowers/plans/2026-08-22-failed-ai-run-review.md`  
**Spec:** `docs/superpowers/specs/2026-08-22-failed-ai-run-review-design.md`  
**Status legend:** `READY` · `IN_PROGRESS` · `REVIEW` · `DONE` · `BLOCKED`

| Task | Status | Scope | RED evidence | GREEN evidence | Commit |
| --- | --- | --- | --- | --- | --- |
| 1 | DONE | Strict failed-run review contracts | Focused Vitest ran 12 tests; 7 failed as expected because the requested exports were undefined (`TypeError: Cannot read properties of undefined (reading 'parse')`). | Focused Vitest: 6 files / 77 tests passed; contracts lint and typecheck passed. | `feat(contracts): add failed AI run review contracts` |
| 2 | READY | Append-only schema, protected reads, transactional command | — | — | — |
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
