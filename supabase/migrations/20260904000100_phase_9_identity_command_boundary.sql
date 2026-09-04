-- Phase 9 Identity command-boundary remediation (migration 31).
-- Migration 30 remains immutable; this forward-only repair makes every
-- browser mutation pass through an idempotent, versioned database command.

-- ---------------------------------------------------------------------------
-- 1. Ledger shape, nullable contract fields, and browser write denial
-- ---------------------------------------------------------------------------

alter table public.profiles
  alter column timezone drop not null;

alter table public.identity_command_receipts
  add column id uuid not null default extensions.gen_random_uuid(),
  add column input_hash text null,
  add column expected_version bigint null,
  add column resulting_version bigint null;

update public.identity_command_receipts as receipt
set input_hash = pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          pg_catalog.jsonb_build_object(
            'legacy', true,
            'command', receipt.command,
            'userId', receipt.user_id,
            'idempotencyKey', receipt.idempotency_key,
            'response', receipt.response
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    expected_version = 1,
    resulting_version = 1;

alter table public.identity_command_receipts
  alter column input_hash set not null,
  alter column expected_version set not null,
  alter column resulting_version set not null,
  add constraint identity_command_receipts_id_key unique (id),
  add constraint identity_command_receipts_input_hash_valid check (
    input_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint identity_command_receipts_versions_positive check (
    expected_version > 0 and resulting_version > 0
  );

create table public.identity_profile_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  event_type text not null,
  profile_version bigint not null,
  actor_user_id uuid not null,
  display_name text null,
  avatar_url text null,
  timezone text null,
  occurred_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint identity_profile_events_type_valid check (event_type = 'updated'),
  constraint identity_profile_events_version_positive check (profile_version > 0)
);

comment on table public.identity_profile_events is
  'Append-only snapshots of successful profile commands; rows are never updated or deleted.';

alter table public.identity_profile_events enable row level security;

create policy identity_profile_events_select_authenticated
on public.identity_profile_events
for select
to authenticated
using (user_id = (select auth.uid()));

comment on policy identity_profile_events_select_authenticated
on public.identity_profile_events is
  'Authenticated users may read only their own append-only profile history.';

alter table public.user_wallet_address_events
  add column wallet_address_version bigint null,
  add column chain text null,
  add column address text null,
  add column label text null;

update public.user_wallet_address_events as event
set wallet_address_version = coalesce(wallet.version, 1),
    chain = wallet.chain,
    address = wallet.address,
    label = wallet.label
from public.user_wallet_addresses as wallet
where wallet.id = event.wallet_address_id;

update public.user_wallet_address_events
set wallet_address_version = 1
where wallet_address_version is null;

alter table public.user_wallet_address_events
  alter column wallet_address_version set not null,
  alter column chain set not null,
  alter column address set not null,
  add constraint user_wallet_address_events_version_positive check (
    wallet_address_version > 0
  ),
  add constraint user_wallet_address_events_chain_valid check (
    chain = 'evm'
  ),
  add constraint user_wallet_address_events_address_valid check (
    address ~ '^0x[0-9a-fA-F]{40}$'
  );

create function public.reject_identity_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'identity_ledger_rows_are_append_only' using errcode = '55000';
end;
$function$;

alter function public.reject_identity_ledger_mutation() owner to postgres;
revoke all on function public.reject_identity_ledger_mutation() from public;

create trigger identity_command_receipts_reject_mutation
before update or delete on public.identity_command_receipts
for each row execute function public.reject_identity_ledger_mutation();

create trigger identity_profile_events_reject_mutation
before update or delete on public.identity_profile_events
for each row execute function public.reject_identity_ledger_mutation();

create trigger user_wallet_address_events_reject_mutation
before update or delete on public.user_wallet_address_events
for each row execute function public.reject_identity_ledger_mutation();

drop policy if exists profiles_select_owner on public.profiles;
drop policy if exists profiles_update_authenticated on public.profiles;
drop policy if exists profiles_update_owner on public.profiles;

revoke insert, update, delete, truncate on table public.profiles
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke update (display_name, avatar_url, timezone) on table public.profiles
from authenticated, service_role, ai_stage_worker, promotion_service,
  collection_worker, collection_queue_worker, collection_schedule_admin;
revoke insert, update, delete, truncate on table public.user_wallet_addresses
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke insert, update, delete, truncate on table public.identity_command_receipts
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke insert, update, delete, truncate on table public.identity_profile_events
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke insert, update, delete, truncate on table public.user_wallet_address_events
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;

grant select on table public.identity_profile_events to authenticated;

-- The migration-30 view cannot cross RLS for anon and is superseded by the
-- exact-column security-definer RPC below.
revoke all on table public.public_identity_wallet_addresses
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;

-- ---------------------------------------------------------------------------
-- 2. Versioned, receipt-first mutation commands
-- ---------------------------------------------------------------------------

create or replace function public.submit_update_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.identity_command_receipts%rowtype;
  v_profile public.profiles%rowtype;
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_occurred_at_text text;
begin
  if v_user_id is null then
    raise exception 'identity_session_required' using errcode = 'ID201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload,
      array['idempotencyKey', 'expectedVersion', 'displayName', 'avatarUrl', 'timezone']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or not (
      pg_catalog.jsonb_typeof(p_payload -> 'displayName') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_payload -> 'displayName') = 'string'
        and p_payload ->> 'displayName' = pg_catalog.btrim(p_payload ->> 'displayName')
        and pg_catalog.char_length(p_payload ->> 'displayName') between 1 and 80
      )
    )
    or not (
      pg_catalog.jsonb_typeof(p_payload -> 'avatarUrl') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_payload -> 'avatarUrl') = 'string'
        and p_payload ->> 'avatarUrl' = pg_catalog.btrim(p_payload ->> 'avatarUrl')
        and pg_catalog.char_length(p_payload ->> 'avatarUrl') between 1 and 500
        and p_payload ->> 'avatarUrl' ~ '^https://'
      )
    )
    or not (
      pg_catalog.jsonb_typeof(p_payload -> 'timezone') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_payload -> 'timezone') = 'string'
        and p_payload ->> 'timezone' = pg_catalog.btrim(p_payload ->> 'timezone')
        and pg_catalog.char_length(p_payload ->> 'timezone') between 1 and 64
      )
    )
  then
    raise exception 'identity_command_invalid' using errcode = 'ID208';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'update_profile', 'payload', p_payload)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':update_profile:' || v_key, 0)
  );

  select * into v_existing
  from public.identity_command_receipts as receipt
  where receipt.command = 'update_profile'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'identity_idempotency_conflict' using errcode = 'ID207';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select * into v_profile
  from public.profiles as profile
  where profile.id = v_user_id
  for update;
  if not found then
    raise exception 'identity_profile_not_found' using errcode = 'ID202';
  end if;
  if v_profile.version <> (p_payload ->> 'expectedVersion')::bigint then
    raise exception 'identity_version_conflict' using errcode = 'ID206';
  end if;

  update public.profiles
  set display_name = p_payload ->> 'displayName',
      avatar_url = p_payload ->> 'avatarUrl',
      timezone = p_payload ->> 'timezone',
      version = v_profile.version + 1
  where id = v_user_id;

  insert into public.identity_profile_events (
    user_id, event_type, profile_version, actor_user_id,
    display_name, avatar_url, timezone, occurred_at
  ) values (
    v_user_id, 'updated', v_profile.version + 1, v_user_id,
    p_payload ->> 'displayName', p_payload ->> 'avatarUrl',
    p_payload ->> 'timezone', v_now
  );

  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, occurred_at, created_at
  ) values (
    'identity_profile', v_user_id, v_profile.version + 1,
    'identity.profile.updated.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'identity.profile.updated.v1',
      'aggregateId', v_user_id,
      'aggregateVersion', v_profile.version + 1,
      'occurredAt', v_occurred_at_text
    ),
    v_now, v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'profileId', v_user_id,
    'profileVersion', v_profile.version + 1,
    'replayed', false
  );
  insert into public.identity_command_receipts (
    id, idempotency_key, command, user_id, input_hash,
    expected_version, resulting_version, response, created_at
  ) values (
    v_command_id, v_key, 'update_profile', v_user_id, v_input_hash,
    v_profile.version, v_profile.version + 1, v_result, v_now
  );

  return v_result;
