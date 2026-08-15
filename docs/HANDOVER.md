# Airdrop Intelligence OS — 交接手册

> 交接日期：2026-08-14
> 交接方：WorkBuddy（前序 Phase 0–3 开发）
> 接收方：GPT Codex
> 权威规范：仓库根目录 `AGENTS.md`（产品规则与工程约束的唯一事实来源，本手册不重复其内容，只补充现状与经验）

---

## 1. 项目定位（一段话版）

Web3 空投情报与决策平台（Airdrop Intelligence OS）：回答「今天该参与哪几个空投」。**不是**资讯聚合站，**不是**自动撸毛机器人。六大系统中的前四个（情报采集 → AI 抽取 → 确定性评分 → 页面展示）已端到端打通，且采集之外的两个 AI 阶段（抽取、评分）已由 worker 内的编排循环自动驱动（人工 Promotion 门禁保留）；教程、任务管理、通知、安全风控尚未开始。

核心铁律（详见 AGENTS.md）：永不接触私钥/助记词；永不自动签名；机会分、风险分、置信度三者独立不得合成单一总分；AI 输出只是候选数据，写入正式事实必须走 Promotion Service 并留审计；冲突证据保持可见，不静默覆盖。

---

## 2. 进度总览

### ✅ 已完成（按提交顺序，全部在分支 `codex/phase-0-1-foundation`）

| 阶段 | 内容 | 关键提交 |
|------|------|----------|
| Phase 0/1 | Monorepo 骨架（apps/web + apps/worker + packages/contracts·domain·database）、TS strict、9 个基础迁移（identity / catalog / intelligence / scores / execution / RLS / 读模型视图）、`/api/v1/health`、admin schedule API、verify 门禁 | 历史提交至 `57aa681` 之前 |
| Phase 2A | 源采集内核：RSS/Atom 解析（saxes）、官方源采集、正文抓取、feed replay 防护、跨源 replay 拒绝 | `3e737aa`、`4293c8c`、`d39f3f2` |
| Phase 2B | 持久化采集队列：durable queue 表、SKIP LOCKED + lease_epoch 围栏、调度器/消费者/组合根、30s 有界优雅停机、8 项敏感性变异全闭环、pgTAP 782 + 集成 20 + E2E 2 | `577ad8c`…`3c3ea5b` |
| 页面落地 | Overview / Opportunities（Tab+游标分页）/ Project Detail（三分立指标卡+信号时间线）三页面，消费 `opportunity_list` / `project_current_state` 读模型视图；12 个中文 seed 项目 | `b67f158` |
| 全站汉化 | UI 文案 + 12 个 seed 项目数据全部简体中文，`lang="zh-CN"` | `d96b69c` |
| Phase 3 管线 | `ai_runs` / `extraction_candidates` / `promotion_events` 三表 + `promote_extraction_candidate` security-definer 函数；contracts zod schema（additionalProperties: false）；extraction repository；DeepSeek（OpenAI 兼容）model client；抽取运行器（幂等、一次 schema-repair、evidenceQuote 空白归一化 grounding）+ 8 个 mock 单测 | `08c8992` |
| 真实数据源 | Ethereum 项目 + EF 博客 RSS（official+verified）fixtures；一次性采集入口 `collect-once.ts`；首次真实采集入库（21 raw_items / 120 discovered / 20 正文） | `0e097c1` |
| **端到端打通** | DeepSeek 真实抽取 130 输入全部处理（EF 博客 120 条正确判零候选；airdrops.io 真实 feed 10 条 → **6 个 grounded 候选 → 6 个 promoted signals**，含审计事件，`/projects/ethereum` 页面可见）；三个 CLI 补自执行入口；`ai_stage_worker` 读权限 RLS 迁移；`dev_fixture_admin` 开发注入角色 | `e0cd5e5`（当前 HEAD） |
| **Phase 4 评分管线** | `packages/domain/src/scoring/score-model.ts` 确定性评分（机会/风险/置信度三轴独立 + 因子分解 + recommendation 决策表，11 个单测）；迁移 `20260815000100_scoring_factors`（score_factors + score_signal_links 两表，ai_stage_worker 写权限）与 `20260815000200_score_factors_axis_unique`（唯一约束修正为按轴）；`scoring-repository.ts`（事务写入 + on-conflict 回查）；`score-projects.ts` runner + `run-scoring.ts` CLI；真实库跑通 **12 个项目评分**（Ethereum 67.30/60.00/35% watch），重跑 12/12 幂等；Ethereum 自动进入 `opportunity_list`（第 6 位）；详情页 fixture 提示同步更新 | `1e9b675` |
| **Phase 5 常态化编排**（2026-08-15） | worker 进程内新增 AI 阶段编排循环（不动已硬化的采集 durable queue）：`packages/domain/src/orchestration/backoff.ts`（指数退避纯函数，7 单测）；`listPendingInputs` 毒物防护对齐——排除**一切**已有 run 的输入（schema 唯一键使失败重试必然重复 `on conflict do nothing`，故语义改为每输入至多一次尝试，失败输入成为事实 dead-letter，待 review 流接手）；`apps/worker/src/orchestration/`（ports + ai-stage-orchestrator 双定时循环 + create-ai-stage-runtime 组合根，13 个单测）；`index.ts` opt-in 集成——设 `AIRDROP_AI_STAGE_DATABASE_URL` + `AI_MODEL_API_KEY` 即启用（tick 可用 `AIRDROP_ORCHESTRATION_EXTRACT_TICK_MS` / `AIRDROP_ORCHESTRATION_SCORING_TICK_MS` 覆盖），缺席则单行 `ai_stage_orchestration_disabled` 日志后纯采集模式；远程库补建 `collection_queue_worker_login` 登录角色；真实库端到端验证：注入 discovered_item → extraction tick 自动拾取并真实调用 DeepSeek 产出候选 → 人工 promote → scoring tick 自动检测 input_version 变化重算（novanet 83.2/20/31 → 74.8/40/27，三轴独立语义正确），页面正确渲染 | `97983ad` |

