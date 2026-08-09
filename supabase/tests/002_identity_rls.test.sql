begin;

select plan(61);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'user_roles', 'user_roles table exists');

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.profiles'::regclass),
  'profiles has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.user_roles'::regclass),
  'user_roles has row-level security enabled'
);

select columns_are(
  'public',
  'profiles',
  array['id', 'display_name', 'avatar_url', 'timezone', 'created_at', 'updated_at'],
  'profiles exposes the identity contract columns in order'
);
select columns_are(
  'public',
  'user_roles',
  array['user_id', 'role', 'granted_by', 'granted_at', 'revoked_at'],
  'user_roles exposes the append-only grant contract columns in order'
);

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
values
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'owner@example.invalid',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-08-09 00:00:00+00',
    '2026-08-09 00:00:00+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'other@example.invalid',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-08-09 00:00:00+00',
    '2026-08-09 00:00:00+00'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@example.invalid',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-08-09 00:00:00+00',
    '2026-08-09 00:00:00+00'
  );

select is(
  (select count(*)::integer from public.profiles),
  3,
  'creating auth users automatically creates one profile per user'
);
select is(
  (select count(*)::integer from public.profiles where timezone = 'UTC'),
  3,
  'automatic profiles use the UTC timezone default'
);
select ok(
  not exists (
    select 1
    from auth.users as auth_user
    full join public.profiles as profile on profile.id = auth_user.id
    where auth_user.id is null
      or profile.id is null
  ),
  'every auth user has exactly one profile and every profile belongs to an auth user'
);

insert into public.user_roles (user_id, role, granted_by, granted_at, revoked_at)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'user',
    '33333333-3333-4333-8333-333333333333',
    '2026-08-09 00:00:00+00',
    null
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'reviewer',
    '33333333-3333-4333-8333-333333333333',
    '2026-08-01 00:00:00+00',
    '2026-08-02 00:00:00+00'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'admin',
    '33333333-3333-4333-8333-333333333333',
    '2026-08-09 00:00:00+00',
    null
  );

select is(
  (select count(*)::integer from public.user_roles),
  3,
  'role history stores active and revoked grants'
);

select throws_like(
  $$
    insert into public.user_roles (user_id, role, granted_by, granted_at, revoked_at)
    values (
      '22222222-2222-4222-8222-222222222222',
      'user',
      '33333333-3333-4333-8333-333333333333',
      '2026-08-09 02:00:00+00',
      '2026-08-09 01:00:00+00'
    )
  $$,
  '%user_roles_revoked_after_granted%',
  'a revocation must be later than its grant'
);
select throws_like(
  $$update public.profiles set display_name = ' padded ' where id = '11111111-1111-4111-8111-111111111111'$$,
  '%profiles_display_name_valid%',
  'display names must already be trimmed and non-empty'
);
select throws_like(
  $$update public.profiles set avatar_url = 'http://example.invalid/avatar.png' where id = '11111111-1111-4111-8111-111111111111'$$,
  '%profiles_avatar_url_https%',
  'avatar URLs must use HTTPS'
);

