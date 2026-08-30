begin;

select no_plan();

-- Task 4 corrects the reviewer boundary without rewriting the already-reset
-- Phase 7B foundation migration. These catalog assertions intentionally fail
-- against the 23-migration baseline and become the first database RED proof.

select has_column(
  'public',
  'project_domain_authority_decisions',
  'note',
  'domain authority decisions retain bounded internal notes'
);

select has_column(
  'public',
  'project_reference_decisions',
  'note',
  'reference decisions retain bounded internal notes'
);

select has_function(
  'public',
  'list_reference_review_items',
  array['uuid', 'text', 'timestamp with time zone', 'uuid', 'integer'],
  'the bearer-scoped reference review list RPC exists'
);

select has_function(
  'public',
  'get_reference_review_detail',
  array['uuid'],
  'the bearer-scoped reference review detail RPC exists'
);

select has_function(
  'public',
  'list_domain_authority_review_items',
  array['uuid', 'text', 'timestamp with time zone', 'uuid', 'integer'],
  'the bearer-scoped domain authority review list RPC exists'
);

select has_function(
  'public',
  'get_domain_authority_review_detail',
  array['uuid'],
  'the bearer-scoped domain authority review detail RPC exists'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.project_references'::regclass
      and constraint_info.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid)
        = 'UNIQUE (project_id, normalized_url)'
  )
  and not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.project_references'::regclass
      and constraint_info.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid)
        = 'UNIQUE (normalized_url)'
  ),
  'reference uniqueness is scoped to project and normalized url'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.reference_is_publicly_renderable_v1(uuid)'::regprocedure
  ) like '%domain_authority_state_for_reference%'
  and pg_catalog.pg_get_functiondef(
    'public.reference_is_publicly_renderable_v1(uuid)'::regprocedure
  ) like '%granted%',
  'public rendering requires the matching domain authority to remain granted'
);

select ok(
  (
    select pg_catalog.bool_and(
      not exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            function_info.proacl,
            pg_catalog.acldefault('f', function_info.proowner)
          )
        ) as acl_entry
        where acl_entry.grantee = 0
          and acl_entry.privilege_type = 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege('anon', function_info.oid, 'EXECUTE')
      and pg_catalog.has_function_privilege('authenticated', function_info.oid, 'EXECUTE')
    )
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'list_reference_review_items',
        'get_reference_review_detail',
        'list_domain_authority_review_items',
        'get_domain_authority_review_detail'
      )
  ) is true,
  'review RPC execution is granted only to authenticated browser sessions'
);

-- The output column names are the PostgREST contract. A repository must not
-- guess or fall back to base tables when one of these names drifts.

select results_eq(
  $$
    select parameter.parameter_name::text collate "C"
    from information_schema.parameters as parameter
    where parameter.specific_schema = 'public'
      and parameter.specific_name = (
        select routine.specific_name
        from information_schema.routines as routine
        where routine.routine_schema = 'public'
          and routine.routine_name = 'list_reference_review_items'
      )
      and parameter.parameter_mode = 'OUT'
    order by parameter.ordinal_position
  $$,
  $$ values
    ('version'::text collate "C"), ('referenceId'), ('projectId'), ('kind'),
    ('label'), ('url'), ('state'), ('referenceVersion'), ('lastVerifiedAt'),
    ('activeIndicatorId'), ('updatedAt')
  $$,
  'the reference review list RPC exposes the exact reviewer-safe columns'
);

select results_eq(
  $$
    select parameter.parameter_name::text collate "C"
    from information_schema.parameters as parameter
    where parameter.specific_schema = 'public'
      and parameter.specific_name = (
        select routine.specific_name
        from information_schema.routines as routine
        where routine.routine_schema = 'public'
          and routine.routine_name = 'get_reference_review_detail'
      )
      and parameter.parameter_mode = 'OUT'
    order by parameter.ordinal_position
  $$,
  $$ values
    ('version'::text collate "C"), ('referenceId'), ('projectId'), ('kind'),
    ('label'), ('url'), ('state'), ('referenceVersion'), ('lastVerifiedAt'),
    ('activeIndicatorId'), ('updatedAt'), ('domainAuthority'), ('decisions')
  $$,
  'the reference review detail RPC exposes the exact reviewer-safe columns'
);

