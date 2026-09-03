begin;
select plan(6);

-- ---------------------------------------------------------------------------
-- Migration 29: the two public score projections are readable through definer
-- RPCs so anonymous readers no longer pay for per-row RLS evaluation of the
-- underlying tables. The views keep their own gate; only the executing role
-- changes.
-- ---------------------------------------------------------------------------

-- 1. Public readers may execute both functions.
select has_function_privilege(
  'anon', 'public.list_public_score_factors(uuid, uuid)', 'EXECUTE'
) as anon_factors,
  has_function_privilege(
    'authenticated', 'public.list_public_score_factors(uuid, uuid)', 'EXECUTE'
  ) as auth_factors,
  has_function_privilege(
    'anon', 'public.list_public_score_evidence_citations(uuid, uuid)', 'EXECUTE'
  ) as anon_citations,
  has_function_privilege(
    'authenticated', 'public.list_public_score_evidence_citations(uuid, uuid)', 'EXECUTE'
  ) as auth_citations \gset

select is(:'anon_factors' || '/' || :'auth_factors', 't/t', 'anon and authenticated can read score factors through the RPC');
select is(:'anon_citations' || '/' || :'auth_citations', 't/t', 'anon and authenticated can read citations through the RPC');

-- 2. Both functions run as the owner and are not security invoker, which is the
--    whole point: the view's gate still applies, RLS on the base tables does not.
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_public_score_factors'),
  true,
  'list_public_score_factors is security definer'
);

select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_public_score_evidence_citations'),
  true,
  'list_public_score_evidence_citations is security definer'
);

-- 3. An anonymous call succeeds and returns the same rows the view would.
select lives_ok(
  $test$
    do $inner$
    declare
      v_from_view integer;
      v_from_rpc integer;
    begin
      set local role anon;
      select count(*) into v_from_view
        from public.project_current_score_evidence_citations;
      select count(*) into v_from_rpc
        from public.list_public_score_evidence_citations(
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002'
        );
      reset role;
      if v_from_rpc <> 0 then
        raise exception 'rpc returned rows for a non-existent score';
      end if;
    end
    $inner$;
  $test$,
  'an anonymous RPC call succeeds and returns nothing for an unknown score'
);

-- 4. The views themselves are untouched: no column was added or dropped, so
--    any other consumer keeps working.
select results_eq(
  $test$
    select count(*)::int
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_current_score_evidence_citations'
  $test$,
  array[15],
  'the citation projection keeps its 15 columns'
);

select * from finish();
rollback;
