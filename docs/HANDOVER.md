# Airdrop Intelligence OS — 交接手册

> 交接日期：2026-08-14（WorkBuddy → GPT Codex）
> 最近更新：2026-08-22（Phase 6B Task 4 authenticated BFF/routes 已完成实现并进入独立评审；三条 API 均使用既有 verifier、request-local bearer、严格共享契约与清洗后的错误响应；Phase 6A 生产证据见 §8.2）
> 权威规范：仓库根目录 `AGENTS.md`（产品规则与工程约束的唯一事实来源，本手册不重复其内容，只补充现状与经验）
>
> **当前一句话状态**：Phase 0–6A 全部完成并合并在主线 `codex/phase-0-1-foundation`（HEAD 以 `git log --oneline -1` 为准），Phase 6B Task 1–3 已完成，Task 4 实现待独立评审；当前分支 `pnpm verify` 726 测试全绿，disposable pgTAP 1031/1031、repository integration 37/37；**生产库仍只应用 Phase 6A 的 19 个迁移并完成 Evidence 补证/对账**，第 20 个 forward migration 未访问或修改生产库。

> **2026-08-22 本轮接续结果**：先完成 225 个跟踪产出与主线核验，再按 §8.2 将 Phase 6A 三迁移原子应用并逐条登记；创建强随机密码的最小权限治理登录与在册审核人；补齐 12 组 demo Evidence；历史对账 `processed=7 / linked=7 / needsReview=0` 且重跑为 0；四个真实 Web 请求均为 HTTP 200。Phase 6B Task 1 contracts、Task 2 数据库边界、Task 3 repository/generated types 均已通过；Task 4 已增加 authenticated list/detail/decision BFF 与三条薄 route，39 个 focused handler 测试和 Node 22 全仓门禁通过，等待独立评审；生产未访问。

---

## 1. 项目定位（一段话版）

Web3 空投情报与决策平台（Airdrop Intelligence OS）：回答「今天该参与哪几个空投」。**不是**资讯聚合站，**不是**自动撸毛机器人。六大系统中的前四个（情报采集 → AI 抽取 → 确定性评分 → 页面展示）已端到端打通，采集之外的两个 AI 阶段（抽取、评分）由 worker 内编排循环自动驱动；Phase 6A 又把「AI 候选 → 人工审核 → Evidence 证据链 → 公开可见」的最后一环硬化为可执行的数据库边界（专用 promotion_service 角色、受保护幂等命令、审计与事务性 outbox，公开数据一律 Evidence 门禁）。教程、任务管理、通知、安全风控尚未开始。

核心铁律（详见 AGENTS.md）：永不接触私钥/助记词；永不自动签名；机会分、风险分、置信度三者独立不得合成单一总分；AI 输出只是候选数据，写入正式事实必须走 Promotion Service 并留审计；冲突证据保持可见，不静默覆盖。

---

## 2. 进度总览

### ✅ 已完成（按提交顺序；Phase 0–5 直接在 `codex/phase-0-1-foundation`，Phase 6A 在独立分支开发后已合并回主线）

