# Project Score Factors and Evidence Citations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show deterministic score factors and the reviewed score-level Evidence set on project detail pages through minimum-privilege anonymous read projections.

**Architecture:** Add strict shared row contracts, one forward-only PostgreSQL migration, two security-invoker browser-safe views, and narrowly scoped RLS/column grants. Carry the immutable current score ID from `project_current_state` through the repository so totals, factors, and citations always use one snapshot; render factors and Evidence in separate React components.

**Tech Stack:** Node.js 22.22.2, pnpm 11.16.0, TypeScript strict mode, Zod 4, PostgreSQL/Supabase RLS and PostgREST, pgTAP, Vitest, Next.js 16 App Router, React 19.

**Spec:** `docs/superpowers/specs/2026-08-24-project-score-evidence-detail-design.md`

## Global Constraints

- Use Node.js 22.22.2 and pnpm 11.16.0 for every acceptance gate.
- Treat citation text as untrusted inert plain text; never parse it as HTML, Markdown, a URL, or an instruction.
- Do not expose `sources.canonical_url`, Raw Item URLs/bodies, candidate payloads, review notes, hashes, provider errors, audit/outbox payloads, or credentials.
- Keep opportunity, risk, and confidence independent; do not change scoring math, thresholds, recommendations, or score history.
- Factors are score decomposition; citations are a score-level Evidence set. Do not infer factor-to-Evidence causality.
- Active and rumored projects may expose factors; only active projects may expose signals and Evidence citations.
- Use only forward migrations. Never edit an applied migration.
- Run database resets only against the marker-verified disposable Supabase stack. Never reset or mutate production.
- Add no dependency. Reuse Zod, Supabase, React, pgTAP, and Vitest already present.
- After every task, update `docs/tasks/project-score-evidence-detail-workbook.md` and `docs/HANDOVER.md` before committing.

## Planned File Structure

- `packages/contracts/src/read-models/project-score-evidence.ts` — strict snake-case database projection schemas and exported types.
- `packages/contracts/src/read-models/project-score-evidence.test.ts` — exact-shape, bounds, and unsafe-field contract tests.
- `supabase/migrations/20260824000100_project_score_evidence_detail.sql` — score identity, eligibility helpers, RLS/column grants, and two public views.
- `supabase/tests/012_project_score_evidence_detail.test.sql` — exact catalog, visibility, denial, and mutation matrix.
- `packages/database/src/repositories/project-score-evidence.ts` — focused row parsing, mapping, sorting, and query errors.
- `packages/database/src/repositories/project-repository.ts` — public repository interface and delegation to the focused helper.
- `packages/database/src/tests/project-score-evidence.test.ts` — repository unit tests.
- `packages/database/src/tests/project-repository.integration.test.ts` — real anon PostgREST fixture and visibility assertions.
- `apps/web/src/components/project-score-evidence.tsx` — factor groups, citation groups, safe labels, and empty states.
- `apps/web/src/tests/project-score-evidence.test.ts` — static-render and unsafe-markup regression tests.
- `apps/web/src/lib/project-detail-loader.ts` and `apps/web/src/tests/project-detail-loader.test.ts` — pure repository orchestration for one immutable score snapshot.
- `apps/web/src/lib/opportunity-queries.ts` and `apps/web/src/app/projects/[slug]/page.tsx` — create the anon repository, load, and render the new data.
- `docs/tasks/project-score-evidence-detail-workbook.md` — per-task RED/GREEN evidence and commit ledger.

## Execution Preflight

Before Task 1, invoke `superpowers:using-git-worktrees`, create branch `codex/project-score-evidence-detail` under the ignored `.worktrees/` directory, install from the existing lockfile, and run the declared-runtime baseline:

```bash
env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm install --frozen-lockfile
env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm verify
```

Expected: the baseline exits 0 with the repository's current 798 non-skipped tests. Record the actual count and worktree path in the workbook and HANDOVER. Preserve all unrelated untracked files.

---

### Task 1: Define strict public projection contracts

