begin;
select plan(91);

-- Phase 9 Identity command/read boundary. This test intentionally exercises
-- browser roles and auth.uid(), rather than proving owner-visible behavior as
-- postgres. Mutation RPCs own every write, exact replay is side-effect free,
-- and public RPCs expose only contract-safe fields.

-- ---------------------------------------------------------------------------
-- Shape, RLS, function surface, and ACLs
-- ---------------------------------------------------------------------------

select has_table('public', 'user_wallet_addresses', 'wallet address table exists');
select has_table('public', 'user_wallet_address_events', 'wallet event ledger exists');
select has_table('public', 'identity_command_receipts', 'identity receipts exist');
select has_table('public', 'identity_profile_events', 'profile event ledger exists');

select results_eq(
  $test$
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.user_wallet_addresses'::regclass
  $test$,
  array[true],
  'wallet addresses have RLS enabled'
);
select results_eq(
  $test$
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.user_wallet_address_events'::regclass
  $test$,
  array[true],
  'wallet events have RLS enabled'
);
select results_eq(
  $test$
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.identity_command_receipts'::regclass
  $test$,
  array[true],
  'identity receipts have RLS enabled'
);
select results_eq(
  $test$
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.identity_profile_events'::regclass
  $test$,
  array[true],
  'profile events have RLS enabled'
);

select has_function('public', 'submit_update_profile', array['jsonb'], 'update command exists');
select has_function('public', 'submit_add_wallet_address', array['jsonb'], 'add command exists');
select has_function(
  'public', 'submit_set_wallet_address_visibility', array['jsonb'],
  'visibility command exists'
);
select has_function(
  'public', 'submit_remove_wallet_address', array['jsonb'], 'remove command exists'
);
select has_function('public', 'get_my_identity_profile', array[]::text[], 'private profile read exists');
select has_function('public', 'list_my_wallet_addresses', array[]::text[], 'private wallet list exists');
select has_function(
  'public', 'get_public_identity_profile', array['uuid'], 'public profile read exists'
);
select has_function(
  'public', 'list_public_identity_wallet_addresses', array['uuid'],
  'public wallet list exists'
);

