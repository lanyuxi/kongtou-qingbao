# Phase 0/1 architecture

## System shape

The product is a TypeScript modular monolith. `apps/web` serves pages and short-lived API/BFF requests. `apps/worker` runs durable background work. Both applications depend on focused packages rather than reaching across application boundaries.

Phase 1 introduces one local and production PostgreSQL/Supabase system of record. The web process may perform authentication checks and lightweight user commands, while workers own collection, AI stages, promotion, scoring, tutorial generation, notifications, and maintenance. Heavy work belongs in durable queues and never blocks a web request.

## Dependency direction

Dependencies point inward:

```text
apps/web, apps/worker -> packages/*
packages/database -> packages/contracts, packages/domain
packages/domain -> packages/contracts (enum compatibility exports only), no infrastructure
```

`packages/contracts` is the single source for API, AI-output, job-payload, domain-event, and enum contracts. `packages/domain` contains pure business rules and must not import Next.js, database clients, OpenAI SDKs, or HTTP frameworks. Its explicit `@airdrop/contracts` workspace dependency preserves existing domain enum imports by re-exporting the exact canonical contract schemas; a platform primitive cannot provide that package-level compatibility without duplicating enum values. `packages/database` owns repositories, transactions, migrations, read models, and outbox access; it may consume contracts and domain rules but must not make applications depend on database internals.

## Trust and write boundaries

PostgreSQL/Supabase is the system of record. Browser code uses only the anonymous key and the active user session; service-role, collector, webhook, and model credentials remain server-side. Every exposed table has RLS, and private rows are scoped by `user_id`.

Collectors and AI stages produce untrusted candidate data. Canonical intelligence changes go through the Promotion Service, which commits the canonical write, audit event, and transactional outbox event together. Evidence history, raw items, review decisions, scores, and security incidents are append-only: corrections add a successor, retraction, or new version rather than overwriting history.

## Execution model

The root commands define the supported developer and CI gates:

- `pnpm verify` runs linting, type checking, unit/contract tests, builds, and the placeholder scan.
- `pnpm test:db` resets the local Supabase database and runs pgTAP database tests. It is intentionally separate from `pnpm verify` because it requires Docker and destroys local database data.
- `pnpm verify:full` combines the repository gate with the local database suite.

GitHub Actions keeps repository verification and database integration as distinct jobs. The database job activates when Phase 1's `supabase/config.toml` exists, then starts the local stack and runs the root database test command.

## Local fixture boundary

`supabase/seed.sql` is local test data, not intelligence content. It uses fixed fictional UUIDs and UTC timestamps for one active scored project, one rumored scored project, one paused project, two sources, three signals, and immutable score history. The only fixture identity exists solely to preserve the official-source verification foreign key. It is fictional and uses the reserved `.example.invalid` domain.

The pgTAP seed smoke test asserts the exact records and the complete, deterministic `opportunity_list` result. This gives the repository a reproducible read-model check without treating seeded links or scores as real claims. Database resets apply the seed only to the local Docker topology.
