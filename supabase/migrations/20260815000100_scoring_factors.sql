-- Phase 4 scoring pipeline: score decomposition and signal linkage.
-- score_factors decomposes each project_scores row into per-axis factor rows;
-- score_signal_links records exactly which published signals a score consumed.
-- The stage worker boundary (ai_stage_worker) is reused for the deterministic
-- scoring stage; see docs/superpowers/specs/2026-08-15-score-pipeline-design.md.

create table public.score_factors (
  id uuid primary key default gen_random_uuid(),
  project_score_id uuid not null
    constraint score_factors_project_score_fkey
    references public.project_scores (id) on delete restrict,
  axis text not null,
  factor_code text not null,
  contribution numeric(6,2) not null,
  input_value numeric(10,4) not null,
  detail text not null,
  created_at timestamptz not null default now(),
  constraint score_factors_axis_valid check (
    axis in ('opportunity', 'risk', 'confidence')
  ),
  constraint score_factors_factor_code_valid check (
    factor_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint score_factors_contribution_bounds check (
    contribution between 0 and 100
  ),
  constraint score_factors_input_value_bounds check (
    input_value between 0 and 100
  ),
  constraint score_factors_detail_valid check (
    detail = pg_catalog.btrim(detail)
    and pg_catalog.char_length(detail) between 1 and 500
  ),
  constraint score_factors_code_unique_per_score unique (project_score_id, factor_code)
);

create table public.score_signal_links (
  project_score_id uuid not null
    constraint score_signal_links_project_score_fkey
    references public.project_scores (id) on delete restrict,
  signal_id uuid not null
    constraint score_signal_links_signal_fkey
    references public.signals (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (project_score_id, signal_id)
);

alter table public.score_factors enable row level security;
alter table public.score_signal_links enable row level security;

revoke all on table public.score_factors from public, anon, authenticated, service_role;
revoke all on table public.score_signal_links from public, anon, authenticated, service_role;

-- Scoring stage writes through the existing stage worker boundary.
grant usage on schema public to ai_stage_worker;
grant select, insert on table public.project_scores to ai_stage_worker;
grant select on table public.signals to ai_stage_worker;
grant select on table public.projects to ai_stage_worker;
grant select on table public.project_sources to ai_stage_worker;
grant select, insert on table public.score_factors to ai_stage_worker;
grant select, insert on table public.score_signal_links to ai_stage_worker;

create policy project_scores_ai_stage_worker_read
on public.project_scores
for select
to ai_stage_worker
using (true);

create policy project_scores_ai_stage_worker_insert
on public.project_scores
for insert
to ai_stage_worker
with check (true);

create policy signals_ai_stage_worker_read
on public.signals
for select
to ai_stage_worker
using (true);

create policy projects_ai_stage_worker_read
on public.projects
for select
to ai_stage_worker
using (true);

create policy project_sources_ai_stage_worker_read
on public.project_sources
for select
to ai_stage_worker
using (true);

create policy score_factors_ai_stage_worker_read
on public.score_factors
for select
to ai_stage_worker
using (true);

create policy score_factors_ai_stage_worker_insert
on public.score_factors
for insert
to ai_stage_worker
with check (true);

create policy score_signal_links_ai_stage_worker_read
on public.score_signal_links
for select
to ai_stage_worker
using (true);

create policy score_signal_links_ai_stage_worker_insert
on public.score_signal_links
for insert
to ai_stage_worker
with check (true);

-- Browser exposure of factors and links lands with the detail-page work;
-- until then RLS denies all non-stage-worker access by omission.
