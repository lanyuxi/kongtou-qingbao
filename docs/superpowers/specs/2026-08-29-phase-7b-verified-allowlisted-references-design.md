# Phase 7B Verified Allowlisted References — Design

**Date:** 2026-08-29
**Status:** Approved
**Scope:** Local modular-monolith implementation of the canonical reference ledger, verification workflow, security coupling to Phase 7A, reviewer UI, and public link resolution

## 1. Goal

Add a canonical, append-only reference ledger so that **every user-visible official link is resolved from a verified allowlisted reference**. The ledger must let an active reviewer or admin turn grounded Evidence into append-only canonical domain authorities and URL references, expose `last_verified_at`, and synchronously stop rendering a link the moment its reference is flagged, withdrawn, or its domain authority is revoked.

This is the last prerequisite before tutorials. `AGENTS.md` requires tutorials to expose `last_verified_at`, to use allowlisted link references, and to become `needs_review` or `blocked` when their source, contract, or security state changes. None of that is expressible today because **no canonical reference object exists**.

Phase 7B must preserve five separations:

1. Reference verification is independent from source reputation, source status, and project lifecycle.
2. Reference state is independent from opportunity, risk, confidence, and score recommendation.
3. AI and collectors produce candidate references only; they never create canonical verification.
4. Internal verification notes and Evidence locators are separate from public link rendering.
5. **A verified domain does not verify every URL beneath it.** Domain authority and URL entries are separate objects with separate decisions.

Phase 7B is complete only when the database boundary, application paths, reviewer workflow, public link behavior, authorization matrix, and security coupling are proven together. A schema-only slice is not sufficient.

## 2. Approved Product Decisions

- **Two-level model.** `project_domain_authorities` establishes that a normalized domain belongs to the project; `project_references` registers a specific normalized URL under a kind. Both are canonical, both are append-only, and neither implies the other.
- **Reuse existing roles.** Active `reviewer`, `senior_reviewer`, or `admin` grants may register and decide references. No new `app_role` value is introduced.
- **Keep `projects.official_website_url` as Catalog data, but link rendering requires a verified reference.** The column remains a stored lead; the page renders a clickable link only when a `verified` reference matches its normalized URL. Otherwise it renders inert text marked as unverified, satisfying the `AGENTS.md` rule that flags any user-visible official link not resolved from a verified allowlisted reference.
- **Security coupling is protect-first with human restoration.** When a Phase 7A indicator matches a reference's normalized domain or URL, the reference is automatically `flagged`, which removes it from public link rendering. A human may restore it only by appending a new verification decision grounded in Evidence. The flag and its release both remain in history.
- **Append-only decisions; current state is derived.** A reference's current state is the latest decision's resulting state. `last_verified_at` is derived from the most recent successful verify/reverify decision, never from the registration time and never from a mutable column.
- **Verification requires Evidence → Raw Item → Source grounding.** A verify decision must reference an existing Evidence row. Unverified registration is allowed as a `candidate` but is never publicly rendered.
- **Public read models expose only `verified` references**, with kind, label, normalized URL, and `last_verified_at`. They never expose Evidence locators, notes, actor identity, or candidate rows.
- **No contract addresses in Phase 7B.** Contract verification needs chain-canonical rules, proxy/multisig handling, and per-chain normalization; it is deferred to its own phase rather than smuggled into the URL model.
- **No automatic ownership proof.** No DNS/TXT challenge, WHOIS lookup, or third-party attestation in this phase. Authority is a reviewer decision grounded in Evidence, and the design deliberately does not claim cryptographic proof of ownership.
- **Deliver a full reviewer and public vertical slice.** A CLI may support operations but is not the primary review interface.

## 3. Non-Goals

