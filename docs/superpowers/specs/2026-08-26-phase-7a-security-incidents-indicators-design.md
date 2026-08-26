# Phase 7A Security Incidents and Indicators — Design

**Date:** 2026-08-26
**Status:** Approved
**Scope:** Local modular-monolith implementation of the security review, canonical ledger, synchronous enforcement, reviewer UI, and public security projections

## 1. Goal

Add a protect-first security overlay for projects and sources. The overlay must let an active security reviewer or admin turn grounded candidate evidence into append-only canonical indicators and incident decisions, derive the current security posture, and synchronously enforce that posture across collection, Promotion, scoring, Evidence eligibility, opportunity ranking, and public presentation.

The feature must preserve five separations:

1. Security posture is independent from project lifecycle.
2. Security posture is independent from opportunity, risk, confidence, and score recommendation.
3. AI and collectors produce candidate data only.
4. Internal investigation data is separate from public disclosure.
5. A source-level restriction never becomes a project-level restriction without a separate project incident and reviewer decision.

Phase 7A is complete only when the database boundary, application paths, reviewer workflow, public behavior, authorization matrix, and race behavior are proven together. A schema-only or UI-only slice is not sufficient.

## 2. Approved Product Decisions

- Use an independent `clear | caution | blocked` security posture. `clear` is derived only when no active precaution exists.
- Limit canonical effect targets to `project` and `source` in this phase.
- Derive a target's posture from the strictest active incident: `blocked > caution > clear`.
- Preserve all incident, decision, indicator, disclosure, command, and security-event history append-only.
- Allow only the current Supabase session's active `security_reviewer` or `admin` grant to create or change canonical security state.
- Route AI/collector `security_risk` and `scam_indicator` candidates into a dedicated security queue. They must not enter ordinary signal Promotion.
- Allow reviewers to submit a manual security candidate only from existing Evidence.
- Stop collection and ordinary public Evidence consumption for a blocked source without deleting its history.
- Keep a caution project/source visible, but require a security reviewer/admin for any ordinary candidate Promotion. Automatic score writes pause while either relevant target is caution or blocked.
- Remove a blocked project from ordinary opportunity lists, actionable statistics, and recommendations while keeping its detail page accessible with a dominant warning and historical score labeling.
- Publish only posture, category, severity, bounded summary, timestamps, target scope, and indicator values individually approved as `public_safe`.
- Render all public indicator values as inert text without anchors, Markdown, HTML, or executable behavior.
- Deliver a full reviewer and public vertical slice. A CLI may support operations but is not the primary review interface.

## 3. Non-Goals

- No verified allowlisted references or reference-level enforcement; those belong to Phase 7B.
- No official-link, domain, URL, contract, or transaction-hash confirmation claim.
- No tutorials, tutorial invalidation, notifications, watchlists, tasks, wallet interaction, signing, or transaction automation.
- No third-party threat-intelligence API, chain-monitoring provider, or public/community report intake.
- No AI-created canonical indicator, incident, posture change, disclosure approval, or restriction release.
- No automatic source-to-project escalation.
- No mutation of project lifecycle, deterministic score values, score history, or score recommendation.
- No WebSocket or real-time push channel.
- No production database access, migration application, deployment, or rollout.

## 4. Existing State and Required Integration Points

The repository already provides:

- the `security_reviewer` application role;
- `security_risk` and `scam_indicator` extraction claim types;
- append-only Evidence grounded to Raw Item and Source;
- protected extraction-candidate review with command receipts, audit records, and transactional outbox;
- bearer-scoped reviewer repositories and `/review` authentication shell;
- `signal_has_valid_evidence`, `score_has_complete_evidence`, `project_current_state`, and `opportunity_list` database read boundaries;
- deterministic scoring and durable source collection;
- strict API envelopes, cursor pagination, idempotency, expected-version handling, and generated database types.

The repository does not yet provide canonical security tables, security commands, security read models, collection/Promotion/scoring security gates, security BFF routes, or security UI.

Two existing facts constrain this design:

1. The score model records `project score → score-signal links → signals → Evidence`, not a factor-specific Evidence relationship. Phase 7A therefore gates a score and all of its factor rows atomically. It does not claim that one Evidence row proves one factor.
2. A blocked source is ineligible for ordinary public intelligence, but its already collected, deterministically grounded material may still be relevant to an internal security investigation. Security commands may link that Evidence; public signal/score eligibility must still reject it.

