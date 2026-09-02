-- Phase 8 tutorials ledger for the execution domain.
--
-- Seven tables (canonical current row, immutable versions, version-scoped step
-- links, candidates, review decisions, command receipts, system status events)
-- plus two anonymously readable views. Every user-visible link resolves from
-- the Phase 7B reference ledger through a referenceId binding; the tutorial
-- surfaces carry no stored url column at all. Coupling triggers keep the
-- tutorial status in lockstep with security posture, reference renderability,
-- and signal verification synchronously.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.tutorials (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null
    constraint tutorials_project_id_fkey
    references public.projects (id) on delete restrict,
  kind text not null,
  status text not null default 'published',
  version bigint not null default 0,
  title text not null,
  summary text not null,
  last_verified_at timestamptz null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  updated_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint tutorials_project_kind_unique unique (project_id, kind),
  constraint tutorials_kind_valid check (
    kind in (
      'airdrop_campaign',
      'points_program',
      'snapshot_notice',
      'task_launch',
      'token_launch',
      'eligibility_rule'
    )
  ),
  constraint tutorials_status_valid check (
    status in (
      'draft',
      'in_review',
      'published',
      'needs_review',
      'blocked',
      'retired'
    )
  ),
  constraint tutorials_title_valid check (
    title = pg_catalog.btrim(title)
    and pg_catalog.char_length(title) between 5 and 200
    and pg_catalog.strpos(pg_catalog.lower(title), 'http://') = 0
    and pg_catalog.strpos(pg_catalog.lower(title), 'https://') = 0
    and pg_catalog.strpos(pg_catalog.lower(title), 'www.') = 0
  ),
  constraint tutorials_summary_valid check (
    summary = pg_catalog.btrim(summary)
    and pg_catalog.char_length(summary) between 10 and 2000
    and pg_catalog.strpos(pg_catalog.lower(summary), 'http://') = 0
    and pg_catalog.strpos(pg_catalog.lower(summary), 'https://') = 0
    and pg_catalog.strpos(pg_catalog.lower(summary), 'www.') = 0
  )
);

create table public.tutorial_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  tutorial_id uuid not null
    constraint tutorial_versions_tutorial_id_fkey
    references public.tutorials (id) on delete restrict,
  version bigint not null,
  steps jsonb not null,
  source_signal_ids uuid[] not null default '{}',
  content_hash text not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  created_by uuid not null
    constraint tutorial_versions_created_by_fkey
    references public.profiles (id) on delete restrict,
  constraint tutorial_versions_tutorial_version_key unique (tutorial_id, version),
  constraint tutorial_versions_steps_valid check (
    pg_catalog.jsonb_typeof(steps) = 'array'
    and pg_catalog.jsonb_array_length(steps) between 2 and 20
  ),
  constraint tutorial_versions_content_hash_valid check (
    content_hash ~ '^[0-9a-f]{64}$'
  )
);

create table public.tutorial_step_links (
  id uuid primary key default extensions.gen_random_uuid(),
  tutorial_id uuid not null
    constraint tutorial_step_links_tutorial_id_fkey
    references public.tutorials (id) on delete restrict,
  version_id uuid not null
    constraint tutorial_step_links_version_id_fkey
    references public.tutorial_versions (id) on delete restrict,
  step_ordinal integer not null,
  reference_id uuid not null
    constraint tutorial_step_links_reference_id_fkey
    references public.project_references (id) on delete restrict,
  constraint tutorial_step_links_unique unique (version_id, step_ordinal, reference_id),
  constraint tutorial_step_links_ordinal_valid check (step_ordinal between 1 and 20)
);

create table public.tutorial_candidates (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null
    constraint tutorial_candidates_project_id_fkey
    references public.projects (id) on delete restrict,
  kind text not null,
  payload jsonb not null,
  source_signal_ids uuid[] not null default '{}',
  confidence numeric(5, 2) not null,
  status text not null default 'pending',
  version bigint not null default 1,
  model_run_id uuid null
    constraint tutorial_candidates_model_run_id_fkey
    references public.ai_runs (id) on delete set null,
  content_hash text not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint tutorial_candidates_kind_valid check (
    kind in (
      'airdrop_campaign',
      'points_program',
      'snapshot_notice',
      'task_launch',
      'token_launch',
      'eligibility_rule'
    )
  ),
  constraint tutorial_candidates_status_valid check (
    status in ('pending', 'accepted', 'rejected')
  ),
  constraint tutorial_candidates_confidence_valid check (
    confidence between 0 and 100
  ),
  constraint tutorial_candidates_content_hash_valid check (
    content_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint tutorial_candidates_project_kind_content_unique
    unique (project_id, kind, content_hash)
);

create table public.tutorial_review_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  tutorial_id uuid null
    constraint tutorial_review_decisions_tutorial_id_fkey
    references public.tutorials (id) on delete restrict,
  candidate_id uuid null
    constraint tutorial_review_decisions_candidate_id_fkey
    references public.tutorial_candidates (id) on delete restrict,
  decision text not null,
  reason_code text null,
  note text null,
  aggregate_version bigint not null,
  actor_user_id uuid not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint tutorial_review_decisions_decision_valid check (
    decision in (
      'accept_candidate',
      'reject_candidate',
      'publish_version',
      'retire'
    )
  ),
  constraint tutorial_review_decisions_reason_valid check (
    reason_code is null
    or reason_code in (
      'content_verified',
      'content_stale',
      'reference_unrenderable',
      'security_blocked',
      'source_blocked',
      'signal_retracted',
      'duplicate',
      'out_of_scope',
      'other'
    )
  ),
  constraint tutorial_review_decisions_note_valid check (
    note is null
    or (note = pg_catalog.btrim(note) and pg_catalog.char_length(note) between 1 and 1000)
  ),
  constraint tutorial_review_decisions_aggregate_valid check (
    tutorial_id is not null or candidate_id is not null
  )
);

create table public.tutorial_review_commands (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid not null,
  operation text not null,
  aggregate_id uuid not null,
  input_hash text not null,
  expected_version bigint null,
  resulting_version bigint null,
  result_payload jsonb not null,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint tutorial_review_commands_actor_key_unique
    unique (actor_user_id, idempotency_key),
  constraint tutorial_review_commands_operation_valid check (
    operation in (
      'accept_candidate',
      'reject_candidate',
      'publish_version',
      'retire'
    )
  ),
  constraint tutorial_review_commands_input_hash_valid check (
    input_hash ~ '^[0-9a-f]{64}$'
  )
);

