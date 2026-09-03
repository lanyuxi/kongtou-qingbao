begin;
select plan(3);

-- 1. The reader role can execute the state helper the authority projection
--    calls per row.
select has_function_privilege(
  'anon', 'public.domain_authority_current_state_v1(uuid)', 'EXECUTE'
) as anon_execute,
  has_function_privilege(
    'authenticated', 'public.domain_authority_current_state_v1(uuid)', 'EXECUTE'
  ) as authenticated_execute \gset

select is(
  :'anon_execute' || '/' || :'authenticated_execute',
  't/t',
  'public readers can execute the authority state helper'
);

-- 2. An anonymous read of the authority projection succeeds end to end.
select lives_ok(
  $test$
    set role anon;
    select count(*) from public.public_project_domain_authorities;
    reset role;
  $test$,
  'anon can read the authority projection through the invoker view'
);

-- 3. The reference projection stays readable too (regression guard for the
--    sibling helper that was already granted in 7B).
select lives_ok(
  $test$
    set role anon;
    select count(*) from public.public_project_references;
    reset role;
  $test$,
  'anon can still read the reference projection'
);

select * from finish();
rollback;