## 5. Trust Boundaries and Invariants

### 5.1 Writers

- `ai_stage_worker` may append an extraction-origin security candidate through the narrowly granted candidate-ingress path.
- An authenticated active `security_reviewer` or `admin` may submit a manual candidate and execute protected security commands.
- Canonical security DML runs only inside authenticated security-definer command functions that form the Security Ledger facet of the protected Promotion Service boundary.
- Browser code, anonymous users, ordinary authenticated users, ordinary reviewers, collectors, and AI workers receive no direct canonical table mutation grant.

### 5.2 Canonical grounding

Every canonical indicator must link to at least one Evidence row. Every incident decision that opens, adjusts, resolves, or reopens a precaution must identify one primary Evidence row. The database command validates the complete chain:

```text
Security decision
  → canonical indicator or primary Evidence reference
  → Evidence
  → Raw Item
  → Source
```

Project and source identities must match the candidate context and selected target. Exact-quote grounding uses the existing `normalize_evidence_text_v1` and `evidence_quote_sha256_v1` rules.

### 5.3 Append-only state

No table stores a mutable `current_posture`, current incident status, or current disclosure flag. Current values are projections over versioned decisions/events. Application roles cannot update or delete:

- candidate review decisions;
- canonical indicators or indicator-Evidence links;
- incidents or incident-indicator links;
- incident decisions;
- security events;
- security review command receipts.

Corrections use a later decision, a disclosure reversal, or a new incident.

### 5.4 Cross-module serialization

Security commands, ordinary Promotion, deterministic score persistence, and source collection persistence use the same deterministic target advisory-lock key before their final posture check and write. Locks are acquired in stable project-then-source order when both targets apply.

This defines commit ordering:

- if the ordinary write commits first, it is historical data that predates the security restriction;
- if the restriction commits first, the ordinary write waits, observes the new posture, and fails closed;
- no correctness rule depends on last-write-wins state.

External collection and model calls never occur while holding a database transaction or advisory transaction lock.

Security commands never update projects, sources, collection queues, signals, or scores. Those owning modules consume the derived security gate through their own service/repository boundary and write only their own data.

## 6. Shared Contracts

`packages/contracts` is the only source of security enums, commands, receipts, read projections, cursor payloads, errors, and domain-event payloads. All object schemas are strict and reject additional properties.

### 6.1 Core enums

```text
securityTargetType: project | source
securityPosture: clear | caution | blocked
activeSecurityPosture: caution | blocked
securitySeverity: low | medium | high | critical
securityIndicatorType:
  domain | url | contract_address | transaction_hash |
  social_account | observed_behavior
securityIncidentCategory:
  phishing | impersonation | malicious_contract | source_compromise |
  fraudulent_claim | fund_loss | other_security_risk
securityCandidateOrigin: extraction | reviewer_manual
securityCandidateState: pending | needs_review | accepted | rejected
securityCandidateDecision:
  needs_review | reject | accept_and_open | accept_and_attach
securityIncidentState: active | resolved
securityIncidentAction:
  open | attach_indicator | adjust | resolve | reopen
```

Severity and posture remain separate. No function derives posture from severity, or severity from opportunity/risk/confidence.

### 6.2 Reason compatibility

Candidate decisions use:

- acceptance: `evidence_verified`;
- rejection: `claim_not_supported | source_mismatch | duplicate_candidate | wrong_scope`;
- needs-review: `source_mismatch | grounding_failed | insufficient_context | wrong_scope`.

Incident decisions use:

- open/reopen: `precautionary_evidence | active_exploitation`;
- stricter adjust: `evidence_escalated | active_exploitation`;
- less-strict adjust: `evidence_deescalated | mitigation_verified | scope_corrected`;
- same-posture verification/summary update: `additional_evidence | mitigation_verified`;
- resolve: `mitigation_verified | false_positive_verified | scope_corrected`;
- attach without posture change: `additional_evidence`.

Indicator disclosure uses:

- publish: `safe_for_public_warning`;
- withdraw: `sensitive_indicator | disclosure_no_longer_needed`.

The domain package owns this compatibility matrix; contracts and database checks mirror it.

