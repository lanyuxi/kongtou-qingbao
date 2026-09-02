begin;

select no_plan();

-- Phase 7B verified allowlisted references.  Catalog assertions run first so a
-- missing migration fails loudly, then behavior fixtures exercise the bearer
-- identity, the domain-first verification gate, the append-only ledger, the
-- Phase 7A flag coupling, and the public projections.

select has_table('public', 'project_domain_authorities', 'domain authority envelopes exist');
select has_table('public', 'project_domain_authority_decisions', 'domain authority decisions exist');
select has_table('public', 'project_references', 'canonical references exist');
select has_table('public', 'project_reference_decisions', 'reference decisions exist');
select has_table('public', 'reference_security_flags', 'security flag coupling exists');
select has_table('public', 'reference_review_commands', 'reference command receipts exist');

select has_function('public', 'normalize_reference_domain_v1', array['text'],
  'reference domain normalizer exists');
select has_function('public', 'normalize_reference_url_v1', array['text'],
  'reference url normalizer exists');
select has_function('public', 'reference_url_host_v1', array['text'],
  'reference url host extractor exists');
select has_function('public', 'reference_current_state_v1', array['uuid'],
  'reference state helper exists');
select has_function('public', 'reference_last_verified_at_v1', array['uuid'],
  'reference last-verified helper exists');
select has_function('public', 'domain_authority_current_state_v1', array['uuid'],
  'authority state helper exists');
select has_function('public', 'reference_is_publicly_renderable_v1', array['uuid'],
  'public renderability decision helper exists');
select has_function('public', 'match_references_for_indicator', array['text', 'text'],
  'indicator to reference matcher exists');
select has_function('public', 'actor_has_active_reference_role', array['uuid'],
  'reference reviewer role helper exists');
select has_function('public', 'submit_register_domain_authority', array['jsonb', 'text'],
  'bearer-scoped authority registration exists');
select has_function('public', 'submit_decide_domain_authority', array['uuid', 'jsonb', 'text'],
  'bearer-scoped authority decision exists');
select has_function('public', 'submit_register_reference', array['jsonb', 'text'],
  'bearer-scoped reference registration exists');
select has_function('public', 'submit_decide_reference', array['uuid', 'jsonb', 'text'],
  'bearer-scoped reference decision exists');

select has_view('public', 'project_reference_current_state', 'internal reference state view exists');
select has_view('public', 'public_project_references', 'public verified reference view exists');
select has_view('public', 'public_project_domain_authorities', 'public granted domain view exists');

-- Both layers must normalize with the same rules, otherwise a value could
-- verify under one form and be flagged under another.
select results_eq(
  $$ select public.normalize_reference_url_v1('https://Example.com:443/claim/?utm=x#frag')::text collate "C" $$,
  $$ values ('https://example.com/claim/?utm=x'::text collate "C") $$,
  'url normalization matches the TypeScript layer for case, default port, and fragment'
);

select results_eq(
  $$ select public.normalize_reference_url_v1('https://example.com:0080/x')::text collate "C" $$,
  $$ values ('https://example.com:80/x'::text collate "C") $$,
  'url normalization strips leading port zeros like the TypeScript layer'
);

select results_eq(
  $$ select public.normalize_reference_url_v1('https://example.com?')::text collate "C" $$,
  $$ values ('https://example.com/'::text collate "C") $$,
  'url normalization drops an empty query like the TypeScript layer'
);

select results_eq(
  $$ select public.normalize_reference_url_v1('https://example.com')::text collate "C" $$,
  $$ values ('https://example.com/'::text collate "C") $$,
  'url normalization adds the root path like the TypeScript layer'
);

select is(
  public.normalize_reference_url_v1('https://www.example.com/claim'),
  'https://www.example.com/claim',
  'url normalization keeps www because it is a distinct authority'
);

select is(
  public.normalize_reference_url_v1('https://example.com/a/../b'),
  null,
  'url normalization rejects dot-segments instead of silently rewriting them'
);

select is(public.normalize_reference_url_v1('http://example.com/claim'), null,
  'url normalization rejects plain http');