select ok(
  coalesce(pg_catalog.has_function_privilege(
    'anon', pg_catalog.to_regprocedure('public.get_public_identity_profile(uuid)'), 'EXECUTE'
  ), false)
  and coalesce(pg_catalog.has_function_privilege(
    'anon', pg_catalog.to_regprocedure('public.list_public_identity_wallet_addresses(uuid)'), 'EXECUTE'
  ), false),
  'anon can execute only the public identity read surface'
);
select ok(
  coalesce(pg_catalog.has_function_privilege(
    'authenticated', pg_catalog.to_regprocedure('public.submit_update_profile(jsonb)'), 'EXECUTE'
  ), false)
  and coalesce(pg_catalog.has_function_privilege(
    'authenticated', pg_catalog.to_regprocedure('public.submit_add_wallet_address(jsonb)'), 'EXECUTE'
  ), false)
  and coalesce(pg_catalog.has_function_privilege(
    'authenticated',
    pg_catalog.to_regprocedure('public.submit_set_wallet_address_visibility(jsonb)'), 'EXECUTE'
  ), false)
  and coalesce(pg_catalog.has_function_privilege(
    'authenticated', pg_catalog.to_regprocedure('public.submit_remove_wallet_address(jsonb)'), 'EXECUTE'
  ), false),
  'authenticated can execute all four mutation commands'
);
select ok(
  not exists (
    select 1
    from (values
      ('anon'), ('authenticated'), ('service_role'), ('ai_stage_worker'),
      ('promotion_service'), ('collection_worker'), ('collection_queue_worker'),
      ('collection_schedule_admin')
    ) as expected_role(role_name)
    cross join (values
      ('public.submit_update_profile(jsonb)', 'private'),
      ('public.submit_add_wallet_address(jsonb)', 'private'),
      ('public.submit_set_wallet_address_visibility(jsonb)', 'private'),
      ('public.submit_remove_wallet_address(jsonb)', 'private'),
      ('public.get_my_identity_profile()', 'private'),
      ('public.list_my_wallet_addresses()', 'private'),
      ('public.get_public_identity_profile(uuid)', 'public'),
      ('public.list_public_identity_wallet_addresses(uuid)', 'public')
    ) as expected_function(signature, scope)
    where pg_catalog.has_function_privilege(
      expected_role.role_name, expected_function.signature, 'EXECUTE'
    ) <> (
      expected_role.role_name = 'authenticated'
      or (expected_role.role_name = 'anon' and expected_function.scope = 'public')
    )
  ),
  'identity RPC execution matches the exact browser, service, and worker role matrix'
);
select ok(
  not pg_catalog.has_any_column_privilege('authenticated', 'public.profiles', 'INSERT,UPDATE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'DELETE,TRUNCATE')
  and not pg_catalog.has_any_column_privilege(
    'authenticated', 'public.user_wallet_addresses', 'INSERT,UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated', 'public.user_wallet_addresses', 'DELETE,TRUNCATE'
  ),
  'browser principals have no direct profile or wallet write privilege'
);
select ok(
  not pg_catalog.has_any_column_privilege(
    'authenticated', 'public.identity_command_receipts', 'INSERT,UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated', 'public.identity_command_receipts', 'DELETE,TRUNCATE'
  )
  and not pg_catalog.has_any_column_privilege(
    'authenticated', 'public.user_wallet_address_events', 'INSERT,UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated', 'public.user_wallet_address_events', 'DELETE,TRUNCATE'
  )
  and not pg_catalog.has_any_column_privilege(
    'authenticated', 'public.identity_profile_events', 'INSERT,UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated', 'public.identity_profile_events', 'DELETE,TRUNCATE'
  ),
  'browser principals cannot write receipts or event history'
);
select ok(
  not exists (
    select 1
    from (values
      ('service_role'), ('ai_stage_worker'), ('promotion_service'),
      ('collection_worker'), ('collection_queue_worker'),
      ('collection_schedule_admin')
    ) as denied_role(role_name)
    cross join (values
      ('public.profiles'),
      ('public.user_wallet_addresses'),
      ('public.identity_command_receipts'),
      ('public.identity_profile_events'),
      ('public.user_wallet_address_events')
    ) as identity_table(table_name)
    where pg_catalog.has_table_privilege(
        denied_role.role_name, identity_table.table_name, 'INSERT'
      )
      or pg_catalog.has_table_privilege(
        denied_role.role_name, identity_table.table_name, 'UPDATE'
      )
      or pg_catalog.has_table_privilege(
        denied_role.role_name, identity_table.table_name, 'DELETE'
      )
      or pg_catalog.has_table_privilege(
        denied_role.role_name, identity_table.table_name, 'TRUNCATE'
      )
      or pg_catalog.has_any_column_privilege(
        denied_role.role_name, identity_table.table_name, 'INSERT,UPDATE'
      )
  ),
  'service and unrelated worker roles have no direct Identity table DML'
);

-- ---------------------------------------------------------------------------
-- Two real auth identities; the trigger must bootstrap both profiles.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '50000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'identity-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'identity-other@example.invalid', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

select is(
  (select count(*) from public.profiles
   where id in (
     '50000000-0000-4000-8000-000000000001',
     '50000000-0000-4000-8000-000000000002'
   )),
  2::bigint,
  'auth bootstrap creates one profile per user'
);

create temporary table phase_9_identity_state (
  name text primary key,
  response jsonb null,
  wallet_address_id uuid null
) on commit drop;
grant select, insert, update on table pg_temp.phase_9_identity_state to authenticated;

create temporary table phase_9_identity_projection (
  scope text not null,
  payload jsonb not null
) on commit drop;
grant select, insert on table pg_temp.phase_9_identity_projection to anon, authenticated;

create function pg_temp.phase_9_profile_event_count(p_user_id uuid)
returns bigint
language plpgsql
as $function$
declare
  v_count bigint;
begin
  if pg_catalog.to_regclass('public.identity_profile_events') is null then
    return -1;
  end if;
  execute 'select count(*) from public.identity_profile_events where user_id = $1'
    into v_count
    using p_user_id;
  return v_count;
end;
$function$;

-- ---------------------------------------------------------------------------
-- A database role without a JWT must fail closed inside every mutation.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $test$select public.submit_update_profile(
    '{"idempotencyKey":"no-session-update","expectedVersion":1,"displayName":"Owner","avatarUrl":null,"timezone":null}'::jsonb
  )$test$,
  'ID201', 'identity_session_required', 'update requires auth.uid()'
);
select throws_ok(
  $test$select public.submit_add_wallet_address(
    '{"idempotencyKey":"no-session-add","expectedVersion":1,"chain":"evm","address":"0x1000000000000000000000000000000000000001","label":null,"visibility":"hidden"}'::jsonb
  )$test$,
  'ID201', 'identity_session_required', 'add requires auth.uid()'
);
select throws_ok(
  $test$select public.submit_set_wallet_address_visibility(
    '{"idempotencyKey":"no-session-visibility","expectedVersion":1,"walletAddressId":"50000000-0000-4000-8000-000000000099","visibility":"public"}'::jsonb
  )$test$,
  'ID201', 'identity_session_required', 'visibility requires auth.uid()'
);
select throws_ok(
  $test$select public.submit_remove_wallet_address(
    '{"idempotencyKey":"no-session-remove","expectedVersion":1,"walletAddressId":"50000000-0000-4000-8000-000000000099"}'::jsonb
  )$test$,
  'ID201', 'identity_session_required', 'remove requires auth.uid()'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

-- ---------------------------------------------------------------------------
-- Owner command lifecycle: update, add, publish, and remove.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_state (name, response)
    select 'update', public.submit_update_profile(
      '{"idempotencyKey":"owner-update-0001","expectedVersion":1,"displayName":"Owner","avatarUrl":"https://example.invalid/avatar.png","timezone":"Asia/Shanghai"}'::jsonb
    )
  $test$,
  'owner can update their profile through the protected command'
);
select is(
  (select response - 'commandId' from pg_temp.phase_9_identity_state where name = 'update'),
  '{"version":1,"profileId":"50000000-0000-4000-8000-000000000001","profileVersion":2,"replayed":false}'::jsonb,
  'update returns the exact versioned receipt fields'
);
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_state (name, response)
    select 'update-replay', public.submit_update_profile(
      '{"idempotencyKey":"owner-update-0001","expectedVersion":1,"displayName":"Owner","avatarUrl":"https://example.invalid/avatar.png","timezone":"Asia/Shanghai"}'::jsonb
    )
  $test$,
  'an exact update replay succeeds before version validation'
);
select ok(
  (select response ->> 'commandId' from pg_temp.phase_9_identity_state where name = 'update')
    = (select response ->> 'commandId' from pg_temp.phase_9_identity_state where name = 'update-replay')
  and (select (response ->> 'replayed')::boolean
       from pg_temp.phase_9_identity_state where name = 'update-replay'),
  'update replay returns the original command id with replayed true'
);
select is(
  (select version from public.profiles where id = '50000000-0000-4000-8000-000000000001'),
  2::bigint,
  'update replay does not advance profile version'
);
select throws_ok(
  $test$select public.submit_update_profile(
    '{"idempotencyKey":"owner-update-0001","expectedVersion":1,"displayName":"Changed","avatarUrl":"https://example.invalid/avatar.png","timezone":"Asia/Shanghai"}'::jsonb
  )$test$,
  'ID207', 'identity_idempotency_conflict', 'same update key with changed input is rejected'
);
select throws_ok(
  $test$select public.submit_update_profile(
    '{"idempotencyKey":"owner-update-stale","expectedVersion":1,"displayName":"Stale","avatarUrl":null,"timezone":null}'::jsonb
  )$test$,
  'ID206', 'identity_version_conflict', 'stale profile version is rejected'
);

