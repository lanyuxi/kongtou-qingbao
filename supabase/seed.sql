begin;

-- All fixtures are deliberately fictional, local-only, and fixed so reset output is reproducible.
-- `.example.invalid` is a reserved non-production domain; no fixture contains a wallet, contract, or credential.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '90000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'fixture-reviewer@example.invalid',
  '{"provider":"email","providers":["email"]}',
  '{}',
  '2026-08-09 08:00:00+00',
  '2026-08-09 08:00:00+00'
)
on conflict (id) do nothing;

insert into public.projects (
  id,
  slug,
  name,
  summary,
  lifecycle,
  primary_chain,
  official_website_url,
  created_at,
  updated_at
)
values
  (
    '90000000-0000-4000-8000-000000000010',
    'fixture-active',
    'Fixture Active',
    'Fictional active opportunity fixture.',
    'active',
    'Fixture Chain',
    'https://fixture-active.example.invalid',
    '2026-08-09 08:00:00+00',
    '2026-08-09 08:00:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000011',
    'fixture-rumored',
    'Fixture Rumored',
    'Fictional rumored opportunity fixture.',
    'rumored',
    'Fixture Chain',
    null,
    '2026-08-09 08:00:00+00',
    '2026-08-09 08:00:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000012',
    'fixture-paused',
    'Fixture Paused',
    'Fictional paused opportunity fixture.',
    'paused',
    null,
    null,
    '2026-08-09 08:00:00+00',
    '2026-08-09 08:00:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000019',
    'disposable-integration-database-marker',
    'Disposable Integration Database Marker',
    'Marker proving an explicit local seed reset.',
    'paused',
    null,
    null,
    '2026-08-09 08:00:00+00',
    '2026-08-09 08:00:00+00'
  )
on conflict (id) do nothing;

insert into public.sources (
  id,
  source_type,
  name,
  canonical_url,
  status,
  reputation_score,
  created_at,
  updated_at
)
values
  (
    '90000000-0000-4000-8000-000000000020',
    'official_web',
    'Fixture Active Official Source',
    'https://fixture-active.example.invalid/official',
    'active',
    90.00,
    '2026-08-09 09:00:00+00',
    '2026-08-09 09:00:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000021',
    'independent_research',
    'Fixture Research Source',
    'https://fixture-research.example.invalid/report',
    'active',
    65.00,
    '2026-08-09 09:00:00+00',
    '2026-08-09 09:00:00+00'
  )
on conflict (id) do nothing;

insert into public.project_sources (
  project_id,
  source_id,
  authority_domains,
  is_official,
  verified_at,
  verified_by,
  created_at
)
values
  (
    '90000000-0000-4000-8000-000000000010',
    '90000000-0000-4000-8000-000000000020',
    array['fixture-active.example.invalid'],
    true,
    '2026-08-09 10:00:00+00',
    '90000000-0000-4000-8000-000000000001',
    '2026-08-09 10:00:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000011',
    '90000000-0000-4000-8000-000000000021',
    array[]::text[],
    false,
    null,
    null,
    '2026-08-09 10:00:00+00'
  )
on conflict (project_id, source_id) do nothing;

insert into public.signals (
  id,
  project_id,
  signal_type,
  title,
  summary,
  verification,
  lifecycle,
  confidence,
  occurred_at,
  published_at,
  created_at
)
values
  (
    '90000000-0000-4000-8000-000000000030',
    '90000000-0000-4000-8000-000000000010',
    'fixture_update',
    'Fixture active publication',
    'Fictional published signal for the active fixture.',
    'verified',
    'published',
    90.00,
    '2026-08-09 10:30:00+00',
    '2026-08-09 11:00:00+00',
    '2026-08-09 11:00:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000031',
    '90000000-0000-4000-8000-000000000011',
    'fixture_update',
    'Fixture rumored publication',
    'Fictional published signal for the rumored fixture.',
    'corroborated',
    'published',
    75.00,
    '2026-08-09 11:30:00+00',
    '2026-08-09 12:00:00+00',
    '2026-08-09 12:00:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000032',
    '90000000-0000-4000-8000-000000000012',
    'fixture_update',
    'Fixture paused review',
    'Fictional non-public signal for the paused fixture.',
    'unverified',
    'under_review',
    40.00,
    '2026-08-09 12:30:00+00',
    null,
    '2026-08-09 12:30:00+00'
  )
on conflict (id) do nothing;

insert into public.project_scores (
  id,
  project_id,
  model_version,
  input_version,
  opportunity_score,
  risk_score,
  confidence,
  recommendation,
  explanation,
  calculated_at,
  created_at
)
values
  (
    '90000000-0000-4000-8000-000000000040',
    '90000000-0000-4000-8000-000000000010',
    'fixture-model-v1',
    'fixture-input-v1',
    70.00,
    30.00,
    70.00,
    'watch',
    'Fictional first score version for the active fixture.',
    '2026-08-09 09:00:00+00',
    '2026-08-09 09:00:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000041',
    '90000000-0000-4000-8000-000000000010',
    'fixture-model-v1',
    'fixture-input-v2',
    82.00,
    25.00,
    85.00,
    'act_now',
    'Fictional latest score version for the active fixture.',
    '2026-08-09 13:00:00+00',
    '2026-08-09 13:00:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000042',
    '90000000-0000-4000-8000-000000000011',
    'fixture-model-v1',
    'fixture-input-v1',
    61.00,
    45.00,
    60.00,
    'research',
    'Fictional score for the rumored fixture.',
    '2026-08-09 14:00:00+00',
    '2026-08-09 14:00:00+00'
  )
on conflict (id) do nothing;

commit;
