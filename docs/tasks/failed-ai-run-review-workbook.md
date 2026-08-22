# Failed AI Run Review — Development Workbook

**Plan:** `docs/superpowers/plans/2026-08-22-failed-ai-run-review.md`  
**Spec:** `docs/superpowers/specs/2026-08-22-failed-ai-run-review-design.md`  
**Status legend:** `READY` · `IN_PROGRESS` · `REVIEW` · `DONE` · `DONE_WITH_CONCERNS` · `BLOCKED`

| Task | Status | Scope | RED evidence | GREEN evidence | Commit |
| --- | --- | --- | --- | --- | --- |
| 1 | DONE | Strict failed-run review contracts | Focused Vitest ran 12 tests; 7 failed as expected because the requested exports were undefined (`TypeError: Cannot read properties of undefined (reading 'parse')`). | Focused Vitest: 6 files / 77 tests passed; contracts lint and typecheck passed. | `feat(contracts): add failed AI run review contracts` |
| 2 | DONE | Append-only schema, protected reads, transactional command | With only 011 synchronized and the migration absent, all 7 initial object assertions failed before the suite terminated on absent tables. | Fix round 1 accepted: focused 011 Files=1 / Tests=87 / PASS; full pgTAP Files=11 / Tests=1031 / PASS; named `errorDetail` sensitivity RED then restored 87 PASS. Local `pnpm verify`: 663 tests, exit 0. | `27c4c4b`, `ede1971`, `de55a54` |
| 3 | DONE | Generated types and bearer-scoped repository | Repository unit suite failed before collection because `../review/failed-ai-run-review-repository.js` did not exist; fix round helper RED failed because the partial-Auth cleanup helper was absent; first strengthened real race gate was 1 passed / 2 failed on bigint driver expectations. | Generated types were byte-identical across two remote generations; repository package tests 158 passed / 37 skipped; strengthened focused real integration 3/3 and full repository integration 37/37; exact race row/payload linkage, partial-user cleanup, lint, typecheck, Node 22 root verify, and diff checks passed. | `be0cdc3`, `374c033`, `110e6c0` |
| 4 | DONE | Authenticated review BFF and routes | Focused Web suite failed before collection because `../lib/failed-ai-run-review-handlers.js` did not exist; fix-round leak mutation then produced 3 named failures across list/detail/decision. | Fix round 1: focused handler 52/52; Web package 69/69; exact canonical error envelopes, auth fail-closed, wrong-operation fallbacks, secret exclusions, lint, typecheck, build, Node 22 root verify (739 tests), and diff checks passed; independent review accepted. | `d5f6f42`, `8f02d54` |
| 5 | DONE | Reviewer session and browser API clients | Initial modules were absent; whitespace tokens failed 2 named cases; fix round 1 lacked public markers; fix round 2 cleanup deleted a sibling sentinel; fix round 3 isolated bundle lacked both session/API runtime markers. | Fix round 3: actual browser composition, session controller, and API client are runtime-bundled; Web 98/98, public/runtime/forbidden bundle inspection, lint/typecheck/build, and Node 22 root verify (768 tests) passed; independent review accepted. | `a5d27e3`, `89d06e8`, `906e1b4`, `be5c6b4` |
| 6 | REVIEW | Sign-in, list, detail, history, and decision UI | Focused suite first failed before collection because the review UI modules did not exist; production build then reproduced build-time runtime creation as a Zod env failure; fix round 1 added seven named behavior/security regressions. | Fix round 1: focused 23/23; Web 121/121; lint/typecheck/build; Node 22 root verify 791 non-skipped tests; disclosure, bounded-enum, cursor-reset, and switched-reason regressions are mutation-sensitive. | `85be7dc`, `fix(web): harden failed AI review interactions` |
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
| Final accepted artifact identity | SHA-256 the migration and focused pgTAP source | Executed artifacts match the committed sources | Migration `5150c830cf2cec7850c179f0fbf7254b6c658287fa96789420c6cb75dbb755ae`; updated test `e9158648ea970d930a1fd9cd240d67d4d6e380b41c00d0c32754563368cda7e1`. |
| Initial focused GREEN | Run the pre-fix 011 against the disposable stack | All focused assertions pass | 80/80 PASS before fix round 1. |
| Sensitivity 1 | Remove all three `revoked_at` predicates, then restore the exact source | Revoked reviewer access assertions fail | Assertions 41–43 failed explicitly; additional failures were collateral state pollution. Original source restored. |
| Sensitivity 2 | Use a compilable false branch to skip outbox insertion, then restore the exact source | Atomic side-effect/outbox assertions fail | Assertions 64, 67–68, and 73–74 failed (5 total). Original source restored. |
| Sensitivity 3 | Add a real `errorDetail` output column, then restore the exact source | A named exact-result-signature assertion rejects the extra field before any later structural mismatch | Mutated migration SHA `1140d556d19821e3a57bb68772811febbc64a83cd8762620be432500bb8e537e`; focused exit 1 with `Failed test 31: failed AI run review command has the exact safe result signature without errorDetail`, followed by the expected later INSERT shape abort. Original migration restored. |
| Restored GREEN | Restore migration SHA, reset, and rerun updated 011 | Focused suite returns GREEN | Migration restored to `5150c830cf2cec7850c179f0fbf7254b6c658287fa96789420c6cb75dbb755ae`; reset exit 0; Files=1 / Tests=87 / PASS. |
| Full database gate | Run the full pgTAP suite with updated 011 | All pgTAP files pass | Files=11 / Tests=1031 / Result: PASS. |
| Repository gate | Run root `pnpm verify` | Repository gate exits 0 | 663 tests passed; exit 0. The Node 24 versus required Node 22 engine warning remains recorded. |