select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_state (name, response)
    select 'add', public.submit_add_wallet_address(
      '{"idempotencyKey":"owner-add-0001","expectedVersion":2,"chain":"evm","address":"0x1000000000000000000000000000000000000001","label":"main","visibility":"hidden"}'::jsonb
    )
  $test$,
  'owner can add a hidden wallet address'
);
update pg_temp.phase_9_identity_state
set wallet_address_id = (response ->> 'walletAddressId')::uuid
where name = 'add';
select is(
  (select response - 'commandId' from pg_temp.phase_9_identity_state where name = 'add'),
  jsonb_build_object(
    'version', 1,
    'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add'),
    'walletAddressVersion', 1,
    'profileVersion', 3,
    'replayed', false
  ),
  'add returns wallet and owning profile versions'
);
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_state (name, response)
    select 'add-replay', public.submit_add_wallet_address(
      '{"idempotencyKey":"owner-add-0001","expectedVersion":2,"chain":"evm","address":"0x1000000000000000000000000000000000000001","label":"main","visibility":"hidden"}'::jsonb
    )
  $test$,
  'an exact add replay succeeds without inserting again'
);
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_projection (scope, payload)
    select 'owner-wallet-after-add-replay', to_jsonb(wallet)
    from public.list_my_wallet_addresses() as wallet
  $test$,
  'owner can reload wallets after add replay'
);
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_projection (scope, payload)
    select 'owner-profile-after-add', to_jsonb(profile)
    from public.get_my_identity_profile() as profile
  $test$,
  'owner can reload the profile version after add'
);
select ok(
  (select response ->> 'commandId' from pg_temp.phase_9_identity_state where name = 'add')
    = (select response ->> 'commandId' from pg_temp.phase_9_identity_state where name = 'add-replay')
  and (select (response ->> 'replayed')::boolean
       from pg_temp.phase_9_identity_state where name = 'add-replay')
  and (select count(*) from pg_temp.phase_9_identity_projection
       where scope = 'owner-wallet-after-add-replay') = 1,
  'add replay returns its receipt and leaves one address'
);
select is(
  (select (payload ->> 'version')::bigint
   from pg_temp.phase_9_identity_projection where scope = 'owner-profile-after-add'),
  3::bigint,
  'add advances the profile-owned collection version once'
);
select throws_ok(
  $test$select public.submit_add_wallet_address(
    '{"idempotencyKey":"owner-add-0001","expectedVersion":2,"chain":"evm","address":"0x9000000000000000000000000000000000000009","label":"changed","visibility":"hidden"}'::jsonb
  )$test$,
  'ID207', 'identity_idempotency_conflict', 'same add key with changed input is rejected'
);
select throws_ok(
  $test$select public.submit_add_wallet_address(
    '{"idempotencyKey":"owner-add-stale","expectedVersion":2,"chain":"evm","address":"0xa00000000000000000000000000000000000000a","label":null,"visibility":"hidden"}'::jsonb
  )$test$,
  'ID206', 'identity_version_conflict', 'stale profile version rejects add'
);
select throws_ok(
  $test$select public.submit_add_wallet_address(
    '{"idempotencyKey":"owner-add-duplicate","expectedVersion":3,"chain":"evm","address":"0x1000000000000000000000000000000000000001","label":"duplicate","visibility":"hidden"}'::jsonb
  )$test$,
  'ID204', 'identity_address_duplicate', 'duplicate owner address has a stable error'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

-- Seed four additional current rows as postgres so the limit assertion does
-- not confuse fixture setup with command/outbox behavior.
insert into public.user_wallet_addresses (user_id, chain, address, label, visibility)
values
  ('50000000-0000-4000-8000-000000000001', 'evm', '0x2000000000000000000000000000000000000002', null, 'hidden'),
  ('50000000-0000-4000-8000-000000000001', 'evm', '0x3000000000000000000000000000000000000003', null, 'hidden'),
  ('50000000-0000-4000-8000-000000000001', 'evm', '0x4000000000000000000000000000000000000004', null, 'hidden'),
  ('50000000-0000-4000-8000-000000000001', 'evm', '0x5000000000000000000000000000000000000005', null, 'hidden');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $test$select public.submit_add_wallet_address(
    '{"idempotencyKey":"owner-add-sixth","expectedVersion":3,"chain":"evm","address":"0x6000000000000000000000000000000000000006","label":null,"visibility":"hidden"}'::jsonb
  )$test$,
  'ID205', 'identity_address_limit_reached', 'a sixth current address is rejected'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

-- Anonymous public reads work, but the hidden wallet is absent and the
-- returned profile contains exactly the independent public contract fields.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_projection (scope, payload)
    select 'public-profile', to_jsonb(profile)
    from public.get_public_identity_profile(
      '50000000-0000-4000-8000-000000000001'
    ) as profile
  $test$,
  'anon can execute the public profile RPC'
);
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_projection (scope, payload)
    select 'public-wallet-hidden', to_jsonb(wallet)
    from public.list_public_identity_wallet_addresses(
      '50000000-0000-4000-8000-000000000001'
    ) as wallet
  $test$,
  'anon can execute the public wallet RPC before publication'
);
select results_eq(
  $test$
    select key
    from pg_temp.phase_9_identity_projection as projection
    cross join lateral jsonb_object_keys(projection.payload) as keys(key)
    where projection.scope = 'public-profile'
    order by key
  $test$,
  $test$values ('avatarUrl'::text), ('displayName'), ('userId')$test$,
  'public profile exposes exactly the three contract keys'
);
select is(
  (select count(*) from pg_temp.phase_9_identity_projection
   where scope = 'public-wallet-hidden'),
  0::bigint,
  'hidden wallets are absent from anonymous public reads'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

-- A different user sees only self-private data and cannot mutate the owner.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_projection (scope, payload)
    select 'private-profile', to_jsonb(profile)
    from public.get_my_identity_profile() as profile
  $test$,
  'authenticated can execute the private profile RPC'
);
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_projection (scope, payload)
    select 'private-wallet', to_jsonb(wallet)
    from public.list_my_wallet_addresses() as wallet
  $test$,
  'authenticated can execute the private wallet RPC'
);
select results_eq(
  $test$
    select (payload ->> 'userId')::uuid
    from pg_temp.phase_9_identity_projection
    where scope = 'private-profile'
  $test$,
  $test$values ('50000000-0000-4000-8000-000000000002'::uuid)$test$,
  'private profile read is pinned to auth.uid()'
);
select is(
  (select count(*) from pg_temp.phase_9_identity_projection where scope = 'private-wallet'),
  0::bigint,
  'another authenticated user cannot list owner wallets'
);
select is(
  (select count(*) from public.identity_profile_events),
  0::bigint,
  'another authenticated user cannot read owner profile events'
);
select throws_ok(
  pg_catalog.format(
    'select public.submit_set_wallet_address_visibility(%L::jsonb)',
    jsonb_build_object(
      'idempotencyKey', 'other-visibility',
      'expectedVersion', 1,
      'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add'),
      'visibility', 'public'
    )::text
  ),
  'ID208', 'identity_command_invalid', 'another user cannot mutate the owner wallet'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

