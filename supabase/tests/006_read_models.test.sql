begin;

delete from public.project_scores
where project_id in ('90000000-0000-4000-8000-000000000010'::uuid, '90000000-0000-4000-8000-000000000011'::uuid, '90000000-0000-4000-8000-000000000012'::uuid);
delete from public.signals
where project_id in ('90000000-0000-4000-8000-000000000010'::uuid, '90000000-0000-4000-8000-000000000011'::uuid, '90000000-0000-4000-8000-000000000012'::uuid);
delete from public.project_sources
where project_id in ('90000000-0000-4000-8000-000000000010'::uuid, '90000000-0000-4000-8000-000000000011'::uuid, '90000000-0000-4000-8000-000000000012'::uuid);
delete from public.sources
where id in ('90000000-0000-4000-8000-000000000020'::uuid, '90000000-0000-4000-8000-000000000021'::uuid);
delete from public.projects
where id in ('90000000-0000-4000-8000-000000000010'::uuid, '90000000-0000-4000-8000-000000000011'::uuid, '90000000-0000-4000-8000-000000000012'::uuid);
delete from auth.users
where id = '90000000-0000-4000-8000-000000000001'::uuid;

select plan(78);

select has_view('public', 'project_current_state', 'project_current_state view exists');
select has_view('public', 'opportunity_list', 'opportunity_list view exists');

select ok(
  relation.relrowsecurity,
  pg_catalog.format('%s has row-level security enabled', expected.table_name)
)
from (
  values
    ('profiles'),
    ('user_roles'),
    ('projects'),
    ('sources'),
    ('project_sources'),
    ('signals'),
    ('project_scores'),
    ('collection_attempts'),
    ('raw_items'),
    ('discovered_items'),
    ('watchlists'),
    ('watchlist_projects'),
    ('user_projects'),
    ('user_tasks')
) as expected(table_name)
join pg_catalog.pg_class as relation
  on relation.oid = pg_catalog.to_regclass(pg_catalog.format('public.%I', expected.table_name));

select results_eq(
  $policy_catalog$
    select
      policy.tablename::text collate "C",
      policy.policyname::text collate "C"
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
    order by policy.tablename, policy.policyname
  $policy_catalog$,
  $expected_policies$
    select
      expected.tablename collate "C",
      expected.policyname collate "C"
    from (
      values
      ('ai_runs'::text, 'ai_runs_ai_stage_worker_insert'::text),
      ('ai_runs'::text, 'ai_runs_ai_stage_worker_write'::text),
      ('collection_attempts'::text, 'collection_attempts_insert_collection_worker'::text),
      ('collection_attempts'::text, 'collection_attempts_select_collection_worker'::text),
      ('discovered_items'::text, 'discovered_items_insert_collection_worker'::text),
      ('discovered_items'::text, 'discovered_items_select_ai_stage_worker'::text),
      ('discovered_items'::text, 'discovered_items_select_collection_worker'::text),
      ('extraction_candidates'::text, 'extraction_candidates_ai_stage_worker_insert'::text),
      ('extraction_candidates'::text, 'extraction_candidates_ai_stage_worker_read'::text),
      ('profiles'::text, 'profiles_select_authenticated'::text),
      ('profiles'::text, 'profiles_update_authenticated'::text),
      ('project_scores'::text, 'project_scores_ai_stage_worker_insert'::text),
      ('project_scores'::text, 'project_scores_ai_stage_worker_read'::text),
      ('project_scores'::text, 'project_scores_select_anon'::text),
      ('project_scores'::text, 'project_scores_select_authenticated'::text),
      ('project_sources'::text, 'project_sources_ai_stage_worker_read'::text),
      ('project_sources'::text, 'project_sources_select_anon'::text),
      ('project_sources'::text, 'project_sources_select_authenticated'::text),
      ('projects'::text, 'projects_ai_stage_worker_read'::text),
      ('projects'::text, 'projects_select_anon'::text),
      ('projects'::text, 'projects_select_authenticated'::text),
      ('promotion_events'::text, 'promotion_events_ai_stage_worker_read'::text),
      ('raw_items'::text, 'raw_items_insert_collection_worker'::text),
      ('raw_items'::text, 'raw_items_select_ai_stage_worker'::text),
      ('raw_items'::text, 'raw_items_select_collection_worker'::text),
      ('score_factors'::text, 'score_factors_ai_stage_worker_insert'::text),
      ('score_factors'::text, 'score_factors_ai_stage_worker_read'::text),
      ('score_signal_links'::text, 'score_signal_links_ai_stage_worker_insert'::text),
      ('score_signal_links'::text, 'score_signal_links_ai_stage_worker_read'::text),
      ('signals'::text, 'signals_ai_stage_worker_read'::text),
      ('signals'::text, 'signals_select_anon'::text),
      ('signals'::text, 'signals_select_authenticated'::text),
      ('sources'::text, 'sources_select_anon'::text),
      ('sources'::text, 'sources_select_authenticated'::text),
      ('user_projects'::text, 'user_projects_delete_authenticated'::text),
      ('user_projects'::text, 'user_projects_insert_authenticated'::text),
      ('user_projects'::text, 'user_projects_select_authenticated'::text),
      ('user_projects'::text, 'user_projects_update_authenticated'::text),
      ('user_roles'::text, 'user_roles_select_authenticated'::text),
      ('user_tasks'::text, 'user_tasks_delete_authenticated'::text),
      ('user_tasks'::text, 'user_tasks_insert_authenticated'::text),
      ('user_tasks'::text, 'user_tasks_select_authenticated'::text),
      ('watchlist_projects'::text, 'watchlist_projects_delete_authenticated'::text),
      ('watchlist_projects'::text, 'watchlist_projects_insert_authenticated'::text),
      ('watchlist_projects'::text, 'watchlist_projects_select_authenticated'::text),
      ('watchlists'::text, 'watchlists_delete_authenticated'::text),
      ('watchlists'::text, 'watchlists_insert_authenticated'::text),
      ('watchlists'::text, 'watchlists_select_authenticated'::text),
      ('watchlists'::text, 'watchlists_update_authenticated'::text)
    ) as expected(tablename, policyname)
  $expected_policies$,
  'the public policy catalog is the exact consolidated matrix'
);