create table public.tutorial_status_events (
  id uuid primary key default extensions.gen_random_uuid(),
  tutorial_id uuid not null
    constraint tutorial_status_events_tutorial_id_fkey
    references public.tutorials (id) on delete restrict,
  trigger text not null,
  from_status text not null,
  to_status text not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint tutorial_status_events_trigger_valid check (
    trigger in (
      'project_blocked',
      'source_blocked',
      'reference_unrenderable',
      'signal_disputed',
      'signal_retracted',
      'lifecycle_changed'
    )
  )
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index tutorial_versions_tutorial_id_idx
  on public.tutorial_versions (tutorial_id, version desc);
create index tutorial_step_links_reference_id_idx
  on public.tutorial_step_links (reference_id);
create index tutorial_step_links_tutorial_id_idx
  on public.tutorial_step_links (tutorial_id, version_id);
create index tutorial_candidates_project_status_idx
  on public.tutorial_candidates (project_id, kind, status);
create index tutorial_review_decisions_tutorial_idx
  on public.tutorial_review_decisions (tutorial_id, created_at desc);
create index tutorial_review_decisions_candidate_idx
  on public.tutorial_review_decisions (candidate_id, created_at desc);
create index tutorial_status_events_tutorial_idx
  on public.tutorial_status_events (tutorial_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Direct mutation guard (append-only ledger discipline)
-- ---------------------------------------------------------------------------

create function public.reject_tutorial_ledger_mutation()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'tutorial_ledger_rows_are_append_only'
    using errcode = 'P0001';
end;
$function$;

create trigger reject_tutorial_versions_mutation
  before update or delete on public.tutorial_versions
  for each row execute function public.reject_tutorial_ledger_mutation();
create trigger reject_tutorial_step_links_mutation
  before update or delete on public.tutorial_step_links
  for each row execute function public.reject_tutorial_ledger_mutation();
create trigger reject_tutorial_review_decisions_mutation
  before update or delete on public.tutorial_review_decisions
  for each row execute function public.reject_tutorial_ledger_mutation();
create trigger reject_tutorial_review_commands_mutation
  before update or delete on public.tutorial_review_commands
  for each row execute function public.reject_tutorial_ledger_mutation();
create trigger reject_tutorial_status_events_mutation
  before update or delete on public.tutorial_status_events
  for each row execute function public.reject_tutorial_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Row level security: anonymous and authenticated principals may read the
-- published surface only (through the two public views, whose base-table
-- policies filter identically); every write path goes through the protected
-- functions, which run as the definer. No other policies exist, so candidate,
-- decision, receipt, and status-event rows are invisible to browsers.
-- ---------------------------------------------------------------------------

alter table public.tutorials enable row level security;
alter table public.tutorial_versions enable row level security;
alter table public.tutorial_step_links enable row level security;
alter table public.tutorial_candidates enable row level security;
alter table public.tutorial_review_decisions enable row level security;
alter table public.tutorial_review_commands enable row level security;
alter table public.tutorial_status_events enable row level security;

create function public.tutorial_is_publicly_visible_v1(p_tutorial_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select
    t.status = 'published'
    and public.current_security_target_posture('project', t.project_id) <> 'blocked'
  from public.tutorials as t
  where t.id = p_tutorial_id
$function$;

alter function public.tutorial_is_publicly_visible_v1(uuid) owner to postgres;

grant select on public.tutorials to anon, authenticated;
grant select on public.tutorial_versions to anon, authenticated;
grant select on public.tutorial_step_links to anon, authenticated;


create policy tutorials_select_anon on public.tutorials
  for select to anon
  using (public.tutorial_is_publicly_visible_v1(id));
comment on policy tutorials_select_anon on public.tutorials is
  'Anonymous readers see only published tutorials outside blocked projects.';
create policy tutorials_select_authenticated on public.tutorials
  for select to authenticated
  using (public.tutorial_is_publicly_visible_v1(id));
comment on policy tutorials_select_authenticated on public.tutorials is
  'Authenticated readers see only published tutorials outside blocked projects.';

create policy tutorial_versions_select_anon on public.tutorial_versions
  for select to anon
  using (public.tutorial_is_publicly_visible_v1(tutorial_id));
comment on policy tutorial_versions_select_anon on public.tutorial_versions is
  'Published tutorial versions are readable anonymously for the detail page.';
create policy tutorial_versions_select_authenticated on public.tutorial_versions
  for select to authenticated
  using (public.tutorial_is_publicly_visible_v1(tutorial_id));
comment on policy tutorial_versions_select_authenticated on public.tutorial_versions is
  'Published tutorial versions are readable for authenticated detail pages.';

create policy tutorial_step_links_select_anon on public.tutorial_step_links
  for select to anon
  using (public.tutorial_is_publicly_visible_v1(tutorial_id));
comment on policy tutorial_step_links_select_anon on public.tutorial_step_links is
  'Step links of published tutorials are readable; renderability is resolved per link.';
create policy tutorial_step_links_select_authenticated on public.tutorial_step_links
  for select to authenticated
  using (public.tutorial_is_publicly_visible_v1(tutorial_id));
comment on policy tutorial_step_links_select_authenticated on public.tutorial_step_links is
  'Step links of published tutorials are readable; renderability is resolved per link.';

-- ---------------------------------------------------------------------------
-- Public read models
-- ---------------------------------------------------------------------------

create view public.public_project_tutorials
with (security_invoker = true, security_barrier = true)
as
select
  t.id as tutorial_id,
  t.project_id,
  t.kind,
  t.title,
  t.summary,
  t.version,
  t.last_verified_at,
  tv.created_at as published_at,
  (
    select pg_catalog.jsonb_array_length(tv.steps)
  ) as step_count
from public.tutorials as t
join public.tutorial_versions as tv
  on tv.tutorial_id = t.id and tv.version = t.version
where t.status = 'published'
  and public.current_security_target_posture('project', t.project_id) <> 'blocked';

create view public.public_tutorial_detail
with (security_invoker = true, security_barrier = true)
as
select
  t.id as tutorial_id,
  t.project_id,
  t.kind,
  t.title,
  t.summary,
  t.version,
  t.last_verified_at,
  tv.created_at as published_at,
  (st.ordinality + 1) as ordinal,
  st.elem ->> 'title' as step_title,
  st.elem ->> 'body' as step_body,
  (lk.elem ->> 'referenceId')::uuid as link_reference_id,
  case
    when public.reference_is_publicly_renderable_v1((lk.elem ->> 'referenceId')::uuid)
    then reference_row.normalized_url
    else null
  end as link_url,
  reference_row.label as link_label,
  public.reference_last_verified_at_v1((lk.elem ->> 'referenceId')::uuid)
    as link_last_verified_at,
  public.reference_is_publicly_renderable_v1((lk.elem ->> 'referenceId')::uuid)
    as link_renderable
from public.tutorials as t
join public.tutorial_versions as tv
  on tv.tutorial_id = t.id and tv.version = t.version
cross join lateral pg_catalog.jsonb_array_elements(tv.steps)
  with ordinality as st(elem, ordinality)
left join lateral pg_catalog.jsonb_array_elements(st.elem -> 'links')
  with ordinality as lk(elem, link_ordinality) on true
left join public.project_references as reference_row
  on reference_row.id = (lk.elem ->> 'referenceId')::uuid
where t.status = 'published'
  and public.current_security_target_posture('project', t.project_id) <> 'blocked';

grant select on public.public_project_tutorials to anon, authenticated;
grant select on public.public_tutorial_detail to anon, authenticated;
grant execute on function public.current_security_target_posture(text, uuid) to anon, authenticated;
grant execute on function public.reference_is_publicly_renderable_v1(uuid) to anon, authenticated;
grant execute on function public.reference_last_verified_at_v1(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Status coupling (synchronous; protect-first)
-- ---------------------------------------------------------------------------

create function public.queue_tutorials_for_review(
  p_tutorial_ids uuid[],
  p_trigger text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
begin
  if p_trigger not in (
    'project_blocked',
    'source_blocked',
    'reference_unrenderable',
    'signal_disputed',
    'signal_retracted',
    'lifecycle_changed'
  ) then
    raise exception 'tutorial_command_invalid' using errcode = 'AT208';
  end if;

  with prior as (
    select t.id, t.status
    from public.tutorials as t
    where t.id = any (p_tutorial_ids)
      and t.status = 'published'
  ), updated as (
    update public.tutorials as t
    set status = 'needs_review',
        updated_at = pg_catalog.transaction_timestamp()
    where t.id in (select prior.id from prior)
      and t.status = 'published'
    returning t.id
  )
  insert into public.tutorial_status_events (tutorial_id, trigger, from_status, to_status)
  select prior.id, p_trigger, prior.status, 'needs_review'
  from prior
  join updated on updated.id = prior.id;
end;
$function$;

alter function public.queue_tutorials_for_review(uuid[], text)
  owner to postgres;

create function public.block_tutorials_for_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
begin
  with prior as (
    select t.id, t.status
    from public.tutorials as t
    where t.project_id = p_project_id
      and t.status in ('published', 'needs_review')
  ), updated as (
    update public.tutorials as t
    set status = 'blocked',
        updated_at = pg_catalog.transaction_timestamp()
    where t.id in (select prior.id from prior)
      and t.status in ('published', 'needs_review')
    returning t.id
  )
  insert into public.tutorial_status_events (tutorial_id, trigger, from_status, to_status)
  select prior.id, 'project_blocked', prior.status, 'blocked'
  from prior
  join updated on updated.id = prior.id;
end;
$function$;

alter function public.block_tutorials_for_project(uuid) owner to postgres;

-- A reference that leaves the renderable set (flagged, withdrawn) invalidates
-- every step link bound to it.
create function public.sync_tutorials_on_reference_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_tutorial_ids uuid[];
begin
  if new.resulting_state in ('flagged', 'withdrawn') then
    select array_agg(distinct sl.tutorial_id)
      into v_tutorial_ids
    from public.tutorial_step_links as sl
    where sl.reference_id = new.reference_id;
    perform public.queue_tutorials_for_review(v_tutorial_ids, 'reference_unrenderable');
  end if;
  return null;
end;
$function$;

alter function public.sync_tutorials_on_reference_change() owner to postgres;

create trigger sync_tutorials_on_reference_decision
  after insert on public.project_reference_decisions
  for each row
  execute function public.sync_tutorials_on_reference_change();

-- Revoking a domain authority unrenders every reference under it.
create function public.sync_tutorials_on_authority_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_tutorial_ids uuid[];
begin
  if new.decision = 'revoke' then
    select array_agg(distinct sl.tutorial_id)
      into v_tutorial_ids
    from public.project_domain_authorities as a
    join public.project_references as r
      on r.project_id = a.project_id and r.normalized_domain = a.normalized_domain
    join public.tutorial_step_links as sl on sl.reference_id = r.id
    where a.id = new.authority_id;
    perform public.queue_tutorials_for_review(v_tutorial_ids, 'reference_unrenderable');
  end if;
  return null;
end;
$function$;

alter function public.sync_tutorials_on_authority_change() owner to postgres;

create trigger sync_tutorials_on_authority_decision
  after insert on public.project_domain_authority_decisions
  for each row
  execute function public.sync_tutorials_on_authority_change();

-- A signal that loses its verification (disputed or retracted) stale-dates
-- every tutorial version that cites it.
create function public.sync_tutorials_on_signal_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_tutorial_ids uuid[];
begin
  if new.verification is distinct from old.verification
    and new.verification = 'disputed' then
    select array_agg(distinct t.id)
      into v_tutorial_ids
    from public.tutorials as t
    join public.tutorial_versions as tv on tv.tutorial_id = t.id
    where tv.source_signal_ids @> array[new.id];
    perform public.queue_tutorials_for_review(v_tutorial_ids, 'signal_disputed');
  elsif new.lifecycle is distinct from old.lifecycle
    and new.lifecycle = 'rejected' then
    select array_agg(distinct t.id)
      into v_tutorial_ids
    from public.tutorials as t
    join public.tutorial_versions as tv on tv.tutorial_id = t.id
    where tv.source_signal_ids @> array[new.id];
    perform public.queue_tutorials_for_review(v_tutorial_ids, 'signal_retracted');
  end if;
  return null;
end;
$function$;

alter function public.sync_tutorials_on_signal_change() owner to postgres;

create trigger sync_tutorials_on_signal_verification
  after update of verification, lifecycle on public.signals
  for each row
  execute function public.sync_tutorials_on_signal_change();

-- Security incidents drive both project-level blocking (security severity)
-- and source-level review queueing through the evidence chain.  Target
-- posture only changes on security_incident_decisions (the header row is
-- inserted before its first decision, so an incident-header trigger would
-- always evaluate a clear posture); the coupling therefore subscribes to
-- decision inserts, where the new decision row is already visible.
create function public.sync_tutorials_on_incident_decision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_target_type text;
  v_target_id uuid;
  v_posture text;
  v_tutorial_ids uuid[];
begin
  select incident.target_type, coalesce(incident.project_id, incident.source_id)
    into v_target_type, v_target_id
  from public.security_incidents as incident
  where incident.id = new.incident_id;

  if v_target_type is null or v_target_id is null then
    return null;
  end if;
  v_posture := public.current_security_target_posture(v_target_type, v_target_id);

  if v_target_type = 'project' then
    if v_posture = 'blocked' then
      perform public.block_tutorials_for_project(v_target_id);
    else
      with prior as (
        select t.id, t.status
        from public.tutorials as t
        where t.project_id = v_target_id
          and t.status = 'blocked'
      ), updated as (
        update public.tutorials as t
        set status = 'needs_review',
            updated_at = pg_catalog.transaction_timestamp()
        where t.id in (select prior.id from prior)
          and t.status = 'blocked'
        returning t.id
      )
      insert into public.tutorial_status_events (tutorial_id, trigger, from_status, to_status)
      select prior.id, 'project_blocked', prior.status, 'needs_review'
      from prior
      join updated on updated.id = prior.id;
    end if;
  elsif v_target_type = 'source' then
    if v_posture = 'blocked' then
      select array_agg(distinct t.id)
        into v_tutorial_ids
      from public.tutorials as t
      join public.tutorial_versions as tv on tv.tutorial_id = t.id
      where t.status = 'published'
        and tv.source_signal_ids && (
          select array_agg(s.id)
          from public.signals as s
          join public.signal_evidence_links as sel on sel.signal_id = s.id
          join public.evidence as e on e.id = sel.evidence_id
          where e.source_id = v_target_id
        );
      perform public.queue_tutorials_for_review(v_tutorial_ids, 'source_blocked');
    end if;
  end if;
  return null;
end;
$function$;

alter function public.sync_tutorials_on_incident_decision() owner to postgres;

create trigger sync_tutorials_on_incident_decisions
  after insert on public.security_incident_decisions
  for each row
  execute function public.sync_tutorials_on_incident_decision();

-- ---------------------------------------------------------------------------
-- Protected review commands
-- ---------------------------------------------------------------------------

create function public.submit_accept_tutorial_candidate(
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "candidateId" uuid,
  "tutorialId" uuid,
  "tutorialVersion" bigint,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
  v_input_hash text;
  v_candidate record;
  v_tutorial_id uuid;
  v_tutorial_version bigint;
  v_project_id uuid;
  v_kind text;
  v_steps jsonb;
  v_step_count integer;
  v_link_count integer;
  v_content_hash text;
  v_command_id uuid;
  v_decision_id uuid;
  v_existing record;
  v_now timestamptz;
  v_occurred_at_text text;
  v_step jsonb;
  v_link jsonb;
  v_ordinal integer;
  v_allowlisted boolean;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'tutorial_reviewer_required' using errcode = 'AT201';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'candidateId', 'expectedCandidateVersion', 'steps']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'candidateId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'expectedCandidateVersion') <> 'number'
    or (p_command_payload ->> 'expectedCandidateVersion') !~ '^[1-9][0-9]*$'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'steps') <> 'array'
    or pg_catalog.jsonb_array_length(p_command_payload -> 'steps') not between 2 and 20
  then
    raise exception 'tutorial_command_invalid' using errcode = 'AT208';
  end if;

  v_steps := p_command_payload -> 'steps';
  v_step_count := pg_catalog.jsonb_array_length(v_steps);
  v_link_count := 0;
  for v_step in select pg_catalog.jsonb_array_elements(v_steps) loop
    if not public.security_json_has_exact_keys(v_step, array['title', 'body', 'links'])
      or pg_catalog.jsonb_typeof(v_step -> 'title') <> 'string'
      or pg_catalog.char_length(v_step ->> 'title') not between 3 and 120
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'title'), 'http://') > 0
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'title'), 'https://') > 0
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'title'), 'www.') > 0
      or pg_catalog.jsonb_typeof(v_step -> 'body') <> 'string'
      or pg_catalog.char_length(v_step ->> 'body') not between 10 and 1000
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'body'), 'http://') > 0
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'body'), 'https://') > 0
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'body'), 'www.') > 0
      or pg_catalog.jsonb_typeof(v_step -> 'links') <> 'array'
      or pg_catalog.jsonb_array_length(v_step -> 'links') > 5
    then
      raise exception 'tutorial_steps_invalid' using errcode = 'AT211';
    end if;
    for v_link in select pg_catalog.jsonb_array_elements(v_step -> 'links') loop
      v_link_count := v_link_count + 1;
      if (v_link ->> 'referenceId') !~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$' then
        raise exception 'tutorial_steps_invalid' using errcode = 'AT211';
      end if;
    end loop;
  end loop;
  if v_link_count > 100 then
    raise exception 'tutorial_steps_invalid' using errcode = 'AT211';
  end if;

  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'accept_candidate', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();

  select * into v_existing
  from public.tutorial_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'accept_candidate'
      or v_existing.input_hash <> v_input_hash
    then
      raise exception 'tutorial_idempotency_conflict' using errcode = 'AT207';
    end if;
    return query select
      1,
      v_existing.id,
      v_existing.aggregate_id,
      (v_existing.result_payload ->> 'tutorialId')::uuid,
      (v_existing.result_payload ->> 'tutorialVersion')::bigint,
      true;
    return;
  end if;

  select * into v_candidate
  from public.tutorial_candidates as candidate
  where candidate.id = (p_command_payload ->> 'candidateId')::uuid
  for update;
  if not found then
    raise exception 'tutorial_not_found' using errcode = 'AT202';
  end if;
  if v_candidate.status <> 'pending'
    or v_candidate.version <> (p_command_payload ->> 'expectedCandidateVersion')::bigint
  then
    raise exception 'tutorial_not_decidable' using errcode = 'AT203';
  end if;

  v_project_id := v_candidate.project_id;
  v_kind := v_candidate.kind;

  if exists (
    select 1 from public.tutorials as t
    where t.project_id = v_project_id and t.kind = v_kind
  ) then
    raise exception 'tutorial_command_invalid' using errcode = 'AT208';
  end if;

  -- Every step link must bind to a renderable reference of this project; a
  -- hallucinated or cross-project id is rejected before anything is written.
  v_ordinal := 0;
  for v_step in select pg_catalog.jsonb_array_elements(v_steps) loop
    v_ordinal := v_ordinal + 1;
    for v_link in select pg_catalog.jsonb_array_elements(v_step -> 'links') loop
      v_allowlisted := exists (
        select 1
        from public.project_references as reference_row
        where reference_row.id = (v_link ->> 'referenceId')::uuid
          and reference_row.project_id = v_project_id
          and public.reference_is_publicly_renderable_v1(reference_row.id)
      );
      if not v_allowlisted then
        raise exception 'tutorial_reference_not_renderable' using errcode = 'AT210';
      end if;
    end loop;
  end loop;

  v_content_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_steps::text, 'UTF8'), 'sha256'), 'hex'
  );

  insert into public.tutorials (
    id, project_id, kind, status, version, title, summary,
    last_verified_at, created_at, updated_at
  ) values (
    default, v_project_id, v_kind, 'published', 1,
    v_candidate.payload ->> 'title',
    v_candidate.payload ->> 'summary',
    v_now, v_now, v_now
  )
  returning id into v_tutorial_id;
  v_tutorial_version := 1;

  insert into public.tutorial_versions (
    id, tutorial_id, version, steps, source_signal_ids, content_hash,
    created_at, created_by
  ) values (
    default, v_tutorial_id, 1, v_steps, v_candidate.source_signal_ids,
    v_content_hash, v_now, v_actor
  );

  v_ordinal := 0;
  for v_step in select pg_catalog.jsonb_array_elements(v_steps) loop
    v_ordinal := v_ordinal + 1;
    for v_link in select pg_catalog.jsonb_array_elements(v_step -> 'links') loop
      insert into public.tutorial_step_links (
        tutorial_id, version_id, step_ordinal, reference_id
      ) values (
        v_tutorial_id,
        (select id from public.tutorial_versions
          where tutorial_id = v_tutorial_id and tutorial_versions.version = 1),
        v_ordinal,
        (v_link ->> 'referenceId')::uuid
      );
    end loop;
  end loop;

  update public.tutorial_candidates as candidate
  set status = 'accepted',
      version = candidate.version + 1
  where candidate.id = (p_command_payload ->> 'candidateId')::uuid;

  insert into public.tutorial_review_decisions (
    id, tutorial_id, candidate_id, decision, reason_code, note,
    aggregate_version, actor_user_id, created_at
  ) values (
    default, v_tutorial_id, (p_command_payload ->> 'candidateId')::uuid,
    'accept_candidate', 'content_verified', null, 1, v_actor, v_now
  ) returning id into v_decision_id;

  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, occurred_at, created_at
  ) values (
    'tutorial', v_tutorial_id, 1,
    'tutorial.published.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'tutorial.published.v1',
      'aggregateId', v_tutorial_id,
      'aggregateVersion', 1,
      'occurredAt', v_occurred_at_text,
      'projectId', v_project_id,
      'kind', v_kind
    ),
    v_now, v_now
  );

  insert into public.tutorial_review_commands (
    id, actor_user_id, operation, aggregate_id, input_hash,
    expected_version, resulting_version, result_payload, idempotency_key, created_at
  ) values (
    default, v_actor, 'accept_candidate',
    (p_command_payload ->> 'candidateId')::uuid,
    v_input_hash,
    (p_command_payload ->> 'expectedCandidateVersion')::bigint,
    1,
    pg_catalog.jsonb_build_object(
      'tutorialId', v_tutorial_id, 'tutorialVersion', 1
    ),
    p_idempotency_key, v_now
  ) returning id into v_command_id;

  return query select
    1, v_command_id, (p_command_payload ->> 'candidateId')::uuid,
    v_tutorial_id, v_tutorial_version, false;
