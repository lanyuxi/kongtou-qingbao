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
5. RESOLVED 2026-09-03 (migration 29): the score-evidence projections used to
   take ~2s per anonymous read on production. Root cause and fix below. Root
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
   - Applied fix (option 1): migration 29 adds `list_public_score_factors` and
     `list_public_score_evidence_citations`, security-definer wrappers that run
     the unchanged views as the view owner. The views keep their row gate; only
     the executing role changes, which removes the RLS layer. The repository
     also collapsed its count-probe-plus-paging loop into one call.
   - Measured on production after the fix: citations **1.9s -> 0.90s**, factors
     **0.06s**; the project detail page renders both sections again in ~1.3s.
   - Remaining headroom (optional, not urgent): the per-row helper call is
     still there because a SECURITY DEFINER SQL function cannot be inlined.
     Rewriting `current_score_citation_path_is_public` into plain join
     predicates should reach ~0.15s, but it duplicates the security logic and
     needs its own equivalence test on production-sized data — do not attempt
     without seed data that exercises the path.

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

## Identity and private data (Phase 9)

Identity gives a real end user a sign-in and a block of **private rows** that
only they can see: their profile and their public wallet addresses. It also
establishes the `user_id = auth.uid()` RLS pattern that Execution (tasks,
watchlists) and Notification will reuse, so those domains must not redesign
authorization.

Three rules are absolute and are enforced in more than one layer:

1. **Only public wallet addresses are stored.** No interface, table, or log may
   carry a private key, seed phrase, keystore, wallet password, or signing
   secret. The contract layer rejects any secret-shaped field outright rather
   than silently dropping it, because a sender that emits one is an incident
   rather than a formatting problem.
2. **Private rows belong to their user.** Anonymous visitors see only what D4
   allows to be public, and only through the public read projections.
3. **Roles are never self-service.** `user_roles` writes stay on the existing
   administrative path; profile and wallet changes never affect a grant.

### Decided scope (D1–D6)

| Decision | Value |
| --- | --- |
| D1 Sign-in method | Email magic link only |
| D2 Self-service sign-up | Open; sign-up creates a profile |
| D3 Wallet scope | EVM public addresses only (`0x` + 40 hex), maximum 5 |
| D4 Address visibility | Default `hidden`; the user publishes an address explicitly |
| D5 Profile bootstrap | Upsert on sign-in, with an `auth.users` trigger as the backstop |
| D6 First-version scope | Sign-in, sign-out, session, profile, wallet addresses |

Anything outside D6 — watchlists, tasks, notification preferences, third-party
OAuth, MFA, teams, and every form of wallet connection or chain interaction — is
explicitly out of scope.

### Sign-in, callback, and sign-out

`/settings/profile` and `/settings/wallets` are the private surfaces. When a
private query answers `identity_session_required`, the page redirects to
`/auth/sign-in?next=…` and the intended path rides along as the pending action;
after the callback succeeds the user lands back where they started. Sign-out
lives in a session bar rendered by both settings pages and returns to a public
page only once the session is actually cleared, so a failed sign-out never looks
like a completed one.

The `IdentityAuthPort` deliberately exposes **no password credential method**.
End-user sign-in is magic-link only, and a test pins the controller to exactly
three entry points, so a password path cannot be added without failing the
suite.

The `next` parameter is sanitized before use. It must be a same-origin absolute
path: protocol-relative (`//host`), backslash (`/\host`), absolute URLs,
`javascript:` values, and control characters all fall back to
`/settings/profile`, and a `next` pointing back into `/auth/*` is rejected so
the flow cannot loop on itself.

#### Never exchange the PKCE code explicitly

This is the one trap in the flow. `createBrowserSupabaseClient` sets
`detectSessionInUrl: true`, so `@supabase/auth-js` consumes the `?code=` on the
callback URL during `getSession()` — it happens inside `_initialize()`. A PKCE
code is **single use**, so an explicit `exchangeCodeForSession(code)` alongside
that is a second attempt with an already-consumed code and fails every time.

The callback therefore does two things and nothing more:

1. Reject the callback outright when the provider redirects back with `error`,
   `error_code`, or `error_description` parameters. Failing here first matters —
   otherwise a stale local session can be mistaken for a successful sign-in on
   an expired link.
2. Otherwise resolve the outcome with `getSession()` and let the client library
   own the exchange.

If a deployment ever needs a different GoTrue link format, change this one
place rather than adding a second exchange path.