select results_eq(
  $$
    select policy.tablename::text collate "C", policy.policyname::text collate "C"
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and (
        pg_catalog.cardinality(policy.roles) <> 1
        or policy.policyname <> pg_catalog.format(
          '%s_%s_%s', policy.tablename, pg_catalog.lower(policy.cmd), policy.roles[1]
        )
      )
    order by policy.tablename, policy.policyname
  $$,
  $$
    select expected.tablename collate "C", expected.policyname collate "C"
    from (values
      ('ai_runs'::text, 'ai_runs_ai_stage_worker_insert'::text),
      ('ai_runs', 'ai_runs_ai_stage_worker_write'),
      ('extraction_candidates', 'extraction_candidates_ai_stage_worker_insert'),
      ('extraction_candidates', 'extraction_candidates_ai_stage_worker_read'),
      ('project_scores', 'project_scores_ai_stage_worker_insert'),
      ('project_scores', 'project_scores_ai_stage_worker_read'),
      ('project_sources', 'project_sources_ai_stage_worker_read'),
      ('projects', 'projects_ai_stage_worker_read'),
      ('promotion_events', 'promotion_events_ai_stage_worker_read'),
      ('score_factors', 'score_factors_ai_stage_worker_insert'),
      ('score_factors', 'score_factors_ai_stage_worker_read'),
      ('score_signal_links', 'score_signal_links_ai_stage_worker_insert'),
      ('score_signal_links', 'score_signal_links_ai_stage_worker_read'),
      ('signals', 'signals_ai_stage_worker_read')
    ) as expected(tablename, policyname)
    order by expected.tablename, expected.policyname
  $$,
  'the exact legacy AI-stage policy names are the only naming-convention exceptions'
);