当前测试基线：**`pnpm verify` 全绿**（lint / typecheck / test / build / placeholders）。测试通过 508（contracts 38 / domain 210 / database 80 / web 17 / worker 163）；另有 database 20 个集成测试与 worker 2 个 e2e 需远程库环境变量，默认 skip。Phase 5 新增 domain 7 + worker 13 = 20 个编排测试。

### ⚠️ 半成品 / 已知缺口

| 项 | 状态 | 说明 |
|----|------|------|
| `collection_schedule_admin_login` 角色 | **不存在** | 早期经 ssh 传 `DO $$` 块静默失败遗留。`apps/web/.env.local` 里的 `AIRDROP_QUEUE_ADMIN_DATABASE_URL` 指向它，**目前不可用**。需要时用平铺语句重建：`create role collection_schedule_admin_login with login password '...' in role collection_schedule_admin;`（注意：`collection_queue_worker_login` 已于 Phase 5 补建，模式可参考 §6.2） |
| airdrops.io 数据接入方式 | **开发注入，非正式通道** | 采集器 INSERT 策略深度校验「official+verified」，第三方源被正确拒绝（产品设计）。当前用 `dev_fixture_admin`（bypassrls，仅 raw_items/discovered_items 两表 insert/select）+ `seed-nonofficial-feed.ts` 注入真实 feed。**正式的多源接入（含第三方源的审核接收流）尚未设计实现** |
| worktree | `.worktrees/phase-2-source-collection` | Phase 2 时代的 worktree，其提交已全部在主分支历史中，确认后可清理 |

### ❌ 未开始（按建议优先级）

