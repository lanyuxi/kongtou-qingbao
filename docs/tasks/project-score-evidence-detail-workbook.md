# Project score factors and Evidence citations — development workbook

**Worktree:** `.worktrees/project-score-evidence-detail`
**Branch:** `codex/project-score-evidence-detail`
**Runtime:** Node.js 22.22.2 / pnpm 11.16.0

| Task | Status | Scope | Commit |
| --- | --- | --- | --- |
| 1 | DONE | Strict public projection contracts | `28c2fef` |
| 2 | DONE | Minimum-privilege database read boundary | `e106c8a` |
| 3 | DONE | Strict repository reads | `1a5e26e` |
| 4 | DONE | Anonymous integration coverage | `97d5f46` |
| 5 | DONE | Detail loader and safe presentation | `ab73551` |
| 6 | DONE | Full gate and documentation | This commit (`docs: close project score evidence detail`) |

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

## Task 3 — strict repository reads

| Phase | Command or check | Result |
| --- | --- | --- |
| Preflight | Linked-worktree/base/status inspection plus Task 3 brief/design review | Confirmed `.worktrees/project-score-evidence-detail` on `codex/project-score-evidence-detail` at exact base `e106c8afed5d878693b429b45a424ea078932bdd`. The pre-existing uncommitted `docs/HANDOVER.md` Task 2 independent-review record was preserved. |
| Repository baseline | Required Node 22.22.2 / pnpm 11.16.0: `pnpm --filter @airdrop/database test -- project-repository.test.ts` | Exit 0 before Task 3 test or implementation changes: 9 files / 159 tests passed; 7 integration files / 40 tests skipped by the existing environment gate. |
| RED 1 | Required runtime: `pnpm --filter @airdrop/database test -- project-score-evidence.test.ts` after adding only Task 3 tests | Exit 1 as expected. The new suite failed collection with the named missing helper `../repositories/project-score-evidence.js`; the existing project lookup test independently failed because `latestScore.id` was absent (expected `20000000-0000-4000-8000-000000000002`). The remaining 158 existing tests passed; 40 integration tests remained environment-gated. |
| RED 2 | Same required test command after adding only the focused helper implementation, before repository delegation | Exit 1 as expected: all 14 new tests failed by the named missing repository APIs (`listCurrentScoreFactors is not a function` / `listCurrentScoreEvidenceCitations is not a function`), and the project lookup test still failed on missing `latestScore.id`. The remaining 158 tests passed; 40 integration tests remained environment-gated. |
| Focused GREEN | Required runtime: `pnpm --filter @airdrop/database test -- project-score-evidence.test.ts project-repository.test.ts` | Exit 0: 10 files / 173 tests passed; 7 integration files / 40 tests skipped by the existing environment gate. Both new reads, strict parsing, deterministic sorting, exact safe selections, dual immutable filters, safe error wrapping, and `latestScore.id` mapping are green. |
| Database lint | Required runtime: `pnpm --filter @airdrop/database lint` | Exit 0. |
| Database typecheck | Required runtime: `pnpm --filter @airdrop/database typecheck` | Exit 0. |
| Static safety review | Forbidden-field `rg` over the production helper plus exact projection/filter inspection and `git diff --check` | Forbidden terms (`url`, raw body/item, candidate, review, hash, provider, audit, outbox, credential/password/secret) had zero matches (`rg` exit 1 as expected); only the exact 7-column factor and 15-column citation projections are selected; both reads apply `project_id` then `project_score_id`; `git diff --check` exit 0. |
| Full repository gate | Required runtime: `pnpm verify` | Exit 0: lint, typecheck, build, and placeholders passed; contracts 107 + domain 222 + database 173 + worker 212 + web 127 = 841 non-skipped tests passed, with 42 existing environment-gated skips. |
| Final-gate timing investigation | A second documentation-final `pnpm verify`, `git diff --name-only`, then `pnpm --filter @airdrop/worker exec vitest run src/tests/health.test.ts` | The second full run reached tests with contracts/domain/database green, then the unchanged worker repeated-SIGTERM case exceeded its existing 1-second `stopping` bound; exit 1. No worker file is in the diff. Immediate focused reproduction passed 1 file / 8 tests, exit 0, confirming the same load-sensitive timing behavior already recorded in Task 2; no unrelated fix was made. A fresh full rerun is required before commit. |
| Final fresh full rerun | Required runtime: `pnpm verify`, after the focused worker reproduction and with no worker change | Exit 0: lint/typecheck/build/placeholders green; contracts 107 + domain 222 + database 173 + worker 212 + web 127 = 841 non-skipped tests passed, with 42 existing environment-gated skips. This is the final full-suite evidence for the Task 3 commit. |

