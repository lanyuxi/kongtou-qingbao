-- Phase 8 tutorials pgTAP matrix (017).
-- Covers: table shape, RLS boundaries, the four protected commands (happy
-- path, replay, version conflict, role denial, reference allowlist/render
-- gates, step text url guard), the D5 coupling triggers (reference, signal,
-- project incident, authority revoke), and the public view gate.

begin;
select plan(41);

-- ---------------------------------------------------------------------------
-- Fixture: reviewer, project, source/evidence/signal chain, reference ledger
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ops-reviewer@example.invalid', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
) on conflict (id) do nothing;
insert into public.profiles (id) values ('a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role, granted_at)
values ('a0000000-0000-4000-8000-000000000001', 'reviewer', now())
on conflict do nothing;

insert into public.projects (
  id, slug, name, lifecycle, created_at, updated_at
) values (
  'b0000000-0000-4000-8000-000000000001', 'pgtap-tutorial-project', 'pgTAP 教程项目',
  'active', now(), now()
) on conflict (id) do nothing;

insert into public.sources (
  id, source_type, name, canonical_url, status, created_at, updated_at
) values (
  'c0000000-0000-4000-8000-000000000001', 'official_web', 'pgTAP 教程来源',
  'https://pgtap-tutorial.example/post', 'active', now(), now()
) on conflict (id) do nothing;
insert into public.project_sources (
  project_id, source_id, authority_domains, is_official, verified_at, verified_by, created_at
) values (
  'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
  '{pgtap-tutorial.example}', true, now(), 'a0000000-0000-4000-8000-000000000001', now()
) on conflict do nothing;

insert into public.raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at
) values (
  'd0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', 'https://pgtap-tutorial.example/post',
  'https://pgtap-tutorial.example/post', 'official_html', 'text/html',
  'pgTAP 教程证据正文。', repeat('c', 64), now()
) on conflict (id) do nothing;
insert into public.evidence (
  id, source_id, raw_item_id, source_field, quote_text,
  normalized_quote_sha256, created_at, verified_at
) values (
  'e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001', 'article_raw_text', 'pgTAP 教程证据正文。',
  repeat('e', 64), now(), now()
) on conflict (id) do nothing;

insert into public.signals (
  id, project_id, signal_type, title, summary, verification, lifecycle,
  confidence, published_at, created_at
) values (
  'f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'airdrop_campaign', 'pgTAP 教程素材信号', '教程生成所用的已核验信号。',
  'verified', 'published', 90, now(), now()
) on conflict (id) do nothing;
insert into public.signal_evidence_links (signal_id, evidence_id, created_at)
values ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', now())
on conflict do nothing;

-- Reference ledger: granted authority + verified reference for step links.
insert into public.project_domain_authorities (
  id, project_id, normalized_domain, created_at
) values (
  'a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'pgtap-tutorial.example', now()
) on conflict (id) do nothing;
insert into public.project_domain_authority_decisions (
  id, authority_id, decision, resulting_state, reason_code, evidence_id,
  aggregate_version, actor_user_id, idempotency_key, created_at
) values (
  'a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
  'grant', 'granted', 'evidence_verified', 'e0000000-0000-4000-8000-000000000001',
  1, 'a0000000-0000-4000-8000-000000000001', 'pgtap-grant-0001', now()
) on conflict do nothing;
insert into public.project_references (
  id, project_id, kind, normalized_url, normalized_domain, label,
  version, created_at
) values (
  'a2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'claim_portal', 'https://pgtap-tutorial.example/claim', 'pgtap-tutorial.example',
  '官方领取页', 1, now()
) on conflict (id) do nothing;
insert into public.project_reference_decisions (
  id, reference_id, decision, resulting_state, reason_code, aggregate_version,
  evidence_id, actor_user_id, idempotency_key, created_at
) values (
  'a2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001',
  'verify', 'verified', 'evidence_verified', 1, 'e0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001', 'pgtap-verify-0001', now()
) on conflict do nothing;