**Files:**
- Create: `packages/contracts/src/read-models/project-score-evidence.ts`
- Create: `packages/contracts/src/read-models/project-score-evidence.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/domain/src/scoring/score-model.ts`
- Create: `docs/tasks/project-score-evidence-detail-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: existing `sourceTypeSchema` and `signalVerificationSchema` from `packages/contracts/src/enums.ts`.
- Produces: `scoringAxisSchema`, `PublicProjectScoreFactorRow`, `PublicProjectEvidenceCitationRow`, and their strict schemas; `ScoringAxis` becomes the shared enum type used by the domain score model.

- [ ] **Step 1: Write the contract RED tests**

Create exact valid fixtures and assert strict rejection:

```ts
const factorRow = {
  project_id: projectId,
  project_score_id: scoreId,
  axis: 'opportunity',
  factor_code: 'signal_strength',
  contribution: 42.5,
  input_value: 0.8,
  detail: '加权信号强度 80.0%',
} as const;

const citationRow = {
  project_id: projectId,
  project_score_id: scoreId,
  signal_id: signalId,
  signal_title: '积分计划延长',
  signal_verification: 'verified',
  signal_published_at: '2026-08-24T00:00:00.000Z',
  evidence_id: evidenceId,
  citation_text: '官方公告明确说明积分计划将继续开放。',
  evidence_source_field: 'article_raw_text',
  evidence_verified_at: '2026-08-24T01:00:00.000Z',
  source_id: sourceId,
  source_name: '项目官方博客',
  source_type: 'official_web',
  source_is_official: true,
  source_relation_verified_at: '2026-08-23T00:00:00.000Z',
} as const;

expect(publicProjectScoreFactorRowSchema.parse(factorRow)).toEqual(factorRow);
expect(publicProjectEvidenceCitationRowSchema.parse(citationRow)).toEqual(citationRow);
expect(publicProjectScoreFactorRowSchema.safeParse({ ...factorRow, url: 'https://unsafe.test' }).success).toBe(false);
expect(publicProjectEvidenceCitationRowSchema.safeParse({ ...citationRow, raw_text: 'private' }).success).toBe(false);
```

Add table-driven failures for invalid UUIDs, invalid RFC 3339 timestamps, unsupported axes/source fields/enums, factor values outside 0–100, blank/overlong details, citation length 9/501, and `source_is_official: true` with a null relation verification time.

- [ ] **Step 2: Run RED and confirm the missing exports are the reason**

Run:

```bash
pnpm --filter @airdrop/contracts test -- project-score-evidence.test.ts
```

Expected: FAIL because `project-score-evidence.ts` and its exports do not exist. A syntax/configuration error is not an accepted RED.

- [ ] **Step 3: Implement the minimum strict schemas**

Use Zod `.strict()` objects, existing enum schemas, `z.uuid()`, `z.iso.datetime({ offset: true })`, trimmed bounded strings, and this shared enum:

```ts
export const scoringAxisSchema = z.enum(['opportunity', 'risk', 'confidence']);
export type ScoringAxis = z.infer<typeof scoringAxisSchema>;
```

Add a `superRefine` rule requiring `source_relation_verified_at` when `source_is_official` is true. Export schemas/types from `packages/contracts/src/index.ts`, and replace the local `ScoringAxis` declaration in `score-model.ts` with an imported/re-exported contract type.

- [ ] **Step 4: Run focused GREEN and contract/domain guards**

Run:

```bash
pnpm --filter @airdrop/contracts test
pnpm --filter @airdrop/contracts typecheck
pnpm --filter @airdrop/domain test
pnpm --filter @airdrop/domain typecheck
```

Expected: all commands exit 0; existing deterministic score tests remain unchanged.

- [ ] **Step 5: Update the workbook and HANDOVER**

Record the RED failure, exact GREEN counts, shared type names, and that no application/database behavior changed in Task 1.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/contracts/src/read-models/project-score-evidence.ts \
  packages/contracts/src/read-models/project-score-evidence.test.ts \
  packages/contracts/src/index.ts packages/domain/src/scoring/score-model.ts \
  docs/tasks/project-score-evidence-detail-workbook.md docs/HANDOVER.md
git commit -m "feat(contracts): define public score evidence projections"
```

---

### Task 2: Add the minimum-privilege database read boundary

