begin;

select plan(9);

select results_eq(
  $$
    select id, slug, name, lifecycle
    from public.projects
    where id = '90000000-0000-4000-8000-000000000019'::uuid
  $$,
  $$
    values (
      '90000000-0000-4000-8000-000000000019'::uuid,
      'disposable-integration-database-marker'::text,
      'Disposable Integration Database Marker'::text,
      'paused'::public.project_lifecycle
    )
  $$,
  'an explicit local seed reset creates the exact paused disposable database marker'
);

insert into public.project_scores (
  id, project_id, model_version, input_version, opportunity_score, risk_score,
  confidence, recommendation, explanation, calculated_at, created_at
)
values (
  '90000000-0000-4000-8000-000000000043',
  '90000000-0000-4000-8000-000000000010',
  'fixture-model-v1', 'zero-signal-links', 99, 1, 99, 'act_now',
  'This newer zero-link fixture must remain outside public read models.',
  '2026-08-09 15:00:00+00', '2026-08-09 15:00:00+00'
);

select results_eq(
  $$
    select id, slug, lifecycle, official_website_url
    from public.projects
    where id in (
      '90000000-0000-4000-8000-000000000010'::uuid,
      '90000000-0000-4000-8000-000000000011'::uuid,
      '90000000-0000-4000-8000-000000000012'::uuid
    )
    order by id
  $$,
  $$
    values
      ('90000000-0000-4000-8000-000000000010'::uuid, 'fixture-active', 'active'::public.project_lifecycle, 'https://fixture-active.example.invalid'::text),
      ('90000000-0000-4000-8000-000000000011'::uuid, 'fixture-rumored', 'rumored'::public.project_lifecycle, null::text),
      ('90000000-0000-4000-8000-000000000012'::uuid, 'fixture-paused', 'paused'::public.project_lifecycle, null::text)
  $$,
  'the deterministic seed has exactly the active scored rumored scored and paused fixture projects'
);

select results_eq(
  $$
    select
      source.id,
      source.source_type,
      source.canonical_url,
      relation.project_id,
      relation.is_official,
      relation.authority_domains,
      relation.verified_by,
      relation.verified_at
    from public.sources as source
    join public.project_sources as relation on relation.source_id = source.id
    where source.id in (
      '90000000-0000-4000-8000-000000000020'::uuid,
      '90000000-0000-4000-8000-000000000021'::uuid
    )
    order by source.id
  $$,
  $$
    values
      (
        '90000000-0000-4000-8000-000000000020'::uuid,
        'official_web'::public.source_type,
        'https://fixture-active.example.invalid/official'::text,
        '90000000-0000-4000-8000-000000000010'::uuid,
        true,
        array['fixture-active.example.invalid']::text[],
        '90000000-0000-4000-8000-000000000001'::uuid,
        '2026-08-09 10:00:00+00'::timestamptz
      ),
      (
        '90000000-0000-4000-8000-000000000021'::uuid,
        'independent_research'::public.source_type,
        'https://fixture-research.example.invalid/report'::text,
        '90000000-0000-4000-8000-000000000011'::uuid,
        false,
        array[]::text[],
        null::uuid,
        null::timestamptz
      )
  $$,
  'the deterministic seed has verified official and independent fixture sources with exact provenance'
);

select results_eq(
  $$
    select id, project_id, lifecycle, verification, published_at
    from public.signals
    where id in (
      '90000000-0000-4000-8000-000000000030'::uuid,
      '90000000-0000-4000-8000-000000000031'::uuid,
      '90000000-0000-4000-8000-000000000032'::uuid
    )
    order by id
  $$,
  $$
    values
      ('90000000-0000-4000-8000-000000000030'::uuid, '90000000-0000-4000-8000-000000000010'::uuid, 'published'::public.signal_lifecycle, 'verified'::public.signal_verification, '2026-08-09 11:00:00+00'::timestamptz),
      ('90000000-0000-4000-8000-000000000031'::uuid, '90000000-0000-4000-8000-000000000011'::uuid, 'published'::public.signal_lifecycle, 'corroborated'::public.signal_verification, '2026-08-09 12:00:00+00'::timestamptz),
      ('90000000-0000-4000-8000-000000000032'::uuid, '90000000-0000-4000-8000-000000000012'::uuid, 'under_review'::public.signal_lifecycle, 'unverified'::public.signal_verification, null::timestamptz)
  $$,
  'the deterministic seed has two published signals and one non-public signal'
);