1. ~~**评分管线**~~ ✅ **2026-08-15 完成**：score-model-v1 确定性评分 + 因子分解 + recommendation 决策表；Ethereum 及 11 个 demo 项目全部评分，Ethereum 自动进入 `opportunity_list`。见 `docs/superpowers/specs/2026-08-15-score-pipeline-design.md`
2. ~~**机会列表纳入真实项目**~~ ✅ **2026-08-15 完成**：Ethereum 评分后由读模型视图自动纳入（第 6 位）
3. **schema_invalid / 反复 grounding 失败的 review 流**：目前只有 success/empty 路径，失败输入没有 dead-letter 审核界面。Phase 5 的毒物防护已把「失败输入不再重试」落进 `listPendingInputs`（每输入至多一次尝试），这些输入静静躺在库里等 review 流接手
4. ~~**采集→抽取→评分的常态化编排**~~ ✅ **2026-08-15 完成（Phase 5）**：worker 进程内 AI 阶段编排循环（抽取 60s / 评分 300s 默认 tick，指数退避，错误隔离，opt-in 环境变量）。采集队列未动；人工 Promotion 门禁按产品设计保留。见 `docs/superpowers/specs/2026-08-15-orchestration-design.md`
5. 教程生成（tutorials，含 `last_verified_at`、链接白名单、状态联动）
6. 任务管理（用户项目、watchlist、tasks）
7. 通知系统（alerts、偏好）
8. 安全风控（incidents、indicators、protect-first 工作流）
9. 用户认证与私有数据（profiles、RLS user_id 场景目前未启用）
10. 运营/审核后台界面（目前只有 API）；详情页尚无 score_factors / score_signal_links 的展示（数据已落库，anon 读策略未开，随详情页因子展示一起做）
11. 多源扩展：X/Twitter、项目方公告页结构化解析等

---

## 3. 架构与代码地图

```
apps/
  web/                      # Next.js（App Router，Turbopack）
    src/app/                #   / (Overview)  /opportunities  /projects/[slug]
    src/app/api/v1/         #   health、admin/source-collection-schedules
    src/components/         #   app-shell（导航/页脚）、opportunity-elements
    src/lib/                #   数据访问
    src/types/next-modules.d.ts  # ⚠️ next/link、next/navigation 的最小 tsc shim（见 §6 坑 4）
  worker/                   # 无 HTTP 端口的生命周期进程
    src/collection/         #   采集内核：RSS 解析、正文抓取、replay 防护
    src/queue/              #   durable queue：scheduler、consumer、lease 围栏
    src/ai/                 #   ⭐ Phase 3：model-client、extract-discovered、
    src/ai/                 #      run-extract.ts / promote-candidate.ts（CLI）
    src/scoring/            #   ⭐ Phase 4：score-projects runner、run-scoring CLI
    src/orchestration/      #   ⭐ Phase 5：AI 阶段编排循环（抽取/评分双 tick、
    src/orchestration/      #      退避、错误隔离、opt-in 组合根）
    src/e2e/                #   collect-once.ts、seed-nonofficial-feed.ts（开发注入）
packages/
  contracts/                # 唯一契约源：API/AI 输出/任务 payload zod schema
  domain/                   # 纯业务规则（禁依赖 Next/DB/OpenAI/HTTP）
  database/                 # repository、迁移产物、outbox；src/generated/ 为生成类型
supabase/
  migrations/               # 14 个 forward-only 迁移（勿改已应用者）
  fixtures/                 #   demo-projects.sql（12 个虚构中文项目，幂等）
                           #   real-sources.sql（Ethereum + EF 博客 + airdrops.io）
scripts/                    # check-placeholders、verify-env
docs/
  architecture/             # phase-0-1、phase-2 架构文档
  runbooks/local-development.md   # 本地开发流程（权威）
  superpowers/              # 各阶段设计文档与 SDD 计划（历史决策依据）
  tasks/                    # 各阶段 workbook
```

### 数据流（已打通部分）

```
官方 RSS ──collect-once/队列──▶ raw_items ──▶ discovered_items（feed 条目）
                                              │
airdrops.io feed ──dev_fixture_admin 注入──▶（同上表结构）
                                              │
              run-extract.ts（DeepSeek, 幂等, grounding 过滤）
                                              │
                                    ai_runs（每次运行全量留痕）
                                              │
                              extraction_candidates（pending）
                                              │
                 promote-candidate.ts（人工审核后提升）
                                              │
                    ┌─────────────────────────┤
              signals（正式事实）      promotion_events（审计）
                    │
        project_current_state / opportunity_list（读模型视图）
                    │
            /projects/ethereum 页面渲染 ✅
```