select results_eq(
  $$
    select relation.relname::text collate "C", policy.polname::text collate "C"
    from pg_catalog.pg_policy as policy
    join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and nullif(pg_catalog.btrim(pg_catalog.obj_description(policy.oid, 'pg_policy')), '') is null
    order by relation.relname, policy.polname
  $$,
  $$
    select expected.tablename collate "C", expected.policyname collate "C"
    from (values
      ('ai_runs'::text, 'ai_runs_ai_stage_worker_insert'::text),
      ('ai_runs', 'ai_runs_ai_stage_worker_write'),
      ('discovered_items', 'discovered_items_select_ai_stage_worker'),
      ('extraction_candidates', 'extraction_candidates_ai_stage_worker_insert'),
      ('extraction_candidates', 'extraction_candidates_ai_stage_worker_read'),
      ('project_scores', 'project_scores_ai_stage_worker_insert'),
      ('project_scores', 'project_scores_ai_stage_worker_read'),
      ('project_sources', 'project_sources_ai_stage_worker_read'),
      ('projects', 'projects_ai_stage_worker_read'),
      ('promotion_events', 'promotion_events_ai_stage_worker_read'),
      ('raw_items', 'raw_items_select_ai_stage_worker'),
      ('score_factors', 'score_factors_ai_stage_worker_insert'),
      ('score_factors', 'score_factors_ai_stage_worker_read'),
      ('score_signal_links', 'score_signal_links_ai_stage_worker_insert'),
      ('score_signal_links', 'score_signal_links_ai_stage_worker_read'),
      ('signals', 'signals_ai_stage_worker_read')
    ) as expected(tablename, policyname)
    order by expected.tablename, expected.policyname
  $$,
  'the exact later AI-stage policies are the only intentionally uncommented policies'
);

select ok(
  pg_catalog.pg_get_userbyid(view_relation.relowner) = 'postgres'
    and coalesce(view_relation.reloptions, '{}'::text[]) @> array[
      'security_invoker=true',
      'security_barrier=true'
    ]::text[],
  pg_catalog.format('%s is postgres-owned security-invoker and security-barrier', expected.view_name)
)
from (values ('project_current_state'), ('opportunity_list')) as expected(view_name)
join pg_catalog.pg_class as view_relation
  on view_relation.oid = pg_catalog.to_regclass(pg_catalog.format('public.%I', expected.view_name));

select columns_are(
  'public',
  'project_current_state',
  array[
    'project_id',
    'slug',
    'name',
    'summary',
    'lifecycle',
    'primary_chain',
    'project_version',
    'project_updated_at',
    'opportunity_score',
    'risk_score',
    'score_confidence',
    'recommendation',
    'score_calculated_at',
    'latest_published_signal_at',
    'official_website_url',
    'score_model_version',
    'score_input_version',
    'score_explanation'
  ],
  'project_current_state has the exact project-detail state columns'
);
select columns_are(
  'public',
  'opportunity_list',
  array[
    'project_id',
    'slug',
    'name',
    'summary',
    'lifecycle',
    'primary_chain',
    'opportunity_score',
    'risk_score',
    'confidence',
    'recommendation',
    'calculated_at',
    'latest_published_signal_at'
  ],
  'opportunity_list has only the explicit browser-safe opportunity columns'
);

select ok(
  has_table_privilege('anon', pg_catalog.format('public.%I', expected.view_name), 'SELECT')
    and has_table_privilege('authenticated', pg_catalog.format('public.%I', expected.view_name), 'SELECT')
    and has_table_privilege('service_role', pg_catalog.format('public.%I', expected.view_name), 'SELECT') = expected.service_can_select
    and not exists (
      select 1
      from pg_catalog.aclexplode(view_relation.relacl) as exploded_acl
      where exploded_acl.grantee = 0
        and exploded_acl.privilege_type = 'SELECT'
    ),
  pg_catalog.format('%s has the exact browser and support-role SELECT grants', expected.view_name)
)
from (values ('project_current_state', true), ('opportunity_list', false)) as expected(view_name, service_can_select)
join pg_catalog.pg_class as view_relation
  on view_relation.oid = pg_catalog.to_regclass(pg_catalog.format('public.%I', expected.view_name));

select ok(
  not has_table_privilege('anon', pg_catalog.format('public.%I', expected.view_name), 'INSERT,UPDATE,DELETE,TRUNCATE')
    and not has_table_privilege('authenticated', pg_catalog.format('public.%I', expected.view_name), 'INSERT,UPDATE,DELETE,TRUNCATE')
    and not has_table_privilege('service_role', pg_catalog.format('public.%I', expected.view_name), 'INSERT,UPDATE,DELETE,TRUNCATE'),
  pg_catalog.format('%s grants no view mutation path', expected.view_name)
)
from (values ('project_current_state'), ('opportunity_list')) as expected(view_name);

