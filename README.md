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

Phase 2 adds a dormant, queue-ready collector for exact configured official HTML and RSS/Atom sources. It is not scheduled or activated by the worker entry point. Server-side deployment will supply `AIRDROP_COLLECTION_DATABASE_URL` and `AIRDROP_COLLECTION_USER_AGENT` without committing or logging their values and must explicitly close the returned collector pool on shutdown.

## Architecture

See [the Phase 0/1 architecture](docs/architecture/phase-0-1.md) for module boundaries, dependency direction, trust boundaries, and the execution model.

See [the Phase 2 source collection architecture](docs/architecture/phase-2-source-collection.md) for SSRF controls, append-only persistence, Feed/article budgets, dependency rationale, and composition boundaries.