end;
$function$;

create function public.submit_reject_tutorial_candidate(
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "candidateId" uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
  v_input_hash text;
  v_candidate record;
  v_command_id uuid;
  v_existing record;
  v_now timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'tutorial_reviewer_required' using errcode = 'AT201';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'candidateId', 'expectedCandidateVersion', 'reasonCode', 'note']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'candidateId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'expectedCandidateVersion') <> 'number'
    or (p_command_payload ->> 'expectedCandidateVersion') !~ '^[1-9][0-9]*$'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'reasonCode') <> 'string'
    or p_command_payload ->> 'reasonCode' not in (
      'content_verified',
      'content_stale',
      'reference_unrenderable',
      'security_blocked',
      'source_blocked',
      'signal_retracted',
      'duplicate',
      'out_of_scope',
      'other'
    )
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'string'
        and p_command_payload ->> 'note' = pg_catalog.btrim(p_command_payload ->> 'note')
        and pg_catalog.char_length(p_command_payload ->> 'note') between 1 and 1000
      )
    )
  then
    raise exception 'tutorial_command_invalid' using errcode = 'AT208';
  end if;

  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'reject_candidate', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();

  select * into v_existing
  from public.tutorial_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'reject_candidate'
      or v_existing.input_hash <> v_input_hash
    then
      raise exception 'tutorial_idempotency_conflict' using errcode = 'AT207';
    end if;
    return query select
      1, v_existing.id, v_existing.aggregate_id, true;
    return;
  end if;

  select * into v_candidate
  from public.tutorial_candidates as candidate
  where candidate.id = (p_command_payload ->> 'candidateId')::uuid
  for update;
  if not found then
    raise exception 'tutorial_not_found' using errcode = 'AT202';
  end if;
  if v_candidate.status <> 'pending'
    or v_candidate.version <> (p_command_payload ->> 'expectedCandidateVersion')::bigint
  then
    raise exception 'tutorial_not_decidable' using errcode = 'AT203';
  end if;

  update public.tutorial_candidates as candidate
  set status = 'rejected',
      version = candidate.version + 1
  where candidate.id = (p_command_payload ->> 'candidateId')::uuid;

  insert into public.tutorial_review_decisions (
    id, tutorial_id, candidate_id, decision, reason_code, note,
    aggregate_version, actor_user_id, created_at
  ) values (
    default, null, (p_command_payload ->> 'candidateId')::uuid,
    'reject_candidate',
    p_command_payload ->> 'reasonCode',
    p_command_payload ->> 'note',
    (p_command_payload ->> 'expectedCandidateVersion')::bigint + 1,
    v_actor, v_now
  );

  insert into public.tutorial_review_commands (
    id, actor_user_id, operation, aggregate_id, input_hash,
    expected_version, resulting_version, result_payload, idempotency_key, created_at
  ) values (
    default, v_actor, 'reject_candidate',
    (p_command_payload ->> 'candidateId')::uuid,
    v_input_hash,
    (p_command_payload ->> 'expectedCandidateVersion')::bigint,
    (p_command_payload ->> 'expectedCandidateVersion')::bigint + 1,
    pg_catalog.jsonb_build_object('status', 'rejected'),
    p_idempotency_key, v_now
  ) returning id into v_command_id;

  return query select
    1, v_command_id, (p_command_payload ->> 'candidateId')::uuid, false;