### Command boundary

Migration 31 closes the write path. Browser roles lose `insert`, `update`,
`delete`, and `truncate` on all five Identity tables, and a
`reject_identity_ledger_mutation()` trigger backs the revoke. Every write goes
through one of four mutation functions, granted to `authenticated` only:

| Function | Purpose |
| --- | --- |
| `submit_update_profile(jsonb)` | Display name, avatar URL, timezone |
| `submit_add_wallet_address(jsonb)` | Add an EVM address, default `hidden` |
| `submit_set_wallet_address_visibility(jsonb)` | Publish or hide one address |
| `submit_remove_wallet_address(jsonb)` | Remove one address |

Reads go through four projections. `get_my_identity_profile()` and
`list_my_wallet_addresses()` are `authenticated`-only;
`get_public_identity_profile(uuid)` and
`list_public_identity_wallet_addresses(uuid)` are granted to `anon` and
`authenticated` and return only the D4-allowed fields. The public projection is
a **separate schema**, not a filtered copy of the private row, so adding a
column to the private row never publishes it by accident.

### Four-role authorization matrix

Verified by pgTAP `supabase/tests/021_phase_9_identity.test.sql` (91
assertions) across `anon`, `authenticated`, `service_role`, and
`ai_stage_worker`:

| Surface | Anonymous | Owner | Other signed-in user | No session / expired |
| --- | --- | --- | --- | --- |
| Read own private rows | n/a | Allowed through the private read functions | n/a | Denied — `ID201` |
| Read another user's private rows | Denied | Denied by RLS | Denied by RLS | Denied — `ID201` |
| Write profile or addresses | Denied (`42501`) | Allowed through the four mutation functions | Denied for the other user's rows | Denied — `ID201` |
| Direct table DML on the five ledger tables | Denied | Denied — revoked plus the rejection trigger | Denied | Denied |
| Append to the event tables | Denied | Denied — only the commands append | Denied | Denied |
| Public profile and public addresses | Allowed | Allowed | Allowed | Allowed |

Expired and absent sessions are the same case to the database: PostgREST sees an
anonymous caller and the BFF fails closed with `401` and `identity_session_required`
instead of guessing an identity.

### Stable error codes

The API returns stable domain codes; never branch on human-readable text.

| Code | Meaning | Typical operator action |
| --- | --- | --- |
| `identity_session_required` (`ID201`) | No valid session on the bearer token | Sign in again; the pending action is preserved |
| `identity_profile_not_found` (`ID202`) | Profile row missing for this user | Trigger the D5 backstop, then reload |
| `identity_address_invalid` (`ID203`) | Address failed the EVM format or chain check | Correct the value |
| `identity_address_duplicate` (`ID204`) | The same address already exists for this user | Reuse the existing record |
| `identity_address_limit_reached` (`ID205`) | Already at the D3 maximum of five | Remove one before adding |
| `identity_version_conflict` (`ID206`) | `expectedVersion` is stale | Reload and re-confirm; never auto-adopt the new version |
| `identity_idempotency_conflict` (`ID207`) | Same `Idempotency-Key` reused with a different body | Generate a fresh key |
| `identity_command_invalid` (`ID208`) | Command failed contract or state validation | Fix the command payload |
| `identity_persistence_failed` (`ID299`) | Transaction failed and rolled back | Retry once; if it persists, inspect the database logs |

Query failures fall back to `identity_query_failed` and mutation failures to
`identity_persistence_failed`; the two are never interchangeable.

### Focused disposable acceptance commands

```bash
supabase test db supabase/tests/021_phase_9_identity.test.sql
pnpm --filter @airdrop/database exec vitest run src/tests/identity-command-boundary.integration.test.ts
pnpm --filter @airdrop/web exec vitest run src/tests/identity-handlers.test.ts
pnpm --filter @airdrop/web exec vitest run src/tests/identity-api-client.test.ts
pnpm --filter @airdrop/web exec vitest run src/tests/identity-auth-flow.test.ts
pnpm --filter @airdrop/web exec vitest run src/tests/identity-settings-components.test.ts
```

The same fail-closed preflight as the earlier phases applies: confirm the remote
work directory, project, database/Kong ports `64322`/`64321`, local tunnels
`16432`/`16433`, the paused seed marker, and the migration, test, and seed hashes
before any reset. Never target `airdrop-intelligence-os` or ports
`54321`/`54322`. After an Identity run, the cleanup assertion must return the
fixture ledger to its baseline with no residual profile events, wallet events,
or outbox rows.

