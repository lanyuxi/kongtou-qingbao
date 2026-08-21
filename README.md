# Airdrop Intelligence OS

Airdrop Intelligence OS is a Web3 decision platform for evaluating legitimate public participation opportunities. It never asks for or stores seed phrases, private keys, wallet passwords, or signing secrets.

## Quick start

Install Node.js 22, pnpm 11, and Docker Desktop, then follow the [local development runbook](docs/runbooks/local-development.md). It covers local configuration, ports, startup, the local-only database reset, verification, and shutdown.

The root quality gate is:

```bash
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify:full` also runs the local Supabase database integration suite. `pnpm test:db` resets the local database, applies migrations and the deterministic fictional seed, then runs pgTAP. It must never target shared, staging, or production data.

The seed intentionally contains only fixed UUIDs, `.example.invalid` URLs, and fictional project/source/signal/score records. It contains no real people, wallets, contracts, credentials, or production domains.

Phase 2 adds bounded, evidence-preserving collection for exact configured official HTML and RSS/Atom sources, activated through a durable PostgreSQL queue in `apps/worker`: a 30-second scheduler reconciles eligible official relationships into 30-minute default schedules, and a single consumer claims fenced jobs with 120-second leases, bounded retries, and dead-letter handling. Server-side deployment supplies the five server-only environment-variable names documented in the runbook (`AIRDROP_QUEUE_ADMIN_DATABASE_URL`, `AIRDROP_QUEUE_DATABASE_URL`, `AIRDROP_COLLECTION_DATABASE_URL`, `AIRDROP_COLLECTION_USER_AGENT`, `AIRDROP_QUEUE_WORKER_ID`) without committing or logging their values. Automatic collection stores untrusted Raw Items; it never publishes verified airdrop claims or bypasses the future Evidence, review, and Promotion pipeline.

Phase 6A closes the governance loop: AI output stays candidate data, a dedicated `promotion_service` database boundary owns the protected review command, and a public signal or score becomes visible only when it traces through valid Evidence to a Raw Item and Source. Human approve, reject, and needs-review decisions append immutable review records, hardened audit events, idempotent command receipts, and transactional outbox events in one PostgreSQL transaction, driven by the server-only `review-candidate` CLI; a bounded reconciliation runner backfills Evidence for verifiable history and parks unverifiable history for review without deleting it. The runbook documents the `AIRDROP_PROMOTION_DATABASE_URL`, `AIRDROP_PROMOTION_REVIEWER_USER_ID`, `AIRDROP_EVIDENCE_RECONCILE_LIMIT`, and `AIRDROP_EVIDENCE_RECONCILE_AFTER_ID` variable names.

## Architecture

See [the Phase 0/1 architecture](docs/architecture/phase-0-1.md) for module boundaries, dependency direction, trust boundaries, and the execution model.

See [the Phase 2 source collection architecture](docs/architecture/phase-2-source-collection.md) for SSRF controls, append-only persistence, Feed/article budgets, dependency rationale, and composition boundaries.
