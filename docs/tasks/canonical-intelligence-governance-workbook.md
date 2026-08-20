# Canonical Intelligence Governance Workbook

| Task | Status | RED | GREEN | Commit |
| --- | --- | --- | --- | --- |
| 1. Add strict governance contracts | COMPLETED | See log | See log | `feat(contracts): add intelligence governance contracts` |
| 2. Add governed promotion boundary | READY | — | — | — |
| 3. Add evidence-gated read models | READY | — | — | — |
| 4. Add deterministic grounding rules | READY | — | — | — |
| 5. Add promotion repository | READY | — | — | — |
| 6. Add reconciliation worker | READY | — | — | — |
| 7. Add reviewer CLI | READY | — | — | — |
| 8. Add governance verification | READY | — | — | — |

## Task 1 execution log

| Phase | Command | Expected result | Actual result |
| --- | --- | --- | --- |
| RED | `env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test -- src/intelligence/governance.test.ts` | Fails because governance exports do not exist | Could not start because the shell lacked the required Node runtime (`env: node: No such file or directory`). |
| RED | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test -- src/intelligence/governance.test.ts` | Fails because governance exports do not exist | Failed as expected: 22 governance assertions failed because all requested exports were `undefined`. |
| GREEN | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test -- src/intelligence/governance.test.ts` | Governance contracts pass | 5 files and 60 tests passed. |
| GREEN | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts lint` | Lint passes | Passed. |
| GREEN | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts typecheck` | Typecheck passes | Passed. |
| GREEN | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/contracts test` | All contracts pass | 5 files and 60 tests passed. |