### 数据库角色速查（密码均为 `local-password`，仅限本地）

| 登录角色 | SET ROLE 到 | 用途 |
|----------|-------------|------|
| `collection_worker_login` | collection_worker | 采集持久化 |
| `ai_stage_worker_login` | ai_stage_worker | AI 抽取阶段读写 |
| `collection_queue_worker_login` | collection_queue_worker | 队列操作 |
| `collection_schedule_admin_login` | ⚠️ **未建成** | 调度管理（见 §2 缺口） |
| `dev_fixture_admin` | （bypassrls） | 开发注入 fixture，仅 raw_items/discovered_items 的 insert/select |

---

## 4. 环境与运行

### 远程 Supabase（当前唯一真实数据库，本地无 Docker）

```bash
# SSH（密钥与地址）
ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 root@115.190.206.200

# 隧道（保持开着才能连库）
ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 -N \
  -L 15432:localhost:54322 -L 15433:localhost:54321 root@115.190.206.200
#   15432 → Postgres(54322)   15433 → Kong API(54321)

# 远程 psql（本地无 psql 客户端）
ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 root@115.190.206.200 \
  "docker exec supabase_db_airdrop-intelligence-os psql -U postgres -d postgres -c \"<SQL>\""
```

### 环境变量（全部在 `apps/web/.env.local`，已 gitignore，不入库）

| 变量 | 用途 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器端（经隧道 15433） |
| `AIRDROP_QUEUE_ADMIN_DATABASE_URL` | ⚠️ 指向未建成角色，暂不可用 |
| `AIRDROP_QUEUE_DATABASE_URL` | 队列 worker 身份 |
| `AIRDROP_COLLECTION_DATABASE_URL` | 采集身份：`postgresql://collection_worker_login:local-password@127.0.0.1:15432/postgres` |
| `AIRDROP_AI_STAGE_DATABASE_URL` | 抽取身份：`postgresql://ai_stage_worker_login:local-password@127.0.0.1:15432/postgres` |
| `AI_MODEL_API_KEY` | DeepSeek Key（`sk-` 开头，本地-only） |
| `AIRDROP_COLLECTION_USER_AGENT` | 出站 UA |
| `AIRDROP_QUEUE_WORKER_ID` | 队列 worker 标识 |
| `AIRDROP_ORCHESTRATION_EXTRACT_TICK_MS` | 可选：抽取 tick 间隔（默认 60000） |
| `AIRDROP_ORCHESTRATION_SCORING_TICK_MS` | 可选：评分 tick 间隔（默认 300000） |

> ⭐ **Phase 5 编排 opt-in**：worker 启动时若同时存在 `AIRDROP_AI_STAGE_DATABASE_URL` 与 `AI_MODEL_API_KEY`，则自动运行 AI 阶段编排循环（抽取/评分定时 tick）；任一缺席即纯采集模式（日志 `ai_stage_orchestration_disabled`）。promotion（候选→signal）按产品设计保持人工 CLI。

### 常用命令

```bash
pnpm dev                # web + worker 并行开发（web 在 localhost:3000）
                        # ⭐ 若 .env.local 同时含 AIRDROP_AI_STAGE_DATABASE_URL 与
                        #    AI_MODEL_API_KEY，worker 自动运行抽取/评分编排循环
pnpm verify             # lint + typecheck + test(508) + build + placeholders
env -u NODE_OPTIONS pnpm verify   # ⚠️ 必须这样跑（见 §6 坑 1）

# 手动评分（一次性，幂等：input_version 哈希）
AIRDROP_AI_STAGE_DATABASE_URL=... npx tsx apps/worker/src/scoring/run-scoring.ts

# AI 抽取（一次性，幂等：input_kind+input_id+input_hash+pipeline_version）
AIRDROP_AI_STAGE_DATABASE_URL=... AI_MODEL_API_KEY=... AI_EXTRACT_MAX_INPUTS=50 \
  npx tsx apps/worker/src/ai/run-extract.ts

# 列出/提升候选（promote 前应人工审核 payload）
npx tsx apps/worker/src/ai/promote-candidate.ts list
npx tsx apps/worker/src/ai/promote-candidate.ts promote <candidate-id>

# 手动采集官方源
npx tsx apps/worker/src/e2e/collect-once.ts <project-id> <source-id>

# 开发注入第三方 feed（绕过 official 限制的专用通道）
AIRDROP_DEV_FIXTURE_DATABASE_URL=postgresql://dev_fixture_admin:local-password@127.0.0.1:15432/postgres \
  npx tsx apps/worker/src/e2e/seed-nonofficial-feed.ts <project-id> <source-id> <feed-url>
```