Task 3 adds no score calculation, recommendation, RLS, migration, generated-type,
dependency, production, or remote-environment change. Both public reads are bound
to one project and one immutable current score ID, expose only the dedicated safe
view projections, reject any non-contract row before mapping, and return inert
Evidence citation metadata without URL or governance payloads.

### Task 3 independent-review fix loop

| Phase | Command or check | Result |
| --- | --- | --- |
| Review finding | Independent review of `1a5e26e` | One Important test-sensitivity gap: the project lookup fake did not record relation calls or selected columns, so removing `project_score_id` from the current-state projection or adding a second latest-score lookup could escape the regression suite. Production behavior was confirmed correct. |
| Test hardening | Add one exact current-state snapshot-query assertion and make the fake reject any relation other than one `project_current_state` call | Test-only scope. The literal projection contains `project_score_id` and every displayed score field; the fake records relation calls/selections and throws on any second lookup. Disposable sensitivity mutations are required before GREEN. |
| Projection sensitivity RED | Temporarily remove `project_score_id` only from the production current-state selection, then run `pnpm --filter @airdrop/database exec vitest run src/tests/project-repository.test.ts` | Exit 1 as required: named immutable-score snapshot-query test failed with an exact diff showing expected `project_id,project_score_id,...` versus received `project_id,...`; 13 other tests passed. The disposable mutation was immediately restored and is not part of the fix diff. |
| Single-query sensitivity RED | Temporarily add a second `client.from('project_current_state')`, then run only the named invariant test with Vitest `-t` | Exit 1 as required: the named test failed with `Project lookup must query project_current_state exactly once.`; 1 failed / 13 skipped. The disposable mutation was immediately restored and is not part of the fix diff. |
| Focused GREEN | First require zero diff from HEAD for both production repository files; then run `pnpm --filter @airdrop/database exec vitest run src/tests/project-repository.test.ts src/tests/project-score-evidence.test.ts` | Production diff check exit 0; 2 files / 28 tests passed, exit 0. Only the test fake/assertion and documentation remain changed. |
| Package gates | Required runtime: `pnpm --filter @airdrop/database lint` and `pnpm --filter @airdrop/database typecheck` | Both commands exit 0. |
| Full repository gate | Required runtime: fresh `pnpm verify` | Exit 0: lint/typecheck/build/placeholders green; contracts 107 + domain 222 + database 174 + worker 212 + web 127 = 842 non-skipped tests passed, with 42 existing environment-gated skips. |

The review fix changes no production code. It closes both sensitivity gaps with
one named invariant test and a strict fake, while preserving the original Task 3
repository behavior and scope.

## Task 4 — anonymous integration coverage