select results_eq(
  $actual_acl$
    select
      principal.role_name collate "C",
      column_info.column_name::text collate "C",
      has_column_privilege(
        principal.role_name,
        'public.project_scores',
        column_info.column_name,
        'SELECT'
      )
    from (
      values ('anon'::text, 1), ('authenticated'::text, 2)
    ) as principal(role_name, role_order)
    cross join information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'project_scores'
    order by principal.role_order, column_info.ordinal_position
  $actual_acl$,
  $expected_acl$
    select
      expected.role_name collate "C",
      expected.column_name collate "C",
      expected.can_select
    from (
      values
        ('anon'::text, 'id'::text, true),
        ('anon'::text, 'project_id'::text, true),
        ('anon'::text, 'model_version'::text, true),
        ('anon'::text, 'input_version'::text, true),
        ('anon'::text, 'opportunity_score'::text, true),
        ('anon'::text, 'risk_score'::text, true),
        ('anon'::text, 'confidence'::text, true),
        ('anon'::text, 'recommendation'::text, true),
        ('anon'::text, 'explanation'::text, true),
        ('anon'::text, 'calculated_at'::text, true),
        ('anon'::text, 'created_at'::text, false),
        ('authenticated'::text, 'id'::text, true),
        ('authenticated'::text, 'project_id'::text, true),
        ('authenticated'::text, 'model_version'::text, true),
        ('authenticated'::text, 'input_version'::text, true),
        ('authenticated'::text, 'opportunity_score'::text, true),
        ('authenticated'::text, 'risk_score'::text, true),
        ('authenticated'::text, 'confidence'::text, true),
        ('authenticated'::text, 'recommendation'::text, true),
        ('authenticated'::text, 'explanation'::text, true),
        ('authenticated'::text, 'calculated_at'::text, true),
        ('authenticated'::text, 'created_at'::text, false)
    ) as expected(role_name, column_name, can_select)
  $expected_acl$,
  'anon and authenticated have the exact ten-readable one-restricted project score column ACL matrix'
);

select ok(
  to_regclass('public.project_scores_project_id_calculated_at_id_idx') is not null
    and to_regclass('public.signals_lifecycle_published_at_idx') is not null,
  'read models retain the score and published-signal indexes required by their access paths'
);

create function pg_temp.explain_lines(statement text)
returns setof text
language plpgsql
set search_path = pg_catalog
as $$
declare
  plan_line text;
begin
  for plan_line in execute pg_catalog.format('explain (costs off) %s', statement)
  loop
    return next plan_line;
  end loop;
end;
$$;

set local enable_seqscan = off;

select ok(
  (
    select pg_catalog.string_agg(plan_line, E'\n')
    from pg_temp.explain_lines(
      'select * from public.project_scores where project_id = ''10000000-0000-4000-8000-000000000001'' order by calculated_at desc, id desc limit 1'
    ) as explained(plan_line)
  ) like '%project_scores_project_id_calculated_at_id_idx%',
  'latest-score lookup can use the deterministic score index'
);
select ok(
  (
    select pg_catalog.string_agg(plan_line, E'\n')
    from pg_temp.explain_lines(
      'select published_at from public.signals where lifecycle = ''published'' order by published_at desc limit 1'
    ) as explained(plan_line)
  ) like '%signals_lifecycle_published_at_idx%',
  'latest-published-signal lookup can use the lifecycle publication index'
);

reset enable_seqscan;

select ok(
  not has_any_column_privilege('anon', pg_catalog.format('public.%I', expected.table_name), 'INSERT,UPDATE')
    and not has_table_privilege('anon', pg_catalog.format('public.%I', expected.table_name), 'DELETE,TRUNCATE'),
  pg_catalog.format('anonymous users cannot mutate %s', expected.table_name)
)
from (
  values
    ('profiles'),
    ('user_roles'),
    ('projects'),
    ('sources'),
    ('project_sources'),
    ('signals'),
    ('project_scores'),
    ('watchlists'),
    ('watchlist_projects'),
    ('user_projects'),
    ('user_tasks')
) as expected(table_name);

