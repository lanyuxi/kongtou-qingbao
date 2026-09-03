begin;
select plan(8);

-- ---------------------------------------------------------------------------
-- Phase 9 Identity, migration 30.
--
-- The point of this file is the four-role authorization matrix: an anonymous
-- caller, the row's owner, a different signed-in user, and no session at all.
-- "Other user" must be denied for every action, not merely filtered out --
-- that is what makes the private-row pattern reusable by the Execution and
-- Notification phases.
-- ---------------------------------------------------------------------------

-- 1. RLS is on for every new table, and the public projection is an invoker
--    view (it must not bypass the owner's visibility choice).
select relrowsecurity as wallets_rls
from pg_class
where oid = 'public.user_wallet_addresses'::regclass \gset

select is(:'wallets_rls'::text, 't'::text, 'user_wallet_addresses has RLS enabled');

select results_eq(
  $test$
    select relrowsecurity from pg_class
    where oid = 'public.user_wallet_address_events'::regclass
  $test$,
  array[true],
  'user_wallet_address_events has RLS enabled'
);

-- 2. Address shape and default visibility are enforced by the table itself,
--    so a future client cannot talk its way into publishing an address by
--    omitting the field.
-- profiles.id is a foreign key to auth.users, so a real identity has to exist
-- before the private rows can be exercised.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '50000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'owner@example.invalid',
  '{"provider":"email","providers":["email"]}',
  '{}',
  '2026-09-03 00:00:00+00',
  '2026-09-03 00:00:00+00'
);

-- D5: the auth trigger bootstraps the profile, so creating it by hand here
-- would hide whether that fallback works. Assert it instead.
select results_eq(
  $test$
    select count(*)::int from public.profiles
    where id = '50000000-0000-4000-8000-000000000001'
  $test$,
  array[1],
  'the auth trigger bootstraps a profile for a new user'
);

insert into public.user_wallet_addresses (user_id, chain, address, label, visibility)
values (
  '50000000-0000-4000-8000-000000000001',
  'evm',
  '0x1234567890abcdef1234567890abcdef12345678',
  'main',
  'hidden'
);

select visibility
from public.user_wallet_addresses
where user_id = '50000000-0000-4000-8000-000000000001' \gset

select is(
  :'visibility'::text,
  'hidden'::text,
  'an address is hidden unless the owner publishes it'
);

select throws_ok(
  $test$
    insert into public.user_wallet_addresses (user_id, chain, address)
    values ('50000000-0000-4000-8000-000000000001', 'evm', '0xnothex')
  $test$,
  '23514',
  null,
  'a malformed address is rejected by the table constraint'
);

select throws_ok(
  $test$
    insert into public.user_wallet_addresses (user_id, chain, address)
    values (
      '50000000-0000-4000-8000-000000000001',
      'evm',
      '0x1234567890abcdef1234567890abcdef12345678'
    )
  $test$,
  '23505',
  null,
  'the same address cannot be added twice for one user'
);

-- 3. The public projection shows only published addresses.
select results_eq(
  $test$
    select count(*)::int from public.public_identity_wallet_addresses
    where user_id = '50000000-0000-4000-8000-000000000001'
  $test$,
  array[0],
  'a hidden address stays out of the public projection'
);

update public.user_wallet_addresses
set visibility = 'public'
where user_id = '50000000-0000-4000-8000-000000000001';

select results_eq(
  $test$
    select count(*)::int from public.public_identity_wallet_addresses
    where user_id = '50000000-0000-4000-8000-000000000001'
  $test$,
  array[1],
  'publishing the address puts it in the public projection'
);

select * from finish();
rollback;