Implementation notes: the command derives the reviewer only from `auth.uid()`, re-checks an active reviewer-class grant, serializes reviewer/idempotency-key reuse, locks the reviewable run before version calculation, and appends the decision, receipt, and `intelligence.ai_run.reviewed.v1` outbox row in one transaction. List/detail projections expose only Task 1 contract fields; review tables have RLS with no direct application-role privileges. Fix round 1 is database-accepted on the disposable stack. The new `ai_runs` append-only trigger requires Task 3/7 to replace existing integration-fixture DELETE cleanup with rollback or disposable-reset cleanup semantics.

## Task 2 fix round 1

| Phase | Evidence |
| --- | --- |
| Review finding root cause | The production migration already enforces active reviewer-class authorization, strict safe projections, `(created_at desc, id desc)` cursor behavior, `p_limit` 1..101, and exact non-negative bigint `expectedReviewVersion`. The findings were missing proof strength in 011, so the migration remains byte-identical at SHA-256 `5150c830cf2cec7850c179f0fbf7254b6c658287fa96789420c6cb75dbb755ae`. |
| Tests first | The ordinary authenticated fixture now has an active `user` grant; equal-created-at failures prove UUID tie-break ordering and cursor continuation; 101 lives and 102 returns AR105; detail `run` has exact allowed keys plus explicit prompt/output/error/model-response/request/response/raw-content exclusions; overflow, negative, and fractional expected versions each return AR105 and write no receipt. |
| Signature sensitivity | A named `pg_proc` assertion fixes the exact `execute_failed_ai_run_review` input/output modes, types, and names. With a real `errorDetail` output column and mutated migration SHA `1140d556d19821e3a57bb68772811febbc64a83cd8762620be432500bb8e537e`, focused pgTAP exited 1 at named Failed test 31 before the later INSERT shape abort. The original migration was restored. |
| Binding scope | Detail/history retain bounded `note` and `reviewerUserId`; reviewer email/display and all note/reviewer identity fields remain excluded from outbox. No dblink/concurrency harness was added; two-independent-connection proof is binding Task 3/7 work. |
| Local verification | Updated 011 SHA-256: `e9158648ea970d930a1fd9cd240d67d4d6e380b41c00d0c32754563368cda7e1`. Static/diff checks pass. Root `pnpm verify` passed 663 tests with exit 0; Node 24 engine warning remains. |
| Database evidence | On `airdrop-intelligence-governance-test` (API 64321 / DB 64322), reset applied all 20 migrations with exit 0; updated focused 011 passed Files=1 / Tests=87; full pgTAP passed Files=11 / Tests=1031. After sensitivity restoration, reset again exited 0 and focused 011 again passed 87 tests. Production was untouched. |