end;
$function$;

create function public.submit_publish_tutorial_version(
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "tutorialId" uuid,
  "tutorialVersion" bigint,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
  v_input_hash text;
  v_tutorial record;
  v_steps jsonb;
  v_step_count integer;
  v_link_count integer;
  v_content_hash text;
  v_new_version bigint;
  v_command_id uuid;
  v_existing record;
  v_now timestamptz;
  v_occurred_at_text text;
  v_step jsonb;
  v_link jsonb;
  v_ordinal integer;
  v_version_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'tutorial_reviewer_required' using errcode = 'AT201';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'tutorialId', 'expectedVersion', 'steps']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'tutorialId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'expectedVersion') <> 'number'
    or (p_command_payload ->> 'expectedVersion') !~ '^[1-9][0-9]*$'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'steps') <> 'array'
    or pg_catalog.jsonb_array_length(p_command_payload -> 'steps') not between 2 and 20
  then
    raise exception 'tutorial_command_invalid' using errcode = 'AT208';
  end if;

  v_steps := p_command_payload -> 'steps';
  v_step_count := pg_catalog.jsonb_array_length(v_steps);
  v_link_count := 0;
  for v_step in select pg_catalog.jsonb_array_elements(v_steps) loop
    if not public.security_json_has_exact_keys(v_step, array['title', 'body', 'links'])
      or pg_catalog.jsonb_typeof(v_step -> 'title') <> 'string'
      or pg_catalog.char_length(v_step ->> 'title') not between 3 and 120
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'title'), 'http://') > 0
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'title'), 'https://') > 0
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'title'), 'www.') > 0
      or pg_catalog.jsonb_typeof(v_step -> 'body') <> 'string'
      or pg_catalog.char_length(v_step ->> 'body') not between 10 and 1000
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'body'), 'http://') > 0
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'body'), 'https://') > 0
      or pg_catalog.strpos(pg_catalog.lower(v_step ->> 'body'), 'www.') > 0
      or pg_catalog.jsonb_typeof(v_step -> 'links') <> 'array'
      or pg_catalog.jsonb_array_length(v_step -> 'links') > 5
    then
      raise exception 'tutorial_steps_invalid' using errcode = 'AT211';
    end if;
    for v_link in select pg_catalog.jsonb_array_elements(v_step -> 'links') loop
      v_link_count := v_link_count + 1;
      if (v_link ->> 'referenceId') !~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$' then
        raise exception 'tutorial_steps_invalid' using errcode = 'AT211';
      end if;
    end loop;
  end loop;
  if v_link_count > 100 then
    raise exception 'tutorial_steps_invalid' using errcode = 'AT211';
  end if;

  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'publish_version', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();

  select * into v_existing
  from public.tutorial_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'publish_version'
      or v_existing.input_hash <> v_input_hash
    then
      raise exception 'tutorial_idempotency_conflict' using errcode = 'AT207';
    end if;
    return query select
      1,
      v_existing.id,
      v_existing.aggregate_id,
      (v_existing.result_payload ->> 'tutorialVersion')::bigint,
      true;
    return;
  end if;

  select * into v_tutorial
  from public.tutorials as t
  where t.id = (p_command_payload ->> 'tutorialId')::uuid
  for update;
  if not found then
    raise exception 'tutorial_not_found' using errcode = 'AT202';
  end if;
  if v_tutorial.version <> (p_command_payload ->> 'expectedVersion')::bigint
    or v_tutorial.status not in ('published', 'needs_review', 'blocked')
  then
    raise exception 'tutorial_not_decidable' using errcode = 'AT203';
  end if;

  v_new_version := v_tutorial.version + 1;
  v_content_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_steps::text, 'UTF8'), 'sha256'), 'hex'
  );

  insert into public.tutorial_versions (
    id, tutorial_id, version, steps, source_signal_ids, content_hash,
    created_at, created_by
  )
  values (
    default, v_tutorial.id, v_new_version, v_steps,
    coalesce(
      (select prev.source_signal_ids
       from public.tutorial_versions as prev
       where prev.tutorial_id = v_tutorial.id
         and prev.version = v_tutorial.version),
      '{}'::uuid[]
    ),
    v_content_hash, v_now, v_actor
  )
  returning id into v_version_id;

  v_ordinal := 0;
  for v_step in select pg_catalog.jsonb_array_elements(v_steps) loop
    v_ordinal := v_ordinal + 1;
    for v_link in select pg_catalog.jsonb_array_elements(v_step -> 'links') loop
      if not exists (
        select 1
        from public.project_references as reference_row
        where reference_row.id = (v_link ->> 'referenceId')::uuid
          and reference_row.project_id = v_tutorial.project_id
          and public.reference_is_publicly_renderable_v1(reference_row.id)
      ) then
        raise exception 'tutorial_reference_not_renderable' using errcode = 'AT210';
      end if;
      insert into public.tutorial_step_links (
        tutorial_id, version_id, step_ordinal, reference_id
      ) values (
        v_tutorial.id, v_version_id, v_ordinal,
        (v_link ->> 'referenceId')::uuid
      );
    end loop;
  end loop;

  update public.tutorials as t
  set version = v_new_version,
      status = 'published',
      last_verified_at = v_now,
      updated_at = v_now
  where t.id = v_tutorial.id;

  insert into public.tutorial_review_decisions (
    id, tutorial_id, candidate_id, decision, reason_code, note,
    aggregate_version, actor_user_id, created_at
  ) values (
    default, v_tutorial.id, null, 'publish_version', 'content_verified', null,
    v_new_version, v_actor, v_now
  );

  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, occurred_at, created_at
  ) values (
    'tutorial', v_tutorial.id, v_new_version,
    'tutorial.published.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'tutorial.published.v1',
      'aggregateId', v_tutorial.id,
      'aggregateVersion', v_new_version,
      'occurredAt', v_occurred_at_text,
      'projectId', v_tutorial.project_id,
      'kind', v_tutorial.kind
    ),
    v_now, v_now
  );

  insert into public.tutorial_review_commands (
    id, actor_user_id, operation, aggregate_id, input_hash,
    expected_version, resulting_version, result_payload, idempotency_key, created_at
  ) values (
    default, v_actor, 'publish_version', v_tutorial.id,
    v_input_hash,
    (p_command_payload ->> 'expectedVersion')::bigint,
    v_new_version,
    pg_catalog.jsonb_build_object('tutorialVersion', v_new_version),
    p_idempotency_key, v_now
  ) returning id into v_command_id;

  return query select
    1, v_command_id, v_tutorial.id, v_new_version, false;