### Append-only recovery

Nothing in the Identity ledger is updated in place. Address removal keeps the
event row with a forced `chain`/`address`/`version` snapshot, profile changes
append to `identity_profile_events`, and every command writes a receipt and an
outbox event in the same transaction. Do not delete receipt, event, or outbox
rows and do not edit history rows to make a mistake disappear — the
contradiction must stay visible. A corrected profile is a new version reached
through `submit_update_profile`, never an edit of an old one.

### Production exclusion and rollout gates

Phase 9 is local/disposable-verified only. Migrations `20260903000200` (the
Identity ledger) and `20260904000100` (the command boundary) are **not applied to
production**, and this runbook authorizes no production operation.

Before an Identity rollout can even be considered, all of the following must hold:

1. **`GOTRUE_SITE_URL` points at the public origin.** It is currently
   `http://127.0.0.1:3000`, which is the container's own view. Left unchanged,
   every magic link sends the user back to their own machine and sign-in is
   impossible.
2. **SMTP is confirmed end to end** — `GOTRUE_EXTERNAL_EMAIL_ENABLED`,
   `GOTRUE_MAILER_AUTOCONFIRM`, and `GOTRUE_SMTP_HOST` are set, and a real link
   has been delivered.
3. **The production Auth service is healthy** (`/auth/v1/health` returns 200).
4. **A pre-migration backup exists and a restore has been rehearsed.**
5. **Explicit authorization is granted once per migration**, never implied by
   local success.

Apply in order, one migration at a time, following the Phase 6A stdin pattern:

```bash
ssh … "docker exec -i supabase_db_airdrop-intelligence-os psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
  < supabase/migrations/20260903000200_phase_9_identity.sql
ssh … "docker exec -i supabase_db_airdrop-intelligence-os psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
  < supabase/migrations/20260904000100_phase_9_identity_command_boundary.sql
```

Register each applied migration with a row in
`supabase_migrations.schema_migrations(version, statements, name)`, then verify:
the new tables exist and are empty, REST and Auth are healthy, both public
projections return without error, and `auth.users` is intact.

Deploying the web application remains a separate, still-outstanding item —
production currently serves only the static site, so an applied migration alone
does not put this flow in front of users.

## Execution: tasks, watchlists, and participation (Phase 10)

Execution is where a signed-in user turns a public opportunity into private
work: tasks, watchlists, and a per-project participation state. It reuses the
Identity `user_id = auth.uid()` pattern and adds **receipt-first commands** —
every write goes through a `SECURITY DEFINER` command that checks the caller,
records a receipt, and emits an outbox event in the same transaction. Browser
roles can no longer write the four Execution tables directly.

Three rules are absolute and are enforced in more than one layer:

1. **No secret-shaped field ever enters the domain.** The contract rejects
   key-like fields outright rather than silently dropping them, both at the
   browser boundary and again inside database command validation.
2. **Every row belongs to its user.** Reads are owner-scoped, and a resource that
   is not the caller's reports *not found* rather than *forbidden*, so the API
   never confirms that it exists.
3. **History is append-only.** Task events, command receipts, and outbox rows are
   never updated or deleted in place.

### Decided scope (D1–D9)

| Decision | Value |
| --- | --- |
| D1 Command boundary | Hardened, aligned with Phase 9: revoke direct writes, receipt-first commands, exact replay |
| D2 First-version scope | Tasks + watchlists + participation, all three |
| D3 Default watchlist | Created automatically (profile insert trigger, with a backfill for existing profiles) |
| D4 Limits | 20 watchlists · 200 projects per watchlist · 500 tasks |
| D5 Task history | Append-only `user_task_events` |
| D6 Tasks without a project | Allowed (`project_id` is nullable) |
| D7 UI surfaces | `/tasks`, `/watchlists`, and the project detail page toggle |
| D8 Notification coupling | Outbox events only; no delivery |
| D9 Error-code range | `EX2xx` |

### Command surface

Nine commands take a single `jsonb` payload and are executable by
`authenticated` only: `submit_create_task`, `submit_update_task`,
`submit_delete_task`, `submit_create_watchlist`, `submit_rename_watchlist`,
`submit_delete_watchlist`, `submit_add_watchlist_project`,
`submit_remove_watchlist_project`, `submit_set_participation_status`. Four
owner-scoped reads back them: `list_my_execution_tasks`, `list_my_watchlists`,
`list_my_watchlist_projects`, `get_my_participation`.

