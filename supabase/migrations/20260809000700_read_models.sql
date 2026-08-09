set search_path = pg_catalog, public;

create view public.project_current_state
with (security_invoker = true, security_barrier = true)
as
select
  project.id as project_id,
  project.slug,
  project.name,
  project.summary,
  project.lifecycle,
  project.primary_chain,
  project.version as project_version,
  project.updated_at as project_updated_at,
  latest_score.opportunity_score,
  latest_score.risk_score,
  latest_score.confidence as score_confidence,
  latest_score.recommendation,
  latest_score.calculated_at as score_calculated_at,
  latest_signal.latest_published_signal_at
from public.projects as project
left join lateral (
  select
    score.opportunity_score,
    score.risk_score,
    score.confidence,
    score.recommendation,
    score.calculated_at
  from public.project_scores as score
  where score.project_id = project.id
  order by score.calculated_at desc, score.id desc
  limit 1
) as latest_score on true
left join lateral (
  select pg_catalog.max(signal.published_at) as latest_published_signal_at
  from public.signals as signal
  where signal.project_id = project.id
    and signal.lifecycle = 'published'
) as latest_signal on true;

comment on view public.project_current_state is
  'Browser-safe project state with deterministic latest score and latest visible published signal time.';

create view public.opportunity_list
with (security_invoker = true, security_barrier = true)
as
select
  current_state.project_id,
  current_state.slug,
  current_state.name,
  current_state.summary,
  current_state.lifecycle,
  current_state.primary_chain,
  current_state.opportunity_score,
  current_state.risk_score,
  current_state.score_confidence as confidence,
  current_state.recommendation,
  current_state.score_calculated_at as calculated_at,
  current_state.latest_published_signal_at
from public.project_current_state as current_state
where current_state.lifecycle in ('active', 'rumored')
  and current_state.opportunity_score is not null
order by current_state.opportunity_score desc, current_state.project_id asc;

comment on view public.opportunity_list is
  'Browser-safe scored active and rumored opportunities in deterministic cursor order.';

revoke all on table public.project_current_state from public, anon, authenticated, service_role;
revoke all on table public.opportunity_list from public, anon, authenticated, service_role;

grant select on table public.project_current_state to anon, authenticated;
grant select on table public.opportunity_list to anon, authenticated;

reset search_path;