end;
$function$;

create function public.submit_retire_tutorial(
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "tutorialId" uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
  v_input_hash text;
  v_tutorial record;
  v_command_id uuid;
  v_existing record;
  v_now timestamptz;
  v_occurred_at_text text;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'tutorial_reviewer_required' using errcode = 'AT201';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'tutorialId', 'expectedVersion', 'reasonCode', 'note']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'tutorialId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'expectedVersion') <> 'number'
    or (p_command_payload ->> 'expectedVersion') !~ '^[1-9][0-9]*$'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'reasonCode') <> 'string'
    or p_command_payload ->> 'reasonCode' not in (
      'content_verified',
      'content_stale',
      'reference_unrenderable',
      'security_blocked',
      'source_blocked',
      'signal_retracted',
      'duplicate',
      'out_of_scope',
      'other'
    )
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_command_payload -> 'note') = 'string'
        and p_command_payload ->> 'note' = pg_catalog.btrim(p_command_payload ->> 'note')
        and pg_catalog.char_length(p_command_payload ->> 'note') between 1 and 1000
      )
    )
  then
    raise exception 'tutorial_command_invalid' using errcode = 'AT208';
  end if;

  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'retire', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();

  select * into v_existing
  from public.tutorial_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'retire'
      or v_existing.input_hash <> v_input_hash
    then
      raise exception 'tutorial_idempotency_conflict' using errcode = 'AT207';
    end if;
    return query select 1, v_existing.id, v_existing.aggregate_id, true;
    return;
  end if;

  select * into v_tutorial
  from public.tutorials as t
  where t.id = (p_command_payload ->> 'tutorialId')::uuid
  for update;
  if not found then
    raise exception 'tutorial_not_found' using errcode = 'AT202';
  end if;
  if v_tutorial.version <> (p_command_payload ->> 'expectedVersion')::bigint
    or v_tutorial.status not in ('published', 'needs_review', 'blocked')
  then
    raise exception 'tutorial_not_decidable' using errcode = 'AT203';
  end if;

  update public.tutorials as t
  set status = 'retired',
      updated_at = v_now
  where t.id = v_tutorial.id;

  insert into public.tutorial_review_decisions (
    id, tutorial_id, candidate_id, decision, reason_code, note,
    aggregate_version, actor_user_id, created_at
  ) values (
    default, v_tutorial.id, null, 'retire',
    p_command_payload ->> 'reasonCode',
    p_command_payload ->> 'note',
    v_tutorial.version, v_actor, v_now
  );

  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, occurred_at, created_at
  ) values (
    'tutorial', v_tutorial.id, v_tutorial.version,
    'tutorial.status_changed.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'tutorial.status_changed.v1',
      'aggregateId', v_tutorial.id,
      'aggregateVersion', v_tutorial.version,
      'occurredAt', v_occurred_at_text,
      'projectId', v_tutorial.project_id,
      'fromStatus', v_tutorial.status,
      'toStatus', 'retired',
      'trigger', null
    ),
    v_now, v_now
  );

  insert into public.tutorial_review_commands (
    id, actor_user_id, operation, aggregate_id, input_hash,
    expected_version, resulting_version, result_payload, idempotency_key, created_at
  ) values (
    default, v_actor, 'retire', v_tutorial.id,
    v_input_hash,
    (p_command_payload ->> 'expectedVersion')::bigint,
    v_tutorial.version,
    pg_catalog.jsonb_build_object('status', 'retired'),
    p_idempotency_key, v_now
  ) returning id into v_command_id;

  return query select 1, v_command_id, v_tutorial.id, false;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Reviewer read RPCs (bearer-scoped; role re-checked on every call)