| 阶段 | 内容 | 关键提交 |
|------|------|----------|
| Phase 0/1 | Monorepo 骨架（apps/web + apps/worker + packages/contracts·domain·database）、TS strict、9 个基础迁移（identity / catalog / intelligence / scores / execution / RLS / 读模型视图）、`/api/v1/health`、admin schedule API、verify 门禁 | 历史提交至 `57aa681` 之前 |
| Phase 2A | 源采集内核：RSS/Atom 解析（saxes）、官方源采集、正文抓取、feed replay 防护、跨源 replay 拒绝 | `3e737aa`、`4293c8c`、`d39f3f2` |
| Phase 2B | 持久化采集队列：durable queue 表、SKIP LOCKED + lease_epoch 围栏、调度器/消费者/组合根、30s 有界优雅停机、8 项敏感性变异全闭环、pgTAP 782 + 集成 20 + E2E 2 | `577ad8c`…`3c3ea5b` |
| 页面落地 | Overview / Opportunities（Tab+游标分页）/ Project Detail（三分立指标卡+信号时间线）三页面，消费 `opportunity_list` / `project_current_state` 读模型视图；12 个中文 seed 项目 | `b67f158` |
| 全站汉化 | UI 文案 + 12 个 seed 项目数据全部简体中文，`lang="zh-CN"` | `d96b69c` |
| Phase 3 管线 | `ai_runs` / `extraction_candidates` / `promotion_events` 三表 + `promote_extraction_candidate` security-definer 函数；contracts zod schema（additionalProperties: false）；extraction repository；DeepSeek（OpenAI 兼容）model client；抽取运行器（幂等、一次 schema-repair、evidenceQuote 空白归一化 grounding）+ 8 个 mock 单测 | `08c8992` |
| 真实数据源 | Ethereum 项目 + EF 博客 RSS（official+verified）fixtures；一次性采集入口 `collect-once.ts`；首次真实采集入库（21 raw_items / 120 discovered / 20 正文） | `0e097c1` |
| **端到端打通** | DeepSeek 真实抽取 130 输入全部处理（EF 博客 120 条正确判零候选；airdrops.io 真实 feed 10 条 → **6 个 grounded 候选 → 6 个 promoted signals**，含审计事件，`/projects/ethereum` 页面可见）；三个 CLI 补自执行入口；`ai_stage_worker` 读权限 RLS 迁移；`dev_fixture_admin` 开发注入角色 | `e0cd5e5` |
| **Phase 4 评分管线** | `packages/domain/src/scoring/score-model.ts` 确定性评分（机会/风险/置信度三轴独立 + 因子分解 + recommendation 决策表，11 个单测）；迁移 `20260815000100_scoring_factors`（score_factors + score_signal_links 两表，ai_stage_worker 写权限）与 `20260815000200_score_factors_axis_unique`（唯一约束修正为按轴）；`scoring-repository.ts`（事务写入 + on-conflict 回查）；`score-projects.ts` runner + `run-scoring.ts` CLI；真实库跑通 **12 个项目评分**（Ethereum 67.30/60.00/35% watch），重跑 12/12 幂等；Ethereum 自动进入 `opportunity_list`（第 6 位）；详情页 fixture 提示同步更新 | `1e9b675` |
| **Phase 5 常态化编排**（2026-08-15） | worker 进程内新增 AI 阶段编排循环（不动已硬化的采集 durable queue）：`packages/domain/src/orchestration/backoff.ts`（指数退避纯函数，7 单测）；`listPendingInputs` 毒物防护对齐——排除**一切**已有 run 的输入（schema 唯一键使失败重试必然重复 `on conflict do nothing`，故语义改为每输入至多一次尝试，失败输入成为事实 dead-letter，待 review 流接手）；`apps/worker/src/orchestration/`（ports + ai-stage-orchestrator 双定时循环 + create-ai-stage-runtime 组合根，13 个单测）；`index.ts` opt-in 集成——设 `AIRDROP_AI_STAGE_DATABASE_URL` + `AI_MODEL_API_KEY` 即启用（tick 可用 `AIRDROP_ORCHESTRATION_EXTRACT_TICK_MS` / `AIRDROP_ORCHESTRATION_SCORING_TICK_MS` 覆盖），缺席则单行 `ai_stage_orchestration_disabled` 日志后纯采集模式；远程库补建 `collection_queue_worker_login` 登录角色；真实库端到端验证：注入 discovered_item → extraction tick 自动拾取并真实调用 DeepSeek 产出候选 → 人工 promote → scoring tick 自动检测 input_version 变化重算（novanet 83.2/20/31 → 74.8/40/27，三轴独立语义正确），页面正确渲染 | `97983ad` |
| **Phase 6A 正式情报治理**（2026-08-21 完成，分支 `codex/phase-6a-canonical-governance`） | 把 Evidence、人工审核、Promotion、审计、事务性 outbox 从 CLI 约定升级为**可执行的数据库边界**：`evidence` / `signal_evidence_links` / `candidate_review_decisions` / `promotion_commands` / `outbox_events` 五表 + 专用 `promotion_service` NOLOGIN 角色 + 受保护幂等命令 `execute_extraction_candidate_review`（审核人在册、期望版本、确定性 grounding、单事务原子写入）与 `reconcile_extraction_candidate_evidence`（历史对账）；撤销 `ai_stage_worker` 直接 INSERT signals 与旧 promote 函数执行权；公开 signal/score 读模型与评分输入全部改为 **Evidence 门禁**（无证据历史保留但隐藏，不删除）；`review-candidate.ts` 治理审核 CLI（approve/reject/needs-review，读 `AIRDROP_PROMOTION_DATABASE_URL` + `AIRDROP_PROMOTION_REVIEWER_USER_ID`）替代旧 promote-candidate（已 fail-closed）；`reconcile-historical-evidence.ts` 有界幂等对账 runner（批次 1-100、UUID 游标、确定性幂等键）；seed/demo fixtures 全部补显式虚构 Evidence；契约与纯函数 grounding 规则（Unicode 空白归一化 + 精确包含 + SHA-256）跨 TS/PG 一致（码点级长度、代理对拒绝）。详见 `docs/superpowers/specs/2026-08-20-canonical-intelligence-governance-design.md` | `a9f1490`…`768df85` + `b67e7a3`（共 19 提交，分支 `codex/phase-6a-canonical-governance`）；2026-08-21 fast-forward 合并回主线，合并后主线 verify 全绿 |
| **Phase 6A 生产落地**（2026-08-22） | 三迁移原子应用并登记；生产治理登录/审核人就绪；12 组 demo Evidence 已补齐；7 个历史 promoted candidates 全部 deterministic-ground 成功并 linked；对账重跑为 0；匿名机会读模型 12 行，Ethereum 6 条真实 signals 恢复；页面验证通过 | 逐步运行证据见 §8.2 |
| **Phase 6B Task 1 contracts**（2026-08-22） | `packages/contracts/src/review/failed-ai-run.ts` 提供严格失败运行状态、查询、无原始错误的安全投影、审核历史、命令/回执 schemas 与 inferred types；决策 reason compatibility、版本边界、备注长度/空白、base64url cursor 均有测试；`packages/contracts/src/index.ts` 已公开导出 | `docs/tasks/failed-ai-run-review-workbook.md` Task 1 execution log；focused contracts 6 files / 77 tests passed，lint/typecheck passed |
| **Phase 6B Task 2 数据库边界（DONE）**（2026-08-22） | migration 保持不变；fix round 1 为普通 active `user` 拒绝、detail 精确/敏感键投影、command 精确结果签名、同时间 UUID 游标、101/102 limit 边界和三类非法 expected version 补强 pgTAP | disposable reset 应用 20 migrations exit 0；updated 011 Files=1 / Tests=87 / PASS；full pgTAP Files=11 / Tests=1031 / PASS；`errorDetail` mutation 命中具名 Failed test 31 并 exit 1，恢复 SHA 后 reset exit 0、focused 87 PASS；生产未访问。 |
| **Phase 6B Task 3 repository（DONE）**（2026-08-22） | 服务器专用 `@airdrop/database/failed-ai-run-review` 以每请求 bearer 创建非持久 Supabase client；strict parse list/detail/decision，安全生成下一页 cursor，稳定映射 AR101–AR105 并清洗意外错误；browser export fail-closed | generated types 两次 SHA-256 均为 `058c11dac49a44065f7bb9b509c0ac000df67b38f6ab4a925b29676ed479078d`；真实 Auth focused 3/3、全 repository integration 37/37；两种 race 均逐字段绑定唯一 decision/receipt/outbox 与获胜 result/key，outbox 仅七个安全字段；partial Auth signup cleanup 四分支有单测。 |
| **Phase 6B Task 4 authenticated BFF/routes（REVIEW）**（2026-08-22） | 新增失败 AI run list/detail/decision handlers 与三条 `/api/v1/review/ai-runs` routes；先用既有 `AuthenticatedUserVerifier` 验证，再提取并仅按请求传 bearer；严格解析 filter/cursor/limit、UUID、JSON command 与 `Idempotency-Key`；稳定错误映射为 bounded envelope，异常详情全部清洗 | focused handler 39/39；Web 56/56；lint/typecheck/build 全绿；Node 22.22.2 根 `pnpm verify` 726 tests、exit 0；Next 16 构建识别三条动态 route；未部署、未访问生产。 |

