# Canonical Intelligence Governance Workbook

| Task | Status | RED | GREEN | Commit |
| --- | --- | --- | --- | --- |
| 1. Add strict governance contracts | COMPLETED | See log | See log | `feat(contracts): add intelligence governance contracts` |
| 2. Add governed promotion boundary | COMPLETED WITH BASELINE CONCERNS | See log | See log | `feat(db): add governed promotion boundary` |
| 3. Add evidence-gated read models | READY | — | — | — |
| 4. Add deterministic grounding rules | COMPLETED | See log | See log | `feat(domain): add deterministic evidence grounding` |
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

## Task 2 execution log

| Phase | Command | Expected result | Actual result |
| --- | --- | --- | --- |
| RED | `env -u NODE_OPTIONS pnpm --filter @airdrop/domain test -- src/intelligence/evidence-grounding.test.ts` | Fails because the grounding module is absent | Could not start because the shell lacked the required Node runtime (`env: node: No such file or directory`). |
| RED | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/domain test -- src/intelligence/evidence-grounding.test.ts` | Fails because the grounding module is absent | Failed as expected: the target suite could not import the absent module; 8 existing files and 210 tests passed. |
| GREEN | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/domain test -- src/intelligence/evidence-grounding.test.ts` | Grounding tests pass | 9 files and 221 tests passed. |
| GREEN | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/domain lint` | Lint passes | Passed. |
| GREEN | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/domain typecheck` | Typecheck passes | Passed. |
| GREEN | `PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/usr/bin:/bin env -u NODE_OPTIONS pnpm --filter @airdrop/domain test` | All domain tests pass | 9 files and 221 tests passed. |

## Governed Promotion database boundary execution log

| Phase | Command | Expected result | Actual result |
| --- | --- | --- | --- |
| RED safety | Remote project/port/container check, then isolated `supabase db reset --yes` and `supabase test db` | Only `airdrop-intelligence-governance-test` on database port `64322` is reset; governance objects are absent | Safety check showed the exact test project and healthy `64322` container; production `54322` remained untouched. File 010 failed 18/19 and aborted on absent `public.evidence`, as expected. The full run had 801 tests and the pre-existing 003/004/006/008 baseline failures. |
| Migration iteration | Isolated `supabase db reset --yes` | New forward migration applies | First application exposed invalid schema qualification of SQL `coalesce`; the one-token correction was synced. The second reset applied all migrations and seed successfully. |
| GREEN | `supabase test db supabase/tests/010_canonical_intelligence_governance.test.sql` from the isolated test workdir | Task 3 governance pgTAP passes | 1 file, 100 tests, 100 passed. |
| Full database gate | Isolated `supabase test db` | All Task 3 assertions pass and unrelated baseline remains separately visible | File 010 passed. Full run: 10 files, 882 tests; only the unchanged pre-existing failures remained in 003 (4), 004 (5), 006 (12), and 008 (1), so the aggregate command exited nonzero. |
| Sensitivity: AI signal INSERT | Temporarily restore the AI-stage signal INSERT grant/policy, isolated reset, focused file 010 | Governance test turns RED | Failed 1/97 at test 27. Exact bytes restored; migration SHA-256 returned to `0a1abc12ea3057ad579ad7133445aaf7aaefc08088c052a9431803152030e060`; focused GREEN returned 97/97. |
| Sensitivity: missing outbox | Temporarily bypass both live-review outbox branches, isolated reset, focused file 010 | Governance test turns RED | Failed 2/97 at tests 77–78: outbox count was zero and payload was null. Exact bytes/SHA restored; focused GREEN returned 97/97. |
| Sensitivity: revoked reviewer | Temporarily remove the live-review `revoked_at is null` predicate, isolated reset, focused file 010 | Governance test turns RED | Failed 1/97 at test 83 because the revoked reviewer raised no `AI105`. Exact bytes/SHA restored; final focused GREEN passed 100/100 after exact catalog assertions were added. |
| Repository verification | Bundled-runtime `env -u NODE_OPTIONS pnpm verify` | Lint, typecheck, unit tests, build, and placeholders pass | All workspace lint passed. Typecheck then stopped in the pre-existing Task 2 file `packages/domain/src/intelligence/evidence-grounding.ts:1` because its `@ts-expect-error` is unused when compiled through `apps/worker`; no Task 3 file caused the failure. |

The aggregate database gate remains nonzero only because the controller-confirmed baseline topology contains stale failures in files 003, 004, 006, and 008. Those files were not modified by this task.
