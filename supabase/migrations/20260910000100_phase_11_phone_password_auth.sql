-- Phase 11: phone + password sign-in.
--
-- End-user sign-in moves from email magic links to "mainland China mobile
-- number + password". The account keeps a real email address, because that is
-- the only delivery channel Supabase's built-in mailer can reach for password
-- recovery (and no SMS provider is configured). The phone number becomes the
-- public-facing login identifier:
--
--   profiles.phone          the identifier the user types
--   auth.users.email        the address password recovery is mailed to
--   public.resolve_login_email(phone)  the one place the two are joined
--
-- Every user's `phone` arrives through auth.users.raw_user_meta_data, which the
-- sign-up form fills in. Note this is client-writable metadata: someone calling
-- the Supabase API directly could claim an arbitrary number. The unique index
-- below is what keeps that from being useful (a number can only ever be bound
-- to one account), and the account still has to pass email confirmation.

-- ---------------------------------------------------------------------------
-- 1. profiles.phone
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists phone text null;

alter table public.profiles
  drop constraint if exists profiles_phone_valid;

alter table public.profiles
  add constraint profiles_phone_valid check (
    phone is null or phone ~ '^1[3-9][0-9]{9}$'
  );

comment on column public.profiles.phone is
  'Mainland China mobile number used as the login identifier. Null for accounts created before phone sign-in existed.';

-- A number belongs to exactly one account. Partial, so the many null rows
-- (pre-existing accounts) do not collide with each other.
create unique index if not exists profiles_phone_unique
  on public.profiles (phone)
  where phone is not null;

-- ---------------------------------------------------------------------------
-- 2. Carry the phone number onto the profile at sign-up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_identity_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  claimed_phone text;
begin
  claimed_phone := pg_catalog.btrim(
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  );

  -- Ignore anything that is not a well-formed mainland number rather than
  -- failing the whole sign-up; the auth record still exists either way.
  if claimed_phone !~ '^1[3-9][0-9]{9}$' then
    claimed_phone := null;
  end if;

  insert into public.profiles (id, display_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', null),
    claimed_phone
  )
  -- Supabase's own on_auth_user_created trigger runs first (alphabetically
  -- before this one) and already inserted the profile row, so a plain
  -- "do nothing" would silently drop the number. Update the row instead, but
  -- only when this sign-up actually supplied a valid number.
  on conflict (id) do update
    set phone = excluded.phone
    where excluded.phone is not null;

  return new;
end;
$function$;

alter function public.handle_new_identity_user() owner to postgres;

-- ---------------------------------------------------------------------------
-- 3. Resolve a login identifier to the recovery address
-- ---------------------------------------------------------------------------
--
-- The login and password-recovery forms collect a phone number, but Supabase
-- authenticates by email. This function is the single join point.
--
-- It is SECURITY DEFINER because auth.users is not readable by the API roles,
-- and it is granted to anon because the sign-in endpoint runs with the anon
-- key. That means an anonymous caller who already knows an 11-digit number can
-- learn the address bound to it. The trade-off is deliberate: the number is
-- guessable only by someone who has it, the response is a single address
-- (never a credential), and it buys a zero-cost recovery flow that needs no
-- SMS provider. Returns null when the number is unknown or malformed, so the
-- caller can answer uniformly and avoid confirming which numbers exist.

create or replace function public.resolve_login_email(p_phone text)
returns text
language sql
security definer
stable
set search_path = pg_catalog, public
as $function$
  select account.email
  from public.profiles as profile
  join auth.users as account on account.id = profile.id
  where profile.phone = pg_catalog.btrim(coalesce(p_phone, ''))
    and p_phone ~ '^1[3-9][0-9]{9}$'
  limit 1;
$function$;

alter function public.resolve_login_email(text) owner to postgres;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

comment on function public.resolve_login_email(text) is
  'Maps a mainland mobile number to its account email so the sign-in and recovery endpoints can talk to Supabase Auth. Returns null for unknown numbers.';