select is(public.normalize_reference_url_v1('https:///claim'), null,
  'url normalization rejects an empty authority');
select is(public.normalize_reference_url_v1('https://[::1]/x'), null,
  'url normalization rejects ipv6 hosts');
select is(public.normalize_reference_url_v1('https://ex%41mple.com/x'), null,
  'url normalization rejects percent-encoded hosts');
select is(public.normalize_reference_url_v1('https://exa_mple.com/x'), null,
  'url normalization rejects underscore hosts');
select is(public.normalize_reference_url_v1('https://example.com/claim x'), null,
  'url normalization rejects whitespace');
select is(public.normalize_reference_domain_v1('WWW.Example.com.'), 'www.example.com',
  'domain normalization lowercases and strips the trailing dot only');
select is(public.normalize_reference_domain_v1('https://example.com'), null,
  'domain normalization rejects a scheme');
select is(public.normalize_reference_domain_v1('example..com'), null,
  'domain normalization rejects an empty label');
select is(public.reference_url_host_v1('https://www.example.com:8443/claim'), 'www.example.com',
  'url host extraction matches the TypeScript helper');

-- Exact catalog shape.

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'project_domain_authorities'
    order by ordinal_position
  $$,
  $$ values
    ('id'::text collate "C"), ('project_id'), ('normalized_domain'), ('version'), ('created_at')
  $$,
  'domain authorities have the exact canonical columns'
);

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'project_references'
    order by ordinal_position
  $$,
  $$ values
    ('id'::text collate "C"), ('project_id'), ('kind'), ('normalized_url'),
    ('normalized_domain'), ('label'), ('version'), ('created_at')
  $$,
  'references have the exact canonical columns'
);

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'reference_security_flags'
    order by ordinal_position
  $$,
  $$ values
    ('id'::text collate "C"), ('reference_id'), ('indicator_id'), ('created_at'),
    ('released_at'), ('released_by'), ('release_evidence_id')
  $$,
  'security flags carry the append-only release columns'
);

select results_eq(
  $$
    select column_name::text collate "C"
    from information_schema.columns
    where table_schema = 'public' and table_name = 'public_project_references'
    order by ordinal_position
  $$,
  $$ values
    ('reference_id'::text collate "C"), ('project_id'), ('kind'), ('label'),
    ('url'), ('last_verified_at')
  $$,
  'the public reference view exposes exactly the safe columns'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.project_reference_decisions', 'SELECT')
    and not pg_catalog.has_table_privilege('anon', 'public.project_domain_authority_decisions', 'SELECT')
    and not pg_catalog.has_table_privilege('anon', 'public.reference_security_flags', 'SELECT')
    and not pg_catalog.has_table_privilege('anon', 'public.reference_review_commands', 'SELECT')
    and not pg_catalog.has_table_privilege('anon', 'public.project_reference_current_state', 'SELECT'),
  'decision history, flags, receipts, and the internal view deny browser access'
);

select ok(
  has_column_privilege('anon', 'public.project_references', 'normalized_url', 'SELECT')
    and has_column_privilege('anon', 'public.project_references', 'label', 'SELECT')
    and not has_column_privilege('anon', 'public.project_references', 'version', 'SELECT')
    and not has_column_privilege('anon', 'public.project_references', 'created_at', 'SELECT'),
  'browser principals receive only the safe reference columns'
);

select results_eq(
  $$
    select policy.tablename::text collate "C", policy.policyname::text collate "C",
      policy.roles::text collate "C", policy.cmd::text collate "C"
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename in ('project_references', 'project_domain_authorities')
    order by policy.tablename, policy.policyname
  $$,
  $$ values
    ('project_domain_authorities'::text collate "C",
      'project_domain_authorities_select_anon'::text collate "C",
      '{anon}'::text collate "C", 'SELECT'::text collate "C"),
    ('project_domain_authorities'::text collate "C",
      'project_domain_authorities_select_authenticated'::text collate "C",
      '{authenticated}'::text collate "C", 'SELECT'::text collate "C"),
    ('project_references'::text collate "C",
      'project_references_ai_stage_worker_read'::text collate "C",
      '{ai_stage_worker}'::text collate "C", 'SELECT'::text collate "C"),
    ('project_references'::text collate "C",
      'project_references_select_anon'::text collate "C",
      '{anon}'::text collate "C", 'SELECT'::text collate "C"),
    ('project_references'::text collate "C",
      'project_references_select_authenticated'::text collate "C",
      '{authenticated}'::text collate "C", 'SELECT'::text collate "C")
  $$,
  'public projections have exact underlying invoker RLS policies'
);