select results_eq(
  $$
    select parameter.parameter_name::text collate "C"
    from information_schema.parameters as parameter
    where parameter.specific_schema = 'public'
      and parameter.specific_name = (
        select routine.specific_name
        from information_schema.routines as routine
        where routine.routine_schema = 'public'
          and routine.routine_name = 'list_domain_authority_review_items'
      )
      and parameter.parameter_mode = 'OUT'
    order by parameter.ordinal_position
  $$,
  $$ values
    ('version'::text collate "C"), ('authorityId'), ('projectId'), ('domain'),
    ('state'), ('authorityVersion'), ('updatedAt')
  $$,
  'the authority review list RPC exposes the exact reviewer-safe columns'
);

select results_eq(
  $$
    select parameter.parameter_name::text collate "C"
    from information_schema.parameters as parameter
    where parameter.specific_schema = 'public'
      and parameter.specific_name = (
        select routine.specific_name
        from information_schema.routines as routine
        where routine.routine_schema = 'public'
          and routine.routine_name = 'get_domain_authority_review_detail'
      )
      and parameter.parameter_mode = 'OUT'
    order by parameter.ordinal_position
  $$,
  $$ values
    ('version'::text collate "C"), ('authorityId'), ('projectId'), ('domain'),
    ('state'), ('authorityVersion'), ('updatedAt'), ('decisions')
  $$,
  'the authority review detail RPC exposes the exact reviewer-safe columns'
);

select ok(
  not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name in (
        'public_project_references',
        'public_project_domain_authorities'
      )
      and column_info.column_name in (
        'note',
        'actor_user_id',
        'evidence_id',
        'idempotency_key'
      )
  ),
  'public reference projections expose no internal note or actor fields'
);