select ok(
  not has_any_column_privilege('service_role', pg_catalog.format('public.%I', expected.table_name), 'INSERT,UPDATE')
    and not has_table_privilege('service_role', pg_catalog.format('public.%I', expected.table_name), 'DELETE,TRUNCATE'),
  pg_catalog.format('service role cannot mutate canonical %s', expected.table_name)
)
from (
  values
    ('projects'),
    ('sources'),
    ('project_sources'),
    ('signals'),
    ('project_scores'),
    ('profiles')
) as expected(table_name);

select ok(
  not has_any_column_privilege('service_role', pg_catalog.format('public.%I', expected.table_name), 'SELECT'),
  pg_catalog.format('service role has no private support read on %s', expected.table_name)
)
from (
  values ('watchlists'), ('watchlist_projects'), ('user_projects'), ('user_tasks')
) as expected(table_name);

select ok(
  not has_function_privilege(
    'service_role',
    'public.update_user_task(uuid,bigint,jsonb)',
    'EXECUTE'
  ),
  'service role has no private task support command'
);

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '60000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'read-model-user@example.invalid',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-08-09 00:00:00+00',
    '2026-08-09 00:00:00+00'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'read-model-admin@example.invalid',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-08-09 00:00:00+00',
    '2026-08-09 00:00:00+00'
  ),
  (
    '60000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'read-model-victim@example.invalid',
    '{"provider":"email","providers":["email"]}',
    '{}',
    '2026-08-09 00:00:00+00',
    '2026-08-09 00:00:00+00'
  );

insert into public.user_roles (user_id, role, granted_by, granted_at)
values (
  '60000000-0000-4000-8000-000000000002',
  'admin',
  '60000000-0000-4000-8000-000000000002',
  '2026-08-09 00:00:00+00'
);

insert into public.projects (id, slug, name, summary, lifecycle, primary_chain, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'active-read-model', 'Active Read Model', 'Active fixture', 'active', 'Ethereum', '2026-08-09 01:00:00+00', '2026-08-09 01:00:00+00'),
  ('10000000-0000-4000-8000-000000000002', 'rumored-read-model', 'Rumored Read Model', 'Rumored fixture', 'rumored', 'Base', '2026-08-09 01:00:00+00', '2026-08-09 01:00:00+00'),
  ('10000000-0000-4000-8000-000000000003', 'paused-read-model', 'Paused Read Model', null, 'paused', null, '2026-08-09 01:00:00+00', '2026-08-09 01:00:00+00'),
  ('10000000-0000-4000-8000-000000000004', 'ended-read-model', 'Ended Read Model', null, 'ended', null, '2026-08-09 01:00:00+00', '2026-08-09 01:00:00+00'),
  ('10000000-0000-4000-8000-000000000005', 'archived-read-model', 'Archived Read Model', null, 'archived', null, '2026-08-09 01:00:00+00', '2026-08-09 01:00:00+00'),
  ('10000000-0000-4000-8000-000000000006', 'unscored-read-model', 'Unscored Read Model', null, 'active', null, '2026-08-09 01:00:00+00', '2026-08-09 01:00:00+00'),
  ('10000000-0000-4000-8000-000000000007', 'time-order-read-model', 'Time Order Read Model', null, 'active', null, '2026-08-09 01:00:00+00', '2026-08-09 01:00:00+00'),
  ('10000000-0000-4000-8000-000000000009', 'equal-score-later-id', 'Equal Score Later ID', null, 'active', null, '2026-08-09 01:00:00+00', '2026-08-09 01:00:00+00'),
  ('10000000-0000-4000-8000-000000000008', 'equal-score-earlier-id', 'Equal Score Earlier ID', null, 'active', null, '2026-08-09 01:00:00+00', '2026-08-09 01:00:00+00');

