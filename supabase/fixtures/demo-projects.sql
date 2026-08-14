-- Demo fixture projects for local/remote development.
-- All data below is hand-authored sample content (model_version 'seed-fixture-v1').
-- It is NOT verified intelligence and must never be treated as canonical facts.
-- Idempotent: safe to re-run; ON CONFLICT targets keep re-runs as no-ops.

insert into projects (slug, name, summary, lifecycle, primary_chain, official_website_url)
values
  ('novanet', 'NovaNet',
   'Modular DA layer with a points program for early node operators. Testnet live with weekly task resets.',
   'active', 'Ethereum', 'https://novanet.example.dev'),
  ('orbitlend', 'OrbitLend',
   'Cross-margin lending market on a general-purpose L2. Season 2 points campaign confirmed by the official blog.',
   'active', 'Arbitrum', 'https://orbitlend.example.xyz'),
  ('hyperbridge-x', 'HyperBridge X',
   'Interop messaging protocol expanding to three new chains. No token yet; docs hint at a future incentive program.',
   'rumored', 'Cosmos', 'https://hyperbridge-x.example.io'),
  ('solforge-perp', 'SolForge Perp',
   'Perpetual DEX with fee rebates routed to a points ledger. Referral quests run on a public task platform.',
   'active', 'Solana', 'https://solforge-perp.example.com'),
  ('baseclique', 'BaseClique',
   'Social graph app on an L2 with weekly engagement campaigns. Team has raised two rounds but no token announcement.',
   'rumored', 'Base', 'https://baseclique.example.app'),
  ('monacharge', 'MonaCharge',
   'Restaking protocol on an emerging L1. Vault deposits earn testnet points; caps fill within hours of opening.',
   'active', 'Monad', 'https://monacharge.example.network'),
  ('zkterminal', 'ZKTerminal',
   'ZK coprocessor with an open testnet and bug-bounty style tasks. Tokenomics page exists but allocation is unannounced.',
   'active', 'Ethereum', 'https://zkterminal.example.dev'),
  ('tonharbor', 'TonHarbor',
   'Mini-app wallet on a messaging platform chain. Retroactive drop strongly implied by founder interviews only.',
   'rumored', 'TON', 'https://tonharbor.example.org'),
  ('shadowroll', 'ShadowRoll',
   'On-chain dice game rebooting under a new team after an unfixed oracle incident. High risk of repeated exploits.',
   'active', 'BNB Chain', 'https://shadowroll.example.games'),
  ('mevrelay-pro', 'MEVRelay Pro',
   'MEV relay promising guaranteed allocations to early integrators. Anonymous team, unaudited contracts, aggressive marketing.',
   'rumored', 'Ethereum', 'https://mevrelay-pro.example.io'),
  ('claimmirror', 'ClaimMirror',
   'Site imitating a popular claims flow; domain registered last week and contracts unverified. Flagged by community reports.',
   'paused', 'Ethereum', 'https://claimmirror.example.site'),
  ('arbnav-wallet', 'ArbNav Wallet',
   'Account-abstraction wallet with a loyalty tier system. Season 1 rewards distributed; Season 2 criteria under review.',
   'active', 'Arbitrum', 'https://arbnav-wallet.example.com')
on conflict (slug) do nothing;

insert into project_scores (project_id, model_version, input_version, opportunity_score, risk_score, confidence, recommendation, explanation, calculated_at)
select p.id, 'seed-fixture-v1', 'seed-2026-08-14',
       v.opportunity_score, v.risk_score, v.confidence, v.recommendation::recommendation,
       v.explanation, now() - (v.hours_ago || ' hours')::interval