当前测试基线：**Node 22.22.2 / pnpm 11.16.0 下 `pnpm verify` 全绿**（lint / typecheck / test / build / placeholders），726 测试，exit 0。Web focused handler 39/39、Web package 56/56；隔离 Supabase 栈更新后的 011 SHA-256 为 `e9158648ea970d930a1fd9cd240d67d4d6e380b41c00d0c32754563368cda7e1`，focused 87/87、full pgTAP 1031/1031；strengthened repository integration 37/37，fixture cleanup 只在 marker 校验后的 disposable 数据库内按精确随机 ID 执行。

### ⚠️ 半成品 / 已知缺口

| 项 | 状态 | 说明 |
|----|------|------|
| `collection_schedule_admin_login` 角色 | **不存在** | 早期经 ssh 传 `DO $$` 块静默失败遗留。`apps/web/.env.local` 里的 `AIRDROP_QUEUE_ADMIN_DATABASE_URL` 指向它，**目前不可用**。需要时用平铺语句重建：`create role collection_schedule_admin_login with login password '...' in role collection_schedule_admin;`（注意：`collection_queue_worker_login` 已于 Phase 5 补建，模式可参考 §6.2） |
| airdrops.io 数据接入方式 | **开发注入，非正式通道** | 采集器 INSERT 策略深度校验「official+verified」，第三方源被正确拒绝（产品设计）。当前用 `dev_fixture_admin`（bypassrls，仅 raw_items/discovered_items 两表 insert/select）+ `seed-nonofficial-feed.ts` 注入真实 feed。**正式的多源接入（含第三方源的审核接收流）尚未设计实现** |
| Phase 6B integration fixture cleanup | **Task 3 已闭环** | 新 repository fixture 使用随机精确 ID，cleanup 前强制核对 disposable marker，并仅在该测试事务内以 replica 语义移除精确 fixture；reviewer-only、ordinary-only、both、neither 四种 Auth setup 状态均会独立清理已创建用户；生产 `ai_runs` append-only trigger 未改动。Task 7 继续沿用同一隔离原则。 |
| Failed-run decision concurrency proof | **Task 3 已闭环** | 两个独立 repository/client session 实测：同 reviewer+同 key 仅一写一 replay；同 run+不同 key/同 expected version 仅一成功，另一方 `review_version_conflict`。两种场景逐字段绑定唯一 decision/receipt/outbox、获胜 command/decision IDs 与 idempotency key；outbox payload 精确七个安全字段。 |
| worktree 清理 | **待清理（确认后执行，见 §8.3）** | `.worktrees/phase-2-source-collection`（提交已在主线历史）与 `.worktrees/phase-6a-canonical-governance`（分支已于 2026-08-21 合并回主线）均可清理：`git worktree remove <path>` + `git branch -d <branch>`。⚠️ phase-6a worktree 里若有未跟踪的个人文件，先自查再删 |

### ❌ 未开始（按建议优先级）

1. ~~**评分管线**~~ ✅ **2026-08-15 完成**：score-model-v1 确定性评分 + 因子分解 + recommendation 决策表；Ethereum 及 11 个 demo 项目全部评分，Ethereum 自动进入 `opportunity_list`。见 `docs/superpowers/specs/2026-08-15-score-pipeline-design.md`
2. ~~**机会列表纳入真实项目**~~ ✅ **2026-08-15 完成**：Ethereum 评分后由读模型视图自动纳入（第 6 位）
3. **失败 AI run 的交互式 review / dead-letter 界面（Phase 6B）**：Task 1 contracts、Task 2 数据库边界与 Task 3 bearer-scoped repository 已完成；Task 4 authenticated BFF/routes 已实现并待独立评审；`listPendingInputs` 毒物防护把失败输入 park 住（每输入至多一次尝试）。**尚未实现**：Task 5–7 的浏览器 session/API client、审核界面和端到端集成
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