### 6.3 Candidate and command schemas

Define strict version-1 schemas for:

- extraction-origin candidate ingress;
- reviewer manual candidate submission;
- candidate list query/cursor and safe list item;
- reviewer candidate detail;
- candidate review command and receipt;
- incident list query/cursor, detail, decision history, and command receipt;
- incident open/adjust/resolve/reopen commands;
- indicator disclosure command and receipt;
- public project security state, incident summary, safe indicator, and blocked-project page.

Manual candidates require an existing Evidence ID, target, indicator proposal, a trimmed 10–2,000 character summary, and an optional trimmed 1–1,000 character internal note. Incident public summaries are trimmed 20–500 character plain text. AI-origin candidates may not invent a target ID or indicator value: the reviewer selects only the project/source IDs already present in the extraction context and supplies a grounded indicator value during acceptance.

Indicator values are 1–500 characters of trimmed bounded text. `normalize_security_indicator_value_v1` reuses the existing Unicode-whitespace normalization behavior and performs no case folding, URL resolution, network lookup, or chain lookup. Domain values are 1–253 characters with no whitespace/control characters; URL values must use absolute `http` or `https` syntax with no control characters; all remaining types reject control characters but deliberately avoid chain- or provider-specific semantic validation. Every value must occur exactly after normalization in its Evidence. These checks do not declare a value official, safe to visit, chain-canonical, or allowlisted. URL-like values are never activated by a renderer.

### 6.4 Error contracts

Use stable domain error codes:

- `security_reviewer_required`;
- `security_candidate_not_found`;
- `security_candidate_not_reviewable`;
- `security_incident_not_found`;
- `security_indicator_not_found`;
- `security_version_conflict`;
- `security_idempotency_conflict`;
- `security_command_invalid`;
- `security_target_mismatch`;
- `security_promotion_blocked`;
- `security_review_required`;
- `security_persistence_failed`.

A deterministic grounding failure is a committed command result with `outcome: needs_review` and `reasonCode: grounding_failed`, not a transport failure. This keeps the appended review decision and idempotent receipt consistent.

### 6.5 Outbox events

Extend the exact allowlist on `outbox_events` with version-1 event types:

- `security.candidate.submitted.v1`;
- `security.candidate.reviewed.v1`;
- `security.indicator.accepted.v1`;
- `security.incident.opened.v1`;
- `security.incident.changed.v1`;
- `security.indicator.disclosure_changed.v1`.

Payloads contain only version, event type, aggregate/object IDs, aggregate version, target type/ID, resulting posture when applicable, and `occurredAt`. Candidate submission uses aggregate version 1, matching the immutable pending candidate version. Payloads never contain reviewer identity, internal note, candidate payload, Evidence locator/quote, Raw Item content, or indicator value, including values marked `public_safe`.

## 7. Database Model

Use one forward-only migration after the existing 21 migrations. Use constrained text columns plus checks rather than new PostgreSQL enums so later forward-only enum expansion does not require type replacement.

### 7.1 `security_indicator_candidates`

An immutable candidate envelope:

- `id`;
- `origin`;
- `extraction_candidate_id` nullable and unique;
- `submitted_by_user_id` nullable;
- candidate-context `project_id` and `source_id`;
- `manual_evidence_id` nullable;
- strict typed `payload` JSONB;
- `created_at`.

Shape checks require exactly one origin:

- extraction origin references an existing extraction candidate and copies no reviewer identity;
- reviewer-manual origin references `auth.uid()`, one existing Evidence row, and a manual candidate payload.

The table has no mutable status/version column. Candidate creation is immutable version `1`; current review state/version are derived as version 1 `pending` when no decision exists, otherwise from the latest decision.

### 7.2 `security_candidate_review_decisions`

Append-only candidate history:

- `id`, `candidate_id`, `candidate_version`;
- `reviewer_user_id`;
- `decision`, `reason_code`, nullable internal `note`;
- nullable resulting `indicator_id` and `incident_id`;
- `created_at`.

`(candidate_id, candidate_version)` is unique. The first decision creates version 2. Accepted and rejected candidates are terminal. `needs_review` may receive a later decision using the next expected version.

### 7.3 `security_indicators`

Immutable canonical indicator identity:

