begin;

select plan(5);

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

select * from finish();

rollback;
