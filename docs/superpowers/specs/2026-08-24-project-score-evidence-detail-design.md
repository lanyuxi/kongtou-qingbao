# Project Score Factors and Evidence Citations — Design

**Date:** 2026-08-24  
**Status:** In written-spec review  
**Scope:** Project detail public read path only

## 1. Goal

Expose the deterministic score decomposition and its reviewed Evidence set on `/projects/[slug]` without widening the browser's access to Raw Items, AI candidates, review notes, governance commands, or unsafe URLs.

The page must help a reader answer two separate questions:

1. Which deterministic factors produced the opportunity, risk, and confidence values?
2. Which reviewed Evidence-backed signals were consumed by that score?

The product must not claim that one Evidence record uniquely proves one aggregate score factor because the current model records `score → signals → Evidence`, not `factor → signal/Evidence`.

## 2. Approved Product Decisions

- Display score factors grouped into the independent `opportunity`, `risk`, and `confidence` axes.
- Display Evidence in a separate section titled as the Evidence set used by the score.
- Each citation may contain the reviewed 10–500 character exact quote, source name, source type, Evidence verification time, signal title, signal verification state, and signal publication time.
- Citation text is rendered as inert plain text. It is never parsed as Markdown, HTML, a command, or an instruction.
- Do not expose clickable citation URLs in this slice. `sources.canonical_url`, Raw Item request/final/canonical URLs, and provider metadata remain private until verified allowlisted references are designed.
- Opportunity, risk, and confidence stay separate. Evidence count or quality does not reduce the deterministic risk score.
- Demo or historical scores with no factor rows render an explicit empty state; factors are never synthesized in the browser.

## 3. Non-Goals

- No factor-to-Evidence attribution table or inferred causal relationship.
- No scoring formula change, score backfill, AI explanation generation, or recommendation change.
- No Raw Item body, candidate payload, reviewer note, audit payload, command receipt, hash, provider error, or credential exposure.
- No URL allowlist, tutorial, security incident, notification, watchlist, or task-management work.
- No Phase 6B production rollout and no application of pending production migrations.
- No direct production database or Auth changes in this implementation slice.

## 4. Existing State

- `project_current_state` exposes the latest Evidence-complete score but not its immutable `project_scores.id`.
- `score_factors` stores axis, factor code, contribution, input value, and deterministic detail. Browser roles currently have no access by design.
- `score_signal_links` records every signal consumed by a score.
- `signal_evidence_links` and `evidence` preserve the reviewed, append-only grounding chain.
- `signal_has_valid_evidence` and `score_has_complete_evidence` already enforce structural Evidence gates.
- The project page uses a server-only module with an anon Supabase client. It does not use service-role credentials or a privileged BFF.

## 5. Architecture

Use forward-only database changes plus strict shared projection contracts. Keep the page on the existing anon PostgREST path.

### 5.1 Shared contracts

Add strict schemas under `packages/contracts` for:

- `publicProjectScoreFactorSchema`
- `publicProjectEvidenceCitationSchema`
- the `opportunity | risk | confidence` scoring-axis enum

The schemas reject missing or additional fields, malformed UUIDs/timestamps, out-of-range numbers, empty text, overlong citation text, and unsupported enum values. Database repositories parse every returned row through these schemas before mapping it to camel-case application types.

### 5.2 Current score identity

A forward-only migration extends `project_current_state` with `project_score_id`. The ID is selected from the same lateral latest-score row as the displayed metrics, using the existing deterministic order `(calculated_at desc, id desc)` and the existing Evidence-complete gate.

The repository includes `latestScore.id`. Subsequent factor and citation reads use this exact immutable score ID. This prevents a request from mixing one score's metrics with another score's factors if a new score is appended between queries.

### 5.3 Browser-safe projections

Create two views with `security_invoker = true` and `security_barrier = true`:

#### `public.project_current_score_factors`

Exact public columns:

- `project_id`
- `project_score_id`
- `axis`
- `factor_code`
- `contribution`
- `input_value`
- `detail`

Rows exist only for the current Evidence-complete score of an active or rumored project, matching the existing public score policy.

#### `public.project_current_score_evidence_citations`

Exact public columns:

- `project_id`
- `project_score_id`
- `signal_id`
- `signal_title`
- `signal_verification`
- `signal_published_at`
- `evidence_id`
- `citation_text`
- `evidence_source_field`
- `evidence_verified_at`
- `source_id`
- `source_name`
- `source_type`
- `source_is_official`
- `source_relation_verified_at`

Each row represents one valid `score_signal_links → signal_evidence_links → evidence` path. The view includes only published, Evidence-valid signals consumed by the current Evidence-complete score of an **active** project. Existing signal policies intentionally hide rumored-project signals; this slice does not widen them. It does not include any URL.

`source_is_official` is descriptive catalog metadata only. The UI labels it as “项目登记为官方来源” and does not turn it into a claim that the airdrop, eligibility, snapshot, contract, or reward is confirmed.

### 5.4 RLS and column privileges

The views remain security-invoker, so browser access is backed by explicit row policies and minimum column grants rather than an owner bypass.

Add narrowly scoped `SELECT` policies for `anon` and `authenticated` on:

- `score_factors`
- `score_signal_links`
- `signal_evidence_links`
- `evidence`

The factor policy admits rows connected to the current public Evidence-complete score of an active or rumored project. Score-signal-link, signal-Evidence-link, and Evidence citation policies admit rows only when the parent project is active and the linked signal is already public under the existing signal policy. Policy predicates use stable, narrowly granted helper functions that resolve current-score and public-citation eligibility without exposing source bodies or private identifiers.

Column grants expose only columns required by the two projections. In particular:

- `evidence`: `id`, `source_id`, `source_field`, `quote_text`, `verified_at`
- `signal_evidence_links`: `signal_id`, `evidence_id`
- `score_signal_links`: `project_score_id`, `signal_id`
- `score_factors`: `project_score_id`, `axis`, `factor_code`, `contribution`, `input_value`, `detail`

No browser role receives INSERT, UPDATE, DELETE, TRUNCATE, broad table SELECT, Raw Item SELECT, governance-history SELECT, or function access that returns unsafe fields. Existing append-only triggers and Promotion Service boundaries remain unchanged.

### 5.5 Repository and data flow

Extend `ProjectRepository` with:

```ts
listCurrentScoreFactors(projectId: string, projectScoreId: string): Promise<ProjectScoreFactor[]>;
listCurrentScoreEvidenceCitations(
  projectId: string,
  projectScoreId: string,
): Promise<ProjectEvidenceCitation[]>;
```

Both methods validate UUID inputs, query the dedicated view using both project and score IDs, apply deterministic ordering, strictly parse returned rows, and throw domain-specific query errors with PostgREST codes. They never fall back to base-table reads or privileged credentials.

`loadProjectDetail` performs:

1. Read project and immutable current score ID.
2. Read published project signals using the existing Evidence-gated path.
3. If there is a score, read factors and citations for that exact score ID.
4. Return empty arrays when valid projections contain no rows.
5. Propagate query failures so the page does not silently present an incomplete Evidence set as complete.

## 6. User Interface

Keep the current metric cards and deterministic explanation.

Add a score-factor section immediately below the explanation:

- Three labeled groups: 机会、风险、置信度.
- Each row displays a localized factor label, deterministic `detail`, contribution, and input value.
- Ordering is deterministic: axis order opportunity → risk → confidence, then contribution descending, then factor code ascending.
- Unknown future factor codes use a safe humanized fallback rather than failing the whole page.
- If the current score has no factor rows, show “该评分快照暂无因子分解数据。”

Add a separate Evidence section before the existing signal timeline:

- Group citation rows by signal.
- Show the signal title and verification/publication metadata once per group.
- Show each exact quote in a `<blockquote>`-style plain-text component with source name/type and Evidence verification time.
- Show “项目登记为官方来源” only when the project-source relation is verified and official; do not use “官方确认空投”等结论性文案.
- Do not render anchors, URLs, HTML, Markdown, or provider metadata from citations.
- Include the notice: “以下为本次评分快照使用的证据集，不代表每条证据单独决定某个评分因子。”
- If a valid score has no citation rows, show an explicit unavailable state rather than implying that the explanation itself is Evidence. For a rumored project, explain that its signals and citations are not public yet.