- `id`;
- `indicator_type`;
- exact trimmed `value_text`;
- SHA-256 of the normalized value for deterministic reuse;
- `created_at`.

`(indicator_type, normalized_value_sha256)` is unique. The hash supports reuse/deduplication but never replaces the exact Evidence locator check.

### 7.4 `security_indicator_evidence_links`

Append-only many-to-many links:

- `indicator_id`, `evidence_id`, `created_at`;
- primary key `(indicator_id, evidence_id)`.

An Evidence row from a currently blocked source remains eligible for this internal security link if it was deterministically grounded. The same row remains ineligible for ordinary public signal and score projections.

### 7.5 `security_incidents`

Immutable incident header:

- `id`;
- `target_type`;
- exactly one of `project_id` or `source_id`;
- immutable `category`;
- `opened_at`, `created_at`.

Category correction resolves the incorrect incident and opens a new incident. It does not overwrite the header.

### 7.6 `security_incident_indicator_links`

Append-only links:

- `incident_id`, `indicator_id`;
- `linked_by_decision_id`;
- `created_at`;
- primary key `(incident_id, indicator_id)`.

### 7.7 `security_incident_decisions`

The precaution ledger:

- `id`, `incident_id`, `incident_version`;
- `reviewer_user_id`;
- `action`, `reason_code`;
- nullable `resulting_posture` (`null` only for resolve);
- `resulting_severity`;
- bounded `public_summary`;
- nullable internal `note`;
- required primary `evidence_id`;
- `created_at`.

`(incident_id, incident_version)` is unique. Version 1 is `open`. Later decisions carry the complete resulting active projection. A resolve row carries forward severity and summary but sets posture to null. Reopen creates the next version with `caution` or `blocked`.

### 7.8 `security_events`

Append-only audit and disclosure ledger:

- `id`, `event_type`;
- `aggregate_type`, `aggregate_id`, `aggregate_version`;
- nullable `candidate_id`, `indicator_id`, `incident_id`, `decision_id`;
- actor kind plus nullable internal actor user ID/service name;
- nullable `indicator_public_safe` only for disclosure events;
- constrained internal event payload;
- `occurred_at`, `created_at`.

State-bearing events are unique by `(aggregate_type, aggregate_id, aggregate_version)`. Current indicator disclosure is the latest disclosure event by aggregate version; indicator creation is version 1 and the first disclosure change advances to version 2. No indicator row contains `public_safe`.

### 7.9 `security_review_commands`

Append-only idempotency receipts:

- `id`, `reviewer_user_id`, `operation`;
- `aggregate_type`, `aggregate_id`;
- `idempotency_key`, `input_hash`;
- nullable expected/resulting candidate, incident, and indicator versions with an operation-specific shape check;
- resulting decision/indicator/incident IDs as applicable;
- constrained result payload;
- `created_at`.

`(reviewer_user_id, idempotency_key)` is unique. The result payload excludes source content, Evidence locator/quote, candidate payload, internal note, and reviewer profile data.

### 7.10 Derived database functions and projections

Add stable, narrowly granted helpers:

- derive latest incident decision;
- derive active incident posture;
- derive target posture as the strictest active incident;
- test whether a source is eligible for ordinary public intelligence;
- test whether an actor has an active security role;
- derive latest indicator disclosure decision;
- compute the shared target advisory-lock key.

Create security-invoker/security-barrier public projections for:

- public project security state;
- public incident summaries;
- public-safe indicator values;
- blocked-project cursor listing.

Reviewer list/detail reads use protected functions that project exact fields rather than broad table grants.

## 8. Candidate Ingress and Review Flow

### 8.1 Extraction routing

When the extraction runner persists a grounded `security_risk` or `scam_indicator` candidate, a narrowly granted security-candidate ingress function creates the extraction-candidate audit row, its unique security-candidate envelope, and the safe candidate-submitted outbox event in the same database transaction. Ordinary candidates retain the existing path.

Defense in depth:

- ordinary pending-candidate reads exclude both security claim types;
- `execute_extraction_candidate_review` rejects those claim types with `security_review_required` before any canonical write;
- retrying the same extraction insert reuses the unique extraction/security candidate pair;
- the AI worker cannot execute a security review command.

### 8.2 Manual candidate submission

`POST /api/v1/review/security/candidates` accepts a strict manual candidate, an `Idempotency-Key`, and the current bearer session. The protected command:

1. derives the actor from `auth.uid()`;
2. verifies an active security role;
3. validates target/Evidence/Raw Item/Source consistency;
4. appends the candidate, submission security event, receipt, and safe candidate-submitted outbox event atomically;
5. returns version `1`, state `pending`.

No manual path accepts caller-supplied reviewer identity, raw body, URL fetch result, or ungrounded quote.

### 8.3 Candidate decisions

`needs_review` and `reject` append only a candidate decision, event, receipt, and review outbox event.

`accept_and_open` atomically:

1. locks the candidate and selected target;
2. validates expected candidate version and idempotency;
3. validates selected target against candidate context;
4. verifies or creates the deterministic Evidence row;
5. creates/reuses the canonical indicator and appends its Evidence link;
6. creates the incident and its version-1 open decision;
7. links the indicator to the incident;
8. appends candidate decision, security events, command receipt, and outbox events.

`accept_and_attach` also requires `expectedIncidentVersion`. It attaches the accepted indicator to an active existing incident and appends exactly one incident decision: `attach_indicator` carries forward posture/severity when unchanged, while `adjust` records an explicitly selected new posture/severity. The command advances both candidate and incident aggregates and cannot attach across target scopes.

If deterministic grounding or identity matching fails, the transaction appends `needs_review`, its receipt/event/outbox, and no canonical indicator, incident, or precaution.

## 9. Incident and Disclosure Commands

### 9.1 Incident lifecycle

- `open` starts at version 1 with explicit `caution` or `blocked` and at least one existing canonical indicator for the same target; candidate acceptance may create that indicator and incident atomically.
- `adjust` changes posture, severity, or public summary. A same-posture verification is valid only when its summary changes and it carries new primary Evidence; a complete no-op is invalid.
- `resolve` releases only this incident by appending a null active posture.
- `reopen` is valid only after resolve and requires `caution` or `blocked`.
- `attach_indicator` preserves the current posture unless an explicit compatible adjustment is part of the same command.

Every command requires the current expected incident version, a compatible reason code, a primary Evidence ID, a bounded public summary, and optional internal note.

### 9.2 Multiple incidents

The current target posture is the maximum of every incident whose latest decision has a non-null active posture. Resolving or downgrading one incident does not change any other incident. There is no command that writes target-level `clear`.

Target locking serializes cross-module commit order but does not turn the target into a mutable aggregate and does not change the maximum-posture rule.

### 9.3 Indicator disclosure

The disclosure command requires:

- current expected disclosure version;
- `publicSafe: true | false`;
- compatible reason code;
- active security reviewer/admin session;
- explicit UI confirmation.

It appends a security event, command receipt, and disclosure outbox event. Revocation is immediate in the public projection. Public-safe status never creates a link and never changes the underlying indicator or Evidence.

## 10. Idempotency, Concurrency, and Transaction Semantics

- Every reviewer mutation requires `Idempotency-Key` of 1–255 trimmed characters.
- Every command hashes the canonical strict payload.
- Same actor/key/hash returns the stored receipt with `replayed: true`.
- Same actor/key with a different hash returns HTTP 409 `security_idempotency_conflict`.
- Candidate, incident, and disclosure changes require their appropriate expected version and return HTTP 409 `security_version_conflict` when stale.
- Candidate/incident rows or deterministic advisory keys are locked before version evaluation.
- All canonical rows, audit events, receipts, and outbox rows commit in one transaction.
- No external API/model call occurs inside a command transaction.
- Unexpected database errors are sanitized to `security_persistence_failed`; raw SQL, table names, payloads, notes, and locators do not enter HTTP errors.

## 11. Synchronous Enforcement

### 11.1 Source collection

A blocked source stops producing new collected content:

1. Scheduling excludes sources whose derived source posture is blocked.
2. A leased job checks posture immediately before any external request.
3. After the request, the persistence transaction acquires the source target lock and checks posture again.
4. If blocked, the response body is discarded and the queue outcome uses a stable sanitized security-gated code; no new Raw Item or discovered item is written.

A caution source may still be collected. A blocked project alone does not stop collection from otherwise clear sources, because source-to-project escalation is forbidden and continued observation may support investigation.

### 11.2 Ordinary Promotion