**Files:**
- Create: `supabase/tests/012_project_score_evidence_detail.test.sql`
- Create: `supabase/migrations/20260824000100_project_score_evidence_detail.sql`
- Modify: `packages/database/src/generated/database.types.ts`
- Modify: `docs/tasks/project-score-evidence-detail-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: `signal_has_valid_evidence(uuid)`, `score_has_complete_evidence(uuid)`, `project_current_state`, `project_scores`, `score_factors`, `score_signal_links`, `signal_evidence_links`, `evidence`, `sources`, and `project_sources`.
- Produces: `project_score_id` on `project_current_state`; helpers `current_project_score_is_public(uuid)` and `current_score_citation_path_is_public(uuid, uuid, uuid)`; views `project_current_score_factors` and `project_current_score_evidence_citations`.

- [ ] **Step 1: Write the pgTAP RED suite before the migration**

The suite must assert:

```sql
select has_function('public', 'current_project_score_is_public', array['uuid']);
select has_function(
  'public',
  'current_score_citation_path_is_public',
  array['uuid', 'uuid', 'uuid']
);
select has_view('public', 'project_current_score_factors');
select has_view('public', 'project_current_score_evidence_citations');
select has_column('public', 'project_current_state', 'project_score_id');
```

Add exact `columns_are`, reloptions, grants, mutation denials, and fixture visibility tests. Fixtures must include: active current score, rumored current score, historical score, zero-link score, unevidenced score, paused project, two distinct Evidence records for one signal, and an unrelated private row.

- [ ] **Step 2: Run focused RED on the marker-verified disposable stack**

Synchronize only `012_project_score_evidence_detail.test.sql` to the disposable project while leaving the migration absent, then run:

```bash
supabase test db supabase/tests/012_project_score_evidence_detail.test.sql
```

Expected: named failures for the missing helpers/views/column. Confirm the target is `airdrop-intelligence-governance-test` on DB 64322 before the command; production DB 54322 must not be connected.

- [ ] **Step 3: Implement the forward-only migration**

Implement both helpers as `stable security definer` functions owned by `postgres`, with `set search_path = pg_catalog, public`, revoked from `public`, and executable only by `anon` and `authenticated`.

`current_project_score_is_public(score_id)` must return true only when the score:

```sql
project.lifecycle in ('active', 'rumored')
and public.score_has_complete_evidence(score.id)
and score.id = (
  select latest.id
  from public.project_scores as latest
  where latest.project_id = score.project_id
    and public.score_has_complete_evidence(latest.id)
  order by latest.calculated_at desc, latest.id desc
  limit 1
)
```

`current_score_citation_path_is_public(score_id, signal_id, evidence_id)` accepts null filters but requires at least one non-null argument. It returns true only for a complete joined path whose project is active, score is current and Evidence-complete, signal is published and Evidence-valid, the score links the signal, and the signal links the exact Evidence record with matching Source/Raw Item/project identity.

Create anon/authenticated SELECT policies:

```sql
using (public.current_project_score_is_public(project_score_id))
```

for `score_factors`, and path-helper policies for the three citation tables using the IDs available on each row. Grant only the safe columns listed in the spec. Do not grant Raw Item SELECT or any mutation privilege.

Recreate `project_current_state` with `latest_score.id as project_score_id` appended as its final column and grant `project_scores.id` column SELECT to anon/authenticated. Create both exact-column security-invoker/security-barrier views and grant their SELECT only to anon/authenticated.

In the citation view, compute `source_is_official` as `project_source.is_official and project_source.verified_at is not null`; never infer it from the source type. Return `source_relation_verified_at` separately and return no URL column.

- [ ] **Step 4: Reset only the disposable stack and run focused GREEN**

```bash
supabase db reset --yes
supabase test db supabase/tests/012_project_score_evidence_detail.test.sql
```

Expected: reset exits 0 and focused pgTAP passes. The suite must prove active factors/citations visible, rumored factors visible, rumored citations hidden, historical/incomplete/paused rows hidden, two Evidence rows preserved, unsafe columns denied, and all browser mutations denied.

- [ ] **Step 5: Run the full database regression gate**

```bash
supabase test db
```

Expected: all pgTAP files pass. Update older exact view-column/policy-catalog assertions only when the new forward migration intentionally changes their expected catalog; do not weaken unrelated assertions.

- [ ] **Step 6: Regenerate types twice from the disposable schema**

Use the runbook's remote disposable generation procedure. Generate to two temporary files, require `cmp` success, then replace the committed generated file through the approved generation command. Confirm both SHA-256 values match and that the two new views plus `project_score_id` appear in the generated type.

- [ ] **Step 7: Update workbook and HANDOVER**

Record disposable topology, RED failures, focused/full pgTAP counts, generated-type SHA-256, exact grants, and the explicit statement that production was untouched.

- [ ] **Step 8: Commit Task 2**

```bash
git add supabase/migrations/20260824000100_project_score_evidence_detail.sql \
  supabase/tests/012_project_score_evidence_detail.test.sql \
  packages/database/src/generated/database.types.ts \
  docs/tasks/project-score-evidence-detail-workbook.md docs/HANDOVER.md