## Task 3 execution log

| Phase | Command/check | Expected result | Actual result |
| --- | --- | --- | --- |
| Generated types | Run `pnpm db:types` twice against only the preflighted disposable stack and compare SHA-256 | Both generated files are byte-identical; no manual edit | Both runs produced `058c11dac49a44065f7bb9b509c0ac000df67b38f6ab4a925b29676ed479078d`; `cmp` succeeded; local synchronized file has the same hash and size 82687 bytes. |
| RED | `pnpm --filter @airdrop/database test -- src/tests/failed-ai-run-review-repository.test.ts` before adding the repository | Fails because the repository module/export is absent | Failed before collecting the 20 new tests with `Cannot find module '../review/failed-ai-run-review-repository.js'`; existing package baseline was 134 passed / 34 skipped. |
| Unit GREEN | Run the same package test, then database lint and typecheck | Strict parsing, cursor, bearer forwarding, exact command/replay, error sanitization, browser denial, and partial Auth cleanup-ID selection pass | Package tests 158 passed / 37 skipped; lint and typecheck exit 0. |
| Focused real integration | Run only `failed-ai-run-review-repository.integration.test.ts` with disposable database/API tunnels | Real Auth reviewer succeeds, active ordinary user is denied, and both two-client races have exact linked side effects | Accepted fix round: 1 file / 3 tests passed in 3.46s. Both races assert the exact decision, command receipt, and outbox fields against the winning result and key; payload has exactly seven safe keys and no note, reviewer identity, or sensitive fields. |
| Full repository integration | Freshly preflight/reset only `airdrop-intelligence-governance-test`, then run package `test:integration` | Existing repositories and new review repository remain green | 7 files / 37 tests passed, explicit exit 0, duration 83.57s. Exact fixture cleanup ran only after verifying the disposable marker; the production `ai_runs` append-only trigger was not changed. |
| Root gate | `pnpm verify` and `git diff --check` under Node 22.22.2 / pnpm 11.16.0 | Entire repository and patch hygiene pass on the required runtime | 687 tests passed; lint, typecheck, build, placeholders, and diff check exit 0. Lockfile SHA-256 remained `fb999bf94d561a0e541238790817a834ef17f326ce2a2f22c8f42c0e5d74d9f2`. |

Implementation notes: `@airdrop/database/failed-ai-run-review` is server-only and creates a fresh non-persisting Supabase client for each RPC with only that request's bearer token. Task 1 schemas strictly parse every list/detail/decision result; the extra pagination row is discarded after deriving a cursor from the final returned item. Stable SQLSTATEs map to bounded repository error codes, while unexpected query/persistence details are concealed. Tokens and credentials are not logged, stored in errors, or retained on a singleton.

## Task 3 fix round 1