### 关键数据锚点

- Ethereum 项目 id：`fc77de62-1253-4fbc-a589-da4e7084eac7`（slug `ethereum`）
- 源 id：EF 博客 `90000000-0000-4000-8000-000000000030`；airdrops.io `90000000-0000-4000-8000-000000000031`
- 6 个真实 signals 已发布于 `/projects/ethereum`（Ondo 积分、$INK 空投、TrueNorth 等）

---

## 5. 数据库迁移注意（远程操作规程）

1. 迁移文件放 `supabase/migrations/`（forward-only，**绝不修改已应用者**）
2. 远程执行 SQL 后必须手工登记：
   ```sql
   insert into supabase_migrations.schema_migrations (version, name, statements)
   values ('<YYYYMMDDHHMMSS>', '<name>', '{}')
   on conflict (version) do nothing;
   ```
   ⚠️ `statements` 是**数组类型**，空值必须写 `'{}'`（写 `''` 会 malformed array literal）
3. 涉及 security_invoker 视图的迁移：视图引用的底表**每一列**都要对查询角色有列级 SELECT 授权，漏一列就是 42501（曾因此返工，见迁移 `20260814002000`）

---

## 6. 踩坑记录（血泪教训，务必读）

1. **`NODE_OPTIONS` 污染**：本机 shell 注入 `--use-system-ca` 会让 `next build` 失败。跑 verify 前必须 `env -u NODE_OPTIONS`（同时 unset `NODE_TLS_REJECT_UNAUTHORIZED`）。
2. **经 ssh 传 `DO $$ ... $$` 块会静默失败**（exit 0 但什么都没做）。建角色/密码等 DDL 一律用平铺语句。`collection_schedule_admin_login` 缺失就是这么来的。
3. **RLS 静默过滤不报错**：角色缺 SELECT 策略时查询返回空集而非报错。症状：「数据明明在，程序说没有」。排查：`set role <role>; select count(*) from <table>;`，再查 `pg_policies`。本次 `ai_stage_worker` 读不到待抽取输入就是这样，补了迁移 `20260814120000`。
4. **Turbopack + workspace 包**：apps/web 的 tsconfig 必须保持 **NodeNext**（无 paths/baseUrl），配 `src/types/next-modules.d.ts` shim 供 tsc。**勿用 bundler 模式**——会关闭 Turbopack 的 `.js`→`.ts` 解析，workspace 包 import 全挂。
5. **CLI 文件必须带自执行入口**：只 `export function main()` 不调用，`tsx` 运行时静默无操作（exit 0）。三个 CLI 都已修复，新增 CLI 时注意。
6. **`on conflict do nothing` 后做外键插入**：冲突被跳过时要**回查已有行的 id** 再引用，否则外键悬空。`discovered_items` 幂等键是 `(feed_raw_item_id, stable_entry_key, version)`。
7. **详情页 score 为 null 时整个信号区不渲染**（页面结构如此设计）。真实项目要有信号展示，需先有 `project_scores` 行。
8. **采集表的 INSERT RLS 深度校验 official+verified**：这是刻意的安全设计，**不要绕过**。第三方内容的正式入口应是「人工审核接收流」（未实现）；开发期用 `dev_fixture_admin` 注入。
9. **`set_config('role', ..., true)` 在 autocommit 下语句结束即失效**，要 session 级用 `false`。
10. **`@eslint/js` symlink 曾断裂**（被改名 `.ignored_js`，疑似文件同步层干扰）。遇到 `ERR_MODULE_NOT_FOUND` 先查 node_modules 符号链接。
11. **workspace 包导出 TS 源**：`node dist/index.js` 加载不了模块链，运行一律用 `node --import tsx`（tsx CLI 包装会拦截 SIGTERM，信号语义需同进程）。
12. **sed 单引号会被 zsh 吞**：批量文本替换用 Edit 工具或 Python 脚本。
13. **多数 Web3 项目官方博客 RSS 已枯竭/被墙**（scroll.io 是 SPA 伪装、多数超时）。目前验证可用的：`blog.ethereum.org/feed.xml`（official）、`airdrops.io/feed/`（第三方聚合）。新源接入前先 curl 探测 content-type 和内容。