The protected ordinary Promotion function checks both the candidate's project and source under the shared target locks:

- both clear: existing reviewer roles behave as today;
- either caution: only active `security_reviewer` or `admin` may promote;
- either blocked: ordinary Promotion fails with `security_promotion_blocked` for every actor;
- security claim types always fail with `security_review_required` and use the security queue.

This check is inside the database command. UI filtering and worker checks are supplementary only.

### 11.3 Deterministic scoring

Automatic score persistence checks project posture and all input-source postures under the same target ordering:

- clear inputs: score normally;
- caution or blocked target/input source: do not write a new canonical score;
- after all relevant targets return to clear, normal input-version detection may compute a new score.

Phase 7A does not add a reviewer override or approval flow for score creation.

### 11.4 Evidence and score eligibility

Replace the existing public Evidence helper with a security-aware version while preserving its name/signature for consumers:

- a signal is valid only when at least one linked Evidence row belongs to a non-blocked source;
- all eligible Evidence citations from blocked sources are filtered out individually;
- conflicting eligible Evidence remains visible;
- an existing Evidence row is never deleted or marked invalid in storage.

`score_has_complete_evidence` continues to require every score-linked signal to pass `signal_has_valid_evidence`. Consequently, one blocked Evidence source does not hide a signal when alternative eligible Evidence remains, but the loss of the last eligible Evidence for any score-linked signal removes the entire score and its factor set from the current public ranking. This is deliberately score-level; Phase 7A does not invent factor-to-Evidence attribution.

## 12. Public Read Models and Behavior

### 12.1 Project posture

Only project-target incidents determine project posture. Source incidents do not roll up into it.

Extend the project detail projection with strict security state. The detail route remains available for every catalog-visible project:

- clear: existing presentation;
- caution: existing ranking/details plus warning badge and active public incident summaries;
- blocked: dominant security warning, disabled action affordances, public incident summaries, and existing eligible score shown only as a historical snapshot rather than current action guidance.

### 12.2 Opportunity list and statistics

`opportunity_list` excludes project posture `blocked` before pagination and counting. Caution projects remain in their ordinary deterministic order with a posture badge. Overview/actionable statistics use the same eligible projection so blocked rows cannot remain in counts.

### 12.3 Blocked-project list

`/api/v1/security/blocked-projects` returns a cursor-paginated safe projection ordered by latest active restriction time descending and project ID descending. It contains:

- project identity and slug;
- current `blocked` posture;
- category, severity, bounded public summary;
- first observed and last verified timestamps;
- target scope;
- only individually public-safe inert indicator values.

The list never includes score recommendation as current advice.

### 12.4 Public incident history

Project detail may show active and resolved public incident summaries in deterministic newest-first order. A resolved incident is labeled resolved and does not affect posture. Internal notes, reviewer identities, Evidence IDs/locators/quotes, candidate data, and unapproved indicator values remain absent.

## 13. Repositories and HTTP Boundaries

### 13.1 Database packages

Add focused server-only modules:

- security review repository: bearer-scoped list/detail/command methods;
- public security repository: anon-safe blocked list and project projection reads;
- security gate helpers used by collection, Promotion, and scoring adapters.

Every returned row is parsed through `packages/contracts`. Browser exports fail closed. Repository errors map database codes to stable domain codes without branching on human-readable messages.

### 13.2 Reviewer endpoints

Use existing auth verification and `/api/v1` envelopes:

- `GET /api/v1/review/security/candidates`;
- `GET /api/v1/review/security/candidates/:candidateId`;
- `POST /api/v1/review/security/candidates`;
- `POST /api/v1/review/security/candidates/:candidateId/decisions`;
- `GET /api/v1/review/security/incidents`;
- `GET /api/v1/review/security/incidents/:incidentId`;
- `POST /api/v1/review/security/incidents`;
- `POST /api/v1/review/security/incidents/:incidentId/commands`;
- `POST /api/v1/review/security/indicators/:indicatorId/disclosure`.

Lists use opaque cursor pagination. BFF handlers validate auth and contracts, pass only the fresh bearer to repositories, and perform no AI, collection, backfill, or batch work.

### 13.3 Public endpoints and existing queries