exception
  when sqlstate 'ID201' or sqlstate 'ID202' or sqlstate 'ID203'
    or sqlstate 'ID204' or sqlstate 'ID205' or sqlstate 'ID206'
    or sqlstate 'ID207' or sqlstate 'ID208' or sqlstate 'ID299'
  then
    raise;
  when others then
    raise exception 'identity_persistence_failed' using errcode = 'ID299';
end;
$function$;

create or replace function public.submit_add_wallet_address(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.identity_command_receipts%rowtype;
  v_profile public.profiles%rowtype;
  v_count integer;
  v_wallet_id uuid := extensions.gen_random_uuid();
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_occurred_at_text text;
begin
  if v_user_id is null then
    raise exception 'identity_session_required' using errcode = 'ID201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload,
      array[
        'idempotencyKey', 'expectedVersion', 'chain',
        'address', 'label', 'visibility'
      ]
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
  then
    raise exception 'identity_command_invalid' using errcode = 'ID208';
  end if;

  if pg_catalog.jsonb_typeof(p_payload -> 'chain') <> 'string'
    or p_payload ->> 'chain' <> 'evm'
    or pg_catalog.jsonb_typeof(p_payload -> 'address') <> 'string'
    or p_payload ->> 'address' !~ '^0x[0-9a-fA-F]{40}$'
    or not (
      pg_catalog.jsonb_typeof(p_payload -> 'label') = 'null'
      or (
        pg_catalog.jsonb_typeof(p_payload -> 'label') = 'string'
        and p_payload ->> 'label' = pg_catalog.btrim(p_payload ->> 'label')
        and pg_catalog.char_length(p_payload ->> 'label') between 1 and 40
      )
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'visibility') <> 'string'
    or p_payload ->> 'visibility' not in ('hidden', 'public')
  then
    raise exception 'identity_address_invalid' using errcode = 'ID203';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'add_wallet_address', 'payload', p_payload)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':add_wallet_address:' || v_key, 0)
  );

  select * into v_existing
  from public.identity_command_receipts as receipt
  where receipt.command = 'add_wallet_address'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'identity_idempotency_conflict' using errcode = 'ID207';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select * into v_profile
  from public.profiles as profile
  where profile.id = v_user_id
  for update;
  if not found then
    raise exception 'identity_profile_not_found' using errcode = 'ID202';
  end if;
  if v_profile.version <> (p_payload ->> 'expectedVersion')::bigint then
    raise exception 'identity_version_conflict' using errcode = 'ID206';
  end if;

  if exists (
    select 1 from public.user_wallet_addresses as wallet
    where wallet.user_id = v_user_id
      and wallet.chain = p_payload ->> 'chain'
      and pg_catalog.lower(wallet.address) = pg_catalog.lower(p_payload ->> 'address')
  ) then
    raise exception 'identity_address_duplicate' using errcode = 'ID204';
  end if;

  select count(*) into v_count
  from public.user_wallet_addresses as wallet
  where wallet.user_id = v_user_id;
  if v_count >= 5 then
    raise exception 'identity_address_limit_reached' using errcode = 'ID205';
  end if;

  insert into public.user_wallet_addresses (
    id, user_id, chain, address, label, visibility, version, created_at, updated_at
  ) values (
    v_wallet_id, v_user_id, p_payload ->> 'chain', p_payload ->> 'address',
    p_payload ->> 'label', p_payload ->> 'visibility', 1, v_now, v_now
  );

  update public.profiles
  set version = v_profile.version + 1
  where id = v_user_id;

  insert into public.user_wallet_address_events (
    wallet_address_id, user_id, event_type, actor_user_id, visibility,
    wallet_address_version, chain, address, label, occurred_at
  ) values (
    v_wallet_id, v_user_id, 'added', v_user_id, p_payload ->> 'visibility',
    1, p_payload ->> 'chain', p_payload ->> 'address', p_payload ->> 'label', v_now
  );

  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, occurred_at, created_at
  ) values (
    'identity_wallet_address', v_wallet_id, 1,
    'identity.wallet_address.added.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'identity.wallet_address.added.v1',
      'aggregateId', v_wallet_id,
      'aggregateVersion', 1,
      'occurredAt', v_occurred_at_text
    ),
    v_now, v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'walletAddressId', v_wallet_id,
    'walletAddressVersion', 1,
    'profileVersion', v_profile.version + 1,
    'replayed', false
  );
  insert into public.identity_command_receipts (
    id, idempotency_key, command, user_id, input_hash,
    expected_version, resulting_version, response, created_at
  ) values (
    v_command_id, v_key, 'add_wallet_address', v_user_id, v_input_hash,
    v_profile.version, 1, v_result, v_now
  );

  return v_result;