| Phase | Command or check | Result |
| --- | --- | --- |
| Preflight and baseline | Confirm linked worktree/HEAD, preserve controller-owned HANDOVER changes, inspect Task 4 brief, and run required-runtime `pnpm --filter @airdrop/database test -- project-score-evidence.test.ts` | Worktree is `.worktrees/project-score-evidence-detail` on `codex/project-score-evidence-detail`, HEAD `23c30d7ea3f1645bef5844fe1729b9b8f42941e5`; only the controller's `docs/HANDOVER.md` review record was initially modified. Baseline passed 174 tests with 40 environment-gated skips, exit 0. Task 3 Commit was already the exact `1a5e26e`, so no stale `Pending` value remained to change. |
| Disposable topology guard | Read-only SSH inspection of only `/root/airdrop-governance-test`; verify exact project ID, DB/Kong container names, DB/API host ports, and fixed paused marker; inspect existing local tunnel command; validate local integration URL shapes and re-query the marker through the tunnel | Passed: project `airdrop-intelligence-governance-test`; container `supabase_db_airdrop-intelligence-governance-test`; DB 64322 / API 64321; marker exact. Existing `16432` listener is exactly `16432 -> 64322`; a new exact `16433 -> 64321` listener was started. Disposable env file is mode 0600 and its URLs validated as loopback `16432/16433` without printing values; local marker query passed. Production project/container and forbidden 54321/54322 were not accessed. |
| Test-first fixture and initial run | Replace fixed repository fixture identities with randomized test-owned UUIDs; add active current/historical scores, one factor per axis, rumored current factor, two distinct active Evidence rows, score/signal/Evidence links, exact safe-key assertions, and URL plus fixed-marker guards; run full `test:integration` | The production contract already exists from Tasks 2–3, so the first real run was legitimately GREEN rather than an absent-feature RED: 7 files / 44 tests passed, exit 0, 105.36s. Per the sensitivity ledger, this is not recorded as RED; the required temporary score-ID-filter mutation follows. |
| Score-ID filter sensitivity RED | First require zero production-helper diff, temporarily remove only the factor query's `.eq('project_score_id', projectScoreId)`, then run only the named historical-snapshot integration assertion | Exit 1 as required: `denies factors and citations for an active historical score ID` received the three active current factors instead of `[]`; 1 failed / 6 skipped. The mutation was immediately restored with `apply_patch`, and the production helper again has zero diff from HEAD. |
| Restored focused GREEN | Run the complete project PostgREST integration file, then the brief's `pnpm --filter @airdrop/database test -- project-score-evidence.test.ts` | Real focused integration passed 1 file / 7 tests in 4.83s, exit 0. Unit/package-focused command passed 174 tests with 44 integration skips, exit 0. |
| Package static gates | Required runtime `pnpm --filter @airdrop/database lint` and `typecheck` | Both exit 0. No dependency or production repository change remains. |
| Full integration investigation | Fresh full `test:integration` before cleanup | Exit 1 with 38/44 passing. One Task 4 failure proved the randomized equal-score IDs invalidated the old fixed-order expectation. Five unrelated queue failures showed reconciliation creating 7 schedules/jobs because prior Task 4 focused runs intentionally retained randomized active-official rows; the queue fixture cleans only its own fixed project. No production defect or queue-code change was indicated. |
| Random tie-order correction | Keep both active fixtures at score 90 and derive the expected pair by the documented `project_id asc` tie-breaker; rerun the complete project integration file | Focused project integration returned GREEN: 1 file / 7 tests, exit 0, 7.05s. This preserves cursor tie coverage while supporting randomized test-owned IDs. The required fresh reset now precedes the next full integration run. |
| Pre-full fresh reset | In one fail-closed remote command verify exact workdir/project ID/container names/64322/64321/fixed marker, 21 migrations, seed SHA `f1ceaddc...7e55`, and Task 2 migration SHA `8c0a2e3...ea60`; then reset only the disposable stack and recheck marker | Preflight and reset both exit 0; 21 migrations and seed reapplied, containers restarted, fixed marker exact. This removed accumulated project fixtures before the final full suite. |
| Final full integration GREEN | Fresh-reset required-runtime `pnpm --filter @airdrop/database test:integration` | 7 files / 44 tests passed, exit 0, 104.45s. This is the final full integration evidence. |
| Final append-only cleanup | Repeat the same fail-closed disposable-only preflight and fresh reset after the GREEN run; additionally require zero `project_scores.model_version = 'repository-test'` rows | Exit 0; fixed marker remains exact and repository-test score count is 0. No fixture history was deleted individually. Production and forbidden ports were untouched. |
| Full repository gate | Required-runtime fresh `pnpm verify` after final source/test/documentation changes | Exit 0: lint/typecheck/build/placeholders green; contracts 107 + domain 222 + database 174 + worker 212 + web 127 = 842 non-skipped tests passed, with 46 environment-gated skips. |

