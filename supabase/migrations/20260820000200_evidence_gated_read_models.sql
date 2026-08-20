-- Evidence-gated browser reads and deterministic scoring inputs.

create function public.signal_has_valid_evidence(p_signal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.signals as signal
    join public.signal_evidence_links as evidence_link
      on evidence_link.signal_id = signal.id
    join public.evidence as evidence_record
      on evidence_record.id = evidence_link.evidence_id
    join public.raw_items as raw_item
      on raw_item.id = evidence_record.raw_item_id
    left join public.discovered_items as discovered_item
      on discovered_item.id = evidence_record.discovered_item_id
    where signal.id = p_signal_id
      and raw_item.project_id = signal.project_id
      and raw_item.source_id = evidence_record.source_id
      and (
        evidence_record.discovered_item_id is null
        or (
          discovered_item.project_id = signal.project_id
          and discovered_item.source_id = evidence_record.source_id
          and (
            evidence_record.source_field <> 'discovered_summary'
            or discovered_item.feed_raw_item_id = evidence_record.raw_item_id
          )
        )
      )
  );
$function$;

create function public.score_has_complete_evidence(p_project_score_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    exists (
      select 1
      from public.score_signal_links as score_link
      where score_link.project_score_id = p_project_score_id
    )
    and not exists (
      select 1
      from public.score_signal_links as score_link
      where score_link.project_score_id = p_project_score_id
        and not public.signal_has_valid_evidence(score_link.signal_id)
    );
$function$;

revoke all on function public.signal_has_valid_evidence(uuid) from public;
revoke all on function public.score_has_complete_evidence(uuid) from public;

grant execute on function public.signal_has_valid_evidence(uuid)
to anon, authenticated, service_role, ai_stage_worker;
grant execute on function public.score_has_complete_evidence(uuid)
to anon, authenticated, service_role, ai_stage_worker;

drop policy if exists signals_select_anon on public.signals;
create policy signals_select_anon
on public.signals
for select
to anon
using (
  lifecycle = 'published'
  and exists (
    select 1
    from public.projects as project
    where project.id = signals.project_id
      and project.lifecycle = 'active'
  )
  and public.signal_has_valid_evidence(id)
);

comment on policy signals_select_anon on public.signals is
  'Anonymous users may read Evidence-gated published signals whose parent project is active.';

drop policy if exists signals_select_authenticated on public.signals;
create policy signals_select_authenticated
on public.signals
for select
to authenticated
using (
  lifecycle = 'published'
  and exists (
    select 1
    from public.projects as project
    where project.id = signals.project_id
      and project.lifecycle = 'active'
  )
  and public.signal_has_valid_evidence(id)
);

comment on policy signals_select_authenticated on public.signals is
  'Authenticated browser users may read Evidence-gated published signals whose parent project is active.';

create or replace view public.project_current_state
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
  latest_signal.latest_published_signal_at,
  project.official_website_url,
  latest_score.model_version as score_model_version,
  latest_score.input_version as score_input_version,
  latest_score.explanation as score_explanation
from public.projects as project
left join lateral (
  select
    score.opportunity_score,
    score.risk_score,
    score.confidence,
    score.recommendation,
    score.model_version,
    score.input_version,
    score.explanation,
    score.calculated_at
  from public.project_scores as score
  where score.project_id = project.id
    and public.score_has_complete_evidence(score.id)
  order by score.calculated_at desc, score.id desc
  limit 1
) as latest_score on true
left join lateral (
  select pg_catalog.max(signal.published_at) as latest_published_signal_at
  from public.signals as signal
  where signal.project_id = project.id
    and signal.lifecycle = 'published'::public.signal_lifecycle
    and public.signal_has_valid_evidence(signal.id)
) as latest_signal on true;

comment on view public.project_current_state is
  'Browser-safe project state with deterministic latest Evidence-complete score and latest Evidence-gated published signal time.';

create or replace view public.opportunity_list
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
  'Browser-safe Evidence-complete scored active and rumored opportunities in deterministic cursor order.';

revoke all on table public.project_current_state from public, anon, authenticated, service_role;
revoke all on table public.opportunity_list from public, anon, authenticated, service_role;

grant select on table public.project_current_state to anon, authenticated, service_role;
grant select on table public.opportunity_list to anon, authenticated;