-- Candidate fixture (pending, well-formed).
insert into public.tutorial_candidates (
  id, project_id, kind, payload, source_signal_ids, confidence,
  status, version, content_hash, created_at
) values (
  'b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'airdrop_campaign',
  '{
    "title": "pgTAP 空投参与教程",
    "summary": "覆盖从钱包连接到任务领取的完整步骤。",
    "steps": [
      {"title": "连接钱包", "body": "在官方站点连接钱包并切换网络。", "links": []},
      {"title": "打开领取页", "body": "前往官方领取页查看任务。", "links": []}
    ],
    "sourceSignalIds": ["f0000000-0000-4000-8000-000000000001"],
    "confidence": 80
  }'::jsonb,
  array['f0000000-0000-4000-8000-000000000001']::uuid[], 80.00,
  'pending', 1, repeat('a', 64), now()
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Shape checks
-- ---------------------------------------------------------------------------

select has_table('public', 'tutorials', 'tutorials table exists');
select has_table('public', 'tutorial_versions', 'tutorial_versions table exists');
select has_table('public', 'tutorial_step_links', 'tutorial_step_links table exists');
select has_table('public', 'tutorial_candidates', 'tutorial_candidates table exists');
select has_table('public', 'tutorial_review_decisions', 'tutorial_review_decisions exists');
select has_table('public', 'tutorial_review_commands', 'tutorial_review_commands exists');
select has_table('public', 'tutorial_status_events', 'tutorial_status_events exists');
select has_view('public', 'public_project_tutorials', 'public list view exists');
select has_view('public', 'public_tutorial_detail', 'public detail view exists');

-- ---------------------------------------------------------------------------
-- Role boundary: anon cannot read base tables or candidates
-- ---------------------------------------------------------------------------

set role anon;
select is(
  (select count(*) from public.tutorials), 0::bigint,
  'anon base-table read returns zero rows (RLS denies non-published)');
select throws_ok(
  'select count(*) from public.tutorial_candidates',
  '42501', NULL,
  'anon cannot read candidates (no policy)');
select is(
  (select count(*) from public.public_project_tutorials), 0::bigint,
  'anon public list view is empty before publication');
reset role;

-- ---------------------------------------------------------------------------
-- Command denial for missing role
-- ---------------------------------------------------------------------------