-- Behavior fixtures use fixed aggregate identities and database-generated
-- decision identities. The enclosing transaction rolls every row back.

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('75000000-0000-4000-8000-000000000090', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reference-reviewer-015@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-30 00:00:00+00', '2026-08-30 00:00:00+00'),
  ('75000000-0000-4000-8000-000000000091', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'senior-reference-reviewer-015@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-30 00:00:00+00', '2026-08-30 00:00:00+00'),
  ('75000000-0000-4000-8000-000000000092', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reference-admin-015@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-30 00:00:00+00', '2026-08-30 00:00:00+00'),
  ('75000000-0000-4000-8000-000000000093', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'ordinary-reference-user-015@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-30 00:00:00+00', '2026-08-30 00:00:00+00'),
  ('75000000-0000-4000-8000-000000000094', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'security-reviewer-015@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-30 00:00:00+00', '2026-08-30 00:00:00+00'),
  ('75000000-0000-4000-8000-000000000095', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'revoked-reference-reviewer-015@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-30 00:00:00+00', '2026-08-30 00:00:00+00');

insert into public.user_roles (user_id, role, granted_at, revoked_at)
values
  ('75000000-0000-4000-8000-000000000090', 'reviewer',
    '2026-08-30 00:00:00+00', null),
  ('75000000-0000-4000-8000-000000000091', 'senior_reviewer',
    '2026-08-30 00:00:00+00', null),
  ('75000000-0000-4000-8000-000000000092', 'admin',
    '2026-08-30 00:00:00+00', null),
  ('75000000-0000-4000-8000-000000000093', 'user',
    '2026-08-30 00:00:00+00', null),
  ('75000000-0000-4000-8000-000000000094', 'security_reviewer',
    '2026-08-30 00:00:00+00', null),
  ('75000000-0000-4000-8000-000000000095', 'reviewer',
    '2026-08-29 00:00:00+00', '2026-08-29 01:00:00+00');

insert into public.projects (id, slug, name, lifecycle, created_at, updated_at)
values
  ('75000000-0000-4000-8000-000000000010', 'phase-7b-review-boundary-one',
    'Phase 7B Review Boundary One', 'active',
    '2026-08-30 00:00:00+00', '2026-08-30 00:00:00+00'),
  ('75000000-0000-4000-8000-000000000011', 'phase-7b-review-boundary-two',
    'Phase 7B Review Boundary Two', 'active',
    '2026-08-30 00:00:00+00', '2026-08-30 00:00:00+00');

insert into public.sources (
  id, source_type, name, canonical_url, status, created_at, updated_at
)
values (
  '75000000-0000-4000-8000-000000000020', 'official_web',
  'Phase 7B Review Boundary Source', 'https://phase-7b-review-boundary.example/', 'active',
  '2026-08-30 00:00:00+00', '2026-08-30 00:00:00+00'
);

insert into public.project_sources (
  project_id, source_id, authority_domains, is_official, verified_at, verified_by, created_at
)
values
  ('75000000-0000-4000-8000-000000000010', '75000000-0000-4000-8000-000000000020',
    array['phase-7b-review-boundary.example'], true,
    '2026-08-30 00:00:00+00', '75000000-0000-4000-8000-000000000090',
    '2026-08-30 00:00:00+00'),
  ('75000000-0000-4000-8000-000000000011', '75000000-0000-4000-8000-000000000020',
    array['phase-7b-review-boundary.example'], true,
    '2026-08-30 00:00:00+00', '75000000-0000-4000-8000-000000000090',
    '2026-08-30 00:00:00+00');

insert into public.raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at, created_at
)
values (
  '75000000-0000-4000-8000-000000000030', '75000000-0000-4000-8000-000000000010',
  '75000000-0000-4000-8000-000000000020',
  'https://phase-7b-review-boundary.example/announcement',
  'https://phase-7b-review-boundary.example/announcement',
  'official_html', 'text/html',
  'The official review-boundary URL is https://shared-reference.example/claim.',
  repeat('9', 64), '2026-08-30 00:01:00+00', '2026-08-30 00:01:00+00'
);

insert into public.evidence (
  id, source_id, raw_item_id, source_field, quote_text, normalized_quote_sha256,
  verified_at, created_at
)
values (
  '75000000-0000-4000-8000-000000000040', '75000000-0000-4000-8000-000000000020',
  '75000000-0000-4000-8000-000000000030', 'article_raw_text',
  'The official review-boundary URL is https://shared-reference.example/claim.',
  public.evidence_quote_sha256_v1(
    'The official review-boundary URL is https://shared-reference.example/claim.'
  ),
  '2026-08-30 00:02:00+00', '2026-08-30 00:02:00+00'
);

create temporary table phase_7b_015_authority_register (
  version integer not null,
  "commandId" uuid not null,
  "authorityId" uuid not null,
  "authorityVersion" bigint not null,
  state text not null,
  replayed boolean not null
);

create temporary table phase_7b_015_authority_grant
(like phase_7b_015_authority_register including all);

create temporary table phase_7b_015_authority_revoke
(like phase_7b_015_authority_register including all);

create temporary table phase_7b_015_reference_one (
  version integer not null,
  "commandId" uuid not null,
  "referenceId" uuid not null,
  "referenceVersion" bigint not null,
  state text not null,
  replayed boolean not null
);

create temporary table phase_7b_015_reference_verify
(like phase_7b_015_reference_one including all);

create temporary table phase_7b_015_reference_two
(like phase_7b_015_reference_one including all);

create temporary table phase_7b_015_reference_other_project
(like phase_7b_015_reference_one including all);

grant select, insert on table
  pg_temp.phase_7b_015_authority_register,
  pg_temp.phase_7b_015_authority_grant,
  pg_temp.phase_7b_015_authority_revoke,
  pg_temp.phase_7b_015_reference_one,
  pg_temp.phase_7b_015_reference_verify,
  pg_temp.phase_7b_015_reference_two,
  pg_temp.phase_7b_015_reference_other_project
to authenticated;

grant select on table pg_temp.phase_7b_015_reference_one to anon;

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_authority_register
    select * from public.submit_register_domain_authority(
      '{"version":1,"projectId":"75000000-0000-4000-8000-000000000010","domain":"shared-reference.example","evidenceId":"75000000-0000-4000-8000-000000000040","note":"registered from the official announcement"}'::jsonb,
      '015-authority-register'
    )
  $$,
  'a contract-valid authority registration note is accepted'
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_authority_grant
    select * from public.submit_decide_domain_authority(
      (select "authorityId" from pg_temp.phase_7b_015_authority_register),
      jsonb_build_object(
        'version', 1,
        'authorityId', (select "authorityId" from pg_temp.phase_7b_015_authority_register),
        'expectedVersion', 1,
        'decision', 'grant',
        'reasonCode', 'official_announcement',
        'evidenceId', '75000000-0000-4000-8000-000000000040',
        'note', 'authority grant reviewed against Evidence'
      ),
      '015-authority-grant'
    )
  $$,
  'a contract-valid authority decision note is accepted'
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_reference_one
    select * from public.submit_register_reference(
      '{"version":1,"projectId":"75000000-0000-4000-8000-000000000010","kind":"claim_portal","url":"https://shared-reference.example/claim","label":"Shared claim portal","evidenceId":"75000000-0000-4000-8000-000000000040","note":"registered URL from Evidence"}'::jsonb,
      '015-reference-register-one'
    )
  $$,
  'a contract-valid reference registration note is accepted'
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_reference_verify
    select * from public.submit_decide_reference(
      (select "referenceId" from pg_temp.phase_7b_015_reference_one),
      jsonb_build_object(
        'version', 1,
        'referenceId', (select "referenceId" from pg_temp.phase_7b_015_reference_one),
        'expectedVersion', 1,
        'decision', 'verify',
        'reasonCode', 'evidence_verified',
        'evidenceId', '75000000-0000-4000-8000-000000000040',
        'note', 'verified URL against Evidence'
      ),
      '015-reference-verify-one'
    )
  $$,
  'a contract-valid reference decision note is accepted'
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_reference_two
    select * from public.submit_register_reference(
      '{"version":1,"projectId":"75000000-0000-4000-8000-000000000010","kind":"official_docs","url":"https://shared-reference.example/docs","label":"Shared docs","evidenceId":"75000000-0000-4000-8000-000000000040","note":null}'::jsonb,
      '015-reference-register-two'
    )
  $$,
  'a second URL under the granted authority can be registered'
);