| Phase | Evidence |
| --- | --- |
| Partial Auth cleanup RED/GREEN | A focused helper test first failed because `presentFixtureUserIds` did not exist. Four cases now prove reviewer-only, ordinary-only, both, and neither signup states. `beforeAll` stores each returned user ID/token immediately; cleanup independently deletes whichever exact non-empty IDs exist, only after the disposable marker check. |
| Exact race proof | Count-only assertions were replaced with exact decision/receipt/outbox snapshots for both independent-client races. Assertions bind run ID, reviewer, command/decision IDs, winning idempotency key, expected/resulting review versions, decision/reason/note, aggregate envelope, exact seven-key payload, and matching timestamps. The failed-AI review receipt contract has no input-hash column, so no invented hash assertion was added. |
| Real RED | The first strengthened focused gate returned 1 passed / 2 failed. All identifiers, reviewer, idempotency, envelope, and payload values matched; only PostgreSQL bigint columns differed because postgres.js returns them as strings. |
| Minimal fix | Expected table bigint values now use their exact string representation; JSON payload `reviewVersion` remains numeric. No production repository, migration, trigger, or generated type changed. |
| Restored GREEN | After a fresh preflight/reset of only DB 64322/API 64321, focused integration passed 3/3 in 3.46s and full integration passed 37/37 with exit 0 in 83.57s. Production was untouched and credentials were not printed. |
| Required runtime | Node 22.22.2 / pnpm 11.16.0 `pnpm verify` passed 687 tests; lint, typecheck, build, placeholders, and diff checks passed. |

## Task 4 execution log

| Phase | Command/check | Expected result | Actual result |
| --- | --- | --- | --- |
| RED | `pnpm --filter @airdrop/web test -- src/tests/failed-ai-run-review-handlers.test.ts` before adding handlers/routes | Fails because the handler module does not exist | Failed before collecting the new tests with `Cannot find module '../lib/failed-ai-run-review-handlers.js'`; 2 existing files / 17 tests passed. |
| Focused GREEN | `pnpm --filter @airdrop/web exec vitest run src/tests/failed-ai-run-review-handlers.test.ts` | Auth, parsing, mapping, envelope, and sanitization behaviors pass | 1 file / 39 tests passed, exit 0. |
| Web package GREEN | `pnpm --filter @airdrop/web test -- src/tests/failed-ai-run-review-handlers.test.ts` | New and existing Web tests pass together | 3 files / 56 tests passed, exit 0. |
| Web static gates | Run Web lint, typecheck, and production build serially | No lint/type errors; Next recognizes all three routes | All three exited 0. Next 16 listed `/api/v1/review/ai-runs`, `/api/v1/review/ai-runs/[runId]`, and `/api/v1/review/ai-runs/[runId]/decisions` as dynamic routes. |
| Root gate | Node 22.22.2 `pnpm verify` and `git diff --check` | Whole repository and patch hygiene pass | 726 tests passed; lint, typecheck, tests, build, placeholders, and diff check exited 0. |

Implementation notes: all three handlers call the existing `AuthenticatedUserVerifier` before extracting the bearer token, then pass only that request-local token into the server-only review repository. Query, cursor, UUID, JSON command, and `Idempotency-Key` boundaries are strict. Shared envelopes use generated request IDs and literal `nextCursor` metadata. Only documented stable repository codes become bounded 400/403/404/409 responses; all other query/persistence failures become sanitized 500 responses. Route modules compose only public Supabase environment values, verifier, repository, UUID generation, and handlers; they contain no business logic, heavy work, service-role key, or browser credential.

## Task 4 fix round 1

| Phase | Evidence |
| --- | --- |
| Shared-envelope ruling | The canonical `apiErrorSchema` keeps `requestId` inside `error` and has no top-level `meta`. Exact assertions therefore use `{ ok: false, error: { code, message, requestId, details: null } }` and explicitly prove `meta` is absent. |
| Exact stable mappings | Every applicable list/detail/decision 400/403/404/409 case now uses full `toEqual` with literal bounded English copy, generated request ID, and `details: null`. Each table case also rejects the repository fixture's token, PostgreSQL URL, password, source body, raw output, and error detail. |
| Auth fail-closed | Missing, Basic, and blank-Bearer raw headers are tested with a verifier that deliberately returns a user. List, detail, and decision handlers independently return the exact 401 envelope and make zero repository calls. |
| Endpoint fallback regression | List/detail convert `review_persistence_failed` and unknown named codes to sanitized `review_query_failed`; decision converts `review_query_failed` and unknown named codes to sanitized `review_persistence_failed`. |
| Sensitivity RED | A temporary mutation copied the rejecting repository's sensitive message into `reviewer_required`. Focused tests failed 3/52 by name across list/detail/decision and displayed the leaked token/database/source/raw/error fixture. The production file was restored byte-for-byte before GREEN. |
| Restored GREEN | Focused handler 52/52; Web package 69/69; Web lint/typecheck/build passed; Node 22.22.2 root `pnpm verify` passed 739 tests. Production handlers/routes were unchanged in this fix round. |

