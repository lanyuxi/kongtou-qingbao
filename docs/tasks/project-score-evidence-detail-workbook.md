# Project score factors and Evidence citations — development workbook

**Worktree:** `.worktrees/project-score-evidence-detail`
**Branch:** `codex/project-score-evidence-detail`
**Runtime:** Node.js 22.22.2 / pnpm 11.16.0

| Task | Status | Scope | Commit |
| --- | --- | --- | --- |
| 1 | DONE | Strict public projection contracts | `28c2fef` |
| 2 | DONE | Minimum-privilege database read boundary | `feat(db): expose safe score evidence detail` |
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

## Task 2 — minimum-privilege database read boundary

| Phase | Command or check | Result |
| --- | --- | --- |
| Test-first source | Create `supabase/tests/012_project_score_evidence_detail.test.sql` while the Task 2 migration is absent | The local pgTAP source contains the required missing-object assertions, exact view columns/options/grants, browser mutation and unsafe-column denials, role matrix, and active/rumored/historical/zero-link/unevidenced/paused/two-Evidence/private fixtures. |
| Disposable preflight | Read-only SSH checks for `/root/airdrop-governance-test`, container `supabase_db_airdrop-intelligence-governance-test`, DB host port `64322`, and the fixed paused marker row | Passed with `marker-ok`; the remote Task 2 test and migration were both confirmed absent. No production endpoint or port was accessed. |
| Remote RED synchronization | Copy only `supabase/tests/012_project_score_evidence_detail.test.sql` to `/root/airdrop-governance-test/supabase/tests/012_project_score_evidence_detail.test.sql` | Blocked before any remote write. Automatic security review rejected external transfer of the private repository file and requires explicit user authorization for this exact payload and destination. No alternative transfer path was attempted. |
| Authorized synchronization | After explicit user authorization, the trusted root context copied only `012`; local and remote SHA-256 | Both copies are `3b071f08daa7f0d749ab1462aaed734b2019218ebbbfc805dc0c70354c1d364a`; migration remained absent. |
| RED | `./cli/node_modules/.bin/supabase test db supabase/tests/012_project_score_evidence_detail.test.sql` in the marker-verified remote workdir | Expected failure: 11/12 reported subtests failed by name for the two missing helpers, two missing views, missing `project_score_id`, missing function configuration/grants, and missing exact view columns; then PostgreSQL stopped at the absent factor-view ACL query. Exit was nonzero and no migration existed. |
| Reset | Trusted user-authorized context ran `./cli/node_modules/.bin/supabase db reset --yes` only in `/root/airdrop-governance-test` after marker and three-file hash verification | Exit 0; all migrations through `20260824000100_project_score_evidence_detail.sql` plus seed applied, and the disposable stack restarted. |
| First GREEN iteration | Focused `012` after reset | Migration compiled and the first 26 assertions passed; the suite then exposed a test-only cross-join alias typo. After that correction, 79/83 passed and four view mutation checks proved denial with PostgreSQL's `cannot delete from view` message rather than the test's `permission denied` pattern. Migration source remained unchanged. |
| Focused GREEN | Final `012` SHA-256 `0a66a679b0a7fb649d75dd3ddfa7309adf102b3569a7f63dbbdb0bbd1e3ad61c`; `supabase test db supabase/tests/012_project_score_evidence_detail.test.sql` | Files=1 / Tests=83 / PASS, exit 0. Active and rumored current factors are visible; only active citations are visible; historical, incomplete, zero-link, paused and unrelated rows are hidden; two Evidence rows remain distinct; exact grants, unsafe-column denials and browser mutation denials pass. |
| Full pgTAP iteration | `./cli/node_modules/.bin/supabase test db` | First run passed 11 files and failed only 006 test 17 because two new policy rows were in the wrong expected lexical order. The migration and all 83 Task 2 assertions stayed green. |
| Full pgTAP GREEN | Final 006 SHA-256 `b7bff1945a659eb49979cbe28e2a2e9dbbc8904915dd2b1d4952e76306dd8fdd`; rerun full `supabase test db` | Files=12 / Tests=1114 / PASS, exit 0. The only older-suite change is the exact new policy catalog plus final `project_score_id` column. |
| Generated types | Marker-verified remote CLI generated twice from only DB 64322; remote `cmp`, import both stdout files, local `cmp`, then replace `packages/database/src/generated/database.types.ts` | Both remote files, both local temporary files, and the committed generated file are byte-identical: SHA-256 `f4fed028fb876e1ec8d5028ab352311281dae531101dfe13d5c7a0c67cc9b166`, 91,425 bytes. The two views, two helpers, and `project_current_state.project_score_id` are present. No connection value was printed. |
| Local database package | Required Node 22.22.2 / pnpm 11.16.0: `pnpm --filter @airdrop/database lint`, `typecheck`, and `test` | Lint/typecheck exit 0; 9 files / 159 tests passed, 7 integration files / 40 tests skipped by the existing environment gate. |
| Full repository gate | Required runtime: `pnpm verify` | The first run hit the existing worker lifecycle test's 1-second timing bound while packages ran concurrently. The same unchanged test passed 8/8 in isolation, the diff contained no worker files, and a fresh full rerun passed: lint/typecheck/build/placeholders exit 0; contracts 107, domain 222, database 159, worker 212, web 127 = 827 non-skipped tests, with 42 existing environment-gated skips. |

### Exact browser grants introduced by Task 2

| Object | Exact grant to `anon`, `authenticated` |
| --- | --- |
| `current_project_score_is_public(uuid)` | `EXECUTE`; owner `postgres`, `PUBLIC` revoked |
| `current_score_citation_path_is_public(uuid, uuid, uuid)` | `EXECUTE`; owner `postgres`, `PUBLIC` revoked |
| `score_factors` | `SELECT (project_score_id, axis, factor_code, contribution, input_value, detail)` |
| `score_signal_links` | `SELECT (project_score_id, signal_id)` |
| `signal_evidence_links` | `SELECT (signal_id, evidence_id)` |
| `evidence` | `SELECT (id, source_id, source_field, quote_text, verified_at)` |
| `project_scores` | `SELECT (id)` |
| `project_current_score_factors` | view `SELECT` only |
| `project_current_score_evidence_citations` | view `SELECT` only |

Recreating `project_current_state` preserves its existing `SELECT` grant to
`anon`, `authenticated`, and `service_role` while appending only
`project_score_id`. Eight exact SELECT policies gate the four base tables; no
browser mutation, Raw Item SELECT, URL, candidate payload, review note, hash,
provider error, audit/outbox, or credential grant was added. The citation view
returns inert plain text without a link and remains a score-level Evidence set,
not a factor-to-Evidence causal mapping. Opportunity, risk, and confidence
remain independent, and Task 2 changes no score calculation semantics.

Task 2 completed from a genuine implementation RED through focused and full
GREEN. Only the marker-verified disposable
`airdrop-intelligence-governance-test` on DB 64322 / API 64321 was reset or
queried. Production and the forbidden default ports 54321/54322 were untouched.
