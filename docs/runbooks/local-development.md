# Local development runbook

## Prerequisites

- Node.js 22.
- pnpm 11 (the repository pins pnpm 11.16.0).
- Docker Desktop running before starting local Supabase.

Use only local development credentials. Never put seed phrases, private keys, mnemonics, wallet passwords, signing secrets, or production credentials in this repository or its environment files.

The automatic collection queue expects the server-only environment-variable names `AIRDROP_QUEUE_ADMIN_DATABASE_URL`, `AIRDROP_QUEUE_DATABASE_URL`, `AIRDROP_COLLECTION_DATABASE_URL`, `AIRDROP_COLLECTION_USER_AGENT`, and `AIRDROP_QUEUE_WORKER_ID` in the worker environment. Do not document, print, or commit their values. Provision a dedicated login separately for each boundary: membership sufficient to `SET ROLE collection_queue_worker` for queue operations, `SET ROLE collection_worker` for collection persistence, and `SET ROLE collection_schedule_admin` for schedule administration. The migrations intentionally create those roles without login capability or passwords. Never use a browser credential or service-role credential for the queue or collection.

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

Run the PostgREST repository integration test only against the local PostgreSQL + Kong + PostgREST topology. It requires these four environment-variable names together: `AIRDROP_DATABASE_TEST_URL`, `AIRDROP_QUEUE_ADMIN_DATABASE_TEST_URL`, `AIRDROP_ANON_SUPABASE_URL`, and `AIRDROP_ANON_SUPABASE_KEY`. After `pnpm db:start`, the following local-only command derives them in shell variables and never prints their values:

```bash
set -euo pipefail
database_container='supabase_db_airdrop-intelligence-os'
kong_container='supabase_kong_airdrop-intelligence-os'
database_password="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$database_container" | sed -n 's/^POSTGRES_PASSWORD=//p')"
anon_key="$(docker exec "$kong_container" sh -c "grep -o 'sb_publishable_[A-Za-z0-9_-]*' /home/kong/kong.yml | head -n 1")"
encoded_database_password="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$database_password")"

AIRDROP_DATABASE_TEST_URL="postgresql://postgres:${encoded_database_password}@127.0.0.1:54322/postgres" \
  AIRDROP_QUEUE_ADMIN_DATABASE_TEST_URL="postgresql://postgres:${encoded_database_password}@127.0.0.1:54322/postgres" \
  AIRDROP_ANON_SUPABASE_URL='http://127.0.0.1:54321' \
  AIRDROP_ANON_SUPABASE_KEY="$anon_key" \
  pnpm --filter @airdrop/database test:integration

unset database_password anon_key encoded_database_password
```

The command fails instead of skipping when any required integration variable is absent. Do not print, commit, or reuse these local values outside the local stack.

Use `pnpm verify:full` when both the repository and local database gates are needed. It resets only the local disposable Supabase database; it must never run against shared, staging, or production data:

```bash
pnpm verify:full
```

Target source-collection tests with:

```bash
pnpm --filter @airdrop/worker test -- src/collection/tests/collect-source.test.ts
pnpm --filter @airdrop/worker test -- src/collection/tests/create-collector.test.ts
```

Target the automatic collection queue with:

```bash
pnpm --filter @airdrop/worker test -- src/queue/run-scheduler.test.ts src/queue/run-consumer.test.ts
pnpm --filter @airdrop/worker test -- src/queue/process-collection-job.test.ts src/queue/create-queue-runtime.test.ts
pnpm --filter @airdrop/database test:integration
```

The end-to-end queue acceptance test requires `AIRDROP_DATABASE_TEST_URL` pointing at the freshly reset local database and runs the scheduler, consumer, queue repository, collector repository, and collector against a fake HTTP adapter:

```bash
pnpm exec supabase db reset
pnpm --filter @airdrop/worker test -- src/queue/tests/automatic-collection.e2e.test.ts
```

`createSourceCollector()` exposes only `collect` and `close`; the queue runtime owns both and closes the collector pool during shutdown.

## Governed Promotion and Evidence reconciliation

Canonical intelligence writes are governed by the Phase 6A boundary: AI and collection roles cannot insert canonical signals, and every publicly visible signal or score must trace through valid Evidence to a Raw Item and Source. Signals and scores recorded before Phase 6A remain stored but hidden from public read models until reconciliation links Evidence or the record is parked with an append-only `needs_review` decision.

Provision the server-only Promotion login with flat SQL statements. Never send `DO $$ ... $$` blocks over SSH because they fail silently:

```sql
create role promotion_service_login with login password 'local-password' in role promotion_service;
```