### 2026-08-22 产出文件复核摘要

- **产品/UI 产出**：`apps/web` 已有 Overview、Opportunities、Project Detail 三个公开页面，另有 health 与采集调度管理 API；页面只消费数据库读模型，不承载采集、AI、评分等重任务。
- **后台能力产出**：`apps/worker` 已覆盖官方源采集、durable queue、AI 抽取、人工治理审核、历史 Evidence 对账、确定性评分和常态化抽取/评分编排。
- **共享边界产出**：`packages/contracts` 提供严格契约（含 Phase 6B failed AI run review）；`packages/domain` 提供网络/内容安全、队列策略、Evidence grounding、评分与退避纯规则；`packages/database` 提供浏览器隔离的 repository、事务与 server-only 入口。
- **数据库产出**：20 个 forward-only 迁移、11 个 pgTAP 文件、2 个 fixture 与本地 seed；生产仍为已应用 19 个迁移，第 20 个 Phase 6B migration 仅在 disposable 测试栈完成验收。
- **文档产出**：除本手册外共有 README、2 份架构说明、1 份本地运行手册、9 份阶段设计/计划和 4 份任务工作簿。`docs/superpowers/plans/` 内的复选框是历史执行模板，未逐项回填，**不得据其未勾选状态判断阶段未完成**；完成状态与 RED/GREEN 证据以 `docs/tasks/*workbook.md`、Git 提交和当前验证命令为准。
- **未发现新的未完成标记**：排除历史计划文本与本手册说明后，源码、迁移和测试中未发现常见的待办、修复或待定型开发占位。

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
    src/ai/                 #      run-extract.ts / promote-candidate.ts（已 fail-closed）
    src/scoring/            #   ⭐ Phase 4：score-projects runner、run-scoring CLI
    src/orchestration/      #   ⭐ Phase 5：AI 阶段编排循环（抽取/评分双 tick、
    src/orchestration/      #      退避、错误隔离、opt-in 组合根）
    src/promotion/          #   ⭐ Phase 6A：review-candidate.ts（治理审核 CLI）、
    src/promotion/          #      reconcile-historical-evidence.ts（历史对账 runner）
    src/e2e/                #   collect-once.ts、seed-nonofficial-feed.ts（开发注入）
packages/
  contracts/                # 唯一契约源：API/AI 输出/任务 payload zod schema
    src/intelligence/       #   ⭐ Phase 6A：governance.ts（审核命令/结果/outbox 事件契约）
  domain/                   # 纯业务规则（禁依赖 Next/DB/OpenAI/HTTP）
    src/intelligence/       #   ⭐ Phase 6A：evidence-grounding.ts（归一化+精确包含+SHA-256 纯函数）
  database/                 # repository、迁移产物、outbox；src/generated/ 为生成类型
    src/promotion/          #   ⭐ Phase 6A 治理仓库（server-only 导出，browser 入口 fail-closed）
supabase/
  migrations/               # 20 个 forward-only 迁移（勿改已应用者；
                           #   生产库应用前 19 个，第 20 个仅 disposable 验证）
  fixtures/                 #   demo-projects.sql（12 个虚构中文项目 + 显式虚构 Evidence，幂等可重放）
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
                              extraction_candidates（pending, version, review_status）
                                              │
        review-candidate.ts（治理审核：approve/reject/needs-review）
        │（Phase 6A：专用 promotion_service 边界 + 确定性 grounding + 单事务）
        │
        └─▶ evidence + signal_evidence_links（证据链）
        └─▶ signals（正式事实）+ promotion_events（审计）+ candidate_review_decisions
        └─▶ promotion_commands（幂等回执）+ outbox_events（事件，待投递）
                    │
        project_current_state / opportunity_list（读模型视图，⭐ Evidence 门禁：
                    │            无证据链路的 signal/score 保留但隐藏）
        评分输入（listScoringInputs）同样只消费 Evidence 门禁通过的 signals
                    │
            /projects/ethereum 页面渲染 ✅