- Add `GET /api/v1/security/blocked-projects`.
- Extend opportunity and project-detail contracts with strict security projections.
- Keep public database access on anon-safe views/functions; never use service-role credentials in browser code.

## 14. Reviewer User Interface

Reuse the dedicated `/review` shell and session controller. Add `/review/security` with:

- candidate queue filters, cursor pagination, and safe summaries;
- candidate detail with untrusted source content rendered as inert text;
- manual candidate form limited to existing Evidence;
- accept-and-open and accept-and-attach workflows;
- incident list/detail, full append-only history, posture/severity adjustment, resolve, and reopen;
- indicator disclosure approval and withdrawal.

Every high-impact confirmation shows target, current posture, proposed posture, category, severity, Evidence reference, public summary, and reason code. The interface fetches a fresh access token and idempotency key for each command. On HTTP 409 it reloads the aggregate and never retries with a replaced expected version automatically.

The UI cannot create users or role grants. Revoked roles take effect on the next database call.

## 15. Public User Interface

- Add an independent “安全封锁” opportunity view.
- Show a caution badge without changing ordinary order.
- Remove blocked projects from ordinary tabs and actionable counts.
- Keep blocked detail pages accessible with the security warning before score content.
- Label retained scores and factors as historical snapshots under the current security restriction.
- Disable current-action affordances while project posture is blocked.
- Render public-safe indicator values through a plain-text component that cannot produce anchors, HTML, Markdown, copy-to-wallet behavior, or automatic navigation.
- Explain that catalog official-source metadata does not override independent security evidence and does not confirm an airdrop, domain, contract, eligibility rule, or reward.

## 16. Authorization, RLS, and Privileges

Enable RLS on every new table. Revoke broad privileges before granting minimum columns/functions.

Required matrix:

- anonymous: safe public projections only;
- ordinary authenticated user: same public projections, no reviewer data or mutation;
- reviewer/senior reviewer: no security review access unless separately granted security reviewer/admin;
- active security reviewer/admin: protected list/detail and command execution only;
- revoked security reviewer: immediate denial;
- AI worker: extraction-origin candidate ingress only;
- collector/queue/scoring workers: narrow posture helpers required for their own gates, no security ledger DML;
- Promotion Service: command-internal canonical DML only;
- service role: explicitly tested, never used as a browser or reviewer bypass.

Public security views use `security_invoker` and `security_barrier`; their underlying anon/authenticated policies admit only public incident rows and individually approved indicator rows, and column grants exclude reviewer IDs, notes, Evidence references, payloads, and command data. They never rely on an owner bypass for public reads.

All historical tables use reject-update/delete triggers in addition to RLS/grants. Protected functions set a fixed search path, validate exact JSON keys/types, derive `auth.uid()`, re-check active roles, and accept neither caller-provided authoritative timestamps nor reviewer IDs. Security decision/event/receipt/outbox timestamps come from the database transaction clock.

## 17. Error and Security Behavior

- Treat source text, candidate payloads, summaries, indicator values, and notes as untrusted data.
- Strictly parse database projections; malformed rows fail the request instead of being coerced or silently omitted.
- Never log or return Raw Item content, Evidence quote/locator, reviewer note, command payload, SQL detail, access token, or credential.
- Keep conflicting indicators and Evidence visible internally; never silently overwrite a contradiction.
- Do not interpret official-source status as security clearance.
- Do not let a high opportunity score reduce severity or posture.
- Do not let a resolved incident erase its earlier public/internal history.
- Do not publish an indicator merely because its incident summary is public.

## 18. Testing Strategy

Follow RED → GREEN at every layer.

### 18.1 Contracts

- Accept exact enums, commands, receipts, cursors, read projections, and outbox payloads.
- Reject missing/additional keys, malformed IDs/timestamps/versions, incompatible reason/action pairs, unsafe bounds, and unsupported indicator/target/category values.
- Mutation-test public and outbox schemas against reviewer identity, internal note, locator, quote, Raw Item/candidate payload, and indicator-value leakage.

### 18.2 Domain

- Exhaust `blocked > caution > clear` combinations.
- Cover multiple active incidents, independent resolve, downgrade, and reopen.
- Cover candidate and incident transition/reason matrices.
- Cover project/source non-escalation and stable lock ordering.
- Cover disclosure publish/withdraw and inert-text behavior.
- Cover security-aware Evidence and whole-score eligibility without factor-level attribution.