select ok(
  coalesce((
    select pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%reference.registered.v1%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%reference.decided.v1%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%domain_authority.decided.v1%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%reference.security_flagged.v1%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%security.indicator.accepted.v1%'
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.outbox_events'::regclass
      and constraint_info.conname = 'outbox_events_event_type_valid'
  ), false),
  'the outbox allowlist keeps every 7A event and adds the reference events'
);

select ok(
  coalesce((
    select pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%indicatorValue%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%reviewerUserId%'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid) like '%security_flagged.v1%'
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.outbox_events'::regclass
      and constraint_info.conname = 'outbox_events_payload_valid'
  ), false),
  'the outbox payload validation keeps the 7A branches and adds the reference branch'
);

-- Behavior fixtures.

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('74000000-0000-4000-8000-000000000090', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reference-reviewer-014@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-29 00:00:00+00', '2026-08-29 00:00:00+00'),
  ('74000000-0000-4000-8000-000000000091', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'revoked-reference-reviewer-014@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-29 00:00:00+00', '2026-08-29 00:00:00+00'),
  ('74000000-0000-4000-8000-000000000092', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'ordinary-user-014@example.invalid',
    '{"provider":"email","providers":["email"]}', '{}',
    '2026-08-29 00:00:00+00', '2026-08-29 00:00:00+00');

insert into public.user_roles (user_id, role, granted_at, revoked_at)
values
  ('74000000-0000-4000-8000-000000000090', 'reviewer',
    '2026-08-29 00:00:00+00', null),
  ('74000000-0000-4000-8000-000000000091', 'reviewer',
    '2026-08-28 00:00:00+00', '2026-08-28 01:00:00+00'),
  ('74000000-0000-4000-8000-000000000092', 'user',
    '2026-08-29 00:00:00+00', null);

insert into public.projects (id, slug, name, lifecycle, created_at, updated_at)
values
  ('74000000-0000-4000-8000-000000000010', 'phase-7b-reference-fixture',
    'Phase 7B Reference Fixture', 'active',
    '2026-08-29 00:00:00+00', '2026-08-29 00:00:00+00'),
  ('74000000-0000-4000-8000-000000000011', 'phase-7b-paused-fixture',
    'Phase 7B Paused Fixture', 'paused',
    '2026-08-29 00:00:00+00', '2026-08-29 00:00:00+00');

insert into public.sources (
  id, source_type, name, canonical_url, status, created_at, updated_at
)
values
  ('74000000-0000-4000-8000-000000000020', 'official_web',
    'Phase 7B Reference Fixture Source', 'https://phase-7b-reference.example/', 'active',
    '2026-08-29 00:00:00+00', '2026-08-29 00:00:00+00');

insert into public.project_sources (
  project_id, source_id, authority_domains, is_official, verified_at, verified_by, created_at
)
values
  ('74000000-0000-4000-8000-000000000010', '74000000-0000-4000-8000-000000000020',
   array['phase-7b-reference.example'], true,
   '2026-08-29 00:00:00+00', '74000000-0000-4000-8000-000000000090',
   '2026-08-29 00:00:00+00'),
  ('74000000-0000-4000-8000-000000000011', '74000000-0000-4000-8000-000000000020',
   array['phase-7b-reference.example'], true,
   '2026-08-29 00:00:00+00', '74000000-0000-4000-8000-000000000090',
   '2026-08-29 00:00:00+00');

insert into public.raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at, created_at
)
values
  ('74000000-0000-4000-8000-000000000030', '74000000-0000-4000-8000-000000000010',
   '74000000-0000-4000-8000-000000000020',
   'https://phase-7b-reference.example/announcements',
   'https://phase-7b-reference.example/announcements', 'official_html', 'text/html',
   'The official claim portal is https://claim.example.com/ and the docs live under /docs.',
   repeat('8', 64), '2026-08-29 00:01:00+00', '2026-08-29 00:01:00+00');

