# Durable Collection Queue — Development Workbook

**Plan:** `docs/superpowers/plans/2026-08-13-durable-collection-queue.md`
**Status legend:** `READY` · `IN_PROGRESS` · `REVIEW` · `DONE`

| Task | Status | Scope | Evidence / commit |
| --- | --- | --- | --- |
| 1 | DONE | Isolate source test discovery | RED: baseline test discovery exposed duplicate `dist` discovery. GREEN: `pnpm --filter @airdrop/contracts test`, `pnpm --filter @airdrop/domain test`, `pnpm --filter @airdrop/database test`, and typechecks. Commit: `57aa681 test: isolate source test discovery`. |
| 2 | DONE | Durable queue and schedule contracts | RED: `CI=true PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @airdrop/contracts test -- src/queue/durable-collection-queue.test.ts` (six tests fail because exports are absent). GREEN: same command; `pnpm --filter @airdrop/contracts lint`; `pnpm --filter @airdrop/contracts typecheck`; `pnpm --filter @airdrop/contracts test`. Commits: `cb18d9e feat(contracts): add durable collection queue contracts`; `d914892 fix(contracts): preserve idempotency key bytes` (final head: `d914892`). |
| 3 | DONE | Pure scheduling and retry policies | RED: direct Vitest failed on missing policy modules; retry vectors later failed with unjittered base delays. GREEN: direct focused Vitest (`60` tests), domain TypeScript, and domain ESLint all pass using installed workspace tools. Commit: `feat(domain): add collection scheduling policies` (this task). |
| 4 | DONE | Durable queue migration and RLS | RED: remote disposable Supabase passed files 001–008 while migration-009 schema/role/function/behavior assertions failed. GREEN: remote `pnpm test:db` passed 9 pgTAP files and 774 assertions. Generated database types were produced twice with zero diff (SHA-256 `cfdf7d5e...`). Local `pnpm verify` passed. Commit: `feat(db): add durable collection queue` (this task). |
| 5 | READY | Typed queue and schedule repositories | — |
| 6 | READY | Schedule command API | — |
| 7 | READY | Scheduler loop | — |
| 8 | READY | Queue consumer loop | — |
| 9 | READY | Final integration and documentation | — |