-- ---------------------------------------------------------------------------

create function public.list_tutorial_review_candidates(
  p_status text default 'pending',
  p_cursor_created timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 25
)
returns table (
  "candidateId" uuid,
  "projectId" uuid,
  kind text,
  status text,
  title text,
  "createdAt" timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
begin
  if auth.uid() is null or not public.actor_has_active_reference_role(auth.uid()) then
    raise exception 'tutorial_reviewer_required' using errcode = 'AT201';
  end if;
  if p_status not in ('all', 'pending', 'accepted', 'rejected')
    or p_limit not between 1 and 100
  then
    raise exception 'tutorial_command_invalid' using errcode = 'AT208';
  end if;
  return query
  select
    candidate.id,
    candidate.project_id,
    candidate.kind,
    candidate.status,
    candidate.payload ->> 'title',
    candidate.created_at
  from public.tutorial_candidates as candidate
  where (p_status = 'all' or candidate.status = p_status)
    and (
      p_cursor_created is null
      or (candidate.created_at, candidate.id) < (p_cursor_created, p_cursor_id)
    )
  order by candidate.created_at desc, candidate.id desc
  limit p_limit;
end;
$function$;

create function public.get_tutorial_review_candidate(p_candidate_id uuid)
returns table (
  "candidateId" uuid,
  "projectId" uuid,
  kind text,
  status text,
  title text,
  summary text,
  payload jsonb,
  "sourceSignalIds" uuid[],
  confidence numeric,
  "createdAt" timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
begin
  if auth.uid() is null or not public.actor_has_active_reference_role(auth.uid()) then
    raise exception 'tutorial_reviewer_required' using errcode = 'AT201';
  end if;
  return query
  select
    candidate.id,
    candidate.project_id,
    candidate.kind,
    candidate.status,
    candidate.payload ->> 'title',
    candidate.payload ->> 'summary',
    candidate.payload,
    candidate.source_signal_ids,
    candidate.confidence,
    candidate.created_at
  from public.tutorial_candidates as candidate
  where candidate.id = p_candidate_id;
  if not found then
    raise exception 'tutorial_not_found' using errcode = 'AT202';
  end if;
end;
$function$;

create function public.list_tutorial_review_items(
  p_status text default 'all',
  p_cursor_updated timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 25
)
returns table (
  "tutorialId" uuid,
  "projectId" uuid,
  kind text,
  status text,
  version bigint,
  title text,
  "updatedAt" timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
begin
  if auth.uid() is null or not public.actor_has_active_reference_role(auth.uid()) then
    raise exception 'tutorial_reviewer_required' using errcode = 'AT201';
  end if;
  if p_status not in ('all', 'published', 'needs_review', 'blocked', 'retired')
    or p_limit not between 1 and 100
  then
    raise exception 'tutorial_command_invalid' using errcode = 'AT208';
  end if;
  return query
  select
    t.id,
    t.project_id,
    t.kind,
    t.status,
    t.version,
    t.title,
    t.updated_at
  from public.tutorials as t
  where (p_status = 'all' or t.status = p_status)
    and (
      p_cursor_updated is null
      or (t.updated_at, t.id) < (p_cursor_updated, p_cursor_id)
    )
  order by t.updated_at desc, t.id desc
  limit p_limit;
end;
$function$;

create function public.get_tutorial_review_detail(p_tutorial_id uuid)
returns table (
  "tutorialId" uuid,
  "projectId" uuid,
  kind text,
  status text,
  version bigint,
  title text,
  summary text,
  "lastVerifiedAt" timestamptz,
  "updatedAt" timestamptz,
  steps jsonb,
  "stepLinks" jsonb,
  decisions jsonb,
  "statusEvents" jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
begin
  if auth.uid() is null or not public.actor_has_active_reference_role(auth.uid()) then
    raise exception 'tutorial_reviewer_required' using errcode = 'AT201';
  end if;
  return query
  select
    t.id,
    t.project_id,
    t.kind,
    t.status,
    t.version,
    t.title,
    t.summary,
    t.last_verified_at,
    t.updated_at,
    tv.steps,
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'ordinal', sl.step_ordinal,
          'referenceId', sl.reference_id,
          'referenceLabel', r.label,
          'renderable', public.reference_is_publicly_renderable_v1(sl.reference_id),
          'lastVerifiedAt', public.reference_last_verified_at_v1(sl.reference_id)
        ) order by sl.step_ordinal
      )
      from public.tutorial_step_links as sl
      left join public.project_references as r on r.id = sl.reference_id
      where sl.version_id = tv.id
    ),
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'decision', d.decision,
          'reasonCode', d.reason_code,
          'note', d.note,
          'aggregateVersion', d.aggregate_version,
          'createdAt', d.created_at
        ) order by d.created_at
      )
      from public.tutorial_review_decisions as d
      where d.tutorial_id = t.id
    ),
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'trigger', se.trigger,
          'fromStatus', se.from_status,
          'toStatus', se.to_status,
          'createdAt', se.created_at
        ) order by se.created_at
      )
      from public.tutorial_status_events as se
      where se.tutorial_id = t.id
    )
  from public.tutorials as t
  join public.tutorial_versions as tv
    on tv.tutorial_id = t.id and tv.version = t.version
  where t.id = p_tutorial_id;
  if not found then
    raise exception 'tutorial_not_found' using errcode = 'AT202';
  end if;
