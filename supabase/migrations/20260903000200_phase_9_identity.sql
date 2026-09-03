-- ---------------------------------------------------------------------------
-- Phase 9 Identity: profiles, public wallet addresses, and the private-row
-- authorization pattern (migration 30)
--
-- Scope is the Identity domain from AGENTS.md data ownership: profiles, roles,
-- and public wallet addresses. This migration establishes the user-private row
-- pattern -- every row carries `user_id` and RLS pins it to `auth.uid()` -- so
-- the later Execution (tasks, watchlists) and Notification phases reuse one
-- proven model instead of inventing their own.
--
-- Two hard rules are enforced structurally, not by convention:
--   * nothing that can hold a secret exists: there is no column, no payload
--     field, and no log path for a private key, mnemonic, or keystore. The
--     address column is a plain public address and nothing else.
--   * another user's rows are unreachable, not merely hidden: RLS denies
--     select, insert, update, and delete for everyone but the owner, and the
--     public projection only exposes addresses the owner chose to publish
--     (decision D4: hidden by default).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Profiles become real private rows
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists version bigint not null default 1;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_owner on public.profiles;
create policy profiles_select_owner
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- No insert or delete policy: profiles are created by the auth trigger below
-- and never removed by the client.

-- ---------------------------------------------------------------------------
-- 2. Public wallet addresses (D3: EVM only; D4: hidden by default)
-- ---------------------------------------------------------------------------

create table if not exists public.user_wallet_addresses (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null
    constraint user_wallet_addresses_user_id_fkey
    references public.profiles (id) on delete cascade,
  chain text not null default 'evm',
  address text not null,
  label text null,
  visibility text not null default 'hidden',
  version bigint not null default 1,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  updated_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint user_wallet_addresses_chain_valid check (chain = 'evm'),
  constraint user_wallet_addresses_address_valid check (
    address ~ '^0x[0-9a-fA-F]{40}$'
  ),
  constraint user_wallet_addresses_label_valid check (
    label is null
    or (pg_catalog.btrim(label) = label and pg_catalog.char_length(label) between 1 and 40)
  ),
  constraint user_wallet_addresses_visibility_valid check (
    visibility in ('hidden', 'public')
  ),
  constraint user_wallet_addresses_version_valid check (version >= 1),
  constraint user_wallet_addresses_user_chain_address_unique
    unique (user_id, chain, address)
);

comment on column public.user_wallet_addresses.address is
  'Public address only. This product never stores, requests, logs, or transmits a private key, mnemonic, or keystore.';

create index if not exists user_wallet_addresses_user_id_idx
  on public.user_wallet_addresses (user_id, created_at);

-- Append-only history: a correction is a new row here, never an edit or a
-- delete of an earlier one.
create table if not exists public.user_wallet_address_events (
  id bigint generated always as identity primary key,
  wallet_address_id uuid not null,
  user_id uuid not null,
  event_type text not null,
  occurred_at timestamptz not null default pg_catalog.transaction_timestamp(),
  actor_user_id uuid not null,
  visibility text null,
  constraint user_wallet_address_events_type_valid check (
    event_type in ('added', 'visibility_changed', 'removed')
  )
);

comment on table public.user_wallet_address_events is
  'Append-only wallet address history. Rows are never updated or deleted; contradictions stay visible.';

alter table public.user_wallet_addresses enable row level security;
alter table public.user_wallet_address_events enable row level security;

drop policy if exists wallet_addresses_owner on public.user_wallet_addresses;
create policy wallet_addresses_owner
on public.user_wallet_addresses
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists wallet_address_events_owner_read on public.user_wallet_address_events;
create policy wallet_address_events_owner_read
on public.user_wallet_address_events
for select
to authenticated
using (user_id = (select auth.uid()));

-- No write policy on the event table: only the protected commands below may
-- append, and they run as the owner.

-- ---------------------------------------------------------------------------
-- 3. Profile bootstrap for users created outside the app (D5)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_identity_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', null))
  on conflict (id) do nothing;
  return new;
end;
$function$;

alter function public.handle_new_identity_user() owner to postgres;

drop trigger if exists on_auth_user_created_identity on auth.users;
create trigger on_auth_user_created_identity
after insert on auth.users
for each row execute function public.handle_new_identity_user();

-- ---------------------------------------------------------------------------
-- 4. Protected commands (same skeleton as 6A/6B/7B/8)
-- ---------------------------------------------------------------------------

create table if not exists public.identity_command_receipts (
  idempotency_key text not null,
  command text not null,
  user_id uuid not null,
  response jsonb not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint identity_command_receipts_pkey primary key (command, user_id, idempotency_key)
);