from (values
  ('novanet', 88.00, 22.00, 84.00, 'act_now', 'Fixture sample: strong points program, low cost per week, official campaign page confirmed by docs.', 3),
  ('orbitlend', 82.00, 30.00, 78.00, 'act_now', 'Fixture sample: season two points are live; capital efficiency is decent and criteria are published.', 5),
  ('solforge-perp', 76.00, 41.00, 71.00, 'watch', 'Fixture sample: fee rebate points accrue fast but trading rewards depend on volume depth.', 9),
  ('monacharge', 74.00, 38.00, 66.00, 'watch', 'Fixture sample: vault caps limit participation; testnet points may convert to mainnet weight.', 14),
  ('zkterminal', 69.00, 26.00, 62.00, 'research', 'Fixture sample: testnet tasks are cheap but allocation structure is still unannounced.', 22),
  ('hyperbridge-x', 64.00, 33.00, 58.00, 'research', 'Fixture sample: incentive program implied by docs; no official campaign yet.', 30),
  ('baseclique', 61.00, 35.00, 55.00, 'research', 'Fixture sample: engagement campaigns are low cost but value of social activity is unproven.', 36),
  ('arbnav-wallet', 71.00, 24.00, 69.00, 'watch', 'Fixture sample: season two criteria under review; season one paid out reliably.', 11),
  ('tonharbor', 52.00, 48.00, 41.00, 'watch', 'Fixture sample: drop implied by interviews only; no official eligibility rules exist.', 44),
  ('shadowroll', 34.00, 79.00, 72.00, 'avoid', 'Fixture sample: prior oracle incident remains unfixed under new management.', 18),
  ('mevrelay-pro', 28.00, 88.00, 63.00, 'avoid', 'Fixture sample: anonymous team, unaudited contracts, guaranteed-allocation language is a classic pattern.', 26),
  ('claimmirror', 8.00, 96.00, 88.00, 'blocked', 'Fixture sample: phishing-pattern claims site; domain age and unverified contracts triggered a precautionary block.', 40)
) as v(slug, opportunity_score, risk_score, confidence, recommendation, explanation, hours_ago)
join projects p on p.slug = v.slug
on conflict (project_id, model_version, input_version) do nothing;

insert into signals (project_id, signal_type, title, summary, verification, lifecycle, confidence, occurred_at, published_at)
select p.id, v.signal_type, v.title, v.summary, v.verification::signal_verification, 'published', v.confidence,
       now() - (v.hours_ago || ' hours')::interval, now() - (v.hours_ago || ' hours')::interval
from (values
  ('novanet', 'points_program', 'NovaNet extends node operator points to week 12',
   'Official blog confirms the points program continues with new task types for validators and light clients.',
   'verified', 92.00, 6),
  ('orbitlend', 'season_launch', 'OrbitLend season 2 points campaign starts',
   'Season 2 weights lending and borrowing on new markets; snapshot cadence is weekly.',
   'verified', 90.00, 12),
  ('solforge-perp', 'quest_campaign', 'Referral quest round opens on public task platform',
   'Fee rebates route to a points ledger; quest completion requires three qualifying trades.',
   'corroborated', 78.00, 20),
  ('monacharge', 'cap_increase', 'Vault caps raised after repeated sell-outs',
   'Caps now refill twice weekly; deposits above cap are rejected by the contract.',
   'verified', 85.00, 30),
  ('zkterminal', 'testnet_task', 'Bug-bounty style testnet tasks published',
   'Task list rewards reproducible proof submissions; points ledger is public in the docs.',
   'verified', 82.00, 46),
  ('hyperbridge-x', 'docs_hint', 'Tokenomics page adds incentive placeholder section',
   'Docs gain an empty incentives section with allocation graph stubs; no dates announced.',
   'unverified', 48.00, 58),
  ('baseclique', 'engagement_campaign', 'Weekly engagement campaign rewards active squads',
   'Squads earn multipliers for retention rather than raw invites, per campaign rules page.',
   'corroborated', 66.00, 72),
  ('arbnav-wallet', 'criteria_review', 'Season 2 criteria under review after feedback',
   'Team opens a feedback window on season weighting before finalizing eligibility rules.',
   'verified', 80.00, 26),
  ('tonharbor', 'founder_interview', 'Founder hints at retroactive distribution in interview',
   'Podcast answer implies early mini-app users would be recognized; no official post follows.',
   'unverified', 35.00, 90),
  ('shadowroll', 'incident_followup', 'Oracle incident from prior version remains unfixed',
   'Community audit notes the flawed oracle path is still deployed under the new frontend.',
   'corroborated', 74.00, 38),
  ('mevrelay-pro', 'marketing_pattern', 'Guaranteed allocation claims spread on social channels',
   'Marketing posts promise allocations to early integrators; contract source remains unverified.',
   'unverified', 58.00, 52),
  ('claimmirror', 'phishing_report', 'Claims lookalike domain reported by community',
   'Domain registered last week; contract bytecode differs from the official claims deployer.',
   'corroborated', 86.00, 80)
) as v(slug, signal_type, title, summary, verification, confidence, hours_ago)
join projects p on p.slug = v.slug
where not exists (
  select 1 from signals s where s.project_id = p.id and s.title = v.title
);