select throws_ok(
  $$
    select * from public.submit_register_reference(
      '{"version":1,"projectId":"75000000-0000-4000-8000-000000000010","kind":"claim_portal","url":"https://shared-reference.example/claim","label":"Same-project duplicate","evidenceId":"75000000-0000-4000-8000-000000000040","note":null}'::jsonb,
      '015-reference-same-project-duplicate'
    )
  $$,
  'AR208', 'reference_command_invalid',
  'the same project cannot register the same normalized URL twice'
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_reference_other_project
    select * from public.submit_register_reference(
      '{"version":1,"projectId":"75000000-0000-4000-8000-000000000011","kind":"claim_portal","url":"https://shared-reference.example/claim","label":"Other project claim portal","evidenceId":"75000000-0000-4000-8000-000000000040","note":null}'::jsonb,
      '015-reference-other-project'
    )
  $$,
  'a different project may register the same normalized URL'
);

select throws_ok(
  $$
    select * from public.submit_register_reference(
      '{"version":1,"projectId":"75000000-0000-4000-8000-000000000010","kind":"other","url":"https://shared-reference.example/empty-note","label":"Empty note","evidenceId":"75000000-0000-4000-8000-000000000040","note":""}'::jsonb,
      '015-reference-empty-note'
    )
  $$,
  'AR208', 'reference_command_invalid',
  'the database rejects an empty internal note'
);

reset role;

create temporary table phase_7b_015_stored_notes (
  aggregate_type text primary key,
  note text not null
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_stored_notes (aggregate_type, note)
    select 'authority', decision.note
    from public.project_domain_authority_decisions as decision
    where decision.authority_id = (
      select "authorityId" from pg_temp.phase_7b_015_authority_register
    )
      and decision.decision = 'grant'
  $$,
  'the authority history note column can be queried'
);

select is(
  (select note from pg_temp.phase_7b_015_stored_notes where aggregate_type = 'authority'),
  'authority grant reviewed against Evidence',
  'authority history stores the reviewer note'
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_stored_notes (aggregate_type, note)
    select 'reference', decision.note
    from public.project_reference_decisions as decision
    where decision.reference_id = (
      select "referenceId" from pg_temp.phase_7b_015_reference_one
    )
      and decision.decision = 'verify'
  $$,
  'the reference history note column can be queried'
);