Task 4 changes only anonymous repository integration fixtures/assertions and
execution documentation. It adds no production code, dependency, migration,
generated-type, score math, recommendation, or browser grant. The only
production mutation was the required disposable score-ID-filter sensitivity
check; it was fully restored before GREEN and is absent from the commit.

### Task 4 independent-review fix loop

| Phase | Command or check | Result |
| --- | --- | --- |
| Review RED | Independent review of `97d5f46` plus the recorded dirty-state full integration | 1 Important + 1 Minor. The Task 4 `afterAll` closed its connection without disabling its random active/official/verified `project_sources`; durable queue reconciliation then found 7 eligible rows and five named queue tests failed. This is the fixture-isolation RED. |
| Minimal isolation fix | In `afterAll`, recheck the fixed disposable marker inside a transaction, then delete only the three `project_sources` matching the Task 4 random source ID and random project IDs | Test-only mutable-relation cleanup. It cannot match non-test relations and does not delete append-only Evidence, signal/Evidence links, score links, factors, or score history. Connection close remains in `finally`. |
| Ordered GREEN without reset | Run focused project integration, then immediately durable-queue integration | No intermediate reset. Project passed 7/7 and durable queue passed 9/9; the prior cross-test eligible-row pollution did not recur. |
| Full timing investigation | Run full integration in the same state, then focus the sole failure | First run was 43/44: only an unchanged promotion test exceeded its 5-second timeout; project/queue passed. Immediate named promotion replay passed 1/1 (11 skipped), so no unrelated change was made. |
| Repeated full GREEN without reset | Fresh full integration rerun, immediately followed by a second full integration run | No reset between runs. Both passed 7 files / 44 tests: 105.43s, then 106.62s. The suite is order- and repeat-independent from Task 4 collection eligibility. |
| Package gates | Required runtime unit command, database lint, and database typecheck | Unit 174 passed / 44 environment-gated skipped; lint and typecheck both exit 0. |
| Final append-only cleanup | One fail-closed SSH command verifies exact disposable workdir/project/containers/64322/64321/marker, 21 files, and both artifact SHAs before reset; recheck marker and repository-test score count afterward | Exit 0. Only `airdrop-intelligence-governance-test` was reset; marker exact and repository-test score count 0. Production and 54321/54322 were untouched. |
| Final repository gate | Fresh required-runtime `pnpm verify`, followed by tracked/production diff checks | Exit 0: lint/typecheck/build/placeholders green; contracts 107 + domain 222 + database 174 + worker 212 + web 127 = 842 non-skipped tests, 46 skips. Production repositories, migrations, and generated types have zero diff; tracked fix scope is one integration test plus workbook/HANDOVER. |

## Task 5 — detail loader and safe presentation