- No tutorials, tutorial generation, or tutorial invalidation. That is the phase immediately after this one.
- No contract, token, or chain-object verification.
- No automatic domain ownership proof and no claim that any value is "chain-canonical" or "cryptographically verified".
- No AI-created canonical reference, domain authority, or verification decision.
- No mutation of `sources.reputation_score`, `sources.status`, `project_sources.is_official`, project lifecycle, score values, or score history.
- No automatic reachability/uptime/content-diff checking as a *verification input*. It may appear later as a review-queue aid, never as the authority that verifies a reference.
- No redefinition of Phase 7A semantics. Phase 7B consumes Phase 7A posture and indicators read-only.
- No WebSocket or real-time push channel.
- No production database access, migration application, deployment, or rollout.

## 4. Existing State and Required Integration Points

| Asset | Current shape | Consequence for Phase 7B |
| --- | --- | --- |
| `public.sources` | `canonical_url` (HTTPS, unique), `source_type`, `status`, `reputation_score` | The source root URL already exists, but a source is not a link a user follows. Phase 7B registers *actionable* URLs and does not redefine sources. |
| `public.project_sources` | `authority_domains text[]`, `is_official`, `verified_at`, `verified_by` | This is a **source-level** authority notion with no history and no per-URL granularity. Phase 7B supersedes it for link rendering but does not delete it; a later migration may reconcile the two, which is out of scope here. |
| `public.projects.official_website_url` | Nullable HTTPS URL, no verification, no history | Becomes a stored lead only. Rendering is gated by the ledger. |
| `public.evidence` → `source_id` / `raw_item_id` / `discovered_item_id` | Canonical Evidence chain from Phase 6A | Verification decisions must reference an `evidence.id`, inheriting the Evidence → Raw Item → Source traceability the product already requires. |
| Phase 7A ledger | `security_indicators` (`domain`, `url`, …), `security_incidents`, `current_security_target_posture()` | Source of the automatic flag. Phase 7B reads it through dedicated functions and never writes to it. |
| `public.app_role` | `user`, `reviewer`, `senior_reviewer`, `security_reviewer`, `admin` | `reviewer`/`senior_reviewer`/`admin` are reused; no new enum value. |
| `outbox_events` | Versioned, allowlist-gated, transactional | Phase 7B adds reference event types under the same exact-allowlist discipline. |
| Protected-command pattern | `promotion_service` owner, `auth.uid()` attribution, stable `AR1xx`/`AS1xx` codes | Phase 7B reuses the identical pattern with its own `AR2xx` band. |

## 5. Trust Boundaries and Invariants

1. **Only a `verified` reference may become a user-visible link.** `candidate`, `flagged`, and `withdrawn` states are never rendered as anchors.
2. **Domain authority does not imply URL verification.** A URL entry requires its own decision even under a granted domain; this is what prevents "official domain, forged path" attacks.
3. **Nothing is deleted.** Withdraw, revoke, flag, and restore are appended decisions. History stays visible.
4. **A security flag outranks `verified` until a human restores it.** Rendering reads the derived state, not the last verification, so a flag takes effect without a background job.
5. **Verification must ground in Evidence.** A verify decision without an `evidence_id` is rejected at the command boundary.
6. **No network call inside a verification transaction.** No DNS, HTTP, or chain lookup occurs while a decision transaction is open.
7. **Normalization is deterministic and shared.** Domain normalization (lowercase, strip port, strip trailing dot, punycode-safe bounds) and URL normalization (scheme/host lowercase, default-port removal, fragment removal, empty-path normalization) are single functions reused by registration, matching, and the Phase 7A coupling, so a value cannot verify under one form and be flagged under another.
8. **Rendering never activates a URL-shaped value from an untrusted payload.** Reference URLs are rendered as anchored links only from the canonical row; candidate payload text is inert.

## 6. Shared Contracts

`packages/contracts/src/references/` owns every schema, enum, command, projection, cursor, error, and event type. All schemas are `strictObject` with explicit nullable fields and are exported through `packages/contracts/src/index.ts`.

**Enums**

