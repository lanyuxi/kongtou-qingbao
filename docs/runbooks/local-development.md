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
4. **Disclosure** — indicator values become public one row at a time through
   `set_indicator_disclosure`, with an explicit version typed by the reviewer.
   The UI never guesses or auto-increments it.
5. High-impact commands require ticking an affirmative confirmation bound to the
   authoritative aggregate version. Editing any command field, or a `409`
   conflict, clears the confirmation rather than silently adopting the newer
   version.

### Stable error codes

The API returns stable domain codes; never branch on human-readable text.

| Code | Meaning | Typical operator action |
| --- | --- | --- |
| `security_candidate_not_found` (`AS101`) | Candidate ID does not exist or is not visible to this session | Reload the queue |
| `security_candidate_not_reviewable` (`AS102`) | Candidate already decided | Reload, do not resubmit |
| `security_incident_not_found` (`AS103`) | Incident ID does not exist or is not visible | Reload the incident list |
| `security_reviewer_required` (`AS104`) | Caller lacks an active `security_reviewer` / `admin` grant | Provision or restore the grant, then sign in again |
| `security_indicator_not_found` (`AS105`) | Indicator ID does not exist | Reload the incident detail |
| `security_version_conflict` (`AS106`) | `expected_version` is stale | Reload and re-confirm; never auto-adopt the new version |
| `security_idempotency_conflict` (`AS107`) | Same `Idempotency-Key` reused with a different body | Generate a fresh key |
| `security_command_invalid` (`AS108`) | Command failed contract or reason/state validation | Fix the command payload |
| `security_target_mismatch` (`AS109`) | Target does not match the incident scope | Re-select the target |
| `security_review_required` (`AS111`) | Ordinary Promotion needs a security reviewer for a `caution` target | Escalate to a security reviewer |
| `security_promotion_blocked` (`AS112`) | Target is `blocked`; no canonical intelligence may pass | Resolve or adjust the incident first |
| `security_persistence_failed` (`AS199`) | Transaction failed and rolled back | Retry once; if it persists, inspect the database logs |

### Blocked-source queue behaviour

A `blocked` source stops entering new collection, extraction, and ordinary
Promotion, and its Evidence stops counting toward public validity. The queue
cancels in-flight jobs with a typed `security_blocked` terminal state and does
**not** retry them; cancelling is not a failure to be retried. Its already
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

### Production exclusion

Phase 7A is local/disposable-verified only. Its migration is not applied to
production, and this runbook authorizes no production operation: no migration,
no role or account creation, no data backfill, and no deployment. Production
rollout remains gated behind reviewer supply, a healthy production Auth service,
a rehearsed pre-migration backup, and explicit authorization.

## Shutdown

Stop the web and worker processes with `Ctrl-C`. The worker treats SIGTERM and SIGINT as a bounded graceful stop: the scheduler stops scanning, the consumer finishes or fences its in-flight job, and every pool closes within 30 seconds. Then stop the local Supabase stack:

```bash
pnpm db:stop
```