| Phase | Command or check | Result |
| --- | --- | --- |
| Preflight and baseline | Confirm linked worktree/HEAD, preserve controller-owned HANDOVER changes, inspect Task 5 brief/design/current Web boundary, and run required-runtime `pnpm --filter @airdrop/web test` | Worktree is `.worktrees/project-score-evidence-detail` on `codex/project-score-evidence-detail`, exact base `d039f3ea3f3e4a9756aa9cd08cc1f17f245134e8`. Only the controller's Task 4 review entry was initially modified; Task 4 Commit stayed exact `97d5f46`. Baseline passed 7 files / 127 tests, exit 0. |
| Component RED | Add only `project-score-evidence.test.ts`, then run required-runtime `pnpm --filter @airdrop/web test -- project-score-evidence.test.ts` | Exit 1 as expected. The new suite failed collection only because `../components/project-score-evidence.js` did not exist; all 127 existing tests passed. Tests cover three independent axes, nine current axis/factor labels, contribution/input values, unknown fallback, factor empty state, active grouped citations, multiple/conflicting Evidence, rumored hiding, all eight source types, approved official wording, score-level non-causality, inert `<script>` escaping, and unsafe/outbound source absence. |
| Loader RED | Add only `project-detail-loader.test.ts`, then run required-runtime `pnpm --filter @airdrop/web test -- project-detail-loader.test.ts` | Exit 1 as expected. The loader suite failed collection only because `../lib/project-detail-loader.js` did not exist; the other failure remained the already-recorded missing component, and all 127 existing tests passed. A complete hand-written `ProjectRepository` implementation locks signal timeline behavior, exact project/score IDs, parallel score-read start, scoreless zero calls, and not-found zero follow-up reads. |
| Minimal implementation | Add the pure loader and safe components; delegate the existing server-only query; render explanation → factors → score-level Evidence → existing signal timeline; add only matching CSS and fixture-note copy | `loadProjectDetailFromRepository` keeps `listProjectSignals(projectId, 20)`, skips both score reads when `latestScore?.id` is absent, otherwise starts both reads in one `Promise.all` with the same `project.projectId + scoreId`. Components consume safe application types only; no dependency, query projection, database, RLS, scoring, or recommendation change. |
| First GREEN correction | Re-run the brief package command after implementation | Two local failures only: the explicit `not '<a'` assertion also matched the semantic `<article>` tag prefix, and one test quote repeated its signal title. Replaced `<article>` with equivalent `<section>` and removed the accidental title repetition from the fixture; no product behavior or security expectation was weakened. |
| Focused GREEN | Required runtime `pnpm --filter @airdrop/web exec vitest run src/tests/project-score-evidence.test.ts src/tests/project-detail-loader.test.ts`, followed by the brief package command | Focused 2 files / 13 tests passed, exit 0. The package command collected 9 files / 140 tests and also passed, exit 0. Citation markup contains escaped inert text and no citation anchor. |
| Web gates | Required runtime `pnpm --filter @airdrop/web test`, `lint`, `typecheck`, and `build` | All exit 0. Tests: 9 files / 140 tests. ESLint and `tsc --noEmit` emitted no errors. Next 16.3.0 production build compiled successfully and included dynamic `/projects/[slug]`. |
| Static safety and scope | Component forbidden-field scan, page/loader wiring inspection, `git diff --check`, and tracked-scope inspection | Component source has zero matches for `href`, `canonical_url`, `raw_text`, `reviewer`, `outbox`, `hash`, `dangerouslySetInnerHTML`, anchor markup, Markdown, or URL parsing. Citation text is the direct React text child of `blockquote`; multiple/conflicting rows remain separate within signal groups. `git diff --check` exits 0. No database, migration, generated type, repository, dependency, score math, production, or remote change. |
| Full repository gate | `pnpm verify` | Not run in Task 5: the approved task brief requires the four Web gates, while Task 6 owns fresh full repository/database acceptance. This is recorded as not run, not inferred green. |

Task 5 exposes the deterministic factor decomposition and reviewed score-level
Evidence set without inventing factor-to-Evidence causality. Opportunity, risk,
and confidence remain separate. Active projects render grouped inert citations;
rumored projects render only the approved hidden-state explanation. No external
citation link is exposed, and the existing official-project website link is
unchanged and outside the citation component.

## Task 6 — security sensitivity, full gates, and handover