end;
$function$;

alter function public.submit_accept_tutorial_candidate(jsonb, text) owner to postgres;
alter function public.submit_reject_tutorial_candidate(jsonb, text) owner to postgres;
alter function public.submit_publish_tutorial_version(jsonb, text) owner to postgres;
alter function public.submit_retire_tutorial(jsonb, text) owner to postgres;
alter function public.list_tutorial_review_candidates(text, timestamptz, uuid, integer) owner to postgres;
alter function public.get_tutorial_review_candidate(uuid) owner to postgres;
alter function public.list_tutorial_review_items(text, timestamptz, uuid, integer) owner to postgres;
alter function public.get_tutorial_review_detail(uuid) owner to postgres;

revoke all on function public.submit_accept_tutorial_candidate(jsonb, text)
  from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.submit_reject_tutorial_candidate(jsonb, text)
  from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.submit_publish_tutorial_version(jsonb, text)
  from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.submit_retire_tutorial(jsonb, text)
  from public, anon, authenticated, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.list_tutorial_review_candidates(text, timestamptz, uuid, integer)
  from public, anon, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.get_tutorial_review_candidate(uuid)
  from public, anon, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.list_tutorial_review_items(text, timestamptz, uuid, integer)
  from public, anon, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;
revoke all on function public.get_tutorial_review_detail(uuid)
  from public, anon, service_role, ai_stage_worker,
  collection_worker, collection_queue_worker, collection_schedule_admin,
  promotion_service;

grant execute on function public.submit_accept_tutorial_candidate(jsonb, text)
  to authenticated;
grant execute on function public.submit_reject_tutorial_candidate(jsonb, text)
  to authenticated;
grant execute on function public.submit_publish_tutorial_version(jsonb, text)
  to authenticated;
grant execute on function public.submit_retire_tutorial(jsonb, text)
  to authenticated;