exception
  when sqlstate 'ID201' or sqlstate 'ID202' or sqlstate 'ID203'
    or sqlstate 'ID204' or sqlstate 'ID205' or sqlstate 'ID206'
    or sqlstate 'ID207' or sqlstate 'ID208' or sqlstate 'ID299'
  then
    raise;
  when others then
    raise exception 'identity_persistence_failed' using errcode = 'ID299';
end;
$function$;

create or replace function public.submit_set_wallet_address_visibility(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.identity_command_receipts%rowtype;
  v_wallet public.user_wallet_addresses%rowtype;
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_occurred_at_text text;
begin
  if v_user_id is null then
    raise exception 'identity_session_required' using errcode = 'ID201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload,
      array['idempotencyKey', 'expectedVersion', 'walletAddressId', 'visibility']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or not public.security_json_uuid_is_valid(p_payload, 'walletAddressId')
    or pg_catalog.jsonb_typeof(p_payload -> 'visibility') <> 'string'
    or p_payload ->> 'visibility' not in ('hidden', 'public')
  then
    raise exception 'identity_command_invalid' using errcode = 'ID208';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation', 'set_wallet_address_visibility', 'payload', p_payload
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user_id::text || ':set_wallet_address_visibility:' || v_key,
      0
    )
  );

  select * into v_existing
  from public.identity_command_receipts as receipt
  where receipt.command = 'set_wallet_address_visibility'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'identity_idempotency_conflict' using errcode = 'ID207';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select * into v_wallet
  from public.user_wallet_addresses as wallet
  where wallet.id = (p_payload ->> 'walletAddressId')::uuid
    and wallet.user_id = v_user_id
  for update;
  if not found then
    raise exception 'identity_command_invalid' using errcode = 'ID208';
  end if;
  if v_wallet.version <> (p_payload ->> 'expectedVersion')::bigint then
    raise exception 'identity_version_conflict' using errcode = 'ID206';
  end if;

  update public.user_wallet_addresses
  set visibility = p_payload ->> 'visibility',
      version = v_wallet.version + 1,
      updated_at = v_now
  where id = v_wallet.id;

  insert into public.user_wallet_address_events (
    wallet_address_id, user_id, event_type, actor_user_id, visibility,
    wallet_address_version, chain, address, label, occurred_at
  ) values (
    v_wallet.id, v_user_id, 'visibility_changed', v_user_id,
    p_payload ->> 'visibility', v_wallet.version + 1,
    v_wallet.chain, v_wallet.address, v_wallet.label, v_now
  );

  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, occurred_at, created_at
  ) values (
    'identity_wallet_address', v_wallet.id, v_wallet.version + 1,
    'identity.wallet_address.visibility_changed.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'identity.wallet_address.visibility_changed.v1',
      'aggregateId', v_wallet.id,
      'aggregateVersion', v_wallet.version + 1,
      'occurredAt', v_occurred_at_text
    ),
    v_now, v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'walletAddressId', v_wallet.id,
    'walletAddressVersion', v_wallet.version + 1,
    'replayed', false
  );
  insert into public.identity_command_receipts (
    id, idempotency_key, command, user_id, input_hash,
    expected_version, resulting_version, response, created_at
  ) values (
    v_command_id, v_key, 'set_wallet_address_visibility', v_user_id, v_input_hash,
    v_wallet.version, v_wallet.version + 1, v_result, v_now
  );

  return v_result;
