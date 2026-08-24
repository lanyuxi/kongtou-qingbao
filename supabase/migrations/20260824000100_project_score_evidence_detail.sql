-- Browser-safe current score factors and reviewed score-level Evidence citations.

create function public.current_project_score_is_public(p_project_score_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.project_scores as score
    join public.projects as project
      on project.id = score.project_id
    where score.id = p_project_score_id
      and project.lifecycle in ('active', 'rumored')
      and public.score_has_complete_evidence(score.id)
      and score.id = (
        select latest.id
        from public.project_scores as latest
        where latest.project_id = score.project_id
          and public.score_has_complete_evidence(latest.id)
        order by latest.calculated_at desc, latest.id desc
        limit 1
      )
  );
$function$;

alter function public.current_project_score_is_public(uuid) owner to postgres;
revoke all on function public.current_project_score_is_public(uuid) from public;
grant execute on function public.current_project_score_is_public(uuid)
to anon, authenticated;

create function public.current_score_citation_path_is_public(
  p_project_score_id uuid,
  p_signal_id uuid,
  p_evidence_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    (
      p_project_score_id is not null
      or p_signal_id is not null
      or p_evidence_id is not null
    )
    and exists (
      select 1
      from public.project_scores as score
      join public.projects as project
        on project.id = score.project_id
      join public.score_signal_links as score_link
        on score_link.project_score_id = score.id
      join public.signals as signal
        on signal.id = score_link.signal_id
        and signal.project_id = score.project_id
      join public.signal_evidence_links as evidence_link
        on evidence_link.signal_id = signal.id
      join public.evidence as evidence_record
        on evidence_record.id = evidence_link.evidence_id
      join public.raw_items as raw_item
        on raw_item.id = evidence_record.raw_item_id
        and raw_item.project_id = score.project_id
        and raw_item.source_id = evidence_record.source_id
      left join public.discovered_items as discovered_item
        on discovered_item.id = evidence_record.discovered_item_id
      join public.sources as source
        on source.id = evidence_record.source_id
        and source.status = 'active'
      join public.project_sources as project_source
        on project_source.project_id = score.project_id
        and project_source.source_id = evidence_record.source_id
      where project.lifecycle = 'active'
        and public.current_project_score_is_public(score.id)
        and signal.lifecycle = 'published'
        and public.signal_has_valid_evidence(signal.id)
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
        and (
          p_project_score_id is null
          or score.id = p_project_score_id
        )
        and (
          p_signal_id is null
          or signal.id = p_signal_id
        )
        and (
          p_evidence_id is null
          or evidence_record.id = p_evidence_id
        )
    );
$function$;

alter function public.current_score_citation_path_is_public(uuid, uuid, uuid)
owner to postgres;
revoke all on function public.current_score_citation_path_is_public(uuid, uuid, uuid)
from public;
grant execute on function public.current_score_citation_path_is_public(uuid, uuid, uuid)
to anon, authenticated;

drop policy if exists score_factors_select_anon on public.score_factors;
create policy score_factors_select_anon
on public.score_factors
for select
to anon
using (public.current_project_score_is_public(project_score_id));

comment on policy score_factors_select_anon on public.score_factors is
  'Anonymous users may read factors for the current Evidence-complete score of an active or rumored project.';

drop policy if exists score_factors_select_authenticated on public.score_factors;
create policy score_factors_select_authenticated
on public.score_factors
for select
to authenticated
using (public.current_project_score_is_public(project_score_id));

comment on policy score_factors_select_authenticated on public.score_factors is
  'Authenticated browser users may read factors for the current Evidence-complete score of an active or rumored project.';

drop policy if exists score_signal_links_select_anon on public.score_signal_links;
create policy score_signal_links_select_anon
on public.score_signal_links
for select
to anon
using (
  public.current_score_citation_path_is_public(
    project_score_id,
    signal_id,
    null::uuid
  )
);

comment on policy score_signal_links_select_anon on public.score_signal_links is
  'Anonymous users may read score-signal links only for complete current active-project citation paths.';

drop policy if exists score_signal_links_select_authenticated
on public.score_signal_links;
create policy score_signal_links_select_authenticated
on public.score_signal_links
for select
to authenticated
using (
  public.current_score_citation_path_is_public(
    project_score_id,
    signal_id,
    null::uuid
  )
);

comment on policy score_signal_links_select_authenticated
on public.score_signal_links is
  'Authenticated browser users may read score-signal links only for complete current active-project citation paths.';

drop policy if exists signal_evidence_links_select_anon
on public.signal_evidence_links;
create policy signal_evidence_links_select_anon
on public.signal_evidence_links
for select
to anon
using (
  public.current_score_citation_path_is_public(
    null::uuid,
    signal_id,
    evidence_id
  )
);

comment on policy signal_evidence_links_select_anon
on public.signal_evidence_links is
  'Anonymous users may read signal-Evidence links only for complete current active-project citation paths.';

drop policy if exists signal_evidence_links_select_authenticated
on public.signal_evidence_links;
create policy signal_evidence_links_select_authenticated
on public.signal_evidence_links
for select
to authenticated
using (
  public.current_score_citation_path_is_public(
    null::uuid,
    signal_id,
    evidence_id
  )
);

comment on policy signal_evidence_links_select_authenticated
on public.signal_evidence_links is
  'Authenticated browser users may read signal-Evidence links only for complete current active-project citation paths.';

drop policy if exists evidence_select_anon on public.evidence;
create policy evidence_select_anon
on public.evidence
for select
to anon
using (
  public.current_score_citation_path_is_public(null::uuid, null::uuid, id)
);

comment on policy evidence_select_anon on public.evidence is
  'Anonymous users may read safe Evidence columns only for complete current active-project citation paths.';

drop policy if exists evidence_select_authenticated on public.evidence;
create policy evidence_select_authenticated
on public.evidence
for select
to authenticated
using (
  public.current_score_citation_path_is_public(null::uuid, null::uuid, id)
);

comment on policy evidence_select_authenticated on public.evidence is
  'Authenticated browser users may read safe Evidence columns only for complete current active-project citation paths.';

revoke all on table public.score_factors from public, anon, authenticated;
revoke all on table public.score_signal_links from public, anon, authenticated;
revoke all on table public.signal_evidence_links from public, anon, authenticated;
revoke all on table public.evidence from public, anon, authenticated;

grant select (
  project_score_id,
  axis,
  factor_code,
  contribution,
  input_value,
  detail
)
on public.score_factors to anon, authenticated;

grant select (project_score_id, signal_id)
on public.score_signal_links to anon, authenticated;

grant select (signal_id, evidence_id)
on public.signal_evidence_links to anon, authenticated;

grant select (id, source_id, source_field, quote_text, verified_at)
on public.evidence to anon, authenticated;

grant select (id)
on public.project_scores to anon, authenticated;

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
  latest_score.explanation as score_explanation,
  latest_score.id as project_score_id
from public.projects as project
left join lateral (
  select
    score.id,
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
  'Browser-safe project state with immutable latest Evidence-complete score identity and latest Evidence-gated published signal time.';

revoke all on table public.project_current_state
from public, anon, authenticated, service_role;
grant select on table public.project_current_state
to anon, authenticated, service_role;

create view public.project_current_score_factors
with (security_invoker = true, security_barrier = true)
as
select
  score.project_id,
  factor.project_score_id,
  factor.axis,
  factor.factor_code,
  factor.contribution,
  factor.input_value,
  factor.detail
from public.score_factors as factor
join public.project_scores as score
  on score.id = factor.project_score_id
where public.current_project_score_is_public(factor.project_score_id);

comment on view public.project_current_score_factors is
  'Browser-safe deterministic factor decomposition for the immutable current Evidence-complete score.';

create view public.project_current_score_evidence_citations
with (security_invoker = true, security_barrier = true)
as
select
  score.project_id,
  score_link.project_score_id,
  signal.id as signal_id,
  signal.title as signal_title,
  signal.verification as signal_verification,
  signal.published_at as signal_published_at,
  evidence_record.id as evidence_id,
  evidence_record.quote_text as citation_text,
  evidence_record.source_field as evidence_source_field,
  evidence_record.verified_at as evidence_verified_at,
  source.id as source_id,
  source.name as source_name,
  source.source_type,
  (
    project_source.is_official
    and project_source.verified_at is not null
  ) as source_is_official,
  project_source.verified_at as source_relation_verified_at
from public.score_signal_links as score_link
join public.project_scores as score
  on score.id = score_link.project_score_id
join public.signals as signal
  on signal.id = score_link.signal_id
  and signal.project_id = score.project_id
join public.signal_evidence_links as evidence_link
  on evidence_link.signal_id = signal.id
join public.evidence as evidence_record
  on evidence_record.id = evidence_link.evidence_id
join public.sources as source
  on source.id = evidence_record.source_id
join public.project_sources as project_source
  on project_source.project_id = score.project_id
  and project_source.source_id = evidence_record.source_id
where public.current_score_citation_path_is_public(
  score_link.project_score_id,
  signal.id,
  evidence_record.id
);

comment on view public.project_current_score_evidence_citations is
  'Browser-safe reviewed score-level Evidence citations with inert text and no outbound URL.';

alter view public.project_current_score_factors owner to postgres;
alter view public.project_current_score_evidence_citations owner to postgres;

revoke all on table public.project_current_score_factors
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke all on table public.project_current_score_evidence_citations
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;

grant select on table public.project_current_score_factors
to anon, authenticated;
grant select on table public.project_current_score_evidence_citations
to anon, authenticated;
