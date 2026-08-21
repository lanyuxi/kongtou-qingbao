-- Demo fixture projects for local/remote development.
-- All data below is hand-authored sample content (model_version 'seed-fixture-v1').
-- It is NOT verified intelligence and must never be treated as canonical facts.
-- Idempotent: safe to re-run; ON CONFLICT targets keep re-runs as no-ops.

insert into projects (slug, name, summary, lifecycle, primary_chain, official_website_url)
values
  ('novanet', 'NovaNet',
   '模块化 DA 层，面向早期节点运营者的积分计划。测试网已上线，任务每周重置。',
   'active', 'Ethereum', 'https://novanet.example.dev'),
  ('orbitlend', 'OrbitLend',
   '通用 L2 上的跨保证金借贷市场。官方博客已确认第二赛季积分活动。',
   'active', 'Arbitrum', 'https://orbitlend.example.xyz'),
  ('hyperbridge-x', 'HyperBridge X',
   '跨链消息协议，正扩展至三条新链。尚无代币；文档暗示未来将有激励计划。',
   'rumored', 'Cosmos', 'https://hyperbridge-x.example.io'),
  ('solforge-perp', 'SolForge Perp',
   '永续 DEX，手续费返点计入积分账本。推荐任务在公开任务平台进行。',
   'active', 'Solana', 'https://solforge-perp.example.com'),
  ('baseclique', 'BaseClique',
   'L2 上的社交图谱应用，每周开展互动活动。团队已完成两轮融资，但未公告代币。',
   'rumored', 'Base', 'https://baseclique.example.app'),
  ('monacharge', 'MonaCharge',
   '新兴 L1 上的再质押协议。金库存款可获得测试网积分；额度开放数小时内即满。',
   'active', 'Monad', 'https://monacharge.example.network'),
  ('zkterminal', 'ZKTerminal',
   'ZK 协处理器，开放测试网与赏金类任务。代币经济页面已存在，但分配方案未公告。',
   'active', 'Ethereum', 'https://zkterminal.example.dev'),
  ('tonharbor', 'TonHarbor',
   '消息平台链上的小程序钱包。仅凭创始人访谈强烈暗示追溯空投。',
   'rumored', 'TON', 'https://tonharbor.example.org'),
  ('shadowroll', 'ShadowRoll',
   '链上骰子游戏，因未修复的预言机事件后由新团队重启。存在重复漏洞利用的高风险。',
   'active', 'BNB Chain', 'https://shadowroll.example.games'),
  ('mevrelay-pro', 'MEVRelay Pro',
   'MEV 中继，向早期集成方承诺保证额度。匿名团队、未审计合约、激进营销。',
   'rumored', 'Ethereum', 'https://mevrelay-pro.example.io'),
  ('claimmirror', 'ClaimMirror',
   '模仿热门领取流程的站点；域名上周注册且合约未验证。已被社区举报。',
   'paused', 'Ethereum', 'https://claimmirror.example.site'),
  ('arbnav-wallet', 'ArbNav Wallet',
   '账户抽象钱包，采用忠诚度等级体系。第一赛季奖励已发放；第二赛季标准审核中。',
   'active', 'Arbitrum', 'https://arbnav-wallet.example.com')
on conflict (slug) do nothing;

insert into project_scores (project_id, model_version, input_version, opportunity_score, risk_score, confidence, recommendation, explanation, calculated_at)
select p.id, 'seed-fixture-v1', 'seed-2026-08-14',
       v.opportunity_score, v.risk_score, v.confidence, v.recommendation::recommendation,
       v.explanation, now() - (v.hours_ago || ' hours')::interval