The governed review CLI replaces the retired legacy entry, which now fails closed with `legacy_promotion_cli_disabled_use_review_candidate`. Review a pending extraction candidate with an active reviewer profile UUID, its exact version, and a fresh Idempotency-Key:

```bash
npx tsx apps/worker/src/promotion/review-candidate.ts approve <candidate-id> <expected-version> <idempotency-key>
npx tsx apps/worker/src/promotion/review-candidate.ts reject <candidate-id> <expected-version> <idempotency-key> claim_not_supported
npx tsx apps/worker/src/promotion/review-candidate.ts needs-review <candidate-id> <expected-version> <idempotency-key> grounding_failed
```

The commands read only `AIRDROP_PROMOTION_DATABASE_URL` and `AIRDROP_PROMOTION_REVIEWER_USER_ID`; they never print connection values, source content, notes, or stack traces. The review transaction performs deterministic exact-quote grounding against stored immutable data and never calls a model, DNS, or HTTP service inside the transaction.

Backfill Evidence for already-promoted historical candidates in bounded, idempotent batches. The runner processes promoted candidates that still lack an Evidence link, in ascending candidate-ID order, and prints only integer counts plus the next cursor:

```bash
npx tsx apps/worker/src/promotion/reconcile-historical-evidence.ts
```

Optional controls are `AIRDROP_EVIDENCE_RECONCILE_LIMIT` (1-100, default 25) and `AIRDROP_EVIDENCE_RECONCILE_AFTER_ID` (UUID cursor for continuing after the printed cursor). Re-running with the same reviewer appends exact replays and creates no duplicate Evidence, links, decisions, or events. Ungroundable history is preserved and parked with a `historical_reconciliation_failed` needs-review decision; it is never deleted or overwritten.

## Failed AI run review (Phase 6B)

The review UI lets authenticated active reviewers inspect failed AI extraction runs (`provider_error`, `schema_invalid_after_repair`, `grounding_failed`) and append idempotent, version-checked `needs_investigation` or `dismiss` decisions with transactional outbox events. It never displays raw AI errors, model output, prompts, usage payloads, or source bodies, and it never retries or re-runs failed AI work; retry remains excluded from scope.

The UI never creates accounts or roles. Provision a human reviewer Auth user and an active reviewer-class role through the same trusted administrative process used for governed promotion review — flat SQL statements only, never `DO $$ ... $$` blocks over SSH:

```sql
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('<human-reviewer-uuid>', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', '<human-reviewer-email>',
  '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.profiles (id) values ('<human-reviewer-uuid>') on conflict (id) do nothing;
insert into public.user_roles (user_id, role, granted_at)
values ('<human-reviewer-uuid>', 'reviewer', now());
```

Set the password through the trusted administrative channel and never store it in this repository or its environment files. Reviewer authorization is re-derived inside each review RPC from `auth.uid()` plus a current non-revoked grant of `reviewer`, `senior_reviewer`, `security_reviewer`, or `admin`; setting `user_roles.revoked_at` therefore takes effect immediately (denial `AR104`).

Start the stack as usual (`pnpm db:start`, then `pnpm dev`) and open `http://127.0.0.1:3000/review/sign-in`. Sign in with the provisioned reviewer credentials. The browser holds only the public Supabase URL, anon key, and its own session; list lives at `/review/ai-runs`, detail/history/decision at `/review/ai-runs/<run-id>`.

Focused tests:

```bash
pnpm --filter @airdrop/contracts test -- src/review/failed-ai-run.test.ts
pnpm --filter @airdrop/database test -- src/tests/failed-ai-run-review-repository.test.ts src/tests/failed-ai-run-review-integration-fixture.test.ts
pnpm --filter @airdrop/web test -- src/tests/failed-ai-run-review-handlers.test.ts src/tests/review-session.test.ts src/tests/review-api-client.test.ts src/tests/review-components.test.ts
```

Real repository integration for the review boundary additionally requires the four disposable-topology variables from "Database reset and tests" (`AIRDROP_DATABASE_TEST_URL`, `AIRDROP_QUEUE_ADMIN_DATABASE_TEST_URL`, `AIRDROP_ANON_SUPABASE_URL`, `AIRDROP_ANON_SUPABASE_KEY`) and must target only the disposable stack (remote tunnels `16432 -> 64322` and `16433 -> 64321`), never production.

Migration safety: `20260822000100_failed_ai_run_review.sql` is forward-only and additive; it does not modify any of the 19 earlier migrations or any canonical intelligence table. It adds two append-only review tables, three fixed-search-path security-definer RPCs, append-only triggers, and least-privilege grants, and grants no direct review-table access to browser or worker roles. Review decisions never write signals, scores, evidence, or promotion rows.

## Project score factors and Evidence citations