Two boundaries are easy to get wrong:

- **Creation still travels with `expectedVersion: 1`.** The command envelope is
  always complete: the browser validates the draft against a strict shape that
  omits the envelope, and the client completes it. Validating a draft against
  the full envelope rejects every creation before it ever leaves the browser.
- **Participation is a real optimistic lock.** A fresh row accepts
  `expectedVersion` 1; an existing row requires the version the projection
  reported. That is why `get_my_participation` returns `version` (migration
  `20260906000200`) — without it a second update could never be built.

The default watchlist is named `默认关注`, is created with `is_default = true` at
version 1 by the `execution_default_watchlist_bootstrap` trigger on `profiles`
insert, and was backfilled once for every profile that already existed. It has
no delete affordance anywhere in the UI.

### Error codes (EX2xx)

| Code | HTTP | Meaning |
| --- | --- | --- |
| `execution_session_required` | 401 | No active session |
| `execution_task_not_found` | 404 | Task missing, or not the caller's |
| `execution_watchlist_not_found` | 404 | Watchlist missing, or not the caller's |
| `execution_project_not_found` | 404 | Project missing — participation commands check this **before** the lock |
| `execution_task_limit_reached` | 409 | 500 tasks |
| `execution_watchlist_limit_reached` | 409 | 20 watchlists |
| `execution_watchlist_project_limit_reached` | 409 | 200 projects in one watchlist |
| `execution_name_conflict` | 409 | Watchlist name already used by this user |
| `execution_version_conflict` | 409 | Stale `expectedVersion` |
| `execution_idempotency_conflict` | 409 | Reused key with different input |
| `execution_command_invalid` | 400 | Malformed payload, or a secret-shaped field |
| `execution_query_failed` | 500 | Read fallback — never mixed with the write fallback |
| `execution_persistence_failed` | 500 | Write fallback |

### Focused tests

```bash
pnpm --filter @airdrop/database exec vitest run src/tests/execution-repositories.test.ts
pnpm --filter @airdrop/web exec vitest run src/tests/execution-api-client.test.ts \
  src/tests/execution-task-ui.test.ts src/tests/execution-watchlist-ui.test.ts \
  src/tests/execution-project-panel.test.ts
```

The pgTAP suite `supabase/tests/022_phase_10_execution.test.sql` (plan 73)
covers the four-role matrix, direct-write denial, exact command replay, the
limits, default-list protection, and the participation optimistic lock.

Integration tests need the disposable tunnel:

- Pre-flight compares the local and disposable migration, test, and seed hashes
  and refuses to continue unless the disposable is the target.
- The tunnel forwards `16432` (database) and `16433` (API). Unset
  `HTTP_PROXY`/`HTTPS_PROXY` for the run — a local proxy intercepts localhost.
- Integration variables are derived on the disposable host: the password from the
  database container, and the anon key from `/home/kong/kong.yml`, selecting the
  JWT whose payload role is `anon`. Write them to a `0600` file, copy it down,
  delete the remote copy immediately, and delete the local file when finished.

### Append-only recovery

Task changes append to `user_task_events`, every command writes exactly one
receipt and one outbox event, and history rows are never edited to make a
mistake disappear. The participation read was repaired **forward-only** by
dropping and recreating the function — a `create or replace` cannot change a
return type — rather than by editing the earlier migration.

### Rollout status and remaining gates

Migrations `20260906000100` (the command boundary) and `20260906000200` (the
participation projection version) **are applied to production** (2026-09-09),
each after a rollback dry run and each registered in
`supabase_migrations.schema_migrations`. Pre-migration backup:
`/root/backups/prod-pre-phase10-20260909.sql`.

Two facts remain and must be resolved before more of Phase 10 — or Phase 9 — is
rolled forward:

1. **The production version sequence has a gap.** Phase 9's `20260903000200` and
   `20260904000100` are still unapplied, so production jumped from 29 straight to
   32/33. Execution does not depend on them — every object migration 32
   references comes from an earlier migration — but the gap is real and should be
   closed deliberately, subject to the Phase 9 gates.
2. **`GOTRUE_SITE_URL` still points at `http://127.0.0.1:3000`.** That is the
   standing Phase 9 blocker: magic links would send a user back to their own
   machine.