```

### 数据库角色速查（表中本地开发角色默认使用 `local-password`；生产 `promotion_service_login` 例外，使用未打印的强随机密码）

| 登录角色 | SET ROLE 到 | 用途 |
|----------|-------------|------|
| `collection_worker_login` | collection_worker | 采集持久化 |
| `ai_stage_worker_login` | ai_stage_worker | AI 抽取阶段读写（Phase 6A 起无直接写 signals 权限） |
| `collection_queue_worker_login` | collection_queue_worker | 队列操作 |
| `collection_schedule_admin_login` | ⚠️ **未建成** | 调度管理（见 §2 缺口） |
| `promotion_service_login` | promotion_service | ⭐ Phase 6A 治理审核 CLI（生产已建；强随机密码仅在 gitignored 本地环境保存） |
| `dev_fixture_admin` | （bypassrls） | 开发注入 fixture，仅 raw_items/discovered_items 的 insert/select |

---

## 4. 环境与运行

### 远程 Supabase（当前唯一真实数据库，本地无 Docker）

固定服务器信息：

| 项目 | 值 |
|------|----|
| 公网 IP | `115.190.206.200` |
| 私网 IP | `172.31.0.2` |
| SSH 用户 | `root` |
| 首选认证 | `~/.ssh/airdrop_intelligence_ecs_ed25519` |
| 备用密码凭据 | macOS Keychain service：`airdrop-intelligence-ssh-115.190.206.200`，account：`root` |

> 服务器密码不得写入仓库、命令历史、日志或环境变量。需要备用密码时，从本机 Keychain 读取：
> `security find-generic-password -a root -s airdrop-intelligence-ssh-115.190.206.200 -w`。
> 后续接手者应优先使用 SSH 密钥；只有密钥不可用时才读取备用密码，不要再次向项目所有者询问已经保存的凭据。

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
| `AIRDROP_PROMOTION_DATABASE_URL` | ⭐ Phase 6A：治理审核 CLI 的 server-only 连接（`promotion_service_login`，生产已配置） |
| `AIRDROP_PROMOTION_REVIEWER_USER_ID` | ⭐ Phase 6A：在册审核人 profile UUID（禁止用户名/actor 字符串） |
| `AIRDROP_EVIDENCE_RECONCILE_LIMIT` | ⭐ Phase 6A 可选：历史对账批量上限（1-100，默认 25） |
| `AIRDROP_EVIDENCE_RECONCILE_AFTER_ID` | ⭐ Phase 6A 可选：对账续跑 UUID 游标 |

> ⭐ **Phase 5 编排 opt-in**：worker 启动时若同时存在 `AIRDROP_AI_STAGE_DATABASE_URL` 与 `AI_MODEL_API_KEY`，则自动运行 AI 阶段编排循环（抽取/评分定时 tick）；任一缺席即纯采集模式（日志 `ai_stage_orchestration_disabled`）。promotion（候选→signal）按产品设计保持人工 CLI。

### 常用命令

```bash
pnpm dev                # web + worker 并行开发（web 在 localhost:3000）
                        # ⭐ 若 .env.local 同时含 AIRDROP_AI_STAGE_DATABASE_URL 与
                        #    AI_MODEL_API_KEY，worker 自动运行抽取/评分编排循环
pnpm verify             # lint + typecheck + test(687) + build + placeholders
env -u NODE_OPTIONS pnpm verify   # ⚠️ 必须这样跑（见 §6 坑 1）

# 手动评分（一次性，幂等：input_version 哈希）
AIRDROP_AI_STAGE_DATABASE_URL=... npx tsx apps/worker/src/scoring/run-scoring.ts

# AI 抽取（一次性，幂等：input_kind+input_id+input_hash+pipeline_version）
AIRDROP_AI_STAGE_DATABASE_URL=... AI_MODEL_API_KEY=... AI_EXTRACT_MAX_INPUTS=50 \
  npx tsx apps/worker/src/ai/run-extract.ts

# 列出/提升候选（⚠️ Phase 6A 起旧 CLI 已 fail-closed，仅输出
# legacy_promotion_cli_disabled_use_review_candidate 后退出）
npx tsx apps/worker/src/ai/promote-candidate.ts list

# ⭐ Phase 6A 治理审核（替代旧 promote；幂等键每次唯一，版本须精确匹配）
AIRDROP_PROMOTION_DATABASE_URL=... AIRDROP_PROMOTION_REVIEWER_USER_ID=... \
  npx tsx apps/worker/src/promotion/review-candidate.ts approve <candidate-id> <expected-version> <idempotency-key>
AIRDROP_PROMOTION_DATABASE_URL=... AIRDROP_PROMOTION_REVIEWER_USER_ID=... \
  npx tsx apps/worker/src/promotion/review-candidate.ts reject <candidate-id> <expected-version> <idempotency-key> claim_not_supported
AIRDROP_PROMOTION_DATABASE_URL=... AIRDROP_PROMOTION_REVIEWER_USER_ID=... \
  npx tsx apps/worker/src/promotion/review-candidate.ts needs-review <candidate-id> <expected-version> <idempotency-key> grounding_failed

# ⭐ Phase 6A 历史对账（有界幂等：批次 1-100 默认 25，UUID 游标续跑；
#    可 ground 的补 Evidence 链接，不可 ground 的 park 成 needs_review，永不删除）
AIRDROP_PROMOTION_DATABASE_URL=... AIRDROP_PROMOTION_REVIEWER_USER_ID=... \
  npx tsx apps/worker/src/promotion/reconcile-historical-evidence.ts

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
   ⚠️ `statements` 是**数组类型**，空值必须写 `'{}'`（写 `''` 会 malformed array literal）。
   Phase 6A 三迁移的登记值（version / name）：
   - `20260820000100` / `canonical_intelligence_governance`
   - `20260820000200` / `evidence_gated_read_models`
   - `20260820000300` / `historical_evidence_reconciliation`
