create table public.signals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  signal_type text not null,
  title text not null,
  summary text not null,
  verification public.signal_verification not null default 'unverified',
  lifecycle public.signal_lifecycle not null default 'detected',
  confidence numeric(5,2) not null,
  occurred_at timestamptz null,
  published_at timestamptz null,
  expires_at timestamptz null,
  supersedes_signal_id uuid null,
  created_at timestamptz not null default now(),
  constraint signals_signal_type_valid check (
    signal_type = pg_catalog.btrim(signal_type)
    and pg_catalog.char_length(signal_type) between 1 and 100
  ),
  constraint signals_title_valid check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 1 and 200
  ),
  constraint signals_summary_valid check (
    summary = pg_catalog.btrim(summary)
    and pg_catalog.char_length(summary) between 1 and 2000
  ),
  constraint signals_confidence_bounds check (
    confidence between 0 and 100
  ),
  constraint signals_expiry_after_occurrence check (
    expires_at is null
    or occurred_at is null
    or expires_at > occurred_at
  ),
  constraint signals_published_at_required_for_published check (
    lifecycle <> 'published'
    or published_at is not null
  ),
  constraint signals_not_self_superseding check (
    supersedes_signal_id is null
    or supersedes_signal_id <> id
  ),
  constraint signals_project_id_id_key unique (project_id, id),
  constraint signals_supersedes_signal_same_project_fkey foreign key (
    project_id,
    supersedes_signal_id
  ) references public.signals (project_id, id) on delete restrict
);

create table public.project_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  model_version text not null,
  input_version text not null,
  opportunity_score numeric(5,2) not null,
  risk_score numeric(5,2) not null,
  confidence numeric(5,2) not null,
  recommendation public.recommendation not null,
  explanation text not null,
  calculated_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint project_scores_model_version_valid check (
    model_version = pg_catalog.btrim(model_version)
    and pg_catalog.char_length(model_version) between 1 and 80
  ),
  constraint project_scores_input_version_valid check (
    input_version = pg_catalog.btrim(input_version)
    and pg_catalog.char_length(input_version) between 1 and 128
  ),
  constraint project_scores_opportunity_bounds check (
    opportunity_score between 0 and 100
  ),
  constraint project_scores_risk_bounds check (
    risk_score between 0 and 100
  ),
  constraint project_scores_confidence_bounds check (
    confidence between 0 and 100
  ),
  constraint project_scores_explanation_valid check (
    explanation = pg_catalog.btrim(explanation)
    and pg_catalog.char_length(explanation) between 1 and 4000
  ),
  unique (project_id, model_version, input_version)
);

create index signals_project_id_created_at_idx
on public.signals (project_id, created_at desc);

create index signals_lifecycle_published_at_idx
on public.signals (lifecycle, published_at desc);

create index project_scores_project_id_calculated_at_id_idx
on public.project_scores (project_id, calculated_at desc, id desc);

alter table public.signals enable row level security;
alter table public.project_scores enable row level security;

revoke all on table public.signals from public, anon, authenticated, service_role;
revoke all on table public.project_scores from public, anon, authenticated, service_role;

grant select on table public.signals to anon, authenticated, service_role;
grant select on table public.project_scores to service_role;

create policy signals_read_published_active_project
on public.signals
for select
to anon, authenticated
using (
  lifecycle = 'published'
  and exists (
    select 1
    from public.projects as project
    where project.id = signals.project_id
      and project.lifecycle = 'active'
  )
);