Deploying the web application remains a separate, outstanding item — production
serves only the static site, so an applied migration alone does not put `/tasks`
or `/watchlists` in front of users.

## JSON API collection (Phase 16)

The collector understands one more content shape: a structured JSON API response.
It exists because Feed sources ran out — every publicly reachable airdrop RSS
feed is already registered, and the remaining backlog carries no opportunities —
so the next way to widen the intake is a different data shape, not another feed.

A JSON source is collected exactly like a Feed: the raw body is stored verbatim
in `raw_items` (`content_kind = 'json_api'`) as the evidence base, and the entries
an adapter derives from it become `discovered_items`. Because a JSON entry has no
article body of its own, every one of them is `discovered_only` — the collector
never fetches a URL for a JSON entry, so one source costs exactly one request per
pass. Downstream nothing changes: extraction reads the discovery summary, and
publication writes evidence with `source_field = 'discovered_summary'` against
`discovered_items.feed_raw_item_id`.

### Adapters are an allowlist, and they fail closed

`selectJsonApiAdapter(canonicalUrl)` in `packages/domain/src/collection/json-api-adapter.ts`
maps a source's **configured** URL to a pure parsing function. An unregistered
JSON source is rejected with `unsupported_content_type`; it is never interpreted
on a guess. Adding a JSON source is therefore a code change plus a deployment —
deliberate, because every API has its own field names and an unknown payload must
never be mapped onto a project fact.

Registered today:

| Adapter id | Source URL | Entry |
|---|---|---|
| `defillama-chain-tvl:<chain>` | `https://api.llama.fi/v2/historicalChainTvl/<chain>` | Latest chain TVL, quoted in the summary |

One source **per chain**, not one global `/v2/chains` source. The chain lives in
the URL, so the adapter needs no project context and the collector's
per-(project, source) model is preserved without widening
`load_source_collection_context()`.

### The body-fetch budget is one number in three places

`MAX_COLLECTION_BODY_FETCHES` in `packages/contracts/src/collection/source-collection.ts`
is the single source of truth. It bounds the collector's own `MAX_ARTICLE_FETCHES`
(which imports it), the result schema's `bodyFetchCount`, and — through
`collection_attempts_body_fetch_count_valid` — the database. Keep them equal.

This is not bookkeeping. When the collector's budget was raised to 35 and the
other two stayed at 20, any feed publishing more than 20 new entries in one cycle
produced a result that failed strict parsing and a row the constraint rejected, so
`commitFeed` rolled back and the entire batch was lost with the attempt recorded
as `persistence_failed`.

### Registering a JSON source

There is no source-registration UI; sources are inserted directly. `sources.canonical_url`
is unique, so each chain gets its own row.

```sql
-- 1. The source itself. `collectable` is the operational gate; it is separate
--    from project_sources.is_official, which is an authority judgement.
insert into public.sources (source_type, name, canonical_url, status, collectable)
values
  ('chain_explorer', 'DeFiLlama — Ethereum chain TVL',
   'https://api.llama.fi/v2/historicalChainTvl/ethereum', 'active', true)
on conflict (canonical_url) do nothing;

-- 2. The (project, source) pairing. authority_domains is the collector's
--    allowlist, and verified_at/verified_by are NOT relaxed: a human vouched
--    for this pairing. This is what is_source_collection_eligible() checks.
insert into public.project_sources (
  project_id, source_id, authority_domains, is_official, verified_at, verified_by
)
select project.id, source.id, array['api.llama.fi'], false, now(), profile.id
from public.projects as project
join public.sources as source
  on source.canonical_url = 'https://api.llama.fi/v2/historicalChainTvl/ethereum'
cross join lateral (
  select id from public.profiles order by created_at limit 1
) as profile
where project.slug = 'ethereum'
on conflict (project_id, source_id) do nothing;

-- 3. A schedule. Automatic schedule creation still only covers a project's own
--    official channels, so a curated source is enrolled explicitly.
insert into public.source_collection_schedules (project_id, source_id, interval_seconds, enabled)
select project_source.project_id, project_source.source_id, 43200, true
from public.project_sources as project_source
join public.sources as source on source.id = project_source.source_id
where source.canonical_url = 'https://api.llama.fi/v2/historicalChainTvl/ethereum'
on conflict (project_id, source_id) do nothing;
```

