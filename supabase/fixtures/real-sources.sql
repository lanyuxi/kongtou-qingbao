-- Real source wiring for end-to-end pipeline verification (development only).
-- Ethereum Foundation blog is an official, verified source for the Ethereum
-- project. verified_by references the local fixture admin profile.

insert into projects (slug, name, summary, lifecycle, primary_chain, official_website_url)
values (
  'ethereum',
  'Ethereum',
  '智能合约公链。追踪以太坊基金会官方博客中的激励计划、升级与生态活动信号。',
  'active',
  'Ethereum',
  'https://ethereum.org'
)
on conflict (slug) do nothing;

insert into sources (id, source_type, name, canonical_url, status, reputation_score)
values (
  '90000000-0000-4000-8000-000000000030',
  'official_docs',
  'Ethereum Foundation Blog (RSS)',
  'https://blog.ethereum.org/feed.xml',
  'active',
  95.00
)
on conflict (id) do nothing;

insert into project_sources (
  project_id, source_id, authority_domains, is_official, verified_at, verified_by
)
select
  project.id,
  '90000000-0000-4000-8000-000000000030',
  array['blog.ethereum.org', 'ethereum.org'],
  true,
  now(),
  '90000000-0000-4000-8000-000000000001'::uuid
from projects project
where project.slug = 'ethereum'
on conflict (project_id, source_id) do nothing;

-- Airdrop aggregator RSS: third-party (non-official) monitoring source for the
-- Ethereum project so the extraction stage sees real airdrop-related content.
insert into sources (id, source_type, name, canonical_url, status, reputation_score)
values (
  '90000000-0000-4000-8000-000000000031',
  'news',
  'Airdrops.io (RSS)',
  'https://airdrops.io/feed/',
  'active',
  60.00
)
on conflict (id) do nothing;

insert into project_sources (
  project_id, source_id, authority_domains, is_official
)
select
  project.id,
  '90000000-0000-4000-8000-000000000031',
  array['airdrops.io'],
  false
from projects project
where project.slug = 'ethereum'
on conflict (project_id, source_id) do nothing;