insert into public.evidence (
  id, source_id, raw_item_id, source_field, quote_text, normalized_quote_sha256,
  verified_at, created_at
)
values
  ('74000000-0000-4000-8000-000000000040', '74000000-0000-4000-8000-000000000020',
   '74000000-0000-4000-8000-000000000030', 'article_raw_text',
   'The official claim portal is https://claim.example.com/ and the docs live under /docs.',
   public.evidence_quote_sha256_v1(
     'The official claim portal is https://claim.example.com/ and the docs live under /docs.'
   ),
   '2026-08-29 00:02:00+00', '2026-08-29 00:02:00+00');

-- Ordinary and revoked reviewers fail closed.

select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000092', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.submit_register_domain_authority(
      '{"version":1,"projectId":"74000000-0000-4000-8000-000000000010","domain":"claim.example.com","evidenceId":"74000000-0000-4000-8000-000000000040","note":null}'::jsonb,
      'ordinary-authority-register'
    )
  $$,
  'AR204', 'reference_reviewer_required',
  'ordinary authenticated users cannot register a domain authority'
);
select throws_ok(
  $$
    insert into public.project_references (project_id, kind, normalized_url, normalized_domain, label)
    values ('74000000-0000-4000-8000-000000000010', 'official_site',
      'https://forged.example/', 'forged.example', 'forged')
  $$,
  '42501', 'permission denied for table project_references',
  'ordinary authenticated users cannot directly write the reference ledger'
);
reset role;

select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000091', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.submit_register_domain_authority(
      '{"version":1,"projectId":"74000000-0000-4000-8000-000000000010","domain":"claim.example.com","evidenceId":"74000000-0000-4000-8000-000000000040","note":null}'::jsonb,
      'revoked-authority-register'
    )
  $$,
  'AR204', 'reference_reviewer_required',
  'revoked reference reviewers fail closed'
);
reset role;

-- Domain authority lifecycle.

create temporary table phase_7b_authority_register (
  version integer not null,
  "commandId" uuid not null,
  "authorityId" uuid not null,
  "authorityVersion" bigint not null,
  state text not null,
  replayed boolean not null
);
grant select, insert on table pg_temp.phase_7b_authority_register to authenticated;
grant select on table pg_temp.phase_7b_authority_register to anon;

create temporary table phase_7b_authority_grant (
  version integer not null,
  "commandId" uuid not null,
  "authorityId" uuid not null,
  "authorityVersion" bigint not null,
  state text not null,
  replayed boolean not null
);
grant select, insert on table pg_temp.phase_7b_authority_grant to authenticated;
grant select on table pg_temp.phase_7b_authority_grant to anon;

select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into phase_7b_authority_register
select * from public.submit_register_domain_authority(
  '{"version":1,"projectId":"74000000-0000-4000-8000-000000000010","domain":"Claim.Example.com.","evidenceId":"74000000-0000-4000-8000-000000000040","note":null}'::jsonb,
  'authority-register-001'
);

select is((select state from phase_7b_authority_register), 'candidate',
  'authority registration lands as a candidate');

select throws_ok(
  $$
    select * from public.submit_register_domain_authority(
      '{"version":1,"projectId":"74000000-0000-4000-8000-000000000010","domain":"claim.example.com","evidenceId":"74000000-0000-4000-8000-000000000040","note":null}'::jsonb,
      'authority-register-002'
    )
  $$,
  'AR208', 'reference_command_invalid',
  'a duplicate authority registration is rejected'
);

select throws_ok(
  $$
    select * from public.submit_register_domain_authority(
      '{"version":1,"projectId":"74000000-0000-4000-8000-000000000010","domain":"https://claim.example.com","evidenceId":"74000000-0000-4000-8000-000000000040","note":null}'::jsonb,
      'authority-register-003'
    )
  $$,
  'AR210', 'reference_normalization_invalid',
  'an authority with a scheme is rejected as a normalization failure'
);