3. 涉及 security_invoker 视图的迁移：视图引用的底表**每一列**都要对查询角色有列级 SELECT 授权，漏一列就是 42501（曾因此返工，见迁移 `20260814002000`）
4. **迁移文件必须经 stdin 管道执行，绝不用 `psql -c`**（坑 2：`-c` 传 `DO $$...$$`/函数体会静默失败）：
   ```bash
   ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 root@115.190.206.200 \
     "docker exec -i supabase_db_airdrop-intelligence-os psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
     < supabase/migrations/<migration-file>.sql
   ```
   `-v ON_ERROR_STOP=1` 让任何语句报错即中止，避免半应用状态。Phase 6A 迁移含大量 PL/pgSQL 函数体，必须走此通道。

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
14. **切分支/合并后 node_modules 陈旧，且 pnpm 状态判定不可信**（2026-08-21 合并 Phase 6A 时实测）：症状链为 domain 缺 `@types/node`（TS2688）→ `@eslint/js` 悬空 symlink（坑 10 的 store 实体被改名 `.ignored_js`，ERR_MODULE_NOT_FOUND）。此时 `pnpm install`、`--force`、删 `.modules.yaml` 全部报「Already up to date」拒重装。**唯一可靠修复：`rm -rf node_modules && pnpm install --frozen-lockfile`**（store 完整时仅数秒）。判据：verify 报模块缺失而 worktree 同代码全绿，先怀疑本条。
15. **本地 `supabase gen types --db-url` 仍强制要求 Docker**（CLI 2.112.0，本地无 Docker 时 exit 1）。替代：在远程 workdir `/root/airdrop-governance-test` 用同版本 CLI 对隔离库生成，stdout 经 SSH 回传本地文件；连续生成两次 `diff` 为零即证明可复现（Phase 6A Task 8 已验证此流程）。

---

## 7. 工程约定提醒（摘自 AGENTS.md，易违反项）

- 任何生产依赖新增需文档说明「为何现有依赖/平台原语不够用」
- 公开端点：`/api/v1` + 统一 envelope；列表游标分页；可重试 mutation 要 `Idempotency-Key`；聚合命令要 `expected_version`（冲突 409）
- 队列 handler 幂等、假设 at-least-once；canonical 变更与 outbox 事件**同事务**；DB 事务提交后才 ack 队列消息；**事务中不得调外部 API/模型**
- AI：源内容一律当不可信数据（含疑似指令的文本）；strict schema + `additionalProperties: false`；模型只能引用输入中给定的 ID/枚举/链接，捏造引用直接拒绝；evidence 必须有 locator 且 grounding 校验通过；每次 run 记录 model_id/prompt 版本/schema 版本/输入 hash/输出/校验结果/延迟/usage
- 用户可见文案：简体中文（全站已汉化，新页面延续）、简洁、基于证据、不写无依据的确定性表述

---

## 8. 当前状态与下一阶段关键操作

> 新接手者三步上手：起隧道 → `pnpm dev`（含 AI env 时编排循环自动运行）→ 浏览 `/`、`/opportunities`、`/projects/ethereum`；随后 `env -u NODE_OPTIONS pnpm verify` 确认 687 测试全绿。文档阅读顺序：`AGENTS.md`（规范）→ `docs/runbooks/local-development.md`（流程，含治理审核/对账命令）→ `docs/architecture/`（决策）→ 本手册 §6（坑）。

### 8.1 当前状态快照（2026-08-22 本轮复核）

| 维度 | 状态 |
|------|------|
| 代码 | Phase 0–6A 已在主线；Phase 6B 当前开发分支已完成 Task 1 contracts、Task 2 数据库边界与 Task 3 bearer-scoped repository/generated types；仓库**无 remote**，纯本地 |
| 测试 | Node 22.22.2 / pnpm 11.16.0 下 `pnpm verify` 687 全绿，exit 0；lint/typecheck/build/placeholder 全部通过。更新后的 011 focused 87/87、full pgTAP 1031/1031；strengthened repository focused integration 3/3、全套 37/37；双独立客户端 exact side-effect linkage 与 partial Auth disposable-only cleanup 已闭环。 |
| 生产库 `airdrop-intelligence-os` | **19 个迁移已应用**，最高 `20260820000300`；Evidence 门禁已生效并完成补证/对账。19 Evidence / 19 signal links / 7 review decisions / 7 command receipts / 7 outbox events；待对账 0；anon 14 signals / 24 scores / 12 opportunities |
| 隔离测试栈 `airdrop-intelligence-governance-test` | API 64321 / DB 64322、匹配容器健康；20 migrations reset exit 0，updated focused 87/87、full 1031/1031；`errorDetail` mutation exit 1 命中 Failed test 31，恢复 migration SHA 后 reset exit 0、focused 87/87。**只允许对它 reset**；生产未访问。 |
| 运行中的进程 | 不作为持久项目状态；接手时应按 §4 重新启动并从当次日志确认 web、采集队列及 AI 编排状态 |

### 8.2 ✅ Phase 6A 上生产（2026-08-22 已完成；保留操作清单供审计）

#### 2026-08-22 实际执行记录