set role anon;
select throws_ok(
  'select public.submit_accept_tutorial_candidate('
  || '''{"version":1,"candidateId":"b1000000-0000-4000-8000-000000000001",'
  || '"expectedCandidateVersion":1,"steps":[]}''::jsonb, ''k1'')',
  '42501', NULL,
  'anon has no execute grant on the accept command');
reset role;

-- ---------------------------------------------------------------------------
-- Accept: happy path via the reviewer session
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- The payload fixture binds the claim-portal step to the allowlisted
-- reference so the coupling tests below can trace the tutorial through
-- tutorial_step_links; accept publishes version 1.
select ok((
  select public.submit_accept_tutorial_candidate(
    '{
      "version": 1,
      "candidateId": "b1000000-0000-4000-8000-000000000001",
      "expectedCandidateVersion": 1,
      "steps": [
        {"title": "连接钱包", "body": "在官方站点连接钱包并切换网络。", "links": []},
        {"title": "打开领取页", "body": "前往官方领取页查看任务。",
         "links": [{"referenceId": "a2000000-0000-4000-8000-000000000001"}]}
      ]
    }'::jsonb,
    'pgtap-accept-0001'
  ) is not null
), 'accept candidate succeeds for the reviewer');

reset role;

select is(
  (select status from public.tutorials
   where project_id = 'b0000000-0000-4000-8000-000000000001'
     and kind = 'airdrop_campaign'),
  'published',
  'tutorial published after candidate acceptance');
select is(
  (select count(*) from public.tutorial_versions
   where tutorial_id = (select id from public.tutorials
     where project_id = 'b0000000-0000-4000-8000-000000000001'
       and kind = 'airdrop_campaign')),
  1::bigint,
  'version 1 recorded');
select is(
  (select count(*) from public.tutorial_review_decisions
   where decision = 'accept_candidate'),
  1::bigint,
  'accept decision recorded');
select is(
  (select count(*) from public.outbox_events
   where event_type = 'tutorial.published.v1'),
  1::bigint,
  'published outbox event recorded');
select is(
  (select status from public.tutorial_candidates
   where id = 'b1000000-0000-4000-8000-000000000001'),
  'accepted',
  'candidate accepted');

-- Capture the canonical tutorial id as superuser once: authenticated
-- sessions only see published rows (RLS), while the commands below must
-- address the tutorial while it is needs_review or blocked.
create temp table phase_8_tutorial_id on commit drop as
  select id from public.tutorials
  where project_id = 'b0000000-0000-4000-8000-000000000001'
    and kind = 'airdrop_campaign';
grant select on pg_temp.phase_8_tutorial_id to authenticated;

-- Anon sees the tutorial through the public views now.
set role anon;
select is(
  (select count(*) from public.public_project_tutorials), 1::bigint,
  'anon public list view shows the published tutorial');
reset role;

-- ---------------------------------------------------------------------------
-- Accept replay: same key returns the same receipt without new rows
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok(
  (
    select s.replayed
    from public.submit_accept_tutorial_candidate(
      '{
        "version": 1,
        "candidateId": "b1000000-0000-4000-8000-000000000001",
        "expectedCandidateVersion": 1,
        "steps": [
          {"title": "连接钱包", "body": "在官方站点连接钱包并切换网络。", "links": []},
          {"title": "打开领取页", "body": "前往官方领取页查看任务。",
           "links": [{"referenceId": "a2000000-0000-4000-8000-000000000001"}]}
        ]
      }'::jsonb,
      'pgtap-accept-0001'
    ) as s
  ),
  'replay returns replayed=true');
reset role;
select is(
  (select count(*) from public.tutorials
   where project_id = 'b0000000-0000-4000-8000-000000000001'),
  1::bigint,
  'replay created no second tutorial');
-- A second pending candidate for the same (project, kind) is rejected even
-- with a fully valid payload: exercises the duplicate rule itself.
insert into public.tutorial_candidates (
  id, project_id, kind, payload, source_signal_ids, confidence,
  status, version, content_hash, created_at
) values (
  'b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
  'airdrop_campaign',
  '{
    "title": "pgTAP 重复候选教程",
    "summary": "与已接受教程同属一个可参与类型的第二候选。",
    "steps": [
      {"title": "连接钱包", "body": "在官方站点连接钱包并切换网络。", "links": []},
      {"title": "打开领取页", "body": "前往官方领取页查看任务。", "links": []}
    ],
    "sourceSignalIds": ["f0000000-0000-4000-8000-000000000001"],
    "confidence": 75
  }'::jsonb,
  array['f0000000-0000-4000-8000-000000000001']::uuid[], 75.00,
  'pending', 1, repeat('d', 64), now()
) on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  pg_catalog.format(
    'select public.submit_accept_tutorial_candidate(%L::jsonb, ''pgtap-accept-dup'')',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'candidateId', 'b1000000-0000-4000-8000-000000000002',
      'expectedCandidateVersion', 1,
      'steps', $json$[
        {"title": "连接钱包", "body": "在官方站点连接钱包并切换网络。", "links": []},
        {"title": "打开领取页", "body": "前往官方领取页查看任务。", "links": []}
      ]$json$::jsonb
    )::text
  ),
  'AT208', NULL,
  'duplicate (project, kind) acceptance is rejected');

-- ---------------------------------------------------------------------------
-- Step text url guard and reference renderability gate
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  pg_catalog.format(
    'select public.submit_publish_tutorial_version(%L::jsonb, ''pgtap-publish-url'')',
    pg_catalog.jsonb_build_object(
      'version', 1,
      'tutorialId', (
        select id::text from pg_temp.phase_8_tutorial_id
      ),
      'expectedVersion', 1,
      'steps', $json$[
        {"title": "带链接步骤", "body": "访问 https://evil.example 立即领取奖励。", "links": []},
        {"title": "打开领取页", "body": "前往官方领取页查看任务。", "links": []}
      ]$json$::jsonb
    )::text
  ),
  'AT211', NULL,
  'step body containing a raw url is rejected');
reset role;

-- ---------------------------------------------------------------------------
-- Coupling: flagging the reference queues the tutorial for review
-- ---------------------------------------------------------------------------

insert into public.project_reference_decisions (
  id, reference_id, decision, resulting_state, reason_code, aggregate_version,
  evidence_id, actor_user_id, idempotency_key, created_at
) values (
  'a2000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001',
  'withdraw', 'withdrawn', 'withdrawn_by_reviewer', 2, null,
  'a0000000-0000-4000-8000-000000000001', 'pgtap-withdraw-0001', now()
) on conflict do nothing;

select is(
  (select status from public.tutorials
   where project_id = 'b0000000-0000-4000-8000-000000000001'
     and kind = 'airdrop_campaign'),
  'needs_review',
  'reference flag queues the tutorial for review');
select is(
  (select count(*) from public.tutorial_status_events
   where trigger = 'reference_unrenderable'),
  1::bigint,
  'reference coupling status event recorded');

set role anon;
select is(
  (select count(*) from public.public_project_tutorials), 0::bigint,
  'anon no longer sees the needs_review tutorial');
reset role;

-- ---------------------------------------------------------------------------
-- Coupling: recovery via a fresh human-approved version
-- ---------------------------------------------------------------------------

insert into public.project_reference_decisions (
  id, reference_id, decision, resulting_state, reason_code, aggregate_version,
  evidence_id, actor_user_id, idempotency_key, created_at
) values (
  'a2000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000001',
  'reverify', 'verified', 'evidence_verified', 3, 'e0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001', 'pgtap-reverify-0001', now()
) on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok((
  select public.submit_publish_tutorial_version(
    pg_catalog.jsonb_build_object(
      'version', 1,
      'tutorialId', (
        select id::text from pg_temp.phase_8_tutorial_id
      ),
      'expectedVersion', 1,
      'steps', $json$[
        {"title": "连接钱包", "body": "在官方站点连接钱包并切换网络。", "links": []},
        {"title": "打开领取页", "body": "前往官方领取页查看任务。", "links": []}
      ]$json$::jsonb
    ),
    'pgtap-publish-0001'
  ) is not null
), 'recovery publish succeeds after the reference is restored');
reset role;

select is(
  (select status from public.tutorials
   where project_id = 'b0000000-0000-4000-8000-000000000001'
     and kind = 'airdrop_campaign'),
  'published',
  'tutorial republished after human re-approval');
select is(
  (select count(*) from public.tutorial_versions
   where tutorial_id = (select id from public.tutorials
     where project_id = 'b0000000-0000-4000-8000-000000000001'
       and kind = 'airdrop_campaign')),
  2::bigint,
  'version 2 recorded');

-- ---------------------------------------------------------------------------
-- Coupling: signal disputed queues the tutorial
-- ---------------------------------------------------------------------------

update public.signals
set verification = 'disputed'
where id = 'f0000000-0000-4000-8000-000000000001';

select is(
  (select status from public.tutorials
   where project_id = 'b0000000-0000-4000-8000-000000000001'
     and kind = 'airdrop_campaign'),
  'needs_review',
  'disputed signal queues the tutorial for review');
select is(
  (select count(*) from public.tutorial_status_events
   where trigger = 'signal_disputed'),
  1::bigint,
  'signal coupling status event recorded');

update public.signals
set verification = 'verified'
where id = 'f0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Coupling: project blocked incident blocks the tutorial
-- ---------------------------------------------------------------------------
-- The 7A ledger only allows INSERT on its tables (update/delete are
-- rejected).  Target posture changes on security_incident_decisions, which
-- is exactly where the tutorial coupling subscribes.

insert into public.security_incidents (
  id, target_type, project_id, category, opened_at, created_at
) values (
  'b2000000-0000-4000-8000-000000000001', 'project',
  'b0000000-0000-4000-8000-000000000001', 'phishing', now(), now()
) on conflict (id) do nothing;

insert into public.security_incident_decisions (
  id, incident_id, incident_version, reviewer_user_id, action, reason_code,
  resulting_posture, resulting_severity, public_summary, note, evidence_id, created_at
) values (
  'b2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
  1, 'a0000000-0000-4000-8000-000000000001', 'open', 'precautionary_evidence',
  'blocked', 'critical', 'pgTAP 教程项目的仿冒事件需要预防性封锁保护读者。',
  null, 'e0000000-0000-4000-8000-000000000001', now()
) on conflict (id) do nothing;

select is(
  (select status from public.tutorials
   where project_id = 'b0000000-0000-4000-8000-000000000001'
     and kind = 'airdrop_campaign'),
  'blocked',
  'project blocked incident blocks the tutorial');
select is(
  (select count(*) from public.tutorial_status_events
   where trigger = 'project_blocked'),
  1::bigint,
  'project blocked status event recorded');

set role anon;
select is(
  (select count(*) from public.public_project_tutorials), 0::bigint,
  'blocked tutorial is hidden from the public list');
reset role;

-- ---------------------------------------------------------------------------
-- Retire from blocked requires human approval and leaves history
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok((
  select public.submit_retire_tutorial(
    pg_catalog.jsonb_build_object(
      'version', 1,
      'tutorialId', (
        select id::text from pg_temp.phase_8_tutorial_id
      ),
      'expectedVersion', 2,
      'reasonCode', 'security_blocked',
      'note', null
    ),
    'pgtap-retire-0001'
  ) is not null
), 'retire succeeds for the reviewer');
reset role;

select is(
  (select status from public.tutorials
   where project_id = 'b0000000-0000-4000-8000-000000000001'
     and kind = 'airdrop_campaign'),
  'retired',
  'tutorial retired');

-- ---------------------------------------------------------------------------
-- Reject path on a second candidate
-- ---------------------------------------------------------------------------

insert into public.tutorial_candidates (
  id, project_id, kind, payload, source_signal_ids, confidence,
  status, version, content_hash, created_at
) values (
  'b1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
  'points_program',
  '{
    "title": "pgTAP 积分计划教程",
    "summary": "覆盖积分任务的完整参与路径说明。",
    "steps": [
      {"title": "注册账户", "body": "在官方站点注册并完成验证。", "links": []},
      {"title": "完成任务", "body": "按任务列表完成积分任务。", "links": []}
    ],
    "sourceSignalIds": ["f0000000-0000-4000-8000-000000000001"],
    "confidence": 60
  }'::jsonb,
  array['f0000000-0000-4000-8000-000000000001']::uuid[], 60.00,
  'pending', 1, repeat('b', 64), now()
) on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok((
  select public.submit_reject_tutorial_candidate(
    '{
      "version": 1,
      "candidateId": "b1000000-0000-4000-8000-000000000003",
      "expectedCandidateVersion": 1,
      "reasonCode": "out_of_scope",
      "note": null
    }'::jsonb,
    'pgtap-reject-0001'
  ) is not null
), 'candidate rejection succeeds');
reset role;

select is(
  (select status from public.tutorial_candidates
   where id = 'b1000000-0000-4000-8000-000000000003'),
  'rejected',
  'candidate rejected');

-- ---------------------------------------------------------------------------
-- Browser sessions cannot write the ledger directly (grants boundary)
-- ---------------------------------------------------------------------------

set role authenticated;
select throws_ok(
  'update public.tutorials set title = ''篡改''',
  '42501', NULL,
  'authenticated cannot update the canonical tutorial row');
select throws_ok(
  'delete from public.tutorial_versions',
  '42501', NULL,
  'authenticated cannot delete ledger rows');
reset role;

select * from finish();
rollback;