Adjust the `slug` and the chain in the URL per project. Verify the enrolment with
`select public.is_source_collection_eligible(project_id, source_id)` — it must be
true before the scheduler will enqueue anything.

### What the phase deliberately does not do

`DeFiLlama /hacks` and `/protocols` are **not** registered. Hacks are a security
signal and belong in the Phase 7A security ledger, not the generic extraction
pipeline; protocols need a reliable name-to-project match that does not exist yet.
DeFiLlama also has no airdrop listing endpoint (`/airdrops` and friends are 404),
so chain TVL is ecosystem context and freshness, not a source of new opportunities.

### Focused tests

```bash
pnpm --filter @airdrop/domain exec vitest run src/collection
pnpm --filter @airdrop/contracts exec vitest run src/collection
pnpm --filter @airdrop/worker exec vitest run src/collection/tests/collect-source.test.ts
```

### Disposable acceptance commands

Migrations 43 (`20260911000100_phase_16_collection_body_fetch_budget`) and 44
(`20260911000200_phase_16_json_api_collection`) must be applied to the disposable
stack before pgTAP can pass, then:

```bash
pnpm --filter @airdrop/database exec supabase test db   # includes 023
```

The JSON path's end-to-end behaviour is only proven against a real database: the
in-memory suite covers parsing, fail-closed selection and zero article fetches,
but not the `json_api` enum value, the widened check constraint, or the
`discovered_summary` evidence path.

### Rollout status and remaining gates

**Both migrations are applied to the cloud database** (44 migrations; 2026-09-11,
owner-authorized): `collection_content_kind` now carries `json_api` and the
constraint reads `body_fetch_count between 0 and 35`. Verified with rolled-back
transactional probes — `raw_items` accepts `json_api`, the budget accepts 35 and
rejects 36 — with zero probe residue and an unchanged data baseline.

**The three sources are registered and eligible** (owner-authorized): one per
chain, 12-hour schedule, `enablement_origin = 'manual'`, `verified_by` set to the
owner's real profile. `is_source_collection_eligible` returns true for all three.

**`pgtap` is installed** on the cloud project (owner-authorized), so the suite can
be executed there. Read the result carefully: **the suite is written for a fresh
disposable stack and cannot pass against live production.** `023` (this phase)
passes 3/3 and `022` passes 73/73, but 12 files fail and 3 abort, all for
pre-existing environmental reasons:

- the four worker roles are `rolcanlogin = true` (Phase 12, so they can reach the
  pooler) while remaining least-privilege — `rolsuper`, `rolbypassrls`,
  `rolcreatedb`, `rolcreaterole` are all false — so 008's "non-login" assertion
  fails while its security intent holds;
- Phase 14 deliberately granted EXECUTE schema-wide to `ai_stage_worker`, so the
  "executable only by X" assertions in 010, 011 and 021 fail;
- production holds real data, not the seed fixtures, so 006, 007 and 012 fail;
- 009, 019 and 020 use psql meta-commands that cannot travel over the wire
  protocol, and some heavier files hit the cloud statement timeout.

Do not "fix" these by narrowing production grants or reverting the login flag:
both were deliberate deployment decisions, and doing so would break the worker.

**Still outstanding:**

1. **Deploying the web app.** This machine has no Vercel credential, so the
   deployed build is still the 2026-09-03 one — and its
   `parseCollectionMediaType` rejects `application/json`. Until it is rebuilt and
   redeployed, the registered JSON sources will fail gracefully with
   `unsupported_content_type` on every pass (no bad rows, but no data either).
2. **End-to-end confirmation.** After the redeploy, one collection pass should
   show `content_kind = 'json_api'`, `disposition = 'discovered_only'`, zero
   article fetches, and evidence via `discovered_summary`.

The enum value is purely additive, so a code-only rollback leaves it inert. To
undo migration 43, drop `collection_attempts_body_fetch_count_valid` and recreate
it as `check (body_fetch_count between 0 and 20)`. To undo the registrations,
delete the three `source_collection_schedules`, then the three
`project_sources`, then the three `sources` (in that order — the foreign keys
are `ON DELETE RESTRICT`).

## Shutdown

Stop the web and worker processes with `Ctrl-C`. The worker treats SIGTERM and SIGINT as a bounded graceful stop: the scheduler stops scanning, the consumer finishes or fences its in-flight job, and every pool closes within 30 seconds. Then stop the local Supabase stack:

```bash
pnpm db:stop
```