```
reference_kind          = official_site | official_docs | claim_portal | app_entry |
                          official_social | code_repository | announcement | other
reference_state         = candidate | verified | flagged | withdrawn
domain_authority_state  = candidate | granted | revoked
reference_decision      = register | verify | reverify | restore | withdraw
domain_authority_decision = register | grant | revoke | regrant
reference_reason_code   = evidence_verified | official_announcement | corroborated_source |
                          ownership_unproven | domain_mismatch | duplicate_reference |
                          source_no_longer_official | security_flag_cleared |
                          withdrawn_by_reviewer | insufficient_context
reference_error_code    = reference_reviewer_required | reference_not_found |
                          reference_not_decidable | domain_authority_not_found |
                          reference_version_conflict | reference_idempotency_conflict |
                          reference_command_invalid | reference_evidence_required |
                          reference_normalization_invalid | reference_persistence_failed
```

**Commands** (all versioned `1`, all require `Idempotency-Key`, mutable aggregates require `expected_version`):

- `register_domain_authority` — `{ projectId, domain, evidenceId, note }`
- `decide_domain_authority` — `{ authorityId, expectedVersion, decision, reasonCode, evidenceId, note }`
- `register_reference` — `{ projectId, kind, url, label, evidenceId, note }`
- `decide_reference` — `{ referenceId, expectedVersion, decision, reasonCode, evidenceId, note }`

**Projections:** internal reviewer read models (authority detail/history, reference detail/history, per-project state) and public read models (verified references only, granted domains only). Out-of-band types: `reference.registered.v1`, `reference.decided.v1`, `domain_authority.decided.v1`, `reference.security_flagged.v1`.

## 7. Database Model

Five append-only tables plus three views, in one forward-only migration.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `project_domain_authorities` | Canonical current row per `(project_id, normalized_domain)` | `id`, `project_id`, `normalized_domain`, `version` |
| `project_domain_authority_decisions` | Append-only authority history | `authority_id`, `decision`, `resulting_state`, `reason_code`, `evidence_id`, `actor_user_id`, `idempotency_key`, `created_at` |
| `project_references` | Canonical current row per `(project_id, normalized_url)` | `id`, `project_id`, `kind`, `normalized_url`, `normalized_domain`, `label`, `version` |
| `project_reference_decisions` | Append-only reference history | `reference_id`, `decision`, `resulting_state`, `reason_code`, `evidence_id`, `actor_user_id`, `idempotency_key`, `created_at` |
| `reference_security_flags` | Phase 7A coupling, append-only with release | `reference_id`, `indicator_id`, `created_at`, `released_at`, `released_by`, `release_evidence_id` |

Derived state rules:

- Authority current state = latest decision's `resulting_state`.
- Reference current state = latest decision's `resulting_state`, **except** that an unreleased row in `reference_security_flags` forces `flagged` regardless of that decision. This is what makes the flag synchronous and protect-first.
- `last_verified_at` = `created_at` of the most recent decision whose `resulting_state = 'verified'`; null for references never verified.

Views:

- `project_reference_current_state` (internal) — reference + derived state + `last_verified_at` + active flag indicator id.
- `public_project_references` — (`security_invoker`, `security_barrier`) rows in `verified` state with no active flag: `project_id`, `kind`, `label`, `normalized_url`, `last_verified_at`.
- `public_project_domain_authorities` — rows in `granted` state: `project_id`, `normalized_domain`, `granted_at`.

Protected functions follow the Phase 6A/7A pattern exactly: `security definer` where required, owned by the service role, `revoke all … from public, anon, authenticated, service_role` then narrow grants, caller identity taken only from `auth.uid()`, and database-owned timestamps.

## 8. Candidate Ingress and Verification Flow