-- Owner publishes and removes the first address. Receipt-first replay must
-- continue to work after the current row has been deleted.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  pg_catalog.format(
    'insert into pg_temp.phase_9_identity_state (name, response) select ''visibility'', public.submit_set_wallet_address_visibility(%L::jsonb)',
    jsonb_build_object(
      'idempotencyKey', 'owner-visibility-0001',
      'expectedVersion', 1,
      'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add'),
      'visibility', 'public'
    )::text
  ),
  'owner can publish their wallet through the protected command'
);
select is(
  (select response - 'commandId' from pg_temp.phase_9_identity_state where name = 'visibility'),
  jsonb_build_object(
    'version', 1,
    'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add'),
    'walletAddressVersion', 2,
    'replayed', false
  ),
  'visibility command returns the exact versioned receipt'
);
select lives_ok(
  pg_catalog.format(
    'insert into pg_temp.phase_9_identity_state (name, response) select ''visibility-replay'', public.submit_set_wallet_address_visibility(%L::jsonb)',
    jsonb_build_object(
      'idempotencyKey', 'owner-visibility-0001',
      'expectedVersion', 1,
      'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add'),
      'visibility', 'public'
    )::text
  ),
  'visibility replay succeeds without a second update'
);
select ok(
  (select response ->> 'commandId' from pg_temp.phase_9_identity_state where name = 'visibility')
    = (select response ->> 'commandId' from pg_temp.phase_9_identity_state where name = 'visibility-replay')
  and (select (response ->> 'replayed')::boolean
       from pg_temp.phase_9_identity_state where name = 'visibility-replay')
  and (select (response ->> 'walletAddressVersion')::bigint
       from pg_temp.phase_9_identity_state where name = 'visibility-replay') = 2,
  'visibility replay returns its receipt and does not advance version'
);
select throws_ok(
  pg_catalog.format(
    'select public.submit_set_wallet_address_visibility(%L::jsonb)',
    jsonb_build_object(
      'idempotencyKey', 'owner-visibility-0001',
      'expectedVersion', 1,
      'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add'),
      'visibility', 'hidden'
    )::text
  ),
  'ID207', 'identity_idempotency_conflict',
  'same visibility key with changed input is rejected before version validation'
);
select throws_ok(
  pg_catalog.format(
    'select public.submit_set_wallet_address_visibility(%L::jsonb)',
    jsonb_build_object(
      'idempotencyKey', 'owner-visibility-stale',
      'expectedVersion', 1,
      'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add'),
      'visibility', 'hidden'
    )::text
  ),
  'ID206', 'identity_version_conflict', 'stale wallet visibility version is rejected'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

