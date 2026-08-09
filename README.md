# Airdrop Intelligence OS

Airdrop Intelligence OS is a Web3 decision platform for evaluating legitimate public participation opportunities. It never asks for or stores seed phrases, private keys, wallet passwords, or signing secrets.

## Prerequisites

- Node.js 22 or later
- pnpm 11
- Docker Desktop, for local Supabase

## Install

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Use local, non-production values in `.env.local`. Do not commit it. Confirm the required names are set without displaying their values:

```bash
pnpm verify-env
```

## Database

Start the local Supabase stack:

```bash
pnpm db:start
```

Reset the local database and run database integration tests:

```bash
pnpm test:db
```

Generate local database types after schema changes:

```bash
pnpm db:types
```

## Development

Start the web and worker applications together after their workspace packages are present:

```bash
pnpm dev
```

## Verification

Run the root quality gate:

```bash
pnpm verify
```

Run the full gate, including the local database suite:

```bash
pnpm verify:full
```

Check the repository for unfinished implementation markers:

```bash
pnpm check:placeholders
```

## Shutdown

Stop the local Supabase stack when finished:

```bash
pnpm db:stop
```