insert into phase_7b_authority_grant
select * from public.submit_decide_domain_authority(
  (select "authorityId" from phase_7b_authority_register),
  jsonb_build_object(
    'version', 1,
    'authorityId', (select "authorityId" from phase_7b_authority_register),
    'expectedVersion', 1,
    'decision', 'grant',
    'reasonCode', 'official_announcement',
    'evidenceId', '74000000-0000-4000-8000-000000000040',
    'note', null
  ),
  'authority-grant-001'
);

select is((select state from phase_7b_authority_grant), 'granted',
  'granting the authority makes it granted');

select throws_ok(
  $$
    select * from public.submit_decide_domain_authority(
      (select "authorityId" from phase_7b_authority_register),
      jsonb_build_object(
        'version', 1,
        'authorityId', (select "authorityId" from phase_7b_authority_register),
        'expectedVersion', 2,
        'decision', 'grant',
        'reasonCode', 'official_announcement',
        'evidenceId', '74000000-0000-4000-8000-000000000040',
        'note', null
      ),
      'authority-grant-002'
    )
  $$,
  'AR202', 'reference_not_decidable',
  'granting an already granted authority is not decidable'
);

-- Reference lifecycle: the domain-first gate is the headline invariant.

create temporary table phase_7b_reference_main (
  version integer not null,
  "commandId" uuid not null,
  "referenceId" uuid not null,
  "referenceVersion" bigint not null,
  state text not null,
  replayed boolean not null
);
grant select, insert on table pg_temp.phase_7b_reference_main to authenticated;
grant select on table pg_temp.phase_7b_reference_main to anon;

create temporary table phase_7b_reference_unrelated (
  version integer not null,
  "commandId" uuid not null,
  "referenceId" uuid not null,
  "referenceVersion" bigint not null,
  state text not null,
  replayed boolean not null
);
grant select, insert on table pg_temp.phase_7b_reference_unrelated to authenticated;
grant select on table pg_temp.phase_7b_reference_unrelated to anon;

insert into phase_7b_reference_main
select * from public.submit_register_reference(
  '{"version":1,"projectId":"74000000-0000-4000-8000-000000000010","kind":"claim_portal","url":"https://Claim.Example.com:443/claim/?utm=x#frag","label":"官方领取页","evidenceId":"74000000-0000-4000-8000-000000000040","note":null}'::jsonb,
  'reference-register-001'
);

select is((select state from phase_7b_reference_main), 'candidate',
  'reference registration lands as a candidate');

reset role;

-- Candidate rows are invisible to browser roles by design, so the stored-row
-- assertions run as the table owner.
select is(
  (select normalized_url from public.project_references
    where id = (select "referenceId" from phase_7b_reference_main)),
  'https://claim.example.com/claim/?utm=x',
  'reference registration stores the normalized url from the shared TS layer rules'
);

select is(
  public.reference_url_host_v1(
    (select normalized_url from public.project_references
      where id = (select "referenceId" from phase_7b_reference_main))
  ),
  'claim.example.com',
  'the stored reference domain matches the granted authority domain'
);

select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- A different raw form of the same url normalizes to the same reference and is
-- therefore rejected as a duplicate.
select throws_ok(
  $$
    select * from public.submit_register_reference(
      '{"version":1,"projectId":"74000000-0000-4000-8000-000000000010","kind":"official_site","url":"https://CLAIM.Example.com:443/claim/?utm=x#other","label":"重复引用","evidenceId":"74000000-0000-4000-8000-000000000040","note":null}'::jsonb,
      'reference-register-002'
    )
  $$,
  'AR208', 'reference_command_invalid',
  'a duplicate normalized url is rejected'
);

select throws_ok(
  $$
    select * from public.submit_decide_reference(
      (select "referenceId" from phase_7b_reference_main),
      jsonb_build_object(
        'version', 1,
        'referenceId', (select "referenceId" from phase_7b_reference_main),
        'expectedVersion', 1,
        'decision', 'verify',
        'reasonCode', 'evidence_verified',
        'evidenceId', null,
        'note', null
      ),
      'reference-verify-001'
    )
  $$,
  'AR209', 'reference_evidence_required',
  'verification without evidence is rejected'
);

