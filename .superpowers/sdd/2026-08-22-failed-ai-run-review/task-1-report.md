# Task 1 report — strict failed AI run review contracts

## Implementation

- Added strict Zod v4 contracts for failed-run status, review state, decision, reason code, defaulted list query, safe list item, detail/history, decision command, and decision result.
- Added strict nested catalog/input/history projections, UUID and ISO timestamp checks, non-negative/positive version bounds, base64url cursor JSON validation, and trimmed PostgreSQL-safe notes capped at 1000 Unicode code points.
- Added one command `superRefine` for deterministic investigation/dismissal reason compatibility. Raw provider errors, raw model output, source content, and unknown fields are rejected by strict projections.
- Exported schemas and inferred types from `packages/contracts/src/index.ts`.
- Updated the Phase 6B workbook and handover with the task status and RED/GREEN evidence.

## Files

- `packages/contracts/src/review/failed-ai-run.test.ts`
- `packages/contracts/src/review/failed-ai-run.ts`
- `packages/contracts/src/index.ts`
- `docs/tasks/failed-ai-run-review-workbook.md`
- `docs/HANDOVER.md`

## RED

Command:

```bash
PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test -- src/review/failed-ai-run.test.ts
```

Expected failure: requested exports do not exist. Observed: `vitest run -- src/review/failed-ai-run.test.ts` reported 12 tests, 7 failed with `TypeError: Cannot read properties of undefined (reading 'parse')`; the five negative tests were green only because absent exports threw.

## GREEN

```text
focused test command: 6 files passed, 77 tests passed
contracts lint: passed, exit 0
contracts typecheck: passed, exit 0
full contracts test: 6 files passed, 77 tests passed
```

All commands used the bundled runtime PATH from the task brief and `env -u NODE_OPTIONS`.

## Self-review and concerns

- Confirmed strictness on all object projections, unknown-field rejection, no raw error/output fields, malformed IDs/timestamps/cursors, query bounds/defaults, version bounds, note whitespace/length, and every incompatible decision/reason branch.
- `safeFailureCode` is required to equal the bounded `status`, preserving the version-1 projection invariant.
- No full repository `pnpm verify` was run because this task’s acceptance gate is the contracts package gate; downstream database/web tasks are not present in this worktree yet.
- Vitest emits the repository’s existing Node engine warning under bundled Node 24; it does not affect exit status.