| Phase | Command or check | Result |
| --- | --- | --- |
| Preflight | Verify linked worktree/HEAD/runtime; inspect exact `16432 -> 64322` and `16433 -> 64321` SSH commands; before every remote write/reset/test recheck `/root/airdrop-governance-test`, project/container names, 64322/64321, fixed paused marker, 21 migrations, and migration/012/006/seed hashes | Passed fail-closed throughout. Node 22.22.2 / pnpm 11.16.0 and base `ab73551d155941a623b3e7935ee367d3ec9d595c` matched. Only the disposable project was accessed; production and forbidden 54321/54322 were not accessed. |
| Database sensitivity RED | On only the remote disposable migration copy, temporarily grant `SELECT (normalized_quote_sha256)` on Evidence to browser roles, reset, and run focused 012 | Mutation SHA-256 `5ea5bf2f7337d5068d1be97e4605090d27913b8a3d51e8a78f6dd2158655899e`; exit 1 with 81/83 passing. Named failures were test 24, `browser roles have the exact safe base-table column SELECT matrix`, and test 58, `anonymous users cannot read Evidence hashes`. |
| Database restore GREEN | Restore from the pre-mutation backup, require remote `cmp`, local production-file zero diff, and local/remote SHA `8c0a2e3c4a76ad8b3b155701cc665544470b9b2715deabd91d6731566c42ea60`; then guarded fresh reset and focused 012 | Restoration proofs passed; focused 012 passed 1 file / 83 tests. The unsafe migration mutation is absent from the local diff and remote artifact. |
| UI sensitivity RED/GREEN | Rename the existing escaping test to state the no-anchor invariant; temporarily render `<a href="https://unsafe.test">`, run focused Web, restore in `finally`, require component zero diff, and rerun | RED: exit 1, 8/10 passed; the named no-anchor render assertion and unsafe-source assertion failed. Restored component SHA-256 `3760b17ac6dff9a53d58d1352a7cdcdcf471fd3be66a5c22789a6b03c33ef9b1`; GREEN: 1 file / 10 tests passed. The anchor mutation is absent from the diff. |
| Final database gate | Recheck all disposable guards, fresh reset, focused 012, then full `supabase test db` | Reset applied all 21 migrations and seed. Focused 83/83 and full 12 files / 1114 tests passed; migration remained at committed SHA `8c0a2e3...ea60`. |
| Real integration | Recheck marker/artifacts and exact tunnels; derive temporary test-container credentials only inside the shell without printing or persisting them; run `pnpm --filter @airdrop/database test:integration` | 7 files / 44 tests passed, exit 0; temporary variables were unset. |
| Append-only cleanup | After integration, perform the only final fresh reset rather than deleting Evidence/links/history row by row | Exit 0; fixed marker exact, `project_scores.model_version = 'repository-test'` count 0, unsafe Evidence-hash grant false, committed migration SHA intact. |
| Root gate | Required runtime `pnpm verify` | Exit 0: lint/typecheck/build/placeholders passed; contracts 107 + domain 222 + database 174 + worker 212 + web 140 = 855 non-skipped tests, with 46 environment-gated skips. |
| Whitespace and unsafe/secret scan | `git diff --check`, then the Task 6 four-file `rg` scan with manual classification of every match | `git diff --check` exit 0. Five matches: the `article_raw_text` value is a safe source-field locator enum, not content; two `service_role` matches preserve revoke/grant on the existing safe `project_current_state` view; two more revoke `service_role` from the new views. Component and repository had no matches. No secret value, credential, unsafe URL, Raw Item body, candidate/reviewer/outbox payload, or browser-visible privileged field was present. |

Commit sequence: `28c2fef` (contracts), `e106c8a` (database boundary),
`1a5e26e` plus `23c30d7` (repository and invariant hardening), `97d5f46`
plus `d039f3e` (real integration and fixture isolation), `ab73551` (Web
presentation), and this Task 6 documentation commit.

**Status:** local implementation complete; production unapplied. Task 6 did not
access production. That statement records this execution only and does not infer
external production state beyond the fact that this task made no production
connection or change.