-- A second reference on an ungranted domain proves the gate is domain-scoped.

insert into phase_7b_reference_unrelated
select * from public.submit_register_reference(
  '{"version":1,"projectId":"74000000-0000-4000-8000-000000000010","kind":"official_site","url":"https://unrelated.example/docs","label":"未授权域名引用","evidenceId":"74000000-0000-4000-8000-000000000040","note":null}'::jsonb,
  'reference-register-003'
);

select throws_ok(
  $$
    select * from public.submit_decide_reference(
      (select "referenceId" from phase_7b_reference_unrelated),
      jsonb_build_object(
        'version', 1,
        'referenceId', (select "referenceId" from phase_7b_reference_unrelated),
        'expectedVersion', 1,
        'decision', 'verify',
        'reasonCode', 'evidence_verified',
        'evidenceId', '74000000-0000-4000-8000-000000000040',
        'note', null
      ),
      'reference-verify-unauthorized'
    )
  $$,
  'AR203', 'domain_authority_not_found',
  'verification without a domain authority is rejected'
);

reset role;

-- anon cannot see candidate references at all.

set local role anon;
select is(
  (select count(*)::int from public.project_references
    where id = (select "referenceId" from phase_7b_reference_main)),
  0,
  'anonymous principals cannot read a candidate reference row'
);
select is(
  (select count(*)::int from public.public_project_references
    where reference_id = (select "referenceId" from phase_7b_reference_main)),
  0,
  'the public view hides a candidate reference'
);
reset role;

-- Verification with a granted authority.

create temporary table phase_7b_reference_verify (
  version integer not null,
  "commandId" uuid not null,
  "referenceId" uuid not null,
  "referenceVersion" bigint not null,
  state text not null,
  replayed boolean not null
);
grant select, insert on table pg_temp.phase_7b_reference_verify to authenticated;
grant select on table pg_temp.phase_7b_reference_verify to anon;

select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into phase_7b_reference_verify
select * from public.submit_decide_reference(
  (select "referenceId" from phase_7b_reference_main),
  jsonb_build_object(
    'version', 1,
    'referenceId', (select "referenceId" from phase_7b_reference_main),
    'expectedVersion', 1,
    'decision', 'verify',
    'reasonCode', 'evidence_verified',
    'evidenceId', '74000000-0000-4000-8000-000000000040',
    'note', null
  ),
  'reference-verify-002'
);

select is((select state from phase_7b_reference_verify), 'verified',
  'verification with a granted authority verifies the reference');

select is(
  public.reference_last_verified_at_v1((select "referenceId" from phase_7b_reference_main))
    is not null,
  true,
  'verification derives last_verified_at'
);

select throws_ok(
  $$
    select * from public.submit_decide_reference(
      (select "referenceId" from phase_7b_reference_main),
      jsonb_build_object(
        'version', 1,
        'referenceId', (select "referenceId" from phase_7b_reference_main),
        'expectedVersion', 1,
        'decision', 'reverify',
        'reasonCode', 'evidence_verified',
        'evidenceId', '74000000-0000-4000-8000-000000000040',
        'note', null
      ),
      'reference-reverify-stale'
    )
  $$,
  'AR206', 'reference_version_conflict',
  'a stale expected version is rejected'
);

-- Idempotent replay and key misuse.  A replay must resend the exact original
-- body, because the receipt is keyed on the request hash.

create temporary table phase_7b_reference_replay (
  version integer not null,
  "commandId" uuid not null,
  "referenceId" uuid not null,
  "referenceVersion" bigint not null,
  state text not null,
  replayed boolean not null
);
grant select, insert on table pg_temp.phase_7b_reference_replay to authenticated;
grant select on table pg_temp.phase_7b_reference_replay to anon;

select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into phase_7b_reference_replay
select * from public.submit_decide_reference(
  (select "referenceId" from phase_7b_reference_main),
  jsonb_build_object(
    'version', 1,
    'referenceId', (select "referenceId" from phase_7b_reference_main),
    'expectedVersion', 1,
    'decision', 'verify',
    'reasonCode', 'evidence_verified',
    'evidenceId', '74000000-0000-4000-8000-000000000040',
    'note', null
  ),
  'reference-verify-002'
);