select is(
  (select note from pg_temp.phase_7b_015_stored_notes where aggregate_type = 'reference'),
  'verified URL against Evidence',
  'reference history stores the reviewer note'
);

select ok(
  not exists (
    select 1
    from public.outbox_events as event
    where event.aggregate_id in (
      (select "authorityId" from pg_temp.phase_7b_015_authority_register),
      (select "referenceId" from pg_temp.phase_7b_015_reference_one)
    )
      and event.payload ? 'note'
  ),
  'internal notes never enter reference outbox payloads'
);

create temporary table phase_7b_015_reference_page_one (
  version bigint not null,
  "referenceId" uuid not null,
  "projectId" uuid not null,
  kind text not null,
  label text not null,
  url text not null,
  state text not null,
  "referenceVersion" bigint null,
  "lastVerifiedAt" timestamptz null,
  "activeIndicatorId" uuid null,
  "updatedAt" timestamptz not null
);

create temporary table phase_7b_015_reference_page_two
(like phase_7b_015_reference_page_one including all);

create temporary table phase_7b_015_reference_candidates
(like phase_7b_015_reference_page_one including all);

create temporary table phase_7b_015_reference_detail (
  version bigint not null,
  "referenceId" uuid not null,
  "projectId" uuid not null,
  kind text not null,
  label text not null,
  url text not null,
  state text not null,
  "referenceVersion" bigint null,
  "lastVerifiedAt" timestamptz null,
  "activeIndicatorId" uuid null,
  "updatedAt" timestamptz not null,
  "domainAuthority" jsonb null,
  decisions jsonb not null
);

create temporary table phase_7b_015_authority_list (
  version bigint not null,
  "authorityId" uuid not null,
  "projectId" uuid not null,
  domain text not null,
  state text not null,
  "authorityVersion" bigint null,
  "updatedAt" timestamptz not null
);

create temporary table phase_7b_015_authority_detail (
  version bigint not null,
  "authorityId" uuid not null,
  "projectId" uuid not null,
  domain text not null,
  state text not null,
  "authorityVersion" bigint null,
  "updatedAt" timestamptz not null,
  decisions jsonb not null
);

grant select, insert on table
  pg_temp.phase_7b_015_reference_page_one,
  pg_temp.phase_7b_015_reference_page_two,
  pg_temp.phase_7b_015_reference_candidates,
  pg_temp.phase_7b_015_reference_detail,
  pg_temp.phase_7b_015_authority_list,
  pg_temp.phase_7b_015_authority_detail
to authenticated;

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_reference_page_one
    select
      item.version, item."referenceId", item."projectId", item.kind, item.label,
      item.url, item.state, (to_jsonb(item) ->> 'referenceVersion')::bigint,
      item."lastVerifiedAt", item."activeIndicatorId", item."updatedAt"
    from public.list_reference_review_items(
      '75000000-0000-4000-8000-000000000010', 'all', null, null, 1
    ) as item
  $$,
  'an active reviewer can list reference review items'
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_reference_page_two
    select
      item.version, item."referenceId", item."projectId", item.kind, item.label,
      item.url, item.state, (to_jsonb(item) ->> 'referenceVersion')::bigint,
      item."lastVerifiedAt", item."activeIndicatorId", item."updatedAt"
    from public.list_reference_review_items(
      '75000000-0000-4000-8000-000000000010',
      'all',
      (select "updatedAt" from pg_temp.phase_7b_015_reference_page_one),
      (select "referenceId" from pg_temp.phase_7b_015_reference_page_one),
      1
    ) as item
  $$,
  'the reference review cursor loads the next stable row'
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_reference_candidates
    select
      item.version, item."referenceId", item."projectId", item.kind, item.label,
      item.url, item.state, (to_jsonb(item) ->> 'referenceVersion')::bigint,
      item."lastVerifiedAt", item."activeIndicatorId", item."updatedAt"
    from public.list_reference_review_items(
      '75000000-0000-4000-8000-000000000010', 'candidate', null, null, 25
    ) as item
  $$,
  'the reference review list supports a strict state filter'
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_reference_detail
    select
      item.version, item."referenceId", item."projectId", item.kind, item.label,
      item.url, item.state, (to_jsonb(item) ->> 'referenceVersion')::bigint,
      item."lastVerifiedAt", item."activeIndicatorId", item."updatedAt",
      item."domainAuthority", item.decisions
    from public.get_reference_review_detail(
      (select "referenceId" from pg_temp.phase_7b_015_reference_one)
    ) as item
  $$,
  'an active reviewer can load strict reference detail and history'
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_authority_list
    select
      item.version, item."authorityId", item."projectId", item.domain, item.state,
      (to_jsonb(item) ->> 'authorityVersion')::bigint, item."updatedAt"
    from public.list_domain_authority_review_items(
      '75000000-0000-4000-8000-000000000010', 'all', null, null, 25
    ) as item
  $$,
  'an active reviewer can list domain authorities'
);

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_authority_detail
    select
      item.version, item."authorityId", item."projectId", item.domain, item.state,
      (to_jsonb(item) ->> 'authorityVersion')::bigint, item."updatedAt", item.decisions
    from public.get_domain_authority_review_detail(
      (select "authorityId" from pg_temp.phase_7b_015_authority_register)
    ) as item
  $$,
  'an active reviewer can load strict authority detail and history'
);