exception
  when sqlstate 'ID201' or sqlstate 'ID202' or sqlstate 'ID203'
    or sqlstate 'ID204' or sqlstate 'ID205' or sqlstate 'ID206'
    or sqlstate 'ID207' or sqlstate 'ID208' or sqlstate 'ID299'
  then
    raise;
  when others then
    raise exception 'identity_persistence_failed' using errcode = 'ID299';
end;
$function$;

create or replace function public.submit_remove_wallet_address(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_input_hash text;
  v_existing public.identity_command_receipts%rowtype;
  v_wallet public.user_wallet_addresses%rowtype;
  v_tombstone_version bigint;
  v_command_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_occurred_at_text text;
begin
  if v_user_id is null then
    raise exception 'identity_session_required' using errcode = 'ID201';
  end if;

  if p_payload is null
    or not public.security_json_has_exact_keys(
      p_payload,
      array['idempotencyKey', 'expectedVersion', 'walletAddressId']
    )
    or pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    or p_payload ->> 'idempotencyKey' <> pg_catalog.btrim(p_payload ->> 'idempotencyKey')
    or pg_catalog.char_length(p_payload ->> 'idempotencyKey') not between 8 and 200
    or not public.security_json_positive_bigint_is_valid(p_payload, 'expectedVersion')
    or not public.security_json_uuid_is_valid(p_payload, 'walletAddressId')
  then
    raise exception 'identity_command_invalid' using errcode = 'ID208';
  end if;

  v_key := p_payload ->> 'idempotencyKey';
  v_input_hash := public.security_command_input_hash_v1(
    pg_catalog.jsonb_build_object('operation', 'remove_wallet_address', 'payload', p_payload)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':remove_wallet_address:' || v_key, 0)
  );

  select * into v_existing
  from public.identity_command_receipts as receipt
  where receipt.command = 'remove_wallet_address'
    and receipt.user_id = v_user_id
    and receipt.idempotency_key = v_key;

  if found then
    if v_existing.input_hash <> v_input_hash then
      raise exception 'identity_idempotency_conflict' using errcode = 'ID207';
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select * into v_wallet
  from public.user_wallet_addresses as wallet
  where wallet.id = (p_payload ->> 'walletAddressId')::uuid
    and wallet.user_id = v_user_id
  for update;

  if not found then
    select event.wallet_address_version into v_tombstone_version
    from public.user_wallet_address_events as event
    where event.wallet_address_id = (p_payload ->> 'walletAddressId')::uuid
      and event.user_id = v_user_id
    order by event.id desc
    limit 1;
    if found
      and v_tombstone_version <> (p_payload ->> 'expectedVersion')::bigint
    then
      raise exception 'identity_version_conflict' using errcode = 'ID206';
    end if;
    raise exception 'identity_command_invalid' using errcode = 'ID208';
  end if;

  if v_wallet.version <> (p_payload ->> 'expectedVersion')::bigint then
    raise exception 'identity_version_conflict' using errcode = 'ID206';
  end if;

  v_tombstone_version := v_wallet.version + 1;
  insert into public.user_wallet_address_events (
    wallet_address_id, user_id, event_type, actor_user_id, visibility,
    wallet_address_version, chain, address, label, occurred_at
  ) values (
    v_wallet.id, v_user_id, 'removed', v_user_id, v_wallet.visibility,
    v_tombstone_version, v_wallet.chain, v_wallet.address, v_wallet.label, v_now
  );

  delete from public.user_wallet_addresses where id = v_wallet.id;

  v_occurred_at_text := pg_catalog.to_char(
    v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  insert into public.outbox_events (
    aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, occurred_at, created_at
  ) values (
    'identity_wallet_address', v_wallet.id, v_tombstone_version,
    'identity.wallet_address.removed.v1',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'eventType', 'identity.wallet_address.removed.v1',
      'aggregateId', v_wallet.id,
      'aggregateVersion', v_tombstone_version,
      'occurredAt', v_occurred_at_text
    ),
    v_now, v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'version', 1,
    'commandId', v_command_id,
    'walletAddressId', v_wallet.id,
    'walletAddressVersion', v_tombstone_version,
    'replayed', false
  );
  insert into public.identity_command_receipts (
    id, idempotency_key, command, user_id, input_hash,
    expected_version, resulting_version, response, created_at
  ) values (
    v_command_id, v_key, 'remove_wallet_address', v_user_id, v_input_hash,
    v_wallet.version, v_tombstone_version, v_result, v_now
  );

  return v_result;