select is((select replayed from phase_7b_reference_replay), true,
  'the same key with the same body replays the original receipt');
select is((select "referenceVersion" from phase_7b_reference_replay), 2::bigint,
  'the replay returns the original version instead of advancing');

select throws_ok(
  $$
    select * from public.submit_decide_reference(
      (select "referenceId" from phase_7b_reference_main),
      jsonb_build_object(
        'version', 1,
        'referenceId', (select "referenceId" from phase_7b_reference_main),
        'expectedVersion', 2,
        'decision', 'withdraw',
        'reasonCode', 'withdrawn_by_reviewer',
        'evidenceId', null,
        'note', null
      ),
      'reference-verify-002'
    )
  $$,
  'AR207', 'reference_idempotency_conflict',
  'the same key with a different body is an idempotency conflict'
);

reset role;

-- Phase 7A coupling: accepting an indicator flags the matching reference and
-- the public view stops returning it synchronously.

set local role anon;
select is(
  (select count(*)::int from public.public_project_references
    where reference_id = (select "referenceId" from phase_7b_reference_main)),
  1,
  'a verified reference is publicly renderable before any security flag'
);
reset role;

insert into public.security_indicators (
  id, indicator_type, value_text, normalized_value_sha256, created_at
) values (
  '74000000-0000-4000-8000-000000000050',
  'domain',
  'Claim.Example.com.',
  public.security_indicator_value_sha256_v1('Claim.Example.com.'),
  '2026-08-29 03:00:00+00'
);

select is(
  (select count(*)::int from public.reference_security_flags
    where reference_id = (select "referenceId" from phase_7b_reference_main)
      and indicator_id = '74000000-0000-4000-8000-000000000050'
      and released_at is null),
  1,
  'an accepted indicator inserts exactly one unreleased security flag'
);

select is(
  public.reference_current_state_v1((select "referenceId" from phase_7b_reference_main)),
  'flagged',
  'an unreleased flag overrides the verified state'
);

set local role anon;
select is(
  (select count(*)::int from public.public_project_references
    where reference_id = (select "referenceId" from phase_7b_reference_main)),
  0,
  'the public view stops returning a flagged reference synchronously'
);
reset role;

-- A later verification cannot clear the flag; only a human restore can.

select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.submit_decide_reference(
      (select "referenceId" from phase_7b_reference_main),
      jsonb_build_object(
        'version', 1,
        'referenceId', (select "referenceId" from phase_7b_reference_main),
        'expectedVersion', 2,
        'decision', 'reverify',
        'reasonCode', 'evidence_verified',
        'evidenceId', '74000000-0000-4000-8000-000000000040',
        'note', null
      ),
      'reference-reverify-flagged'
    )
  $$,
  'AR202', 'reference_not_decidable',
  'a flagged reference cannot be reverified back to verified'
);

create temporary table phase_7b_reference_restore (
  version integer not null,
  "commandId" uuid not null,
  "referenceId" uuid not null,
  "referenceVersion" bigint not null,
  state text not null,
  replayed boolean not null
);
grant select, insert on table pg_temp.phase_7b_reference_restore to authenticated;
grant select on table pg_temp.phase_7b_reference_restore to anon;

insert into phase_7b_reference_restore
select * from public.submit_decide_reference(
  (select "referenceId" from phase_7b_reference_main),
  jsonb_build_object(
    'version', 1,
    'referenceId', (select "referenceId" from phase_7b_reference_main),
    'expectedVersion', 2,
    'decision', 'restore',
    'reasonCode', 'security_flag_cleared',
    'evidenceId', '74000000-0000-4000-8000-000000000040',
    'note', null
  ),
  'reference-restore-001'
);

select is((select state from phase_7b_reference_restore), 'verified',
  'a human restore returns the reference to verified');

reset role;