git commit -m "feat(db): expose safe score evidence detail"
```

---

### Task 3: Add strict repository reads for one immutable score snapshot

**Files:**
- Create: `packages/database/src/repositories/project-score-evidence.ts`
- Create: `packages/database/src/tests/project-score-evidence.test.ts`
- Modify: `packages/database/src/repositories/project-repository.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `docs/tasks/project-score-evidence-detail-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: Task 1 row schemas and Task 2 generated view types.
- Produces: `ProjectScoreFactor`, `ProjectEvidenceCitation`, `ProjectScoreFactorQueryError`, `ProjectEvidenceCitationQueryError`, and two new `ProjectRepository` methods with the signatures in the spec.

- [ ] **Step 1: Write repository RED tests**

Build a fake Supabase query recorder and assert the wished-for API:

```ts
const factors = await repository.listCurrentScoreFactors(projectId, scoreId);
expect(factors).toEqual([
  {
    axis: 'opportunity',
    factorCode: 'signal_strength',
    contribution: 42.5,
    inputValue: 0.8,
    detail: '加权信号强度 80.0%',
  },
]);
expect(client.filters).toEqual([
  ['project_id', projectId],
  ['project_score_id', scoreId],
]);
```

Add citation mapping, deterministic sort, empty-array, malformed-row rejection, PostgREST error wrapping, invalid project ID, and invalid score ID tests. Assert selected column strings contain only the exact safe projection columns and no URL/raw/governance fields.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @airdrop/database test -- project-score-evidence.test.ts
```

Expected: FAIL because the repository methods/helper module do not exist.

- [ ] **Step 3: Implement minimal strict repository behavior**

Add `id` to `ProjectScore`, select `project_score_id` from `project_current_state`, and delegate the two methods to focused helper functions. Parse every row with the Task 1 Zod schemas before mapping.

Use factor ordering:

```ts
const axisOrder = { opportunity: 0, risk: 1, confidence: 2 } as const;
factors.sort((left, right) =>
  axisOrder[left.axis] - axisOrder[right.axis]
  || right.contribution - left.contribution
  || left.factorCode.localeCompare(right.factorCode),
);
```

Order citations by signal publication descending/null last, signal ID, Evidence verification descending, and Evidence ID. Wrap PostgREST failures without leaking response bodies.

- [ ] **Step 4: Run focused GREEN and package checks**

```bash
pnpm --filter @airdrop/database test -- project-score-evidence.test.ts project-repository.test.ts
pnpm --filter @airdrop/database lint
pnpm --filter @airdrop/database typecheck
```

Expected: all commands exit 0 and existing project repository tests remain green after adding the required score ID fixture field.

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add packages/database/src/repositories/project-score-evidence.ts \
  packages/database/src/repositories/project-repository.ts packages/database/src/index.ts \
  packages/database/src/tests/project-score-evidence.test.ts \
  packages/database/src/tests/project-repository.test.ts \
  docs/tasks/project-score-evidence-detail-workbook.md docs/HANDOVER.md
git commit -m "feat(database): read current score evidence detail"
```

---

### Task 4: Prove real anonymous PostgREST visibility and isolation

**Files:**
- Modify: `packages/database/src/tests/project-repository.integration.test.ts`
- Modify: `docs/tasks/project-score-evidence-detail-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: Task 2 disposable schema and Task 3 repository methods.
- Produces: real integration coverage for current snapshot consistency, active/rumored behavior, historical denial, and exact citation preservation.

- [ ] **Step 1: Write integration RED fixtures and assertions**

Append exact disposable fixtures with randomized test-owned IDs. Insert an active and a rumored project, current/historical scores, factors, score links, two grounded Evidence records, and their signal links. Then assert:

```ts
expect(detail?.latestScore?.id).toBe(activeCurrentScoreId);
expect(await repository.listCurrentScoreFactors(activeProjectId, activeCurrentScoreId)).toHaveLength(3);
expect(await repository.listCurrentScoreEvidenceCitations(activeProjectId, activeCurrentScoreId)).toHaveLength(2);
expect(await repository.listCurrentScoreEvidenceCitations(rumoredProjectId, rumoredScoreId)).toEqual([]);
expect(await repository.listCurrentScoreFactors(activeProjectId, historicalScoreId)).toEqual([]);
```

Also assert the two citations retain distinct Evidence IDs/text and the returned objects have no URL/raw/hash/reviewer keys.

- [ ] **Step 2: Run RED against the reset disposable stack**

```bash
pnpm --filter @airdrop/database test:integration
```

Expected: the new assertions fail because the repository integration fixture/query path is not yet complete. The environment guard must confirm disposable-only URLs before any fixture write.

- [ ] **Step 3: Add the minimum fixture support and integration script entry**

Keep fixture writes inside the existing marker-verified disposable setup. Do not delete append-only Evidence or link history during cleanup; use a fresh disposable reset after the focused run. The modified project integration file is already part of `test:integration`, so no package script change is required.

- [ ] **Step 4: Run focused and full integration GREEN**

```bash
pnpm --filter @airdrop/database test -- project-score-evidence.test.ts
pnpm --filter @airdrop/database test:integration
```

Expected: unit tests and every integration repository file pass with explicit zero exit status.

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add packages/database/src/tests/project-repository.integration.test.ts \
  docs/tasks/project-score-evidence-detail-workbook.md docs/HANDOVER.md
git commit -m "test(database): cover public score evidence reads"
```

---

### Task 5: Render factor groups and inert Evidence citations

**Files:**
- Create: `apps/web/src/components/project-score-evidence.tsx`
- Create: `apps/web/src/tests/project-score-evidence.test.ts`
- Create: `apps/web/src/lib/project-detail-loader.ts`
- Create: `apps/web/src/tests/project-detail-loader.test.ts`
- Modify: `apps/web/src/lib/opportunity-queries.ts`
- Modify: `apps/web/src/app/projects/[slug]/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `docs/tasks/project-score-evidence-detail-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: Task 3 `ProjectScoreFactor` and `ProjectEvidenceCitation` types and repository methods.
- Produces: `ScoreFactorGroups` and `ScoreEvidenceCitations` React components; `loadProjectDetail` returns `{ project, signals, factors, citations }`.

- [ ] **Step 1: Write component and query-composition RED tests**

Use `renderToStaticMarkup` and assert:

```ts
const html = renderToStaticMarkup(
  createElement(ScoreEvidenceCitations, {
    projectLifecycle: 'active',
    citations: [citationWithText('<script>alert(1)</script> reviewed quote')],
  }),
);
expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; reviewed quote');
expect(html).not.toContain('<script>');
expect(html).not.toContain('<a');
expect(html).toContain('本次评分快照使用的证据集');
```

Add tests for the three axis groups, contribution/input display, unknown factor-code fallback, factor empty state, active citation grouping, multiple conflicting citations, rumored citation-hidden copy, official-source wording, and the absence of `href`, `canonical_url`, `raw_text`, `reviewer`, and `outbox` in the component source.

In `project-detail-loader.test.ts`, use a real object implementing `ProjectRepository` and prove both new methods receive the exact `projectId` and `latestScore.id`. Add a scoreless case proving it returns empty factors/citations without calling either method, while still loading the existing signal timeline.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @airdrop/web test -- project-score-evidence.test.ts
```

Expected: FAIL because the components and expanded detail result do not exist.

- [ ] **Step 3: Implement the minimum components and loader changes**

Use explicit localized label maps for the nine current factor codes and eight source types. Render citation text directly as a React text child inside `<blockquote>`; never use `dangerouslySetInnerHTML`, Markdown, URL parsing, or anchors.

Implement this pure boundary in `project-detail-loader.ts` and let `loadProjectDetail` create the repository and delegate to it:

```ts
const scoreId = project.latestScore?.id;
if (scoreId === undefined) {
  return { project, signals, factors: [], citations: [] };
}
const [factors, citations] = await Promise.all([
  repository.listCurrentScoreFactors(project.projectId, scoreId),
  repository.listCurrentScoreEvidenceCitations(project.projectId, scoreId),
]);
return { project, signals, factors, citations };
```

Keep the existing signal query behavior. Insert factor and Evidence sections in the order specified by the design, and update the fixture note to state that outbound citation links are not exposed yet.