exception
  when sqlstate 'ID201' or sqlstate 'ID202' or sqlstate 'ID203'
    or sqlstate 'ID204' or sqlstate 'ID205' or sqlstate 'ID206'
    or sqlstate 'ID207' or sqlstate 'ID208' or sqlstate 'ID299'
  then
    raise;
  when others then
    raise exception 'identity_persistence_failed' using errcode = 'ID299';
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Exact private and public read surfaces
-- ---------------------------------------------------------------------------

create function public.get_my_identity_profile()
returns table (
  "userId" uuid,
  "displayName" text,
  "avatarUrl" text,
  timezone text,
  version bigint,
  "updatedAt" timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    profile.id,
    profile.display_name,
    profile.avatar_url,
    profile.timezone,
    profile.version,
    profile.updated_at
  from public.profiles as profile
  where profile.id = auth.uid();
$function$;

create function public.list_my_wallet_addresses()
returns table (
  "walletAddressId" uuid,
  chain text,
  address text,
  label text,
  visibility text,
  version bigint,
  "createdAt" timestamptz,
  "updatedAt" timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    wallet.id,
    wallet.chain,
    wallet.address,
    wallet.label,
    wallet.visibility,
    wallet.version,
    wallet.created_at,
    wallet.updated_at
  from public.user_wallet_addresses as wallet
  where wallet.user_id = auth.uid()
  order by wallet.created_at, wallet.id;
$function$;

create function public.get_public_identity_profile(p_user_id uuid)
returns table (
  "userId" uuid,
  "displayName" text,
  "avatarUrl" text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select profile.id, profile.display_name, profile.avatar_url
  from public.profiles as profile
  where profile.id = p_user_id;
$function$;

create function public.list_public_identity_wallet_addresses(p_user_id uuid)
returns table (
  "walletAddressId" uuid,
  chain text,
  address text,
  label text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select wallet.id, wallet.chain, wallet.address, wallet.label
  from public.user_wallet_addresses as wallet
  where wallet.user_id = p_user_id
    and wallet.visibility = 'public'
  order by wallet.created_at, wallet.id;
$function$;

alter function public.submit_update_profile(jsonb) owner to postgres;
alter function public.submit_add_wallet_address(jsonb) owner to postgres;
alter function public.submit_set_wallet_address_visibility(jsonb) owner to postgres;
alter function public.submit_remove_wallet_address(jsonb) owner to postgres;
alter function public.get_my_identity_profile() owner to postgres;
alter function public.list_my_wallet_addresses() owner to postgres;
alter function public.get_public_identity_profile(uuid) owner to postgres;
alter function public.list_public_identity_wallet_addresses(uuid) owner to postgres;

revoke all on function public.submit_update_profile(jsonb)
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke all on function public.submit_add_wallet_address(jsonb)
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke all on function public.submit_set_wallet_address_visibility(jsonb)
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke all on function public.submit_remove_wallet_address(jsonb)
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke all on function public.get_my_identity_profile()
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke all on function public.list_my_wallet_addresses()
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke all on function public.get_public_identity_profile(uuid)
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;
revoke all on function public.list_public_identity_wallet_addresses(uuid)
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;

grant execute on function public.submit_update_profile(jsonb) to authenticated;
grant execute on function public.submit_add_wallet_address(jsonb) to authenticated;
grant execute on function public.submit_set_wallet_address_visibility(jsonb) to authenticated;
grant execute on function public.submit_remove_wallet_address(jsonb) to authenticated;
grant execute on function public.get_my_identity_profile() to authenticated;
grant execute on function public.list_my_wallet_addresses() to authenticated;
grant execute on function public.get_public_identity_profile(uuid) to anon, authenticated;
grant execute on function public.list_public_identity_wallet_addresses(uuid)
to anon, authenticated;

comment on function public.submit_update_profile(jsonb) is
  'Idempotent profile update command with version, audit, and outbox writes.';
comment on function public.submit_add_wallet_address(jsonb) is
  'Idempotent wallet add command governed by the owning profile collection version.';
comment on function public.submit_set_wallet_address_visibility(jsonb) is
  'Idempotent owner-only wallet visibility command.';
comment on function public.submit_remove_wallet_address(jsonb) is
  'Idempotent owner-only wallet removal command retaining a tombstone version.';
comment on function public.get_my_identity_profile() is
  'Returns the authenticated user private profile projection only.';
comment on function public.list_my_wallet_addresses() is
  'Returns the authenticated user private wallet projections only.';
comment on function public.get_public_identity_profile(uuid) is
  'Returns exactly the public profile fields for the requested user.';
comment on function public.list_public_identity_wallet_addresses(uuid) is
  'Returns exactly explicitly public wallet fields for the requested user.';

-- ---------------------------------------------------------------------------
-- 4. Extend the shared outbox without re-stating or weakening old branches
-- ---------------------------------------------------------------------------

do $migration$
declare
  v_previous_event_type_expression text;
  v_previous_payload_expression text;
  v_identity_event_type_expression text := $constraint$
    event_type in (
      'identity.profile.updated.v1',
      'identity.wallet_address.added.v1',
      'identity.wallet_address.visibility_changed.v1',
      'identity.wallet_address.removed.v1'
    )
  $constraint$;
  v_identity_payload_expression text := $constraint$
    event_type in (
      'identity.profile.updated.v1',
      'identity.wallet_address.added.v1',
      'identity.wallet_address.visibility_changed.v1',
      'identity.wallet_address.removed.v1'
    )
    and payload ?& array[
      'version', 'eventType', 'aggregateId', 'aggregateVersion', 'occurredAt'
    ]
    and payload - array[
      'version', 'eventType', 'aggregateId', 'aggregateVersion', 'occurredAt'
    ]::text[] = '{}'::jsonb
    and pg_catalog.jsonb_typeof(payload -> 'version') = 'number'
    and payload ->> 'version' = '1'
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
  $constraint$;
begin
  select pg_catalog.pg_get_expr(constraint_record.conbin, constraint_record.conrelid)
  into v_previous_event_type_expression
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.outbox_events'::regclass
    and constraint_record.conname = 'outbox_events_event_type_valid';

  select pg_catalog.pg_get_expr(constraint_record.conbin, constraint_record.conrelid)
  into v_previous_payload_expression
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.outbox_events'::regclass
    and constraint_record.conname = 'outbox_events_payload_valid';

  if v_previous_event_type_expression is null
    or v_previous_payload_expression is null
  then
    raise exception 'identity_outbox_contract_missing' using errcode = 'ID299';
  end if;

  execute 'alter table public.outbox_events drop constraint outbox_events_event_type_valid';
  execute pg_catalog.format(
    'alter table public.outbox_events add constraint outbox_events_event_type_valid check ((%s) or (%s))',
    v_previous_event_type_expression,
    v_identity_event_type_expression
  );

  execute 'alter table public.outbox_events drop constraint outbox_events_payload_valid';
  execute pg_catalog.format(
    'alter table public.outbox_events add constraint outbox_events_payload_valid check ((%s) or (%s))',
    v_previous_payload_expression,
    v_identity_payload_expression
  );
end;
$migration$;