The project detail page binds its displayed scores, factor decomposition, and
reviewed Evidence set to one immutable current score ID. `project_current_state`
returns that ID as `project_score_id`; the Web loader then reads only
`project_current_score_factors` and
`project_current_score_evidence_citations` with the same project and score IDs.
The factor view exposes deterministic opportunity, risk, and confidence inputs
without changing their independent scoring semantics. The citation view is a
score-level Evidence set and does not claim that one citation caused one factor.

Citation text is rendered as escaped, inert text. The public projection and
component expose no source URL, Raw Item body, hash, review payload, governance
metadata, anchor, or `href`. Until a separate verified allowlisted-reference
feature exists, do not turn citation metadata into links. An active project may
show its current factors and grouped reviewed citations, including distinct or
conflicting Evidence rows. A rumored project may show current factors but keeps
all citations hidden. Historical-score factor and citation queries return no
public rows.

Focused checks are:

```bash
supabase test db supabase/tests/012_project_score_evidence_detail.test.sql
pnpm --filter @airdrop/database exec vitest run src/tests/project-score-evidence.test.ts
pnpm --filter @airdrop/database test:integration
pnpm --filter @airdrop/web exec vitest run src/tests/project-score-evidence.test.ts src/tests/project-detail-loader.test.ts
```

Database resets and real integration are destructive acceptance operations. In
the current remote acceptance topology, run them only after a fail-closed check
of `/root/airdrop-governance-test`, project
`airdrop-intelligence-governance-test`, database/Kong host ports `64322`/`64321`,
local tunnels `16432`/`16433`, the exact paused seed marker, and the migration,
test, and seed hashes. Never target `airdrop-intelligence-os` or ports
`54321`/`54322` for these acceptance commands. Integration fixtures create
append-only Evidence and score history; clean them only with a final fresh reset
of the verified disposable stack, never with row-by-row history deletion.

## Security incidents and indicators (Phase 7A)

The security overlay is an append-only ledger layered over the existing Catalog,
intelligence, and decision modules. It never rewrites project lifecycle, score
values, score history, or score recommendation; it publishes an independent
`clear` / `caution` / `blocked` posture derived from the strictest active
precaution on a target.

### Reviewer provisioning and revocation

Canonical security writes are only possible from the current bearer session of a
user holding an active `security_reviewer` or `admin` grant in `public.user_roles`
(`revoked_at is null`). Provisioning is a database operation performed by an
operator with existing privileges: insert a grant row for the reviewer's user ID,
and revoke by setting `revoked_at` — never by deleting the row, because the grant
history is part of the audit trail.

Revocation takes effect on the next command: the protected functions re-check the
caller's `auth.uid()` on every call. The reviewer UI treats `401` and `403` as
"clear the local session and return to `/review/sign-in`"; it never retries.

### Reviewer workflow (`/review/security`)

1. Sign in at `/review/sign-in` with a Supabase account that has the grant above.
   The shell verifies the session before any list or detail call.
2. **Candidates** — the queue lists AI/collector `security_risk` and
   `scam_indicator` candidates plus reviewer-submitted manual candidates. Each
   decision (`needs_review`, `reject`, `accept_and_open`, `accept_and_attach`) is
   append-only. Grounding is verified before a canonical row exists: a candidate
   whose Evidence locator does not match the source text is recorded as
   `needs_review` and creates no indicator or incident.
3. **Incidents** — `open`, `adjust`, `attach_indicator`, `resolve`, and `reopen`
   each append a decision. Posture is always chosen explicitly as `caution` or
   `blocked`; `clear` is only ever derived when no active precaution remains.
4. **Disclosure** — indicator values become public one row at a time through the
   `set_indicator_disclosure` **command operation** (submitted like any other
   protected command, not a separate RPC), with an explicit version typed by the
   reviewer. The UI never guesses or auto-increments it.
5. High-impact commands require ticking an affirmative confirmation bound to the
   authoritative aggregate version. Editing any command field, or a `409`
   conflict, clears the confirmation rather than silently adopting the newer
   version.

### Stable error codes

The API returns stable domain codes; never branch on human-readable text.