delete from pg_temp.phase_9_identity_projection where scope like 'public-wallet%';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_projection (scope, payload)
    select 'public-wallet-visible', to_jsonb(wallet)
    from public.list_public_identity_wallet_addresses(
      '50000000-0000-4000-8000-000000000001'
    ) as wallet
  $test$,
  'anon can execute the public wallet RPC after publication'
);
select is(
  (select count(*) from pg_temp.phase_9_identity_projection
   where scope = 'public-wallet-visible'),
  1::bigint,
  'an explicitly public wallet is visible to anon'
);
select results_eq(
  $test$
    select key
    from pg_temp.phase_9_identity_projection as projection
    cross join lateral jsonb_object_keys(projection.payload) as keys(key)
    where projection.scope = 'public-wallet-visible'
    order by key
  $test$,
  $test$values ('address'::text), ('chain'), ('label'), ('walletAddressId')$test$,
  'public wallet projection exposes exactly four safe keys'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  pg_catalog.format(
    'insert into pg_temp.phase_9_identity_state (name, response) select ''remove'', public.submit_remove_wallet_address(%L::jsonb)',
    jsonb_build_object(
      'idempotencyKey', 'owner-remove-0001',
      'expectedVersion', 2,
      'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add')
    )::text
  ),
  'owner can remove their wallet through the protected command'
);
select is(
  (select response - 'commandId' from pg_temp.phase_9_identity_state where name = 'remove'),
  jsonb_build_object(
    'version', 1,
    'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add'),
    'walletAddressVersion', 3,
    'replayed', false
  ),
  'remove returns the exact tombstone-version receipt'
);
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_projection (scope, payload)
    select 'owner-wallet-after-remove', to_jsonb(wallet)
    from public.list_my_wallet_addresses() as wallet
  $test$,
  'owner can reload wallets after remove'
);
select is(
  (select count(*) from pg_temp.phase_9_identity_projection
   where scope = 'owner-wallet-after-remove'
     and payload ->> 'walletAddressId' = (
       select wallet_address_id::text
       from pg_temp.phase_9_identity_state where name = 'add'
     )),
  0::bigint,
  'remove deletes the current wallet row'
);
select lives_ok(
  pg_catalog.format(
    'insert into pg_temp.phase_9_identity_state (name, response) select ''remove-replay'', public.submit_remove_wallet_address(%L::jsonb)',
    jsonb_build_object(
      'idempotencyKey', 'owner-remove-0001',
      'expectedVersion', 2,
      'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add')
    )::text
  ),
  'remove replay succeeds after the current row is gone'
);
select ok(
  (select response ->> 'commandId' from pg_temp.phase_9_identity_state where name = 'remove')
    = (select response ->> 'commandId' from pg_temp.phase_9_identity_state where name = 'remove-replay')
  and (select (response ->> 'replayed')::boolean
       from pg_temp.phase_9_identity_state where name = 'remove-replay'),
  'remove replay returns the original receipt'
);
select throws_ok(
  pg_catalog.format(
    'select public.submit_remove_wallet_address(%L::jsonb)',
    jsonb_build_object(
      'idempotencyKey', 'owner-remove-0001',
      'expectedVersion', 3,
      'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add')
    )::text
  ),
  'ID207', 'identity_idempotency_conflict',
  'same remove key with changed input is rejected before tombstone validation'
);
select throws_ok(
  pg_catalog.format(
    'select public.submit_remove_wallet_address(%L::jsonb)',
    jsonb_build_object(
      'idempotencyKey', 'owner-remove-stale',
      'expectedVersion', 2,
      'walletAddressId', (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add')
    )::text
  ),
  'ID206', 'identity_version_conflict', 'stale remove sees the tombstone version conflict'
);

-- Explicit JSON null clears nullable profile fields rather than coalescing to
-- their previous values. Add advanced the profile-owned collection to v3.
select lives_ok(
  $test$
    insert into pg_temp.phase_9_identity_state (name, response)
    select 'clear-profile', public.submit_update_profile(
      '{"idempotencyKey":"owner-update-clear","expectedVersion":3,"displayName":null,"avatarUrl":null,"timezone":null}'::jsonb
    )
  $test$,
  'profile nullable fields can be explicitly cleared'
);
select ok(
  (select display_name is null and avatar_url is null and timezone is null and version = 4
   from public.profiles where id = '50000000-0000-4000-8000-000000000001'),
  'explicit null clears all nullable profile fields and advances version'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

create function pg_temp.phase_9_force_profile_persistence_failure()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'phase_9_forced_profile_persistence_failure' using errcode = '23514';
end;
$function$;

create trigger phase_9_force_profile_persistence_failure
before update on public.profiles
for each row
when (new.id = '50000000-0000-4000-8000-000000000001'::uuid)
execute function pg_temp.phase_9_force_profile_persistence_failure();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $test$select public.submit_update_profile(
    '{"idempotencyKey":"owner-update-persistence-failure","expectedVersion":4,"displayName":"Must Roll Back","avatarUrl":null,"timezone":null}'::jsonb
  )$test$,
  'ID299', 'identity_persistence_failed',
  'unexpected profile persistence failures map to the stable ID299 boundary'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

drop trigger phase_9_force_profile_persistence_failure on public.profiles;
drop function pg_temp.phase_9_force_profile_persistence_failure();

select ok(
  (select version = 4 and display_name is null
   from public.profiles where id = '50000000-0000-4000-8000-000000000001')
  and pg_temp.phase_9_profile_event_count('50000000-0000-4000-8000-000000000001') = 2
  and (select count(*) from public.identity_command_receipts
       where user_id = '50000000-0000-4000-8000-000000000001'
         and idempotency_key = 'owner-update-persistence-failure') = 0
  and (select count(*) from public.outbox_events
       where event_type = 'identity.profile.updated.v1'
         and aggregate_id = '50000000-0000-4000-8000-000000000001') = 2,
  'ID299 failure rolls back profile, audit, receipt, and outbox side effects'
);

-- ---------------------------------------------------------------------------
-- Append-only history and transactional outbox evidence.
-- ---------------------------------------------------------------------------

select is(
  pg_temp.phase_9_profile_event_count('50000000-0000-4000-8000-000000000001'),
  2::bigint,
  'both successful profile changes append audit rows'
);
select is(
  (select count(*) from public.user_wallet_address_events
   where wallet_address_id = (
     select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add'
   )),
  3::bigint,
  'add, visibility, and removal each append wallet audit rows'
);
select results_eq(
  $test$
    select event_type
    from public.user_wallet_address_events
    where wallet_address_id = (
      select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add'
    )
    order by id
  $test$,
  $test$values ('added'::text), ('visibility_changed'), ('removed')$test$,
  'wallet event history preserves the complete lifecycle in order'
);
select is(
  (select count(*) from public.outbox_events
   where event_type like 'identity.%'
     and aggregate_id in (
       '50000000-0000-4000-8000-000000000001'::uuid,
       (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add')
     )),
  5::bigint,
  'exactly one outbox row exists for every successful mutation and none for failures/replays'
);
select results_eq(
  $test$
    select event_type
    from public.outbox_events
    where event_type like 'identity.%'
      and aggregate_id in (
        '50000000-0000-4000-8000-000000000001'::uuid,
        (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add')
      )
    order by occurred_at, id
  $test$,
  $test$values
    ('identity.profile.updated.v1'::text),
    ('identity.wallet_address.added.v1'),
    ('identity.wallet_address.visibility_changed.v1'),
    ('identity.wallet_address.removed.v1'),
    ('identity.profile.updated.v1')
  $test$,
  'outbox event types follow the successful command sequence'
);
select ok(
  coalesce(bool_and(
    payload ?& array['version', 'eventType', 'aggregateId', 'aggregateVersion', 'occurredAt']
    and payload - array[
      'version', 'eventType', 'aggregateId', 'aggregateVersion', 'occurredAt'
    ]::text[] = '{}'::jsonb
  ), false),
  'identity outbox payloads contain exactly the five safe keys'
)
from public.outbox_events
where event_type like 'identity.%'
  and aggregate_id in (
    '50000000-0000-4000-8000-000000000001'::uuid,
    (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add')
  );

select ok(
  coalesce(bool_and(
    payload ->> 'eventType' = event_type
    and (payload ->> 'aggregateId')::uuid = aggregate_id
    and (payload ->> 'aggregateVersion')::bigint = aggregate_version
    and (payload ->> 'version')::integer = 1
    and payload ->> 'occurredAt' = pg_catalog.to_char(
      occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
    and (
      (
        aggregate_type = 'identity_profile'
        and event_type = 'identity.profile.updated.v1'
        and exists (
          select 1 from public.identity_profile_events as profile_event
          where profile_event.user_id = aggregate_id
            and profile_event.profile_version = aggregate_version
            and profile_event.occurred_at = outbox.occurred_at
        )
      )
      or (
        aggregate_type = 'identity_wallet_address'
        and exists (
          select 1 from public.user_wallet_address_events as wallet_event
          where wallet_event.wallet_address_id = aggregate_id
            and wallet_event.wallet_address_version = aggregate_version
            and wallet_event.occurred_at = outbox.occurred_at
            and outbox.event_type = case wallet_event.event_type
              when 'added' then 'identity.wallet_address.added.v1'
              when 'visibility_changed' then 'identity.wallet_address.visibility_changed.v1'
              when 'removed' then 'identity.wallet_address.removed.v1'
            end
        )
      )
    )
  ), false),
  'identity outbox rows correlate aggregate, payload, version, time, and audit values'
)
from public.outbox_events as outbox
where event_type like 'identity.%'
  and aggregate_id in (
    '50000000-0000-4000-8000-000000000001'::uuid,
    (select wallet_address_id from pg_temp.phase_9_identity_state where name = 'add')
  );

select throws_ok(
  $test$update public.identity_command_receipts set response = '{}'::jsonb
        where user_id = '50000000-0000-4000-8000-000000000001'$test$,
  '55000', 'identity_ledger_rows_are_append_only', 'receipt updates are structurally rejected'
);
select throws_ok(
  $test$delete from public.identity_command_receipts
        where user_id = '50000000-0000-4000-8000-000000000001'$test$,
  '55000', 'identity_ledger_rows_are_append_only', 'receipt deletes are structurally rejected'
);
select throws_ok(
  $test$update public.identity_profile_events set event_type = event_type
        where user_id = '50000000-0000-4000-8000-000000000001'$test$,
  '55000', 'identity_ledger_rows_are_append_only', 'profile event updates are rejected'
);
select throws_ok(
  $test$delete from public.identity_profile_events
        where user_id = '50000000-0000-4000-8000-000000000001'$test$,
  '55000', 'identity_ledger_rows_are_append_only', 'profile event deletes are rejected'
);
select throws_ok(
  $test$update public.user_wallet_address_events set event_type = event_type
        where user_id = '50000000-0000-4000-8000-000000000001'$test$,
  '55000', 'identity_ledger_rows_are_append_only', 'wallet event updates are rejected'
);
select throws_ok(
  $test$delete from public.user_wallet_address_events
        where user_id = '50000000-0000-4000-8000-000000000001'$test$,
  '55000', 'identity_ledger_rows_are_append_only', 'wallet event deletes are rejected'
);

-- Actual browser writes are denied even for the owner; RLS ownership alone
-- must never bypass versioning, receipts, audit, or outbox.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $test$update public.profiles set display_name = 'bypass'
        where id = '50000000-0000-4000-8000-000000000001'$test$,
  '42501', null, 'owner cannot bypass the profile command with direct update'
);
select throws_ok(
  $test$insert into public.user_wallet_addresses (user_id, chain, address)
        values (
          '50000000-0000-4000-8000-000000000001',
          'evm',
          '0x7000000000000000000000000000000000000007'
        )$test$,
  '42501', null, 'owner cannot bypass the wallet command with direct insert'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

select * from finish();
rollback;