from (values
  ('novanet', 88.00, 22.00, 84.00, 'act_now', '样例数据：积分计划力度强，每周投入成本低，官方活动页已由文档确认。', 3),
  ('orbitlend', 82.00, 30.00, 78.00, 'act_now', '样例数据：第二赛季积分已上线；资金效率尚可且规则已公开。', 5),
  ('solforge-perp', 76.00, 41.00, 71.00, 'watch', '样例数据：手续费返点积分累积快，但交易奖励依赖成交量深度。', 9),
  ('monacharge', 74.00, 38.00, 66.00, 'watch', '样例数据：金库额度限制参与；测试网积分或可转化为主网权重。', 14),
  ('zkterminal', 69.00, 26.00, 62.00, 'research', '样例数据：测试网任务成本低，但分配方案仍未公告。', 22),
  ('hyperbridge-x', 64.00, 33.00, 58.00, 'research', '样例数据：文档暗示激励计划；尚无官方活动。', 30),
  ('baseclique', 61.00, 35.00, 55.00, 'research', '样例数据：互动活动成本低，但社交活动的价值未经验证。', 36),
  ('arbnav-wallet', 71.00, 24.00, 69.00, 'watch', '样例数据：第二赛季标准审核中；第一赛季发放记录可靠。', 11),
  ('tonharbor', 52.00, 48.00, 41.00, 'watch', '样例数据：空投仅由访谈暗示；不存在官方资格规则。', 44),
  ('shadowroll', 34.00, 79.00, 72.00, 'avoid', '样例数据：新管理层之下，此前的预言机事件仍未修复。', 18),
  ('mevrelay-pro', 28.00, 88.00, 63.00, 'avoid', '样例数据：匿名团队、未审计合约，"保证额度"话术是典型风险模式。', 26),
  ('claimmirror', 8.00, 96.00, 88.00, 'blocked', '样例数据：钓鱼模式的领取站点；域名年龄与未验证合约触发预防性封锁。', 40)
) as v(slug, opportunity_score, risk_score, confidence, recommendation, explanation, hours_ago)
join projects p on p.slug = v.slug
on conflict (project_id, model_version, input_version) do nothing;

insert into signals (project_id, signal_type, title, summary, verification, lifecycle, confidence, occurred_at, published_at)
select p.id, v.signal_type, v.title, v.summary, v.verification::signal_verification, 'published', v.confidence,
       now() - (v.hours_ago || ' hours')::interval, now() - (v.hours_ago || ' hours')::interval
from (values
  ('novanet', 'points_program', 'NovaNet 节点运营者积分延长至第 12 周',
   '官方博客确认积分计划继续，并为验证者与轻客户端增加新任务类型。',
   'verified', 92.00, 6),
  ('orbitlend', 'season_launch', 'OrbitLend 第二赛季积分活动开启',
   '第二赛季对新市场加权借贷；快照频率为每周一次。',
   'verified', 90.00, 12),
  ('solforge-perp', 'quest_campaign', '公开任务平台开启推荐任务轮次',
   '手续费返点计入积分账本；完成任务需三笔合格交易。',
   'corroborated', 78.00, 20),
  ('monacharge', 'cap_increase', '金库多次售罄后额度上调',
   '额度现为每周补充两次；超过额度的存款会被合约拒绝。',
   'verified', 85.00, 30),
  ('zkterminal', 'testnet_task', '发布赏金类测试网任务',
   '任务列表奖励可复现的证明提交；积分账本在文档中公开。',
   'verified', 82.00, 46),
  ('hyperbridge-x', 'docs_hint', '代币经济页面新增激励占位章节',
   '文档新增空白激励章节与分配图占位；未公布任何日期。',
   'unverified', 48.00, 58),
  ('baseclique', 'engagement_campaign', '每周互动活动奖励活跃小队',
   '根据活动规则页，小队以留存而非纯邀请数获得倍数加成。',
   'corroborated', 66.00, 72),
  ('arbnav-wallet', 'criteria_review', '收集反馈后第二赛季标准审核中',
   '团队在敲定资格规则前，开放赛季权重的反馈窗口。',
   'verified', 80.00, 26),
  ('tonharbor', 'founder_interview', '创始人访谈中暗示追溯分发',
   '播客回答暗示早期小程序用户将被认可；此后并无官方公告。',
   'unverified', 35.00, 90),
  ('shadowroll', 'incident_followup', '旧版本预言机事件仍未修复',
   '社区审计指出，有缺陷的预言机路径仍部署在新前端之下。',
   'corroborated', 74.00, 38),
  ('mevrelay-pro', 'marketing_pattern', '"保证额度"说法在社交渠道扩散',
   '营销帖承诺早期集成方获得额度；合约源码仍未验证。',
   'unverified', 58.00, 52),
  ('claimmirror', 'phishing_report', '社区举报领取仿冒域名',
   '域名为上周注册；合约字节码与官方领取部署器不一致。',
   'corroborated', 86.00, 80)
) as v(slug, signal_type, title, summary, verification, confidence, hours_ago)
join projects p on p.slug = v.slug
where not exists (
  select 1 from signals s where s.project_id = p.id and s.title = v.title
);

