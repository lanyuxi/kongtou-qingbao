-- Phase 7B verified allowlisted references.  This migration is intentionally
-- forward-only.  Reference state is derived from immutable decisions rather
-- than stored on projects or sources, and every canonical write enters through
-- the protected commands below.  Phase 7A objects are consumed read-only.

-- Normalization is shared by registration, verification, and the Phase 7A
-- indicator coupling so a value cannot verify under one form and be flagged
-- under another.

create function public.normalize_reference_domain_v1(p_value text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_host text;
  v_label text;
begin
  if p_value is null then
    return null;
  end if;
  if p_value <> pg_catalog.btrim(p_value) then
    return null;
  end if;
  -- Printable ASCII only: rejects control characters and every non-ASCII byte
  -- so both layers agree. Whitespace is rejected separately because a plain
  -- space is printable.
  if p_value ~ '[^ -~]' or p_value ~ '[[:space:]]' then
    return null;
  end if;
  if p_value ~ '[/:@?#%]' then
    return null;
  end if;

  v_host := pg_catalog.regexp_replace(pg_catalog.lower(p_value), '\.$', '');
  if v_host = '' or pg_catalog.char_length(v_host) > 253 then
    return null;
  end if;
  if v_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$' then
    return null;
  end if;

  for v_label in select pg_catalog.unnest(pg_catalog.string_to_array(v_host, '.')) loop
    if pg_catalog.char_length(v_label) < 1 or pg_catalog.char_length(v_label) > 63 then
      return null;
    end if;
  end loop;

  return v_host;
end;
$function$;

alter function public.normalize_reference_domain_v1(text) owner to postgres;

create function public.normalize_reference_url_v1(p_value text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_rest text;
  v_end integer;
  v_authority text;
  v_tail text;
  v_host text;
  v_port text;
  v_path text;
  v_query text;
  v_path_with_query text;
  v_query_at integer;
begin
  if p_value is null then
    return null;
  end if;
  if p_value <> pg_catalog.btrim(p_value) then
    return null;
  end if;
  -- Printable ASCII only, matching the TypeScript normalizer exactly.
  -- Whitespace is rejected separately because a plain space is printable.
  if p_value ~ '[^ -~]' or p_value ~ '[[:space:]]' then
    return null;
  end if;
  if p_value !~ '^https://' then
    return null;
  end if;

  v_rest := pg_catalog.substring(p_value, 9);
  -- An empty authority must be rejected explicitly: a bare `https:///claim`
  -- would otherwise be repointed at host `claim`.
  if v_rest = '' or v_rest ~ '^[/?#]' then
    return null;
  end if;
  -- Percent-encoding in the authority would decode to a different host than
  -- the raw string suggests; more than one colon means an IPv6 literal.
  if pg_catalog.strpos(v_rest, '%') between 1 and coalesce(
    least(
      nullif(pg_catalog.strpos(v_rest, '/'), 0),
      nullif(pg_catalog.strpos(v_rest, '?'), 0),
      nullif(pg_catalog.strpos(v_rest, '#'), 0)
    ) - 1,
    pg_catalog.length(v_rest)
  ) then
    return null;
  end if;
  if pg_catalog.length(v_rest) - pg_catalog.length(pg_catalog.replace(v_rest, ':', '')) > 1 then
    return null;
  end if;

  v_end := least(
    nullif(pg_catalog.strpos(v_rest, '/'), 0),
    nullif(pg_catalog.strpos(v_rest, '?'), 0),
    nullif(pg_catalog.strpos(v_rest, '#'), 0)
  );

  if v_end is null then
    v_authority := v_rest;
    v_tail := '';
  else
    v_authority := pg_catalog.substring(v_rest, 1, v_end - 1);
    v_tail := pg_catalog.substring(v_rest, v_end);
  end if;

  v_host := v_authority;
  v_port := null;
  if pg_catalog.strpos(v_authority, ':') > 0 then
    v_host := pg_catalog.split_part(v_authority, ':', 1);
    v_port := pg_catalog.split_part(v_authority, ':', 2);
    if v_port !~ '^[0-9]+$' or v_port::integer < 0 or v_port::integer > 65535 then
      return null;
    end if;
    -- Strip leading zeros so `:0080` and `:80` are the same reference.
    v_port := pg_catalog.ltrim(v_port, '0');
    if v_port = '' then
      v_port := '0';
    end if;
    if v_port = '443' then
      v_port := null;
    end if;
  end if;

  v_host := public.normalize_reference_domain_v1(v_host);
  if v_host is null then
    return null;
  end if;

  v_path := '/';
  v_query := '';
  if v_tail <> '' then
    v_path_with_query := pg_catalog.split_part(v_tail, '#', 1);
    if pg_catalog.substring(v_path_with_query, 1, 1) = '?' then
      v_query := v_path_with_query;
    else
      v_query_at := pg_catalog.strpos(v_path_with_query, '?');
      if v_query_at = 0 then
        v_path := v_path_with_query;
      else
        v_path := pg_catalog.substring(v_path_with_query, 1, v_query_at - 1);
        v_query := pg_catalog.substring(v_path_with_query, v_query_at);
      end if;
    end if;
  end if;

  if v_path = '' then
    v_path := '/';
  end if;
  if v_query = '?' then
    v_query := '';
  end if;
  -- Dot-segments are rejected instead of silently rewritten: the TypeScript
  -- layer rejects them too, so both layers agree on the same raw input.
  if v_path = '/.' or v_path = '/..'
    or pg_catalog.strpos(v_path, '/./') > 0
    or pg_catalog.strpos(v_path, '/../') > 0
    or pg_catalog.right(v_path, 2) = '/.'
    or pg_catalog.right(v_path, 3) = '/..'
  then
    return null;
  end if;

  if v_port is null then
    return 'https://' || v_host || v_path || v_query;
  end if;

  return 'https://' || v_host || ':' || v_port || v_path || v_query;
end;
$function$;

alter function public.normalize_reference_url_v1(text) owner to postgres;

create function public.reject_reference_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'reference_ledger_append_only' using errcode = '55000';
end;
$function$;

alter function public.reject_reference_ledger_mutation() owner to postgres;

-- Release-only mutation on the flag table: a flag row is never deleted and only
-- its release columns may be filled in once.
create function public.enforce_reference_flag_release_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if old.reference_id <> new.reference_id
    or old.indicator_id <> new.indicator_id
    or old.created_at <> new.created_at
  then
    raise exception 'reference_ledger_append_only' using errcode = '55000';
  end if;
  if old.released_at is not null then
    raise exception 'reference_flag_already_released' using errcode = 'AR208';
  end if;
  if new.released_at is null or new.released_by is null then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;
  return new;
end;
$function$;

alter function public.enforce_reference_flag_release_only() owner to postgres;

create function public.actor_has_active_reference_role(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select exists (
    select 1
    from public.user_roles as role_grant
    where role_grant.user_id = p_user_id
      and role_grant.role in ('reviewer', 'senior_reviewer', 'admin')
      and role_grant.revoked_at is null
  );
$function$;

alter function public.actor_has_active_reference_role(uuid) owner to postgres;

create function public.reference_evidence_is_usable(p_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select exists (
    select 1
    from public.evidence as evidence_row
    where evidence_row.id = p_evidence_id
      and public.current_security_target_posture('source', evidence_row.source_id) <> 'blocked'
  );
$function$;

alter function public.reference_evidence_is_usable(uuid) owner to postgres;

create table public.project_domain_authorities (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null
    constraint project_domain_authorities_project_id_fkey
    references public.projects (id) on delete restrict,
  normalized_domain text not null,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint project_domain_authorities_scope_key unique (project_id, normalized_domain),
  constraint project_domain_authorities_domain_normalized check (
    normalized_domain = public.normalize_reference_domain_v1(normalized_domain)
    and pg_catalog.char_length(normalized_domain) between 1 and 253
  ),
  constraint project_domain_authorities_version_positive check (version > 0)
);

create table public.project_domain_authority_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  authority_id uuid not null
    constraint project_domain_authority_decisions_authority_id_fkey
    references public.project_domain_authorities (id) on delete restrict,
  decision text not null,
  resulting_state text not null,
  reason_code text not null,
  aggregate_version bigint not null,
  evidence_id uuid null
    constraint project_domain_authority_decisions_evidence_id_fkey
    references public.evidence (id) on delete restrict,
  actor_user_id uuid not null
    constraint project_domain_authority_decisions_actor_user_id_fkey
    references public.profiles (id) on delete restrict,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint project_domain_authority_decisions_decision_valid check (
    decision in ('register', 'grant', 'revoke', 'regrant')
  ),
  constraint project_domain_authority_decisions_state_valid check (
    resulting_state in ('candidate', 'granted', 'revoked')
  ),
  constraint project_domain_authority_decisions_reason_valid check (
    reason_code in (
      'evidence_verified',
      'official_announcement',
      'corroborated_source',
      'ownership_unproven',
      'domain_mismatch',
      'duplicate_reference',
      'source_no_longer_official',
      'security_flag_cleared',
      'withdrawn_by_reviewer',
      'insufficient_context'
    )
  ),
  constraint project_domain_authority_decisions_key_valid check (
    pg_catalog.char_length(idempotency_key) between 1 and 255
    and idempotency_key = pg_catalog.btrim(idempotency_key)
  ),
  constraint project_domain_authority_decisions_transition_valid check (
    (decision = 'register' and resulting_state = 'candidate')
    or (decision = 'grant' and resulting_state = 'granted')
    or (decision = 'revoke' and resulting_state = 'revoked')
    or (decision = 'regrant' and resulting_state = 'granted')
  ),
  constraint project_domain_authority_decisions_evidence_rule check (
    (decision not in ('grant', 'regrant'))
    or evidence_id is not null
  ),
  constraint project_domain_authority_decisions_idempotency_key
    unique (authority_id, idempotency_key)
);

create table public.project_references (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null
    constraint project_references_project_id_fkey
    references public.projects (id) on delete restrict,
  kind text not null,
  normalized_url text not null,
  normalized_domain text not null,
  label text not null,
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint project_references_url_key unique (normalized_url),
  constraint project_references_kind_valid check (
    kind in (
      'official_site',
      'official_docs',
      'claim_portal',
      'app_entry',
      'official_social',
      'code_repository',
      'announcement',
      'other'
    )
  ),
  constraint project_references_url_normalized check (
    normalized_url = public.normalize_reference_url_v1(normalized_url)
    and pg_catalog.char_length(normalized_url) between 11 and 2048
  ),
  constraint project_references_domain_normalized check (
    normalized_domain = public.normalize_reference_domain_v1(normalized_domain)
  ),
  constraint project_references_label_valid check (
    label = pg_catalog.btrim(label)
    and pg_catalog.char_length(label) between 1 and 160
  ),
  constraint project_references_version_positive check (version > 0)
);

create table public.project_reference_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  reference_id uuid not null
    constraint project_reference_decisions_reference_id_fkey
    references public.project_references (id) on delete restrict,
  decision text not null,
  resulting_state text not null,
  reason_code text not null,
  aggregate_version bigint not null,
  evidence_id uuid null
    constraint project_reference_decisions_evidence_id_fkey
    references public.evidence (id) on delete restrict,
  actor_user_id uuid not null
    constraint project_reference_decisions_actor_user_id_fkey
    references public.profiles (id) on delete restrict,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint project_reference_decisions_decision_valid check (
    decision in ('register', 'verify', 'reverify', 'restore', 'withdraw')
  ),
  constraint project_reference_decisions_state_valid check (
    resulting_state in ('candidate', 'verified', 'flagged', 'withdrawn')
  ),
  constraint project_reference_decisions_reason_valid check (
    reason_code in (
      'evidence_verified',
      'official_announcement',
      'corroborated_source',
      'ownership_unproven',
      'domain_mismatch',
      'duplicate_reference',
      'source_no_longer_official',
      'security_flag_cleared',
      'withdrawn_by_reviewer',
      'insufficient_context'
    )
  ),
  constraint project_reference_decisions_key_valid check (
    pg_catalog.char_length(idempotency_key) between 1 and 255
    and idempotency_key = pg_catalog.btrim(idempotency_key)
  ),
  constraint project_reference_decisions_transition_valid check (
    (decision = 'register' and resulting_state = 'candidate')
    or (decision in ('verify', 'reverify', 'restore') and resulting_state = 'verified')
    or (decision = 'withdraw' and resulting_state = 'withdrawn')
  ),
  constraint project_reference_decisions_evidence_rule check (
    (decision not in ('verify', 'reverify', 'restore'))
    or evidence_id is not null
  ),
  constraint project_reference_decisions_idempotency_key
    unique (reference_id, idempotency_key)
);

create table public.reference_security_flags (
  id uuid primary key default extensions.gen_random_uuid(),
  reference_id uuid not null
    constraint reference_security_flags_reference_id_fkey
    references public.project_references (id) on delete restrict,
  indicator_id uuid not null
    constraint reference_security_flags_indicator_id_fkey
    references public.security_indicators (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  released_at timestamptz null,
  released_by uuid null
    constraint reference_security_flags_released_by_fkey
    references public.profiles (id) on delete restrict,
  release_evidence_id uuid null
    constraint reference_security_flags_release_evidence_id_fkey
    references public.evidence (id) on delete restrict,
  constraint reference_security_flags_pair_key unique (reference_id, indicator_id),
  constraint reference_security_flags_release_complete check (
    released_at is null
    or (
      released_by is not null
      and released_at > created_at
    )
  )
);

create trigger project_domain_authority_decisions_append_only
before update or delete on public.project_domain_authority_decisions
for each row execute function public.reject_reference_ledger_mutation();

create trigger project_reference_decisions_append_only
before update or delete on public.project_reference_decisions
for each row execute function public.reject_reference_ledger_mutation();

create trigger reference_security_flags_no_delete
before delete on public.reference_security_flags
for each row execute function public.reject_reference_ledger_mutation();

create trigger reference_security_flags_release_only
before update on public.reference_security_flags
for each row execute function public.enforce_reference_flag_release_only();

create index project_domain_authorities_project_idx
on public.project_domain_authorities (project_id);

create index project_references_project_idx
on public.project_references (project_id);

create index project_references_domain_idx
on public.project_references (normalized_domain);

create index project_reference_decisions_reference_created_idx
on public.project_reference_decisions (reference_id, created_at desc);

create index project_domain_authority_decisions_authority_created_idx
on public.project_domain_authority_decisions (authority_id, created_at desc);

create index reference_security_flags_reference_idx
on public.reference_security_flags (reference_id)
where released_at is null;

create function public.match_references_for_indicator(
  p_indicator_type text,
  p_value text
)
returns table (reference_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select reference_row.id
  from public.project_references as reference_row
  where case
    when p_indicator_type = 'url'
      then public.normalize_reference_url_v1(p_value) = reference_row.normalized_url
    when p_indicator_type = 'domain'
      then public.normalize_reference_domain_v1(p_value) = reference_row.normalized_domain
    else false
  end;
$function$;

alter function public.match_references_for_indicator(text, text) owner to postgres;

-- Command receipts mirror the security_review_commands shape so replay,
-- idempotency conflicts, and audit stay uniform across ledgers.

create table public.reference_review_commands (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid not null
    constraint reference_review_commands_actor_fkey
    references public.profiles (id) on delete restrict,
  operation text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  idempotency_key text not null,
  input_hash text not null,
  expected_version bigint null,
  resulting_version bigint null,
  decision_id uuid null,
  result_payload jsonb not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint reference_review_commands_actor_key unique (actor_user_id, idempotency_key),
  constraint reference_review_commands_operation_valid check (
    operation in (
      'register_reference',
      'decide_reference',
      'register_domain_authority',
      'decide_domain_authority'
    )
  ),
  constraint reference_review_commands_aggregate_valid check (
    aggregate_type in ('reference', 'domain_authority')
  ),
  constraint reference_review_commands_input_hash_valid check (
    input_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint reference_review_commands_result_payload_object check (
    pg_catalog.jsonb_typeof(result_payload) = 'object'
    and (result_payload ->> 'version') = '1'
  )
);

-- Derived state helpers. Every consumer reads state through these functions so
-- an unreleased security flag always wins over the last verification.

create function public.reference_current_state_v1(p_reference_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select case
    when exists (
      select 1
      from public.reference_security_flags as flag
      where flag.reference_id = p_reference_id
        and flag.released_at is null
    )
      then 'flagged'
    else coalesce(
      (
        select decision.resulting_state
        from public.project_reference_decisions as decision
        where decision.reference_id = p_reference_id
        order by decision.aggregate_version desc, decision.created_at desc, decision.id desc
        limit 1
      ),
      'candidate'
    )
  end;
$function$;

alter function public.reference_current_state_v1(uuid) owner to postgres;

create function public.reference_last_verified_at_v1(p_reference_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select decision.created_at
  from public.project_reference_decisions as decision
  where decision.reference_id = p_reference_id
    and decision.resulting_state = 'verified'
  order by decision.created_at desc, decision.id desc
  limit 1;
$function$;

alter function public.reference_last_verified_at_v1(uuid) owner to postgres;

create function public.domain_authority_current_state_v1(p_authority_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select coalesce(
    (
      select decision.resulting_state
      from public.project_domain_authority_decisions as decision
      where decision.authority_id = p_authority_id
      order by decision.aggregate_version desc, decision.created_at desc, decision.id desc
      limit 1
    ),
    'candidate'
  );
$function$;

alter function public.domain_authority_current_state_v1(uuid) owner to postgres;

create function public.domain_authority_state_for_reference(p_reference_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select public.domain_authority_current_state_v1(authority.id)
  from public.project_domain_authorities as authority
  where authority.project_id = (
      select reference_row.project_id
      from public.project_references as reference_row
      where reference_row.id = p_reference_id
    )
    and authority.normalized_domain = (
      select reference_row.normalized_domain
      from public.project_references as reference_row
      where reference_row.id = p_reference_id
    )
  limit 1;
$function$;

alter function public.domain_authority_state_for_reference(uuid) owner to postgres;

create function public.domain_authority_granted_at_v1(p_authority_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select decision.created_at
  from public.project_domain_authority_decisions as decision
  where decision.authority_id = p_authority_id
    and decision.resulting_state = 'granted'
  order by decision.aggregate_version desc, decision.created_at desc, decision.id desc
  limit 1;
$function$;

alter function public.domain_authority_granted_at_v1(uuid) owner to postgres;

-- Single decision point for "may this reference be rendered publicly". Both
-- the RLS policy and the public view call it, so the lifecycle, posture, and
-- state rules cannot drift apart. Security definer keeps the 7A posture
-- function out of anonymous reach.
create function public.reference_is_publicly_renderable_v1(p_reference_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  select
    public.reference_current_state_v1(p_reference_id) = 'verified'
    and exists (
      select 1
      from public.projects as project
      where project.id = (
        select reference_row.project_id
        from public.project_references as reference_row
        where reference_row.id = p_reference_id
      )
        and project.lifecycle in ('active', 'rumored')
    )
    and public.current_security_target_posture(
      'project',
      (
        select reference_row.project_id
        from public.project_references as reference_row
        where reference_row.id = p_reference_id
      )
    ) <> 'blocked';
$function$;

alter function public.reference_is_publicly_renderable_v1(uuid) owner to postgres;

-- Synchronous Phase 7A coupling: accepting an indicator flags every reference
-- whose normalized url or domain matches. The flag row is never deleted.

create function public.flag_references_for_new_indicator()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_matched record;
  v_occurred_at_text text;
begin
  v_occurred_at_text := pg_catalog.to_char(
    pg_catalog.transaction_timestamp() at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  for v_matched in
    select reference_row.id as reference_id, reference_row.version as reference_version
    from public.match_references_for_indicator(new.indicator_type, new.value_text) as matched
    join public.project_references as reference_row
      on reference_row.id = matched.reference_id
  loop
    insert into public.reference_security_flags (reference_id, indicator_id)
    values (v_matched.reference_id, new.id)
    on conflict (reference_id, indicator_id) do nothing;

    -- Only the flag that this indicator actually created is published.
    if found then
      insert into public.outbox_events (
        aggregate_type, aggregate_id, aggregate_version,
        event_type, payload, occurred_at, created_at
      ) values (
        'reference', v_matched.reference_id, v_matched.reference_version,
        'reference.security_flagged.v1',
        pg_catalog.jsonb_build_object(
          'version', 1,
          'eventType', 'reference.security_flagged.v1',
          'aggregateId', v_matched.reference_id,
          'aggregateVersion', v_matched.reference_version,
          'indicatorId', new.id,
          'occurredAt', v_occurred_at_text
        ),
        pg_catalog.transaction_timestamp(),
        pg_catalog.transaction_timestamp()
      );
    end if;
  end loop;

  return null;
end;
$function$;

alter function public.flag_references_for_new_indicator() owner to postgres;

create trigger security_indicators_flag_references
after insert on public.security_indicators
for each row execute function public.flag_references_for_new_indicator();

-- Protected commands. Caller identity comes only from auth.uid(); revocation
-- takes effect on the next call.

create function public.submit_register_domain_authority(
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "authorityId" uuid,
  "authorityVersion" bigint,
  state text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
  v_input_hash text;
  v_project_id uuid;
  v_domain text;
  v_normalized_domain text;
  v_evidence_id uuid;
  v_note text;
  v_command_id uuid;
  v_authority_id uuid;
  v_version bigint;
  v_decision_id uuid;
  v_now timestamptz;
  v_occurred_at_text text;
  v_existing record;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'reference_reviewer_required' using errcode = 'AR204';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'projectId', 'domain', 'evidenceId', 'note']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'projectId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'domain') <> 'string'
    or not public.security_json_uuid_is_valid(p_command_payload, 'evidenceId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'note') <> 'null'
  then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;

  v_project_id := (p_command_payload ->> 'projectId')::uuid;
  v_evidence_id := (p_command_payload ->> 'evidenceId')::uuid;
  v_note := null;
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'register_domain_authority', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();
  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  select * into v_existing
  from public.reference_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'register_domain_authority'
      or v_existing.input_hash <> v_input_hash
    then
      raise exception 'reference_idempotency_conflict' using errcode = 'AR207';
    end if;
    return query select
      1,
      v_existing.id,
      v_existing.aggregate_id,
      v_existing.resulting_version,
      v_existing.result_payload ->> 'state',
      true;
    -- RETURN QUERY appends without exiting, so the replay branch must return
    -- explicitly or it would fall through into the version checks.
    return;
  end if;

  v_domain := p_command_payload ->> 'domain';
  v_normalized_domain := public.normalize_reference_domain_v1(v_domain);
  if v_normalized_domain is null then
    raise exception 'reference_normalization_invalid' using errcode = 'AR210';
  end if;

  if not exists (select 1 from public.projects as project where project.id = v_project_id) then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;
  if not public.reference_evidence_is_usable(v_evidence_id) then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  begin
    -- `version` is also an OUT parameter of this function, so every column
    -- reference is qualified and no INSERT ... RETURNING is used.
    if exists (
      select 1
      from public.project_domain_authorities as authority
      where authority.project_id = v_project_id
        and authority.normalized_domain = v_normalized_domain
    ) then
      raise exception 'reference_command_invalid' using errcode = 'AR208';
    end if;

    insert into public.project_domain_authorities (project_id, normalized_domain)
    values (v_project_id, v_normalized_domain);

    select authority.id, authority.version
    into v_authority_id, v_version
    from public.project_domain_authorities as authority
    where authority.project_id = v_project_id
      and authority.normalized_domain = v_normalized_domain;

    insert into public.project_domain_authority_decisions (
      authority_id, decision, resulting_state, reason_code, aggregate_version,
      evidence_id, actor_user_id, idempotency_key, created_at
    ) values (
      v_authority_id, 'register', 'candidate', 'insufficient_context', v_version,
      v_evidence_id, v_actor, p_idempotency_key, v_now
    ) returning id into v_decision_id;

    v_command_id := extensions.gen_random_uuid();
    insert into public.reference_review_commands (
      id, actor_user_id, operation, aggregate_type, aggregate_id,
      idempotency_key, input_hash, resulting_version, decision_id,
      result_payload, created_at
    ) values (
      v_command_id, v_actor, 'register_domain_authority', 'domain_authority',
      v_authority_id, p_idempotency_key, v_input_hash, v_version, v_decision_id,
      pg_catalog.jsonb_build_object(
        'version', 1,
        'commandId', v_command_id,
        'authorityId', v_authority_id,
        'authorityVersion', v_version,
        'state', 'candidate'
      ),
      v_now
    );

    insert into public.outbox_events (
      aggregate_type, aggregate_id, aggregate_version,
      event_type, payload, occurred_at, created_at
    ) values (
      'domain_authority', v_authority_id, v_version,
      'domain_authority.decided.v1',
      pg_catalog.jsonb_build_object(
        'version', 1,
        'eventType', 'domain_authority.decided.v1',
        'aggregateId', v_authority_id,
        'aggregateVersion', v_version,
        'decisionId', v_decision_id,
        'resultingState', 'candidate',
        'occurredAt', v_occurred_at_text
      ),
      v_now, v_now
    );

    return query select
      1, v_command_id, v_authority_id, v_version, 'candidate'::text, false;
  exception
    when unique_violation then
      raise exception 'reference_command_invalid' using errcode = 'AR208';
    when others then
      if SQLSTATE in ('AR204', 'AR207', 'AR208', 'AR209', 'AR210') then
        raise;
      end if;
      raise exception 'reference_persistence_failed' using errcode = 'AR299';
  end;
end;
$function$;

alter function public.submit_register_domain_authority(jsonb, text) owner to postgres;
revoke all on function public.submit_register_domain_authority(jsonb, text) from public;
grant execute on function public.submit_register_domain_authority(jsonb, text) to authenticated;

create function public.reference_url_host_v1(p_normalized_url text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $function$
  select public.normalize_reference_domain_v1(
    pg_catalog.split_part(
      pg_catalog.split_part(
        pg_catalog.split_part(p_normalized_url, '//', 2),
        '/',
        1
      ),
      ':',
      1
    )
  );
$function$;

alter function public.reference_url_host_v1(text) owner to postgres;

create function public.submit_decide_domain_authority(
  p_authority_id uuid,
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "authorityId" uuid,
  "authorityVersion" bigint,
  state text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
  v_input_hash text;
  v_decision text;
  v_reason text;
  v_evidence_id uuid;
  v_expected_version bigint;
  v_current_version bigint;
  v_current_state text;
  v_next_state text;
  v_command_id uuid;
  v_decision_id uuid;
  v_now timestamptz;
  v_occurred_at_text text;
  v_existing record;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'reference_reviewer_required' using errcode = 'AR204';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'authorityId', 'expectedVersion', 'decision', 'reasonCode', 'evidenceId', 'note']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'authorityId')
    or p_command_payload ->> 'authorityId' <> p_authority_id::text
    or not public.security_json_positive_bigint_is_valid(p_command_payload, 'expectedVersion')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'decision') <> 'string'
    or p_command_payload ->> 'decision' not in ('grant', 'revoke', 'regrant')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'reasonCode') <> 'string'
    or p_command_payload ->> 'reasonCode' not in (
      'evidence_verified',
      'official_announcement',
      'corroborated_source',
      'ownership_unproven',
      'domain_mismatch',
      'duplicate_reference',
      'source_no_longer_official',
      'security_flag_cleared',
      'withdrawn_by_reviewer',
      'insufficient_context'
    )
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'evidenceId') = 'null'
      or public.security_json_uuid_is_valid(p_command_payload, 'evidenceId')
    )
    or pg_catalog.jsonb_typeof(p_command_payload -> 'note') <> 'null'
  then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;

  v_decision := p_command_payload ->> 'decision';
  v_reason := p_command_payload ->> 'reasonCode';
  v_evidence_id := (p_command_payload ->> 'evidenceId')::uuid;
  v_expected_version := (p_command_payload ->> 'expectedVersion')::bigint;
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'decide_domain_authority', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();
  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  if v_decision in ('grant', 'regrant') and v_evidence_id is null then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  select * into v_existing
  from public.reference_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'decide_domain_authority'
      or v_existing.aggregate_id <> p_authority_id
      or v_existing.input_hash <> v_input_hash
    then
      raise exception 'reference_idempotency_conflict' using errcode = 'AR207';
    end if;
    return query select
      1,
      v_existing.id,
      v_existing.aggregate_id,
      v_existing.resulting_version,
      v_existing.result_payload ->> 'state',
      true;
    -- RETURN QUERY appends without exiting, so the replay branch must return
    -- explicitly or it would fall through into the version checks.
    return;
  end if;

  select authority.version into v_current_version
  from public.project_domain_authorities as authority
  where authority.id = p_authority_id
  for update;

  if not found then
    raise exception 'domain_authority_not_found' using errcode = 'AR203';
  end if;

  if v_current_version <> v_expected_version then
    raise exception 'reference_version_conflict' using errcode = 'AR206';
  end if;

  v_current_state := public.domain_authority_current_state_v1(p_authority_id);

  v_next_state := case
    when v_decision = 'grant' then 'granted'
    when v_decision = 'revoke' then 'revoked'
    when v_decision = 'regrant' then 'granted'
  end;

  if not (
    (v_current_state = 'candidate' and v_decision = 'grant')
    or (v_current_state = 'granted' and v_decision = 'revoke')
    or (v_current_state = 'revoked' and v_decision = 'regrant')
  ) then
    raise exception 'reference_not_decidable' using errcode = 'AR202';
  end if;

  update public.project_domain_authorities as authority_row
  set version = authority_row.version + 1
  where authority_row.id = p_authority_id;

  insert into public.project_domain_authority_decisions (
    authority_id, decision, resulting_state, reason_code, aggregate_version,
    evidence_id, actor_user_id, idempotency_key, created_at
  ) values (
    p_authority_id, v_decision, v_next_state, v_reason, v_current_version + 1,
    v_evidence_id, v_actor, p_idempotency_key, v_now
  ) returning id into v_decision_id;

  v_command_id := extensions.gen_random_uuid();
  insert into public.reference_review_commands (
    id, actor_user_id, operation, aggregate_type, aggregate_id,
    idempotency_key, input_hash, expected_version, resulting_version,
    decision_id, result_payload, created_at
  ) values (
    v_command_id, v_actor, 'decide_domain_authority', 'domain_authority',
    p_authority_id, p_idempotency_key, v_input_hash, v_current_version,
    v_current_version + 1, v_decision_id,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'commandId', v_command_id,
      'authorityId', p_authority_id,
      'authorityVersion', v_current_version + 1,
      'state', v_next_state
    ),
    v_now
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, occurred_at, created_at
  ) values (
    'domain_authority', p_authority_id, v_current_version + 1,
    'domain_authority.decided.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'domain_authority.decided.v1',
      'aggregateId', p_authority_id,
      'aggregateVersion', v_current_version + 1,
      'decisionId', v_decision_id,
      'resultingState', v_next_state,
      'occurredAt', v_occurred_at_text
    ),
    v_now, v_now
  );

  return query select
    1, v_command_id, p_authority_id, v_current_version + 1, v_next_state::text, false;
exception
  when others then
    if SQLSTATE in ('AR202', 'AR203', 'AR204', 'AR206', 'AR207', 'AR208', 'AR209') then
      raise;
    end if;
    raise exception 'reference_persistence_failed' using errcode = 'AR299';
end;
$function$;

alter function public.submit_decide_domain_authority(uuid, jsonb, text) owner to postgres;
revoke all on function public.submit_decide_domain_authority(uuid, jsonb, text) from public;
grant execute on function public.submit_decide_domain_authority(uuid, jsonb, text) to authenticated;

create function public.submit_register_reference(
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "referenceId" uuid,
  "referenceVersion" bigint,
  state text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
  v_input_hash text;
  v_project_id uuid;
  v_kind text;
  v_url text;
  v_normalized_url text;
  v_normalized_domain text;
  v_label text;
  v_evidence_id uuid;
  v_command_id uuid;
  v_reference_id uuid;
  v_version bigint;
  v_decision_id uuid;
  v_now timestamptz;
  v_occurred_at_text text;
  v_existing record;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'reference_reviewer_required' using errcode = 'AR204';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'projectId', 'kind', 'url', 'label', 'evidenceId', 'note']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'projectId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'kind') <> 'string'
    or p_command_payload ->> 'kind' not in (
      'official_site',
      'official_docs',
      'claim_portal',
      'app_entry',
      'official_social',
      'code_repository',
      'announcement',
      'other'
    )
    or pg_catalog.jsonb_typeof(p_command_payload -> 'url') <> 'string'
    or pg_catalog.jsonb_typeof(p_command_payload -> 'label') <> 'string'
    or not public.security_json_uuid_is_valid(p_command_payload, 'evidenceId')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'note') <> 'null'
  then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;

  v_project_id := (p_command_payload ->> 'projectId')::uuid;
  v_kind := p_command_payload ->> 'kind';
  v_url := p_command_payload ->> 'url';
  v_label := p_command_payload ->> 'label';
  v_evidence_id := (p_command_payload ->> 'evidenceId')::uuid;
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'register_reference', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();
  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  select * into v_existing
  from public.reference_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'register_reference'
      or v_existing.input_hash <> v_input_hash
    then
      raise exception 'reference_idempotency_conflict' using errcode = 'AR207';
    end if;
    return query select
      1,
      v_existing.id,
      v_existing.aggregate_id,
      v_existing.resulting_version,
      v_existing.result_payload ->> 'state',
      true;
    -- RETURN QUERY appends without exiting, so the replay branch must return
    -- explicitly or it would fall through into the version checks.
    return;
  end if;

  v_normalized_url := public.normalize_reference_url_v1(v_url);
  v_normalized_domain := public.reference_url_host_v1(coalesce(v_normalized_url, ''));
  if v_normalized_url is null
    or v_normalized_domain is null
    or pg_catalog.char_length(v_label) < 1
    or pg_catalog.char_length(v_label) > 160
    or v_label <> pg_catalog.btrim(v_label)
  then
    raise exception 'reference_normalization_invalid' using errcode = 'AR210';
  end if;

  if not exists (select 1 from public.projects as project where project.id = v_project_id) then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;
  if not public.reference_evidence_is_usable(v_evidence_id) then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  begin
    if exists (
      select 1 from public.project_references as reference_row
      where reference_row.normalized_url = v_normalized_url
    ) then
      raise exception 'reference_command_invalid' using errcode = 'AR208';
    end if;

    insert into public.project_references (
      project_id, kind, normalized_url, normalized_domain, label
    ) values (
      v_project_id, v_kind, v_normalized_url, v_normalized_domain, v_label
    );

    select reference_row.id, reference_row.version
    into v_reference_id, v_version
    from public.project_references as reference_row
    where reference_row.normalized_url = v_normalized_url;

    insert into public.project_reference_decisions (
      reference_id, decision, resulting_state, reason_code, aggregate_version,
      evidence_id, actor_user_id, idempotency_key, created_at
    ) values (
      v_reference_id, 'register', 'candidate', 'insufficient_context', v_version,
      v_evidence_id, v_actor, p_idempotency_key, v_now
    ) returning id into v_decision_id;

    v_command_id := extensions.gen_random_uuid();
    insert into public.reference_review_commands (
      id, actor_user_id, operation, aggregate_type, aggregate_id,
      idempotency_key, input_hash, resulting_version, decision_id,
      result_payload, created_at
    ) values (
      v_command_id, v_actor, 'register_reference', 'reference',
      v_reference_id, p_idempotency_key, v_input_hash, v_version, v_decision_id,
      pg_catalog.jsonb_build_object(
        'version', 1,
        'commandId', v_command_id,
        'referenceId', v_reference_id,
        'referenceVersion', v_version,
        'state', 'candidate'
      ),
      v_now
    );

    insert into public.outbox_events (
      aggregate_type, aggregate_id, aggregate_version,
      event_type, payload, occurred_at, created_at
    ) values (
      'reference', v_reference_id, v_version,
      'reference.registered.v1',
      pg_catalog.jsonb_build_object(
        'version', 1,
        'eventType', 'reference.registered.v1',
        'aggregateId', v_reference_id,
        'aggregateVersion', v_version,
        'projectId', v_project_id,
        'occurredAt', v_occurred_at_text
      ),
      v_now, v_now
    );

    return query select
      1, v_command_id, v_reference_id, v_version, 'candidate'::text, false;
  exception
    when unique_violation then
      raise exception 'reference_command_invalid' using errcode = 'AR208';
    when others then
      if SQLSTATE in ('AR204', 'AR207', 'AR208', 'AR209', 'AR210') then
        raise;
      end if;
      raise exception 'reference_persistence_failed' using errcode = 'AR299';
  end;
end;
$function$;

alter function public.submit_register_reference(jsonb, text) owner to postgres;
revoke all on function public.submit_register_reference(jsonb, text) from public;
grant execute on function public.submit_register_reference(jsonb, text) to authenticated;

create function public.submit_decide_reference(
  p_reference_id uuid,
  p_command_payload jsonb,
  p_idempotency_key text
)
returns table (
  version integer,
  "commandId" uuid,
  "referenceId" uuid,
  "referenceVersion" bigint,
  state text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_actor uuid;
  v_input_hash text;
  v_decision text;
  v_reason text;
  v_evidence_id uuid;
  v_expected_version bigint;
  v_current_version bigint;
  v_current_state text;
  v_authority_state text;
  v_next_state text;
  v_command_id uuid;
  v_decision_id uuid;
  v_now timestamptz;
  v_occurred_at_text text;
  v_existing record;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.actor_has_active_reference_role(v_actor) then
    raise exception 'reference_reviewer_required' using errcode = 'AR204';
  end if;

  if p_command_payload is null
    or p_idempotency_key is null
    or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    or pg_catalog.char_length(p_idempotency_key) not between 1 and 255
    or not public.security_json_has_exact_keys(
      p_command_payload,
      array['version', 'referenceId', 'expectedVersion', 'decision', 'reasonCode', 'evidenceId', 'note']
    )
    or p_command_payload ->> 'version' <> '1'
    or not public.security_json_uuid_is_valid(p_command_payload, 'referenceId')
    or p_command_payload ->> 'referenceId' <> p_reference_id::text
    or not public.security_json_positive_bigint_is_valid(p_command_payload, 'expectedVersion')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'decision') <> 'string'
    or p_command_payload ->> 'decision' not in ('verify', 'reverify', 'restore', 'withdraw')
    or pg_catalog.jsonb_typeof(p_command_payload -> 'reasonCode') <> 'string'
    or p_command_payload ->> 'reasonCode' not in (
      'evidence_verified',
      'official_announcement',
      'corroborated_source',
      'ownership_unproven',
      'domain_mismatch',
      'duplicate_reference',
      'source_no_longer_official',
      'security_flag_cleared',
      'withdrawn_by_reviewer',
      'insufficient_context'
    )
    or not (
      pg_catalog.jsonb_typeof(p_command_payload -> 'evidenceId') = 'null'
      or public.security_json_uuid_is_valid(p_command_payload, 'evidenceId')
    )
    or pg_catalog.jsonb_typeof(p_command_payload -> 'note') <> 'null'
  then
    raise exception 'reference_command_invalid' using errcode = 'AR208';
  end if;

  v_decision := p_command_payload ->> 'decision';
  v_reason := p_command_payload ->> 'reasonCode';
  v_evidence_id := (p_command_payload ->> 'evidenceId')::uuid;
  v_expected_version := (p_command_payload ->> 'expectedVersion')::bigint;
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'decide_reference', 'payload', p_command_payload)
  );
  v_now := pg_catalog.transaction_timestamp();
  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  if v_decision in ('verify', 'reverify', 'restore') and v_evidence_id is null then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;
  if v_evidence_id is not null
    and not public.reference_evidence_is_usable(v_evidence_id)
  then
    raise exception 'reference_evidence_required' using errcode = 'AR209';
  end if;

  select * into v_existing
  from public.reference_review_commands as receipt
  where receipt.actor_user_id = v_actor
    and receipt.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation <> 'decide_reference'
      or v_existing.aggregate_id <> p_reference_id
      or v_existing.input_hash <> v_input_hash
    then
      raise exception 'reference_idempotency_conflict' using errcode = 'AR207';
    end if;
    return query select
      1,
      v_existing.id,
      v_existing.aggregate_id,
      v_existing.resulting_version,
      v_existing.result_payload ->> 'state',
      true;
    -- RETURN QUERY appends without exiting, so the replay branch must return
    -- explicitly or it would fall through into the version checks.
    return;
  end if;

  select reference_row.version into v_current_version
  from public.project_references as reference_row
  where reference_row.id = p_reference_id
  for update;

  if not found then
    raise exception 'reference_not_found' using errcode = 'AR201';
  end if;

  if v_current_version <> v_expected_version then
    raise exception 'reference_version_conflict' using errcode = 'AR206';
  end if;

  v_current_state := public.reference_current_state_v1(p_reference_id);
  v_authority_state := public.domain_authority_state_for_reference(p_reference_id);

  v_next_state := case
    when v_decision in ('verify', 'reverify', 'restore') then 'verified'
    when v_decision = 'withdraw' then 'withdrawn'
  end;

  if not (
    (v_current_state = 'candidate' and v_decision in ('verify', 'withdraw'))
    or (v_current_state = 'verified' and v_decision in ('reverify', 'withdraw'))
    or (v_current_state = 'flagged' and v_decision in ('restore', 'withdraw'))
  ) then
    raise exception 'reference_not_decidable' using errcode = 'AR202';
  end if;

  if v_decision in ('verify', 'reverify', 'restore') then
    if v_authority_state is null then
      raise exception 'domain_authority_not_found' using errcode = 'AR203';
    end if;
    if v_authority_state <> 'granted' then
      raise exception 'reference_not_decidable' using errcode = 'AR202';
    end if;
  end if;

  update public.project_references as reference_row
  set version = reference_row.version + 1
  where reference_row.id = p_reference_id;

  insert into public.project_reference_decisions (
    reference_id, decision, resulting_state, reason_code, aggregate_version,
    evidence_id, actor_user_id, idempotency_key, created_at
  ) values (
    p_reference_id, v_decision, v_next_state, v_reason, v_current_version + 1,
    v_evidence_id, v_actor, p_idempotency_key, v_now
  ) returning id into v_decision_id;

  if v_decision = 'restore' then
    -- clock_timestamp() rather than transaction_timestamp(): a flag and its
    -- release can happen in the same transaction, and the release-complete
    -- check requires released_at to be strictly after created_at.
    update public.reference_security_flags
    set released_at = pg_catalog.clock_timestamp(),
        released_by = v_actor,
        release_evidence_id = v_evidence_id
    where reference_id = p_reference_id
      and released_at is null;
  end if;

  v_command_id := extensions.gen_random_uuid();
  insert into public.reference_review_commands (
    id, actor_user_id, operation, aggregate_type, aggregate_id,
    idempotency_key, input_hash, expected_version, resulting_version,
    decision_id, result_payload, created_at
  ) values (
    v_command_id, v_actor, 'decide_reference', 'reference',
    p_reference_id, p_idempotency_key, v_input_hash, v_current_version,
    v_current_version + 1, v_decision_id,
    pg_catalog.jsonb_build_object(
      'version', 1,
      'commandId', v_command_id,
      'referenceId', p_reference_id,
      'referenceVersion', v_current_version + 1,
      'state', v_next_state
    ),
    v_now
  );

  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, occurred_at, created_at
  ) values (
    'reference', p_reference_id, v_current_version + 1,
    'reference.decided.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'reference.decided.v1',
      'aggregateId', p_reference_id,
      'aggregateVersion', v_current_version + 1,
      'decisionId', v_decision_id,
      'resultingState', v_next_state,
      'occurredAt', v_occurred_at_text
    ),
    v_now, v_now
  );

  return query select
    1, v_command_id, p_reference_id, v_current_version + 1, v_next_state::text, false;
exception
  when others then
    if SQLSTATE in (
      'AR201', 'AR202', 'AR203', 'AR204', 'AR206', 'AR207', 'AR208', 'AR209'
    ) then
      raise;
    end if;
    raise exception 'reference_persistence_failed' using errcode = 'AR299';
end;
$function$;

alter function public.submit_decide_reference(uuid, jsonb, text) owner to postgres;
revoke all on function public.submit_decide_reference(uuid, jsonb, text) from public;
grant execute on function public.submit_decide_reference(uuid, jsonb, text) to authenticated;

-- Internal read model: reviewer RPCs and the repository consume this; it is
-- never granted to browser principals.

create view public.project_reference_current_state
with (security_barrier = true)
as
select
  reference_row.id as reference_id,
  reference_row.project_id,
  reference_row.kind,
  reference_row.label,
  reference_row.normalized_url,
  reference_row.normalized_domain,
  reference_row.version,
  reference_row.created_at,
  public.reference_current_state_v1(reference_row.id) as current_state,
  public.reference_last_verified_at_v1(reference_row.id) as last_verified_at,
  (
    select flag.indicator_id
    from public.reference_security_flags as flag
    where flag.reference_id = reference_row.id
      and flag.released_at is null
    order by flag.created_at desc, flag.id desc
    limit 1
  ) as active_indicator_id
from public.project_references as reference_row;

-- Public projections stay invoker-safe and expose only verified references
-- with the exact columns a consumer needs. A blocked project renders no
-- reference links at all.

create view public.public_project_references
with (security_invoker = true, security_barrier = true)
as
select
  reference_row.id as reference_id,
  reference_row.project_id,
  reference_row.kind,
  reference_row.label,
  reference_row.normalized_url as url,
  public.reference_last_verified_at_v1(reference_row.id) as last_verified_at
from public.project_references as reference_row
where public.reference_is_publicly_renderable_v1(reference_row.id);

create view public.public_project_domain_authorities
with (security_invoker = true, security_barrier = true)
as
select
  authority.id as authority_id,
  authority.project_id,
  authority.normalized_domain as domain,
  public.domain_authority_granted_at_v1(authority.id) as granted_at
from public.project_domain_authorities as authority
where public.domain_authority_current_state_v1(authority.id) = 'granted'
  and exists (
    select 1
    from public.projects as project
    where project.id = authority.project_id
      and project.lifecycle in ('active', 'rumored')
  );

alter table public.project_references enable row level security;
alter table public.project_domain_authorities enable row level security;
alter table public.project_domain_authority_decisions enable row level security;
alter table public.project_reference_decisions enable row level security;
alter table public.reference_security_flags enable row level security;
alter table public.reference_review_commands enable row level security;

-- Browser principals may read only the public-safe columns of verified
-- references under catalog-visible projects. Candidate, flagged, and withdrawn
-- rows stay internal; every other table denies direct access entirely.

create policy project_references_select_anon
on public.project_references
for select
to anon
using (public.reference_is_publicly_renderable_v1(project_references.id));

create policy project_references_select_authenticated
on public.project_references
for select
to authenticated
using (public.reference_is_publicly_renderable_v1(project_references.id));

comment on policy project_references_select_anon on public.project_references is
  'Anonymous users may read only verified references for catalog-visible projects.';
comment on policy project_references_select_authenticated on public.project_references is
  'Authenticated browser users may read only verified references for catalog-visible projects.';

revoke all on table public.project_references
from anon, authenticated;
grant select (id, project_id, kind, label, normalized_url)
on public.project_references to anon, authenticated;

create policy project_domain_authorities_select_anon
on public.project_domain_authorities
for select
to anon
using (
  public.domain_authority_current_state_v1(project_domain_authorities.id) = 'granted'
  and exists (
    select 1
    from public.projects as project
    where project.id = project_domain_authorities.project_id
      and project.lifecycle in ('active', 'rumored')
  )
);

create policy project_domain_authorities_select_authenticated
on public.project_domain_authorities
for select
to authenticated
using (
  public.domain_authority_current_state_v1(project_domain_authorities.id) = 'granted'
  and exists (
    select 1
    from public.projects as project
    where project.id = project_domain_authorities.project_id
      and project.lifecycle in ('active', 'rumored')
  )
);

comment on policy project_domain_authorities_select_anon on public.project_domain_authorities is
  'Anonymous users may read only granted authorities for catalog-visible projects.';
comment on policy project_domain_authorities_select_authenticated on public.project_domain_authorities is
  'Authenticated browser users may read only granted authorities for catalog-visible projects.';

revoke all on table public.project_domain_authorities
from anon, authenticated;
grant select (id, project_id, normalized_domain)
on public.project_domain_authorities to anon, authenticated;
revoke all on table public.project_domain_authority_decisions
from anon, authenticated;
revoke all on table public.project_reference_decisions
from anon, authenticated;
revoke all on table public.reference_security_flags
from anon, authenticated;
revoke all on table public.reference_review_commands
from anon, authenticated;

revoke all on table public.project_reference_current_state
from anon, authenticated;
revoke all on table public.public_project_references
from anon, authenticated;
revoke all on table public.public_project_domain_authorities
from anon, authenticated;
grant select on table public.public_project_references to anon, authenticated;
grant select on table public.public_project_domain_authorities to anon, authenticated;

revoke all on function public.reference_current_state_v1(uuid) from public;
grant execute on function public.reference_current_state_v1(uuid) to anon, authenticated;
revoke all on function public.reference_last_verified_at_v1(uuid) from public;
grant execute on function public.reference_last_verified_at_v1(uuid) to anon, authenticated;
revoke all on function public.reference_is_publicly_renderable_v1(uuid) from public;
grant execute on function public.reference_is_publicly_renderable_v1(uuid) to anon, authenticated;
revoke all on function public.domain_authority_current_state_v1(uuid) from public;
revoke all on function public.domain_authority_granted_at_v1(uuid) from public;
grant execute on function public.domain_authority_granted_at_v1(uuid) to anon, authenticated;
revoke all on function public.domain_authority_state_for_reference(uuid) from public;
revoke all on function public.match_references_for_indicator(text, text) from public;
revoke all on function public.reference_evidence_is_usable(uuid) from public;
revoke all on function public.normalize_reference_domain_v1(text) from public, anon, authenticated;
revoke all on function public.normalize_reference_url_v1(text) from public, anon, authenticated;
revoke all on function public.reference_url_host_v1(text) from public, anon, authenticated;
grant execute on function public.reference_url_host_v1(text) to anon, authenticated;

-- Retain every pre-existing outbox contract while adding a separate strict
-- branch for the four safe reference events.

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
      'reference.security_flagged.v1'
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
    )
  );