- [ ] **Step 4: Run focused GREEN and Web gates**

```bash
pnpm --filter @airdrop/web test
pnpm --filter @airdrop/web lint
pnpm --filter @airdrop/web typecheck
pnpm --filter @airdrop/web build
```

Expected: all Web tests and build pass; generated HTML contains no citation anchor or executable source markup.

- [ ] **Step 5: Update workbook/HANDOVER and commit**

```bash
git add apps/web/src/components/project-score-evidence.tsx \
  apps/web/src/tests/project-score-evidence.test.ts \
  apps/web/src/lib/project-detail-loader.ts apps/web/src/tests/project-detail-loader.test.ts \
  apps/web/src/lib/opportunity-queries.ts 'apps/web/src/app/projects/[slug]/page.tsx' \
  apps/web/src/app/globals.css docs/tasks/project-score-evidence-detail-workbook.md \
  docs/HANDOVER.md
git commit -m "feat(web): show score factors and evidence citations"
```

---

### Task 6: Security sensitivity, full gates, and handover

**Files:**
- Modify: `supabase/tests/012_project_score_evidence_detail.test.sql` only if a named sensitivity assertion needs strengthening.
- Modify: `apps/web/src/tests/project-score-evidence.test.ts` only if a named unsafe-render assertion needs strengthening.
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/tasks/project-score-evidence-detail-workbook.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: Tasks 1–5 complete feature.
- Produces: mutation evidence, complete repository/database/root verification, operator guidance, and final handover status.

- [ ] **Step 1: Run database sensitivity RED/GREEN**

On a disposable copy only, temporarily weaken the citation view by adding `raw_item.final_url as citation_url` or grant an unsafe Evidence column. Run focused 012 and require a named exact-column/privilege assertion to fail. Restore the committed migration bytes and rerun focused 012 to GREEN. Record both artifact SHA-256 values and the named failure; do not commit the mutation.

- [ ] **Step 2: Run UI sensitivity RED/GREEN**

Temporarily render an `<a href="https://unsafe.test">` in the citation component. Run the focused Web test and require the no-anchor assertion to fail. Restore the component and rerun GREEN; do not commit the mutation.

- [ ] **Step 3: Run final disposable database and integration gates**

After verifying the disposable marker:

```bash
supabase db reset --yes
supabase test db
pnpm --filter @airdrop/database test:integration
```

Expected: all migrations apply, all pgTAP files pass, and every repository integration test passes. Production remains untouched.

- [ ] **Step 4: Run the declared-runtime repository gate**

```bash
env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm verify
git diff --check
```

Expected: lint, typecheck, all non-integration unit/contract tests, build, placeholders, and whitespace checks exit 0.

- [ ] **Step 5: Perform the unsafe-field and secret scan**

```bash
rg -n "canonical_url|final_url|request_url|raw_text|candidate_payload|reviewer|outbox|service_role|private_key|mnemonic|seed phrase|password=|Bearer " \
  apps/web/src/components/project-score-evidence.tsx \
  packages/contracts/src/read-models/project-score-evidence.ts \
  packages/database/src/repositories/project-score-evidence.ts \
  supabase/migrations/20260824000100_project_score_evidence_detail.sql
```

Expected: every match is an explicit prohibition, server-side policy predicate, or named negative test; no rendered/query projection field, secret value, privileged credential, or unsafe URL remains.

- [ ] **Step 6: Update runbook, workbook, and HANDOVER**

Document the public read model, no-link rule, active-versus-rumored behavior, focused test commands, disposable-only reset rule, actual test counts, commits, and production-not-accessed statement. Mark the feature “local implementation complete; production unapplied” only after every gate passes.

- [ ] **Step 7: Commit Task 6**

```bash
git add supabase/tests/012_project_score_evidence_detail.test.sql \
  apps/web/src/tests/project-score-evidence.test.ts \
  docs/runbooks/local-development.md docs/tasks/project-score-evidence-detail-workbook.md \
  docs/HANDOVER.md
git commit -m "docs: close project score evidence detail"
```

- [ ] **Step 8: Run post-commit verification and inspect branch state**

```bash
env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm verify
git status --short
git log --oneline --decorate -8
```

Expected: verify exits 0; only pre-existing untracked personal files may remain; the branch contains six independently reviewable task commits plus any documented fix-round commits.
