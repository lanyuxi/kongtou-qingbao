# Canonical Intelligence Governance Workbook

| Task | Status | RED | GREEN | Commit |
| --- | --- | --- | --- | --- |
| 1. Add strict governance contracts | COMPLETED | See log | See log | `feat(contracts): add intelligence governance contracts` |
| 2. Add deterministic Evidence grounding rules | COMPLETED | See log | See log | `feat(domain): add deterministic evidence grounding` |
| 3. Add governance schema and protected Promotion command | COMPLETED — FIX ROUND 2 | See log | See log | `feat(db): add governed promotion boundary`; `fix(db): harden governed promotion boundary`; `test(db): align pgTAP with current schema` |
| 4. Gate public reads and scoring inputs on Evidence | COMPLETED | See log | See log | `feat(db): gate public intelligence on evidence` |
| 5. Add the server-only Promotion repository | READY | — | — | — |
| 6. Replace the legacy Promotion CLI with governed review commands | READY | — | — | — |
| 7. Reconcile historical Evidence and update fixtures | READY | — | — | — |
| 8. Regenerate types, document operations, and run final gates | READY | — | — | — |

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

Cross-workspace typing regression: added `@types/node` as a domain devDependency and `types: ["node"]` to its tsconfig, removing the context-dependent suppression around `node:crypto`; domain and worker typechecks plus `pnpm verify` pass.

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
| Fix round 1 RED | Focused file 010 against the original Task 3 migration | Candidate-stage INSERT ACL, lock ordering, and forged-state tests fail before implementation | 120 assertions ran; only tests 31, 74, 75, and 82 failed as expected. The expanded malformed-input and reconciliation matrix already passed. |
| Fix round 1 GREEN | Revised migration plus focused file 010 after isolated reset | Exact seven-column candidate INSERT, protected pending state, serialized receipt lookup, and expanded matrices pass | 1 file, 120 tests, 120 passed. |
| Fix round 1 concurrency | Two simultaneous PostgreSQL sessions per idempotency case | Exact duplicates replay stable IDs; changed input returns `AI104` after waiting for the first transaction | Exact duplicate returned the same command and decision IDs with `replayed=true`; changed input returned `AI104`; each key had one receipt and the alternate candidate remained `pending`, version 1. |
| Fix round 1 sensitivity: candidate INSERT | Temporarily restore broad candidate INSERT and permissive INSERT RLS, isolated reset, focused file 010 | Direct-write guards turn RED | Failed 2/120 at tests 31 and 82. Exact clean migration SHA-256 `48a50405af02478ff0d31bfcd1ec3777360baa6110bf8221414521aabd732569` restored; final focused GREEN passed 120/120. |
| Fix round 1 full database gate | Isolated `supabase test db` | Task 3 stays GREEN; unchanged baseline failures remain separate | File 010 passed. Full run: 10 files, 902 tests; only unchanged files 003 (4), 004 (5), 006 (12), and 008 (1) failed. |
| Fix round 2 RED | Full isolated `supabase test db` before test repair | Later committed migrations expose stale exact matrices and permission-exception expectations | 003 failed 4/135, 004 failed 5/88, 006 failed 12/78, and 008 failed 1/45; all other files passed, including 010 at 120/120. |
| Fix round 2 focused GREEN | `supabase test db` with files 003, 004, 006, and 008 | Updated exact contracts and runtime RLS assertions pass | 4 files, 346 tests, 346 passed. |
| Fix round 2 full database GREEN | Isolated non-destructive `supabase test db` | Every pgTAP file passes against the current migration contract | 10 files, 902 tests, 902 passed. |
| Repository verification | Bundled-runtime `env -u NODE_OPTIONS pnpm verify` | Lint, typecheck, unit tests, build, and placeholders pass | All workspace lint passed. Typecheck then stopped in the pre-existing Task 2 file `packages/domain/src/intelligence/evidence-grounding.ts:1` because its `@ts-expect-error` is unused when compiled through `apps/worker`; no Task 3 file caused the failure. |

Fix round 2 reconciled the stale pgTAP expectations with the later committed migration contract without changing database behavior. The complete database gate is now GREEN.

## Evidence-gated public reads and scoring execution log

| Phase | Command | Expected result | Actual result |
| --- | --- | --- | --- |
| RED | Isolated focused pgTAP file 010 before the Task 4 migration | Missing helpers and public/read-model gates fail | 130 assertions ran; 8 failed at helper existence/config/grants and the three Evidence visibility assertions. |
| RED | Focused `scoring-repository.integration.test.ts` through the isolated 16432 tunnel | Unevidenced signal remains in scoring input before repository gating | Failed 1/1; the returned project included both evidenced and unevidenced signals. |
| Focused GREEN | Isolated `supabase test db supabase/tests/010_canonical_intelligence_governance.test.sql` | Evidence helper, RLS, read-model, and history assertions pass | 130/130 passed. |
| Baseline reconciliation RED | Full isolated `supabase test db` immediately after the new migration | Legacy positive fixtures reveal missing Evidence/score links | 004 failed 4/88, 006 failed 5/78, and 007 failed 1/5; every other file passed. The affected fixtures were repaired without changing production behavior and explicit unevidenced/zero-link negatives were retained. |
| Full database GREEN | Full isolated `supabase test db` after fixture repair and again after sensitivity restoration | Every pgTAP file passes | 10 files, 915 tests, 915 passed. |
| Repository GREEN | Full serialized `@airdrop/database test:integration` with isolated DB/API variables | All repository integrations run with zero skip | 5 files, 22 tests, 22 passed. File serialization prevents shared-database reconciliation races; scoring fixtures use the unique 840 namespace. |
| Sensitivity: scoring project scan | Temporarily remove the project-scan Evidence predicate and run focused scoring integration | Unevidenced-only project turns the suite RED | Failed 1/1 because the 840...011 project entered the scoring input list; predicate restored. |
| Sensitivity: scoring signal rows | Temporarily remove the signal-row Evidence predicate and run focused scoring integration | Unevidenced signal turns the suite RED | Failed 1/1 because the mixed fixture returned the 840...081 signal; predicate restored. |
| Sensitivity: database helper | Temporarily redefine the isolated `signal_has_valid_evidence` helper as constant true and run focused file 010 | Public/read-model assertions turn RED | Failed 3/130 at anon signal visibility, incomplete-score selection, and invalid opportunity visibility; isolated database reset restored the migration. |
| Package checks | Database lint, typecheck, unit tests, and repository-wide `pnpm verify` | Static checks, unit tests, builds, and placeholder scan pass | Database lint/typecheck passed; database unit run passed 80 with 22 environment-gated skips; repository `pnpm verify` passed. Local runtime was Node 24.19 and emitted the known Node 22 engine warning. |

The append-only ruling is enforced by separate linked and never-linked fixtures. No Evidence or score link is removed or mutated to simulate revocation; Phase 6A has no revocation data model, so post-link revocation remains outside this task.