## Task 5 execution log

| Phase | Command/check | Expected result | Actual result |
| --- | --- | --- | --- |
| RED | Run focused session/API client tests before adding the three browser modules | Both suites fail because the session and API client modules do not exist | Both files failed before collection with `Cannot find module '../lib/review-session.js'` and `Cannot find module '../lib/review-api-client.js'`; exit 1. |
| Token boundary RED | Treat null, empty, and whitespace-only sign-in tokens as unusable | Empty and whitespace tokens fail the new named cases before the guard is added | 2/9 session cases failed because the controller returned `{ ok: true }`; the minimal non-whitespace guard restored GREEN. |
| Focused GREEN | Run `review-session.test.ts` and `review-api-client.test.ts` under Node 22.22.2 | Session sanitation, fresh token/key behavior, strict envelopes, and bounded states pass | 2 files / 27 tests passed. |
| Web package and static gates | Run Web tests, lint, typecheck, and production build | Existing handlers and new browser boundaries remain green | 5 files / 96 tests passed; lint, typecheck, and Next production build exited 0. |
| Root gate | Run `pnpm verify` with Node 22.22.2 / pnpm 11.16.0 | Entire repository remains green | 766 tests passed; lint, typecheck, tests, builds, placeholders, and `git diff --check` exited 0. |

Implementation notes: the browser Supabase composition reads only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The session controller returns generic sign-in failure, resolves tokens on demand, retains no token copy, and suppresses provider-specific session/sign-out errors. The API client obtains a fresh token for every list/detail/decision call, generates a new injected idempotency key for every decision, strictly parses the shared envelope and Task 1 data schemas, and returns only bounded `sign_in_required`, `forbidden`, `not_found`, `conflict`, or `request_failed` failures. No provider text, bearer token, password, raw detail, service-role key, or database environment value is returned or thrown.

## Task 5 fix round 1

| Phase | Evidence |
| --- | --- |
| Root cause | `createReviewBrowserSupabaseClient(environment = process.env)` passed the environment object indirectly. Next client compilation only substitutes statically visible `process.env.NEXT_PUBLIC_*` property reads, so the browser bundle could not receive the configured URL/anon key. |
| Real bundle RED | A temporary ordinary App Router route imported a Client Component that calls the default browser composition in `useEffect`. Next production build exited 0, but the emitted client JavaScript contained neither fake public marker; the named test failed at the URL assertion. This first harness was replaced in fix round 2 because its fixed source path and broad recursive cleanup were unsafe. |
| Minimal fix | The default path now constructs its source from direct reads of only `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`. A narrow `PublicEnvironmentSource` and injected client factory retain unit-testability while excluding service/database inputs from the factory options. |
| Bundle GREEN | The same real Next client build contains both fake public markers and contains neither fake service/database value nor the `SUPABASE_SERVICE_ROLE_KEY` / `AIRDROP_DATABASE_URL` names. Focused bundle/session tests passed 11/11. |
| Restored gates | Web package 6 files / 98 tests; Web lint/typecheck/build; Node 22.22.2 root `pnpm verify` 768 tests; `git diff --check` all passed. No deployment, external call, real secret, or production access occurred. |

## Task 5 fix round 2