insert into sources (
  id, source_type, name, canonical_url, status, reputation_score
)
select
  pg_catalog.md5('demo-evidence-source:' || fixture.slug)::uuid,
  'independent_research',
  'Demo Evidence Source: ' || project.name,
  'https://' || fixture.slug || '-evidence.example.invalid/source',
  'active',
  50
from (values
  ('novanet'), ('orbitlend'), ('solforge-perp'), ('monacharge'),
  ('zkterminal'), ('hyperbridge-x'), ('baseclique'), ('arbnav-wallet'),
  ('tonharbor'), ('shadowroll'), ('mevrelay-pro'), ('claimmirror')
) as fixture(slug)
join projects as project on project.slug = fixture.slug
on conflict (id) do nothing;

insert into project_sources (
  project_id, source_id, authority_domains, is_official, verified_at, verified_by
)
select
  project.id,
  pg_catalog.md5('demo-evidence-source:' || fixture.slug)::uuid,
  array[]::text[],
  false,
  null,
  null
from (values
  ('novanet'), ('orbitlend'), ('solforge-perp'), ('monacharge'),
  ('zkterminal'), ('hyperbridge-x'), ('baseclique'), ('arbnav-wallet'),
  ('tonharbor'), ('shadowroll'), ('mevrelay-pro'), ('claimmirror')
) as fixture(slug)
join projects as project on project.slug = fixture.slug
on conflict (project_id, source_id) do nothing;

insert into raw_items (
  id, project_id, source_id, logical_url, final_url, content_kind, media_type,
  raw_text, sha256, collected_at, created_at
)
select
  pg_catalog.md5('demo-evidence-raw:' || fixture.slug)::uuid,
  project.id,
  pg_catalog.md5('demo-evidence-source:' || fixture.slug)::uuid,
  'https://' || fixture.slug || '-evidence.example.invalid/signal',
  'https://' || fixture.slug || '-evidence.example.invalid/signal',
  'feed_article_html',
  'text/plain',
  signal.summary,
  pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(signal.summary, 'UTF8'), 'sha256'
  ), 'hex'),
  signal.created_at,
  signal.created_at
from (values
  ('novanet', 'NovaNet 节点运营者积分延长至第 12 周'),
  ('orbitlend', 'OrbitLend 第二赛季积分活动开启'),
  ('solforge-perp', '公开任务平台开启推荐任务轮次'),
  ('monacharge', '金库多次售罄后额度上调'),
  ('zkterminal', '发布赏金类测试网任务'),
  ('hyperbridge-x', '代币经济页面新增激励占位章节'),
  ('baseclique', '每周互动活动奖励活跃小队'),
  ('arbnav-wallet', '收集反馈后第二赛季标准审核中'),
  ('tonharbor', '创始人访谈中暗示追溯分发'),
  ('shadowroll', '旧版本预言机事件仍未修复'),
  ('mevrelay-pro', '"保证额度"说法在社交渠道扩散'),
  ('claimmirror', '社区举报领取仿冒域名')
) as fixture(slug, signal_title)
join projects as project on project.slug = fixture.slug
join signals as signal
  on signal.project_id = project.id and signal.title = fixture.signal_title
on conflict (id) do nothing;