with expected(signature, is_security_definer, volatility) as (
  values
    ('public.handle_new_user()', true, 'v'),
    ('public.has_active_role(public.app_role)', true, 's'),
    ('public.set_updated_at()', true, 'v'),
    ('public.enforce_user_role_history()', false, 'v')
)
select ok(
  pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
    and procedure.prosecdef = expected.is_security_definer
    and procedure.provolatile::text = expected.volatility
    and procedure.proconfig @> array['search_path=pg_catalog, public']::text[],
  pg_catalog.format(
    '%s has the controlled owner, fixed search_path, expected volatility, and expected security mode',
    expected.signature
  )
)
from expected
join pg_catalog.pg_proc as procedure on procedure.oid = expected.signature::regprocedure;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_like(
  $$select * from public.profiles$$,
  'permission denied for table profiles',
  'anonymous users cannot read profiles'
);
select throws_like(
  $$select * from public.user_roles$$,
  'permission denied for table user_roles',
  'anonymous users cannot read role history'
);
select throws_like(
  $$select public.has_active_role('user')$$,
  'permission denied for function has_active_role',
  'anonymous users cannot execute role lookup'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

alter table public.profiles disable trigger profiles_set_updated_at;
update public.profiles
set updated_at = '2000-01-01 00:00:00+00'
where id = '11111111-1111-4111-8111-111111111111';
alter table public.profiles enable trigger profiles_set_updated_at;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select results_eq(
  $$select id from public.profiles order by id$$,
  $$values ('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'an authenticated owner can read only their own profile'
);
select lives_ok(
  $$update public.profiles set display_name = 'Owner' where id = '11111111-1111-4111-8111-111111111111'$$,
  'an authenticated owner can update mutable profile fields'
);
select is(
  (select display_name from public.profiles),
  'Owner',
  'the owner profile update is persisted'
);
select ok(
  (select updated_at > '2000-01-01 00:00:00+00'::timestamptz from public.profiles),
  'the profile update trigger advances updated_at'
);
select results_eq(
  $$
    with changed as (
      update public.profiles
      set display_name = 'Not allowed'
      where id = '22222222-2222-4222-8222-222222222222'
      returning 1
    )
    select count(*)::bigint from changed
  $$,
  $$values (0::bigint)$$,
  'an authenticated owner cannot update another profile'
);
select throws_like(
  $$update public.profiles set id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where id = '11111111-1111-4111-8111-111111111111'$$,
  'permission denied for table profiles',
  'an authenticated owner cannot mutate profile identity'
);
select throws_like(
  $$insert into public.profiles (id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  'permission denied for table profiles',
  'an authenticated owner cannot create profiles directly'
);
select throws_like(
  $$delete from public.profiles where id = '11111111-1111-4111-8111-111111111111'$$,
  'permission denied for table profiles',
  'an authenticated owner cannot delete their profile directly'
);
select results_eq(
  $$select role::text from public.user_roles order by granted_at$$,
  $$values ('user'::text)$$,
  'an authenticated user can read only their own role history'
);
select ok(public.has_active_role('user'), 'an active role is returned for its owner');
select ok(not public.has_active_role('admin'), 'a different role is not returned for its owner');
select throws_like(
  $$insert into public.user_roles (user_id, role) values ('11111111-1111-4111-8111-111111111111', 'admin')$$,
  'permission denied for table user_roles',
  'an ordinary user cannot grant roles'
);
select throws_like(
  $$update public.user_roles set revoked_at = now() where user_id = '11111111-1111-4111-8111-111111111111'$$,
  'permission denied for table user_roles',
  'an ordinary user cannot revoke roles'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);

select results_eq(
  $$select id from public.profiles order by id$$,
  $$values ('33333333-3333-4333-8333-333333333333'::uuid)$$,
  'a browser admin cannot read another user profile'
);
select results_eq(
  $$select role::text from public.user_roles order by granted_at$$,
  $$values ('admin'::text)$$,
  'a browser admin can read only their own role history'
);
select ok(public.has_active_role('admin'), 'an active admin grant is returned for its owner');
select throws_like(
  $$insert into public.user_roles (user_id, role) values ('22222222-2222-4222-8222-222222222222', 'admin')$$,
  'permission denied for table user_roles',
  'a browser admin cannot grant roles'
);
select throws_like(
  $$update public.user_roles set revoked_at = now() where user_id = '33333333-3333-4333-8333-333333333333'$$,
  'permission denied for table user_roles',
  'a browser admin cannot revoke roles'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select count(*)::integer from public.profiles),
  3,
  'service role can read all profiles'
);
select is(
  (select count(*)::integer from public.user_roles),
  3,
  'service role can read all role history'
);
select lives_ok(
  $$
    insert into public.user_roles (user_id, role, granted_by, granted_at)
    values (
      '22222222-2222-4222-8222-222222222222',
      'reviewer',
      '33333333-3333-4333-8333-333333333333',
      '2026-08-09 01:00:00+00'
    )
  $$,
  'service role can append a new grant after an earlier grant was revoked'
);
select throws_like(
  $$
    insert into public.user_roles (user_id, role, granted_by, granted_at)
    values (
      '22222222-2222-4222-8222-222222222222',
      'reviewer',
      '33333333-3333-4333-8333-333333333333',
      '2026-08-09 02:00:00+00'
    )
  $$,
  '%duplicate key value violates unique constraint "user_roles_one_active_grant"%',
  'only one active grant exists for a user and role'
);
select lives_ok(
  $$
    update public.user_roles
    set revoked_at = '2026-08-09 03:00:00+00'
    where user_id = '22222222-2222-4222-8222-222222222222'
      and role = 'reviewer'
      and granted_at = '2026-08-09 01:00:00+00'
  $$,
  'service role can revoke an active grant'
);
select is(
  (
    select count(*)::integer
    from public.user_roles
    where user_id = '22222222-2222-4222-8222-222222222222'
      and role = 'reviewer'
  ),
  2,
  'revocation retains both historical grant rows'
);
select throws_like(
  $$delete from public.user_roles where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'permission denied for table user_roles',
  'service role cannot delete role history'
);
select throws_like(
  $$
    update public.user_roles
    set role = 'admin'
    where user_id = '22222222-2222-4222-8222-222222222222'
      and role = 'reviewer'
      and granted_at = '2026-08-09 01:00:00+00'
  $$,
  'permission denied for table user_roles',
  'service role cannot rewrite a historical grant'
);
select throws_like(
  $$
    update public.user_roles
    set revoked_at = null
    where user_id = '22222222-2222-4222-8222-222222222222'
      and role = 'reviewer'
      and granted_at = '2026-08-09 01:00:00+00'
  $$,
  '%user_role_history_immutable%',
  'service role cannot restore a revoked grant'
);
select throws_like(
  $$
    update public.user_roles
    set revoked_at = '2026-08-09 04:00:00+00'
    where user_id = '22222222-2222-4222-8222-222222222222'
      and role = 'reviewer'
      and granted_at = '2026-08-09 01:00:00+00'
  $$,
  '%user_role_history_immutable%',
  'service role cannot rewrite a revocation time'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select ok(
  not public.has_active_role('reviewer'),
  'revoked role history does not satisfy active role lookup'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

select ok(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  'authenticated users cannot execute the auth trigger function'
);
select ok(
  not has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE'),
  'authenticated users cannot execute the timestamp trigger function'
);
select ok(
  not has_function_privilege('authenticated', 'public.enforce_user_role_history()', 'EXECUTE'),
  'authenticated users cannot execute the role-history trigger function'
);
select ok(
  has_function_privilege('authenticated', 'public.has_active_role(public.app_role)', 'EXECUTE'),
  'authenticated users can execute only the role lookup function'
);
select ok(
  not has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE'),
  'service role cannot execute the auth trigger function directly'
);
select ok(
  not has_function_privilege('service_role', 'public.set_updated_at()', 'EXECUTE'),
  'service role cannot execute the timestamp trigger function directly'
);
select ok(
  not has_function_privilege('service_role', 'public.enforce_user_role_history()', 'EXECUTE'),
  'service role cannot execute the role-history trigger function directly'
);
select ok(
  has_function_privilege('service_role', 'public.has_active_role(public.app_role)', 'EXECUTE'),
  'service role can execute the role lookup function'
);

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
  '44444444-4444-4444-8444-444444444444',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'grantor@example.invalid',
  '{"provider":"email","providers":["email"]}',
  '{}',
  '2026-08-09 00:00:00+00',
  '2026-08-09 00:00:00+00'
);

insert into public.user_roles (user_id, role, granted_by, granted_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'reviewer',
  '44444444-4444-4444-8444-444444444444',
  '2026-08-09 05:00:00+00'
);

select throws_like(
  $$delete from public.profiles where id = '44444444-4444-4444-8444-444444444444'$$,
  '%user_roles_granted_by_fkey%',
  'a profile referenced as grantor cannot be deleted'
);
select is(
  (
    select granted_by
    from public.user_roles
    where user_id = '11111111-1111-4111-8111-111111111111'
      and role = 'reviewer'
      and granted_at = '2026-08-09 05:00:00+00'
  ),
  '44444444-4444-4444-8444-444444444444'::uuid,
  'grant provenance is never silently rewritten to null'
);
select throws_like(
  $$delete from public.profiles where id = '11111111-1111-4111-8111-111111111111'$$,
  '%user_roles_user_id_fkey%',
  'a profile that owns role history cannot be deleted'
);
select is(
  (
    select count(*)::integer
    from public.user_roles
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  2,
  'profile deletion never cascades into role-history deletion'
);

select * from finish();

rollback;