| 执行项 | 状态 | 本轮证据 |
|---|---|---|
| 只读预检与代码基线 | **完成** | 生产迁移 16 条、最高 `20260815000200`；14 projects / 20 signals / 26 scores / 7 promoted candidates；治理表和治理角色均不存在；`opportunity_list` 12 行、`project_current_state` 14 行。迁移文件 SHA-256 已核对，完整 `pnpm verify` 650 测试通过 |
| 迁移 `20260820000100` | **完成** | 使用 `--single-transaction` + `ON_ERROR_STOP=1` 原子应用并登记；5 个治理表与 2 个受保护函数存在；`promotion_service` 为 NOLOGIN/NOINHERIT/NOBYPASSRLS/NOSUPERUSER；`ai_stage_worker` 已无 signals INSERT 权限；20 signals / 26 scores / 7 candidates 保留 |
| 迁移 `20260820000200` | **完成** | 原子应用并登记；两个 Evidence helper 存在；底层 20 signals / 26 scores 保留；owner 与 anon 的公开 signals、scores、opportunity 及带分项目暂时均为 0，符合补 Evidence 前的预期门禁中间态 |
| 迁移 `20260820000300` | **完成** | 原子应用并登记；历史扫描函数存在，仅 `promotion_service` 可执行，anon 与 `ai_stage_worker` 无权限；扫描精确返回 7 个待对账 promoted candidates |
| promotion 登录与审核人 | **完成** | `promotion_service_login` 使用未打印的 256-bit 随机密码，LOGIN/非 superuser/非 bypassrls，且为 `promotion_service` 成员；固定审核人 UUID 的 auth user/profile/active reviewer 均已验证；两项本地配置已写入 gitignored `.env.local`，文件权限由 0644 收紧为 0600 |
| demo Evidence fixture | **完成** | 原子重放新增 12 sources / 12 raw items / 12 Evidence / 12 signal links / 12 score links；14 projects / 20 signals / 26 scores 保持不变；门禁后 anon 实测恢复 7 signals、22 历史 scores、11 opportunity 行。旧文档“12 demo + Ethereum”是概括值，最终以生产读模型实测为准 |
| 历史 Evidence 对账 | **完成** | 最小权限 CLI 首次 `processed=7 / linked=7 / needsReview=0`；立即重跑 `processed=0`，幂等成立。生产现有 19 Evidence / 19 signal links / 7 review decisions / 7 command receipts / 7 outbox events，待对账 0；anon 可见 14 signals / 24 scores / 12 opportunities，Ethereum 6 条 signals 已恢复 |
| 页面与最终门禁 | **完成** | 四个页面/API 均 HTTP 200 并出现预期项目/信号文案；最终矩阵确认 19 migrations、历史 14 projects / 20 signals / 26 scores / 7 candidates 不变、公开 signal/score Evidence 缺口均为 0、outbox 敏感键命中 0、4 个 append-only triggers 有效、AI 直接写入/执行 Promotion 均被拒绝；最终 `pnpm verify` 650 测试通过 |

> 目标：让 Evidence 门禁在生产生效，并恢复全部应可见数据。**建议一次性连续执行 Step 1–6**（Step 5/6 完成前，公开页面会因门禁生效而暂时「变空」——数据保留不删，属预期中间态）。前置：SSH 密钥可用、15432 隧道已起、本机位于仓库根目录。

**Step 1 — 按序应用三个迁移**（stdin 管道 + `ON_ERROR_STOP=1`，见 §5 规程 4；严格按文件名顺序）：

```bash
for f in 20260820000100_canonical_intelligence_governance \
         20260820000200_evidence_gated_read_models \
         20260820000300_historical_evidence_reconciliation; do
  ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 root@115.190.206.200 \
    "docker exec -i supabase_db_airdrop-intelligence-os psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
    < "supabase/migrations/${f}.sql" || { echo "FAILED at ${f}"; break; }
done
```

**Step 2 — 手工登记三行 `schema_migrations`**（version/name 对照见 §5 规程 2）。

**Step 3 — 建治理登录角色**（平铺语句，勿用 `DO $$` 块；生产环境必须使用现场生成且不打印的强随机密码，禁止使用本地测试密码）：

```sql
create role promotion_service_login with login password '<generated-strong-password>' in role promotion_service;
```

**Step 4 — 建审核人身份**（幂等；记下 UUID 供 Step 6 与 `.env.local` 使用；profile 必须存在，`user_roles.user_id` 外键指向 `public.profiles`）：

```sql
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ops-reviewer@example.invalid',
  '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.profiles (id) values ('a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role, granted_at)
values ('a0000000-0000-4000-8000-000000000001', 'reviewer', now());
```

**Step 5 — 为 12 个 demo 项目补虚构 Evidence**：重放幂等 fixture（固定 UUID，全部 `on conflict do nothing`，生产已有行冲突跳过，仅新增 demo 专用 source/raw_item/evidence/links）：

```bash
ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 root@115.190.206.200 \
  "docker exec -i supabase_db_airdrop-intelligence-os psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
  < supabase/fixtures/demo-projects.sql
```

**Step 6 — 跑历史对账**（恢复 Ethereum 真实 signals；经 15432 隧道）：

```bash
AIRDROP_PROMOTION_DATABASE_URL=postgresql://promotion_service_login:<generated-strong-password>@127.0.0.1:15432/postgres \
AIRDROP_PROMOTION_REVIEWER_USER_ID=a0000000-0000-4000-8000-000000000001 \
  npx tsx apps/worker/src/promotion/reconcile-historical-evidence.ts
```