alter table public.identity_command_receipts enable row level security;

drop policy if exists identity_command_receipts_owner on public.identity_command_receipts;
create policy identity_command_receipts_owner
on public.identity_command_receipts
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.submit_update_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
begin
  if v_user_id is null then
    raise exception 'identity_session_required' using errcode = '42501';
  end if;
  v_key := p_payload ->> 'idempotencyKey';
  if v_key is null or pg_catalog.char_length(v_key) < 8 then
    raise exception 'identity_command_invalid' using errcode = '22023';
  end if;

  update public.profiles
  set display_name = coalesce(p_payload ->> 'displayName', display_name),
      avatar_url = coalesce(p_payload ->> 'avatarUrl', avatar_url),
      timezone = coalesce(p_payload ->> 'timezone', timezone),
      version = version + 1,
      updated_at = pg_catalog.transaction_timestamp()
  where id = v_user_id
    and version = (p_payload ->> 'expectedVersion')::bigint;

  if not found then
    raise exception 'identity_version_conflict' using errcode = '40001';
  end if;

  insert into public.identity_command_receipts (idempotency_key, command, user_id, response)
  values (v_key, 'update_profile', v_user_id, jsonb_build_object('status', 'applied'))
  on conflict do nothing;

  return jsonb_build_object('status', 'applied');
end;
$function$;

create or replace function public.submit_add_wallet_address(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_count integer;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'identity_session_required' using errcode = '42501';
  end if;
  v_key := p_payload ->> 'idempotencyKey';
  if v_key is null or pg_catalog.char_length(v_key) < 8 then
    raise exception 'identity_command_invalid' using errcode = '22023';
  end if;

  select count(*) into v_count
  from public.user_wallet_addresses
  where user_id = v_user_id;

  if v_count >= 5 then
    raise exception 'identity_address_limit_reached' using errcode = '22023';
  end if;

  insert into public.user_wallet_addresses (user_id, chain, address, label, visibility)
  values (
    v_user_id,
    coalesce(p_payload ->> 'chain', 'evm'),
    p_payload ->> 'address',
    p_payload ->> 'label',
    coalesce(p_payload ->> 'visibility', 'hidden')
  )
  returning id into v_id;

  insert into public.user_wallet_address_events (wallet_address_id, user_id, event_type, actor_user_id)
  values (v_id, v_user_id, 'added', v_user_id);

  insert into public.identity_command_receipts (idempotency_key, command, user_id, response)
  values (v_key, 'add_wallet_address', v_user_id, jsonb_build_object('status', 'applied'))
  on conflict do nothing;

  return jsonb_build_object('status', 'applied', 'walletAddressId', v_id);
end;
$function$;

alter function public.submit_update_profile(jsonb) owner to postgres;
alter function public.submit_add_wallet_address(jsonb) owner to postgres;

revoke all on function public.submit_update_profile(jsonb) from public;
revoke all on function public.submit_add_wallet_address(jsonb) from public;

grant execute on function public.submit_update_profile(jsonb) to authenticated;
grant execute on function public.submit_add_wallet_address(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Public projection (D4: only addresses the owner published)
-- ---------------------------------------------------------------------------

create view public.public_identity_wallet_addresses
with (security_invoker = true, security_barrier = true)
as
select
  wallet.id as wallet_address_id,
  wallet.user_id,
  wallet.chain,
  wallet.address,
  wallet.label
from public.user_wallet_addresses as wallet
where wallet.visibility = 'public';

alter view public.public_identity_wallet_addresses owner to postgres;

revoke all on table public.public_identity_wallet_addresses
from public, anon, authenticated, service_role, ai_stage_worker,
  promotion_service, collection_worker, collection_queue_worker,
  collection_schedule_admin;

grant select on table public.public_identity_wallet_addresses
to anon, authenticated;

comment on view public.public_identity_wallet_addresses is
  'Only wallet addresses the owner chose to publish; default visibility is hidden.';

comment on policy profiles_select_owner on public.profiles is
  'A signed-in user reads exactly their own profile.';
comment on policy profiles_update_owner on public.profiles is
  'A signed-in user updates exactly their own profile; no path widens it.';
comment on policy wallet_addresses_owner on public.user_wallet_addresses is
  'Wallet addresses are reachable only by their owner, for every action.';
comment on policy wallet_address_events_owner_read on public.user_wallet_address_events is
  'Owners may read their own wallet history; only protected commands append.';
comment on policy identity_command_receipts_owner on public.identity_command_receipts is
  'Owners may read their own command receipts; receipts are never rewritten.';