Update the existing fixture note so it no longer says Evidence links will arrive in a later phase. It must distinguish seed fixture scores from deterministic pipeline scores and clarify that no external citation links are exposed yet.

## 7. Error Handling and Security Behavior

- Invalid project or score IDs fail before network access.
- PostgREST errors are wrapped in factor- or citation-specific repository errors.
- Malformed database rows fail strict parsing; the page does not coerce or omit unexpected fields.
- Citation text is treated as untrusted data even though it is reviewed and grounded. React escaping plus plain-text-only rendering is mandatory.
- No user-visible copy interprets the quote as an instruction or increases claim certainty beyond the signal's stored verification state.
- Historical, incomplete, inactive-project, paused-project, unevidenced, or non-current score rows are invisible to browser roles. Rumored-project factor rows may be visible because their scores are already public, but their signal and Evidence citation rows remain hidden.
- Multiple or conflicting Evidence records remain visible as separate citations; no record is overwritten, silently deduplicated by quote text, or chosen as “the truth.” Exact duplicate IDs may be collapsed only as a defensive presentation safeguard.

## 8. Testing Strategy

Follow RED → GREEN for each layer.

### 8.1 Contracts

- Accept exact factor and citation projections.
- Reject extra keys, unsafe/missing fields, invalid UUIDs/timestamps, unsupported axes/verifications/source types, out-of-range values, and citation text outside 10–500 characters.

### 8.2 Migration and authorization

Against disposable Supabase:

- Verify exact view columns, owner, `security_invoker`, and `security_barrier` options.
- Verify current Evidence-complete factor rows are visible for active and rumored projects, while citation rows are visible only for active projects.
- Verify historical scores, zero-link scores, unevidenced scores, inactive/paused projects, rumored-project citations, and unrelated rows are hidden from the projections where they are not eligible.
- Verify Raw Item columns, URLs, candidate payloads, review notes, audit/outbox payloads, hashes, and governance commands remain inaccessible.
- Verify anonymous, authenticated owner/non-owner, ordinary admin, active reviewer, revoked reviewer, service role, AI worker, Promotion Service, collection worker, and queue worker behavior.
- Verify no browser mutation path exists.
- Verify multiple and conflicting Evidence citations remain distinct.

### 8.3 Repository

- Unit-test UUID validation, selected columns, both filters, ordering, strict mapping, empty results, and query-error wrapping.
- Integration-test real anon PostgREST reads for the exact current score, hidden historical/incomplete data, and absence of unsafe fields.

### 8.4 Web

- Render three independent factor groups and localized labels.
- Render grouped inert citation text and source metadata without anchors or HTML interpretation.
- Render factor/citation empty states.
- Verify the explanatory notice and official-source wording.
- Add a static/bundle regression assertion that forbidden URL/raw/governance fields are not referenced by the public detail component.

### 8.5 Completion gates

Run the narrowest tests after each RED/GREEN cycle, then:

```bash
pnpm test:db
pnpm verify
```

Use Node 22.22.2 and pnpm 11.16.0. Production rollout is not part of acceptance.

## 9. Delivery Sequence

1. Contracts and unit tests.
2. Forward-only migration, generated database types, and pgTAP authorization tests.
3. Repository interfaces, strict mapping, unit tests, and disposable integration tests.
4. Web query composition, components, copy, and rendering tests.
5. Full disposable database gate, repository integration gate, `pnpm verify`, documentation, and HANDOVER update.

Each task is independently committed only after its acceptance checks pass.

## 10. Acceptance Criteria

- An active or rumored project with a current Evidence-complete score shows its three independent factor groups.
- The same immutable score ID determines the displayed totals, factors, and Evidence set.
- An active project shows reviewed bounded Evidence citation text and safe source metadata without any outbound link; a rumored project does not expose its signals or citations.
- The page explicitly describes citations as score-level evidence, not factor-level proof.
- Browser roles cannot read historical/incomplete/private rows or unsafe columns and cannot mutate any affected table or view.
- Existing Evidence gates, Promotion Service writes, append-only history, scoring math, and opportunity ordering remain unchanged.
- Focused tests, disposable database tests, and `pnpm verify` pass under the declared runtime.
- The implementation does not access or modify production.