| Phase | Evidence |
| --- | --- |
| Review finding | The bundle regression wrote to a fixed `apps/web/src/app` route and recursively removed that route plus the shared Web `.next` tree. A pre-existing tracked or uncommitted sibling at that path could therefore be overwritten or deleted. Production code was not implicated. |
| Cleanup RED | The cleanup behavior was first isolated behind the test helper and exercised against an OS-temporary route containing `pre-existing-sibling.txt`. The named regression failed with `ENOENT`, proving the recursive route cleanup deleted the sentinel. |
| Minimal safe harness | The regression now creates an exclusively owned Next fixture under `mkdtemp` in the OS temp directory, copies the actual production `env.ts`, `review-session.ts`, and `supabase-browser.ts`, and compiles a fixture-only Client Component with Next webpack. Its database factory is a fixture-only browser stub; the actual default composition and direct static public environment reads remain the compiled subject. |
| Exact cleanup | Fixture source, config, and `.next` exist only below the exclusively owned fixture root. Nested `finally` blocks remove that root on success or failure, assert the pre-existing sibling still exists after fixture cleanup, and only then remove the uniquely owned temporary parent. No repository source, production config, or shared `.next` tree is written, restored, or deleted. |
| Restored GREEN | Isolated bundle 1/1 and Web package 6 files / 98 tests passed. Both fake public markers were present; fake service/database values and both forbidden variable names were absent. Web lint/typecheck/build and Node 22.22.2 root `pnpm verify` (768 tests) passed. No production code, dependency, deployment, external call, real secret, or production system changed. |

## Task 5 fix round 3

| Phase | Evidence |
| --- | --- |
| Review finding | The isolated fixture copied `review-session.ts`, but `supabase-browser.ts` referenced it only through `import type`; webpack erased that edge. `review-api-client.ts` was not copied or imported, so the bundle regression did not prove either remaining Task 5 runtime module was browser-safe. |
| Runtime RED | Before adding runtime imports, the real isolated Next client build succeeded and retained both public markers, but the combined assertion reported `{ sessionRuntime: false, apiRuntime: false }` for the unique production strings `sign_in_failed` and `review_idempotency_conflict`. The API marker was then tightened to `review_version_conflict`, which appears only in the actual API module rather than fixture response data. |
| Minimal fixture change | The fixture now copies the actual `review-api-client.ts`, imports the actual session controller and API client from its Client Component, creates the actual browser auth port/session controller, executes the bounded sign-in failure path, and executes an API 409 conflict path. The actual `@airdrop/contracts` workspace package is symlinked only inside the owned temp fixture and transpiled by its fixture-only Next config. |
| Bundle GREEN | The real client chunks contain both public Supabase markers plus the actual session/API runtime markers `sign_in_failed` and `review_version_conflict`. They still exclude fake service/database values and the `SUPABASE_SERVICE_ROLE_KEY` / `AIRDROP_DATABASE_URL` names. The sibling sentinel and nested `finally` cleanup regression remain unchanged. |
| Restored gates | Isolated bundle 1/1; Web package 6 files / 98 tests; Web lint/typecheck/production build; Node 22.22.2 root `pnpm verify` 768 tests; and `git diff --check` passed. Production source/config/dependencies were unchanged; no deployment, external call, real secret, or production access occurred. |

## Task 6 execution log