insert into evidence (
  id, source_id, raw_item_id, source_field, quote_text,
  normalized_quote_sha256, verified_at, created_at
)
select
  pg_catalog.md5('demo-evidence-record:' || fixture.slug)::uuid,
  pg_catalog.md5('demo-evidence-source:' || fixture.slug)::uuid,
  pg_catalog.md5('demo-evidence-raw:' || fixture.slug)::uuid,
  'article_raw_text',
  signal.summary,
  public.evidence_quote_sha256_v1(signal.summary),
  signal.created_at,
  signal.created_at
from (values
  ('novanet', 'NovaNet 节点运营者积分延长至第 12 周'),
  ('orbitlend', 'OrbitLend 第二赛季积分活动开启'),
  ('solforge-perp', '公开任务平台开启推荐任务轮次'),
  ('monacharge', '金库多次售罄后额度上调'),
  ('zkterminal', '发布赏金类测试网任务'),
  ('hyperbridge-x', '代币经济页面新增激励占位章节'),
  ('baseclique', '每周互动活动奖励活跃小队'),
  ('arbnav-wallet', '收集反馈后第二赛季标准审核中'),
  ('tonharbor', '创始人访谈中暗示追溯分发'),
  ('shadowroll', '旧版本预言机事件仍未修复'),
  ('mevrelay-pro', '"保证额度"说法在社交渠道扩散'),
  ('claimmirror', '社区举报领取仿冒域名')
) as fixture(slug, signal_title)
join projects as project on project.slug = fixture.slug
join signals as signal
  on signal.project_id = project.id and signal.title = fixture.signal_title
on conflict (id) do nothing;

insert into signal_evidence_links (signal_id, evidence_id)
select signal.id, pg_catalog.md5('demo-evidence-record:' || fixture.slug)::uuid
from (values
  ('novanet', 'NovaNet 节点运营者积分延长至第 12 周'),
  ('orbitlend', 'OrbitLend 第二赛季积分活动开启'),
  ('solforge-perp', '公开任务平台开启推荐任务轮次'),
  ('monacharge', '金库多次售罄后额度上调'),
  ('zkterminal', '发布赏金类测试网任务'),
  ('hyperbridge-x', '代币经济页面新增激励占位章节'),
  ('baseclique', '每周互动活动奖励活跃小队'),
  ('arbnav-wallet', '收集反馈后第二赛季标准审核中'),
  ('tonharbor', '创始人访谈中暗示追溯分发'),
  ('shadowroll', '旧版本预言机事件仍未修复'),
  ('mevrelay-pro', '"保证额度"说法在社交渠道扩散'),
  ('claimmirror', '社区举报领取仿冒域名')
) as fixture(slug, signal_title)
join projects as project on project.slug = fixture.slug
join signals as signal
  on signal.project_id = project.id and signal.title = fixture.signal_title
on conflict (signal_id, evidence_id) do nothing;

insert into score_signal_links (project_score_id, signal_id)
select score.id, signal.id
from (values
  ('novanet', 'NovaNet 节点运营者积分延长至第 12 周'),
  ('orbitlend', 'OrbitLend 第二赛季积分活动开启'),
  ('solforge-perp', '公开任务平台开启推荐任务轮次'),
  ('monacharge', '金库多次售罄后额度上调'),
  ('zkterminal', '发布赏金类测试网任务'),
  ('hyperbridge-x', '代币经济页面新增激励占位章节'),
  ('baseclique', '每周互动活动奖励活跃小队'),
  ('arbnav-wallet', '收集反馈后第二赛季标准审核中'),
  ('tonharbor', '创始人访谈中暗示追溯分发'),
  ('shadowroll', '旧版本预言机事件仍未修复'),
  ('mevrelay-pro', '"保证额度"说法在社交渠道扩散'),
  ('claimmirror', '社区举报领取仿冒域名')
) as fixture(slug, signal_title)
join projects as project on project.slug = fixture.slug
join project_scores as score
  on score.project_id = project.id and score.model_version = 'seed-fixture-v1'
join signals as signal
  on signal.project_id = project.id and signal.title = fixture.signal_title
on conflict (project_score_id, signal_id) do nothing;
