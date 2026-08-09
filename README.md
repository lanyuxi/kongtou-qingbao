# Airdrop Intelligence OS

Airdrop Intelligence OS is a Web3 decision platform for evaluating legitimate public participation opportunities. It never asks for or stores seed phrases, private keys, wallet passwords, or signing secrets.

## Quick start

Install Node.js 22+, pnpm 11, and Docker Desktop, then follow the [local development runbook](docs/runbooks/local-development.md). It covers local configuration, ports, startup, the local-only database reset, verification, and shutdown.

The root quality gate is:

```bash
pnpm install --frozen-lockfile
pnpm verify
```

After Phase 1 database files are present, `pnpm verify:full` also starts from the local Supabase database integration suite. `pnpm test:db` resets the local database and must never target shared, staging, or production data.

## Architecture

See [the Phase 0/1 architecture](docs/architecture/phase-0-1.md) for module boundaries, dependency direction, trust boundaries, and the execution model.