select results_eq(
  $$
    select signal.id, source.id, raw_item.id, raw_item.logical_url,
      raw_item.raw_text, evidence.quote_text,
      public.signal_has_valid_evidence(signal.id)
    from public.signals as signal
    join public.signal_evidence_links as link on link.signal_id = signal.id
    join public.evidence as evidence on evidence.id = link.evidence_id
    join public.raw_items as raw_item on raw_item.id = evidence.raw_item_id
    join public.sources as source on source.id = evidence.source_id
    where signal.id in (
      '90000000-0000-4000-8000-000000000030'::uuid,
      '90000000-0000-4000-8000-000000000031'::uuid
    )
    order by signal.id
  $$,
  $$
    values
      (
        '90000000-0000-4000-8000-000000000030'::uuid,
        '90000000-0000-4000-8000-000000000020'::uuid,
        '90000000-0000-4000-8000-000000000050'::uuid,
        'https://fixture-active.example.invalid/evidence'::text,
        'Fictional published signal for the active fixture.'::text,
        'Fictional published signal for the active fixture.'::text,
        true
      ),
      (
        '90000000-0000-4000-8000-000000000031'::uuid,
        '90000000-0000-4000-8000-000000000021'::uuid,
        '90000000-0000-4000-8000-000000000051'::uuid,
        'https://fixture-research.example.invalid/evidence'::text,
        'Fictional published signal for the rumored fixture.'::text,
        'Fictional published signal for the rumored fixture.'::text,
        true
      )
  $$,
  'published seed signals resolve through exact fictional Source Raw Item and Evidence paths'
);

select results_eq(
  $$
    select id, project_id, model_version, input_version, opportunity_score, calculated_at
    from public.project_scores
    where id in (
      '90000000-0000-4000-8000-000000000040'::uuid,
      '90000000-0000-4000-8000-000000000041'::uuid,
      '90000000-0000-4000-8000-000000000042'::uuid
    )
    order by id
  $$,
  $$
    values
      ('90000000-0000-4000-8000-000000000040'::uuid, '90000000-0000-4000-8000-000000000010'::uuid, 'fixture-model-v1'::text, 'fixture-input-v1'::text, 70.00::numeric, '2026-08-09 09:00:00+00'::timestamptz),
      ('90000000-0000-4000-8000-000000000041'::uuid, '90000000-0000-4000-8000-000000000010'::uuid, 'fixture-model-v1'::text, 'fixture-input-v2'::text, 82.00::numeric, '2026-08-09 13:00:00+00'::timestamptz),
      ('90000000-0000-4000-8000-000000000042'::uuid, '90000000-0000-4000-8000-000000000011'::uuid, 'fixture-model-v1'::text, 'fixture-input-v1'::text, 61.00::numeric, '2026-08-09 14:00:00+00'::timestamptz)
  $$,
  'the active fixture has two immutable score versions and the rumored fixture is scored'
);

select results_eq(
  $$
    select score.id, count(link.signal_id)::bigint,
      bool_and(public.signal_has_valid_evidence(link.signal_id))
    from public.project_scores as score
    join public.score_signal_links as link on link.project_score_id = score.id
    where score.id in (
      '90000000-0000-4000-8000-000000000040'::uuid,
      '90000000-0000-4000-8000-000000000041'::uuid,
      '90000000-0000-4000-8000-000000000042'::uuid
    )
    group by score.id
    order by score.id
  $$,
  $$
    values
      ('90000000-0000-4000-8000-000000000040'::uuid, 1::bigint, true),
      ('90000000-0000-4000-8000-000000000041'::uuid, 1::bigint, true),
      ('90000000-0000-4000-8000-000000000042'::uuid, 1::bigint, true)
  $$,
  'every public seed score links to its project Evidence-complete published signal'
);

select results_eq(
  $$
    select
      project_id,
      slug,
      name,
      summary,
      lifecycle,
      primary_chain,
      opportunity_score,
      risk_score,
      confidence,
      recommendation,
      calculated_at,
      latest_published_signal_at
    from public.opportunity_list
  $$,
  $$
    values
      ('90000000-0000-4000-8000-000000000010'::uuid, 'fixture-active'::text, 'Fixture Active'::text, 'Fictional active opportunity fixture.'::text, 'active'::public.project_lifecycle, 'Fixture Chain'::text, 82.00::numeric, 25.00::numeric, 85.00::numeric, 'act_now'::public.recommendation, '2026-08-09 13:00:00+00'::timestamptz, '2026-08-09 11:00:00+00'::timestamptz),
      ('90000000-0000-4000-8000-000000000011'::uuid, 'fixture-rumored'::text, 'Fixture Rumored'::text, 'Fictional rumored opportunity fixture.'::text, 'rumored'::public.project_lifecycle, 'Fixture Chain'::text, 61.00::numeric, 45.00::numeric, 60.00::numeric, 'research'::public.recommendation, '2026-08-09 14:00:00+00'::timestamptz, '2026-08-09 12:00:00+00'::timestamptz)
  $$,
  'opportunity_list exposes only scored active and rumored fixtures in deterministic latest-score order'
);

select results_eq(
  $$
    select
      (select count(*)::integer from public.project_scores
       where id = '90000000-0000-4000-8000-000000000043'),
      (select opportunity_score from public.opportunity_list
       where project_id = '90000000-0000-4000-8000-000000000010')
  $$,
  $$ values (1, 82.00::numeric) $$,
  'seed smoke preserves a newer zero-link score while keeping it outside the public opportunity state'
);

select * from finish();

rollback;