| Code | Meaning | Typical operator action |
| --- | --- | --- |
| `security_candidate_not_found` (`AS101`) | Candidate ID does not exist or is not visible to this session | Reload the queue |
| `security_candidate_not_reviewable` (`AS102`) | Candidate is already `accepted`/`rejected`, or the command payload is malformed for its decision | Reload; do not resubmit a decided candidate |
| `security_incident_not_found` (`AS103`) | Incident ID does not exist or is not visible | Reload the incident list |
| `security_reviewer_required` (`AS104`) | Either a protected command ran without an active `security_reviewer` / `admin` grant, **or** ordinary Promotion tried to approve a `caution`-posture target for a reviewer without one | Provision/restore the grant, or route the approval to a security reviewer |
| `security_indicator_not_found` (`AS105`) | Indicator ID does not exist | Reload the incident detail |
| `security_version_conflict` (`AS106`) | `expected_version` is stale | Reload and re-confirm; never auto-adopt the new version |
| `security_idempotency_conflict` (`AS107`) | Same `Idempotency-Key` reused with a different body | Generate a fresh key |
| `security_command_invalid` (`AS108`) | Command failed contract or reason/state validation | Fix the command payload |
| `security_target_mismatch` (`AS109`) | Target does not match the incident scope | Re-select the target |
| `security_review_required` (`AS111`) | A `security_risk` / `scam_indicator` candidate reached the **ordinary** Promotion path (or the security routing function) | Route it to `/review/security`; never promote it as an ordinary signal |
| `security_promotion_blocked` (`AS112`) | Target is `blocked`; no canonical intelligence may pass | Resolve or adjust the incident first |
| `security_persistence_failed` (`AS199`) | Transaction failed and rolled back | Retry once; if it persists, inspect the database logs |

### Blocked-source queue behaviour

A `blocked` source stops entering new collection, extraction, and ordinary
Promotion, and its Evidence stops counting toward public validity. The collector
returns the typed outcome `security_blocked`; the queue then cancels the in-flight
job with the terminal result code `source_security_blocked` and does **not** retry
it — cancelling is not a failure to be retried. Do not read the outcome name and
the cancellation code as interchangeable: `security_blocked` is what the collector
reports, `source_security_blocked` is what the queue persists. Its already
grounded Evidence stays available to the Security Ledger for investigation, but
that never restores ordinary public eligibility. Only `score`s whose every
score-linked signal still has at least one non-blocked Evidence remain public;
otherwise the whole score and its factor set drop out of the current public
projection and are retained as history.

### Focused disposable acceptance commands

```bash
supabase test db supabase/tests/013_phase_7a_security_incidents_indicators.test.sql
pnpm --filter @airdrop/database exec vitest run src/tests/security-review-repository.integration.test.ts
pnpm --filter @airdrop/database exec vitest run src/tests/promotion-repository.integration.test.ts
pnpm --filter @airdrop/database exec vitest run src/tests/source-collection-repository.integration.test.ts
pnpm --filter @airdrop/database exec vitest run src/tests/scoring-repository.integration.test.ts
pnpm --filter @airdrop/worker exec vitest run src/ai/tests/security-extraction-golden.test.ts
pnpm --filter @airdrop/web exec vitest run src/tests/security-elements.test.ts
```

The same fail-closed preflight as the earlier phases applies: confirm the remote
work directory, project, database/Kong ports `64322`/`64321`, local tunnels
`16432`/`16433`, the paused seed marker, and the migration, test, and seed hashes
before any reset. Never target `airdrop-intelligence-os` or ports
`54321`/`54322`.

### Append-only recovery

Nothing in the ledger is updated in place. To correct a mistaken decision, append
the correcting decision (`adjust`, `resolve`, `reopen`, or a withdrawn
disclosure) and let the read models re-derive posture. Do not delete incident,
decision, event, or command-receipt rows, and do not edit history rows to make a
mistake disappear — the contradiction must stay visible. The Golden Dataset
(`apps/worker/src/ai/fixtures/security-extraction-golden.ts`) is the regression
net for the extraction boundary; extend it rather than loosening grounding.

### Production deployment (worker)