### 18.3 Migration and pgTAP

Against disposable Supabase:

- verify table shapes, exact checks/FKs/indexes, RLS, grants, function owners/search paths, view security options, and append-only triggers;
- test anonymous, authenticated owner/non-owner, reviewer, senior reviewer, security reviewer, revoked reviewer, admin, AI worker, collection worker, queue worker, scoring worker, Promotion Service, and service-role behavior;
- prove direct canonical INSERT/UPDATE/DELETE denial;
- prove forged reviewer identity rejection;
- prove command atomic rollback when indicator, decision, event, receipt, or outbox insertion is forced to fail;
- prove exact outbox payloads;
- prove same-key replay/conflict, stale expected version, and two-independent-session races;
- prove simultaneous incidents preserve maximum posture and independent resolution.

### 18.4 Collection, Promotion, scoring, and repository integration

- Block a source after scheduling, before fetch, and during fetch-before-persist.
- Prove the post-fetch target lock discards content after an earlier block commit.
- Prove ordinary security candidates cannot use signal Promotion.
- Prove clear/caution/blocked Promotion authorization.
- Prove automatic scoring skips caution/blocked inputs and resumes after clear.
- Prove a signal survives one blocked Evidence source when alternative Evidence remains.
- Prove loss of the last eligible Evidence hides the signal and every current score that consumed it.
- Prove source restrictions never set project posture.

### 18.5 BFF and Web

- Cover signed-out, insufficient-role, revoked-role, security-reviewer, and admin sessions.
- Cover list/detail/command success and canonical error envelopes.
- Cover cursor pagination, fresh bearer, fresh idempotency key, and HTTP 409 refresh behavior.
- Render confirmation flows and full append-only history.
- Render caution/blocked project behavior and separate blocked list.
- Prove public indicator values remain inert under URL, HTML, Markdown, and script-like inputs.
- Add public bundle assertions excluding server credentials and internal security fields.

### 18.6 Golden Dataset

Add `security_risk` and `scam_indicator` examples for explicit events, negation, historical context, wrong entity, domain/URL/contract/transaction forms, conflicting Evidence, prompt injection, locator mismatch, and invented references. Success means a grounded candidate or a safe rejection; it never means a canonical incident.

### 18.7 Completion gates

Run focused tests after each cycle, then the full disposable database/pgTAP and repository integration gates, followed by:

```bash
pnpm verify
```

Use Node 22.22.2 and pnpm 11.16.0. Production is outside acceptance.

## 19. Delivery Boundaries

Implementation planning should preserve independently testable layers:

1. strict contracts and pure domain rules;
2. forward-only schema, authorization, commands, derived posture, and pgTAP;
3. security repositories and real concurrency integration;
4. extraction routing plus collection/Promotion/scoring gates;
5. authenticated BFF/session clients;
6. reviewer UI;
7. public projections and UI;
8. Golden Dataset, end-to-end authorization/race matrix, runbook, and full verification.

The subsequent implementation plan may split these boundaries into smaller commits, but may not relax the trust, traceability, or atomicity rules in this design.

## 20. Acceptance Criteria

- Every canonical indicator and posture decision traces to Evidence, Raw Item, and Source.
- AI/collector output enters only the candidate queue and cannot create canonical security state.
- Only the active session's security reviewer/admin can execute canonical commands.
- Canonical rows, audit events, receipts, and outbox events commit atomically and append-only.
- Multiple incidents derive the strictest posture and resolve independently.
- Source/project cross-module races have a deterministic protect-first commit order.
- A blocked source stops new persisted collection and exits ordinary public Evidence eligibility without deleting history.
- Alternative eligible Evidence preserves a signal; loss of the last eligible Evidence invalidates every score that consumed that signal.
- A caution target keeps public placement but restricts Promotion and pauses automatic score writes.
- A blocked project leaves ordinary opportunities/statistics, appears in the blocked list, and retains an accessible warning-first detail page.
- Public responses contain only approved summaries and individually public-safe inert indicators.
- Clear-state behavior is regression-equivalent to the existing application.
- Focused tests, full disposable database tests, integration tests, and `pnpm verify` pass under the declared runtime.
- Documentation distinguishes local completion from production deployment, and no production state is accessed or changed.