insert into public.project_scores (
  id, project_id, model_version, input_version, opportunity_score, risk_score,
  confidence, recommendation, explanation, calculated_at, created_at
)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'model-v1', 'active-low-id', 10, 90, 20, 'research', 'Lower UUID at tied time.', '2026-08-09 02:00:00+00', '2026-08-09 02:00:00+00'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'model-v1', 'active-high-id', 90, 40, 80, 'act_now', 'Higher UUID wins tied time.', '2026-08-09 02:00:00+00', '2026-08-09 02:00:00+00'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'model-v1', 'rumored', 80, 30, 70, 'watch', 'Rumored score.', '2026-08-09 02:10:00+00', '2026-08-09 02:10:00+00'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'model-v1', 'paused', 100, 10, 90, 'act_now', 'Paused score.', '2026-08-09 02:20:00+00', '2026-08-09 02:20:00+00'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', 'model-v1', 'ended', 99, 10, 90, 'act_now', 'Ended score.', '2026-08-09 02:20:00+00', '2026-08-09 02:20:00+00'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', 'model-v1', 'archived', 98, 10, 90, 'act_now', 'Archived score.', '2026-08-09 02:20:00+00', '2026-08-09 02:20:00+00'),
  ('2fffffff-ffff-4fff-8fff-ffffffffffff', '10000000-0000-4000-8000-000000000007', 'model-v1', 'older-large-id', 15, 50, 60, 'research', 'Older score has the larger UUID.', '2026-08-09 02:00:00+00', '2026-08-09 02:00:00+00'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000007', 'model-v1', 'newer-small-id', 75, 30, 80, 'watch', 'Newer score has the smaller UUID.', '2026-08-09 02:01:00+00', '2026-08-09 02:01:00+00'),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'model-v1', 'equal-later-id', 70, 20, 80, 'watch', 'Equal opportunity later project ID.', '2026-08-09 02:30:00+00', '2026-08-09 02:30:00+00'),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000008', 'model-v1', 'equal-earlier-id', 70, 20, 80, 'watch', 'Equal opportunity earlier project ID.', '2026-08-09 02:30:00+00', '2026-08-09 02:30:00+00');

insert into public.signals (
  id, project_id, signal_type, title, summary, lifecycle, confidence, published_at, created_at
)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'first', 'First publication', 'Earlier public signal.', 'published', 80, '2026-08-09 03:00:00+00', '2026-08-09 03:00:00+00'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'latest', 'Latest publication', 'Latest public signal.', 'published', 80, '2026-08-09 03:10:00+00', '2026-08-09 03:10:00+00'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'private', 'Unpublished candidate', 'Must not affect public time.', 'detected', 80, null, '2026-08-09 03:20:00+00'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'rumored', 'Rumored publication', 'Existing signal policy keeps this hidden.', 'published', 80, '2026-08-09 03:30:00+00', '2026-08-09 03:30:00+00');