The worker runs from source with `tsx` (the project's own `pnpm start` path) as
systemd `airdrop-worker` in `/srv/airdrop-intelligence-worker/`, with runtime
env in `/etc/airdrop-worker.env` (outside the rsynced tree).

```bash
rsync -az --delete --exclude '.git' --exclude '.worktrees' --exclude 'dist' \
  --exclude '.next' --exclude 'supabase' ./ root@<host>:/srv/airdrop-intelligence-worker/
ssh root@<host> 'cd /srv/airdrop-intelligence-worker && CI=true pnpm install --filter @airdrop/worker... --frozen-lockfile'
# then: write /etc/airdrop-worker.env and the unit, systemctl enable --now airdrop-worker
```

Verification after a deploy: `systemctl is-active airdrop-worker`,
`journalctl -u airdrop-worker` for `status":"ready"` and
`collection_job_succeeded`, and `raw_items` growth in the database.

**Five traps, all hit during the first deploy:**

1. **`node_modules/.bin/tsx` is a shell wrapper, not JavaScript.** Running
   `node .../tsx src/index.ts` fails with `SyntaxError`; invoke the bin
   directly and let its shebang work.
2. **Do not rsync `node_modules` from macOS.** Native binaries (esbuild) are
   platform-specific and will fail with `MODULE_NOT_FOUND` on Linux. Install on
   the host instead (`CI=true pnpm install --filter @airdrop/worker...`).
3. **`tsc` output is not a deployable artifact.** `pnpm build` only compiles the
   worker; the `@airdrop/*` workspace packages export `src`, so
   `node dist/index.js` cannot resolve them. Ship source + `tsx`.
4. **The host cannot reach the database through its own port mapping**
   (`127.0.0.1:54322` refuses connections even though docker-proxy listens;
   same hairpin behaviour as the Supabase API). Connect to the **container IP**
   on 5432 instead — and remember the IP changes if the db container is
   recreated: re-read it with `docker inspect` and update the env file.
5. **Login-role credentials differ from `POSTGRES_PASSWORD`, and
   `collection_queue_worker_login` was created with `NOINHERIT`** while the
   other three login roles inherit. Testing inside the container hides both
   (trust auth + different path): always reproduce through the worker's actual
   connection string before blaming the code.

### Production deployment (web app)

The web app ships as a **standalone bundle built locally** — the production
host has ~650MB of free RAM, far below a production `next build`.

1. Build locally with the production public env (the browser bundle embeds
   `NEXT_PUBLIC_SUPABASE_URL=http://115.190.206.200/supabase`, which nginx
   proxies to the Kong gateway):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL="http://115.190.206.200/supabase" \
   NEXT_PUBLIC_SUPABASE_ANON_KEY="<production anon key>" \
   pnpm --filter @airdrop/web build
   ```
2. Upload three trees over rsync to `/srv/airdrop-intelligence-app/`:
   `.next/standalone/` (target root), `.next/static/` (into
   `apps/web/.next/static/`), and `public/` if it exists.
3. Runtime env lives in **`/etc/airdrop-web.env`**, never inside the deploy
   directory — `rsync --delete` on the standalone root would wipe it:
   - `NEXT_PUBLIC_SUPABASE_URL` (public, browser-embedded)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_INTERNAL_URL=http://127.0.0.1:54321` — the cloud security group
     blocks hairpin access to the host's own public IP, so server-side fetches
     (SSR, route handlers) must go through the loopback Kong port. See
     `lib/env.ts` / `lib/supabase-server.ts`.
4. `systemctl restart airdrop-web`; nginx proxies `/` to 127.0.0.1:3000 and
   `/supabase/` to Kong 54321.
5. Known issue (diagnosed 2026-09-03, fix deferred to the receiving team): the
   score-evidence projections take ~2s per anonymous read on production. Root
   cause chain, from `EXPLAIN (ANALYZE)` as anon on the production data:
   - `current_score_citation_path_is_public` is a **SECURITY DEFINER** SQL
     function, so Postgres **cannot inline it**; the view (and the underlying
     anon RLS policies on signals / evidence / score links, which call the same
     function with partially-NULL args) execute the full 8-table EXISTS
     subquery **per row**.
   - Each call costs ~100-300ms on the 2GB host (nested definer function
     `current_project_score_is_public` + planning overhead), multiplied by the
     ~6 citation rows and by the four call sites -> 1.9-3s, over the legacy
     `anon|statement_timeout=3s` in some request shapes.
   - The disposable stack cannot reproduce it: its fixtures contain no
     production-sized data for this path (the probe query returns 0 rows in
     ~15ms), so integration tests never exercise the slow path.
   - Mitigations already in place: `authenticator` statement_timeout 15s, the
     loader's fail-soft degradation (empty state, no invented data).
   - Recommended fix for the receiving team (in order of preference): (1)
     rewrite the two public projections as security-definer RPCs returning the
     final rows (one definer execution, no per-row function), updating the
     repositories + pgTAP accordingly; or (2) restructure the views so the
     path check becomes plain joins, granting anon the required column-level
     SELECTs on raw_items / discovered_items with row-locked RLS policies —
     wider exposure, needs a security review. Do NOT simply relax timeouts
     further.

### Production exclusion

Phase 7A is local/disposable-verified only. Its migration is not applied to
production, and this runbook authorizes no production operation: no migration,
no role or account creation, no data backfill, and no deployment. Production
rollout remains gated behind reviewer supply, a healthy production Auth service,
a rehearsed pre-migration backup, and explicit authorization.

## Verified allowlisted references (Phase 7B)

The reference ledger is an append-only, two-layer record of what the product is
allowed to link to. A **domain authority** proves that a domain belongs to the
project; a **reference** is one specific URL entry underneath it. A granted
domain never verifies any URL beneath it — both objects carry their own
decisions and their own history. AI and collector output can only ever create a
candidate; canonical verification requires a human decision grounded in
Evidence.

### Reviewer provisioning

Canonical reference writes are only possible from the current bearer session of
a user holding an active `reviewer`, `senior_reviewer`, or `admin` grant in
`public.user_roles` (`revoked_at is null`). Phase 7B adds no new role value.
Provisioning and revocation follow the Phase 7A pattern exactly: insert a grant
row, and revoke by setting `revoked_at` rather than deleting it, because the
grant history is part of the audit trail. Revocation takes effect on the next
command — the protected functions re-check `auth.uid()` on every call.

### Authority versus URL decision workflow

Work top-down, one object at a time:

1. **Grant the domain authority first.** `verify`, `reverify`, and `restore` all
   read the authority covering the URL's host. If **no authority row** covers
   that host the command fails with `domain_authority_not_found` (`AR203`); if a
   row exists but is not currently `granted` — it is `candidate` or `revoked` —
   the command fails with `reference_not_decidable` (`AR202`) instead, so the two
   codes tell you whether to create the authority or to re-grant an existing one.
2. **Register the URL entry** for the specific page you intend to link to.
   Registration only creates a `candidate`; it never renders publicly.
3. **Decide** with Evidence that traces to a Raw Item and a Source whose source
   is not blocked. `verify` promotes a candidate, `reverify` records a fresh
   verification, `withdraw` stops rendering while keeping history, and `restore`
   returns a flagged reference to service.
4. **Withdraw** does not require Evidence; every other promoting decision does.

`www.example.com` and `example.com` are separate authorities and must be granted
separately — normalization never folds `www.`, never strips query strings, and
never collapses near-miss domains. Two projects may hold the same URL, but one
project may not hold the same normalized URL twice.

### last_verified_at semantics

`last_verified_at` is always derived from the most recent successful `verify`
decision, never from registration time and never from a mutable column. It is
what the public project page renders next to a verified link, and it is the
freshness signal for re-review. A `withdraw` decision stops public rendering
immediately but leaves the derived verification time in the history.

### Security flag coupling and restoration

A matching Phase 7A indicator flags the reference synchronously — there is no
background job — and the public projection stops rendering it at once. The
derived state stays `flagged` even after a later verify decision until a human
releases it: only a reviewer can restore a flagged reference, and only with
Evidence whose source is not blocked. Release sets `released_at` on the flag
row; it never deletes it, so the contradiction stays visible. A `blocked`
project suppresses every one of its references regardless of their own state.

### Stable error codes

The API returns stable domain codes; never branch on human-readable text.

| Code | Meaning | Typical operator action |
| --- | --- | --- |
| `reference_not_found` (`AR201`) | Reference ID does not exist or is not visible to this session | Reload the list |
| `reference_not_decidable` (`AR202`) | The current state does not permit this decision — either the state/decision pair is invalid (for example verifying an already verified reference), or a covering domain authority exists but is not `granted` | Reload and re-read the state; re-grant the authority when that is the cause |
| `domain_authority_not_found` (`AR203`) | No authority row covers the URL's host, or the specified authority ID does not exist | Create the authority, or reload |
| `reference_reviewer_required` (`AR204`) | No active `reviewer` / `senior_reviewer` / `admin` grant on the bearer session | Provision or restore the grant |
| `reference_version_conflict` (`AR206`) | `expectedVersion` is stale | Reload and re-confirm; never auto-adopt the new version |
| `reference_idempotency_conflict` (`AR207`) | Same `Idempotency-Key` reused with a different body | Generate a fresh key |
| `reference_command_invalid` (`AR208`) | Command failed contract/state validation, violates project-scoped URL uniqueness, or re-releases an already released flag | Fix the command payload |
| `reference_evidence_required` (`AR209`) | A promoting decision without usable Evidence, or Evidence whose Raw Item/Source does not resolve to the target's source | Select Evidence that traces to a non-blocked Source |
| `reference_normalization_invalid` (`AR210`) | URL or domain cannot be normalized (scheme, host, length, or control characters) | Correct the value; never hand-normalize it |
| `reference_persistence_failed` (`AR299`) | Transaction failed and rolled back | Retry once; if it persists, inspect the database logs |

### Focused disposable acceptance commands

```bash
supabase test db supabase/tests/014_phase_7b_verified_allowlisted_references.test.sql
supabase test db supabase/tests/015_phase_7b_reference_review_boundary.test.sql
supabase test db supabase/tests/016_phase_7b_reference_security_locking.test.sql
pnpm --filter @airdrop/database exec vitest run src/tests/reference-review-repository.integration.test.ts
pnpm --filter @airdrop/database exec vitest run src/tests/reference-security-coupling.integration.test.ts
pnpm --filter @airdrop/worker exec vitest run src/ai/tests/reference-golden.test.ts
pnpm --filter @airdrop/web exec vitest run src/tests/reference-elements.test.ts
```

The same fail-closed preflight as the earlier phases applies: confirm the remote
work directory, project, database/Kong ports `64322`/`64321`, local tunnels
`16432`/`16433`, the paused seed marker, and the migration, test, and seed hashes
before any reset. Never target `airdrop-intelligence-os` or ports
`54321`/`54322`.

### Append-only recovery

Nothing in the ledger is updated in place. To correct a mistaken decision, append
the correcting decision (`reverify`, `withdraw`, `restore`, or an authority
`revoke`/`regrant`) and let the read models re-derive state. Do not delete
reference, authority, decision, flag, or command-receipt rows, and do not edit
history rows to make a mistake disappear — the contradiction must stay visible.
The Golden Dataset (`apps/worker/src/ai/fixtures/reference-golden.ts`) is the
regression net for the extraction boundary: extend it rather than loosening
grounding, and require that at least one mutation targets the implementation
instead of the fixture expectations.

### Production exclusion

Phase 7B is local/disposable-verified only. Its three migrations are not applied
to production, and this runbook authorizes no production operation: no
migration, no role or account creation, no data backfill, and no deployment.
Production rollout remains gated behind reviewer supply, a healthy production
Auth service, a rehearsed pre-migration backup, and explicit authorization.

## Tutorials (Phase 8)

Tutorials teach a user how to act on a participation opportunity. They are a
two-layer record like the reference ledger: a **tutorial candidate** is AI- or
operator-drafted inert material, and a **tutorial** is a published, immutable
version whose outbound links are all resolved through the Phase 7B reference
ledger. AI output may only ever create a candidate; publishing requires a human
decision, and every published version is append-only.

### Candidate generation switch

Generation runs inside the worker as a third orchestration tick, alongside
extraction and scoring. It is opt-in on exactly the same switch as the other AI
stages: with both `AIRDROP_AI_STAGE_DATABASE_URL` and `AI_MODEL_API_KEY` set, the
loop starts; otherwise the worker logs `ai_stage_orchestration_disabled` and
stays in collection-only mode.

```bash
AIRDROP_ORCHESTRATION_TUTORIAL_TICK_MS=600000   # optional, default 600000
```

Per tick the stage selects material per `(project, kind)`:

- **Signals**: `verification in ('verified','corroborated')` **and**
  `lifecycle = 'published'`, restricted to the six participable claim types
  (`airdrop_campaign`, `points_program`, `snapshot_notice`, `task_launch`,
  `token_launch`, `eligibility_rule`). Security and scam signals are coupling
  triggers, never tutorial material. A project whose security posture is
  `blocked` is skipped entirely.
- **Allowlist**: the project's verified, renderable references, read through
  `public_project_references`. The model may only choose ids from this list, and
  a draft is dropped whole if any link id or any cited signal id did not come
  from the prompt (`grounding_failed`) — there is no partial repair.
- **Idempotency**: the material hash is deterministic over project, kind, signal
  ids, and allowlist ids, so a repeated tick with unchanged material never calls
  the model again, and the unique `(project, kind, content_hash)` key makes a
  repeated write a no-op.

Failure classes map onto the existing `ai_runs` vocabulary:
`skipped_no_content` (no participable material), `schema_invalid_after_repair`
(one constrained repair attempt failed), `provider_error`, and
`grounding_failed` (unallowlisted ids).

### Reviewer workflow (`/review/tutorials`)

Canonical writes require an active `reviewer`, `senior_reviewer`, or `admin`
grant; Phase 8 adds no new role value, and the protected commands re-check
`auth.uid()` on every call. Two surfaces share the navigation with the other
review pages:

1. **Candidate queue** — filter by `pending` / `accepted` / `rejected` and open a
   candidate to read the raw draft (rendered inertly) beside an editable step
   list. **Accepting publishes the edited steps, never the raw draft**: step text
   may not contain a URL, and links are ledger reference ids only. Rejecting
   requires a reason code.
2. **Tutorial ledger** — filter by `published` / `needs_review` / `blocked` /
   `retired`, open a tutorial to read its steps, decision history, and status
   event timeline, then either publish a new version (re-approval after a
   demotion) or retire it.

Every mutation is a high-impact command: the UI binds the confirmation checkbox
to the target `{id, expectedVersion}` pair, so editing the form or receiving a
409 clears the confirmation and forces a fresh review of the current state.

### last_verified_at semantics

Two distinct stamps are rendered, and they mean different things:

- **Tutorial-level `last_verified_at`** is the time of the most recent human
  publish or re-publish of the tutorial. It is what the public detail page
  renders as the freshness signal, and it says only that a reviewer approved this
  content at that time — never that the tutorial is currently safe.
- **Link-level `lastVerifiedAt`** comes from the reference ledger: the time of
  that reference's most recent successful `verify` decision. A step link whose
  reference is not currently renderable keeps its place as inert text with
  `renderable: false` and a null url; it must never render as an anchor.

### Security coupling and restoration

Six triggers demote a tutorial, synchronously — there is no background job:

| Trigger | Resulting status |
| --- | --- |
| `project_blocked` | `blocked` |
| `source_blocked` | `needs_review` |
| `reference_unrenderable` | `needs_review` |
| `signal_disputed` | `needs_review` |
| `signal_retracted` | `needs_review` |
| `lifecycle_changed` | `needs_review` |

Only public-facing statuses participate: a `published` tutorial demotes per the
trigger severity, a `needs_review` tutorial escalates only under a security
trigger, and `blocked` / `retired` never change by automation. A `blocked`
tutorial is suppressed in the public projections entirely. Recovery is never
automatic and never an in-place edit: fix the underlying condition, then publish
a **new version** from the review page.

### Stable error codes

The API returns stable domain codes; never branch on human-readable text.

| Code | Meaning | Typical operator action |
| --- | --- | --- |
| `tutorial_reviewer_required` (`AT201`) | No active reviewer grant on the bearer session | Provision or restore the grant |
| `tutorial_not_found` (`AT202`) | Tutorial or candidate ID does not exist for this session | Reload the list |
| `tutorial_not_decidable` (`AT203`) | The current state does not permit the decision (for example accepting a non-pending candidate) | Reload and re-read the state |
| `tutorial_version_conflict` (`AT205`) | `expectedVersion` is stale | Reload and re-confirm; never auto-adopt |
| `tutorial_idempotency_conflict` (`AT207`) | Same `Idempotency-Key` reused with a different body | Generate a fresh key |
| `tutorial_command_invalid` (`AT208`) | Command failed contract validation (steps 2–20, link count, URL-bearing step text, allowlisted ids) | Fix the command payload |
| `tutorial_reference_not_renderable` (`AT210`) | A step link's reference is not currently renderable | Fix the reference state, then retry |
| `tutorial_steps_invalid` (`AT211`) | Steps failed the ledger rules | Correct the steps |
| `tutorial_persistence_failed` (`AT299`) | Transaction failed and rolled back | Retry once; if it persists, inspect the database logs |

### Focused disposable acceptance commands

```bash
supabase test db supabase/tests/017_phase_8_tutorials.test.sql
supabase test db supabase/tests/018_phase_8_tutorial_generation.test.sql
pnpm --filter @airdrop/database exec vitest run src/tests/tutorial-review-repository.integration.test.ts
pnpm --filter @airdrop/worker exec vitest run src/tutorials/tests/generate-candidates.test.ts
pnpm --filter @airdrop/worker exec vitest run src/ai/tests/tutorial-golden.test.ts
pnpm --filter @airdrop/web exec vitest run src/tests/tutorial-review-handlers.test.ts
pnpm --filter @airdrop/web exec vitest run src/tests/public-tutorial.test.ts
```

The same fail-closed preflight as the earlier phases applies: confirm the remote
work directory, project, database/Kong ports `64322`/`64321`, local tunnels
`16432`/`16433`, the paused seed marker, and the migration and test hashes before
any reset. Never target `airdrop-intelligence-os` or ports `54321`/`54322`.

### Append-only recovery

Nothing in the tutorial ledger is updated in place. Publishing always creates a
new immutable version; corrections are new versions, never edits of a published
one. Do not delete candidate, tutorial, version, step-link, decision, command,
or status-event rows, and do not edit history rows to make a contradiction
disappear — the timeline is the audit trail. The Golden Dataset
(`apps/worker/src/ai/fixtures/tutorial-golden.ts`) is the regression net for the
generation boundary: extend it rather than loosening the allowlist or the strict
candidate schema, and require that at least one mutation targets the
implementation instead of the fixture expectations.

### Production exclusion

Phase 8 is local/disposable-verified only. Migrations `20260902000100` (the
tutorial ledger) and `20260902000200` (the generation write boundary) are not
applied to production, and this runbook authorizes no production operation.
Applying them requires the same gates as the earlier phases: a rehearsed
pre-migration backup, a healthy production Auth service, at least one human
reviewer, and explicit authorization — granted once per migration, never implied
by local success. Deploying the web application is a separate, still-outstanding
item.

## Shutdown

Stop the web and worker processes with `Ctrl-C`. The worker treats SIGTERM and SIGINT as a bounded graceful stop: the scheduler stops scanning, the consumer finishes or fences its in-flight job, and every pool closes within 30 seconds. Then stop the local Supabase stack:

```bash
pnpm db:stop
```