| Phase | Command/check | Expected result | Actual result |
| --- | --- | --- | --- |
| Component RED | Run focused `review-components.test.ts` before adding review UI modules | Fails because the sign-in/list/detail/decision modules do not exist | Failed before collection at the first absent review component module; exit 1. |
| Focused GREEN | Run the focused component behavior suite under Node 22.22.2 | Safe SSR views and pure client transitions pass | 1 file / 16 tests passed. |
| Build regression RED | Run the Web production build without local public env | Client pages remain prerender-safe and defer browser runtime creation | Build failed reproducibly while prerendering `/review/sign-in`: synchronous runtime creation reached strict public-env parsing before browser mount. |
| Minimal build fix | Create the public-only browser runtime after mount and retain neutral loading until it exists | Build succeeds without weakening environment validation | Next build passed and recognized `/review/sign-in`, `/review/ai-runs`, and `/review/ai-runs/[runId]`. |
| Unsafe rendering sensitivity | Temporarily serialize the whole detail DTO into the rendered tree, then restore it | Named safe-detail test rejects leaked unknown fields and values | Focused suite failed 2 named cases, including `renders enumerated safe metadata but never renders unsafe object fields or URLs`; exact production rendering was restored. |
| Reason compatibility sensitivity | Temporarily add `provider_instability` to dismiss reasons, then restore it | Named compatibility test rejects the extra incompatible reason | Focused suite failed exactly `offers only the exact reasons compatible with the selected decision`; the reason set was restored. |
| Web package gates | Run Web tests, lint, typecheck, and build | Existing BFF/session/client behavior and new UI remain green | Web 7 files / 114 tests passed; lint, typecheck, and build exited 0. |
| Root gate | Run `pnpm verify` with Node 22.22.2 / pnpm 11.16.0 | Entire repository remains green | 784 non-skipped tests passed; lint, typecheck, tests, builds, placeholders, and `git diff --check` exited 0. |

Implementation notes: `/review` now bypasses the public `AppShell` and uses a separate review shell with no registration, reset, role-management, or public-navigation links. Protected pages render neutral loading until session resolution, redirect missing/expired sessions, expose bounded 403/not-found/failure states, and obtain tokens only through the Task 5 session/API clients. List and detail components enumerate safe DTO fields; history is chronological and non-editable. Decision reasons remain exact per decision, the command uses the displayed `reviewVersion`, accepted/replayed decisions refetch, and 409 conflicts refetch before showing bounded retry copy. CSS additions are scoped to `.review-*`. No dependency, deployment, external call, credential, privileged browser key, or production access was introduced.

## Task 6 fix round 1

| Phase | Evidence |
| --- | --- |
| Review findings | The first implementation used a narrow note-only filter, sorted history primarily by `createdAt`, and proved several interactions only through markup or direct submit helpers. Native textarea `maxLength` counted UTF-16 units, and protected pages rendered an initially clickable no-op sign-out control. |
| Conservative display policy | A single pure `displayReviewValue` policy now handles every displayed free-form metadata/note value in list/detail. It hides any URL scheme, `@`/userinfo, credential/provider/raw/error/output/usage keywords, control or multiline data, machine payloads, long opaque values, and values over 200 code points behind one bounded `[内容已隐藏]` copy. Enums remain explicit bounded literals. Tests inject PostgreSQL userinfo, API keys, bearer tokens, data/mail schemes, provider/raw JSON-like payloads, multiline content, and long opaque fragments into notes and allowed DTO fields; no fragment renders. |
| Authoritative history order | Decision history now sorts only by `reviewVersion asc`. Reversed `createdAt` and equal-timestamp fixtures both prove v1 renders before v2. |
| Real transitions | Production components use the same pure helpers tested for filter cursor reset, next-cursor application, decision-to-first-compatible-reason transition, Unicode note normalization, duplicate-submit gating, and sign-out gating. Submission uses the switched reason and displayed review version; editable controls are disabled while pending. |
| Unicode notes | The misleading native UTF-16 `maxLength` was removed. Input normalization slices `Array.from(value)` to exactly 1000 code points and displays a code-point counter; 1001 astral characters normalize to the first 1000. Contract validation remains final authority. |
| Sign-out | Protected pages omit sign-out until runtime exists. A shared pending gate prevents repeat actions, keeps the button disabled until the first action finishes, and exposes only bounded pending feedback. |
| Sensitivity | Removing `cursor: null` failed exactly `resets the cursor on each filter change and applies only the selected next cursor`. Retaining the prior reason after a decision switch failed exactly `switches to the first compatible reason and submits that draft with the displayed version`. Both sources were restored before GREEN. |
| Restored gates | Focused 23/23; Web 7 files / 121 tests; Web lint/typecheck/build; Node 22.22.2 root `pnpm verify` 791 non-skipped tests; diff check passed. No deployment, external call, dependency, credential, or production access occurred. |