1. **Candidate sources.** An extraction candidate may propose a reference; a reviewer may register one manually from existing Evidence. Both paths create a `candidate` reference only. AI output is never a verification.
2. **Deterministic normalization at the boundary.** Registration normalizes domain and URL with the shared functions and rejects values that fail the URL/domain checks. Normalization never performs a network lookup.
3. **Domain-first order.** A reviewer may only verify a URL reference when its normalized domain has a `granted` authority row. The command rejects `verify` when the domain authority is `candidate` or `revoked`.
4. **Evidence grounding.** `verify`, `reverify`, and `restore` require an existing `evidence_id` whose source is not currently `blocked` under Phase 7A. This prevents verifying a reference using Evidence from a source the security overlay has already restricted.
5. **No canonical write from the model.** Registration writes a row; verification is a human decision. There is no code path in which a collector or model output produces a `verified` reference.

## 9. Security Coupling to Phase 7A

When a Phase 7A indicator is accepted, the ledger matches its normalized value against `project_references.normalized_url` and `normalized_domain`:

- A match inserts a `reference_security_flags` row (idempotent per `(reference_id, indicator_id)`).
- The public view immediately stops returning that reference, so rendering stops without any job, cache purge, or background sweep.
- `withdraw` and `restore` are human decisions. `restore` requires Evidence and appends a decision; it does **not** delete the flag row — it sets `released_at`, `released_by`, and `release_evidence_id`, keeping the disagreement visible.
- Blocked **project** posture additionally suppresses all public references for that project, because a blocked project must not present actionable outbound links.

## 10. Idempotency, Concurrency, and Transaction Semantics

- Each successful mutation commits decision rows, the security event, the command receipt, and the versioned outbox event in one transaction.
- Same key + same request replays exactly; same key + different body returns `reference_idempotency_conflict`.
- A stale `expected_version` returns `reference_version_conflict`; the UI reloads and re-confirms rather than adopting the newer version.
- Reference and authority commands take the same deterministic advisory lock ordering used by Phase 7A so a flag race and a verify race serialize deterministically.
- No external call occurs while a transaction is open.

## 11. Synchronous Enforcement

- **Project detail:** the official website link renders as an anchor only when `public_project_references` contains a `verified` row whose `normalized_url` matches the stored URL's normalized form. Otherwise it renders inert text with an explicit "未验证" marker. This replaces the current unconditional anchor.
- **Blocked projects:** no reference is rendered as a link, consistent with the Phase 7A rule that a blocked project keeps its detail page but loses actionable affordances.
- **Tutorials (future):** resolve links only through `public_project_references`; a tutorial whose references leave `verified` becomes `needs_review`/`blocked`. Phase 7B provides the resolution primitive; it does not build tutorials.

## 12. Public Read Models and Behavior

- `public_project_references` returns only `verified` rows with no active security flag and no blocked project posture.
- Public rows carry: `project_id`, `kind`, `label`, `normalized_url`, `last_verified_at`. One opaque cursor over `(last_verified_at desc, id desc)`.
- Public rows never carry Evidence ids, locators, notes, actor identity, candidate rows, or internal normalization diagnostics.
- `last_verified_at` is always shown next to a verified link so staleness is user-visible rather than hidden behind a badge.

## 13. Repositories and HTTP Boundaries

- `packages/database/src/references/` — `ReferenceReviewRepository` (per-call bearer, strict parse-before-map, stable `AR2xx` error mapping) and `ReferencePublicRepository` (anon, public views only, no base-table fallback), plus the browser-denied entrypoint that keeps the reviewer repository out of client bundles.
- `apps/web/src/app/api/v1/review/references/*` — thin authenticated handlers; `/api/v1/references` — public verified references per project.
- `apps/web/src/lib/reference-review-api-client.ts` and `reference-public-loader.ts` — strict browser client with a fresh bearer per call and a fresh idempotency key per mutation; typed `409` without retry.
- Route Handlers perform no long-running work.

## 14. Reviewer User Interface

`/review/references` reuses the existing reviewer shell, session, pending-action gate, and safe-text rendering:

- Domain authority list/detail with grant, revoke, and regrant.
- Reference list/detail with register, verify, reverify, restore, and withdraw.
- Verify/restore require an Evidence selection; the UI never auto-selects one.
- High-impact decisions use an affirmative confirmation bound to the authoritative aggregate version; a `409` clears the confirmation.
- Free-text notes render inert; only normalized, schema-validated URLs become internal links.

