# Durable Collection Queue — Development Workbook

**Plan:** `docs/superpowers/plans/2026-08-13-durable-collection-queue.md`
**Status legend:** `READY` · `IN_PROGRESS` · `REVIEW` · `DONE`

| Task | Status | Scope | Evidence / commit |
| --- | --- | --- | --- |
| 1 | DONE | Isolate source test discovery | RED: baseline test discovery exposed duplicate `dist` discovery. GREEN: `pnpm --filter @airdrop/contracts test`, `pnpm --filter @airdrop/domain test`, `pnpm --filter @airdrop/database test`, and typechecks. Commit: `57aa681 test: isolate source test discovery`. |
| 2 | DONE | Durable queue and schedule contracts | RED: `CI=true PATH=/Users/xixi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH pnpm --filter @airdrop/contracts test -- src/queue/durable-collection-queue.test.ts` (six tests fail because exports are absent). GREEN: same command; `pnpm --filter @airdrop/contracts lint`; `pnpm --filter @airdrop/contracts typecheck`; `pnpm --filter @airdrop/contracts test`. Commit: `28d7745 feat(contracts): add durable collection queue contracts`. |
| 3 | READY | Pure scheduling and retry policies | — |
| 4 | READY | Durable queue migration and RLS | — |
| 5 | READY | Typed queue and schedule repositories | — |
| 6 | READY | Schedule command API | — |
| 7 | READY | Scheduler loop | — |
| 8 | READY | Queue consumer loop | — |
| 9 | READY | Final integration and documentation | — |
