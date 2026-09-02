begin;
select plan(11);

-- ---------------------------------------------------------------------------
-- Phase 8 Task 8: tutorial candidate generation boundary (migration 27).
--
-- The generation stage writes `tutorial_candidates` as `ai_stage_worker` and
-- reads the verified-reference projection it is prompted with. Everyone else
-- stays out: the reviewer surface is the protected command RPCs, never a table
-- grant. Idempotency is enforced by the unique (project, kind, content_hash)
-- key, and a generation run may be keyed by tutorial material.
-- ---------------------------------------------------------------------------

-- 1. The candidate table is writeable by the worker role only.
select table_privs_are(
  'public', 'tutorial_candidates', 'ai_stage_worker',
  array['INSERT', 'SELECT'],
  'ai_stage_worker may insert and read tutorial candidates'
);

select is(
  has_table_privilege('anon', 'public.tutorial_candidates', 'SELECT'),
  false,
  'anonymous readers have no direct access to candidates'
);

select is(
  has_table_privilege('authenticated', 'public.tutorial_candidates', 'SELECT'),
  false,
  'authenticated readers have no direct access to candidates'
);

select is(
  has_table_privilege('ai_stage_worker', 'public.tutorial_candidates', 'UPDATE'),
  false,
  'the worker role cannot rewrite a candidate it wrote'
);

select is(
  has_table_privilege('ai_stage_worker', 'public.tutorial_candidates', 'DELETE'),
  false,
  'the worker role cannot delete candidates'
);

-- 2. The allowlist projection is readable by the worker role; the underlying
--    ledger table stays closed to it beyond what the invoker view needs.
select is(
  has_table_privilege('ai_stage_worker', 'public.public_project_references', 'SELECT'),
  true,
  'the worker role can read the verified-reference allowlist projection'
);

select is(
  has_table_privilege('ai_stage_worker', 'public.project_references', 'SELECT'),
  true,
  'the worker role can read the ledger table behind the invoker projection'
);

-- 3. A generation run may be keyed by tutorial material.
select lives_ok(
  $test$
    insert into public.ai_runs (
      stage, input_kind, input_id, input_hash, model_id, prompt_version,
      schema_version, pipeline_version, status, output
    ) values (
      'tutorial_generation', 'tutorial_material',
      '70000000-0000-4000-8000-000000000001',
      repeat('a', 64), 'demo-model', 'v1', 'v1', 'v1', 'succeeded',
      '{"draft":true}'::jsonb
    )
  $test$,
  'ai_runs accepts a tutorial_material input kind'
);

-- 4. Idempotency: the same (project, kind, content_hash) candidate is stored
--    once, so a repeated tick cannot duplicate a draft.
insert into public.projects (id, slug, name, lifecycle)
values ('70000000-0000-4000-8000-000000000002', 'pgtap-tutorial-gen', 'Tutorial Gen Target', 'active');

insert into public.tutorial_candidates (
  id, project_id, kind, payload, source_signal_ids, confidence,
  status, version, content_hash
) values (
  '70000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000002',
  'airdrop_campaign',
  '{"title":"官方空投参与教程","summary":"覆盖从钱包连接到任务领取的完整步骤。","steps":[{"title":"连接钱包","body":"在官方站点连接钱包并切换网络。","links":[]},{"title":"打开领取页","body":"前往官方领取页查看任务。","links":[]}],"sourceSignalIds":["70000000-0000-4000-8000-000000000004"],"confidence":80}'::jsonb,
  array['70000000-0000-4000-8000-000000000004'::uuid],
  80, 'pending', 1,
  repeat('b', 64)
);

select throws_ok(
  $test$
    insert into public.tutorial_candidates (
      id, project_id, kind, payload, source_signal_ids, confidence,
      status, version, content_hash
    ) values (
      '70000000-0000-4000-8000-000000000005',
      '70000000-0000-4000-8000-000000000002',
      'airdrop_campaign',
      '{"title":"官方空投参与教程","summary":"覆盖从钱包连接到任务领取的完整步骤。","steps":[{"title":"连接钱包","body":"在官方站点连接钱包并切换网络。","links":[]},{"title":"打开领取页","body":"前往官方领取页查看任务。","links":[]}],"sourceSignalIds":["70000000-0000-4000-8000-000000000004"],"confidence":80}'::jsonb,
      array['70000000-0000-4000-8000-000000000004'::uuid],
      80, 'pending', 1,
      repeat('b', 64)
    )
  $test$,
  '23505',
  null,
  'a repeated material set cannot insert a duplicate candidate'
);

select results_eq(
  $test$
    select count(*)::int from public.tutorial_candidates
    where project_id = '70000000-0000-4000-8000-000000000002'
  $test$,
  array[1],
  'the idempotent duplicate left exactly one candidate behind'
);

-- 5. The insert policy keeps the worker inside pending v1 rows: an accepted
--    candidate cannot be written directly by the stage.
select results_eq(
  $test$
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tutorial_candidates'
      and cmd = 'INSERT'
      and roles && array['ai_stage_worker']::name[]
  $test$,
  array[1],
  'exactly one insert policy governs worker candidate writes'
);

select * from finish();
rollback;