## 15. Public User Interface

- Project detail renders verified references as labeled anchors with `last_verified_at` and `rel="noreferrer noopener"`.
- Absent or non-verified official URLs render as inert text with an explicit unverified marker — never as a link.
- A verified domain is displayed as a granted-domain chip and is never itself rendered as a link.
- Blocked projects show no reference links at all.

## 16. Authorization, RLS, and Privileges

- RLS is enabled on every new table. Anonymous and ordinary authenticated principals read only the public views; canonical tables deny direct DML to all browser principals.
- Protected commands re-check `auth.uid()` against an active `reviewer`, `senior_reviewer`, or `admin` grant on every call, so revocation takes effect immediately.
- `security_reviewer` retains its Phase 7A powers and additionally may `restore` a reference it can justify, but cannot grant authority on Evidence alone without the reviewer role.
- Browser bundles are verified to exclude the reviewer repository, service-role key, database URL, and internal projection fields.

## 17. Error and Security Behavior

- Stable `AR2xx` domain codes only; human-readable text is never used for branching and never echoes SQL or payload detail.
- Every untrusted value is parsed at the boundary before mapping; unknown keys are rejected.
- Reference URLs from canonical rows are the only values allowed to become `href`. Candidate payload text, notes, and indicator values never become links.
- A verification failure, indicator-matching failure, or outbox failure rolls the whole command back; no partial canonical state is possible.

## 18. Testing Strategy

- **Contracts:** strict schema, enum/state/reason compatibility, cursor bounds, URL and domain normalization matrices, hostile and near-miss values, safe outbox keys.
- **Domain:** normalization determinism, state transition matrix for every decision × current state, `last_verified_at` derivation, flag-over-verified precedence, domain-first verify gating.
- **Database (pgTAP):** RLS for every principal, protected-command-only canonical writes, `auth.uid()` attribution, append-only enforcement, transactional rollback with outbox, idempotency and version conflicts, and two-session races.
- **Integration:** flag race against a concurrent verify, restore after a security flag, revoked domain authority un-verifying its URLs, blocked project suppressing references, and fixture cleanup to the disposable seed baseline.
- **Golden Dataset:** add reference-proposal cases (explicit official announcement, social-account impersonation, near-miss domain, injected instruction, invented Evidence locator) reusing the Phase 7A runner.
- **UI:** unverified markers, blocked suppression, inert notes, confirmation binding, and bundle isolation.

## 19. Delivery Boundaries

- One forward-only migration, plus one pgTAP file, plus the contracts/domain/database/worker/web slices and the runbook chapter.
- Local and disposable verification only. No production access, migration application, deployment, or rollout.
- Local completion and production availability must continue to be reported separately.

## 20. Acceptance Criteria

Phase 7B is complete when all of the following hold together:

1. No user-visible official link renders unless it resolves from a `verified` reference with a granted domain authority.
2. Every verified reference exposes `last_verified_at` and traces to Evidence → Raw Item → Source.
3. A `verified` domain does not by itself verify any URL beneath it, proven by an explicit test.
4. A matching Phase 7A indicator removes a reference from public rendering synchronously, and only a human decision grounded in Evidence can restore it.
5. All authority, reference, decision, flag, and release history is append-only and remains visible after withdrawal or revocation.
6. Canonical writes are impossible without an active reviewer/senior_reviewer/admin session and are attributed to `auth.uid()`.
7. `clear`-equivalent regression holds: projects with no references render exactly as they do today except that unverified URLs are inert rather than linked.
8. Public projections expose no Evidence locator, note, actor identity, candidate row, or internal normalization diagnostic.
9. Idempotency, version conflicts, two-session races, and transactional rollback with outbox are all covered by real tests.
10. The full database gate and the full repository gate pass under Node 22.22.2 / pnpm 11.16.0, and the runbook documents the workflow.