预期：7 个 promoted 候选被处理——Ethereum 6 个（airdrops.io 正文在库，Phase 3 用同一确定性算法过滤过，应全部 link 成功）；novanet 1 个为 Phase 5 合成数据，ground 成功则 link、失败则 park 成 `needs_review`（无害，属 Phase 6B 审核范围）。输出仅含计数与游标；重跑幂等。候选多于一批（>25）时按打印的 next cursor 设 `AIRDROP_EVIDENCE_RECONCILE_AFTER_ID` 续跑。

**Step 7 — 页面验证**：`/opportunities`（12 demo + Ethereum 恢复）、`/projects/ethereum`（6 信号恢复）、`/projects/novanet`（视对账结果）。同时把 `AIRDROP_PROMOTION_DATABASE_URL` / `AIRDROP_PROMOTION_REVIEWER_USER_ID` 补进 `apps/web/.env.local`（治理审核 CLI 用）。

**注意事项**：
- 回滚：迁移 forward-only 不可逆；但它们只新增表/角色、撤销权限、替换视图与策略，**不修改/删除任何现有数据行**，应用本身无数据损失风险。
- worker 若在运行：迁移撤销了 `ai_stage_worker` 直接写 signals 的权限——编排循环（抽取写 candidates、评分读 gated signals）不受影响；旧 `promote-candidate.ts` CLI 本就已 fail-closed。
- 对账后 scoring 输入集合可能变化（Ethereum 信号恢复后 `input_version` 变化触发重算），属设计行为。

### 8.3 下一阶段关键操作二：worktree 清理（确认后执行）

```bash
git worktree remove .worktrees/phase-2-source-collection
git worktree remove .worktrees/phase-6a-canonical-governance
git branch -d codex/phase-2-source-collection
git branch -d codex/phase-6a-canonical-governance
```

⚠️ 删除前自查 phase-6a worktree 内有无未跟踪的个人文件（`git -C .worktrees/phase-6a-canonical-governance status --short`）。

### 8.4 下一阶段开发方向（Phase 6B 起，按建议优先级）

1. **Phase 6B：失败 AI run 的 review / dead-letter 审核界面**——Task 1–3 已完成；Task 4 authenticated BFF handlers/routes 已实现并进入独立评审，评审通过后下一步是 Task 5 reviewer session/browser API clients。Task 3 已用两个独立 client 闭环并发证明，并以 marker 校验后的 disposable-only exact cleanup 保持 `ai_runs` append-only trigger 不变；Task 4 未部署、未访问生产；毒物防护 park 住的失败输入与对账产生的 `needs_review` 决策仍在等后续 UI 接手
2. **详情页 score_factors / Evidence 引用展示 + anon 读策略**——把 Phase 4 因子数据变成用户可见；注意展示需符合「Raw quote 不自动公开」的约束（经审核的公共读模型才能带引用文本）
3. **教程生成 tutorials**——价值链「执行」环；其前置（安全 incidents / 白名单链接）尚未开始，需先排期
4. 其余按 §2「未开始」清单顺序（任务管理 → 通知 → 安全风控 → 认证 → 多源扩展）
5. 若上生产部署：worker 常驻进程（带 AI env）+ 采集调度常态化 + `collection_schedule_admin_login` 补建（§2 缺口表）

---

## 9. 其他

- Git 分支：主开发线 `codex/phase-0-1-foundation`（含 Phase 0–6A）；Phase 6A 于独立分支 `codex/phase-6a-canonical-governance` 开发，2026-08-21 fast-forward 合并回主线（合并后主线 `pnpm verify` 全绿，具体 HEAD 以 `git log --oneline -1` 为准）；两分支及 worktree 的清理见 §8.3
- dev server / worker 是否仍在运行不作为持久状态；每次接手都按 §4 重新确认并从当次日志判断
- 历史决策细节（为什么这样做）：`docs/superpowers/specs/` 与 `docs/superpowers/plans/` 下的设计文档；Phase 6A 的逐任务 RED/GREEN 证据在 `docs/tasks/canonical-intelligence-governance-workbook.md`
- DeepSeek 计费注意：130 次真实抽取消耗约 62 万 prompt tokens（每输入截取 12K 字符上限）；批量跑前评估成本
- 隔离测试栈（Phase 6A 起长期存在）：远程 ECS 上第二个 Supabase 项目 `airdrop-intelligence-governance-test`（db `64322` / Kong `64321`，workdir `/root/airdrop-governance-test`，CLI `./cli/node_modules/.bin/supabase` v2.112.0）。本地隧道 `16432 → 64322`、`16433 → 64321` 跑真实集成测试。**只允许对它 reset**，生产栈（54322/54321）绝不 reset
- 交接时的数据库快照（2026-08-14，未含 Phase 6A 变化）：16 迁移已应用；14 项目（12 demo + Ethereum + novanet 等实为 13 项目含 novanet + Ethereum）；raw_items 23；discovered_items 131；ai_runs 131（130 Phase 3 + 1 Phase 5 编排验证）；extraction_candidates 7（全 promoted）；signals 20（demo + 6 Ethereum 真实 + 1 novanet 编排验证）；project_scores 26 行（12 项目含历史版本行）；score_factors 117；score_signal_links 已建。novanet 的 `airdrop_season_announcement` 信号及其评分（74.8/40/27 watch）是 Phase 5 端到端验证产物，内容为合成测试数据。2026-08-22 Phase 6A 门禁上线后的短暂隐藏已通过 demo 补证与 7 条历史对账恢复，实际结果见 §8.2