insert into public.watchlists (id, user_id, name, is_default)
values ('40000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', 'Victim List', true);
insert into public.watchlist_projects (watchlist_id, project_id)
values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
insert into public.user_projects (user_id, project_id, participation_status, notes)
values ('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'researching', 'Victim private notes');
insert into public.user_tasks (id, user_id, project_id, title)
values ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Victim private task');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select project_id from public.project_current_state order by project_id$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid), ('10000000-0000-4000-8000-000000000002'::uuid), ('10000000-0000-4000-8000-000000000006'::uuid), ('10000000-0000-4000-8000-000000000007'::uuid), ('10000000-0000-4000-8000-000000000008'::uuid), ('10000000-0000-4000-8000-000000000009'::uuid)$$,
  'project current state respects active and rumored project visibility'
);
select is(
  (select opportunity_score from public.project_current_state where project_id = '10000000-0000-4000-8000-000000000001'),
  90.00::numeric,
  'latest score breaks calculated-at ties by descending score id'
);
select is(
  (select opportunity_score from public.project_current_state where project_id = '10000000-0000-4000-8000-000000000007'),
  75.00::numeric,
  'latest score prefers newer calculated time even when its score id is smaller'
);
select is(
  (select latest_published_signal_at from public.project_current_state where project_id = '10000000-0000-4000-8000-000000000001'),
  '2026-08-09 03:10:00+00'::timestamptz,
  'project current state selects the latest published signal time'
);
select is(
  (select latest_published_signal_at from public.project_current_state where project_id = '10000000-0000-4000-8000-000000000002'),
  null::timestamptz,
  'rumored project latest signal remains null under the existing active-only signal policy'
);
select results_eq(
  $$select project_id, opportunity_score from public.opportunity_list$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid, 90.00::numeric), ('10000000-0000-4000-8000-000000000002'::uuid, 80.00::numeric), ('10000000-0000-4000-8000-000000000007'::uuid, 75.00::numeric), ('10000000-0000-4000-8000-000000000008'::uuid, 70.00::numeric), ('10000000-0000-4000-8000-000000000009'::uuid, 70.00::numeric)$$,
  'opportunities are scored active or rumored projects in deterministic score and project order'
);
select results_eq(
  $$select id from public.project_scores order by id$$,
  $$values ('20000000-0000-4000-8000-000000000001'::uuid), ('20000000-0000-4000-8000-000000000002'::uuid), ('20000000-0000-4000-8000-000000000003'::uuid), ('20000000-0000-4000-8000-000000000007'::uuid), ('20000000-0000-4000-8000-000000000008'::uuid), ('20000000-0000-4000-8000-000000000009'::uuid), ('2fffffff-ffff-4fff-8fff-ffffffffffff'::uuid)$$,
  'anonymous users can read safe score columns only for active and rumored projects'
);
select is(
  (select count(*)::integer from public.project_scores where model_version is not null),
  7,
  'anonymous model-version reads retain active-or-rumored project RLS'
);
select is(
  (select count(*)::integer from public.project_scores where input_version is not null),
  7,
  'anonymous input-version reads retain active-or-rumored project RLS'
);
select is(
  (select count(*)::integer from public.project_scores where explanation is not null),
  7,
  'anonymous explanation reads retain active-or-rumored project RLS'
);
select throws_like(
  $$delete from public.project_current_state$$,
  '%cannot delete from view%',
  'anonymous users cannot mutate project current state'
);
select throws_like(
  $$delete from public.opportunity_list$$,
  '%cannot delete from view%',
  'anonymous users cannot mutate opportunity list'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.project_scores where model_version is not null),
  7,
  'an authenticated model-version read retains active-or-rumored project RLS'
);

select is((select count(*)::integer from public.watchlists), 0, 'an authenticated user cannot broadly read private watchlists');
select is((select count(*)::integer from public.watchlist_projects), 0, 'an authenticated user cannot broadly read private watchlist projects');
select is((select count(*)::integer from public.user_projects), 0, 'an authenticated user cannot broadly read private user projects');
select is((select count(*)::integer from public.user_tasks), 0, 'an authenticated user cannot broadly read private user tasks');

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is((select count(*)::integer from public.watchlists), 0, 'a browser admin cannot read another user watchlists');
select is((select count(*)::integer from public.watchlist_projects), 0, 'a browser admin cannot read another user watchlist projects');
select is((select count(*)::integer from public.user_projects), 0, 'a browser admin cannot read another user project notes');
select is((select count(*)::integer from public.user_tasks), 0, 'a browser admin cannot read another user tasks');
select results_eq(
  $$select project_id from public.opportunity_list$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid), ('10000000-0000-4000-8000-000000000002'::uuid), ('10000000-0000-4000-8000-000000000007'::uuid), ('10000000-0000-4000-8000-000000000008'::uuid), ('10000000-0000-4000-8000-000000000009'::uuid)$$,
  'a browser admin receives only the public deterministic opportunity list'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select count(*)::integer from public.project_current_state),
  9,
  'service role can read the complete project-current-state support view'
);
select throws_like(
  $$select * from public.opportunity_list$$,
  'permission denied for view opportunity_list',
  'service role receives no opportunity-list view grant'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

select ok(
  not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name in ('project_current_state', 'opportunity_list')
      and column_info.column_name in (
        'notes', 'user_id', 'verified_by', 'canonical_url'
      )
  )
    and not exists (
      select 1
      from information_schema.columns as column_info
      where column_info.table_schema = 'public'
        and column_info.table_name = 'opportunity_list'
        and column_info.column_name in (
          'official_website_url', 'score_model_version', 'score_input_version', 'score_explanation'
        )
    ),
  'read models exclude private provenance fields and keep detail-only fields out of opportunity_list'
);

select * from finish();

rollback;