---

## 7. 工程约定提醒（摘自 AGENTS.md，易违反项）

- 任何生产依赖新增需文档说明「为何现有依赖/平台原语不够用」
- 公开端点：`/api/v1` + 统一 envelope；列表游标分页；可重试 mutation 要 `Idempotency-Key`；聚合命令要 `expected_version`（冲突 409）
- 队列 handler 幂等、假设 at-least-once；canonical 变更与 outbox 事件**同事务**；DB 事务提交后才 ack 队列消息；**事务中不得调外部 API/模型**
- AI：源内容一律当不可信数据（含疑似指令的文本）；strict schema + `additionalProperties: false`；模型只能引用输入中给定的 ID/枚举/链接，捏造引用直接拒绝；evidence 必须有 locator 且 grounding 校验通过；每次 run 记录 model_id/prompt 版本/schema 版本/输入 hash/输出/校验结果/延迟/usage
- 用户可见文案：简体中文（全站已汉化，新页面延续）、简洁、基于证据、不写无依据的确定性表述

---

## 8. 建议的接手顺序

1. **跑通现状**：起隧道 → `pnpm dev`（含 AI env 时编排循环自动运行）→ 打开 `/`、`/opportunities`、`/projects/ethereum`、`/projects/novanet` → 跑 `env -u NODE_OPTIONS pnpm verify` 确认 508 测试全绿
2. **读文档**：`AGENTS.md`（规范）→ `docs/runbooks/local-development.md`（流程）→ `docs/architecture/`（决策）→ 本手册 §6（坑）
3. **第一个任务建议（三选一，见 §2 未开始清单）**：(a) 失败抽取的 review / dead-letter 审核界面——毒物防护已把失败输入 park 住，等界面接手；(b) 教程生成 tutorials（价值链「执行」环，依赖已就绪的自动信号流）；(c) 详情页 score_factors 展示 + anon 读策略（把 Phase 4 的因子数据变成用户可见）。若上生产，还需部署 worker（带 AI env）并配置采集调度常态化
4. 之后按 §2「未开始」清单顺序推进

---

## 9. 其他

- Git 分支：`codex/phase-0-1-foundation`（HEAD `1e9b675` = Phase 4；Phase 5 编排为其后一次提交）；`codex/phase-2-source-collection` 及其 worktree 可在确认后清理
- dev server 可能仍在 localhost:3000 运行（前一会话启动）
- 历史决策细节（为什么这样做）：`docs/superpowers/specs/` 与 `docs/superpowers/plans/` 下的设计文档
- DeepSeek 计费注意：130 次真实抽取消耗约 62 万 prompt tokens（每输入截取 12K 字符上限）；批量跑前评估成本
- 交接时的数据库快照：16 迁移已应用；14 项目（12 demo + Ethereum + novanet 等实为 13 项目含 novanet + Ethereum）；raw_items 23；discovered_items 131；ai_runs 131（130 Phase 3 + 1 Phase 5 编排验证）；extraction_candidates 7（全 promoted）；signals 20（demo + 6 Ethereum 真实 + 1 novanet 编排验证）；project_scores 26 行（12 项目含历史版本行）；score_factors 117；score_signal_links 已建。novanet 的 `airdrop_season_announcement` 信号及其评分（74.8/40/27 watch）是 Phase 5 端到端验证产物，内容为合成测试数据