-- Flag rows are internal: the release proof must run as the table owner.
select is(
  (select count(*)::int from public.reference_security_flags
    where reference_id = (select "referenceId" from phase_7b_reference_main)
      and indicator_id = '74000000-0000-4000-8000-000000000050'
      and released_at is not null
      and released_by = '74000000-0000-4000-8000-000000000090'
      and release_evidence_id = '74000000-0000-4000-8000-000000000040'),
  1,
  'the restore releases the flag row instead of deleting it'
);

reset role;

-- The lifecycle filter keeps paused projects out of the public view.

insert into public.project_references (
  id, project_id, kind, normalized_url, normalized_domain, label, version, created_at
) values (
  '74000000-0000-4000-8000-000000000060', '74000000-0000-4000-8000-000000000011',
  'official_site', 'https://paused.example.com/', 'paused.example.com',
  '暂停项目官网', 1, '2026-08-29 04:00:00+00'
);

insert into public.project_reference_decisions (
  reference_id, decision, resulting_state, reason_code, aggregate_version,
  evidence_id, actor_user_id, idempotency_key, created_at
) values (
  '74000000-0000-4000-8000-000000000060', 'register', 'candidate',
  'insufficient_context', 1, '74000000-0000-4000-8000-000000000040',
  '74000000-0000-4000-8000-000000000090', 'paused-register-001',
  '2026-08-29 04:00:00+00'
);

set local role anon;
select is(
  (select count(*)::int from public.public_project_references
    where project_id = '74000000-0000-4000-8000-000000000011'),
  0,
  'a paused project renders no public references'
);
reset role;

-- Withdrawal is append-only and stays out of the public view.

select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000090', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

create temporary table phase_7b_reference_withdraw (
  version integer not null,
  "commandId" uuid not null,
  "referenceId" uuid not null,
  "referenceVersion" bigint not null,
  state text not null,
  replayed boolean not null
);
grant select, insert on table pg_temp.phase_7b_reference_withdraw to authenticated;
grant select on table pg_temp.phase_7b_reference_withdraw to anon;

insert into phase_7b_reference_withdraw
select * from public.submit_decide_reference(
  (select "referenceId" from phase_7b_reference_main),
  jsonb_build_object(
    'version', 1,
    'referenceId', (select "referenceId" from phase_7b_reference_main),
    'expectedVersion', 3,
    'decision', 'withdraw',
    'reasonCode', 'withdrawn_by_reviewer',
    'evidenceId', null,
    'note', null
  ),
  'reference-withdraw-001'
);

select is((select state from phase_7b_reference_withdraw), 'withdrawn',
  'withdrawing a reference appends a withdrawn decision');

reset role;

set local role anon;
select is(
  (select count(*)::int from public.public_project_references
    where reference_id = (select "referenceId" from phase_7b_reference_main)),
  0,
  'a withdrawn reference is not publicly renderable'
);
reset role;

-- Append-only enforcement on every history table.

select throws_ok(
  $$ update public.project_reference_decisions set reason_code = 'tampered' $$,
  '55000', 'reference_ledger_append_only',
  'reference decisions cannot be updated'
);
select throws_ok(
  $$ delete from public.project_reference_decisions $$,
  '55000', 'reference_ledger_append_only',
  'reference decisions cannot be deleted'
);
select throws_ok(
  $$ delete from public.reference_security_flags $$,
  '55000', 'reference_ledger_append_only',
  'security flags cannot be deleted'
);

-- Outbox proof: the commands published exactly the safe event types.

select is(
  (select count(*)::int from public.outbox_events
    where event_type = 'reference.registered.v1'),
  2,
  'each of the two reference registrations published one registered event'
);

select is(
  (select count(*)::int from public.outbox_events
    where event_type = 'domain_authority.decided.v1'),
  2,
  'authority register and grant each published a decided event'
);

select is(
  (select count(*)::int from public.outbox_events
    where event_type = 'reference.security_flagged.v1'),
  1,
  'the flag coupling published exactly one flagged event'
);

select is(
  (select count(*)::int from public.outbox_events
    where event_type = 'reference.decided.v1'
      and payload ->> 'resultingState' in ('verified', 'withdrawn')),
  3,
  'verify, restore, and withdraw each published a decided event'
);

select * from finish();

rollback;
