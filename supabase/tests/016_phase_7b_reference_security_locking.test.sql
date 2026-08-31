begin;

select plan(18);

-- These catalog checks supplement the real-race integration suite. They make
-- the required lock order reviewable without pretending to prove contention.

select ok(
  pg_catalog.pg_get_functiondef(
    'public.flag_references_for_new_indicator()'::regprocedure
  ) like '%security_target_lock_key_v1(''reference'', v_reference_id)%',
  'indicator flagging acquires the matched reference security key'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.flag_references_for_new_indicator()'::regprocedure
  ) ~ 'order by[[:space:]]+reference_row\.id::text[[:space:]]+asc',
  'indicator flagging orders matched reference ids by UUID text'
);

select ok(
  strpos(
    pg_catalog.pg_get_functiondef('public.flag_references_for_new_indicator()'::regprocedure),
    'security_target_lock_key_v1(''reference'', v_reference_id)'
  ) < strpos(
    pg_catalog.pg_get_functiondef('public.flag_references_for_new_indicator()'::regprocedure),
    'insert into public.reference_security_flags'
  ),
  'indicator flagging acquires each reference key before inserting its flag'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.submit_decide_reference(uuid,jsonb,text)'::regprocedure
  ) like '%security_target_lock_key_v1(''source'', v_evidence_source_id)%',
  'reference decisions acquire the Evidence source security key'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.submit_decide_reference(uuid,jsonb,text)'::regprocedure
  ) like '%security_target_lock_key_v1(''domain_authority'', v_authority_id)%',
  'reference decisions acquire the matching authority security key'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.submit_decide_reference(uuid,jsonb,text)'::regprocedure
  ) like '%security_target_lock_key_v1(''reference'', p_reference_id)%',
  'reference decisions acquire the reference security key'
);

select ok(
  strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_reference(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''source'', v_evidence_source_id)'
  ) < strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_reference(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''domain_authority'', v_authority_id)'
  ) and strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_reference(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''domain_authority'', v_authority_id)'
  ) < strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_reference(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''reference'', p_reference_id)'
  ),
  'reference decisions use source then authority then reference lock order'
);

select ok(
  strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_reference(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''reference'', p_reference_id)'
  ) < strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_reference(uuid,jsonb,text)'::regprocedure),
    'for update'
  ),
  'reference decisions acquire shared keys before locking the aggregate row'
);

select ok(
  strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_reference(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''reference'', p_reference_id)'
  ) < strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_reference(uuid,jsonb,text)'::regprocedure),
    'reference_evidence_is_usable'
  ) and strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_reference(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''reference'', p_reference_id)'
  ) < strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_reference(uuid,jsonb,text)'::regprocedure),
    'reference_current_state_v1'
  ),
  'reference decisions re-check Evidence and reference state after shared locks'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.submit_decide_domain_authority(uuid,jsonb,text)'::regprocedure
  ) like '%security_target_lock_key_v1(''source'', v_evidence_source_id)%',
  'authority decisions acquire the Evidence source security key'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.submit_decide_domain_authority(uuid,jsonb,text)'::regprocedure
  ) like '%security_target_lock_key_v1(''domain_authority'', p_authority_id)%',
  'authority decisions acquire the authority security key'
);

select ok(
  strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_domain_authority(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''source'', v_evidence_source_id)'
  ) < strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_domain_authority(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''domain_authority'', p_authority_id)'
  ),
  'authority decisions use source then authority lock order'
);

select ok(
  strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_domain_authority(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''domain_authority'', p_authority_id)'
  ) < strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_domain_authority(uuid,jsonb,text)'::regprocedure),
    'for update'
  ),
  'authority decisions acquire shared keys before locking the aggregate row'
);

select ok(
  strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_domain_authority(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''domain_authority'', p_authority_id)'
  ) < strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_domain_authority(uuid,jsonb,text)'::regprocedure),
    'reference_evidence_is_usable'
  ) and strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_domain_authority(uuid,jsonb,text)'::regprocedure),
    'security_target_lock_key_v1(''domain_authority'', p_authority_id)'
  ) < strpos(
    pg_catalog.pg_get_functiondef('public.submit_decide_domain_authority(uuid,jsonb,text)'::regprocedure),
    'domain_authority_current_state_v1'
  ),
  'authority decisions re-check Evidence and authority state after shared locks'
);

select ok(
  (
    select pg_catalog.bool_and(
      procedure_info.prosecdef
      and pg_catalog.pg_get_userbyid(procedure_info.proowner) = 'postgres'
      and procedure_info.proconfig = array['search_path=pg_catalog, public, extensions']::text[]
    )
    from pg_catalog.pg_proc as procedure_info
    where procedure_info.oid in (
      'public.flag_references_for_new_indicator()'::regprocedure,
      'public.submit_decide_reference(uuid,jsonb,text)'::regprocedure,
      'public.submit_decide_domain_authority(uuid,jsonb,text)'::regprocedure
    )
  ),
  'all coupling functions remain postgres-owned security definers with fixed search paths'
);

select ok(
  'public.flag_references_for_new_indicator()'::regprocedure = (
    select trigger_info.tgfoid::regprocedure
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.security_indicators'::regclass
      and trigger_info.tgname = 'security_indicators_flag_references'
      and not trigger_info.tgisinternal
  )
  and pg_catalog.to_regprocedure('public.submit_decide_reference(uuid,jsonb,text)') is not null
  and pg_catalog.to_regprocedure('public.submit_decide_domain_authority(uuid,jsonb,text)') is not null,
  'the existing trigger and decision RPC signatures remain unchanged'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'public.submit_decide_reference(uuid,jsonb,text)', 'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'authenticated', 'public.submit_decide_domain_authority(uuid,jsonb,text)', 'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon', 'public.submit_decide_reference(uuid,jsonb,text)', 'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon', 'public.submit_decide_domain_authority(uuid,jsonb,text)', 'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role', 'public.submit_decide_reference(uuid,jsonb,text)', 'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role', 'public.submit_decide_domain_authority(uuid,jsonb,text)', 'EXECUTE'
  ),
  'reference decision RPC execution remains authenticated-only'
);

select ok(
  (
    select pg_catalog.bool_and(
      not pg_catalog.has_table_privilege('anon', pg_catalog.format('public.%I', table_name), 'SELECT,INSERT,UPDATE,DELETE')
      and not pg_catalog.has_table_privilege('authenticated', pg_catalog.format('public.%I', table_name), 'SELECT,INSERT,UPDATE,DELETE')
    )
    from (values
      ('project_references'),
      ('project_reference_decisions'),
      ('project_domain_authorities'),
      ('project_domain_authority_decisions'),
      ('reference_security_flags'),
      ('reference_review_commands')
    ) as protected_ledger(table_name)
  ),
  'browser roles retain no direct reference ledger table access'
);

select * from finish();

rollback;