grant execute on function public.list_tutorial_review_candidates(text, timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.get_tutorial_review_candidate(uuid)
  to authenticated;
grant execute on function public.list_tutorial_review_items(text, timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.get_tutorial_review_detail(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Outbox event-type and payload constraint extension. Every pre-existing
-- branch is preserved verbatim; two strict tutorial branches are appended.
-- ---------------------------------------------------------------------------

alter table public.outbox_events
  drop constraint outbox_events_event_type_valid,
  add constraint outbox_events_event_type_valid check (
    event_type in (
      'intelligence.signal.promoted.v1',
      'intelligence.candidate.reviewed.v1',
      'intelligence.ai_run.reviewed.v1',
      'security.candidate.submitted.v1',
      'security.candidate.reviewed.v1',
      'security.indicator.accepted.v1',
      'security.incident.opened.v1',
      'security.incident.changed.v1',
      'security.indicator.disclosure_changed.v1',
      'reference.registered.v1',
      'reference.decided.v1',
      'domain_authority.decided.v1',
      'reference.security_flagged.v1',
      'tutorial.published.v1',
      'tutorial.status_changed.v1'
    )
  );

alter table public.outbox_events
  drop constraint outbox_events_payload_valid,
  add constraint outbox_events_payload_valid check (
    pg_catalog.jsonb_typeof(payload) = 'object'
    and (payload ->> 'version') = '1'
    and (
      (
        event_type in (
          'intelligence.signal.promoted.v1',
          'intelligence.candidate.reviewed.v1'
        )
        and payload ->> 'eventType' = event_type
      )
      or (
        event_type = 'intelligence.ai_run.reviewed.v1'
        and payload ?& array[
          'version', 'runId', 'reviewVersion', 'decisionId',
          'decision', 'reasonCode', 'occurredAt'
        ]
        and payload - array[
          'version', 'runId', 'reviewVersion', 'decisionId',
          'decision', 'reasonCode', 'occurredAt'
        ]::text[] = '{}'::jsonb
        and pg_catalog.jsonb_typeof(payload -> 'version') = 'number'
        and pg_catalog.jsonb_typeof(payload -> 'runId') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'reviewVersion') = 'number'
        and pg_catalog.jsonb_typeof(payload -> 'decisionId') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'decision') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'reasonCode') = 'string'
        and pg_catalog.jsonb_typeof(payload -> 'occurredAt') = 'string'
      )
      or (
        event_type in (
          'security.candidate.submitted.v1',
          'security.candidate.reviewed.v1',
          'security.indicator.accepted.v1',
          'security.incident.opened.v1',
          'security.incident.changed.v1',
          'security.indicator.disclosure_changed.v1'
        )
        and not (payload ?| array[
          'reviewerUserId', 'note', 'locator', 'quote', 'payload', 'indicatorValue',
          'evidenceId', 'rawItemId', 'rawItem', 'candidatePayload', 'internalNote'
        ])
        and payload ?& array[
          'version', 'eventType', 'aggregateId', 'aggregateVersion',
          'target', 'occurredAt'
        ]
        and pg_catalog.jsonb_typeof(payload -> 'version') = 'number'
        and pg_catalog.jsonb_typeof(payload -> 'eventType') = 'string'
        and payload ->> 'eventType' = event_type
        and pg_catalog.jsonb_typeof(payload -> 'aggregateId') = 'string'
        and payload ->> 'aggregateId' ~
          '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
        and pg_catalog.jsonb_typeof(payload -> 'aggregateVersion') = 'number'
        and payload ->> 'aggregateVersion' ~ '^[1-9][0-9]*$'
        and pg_catalog.jsonb_typeof(payload -> 'target') = 'object'
        and payload -> 'target' ?& array['type', 'id']
        and (payload -> 'target') - array['type', 'id']::text[] = '{}'::jsonb
        and pg_catalog.jsonb_typeof(payload -> 'target' -> 'type') = 'string'
        and payload -> 'target' ->> 'type' in ('project', 'source')
        and pg_catalog.jsonb_typeof(payload -> 'target' -> 'id') = 'string'
        and payload -> 'target' ->> 'id' ~
          '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
        and pg_catalog.jsonb_typeof(payload -> 'occurredAt') = 'string'
        and payload ->> 'occurredAt' ~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
        and (not payload ? 'candidateId' or (
          pg_catalog.jsonb_typeof(payload -> 'candidateId') = 'string'
          and payload ->> 'candidateId' ~
            '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'))
        and (not payload ? 'decisionId' or (
          pg_catalog.jsonb_typeof(payload -> 'decisionId') = 'string'
          and payload ->> 'decisionId' ~
            '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'))
        and (not payload ? 'indicatorId' or (
          pg_catalog.jsonb_typeof(payload -> 'indicatorId') = 'string'
          and payload ->> 'indicatorId' ~
            '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'))
        and (not payload ? 'incidentId' or (
          pg_catalog.jsonb_typeof(payload -> 'incidentId') = 'string'
          and payload ->> 'incidentId' ~
            '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'))
        and (
          (event_type = 'security.candidate.submitted.v1'
            and payload ?& array['candidateId']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'candidateId', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'security.candidate.reviewed.v1'
            and payload ?& array['candidateId', 'decisionId']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'candidateId', 'decisionId', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'security.indicator.accepted.v1'
            and payload ?& array['indicatorId']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'indicatorId', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'security.incident.opened.v1'
            and payload ?& array['incidentId', 'decisionId', 'resultingPosture']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'incidentId', 'decisionId', 'resultingPosture', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'security.incident.changed.v1'
            and payload ?& array['incidentId', 'decisionId', 'resultingPosture']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'incidentId', 'decisionId', 'resultingPosture', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'security.indicator.disclosure_changed.v1'
            and payload ?& array['indicatorId']
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'target', 'indicatorId', 'occurredAt'
            ]::text[] = '{}'::jsonb)
        )
      )
      or (
        event_type in (
          'reference.registered.v1',
          'reference.decided.v1',
          'domain_authority.decided.v1',
          'reference.security_flagged.v1'
        )
        and not (payload ?| array[
          'reviewerUserId', 'note', 'locator', 'quote', 'payload', 'indicatorValue',
          'evidenceId', 'rawItemId', 'rawItem', 'candidatePayload', 'internalNote'
        ])
        and payload ?& array[
          'version', 'eventType', 'aggregateId', 'aggregateVersion', 'occurredAt'
        ]
        and pg_catalog.jsonb_typeof(payload -> 'version') = 'number'
        and pg_catalog.jsonb_typeof(payload -> 'eventType') = 'string'
        and payload ->> 'eventType' = event_type
        and pg_catalog.jsonb_typeof(payload -> 'aggregateId') = 'string'
        and payload ->> 'aggregateId' ~
          '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
        and pg_catalog.jsonb_typeof(payload -> 'aggregateVersion') = 'number'
        and payload ->> 'aggregateVersion' ~ '^[1-9][0-9]*$'
        and pg_catalog.jsonb_typeof(payload -> 'occurredAt') = 'string'
        and payload ->> 'occurredAt' ~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
        and (
          (event_type = 'reference.registered.v1'
            and payload ?& array['projectId']
            and pg_catalog.jsonb_typeof(payload -> 'projectId') = 'string'
            and payload ->> 'projectId' ~
              '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'projectId', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'reference.decided.v1'
            and payload ?& array['decisionId', 'resultingState']
            and pg_catalog.jsonb_typeof(payload -> 'decisionId') = 'string'
            and payload ->> 'decisionId' ~
              '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
            and payload ->> 'resultingState' in ('candidate', 'verified', 'flagged', 'withdrawn')
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'decisionId', 'resultingState', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'domain_authority.decided.v1'
            and payload ?& array['decisionId', 'resultingState']
            and pg_catalog.jsonb_typeof(payload -> 'decisionId') = 'string'
            and payload ->> 'decisionId' ~
              '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
            and payload ->> 'resultingState' in ('candidate', 'granted', 'revoked')
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'decisionId', 'resultingState', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'reference.security_flagged.v1'
            and payload ?& array['indicatorId']
            and pg_catalog.jsonb_typeof(payload -> 'indicatorId') = 'string'
            and payload ->> 'indicatorId' ~
              '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'indicatorId', 'occurredAt'
            ]::text[] = '{}'::jsonb)
        )
      )
      or (
        event_type in ('tutorial.published.v1', 'tutorial.status_changed.v1')
        and not (payload ?| array[
          'reviewerUserId', 'note', 'locator', 'quote', 'payload', 'indicatorValue',
          'evidenceId', 'rawItemId', 'rawItem', 'candidatePayload', 'internalNote',
          'steps', 'sourceSignalIds', 'summary'
        ])
        and payload ?& array[
          'version', 'eventType', 'aggregateId', 'aggregateVersion', 'occurredAt'
        ]
        and pg_catalog.jsonb_typeof(payload -> 'version') = 'number'
        and pg_catalog.jsonb_typeof(payload -> 'eventType') = 'string'
        and payload ->> 'eventType' = event_type
        and pg_catalog.jsonb_typeof(payload -> 'aggregateId') = 'string'
        and payload ->> 'aggregateId' ~
          '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
        and pg_catalog.jsonb_typeof(payload -> 'aggregateVersion') = 'number'
        and payload ->> 'aggregateVersion' ~ '^[1-9][0-9]*$'
        and pg_catalog.jsonb_typeof(payload -> 'occurredAt') = 'string'
        and payload ->> 'occurredAt' ~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
        and pg_catalog.jsonb_typeof(payload -> 'projectId') = 'string'
        and payload ->> 'projectId' ~
          '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
        and (
          (event_type = 'tutorial.published.v1'
            and payload ?& array['kind']
            and pg_catalog.jsonb_typeof(payload -> 'kind') = 'string'
            and payload ->> 'kind' in (
              'airdrop_campaign',
              'points_program',
              'snapshot_notice',
              'task_launch',
              'token_launch',
              'eligibility_rule'
            )
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'projectId', 'kind', 'occurredAt'
            ]::text[] = '{}'::jsonb)
          or (event_type = 'tutorial.status_changed.v1'
            and payload ?& array['fromStatus', 'toStatus']
            and payload ->> 'fromStatus' in (
              'draft', 'in_review', 'published', 'needs_review', 'blocked', 'retired'
            )
            and payload ->> 'toStatus' in (
              'draft', 'in_review', 'published', 'needs_review', 'blocked', 'retired'
            )
            and (
              pg_catalog.jsonb_typeof(payload -> 'trigger') = 'null'
              or (
                pg_catalog.jsonb_typeof(payload -> 'trigger') = 'string'
                and payload ->> 'trigger' in (
                  'project_blocked',
                  'source_blocked',
                  'reference_unrenderable',
                  'signal_disputed',
                  'signal_retracted',
                  'lifecycle_changed'
                )
              )
            )
            and payload - array[
              'version', 'eventType', 'aggregateId', 'aggregateVersion',
              'projectId', 'fromStatus', 'toStatus', 'trigger', 'occurredAt'
            ]::text[] = '{}'::jsonb)
        )
      )
    )
  );
