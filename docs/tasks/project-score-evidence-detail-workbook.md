# Project score factors and Evidence citations — development workbook

**Worktree:** `.worktrees/project-score-evidence-detail`
**Branch:** `codex/project-score-evidence-detail`
**Runtime:** Node.js 22.22.2 / pnpm 11.16.0

| Task | Status | Scope | Commit |
| --- | --- | --- | --- |
| 1 | DONE | Strict public projection contracts | Pending |
| 2 | READY | Minimum-privilege database read boundary | — |
| 3 | READY | Strict repository reads | — |
| 4 | READY | Anonymous integration coverage | — |
| 5 | READY | Detail loader and safe presentation | — |
| 6 | READY | Full gate and documentation | — |

## Task 1 — strict public projection contracts

| Phase | Command | Result |
| --- | --- | --- |
| Dependency recovery | `CI=true PATH=/tmp/airdrop-node22-20260824/node-v22.22.2-darwin-arm64/bin:/tmp/airdrop-node22-20260824/command-bin:/usr/bin:/bin env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm install --offline --frozen-lockfile` | Existing locked dependencies were re-linked offline; `Already up to date`, exit 0. |
| RED | `CI=true PATH=/tmp/airdrop-node22-20260824/node-v22.22.2-darwin-arm64/bin:/tmp/airdrop-node22-20260824/command-bin:/usr/bin:/bin env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm --filter @airdrop/contracts test -- project-score-evidence.test.ts` | Exit 1 as expected: 29 new tests failed because `publicProjectScoreFactorRowSchema`, `publicProjectEvidenceCitationRowSchema`, and `scoringAxisSchema` were missing exports (`undefined`); 6 existing files / 78 tests passed. |
| Focused GREEN | Same filtered contracts command | 7 files / 107 tests passed, exit 0. |
| Contract guard | `CI=true PATH=/tmp/airdrop-node22-20260824/node-v22.22.2-darwin-arm64/bin:/tmp/airdrop-node22-20260824/command-bin:/usr/bin:/bin env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm --filter @airdrop/contracts test` | 7 files / 107 tests passed, exit 0. |
| Contract typecheck | `CI=true PATH=/tmp/airdrop-node22-20260824/node-v22.22.2-darwin-arm64/bin:/tmp/airdrop-node22-20260824/command-bin:/usr/bin:/bin env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm --filter @airdrop/contracts typecheck` | Exit 0. |
| Domain guard | `CI=true PATH=/tmp/airdrop-node22-20260824/node-v22.22.2-darwin-arm64/bin:/tmp/airdrop-node22-20260824/command-bin:/usr/bin:/bin env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm --filter @airdrop/domain test` | 9 files / 222 tests passed, exit 0. |
| Domain typecheck | `CI=true PATH=/tmp/airdrop-node22-20260824/node-v22.22.2-darwin-arm64/bin:/tmp/airdrop-node22-20260824/command-bin:/usr/bin:/bin env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm --filter @airdrop/domain typecheck` | Exit 0. |

Task 1 adds shared `ScoringAxis`, `PublicProjectScoreFactorRow`, and
`PublicProjectEvidenceCitationRow` contracts. It changes no application or
database behavior, scoring math, thresholds, recommendations, or score history.