reset role;

select is(
  (select count(*)::integer from pg_temp.phase_7b_015_reference_page_one),
  1,
  'the first reference review page respects its limit'
);

select is(
  (select count(*)::integer from pg_temp.phase_7b_015_reference_page_two),
  1,
  'the second reference review page contains the remaining project row'
);

select ok(
  (
    select first_page."updatedAt" > second_page."updatedAt"
      or (
        first_page."updatedAt" = second_page."updatedAt"
        and first_page."referenceId" > second_page."referenceId"
      )
    from pg_temp.phase_7b_015_reference_page_one as first_page
    cross join pg_temp.phase_7b_015_reference_page_two as second_page
  ) is true,
  'reference review pagination follows updated_at desc then id desc'
);

select is(
  (select count(*)::integer from pg_temp.phase_7b_015_reference_candidates),
  1,
  'the candidate filter excludes the verified reference'
);

select is(
  (select "domainAuthority" ->> 'state' from pg_temp.phase_7b_015_reference_detail),
  'granted',
  'reference detail includes the matching authority state'
);

select is(
  (select "domainAuthority" ->> 'authorityVersion' from pg_temp.phase_7b_015_reference_detail),
  '2',
  'reference detail names the matching authority aggregate version explicitly'
);

select ok(
  not (select "domainAuthority" ? 'version' from pg_temp.phase_7b_015_reference_detail),
  'reference detail never overloads protocol version inside the matching authority'
);

select is(
  (select "referenceVersion" from pg_temp.phase_7b_015_reference_detail),
  2::bigint,
  'reference detail returns the authoritative aggregate version after verification'
);

select is(
  (
    select (to_jsonb(item) ->> 'referenceVersion')::bigint
    from public.list_reference_review_items(
      '75000000-0000-4000-8000-000000000010', 'verified', null, null, 25
    ) as item
    where item."referenceId" = (
      select "referenceId" from pg_temp.phase_7b_015_reference_one
    )
  ),
  2::bigint,
  'reference list returns the authoritative aggregate version after verification'
);

select is(
  (select "authorityVersion" from pg_temp.phase_7b_015_authority_detail),
  2::bigint,
  'authority detail returns the authoritative aggregate version after grant'
);

select is(
  (select "authorityVersion" from pg_temp.phase_7b_015_authority_list),
  2::bigint,
  'authority list returns the authoritative aggregate version after grant'
);

select is(
  (
    select count(*)::integer
    from pg_temp.phase_7b_015_reference_detail as detail
    cross join lateral jsonb_array_elements(detail.decisions) as decision
    where decision ->> 'note' is not null
  ),
  2,
  'reference detail returns both inert internal decision notes'
);

