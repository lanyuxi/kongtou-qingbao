# Local development runbook

## Prerequisites

- Node.js 22.
- pnpm 11 (the repository pins pnpm 11.16.0).
- Docker Desktop running before starting local Supabase.

Use only local development credentials. Never put seed phrases, private keys, mnemonics, wallet passwords, signing secrets, or production credentials in this repository or its environment files.

## Install and configure

From the repository root, install exactly what the lockfile records and create an untracked local environment file:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

`.env.example` documents required variable names and safe local placeholders. `.env.local` is the developer's uncommitted local configuration. `NEXT_PUBLIC_*` values are browser-visible; `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` are server-only and must not be exposed to browser code.

To validate the variables loaded into the current shell without printing their values:

```bash
set -a
source .env.local
set +a
pnpm verify-env
```

## Ports

The planned local Supabase configuration uses the standard ports below. Do not bind a second local service to them.

| Service | Address |
| --- | --- |
| Web app | `http://127.0.0.1:3000` (Next.js default) |
| Supabase API | `http://127.0.0.1:54321` |
| PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Worker | No HTTP port in Phase 0; it writes lifecycle logs to the terminal. |

## Start in order

1. Start Docker Desktop and confirm it is ready.
2. Install dependencies and configure `.env.local` as above.
3. Start the local Supabase stack:

   ```bash
   pnpm db:start
   ```

4. In a second terminal, start web and worker processes:

   ```bash
   pnpm dev
   ```

5. Before handing work off, run the repository gate:

   ```bash
   pnpm verify
   ```

## Database reset and tests

`pnpm test:db` runs `supabase db reset` before pgTAP tests. This permanently clears the local Supabase database and reapplies local migrations and seed data. Run it only against the local Docker stack; never point it at a shared, staging, or production database.

```bash
pnpm test:db
```

The reset applies `supabase/seed.sql`; its records are fixed fictional fixtures and never represent verified production opportunities. Regenerate the committed database types after schema work and confirm generation is reproducible:

```bash
pnpm db:types
git diff --exit-code packages/database/src/generated/database.types.ts
```

Run the PostgREST repository integration test only against the local PostgreSQL + Kong + PostgREST topology. It requires these three environment-variable names together: `AIRDROP_DATABASE_TEST_URL`, `AIRDROP_ANON_SUPABASE_URL`, and `AIRDROP_ANON_SUPABASE_KEY`. After `pnpm db:start`, the following local-only command derives them in shell variables and never prints their values:

```bash
set -euo pipefail
database_container='supabase_db_airdrop-intelligence-os'
kong_container='supabase_kong_airdrop-intelligence-os'
database_password="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$database_container" | sed -n 's/^POSTGRES_PASSWORD=//p')"
anon_key="$(docker exec "$kong_container" sh -c "grep -o 'sb_publishable_[A-Za-z0-9_-]*' /home/kong/kong.yml | head -n 1")"
encoded_database_password="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$database_password")"

AIRDROP_DATABASE_TEST_URL="postgresql://postgres:${encoded_database_password}@127.0.0.1:54322/postgres" \
  AIRDROP_ANON_SUPABASE_URL='http://127.0.0.1:54321' \
  AIRDROP_ANON_SUPABASE_KEY="$anon_key" \
  pnpm --filter @airdrop/database test:integration

unset database_password anon_key encoded_database_password
```

The command fails instead of skipping when any required integration variable is absent. Do not print, commit, or reuse these local values outside the local stack.

Use `pnpm verify:full` when both the repository and local database gates are needed:

```bash
pnpm verify:full
```

## Shutdown

Stop the web and worker processes with `Ctrl-C`, then stop the local Supabase stack:

```bash
pnpm db:stop
```