select ok(
  not exists (
    select 1
    from pg_temp.phase_7b_015_reference_detail as detail
    cross join lateral jsonb_array_elements(detail.decisions) as decision
    where decision ?| array['reviewerUserId', 'actorUserId', 'idempotencyKey', 'locator', 'quote']
  ),
  'reference detail history excludes actor, idempotency, locator, and quote fields'
);

select is(
  (select count(*)::integer from pg_temp.phase_7b_015_authority_list),
  1,
  'the authority list is project scoped'
);

select is(
  (
    select count(*)::integer
    from pg_temp.phase_7b_015_authority_detail as detail
    cross join lateral jsonb_array_elements(detail.decisions) as decision
    where decision ->> 'note' is not null
  ),
  2,
  'authority detail returns both inert internal decision notes'
);

select ok(
  not exists (
    select 1
    from pg_temp.phase_7b_015_authority_detail as detail
    cross join lateral jsonb_array_elements(detail.decisions) as decision
    where decision ?| array['reviewerUserId', 'actorUserId', 'idempotencyKey', 'locator', 'quote']
  ),
  'authority detail history excludes actor, idempotency, locator, and quote fields'
);

-- Active senior reviewers and admins may read. Ordinary, security-only, and
-- revoked reviewers receive the stable role error on every call.

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000091', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select lives_ok(
  $$ select count(*) from public.list_reference_review_items(null, 'all', null, null, 1) $$,
  'an active senior reviewer may use the reference review list RPC'
);
reset role;

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000092', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select lives_ok(
  $$ select count(*) from public.list_domain_authority_review_items(null, 'all', null, null, 1) $$,
  'an active admin may use the authority review list RPC'
);
reset role;

select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000093', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.list_reference_review_items(null, 'all', null, null, 1) $$,
  'AR204', 'reference_reviewer_required',
  'an ordinary authenticated user cannot read the reviewer reference list'
);
reset role;

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000094', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.get_reference_review_detail(
    (select "referenceId" from pg_temp.phase_7b_015_reference_one)
  ) $$,
  'AR204', 'reference_reviewer_required',
  'a security-only reviewer gains no Phase 7B read privilege'
);
reset role;

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000095', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.get_domain_authority_review_detail(
    (select "authorityId" from pg_temp.phase_7b_015_authority_register)
  ) $$,
  'AR204', 'reference_reviewer_required',
  'a revoked reviewer immediately loses Phase 7B read privilege'
);
reset role;

set local role anon;
select throws_ok(
  $$ select * from public.list_reference_review_items(null, 'all', null, null, 1) $$,
  '42501',
  'permission denied for function list_reference_review_items',
  'anonymous callers cannot execute a reviewer read RPC'
);
reset role;

-- A granted authority is part of the public rendering predicate. Revoking it
-- leaves reference history intact while removing the link synchronously.

set local role anon;
select is(
  (
    select count(*)::integer
    from public.public_project_references
    where reference_id = (
      select "referenceId" from pg_temp.phase_7b_015_reference_one
    )
  ),
  1,
  'the verified reference is public while its matching authority is granted'
);
reset role;

select set_config('request.jwt.claim.sub', '75000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$
    insert into pg_temp.phase_7b_015_authority_revoke
    select * from public.submit_decide_domain_authority(
      (select "authorityId" from pg_temp.phase_7b_015_authority_register),
      jsonb_build_object(
        'version', 1,
        'authorityId', (select "authorityId" from pg_temp.phase_7b_015_authority_register),
        'expectedVersion', 2,
        'decision', 'revoke',
        'reasonCode', 'source_no_longer_official',
        'evidenceId', null,
        'note', 'authority revoked after reviewer re-check'
      ),
      '015-authority-revoke'
    )
  $$,
  'a contract-valid revoke note is accepted'
);

reset role;

select is(
  public.reference_current_state_v1(
    (select "referenceId" from pg_temp.phase_7b_015_reference_one)
  ),
  'verified',
  'revoking authority does not overwrite reference decision history'
);

set local role anon;
select is(
  (
    select count(*)::integer
    from public.public_project_references
    where reference_id = (
      select "referenceId" from pg_temp.phase_7b_015_reference_one
    )
  ),
  0,
  'revoking the matching authority synchronously suppresses the public link'
);
reset role;

select * from finish();

rollback;
