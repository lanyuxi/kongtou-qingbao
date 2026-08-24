# Airdrop Intelligence OS — 交接手册

> 交接日期：2026-08-14（WorkBuddy → GPT Codex）
> 最近更新：2026-08-24（Phase 6B 已完成主线集成：冲突仅涉及本手册，产品代码自动合入；Node 22.22.2 / pnpm 11.16.0 合并后门禁全绿）
> 权威规范：仓库根目录 `AGENTS.md`（产品规则与工程约束的唯一事实来源，本手册不重复其内容，只补充现状与经验）
>
> **当前一句话状态（2026-08-24）**：Phase 0–6B Task 1–8 已在主线 `codex/phase-0-1-foundation` 并通过正式门禁；**Phase 6B 尚未部署生产**。Task 9 依据 2026-08-22 最后一次只读预检停在 `PRODUCTION_READY — REVIEWER_ACCOUNT_REQUIRED`；第 20 个迁移继续冻结。下一项功能进入“详情页 score factors + 经审核 Evidence 引用”的设计阶段。

> **2026-08-22 历史接续结果（当时状态）**：先完成 225 个跟踪产出与主线核验，再按 §8.2 将 Phase 6A 三迁移原子应用并逐条登记；创建强随机密码的最小权限治理登录与在册审核人；补齐 12 组 demo Evidence；历史对账 `processed=7 / linked=7 / needsReview=0` 且重跑为 0；四个真实 Web 请求均为 HTTP 200。Phase 6B 的详细设计、九任务实施计划和开发工作簿已经固化；当时的下一步是在隔离 worktree 中从 Task 1 contracts 开始执行 RED → GREEN（该动作现已由 6B 分支完成）。

### 2026-08-24 本轮交接复核进度

| 步骤 | 状态 | 已核对内容 / 后续动作 |
|---|---|---|
| 1. 完整阅读交接手册 | **完成** | 已逐行读完本文件 432 行；确认手册同时包含“主线 Phase 0–6A 快照”和“Phase 6B Task 1–8 本地完成”两层状态，后续必须用当前仓库事实校准，不能只沿用顶部旧摘要 |
| 2. 复核项目目录下产出文件 | **完成** | 已核对 228 个主线跟踪文件、应用/包源码、19 个迁移与 10 个 pgTAP 文件、全部阶段文档，以及 6B worktree 的 46 文件 / 8,776 行新增实现；确认 6B 分支干净（仅未跟踪 `.DS_Store`）且产出闭环 |
| 3. 判断当前阶段与下一开发内容 | **完成** | 当前为“Phase 6B 主线集成完成、生产受控冻结”；下一项功能是详情页 score factors + 经审核 Evidence 展示，先完成匿名安全读边界设计再进入 TDD 实现 |
| 4. 执行主线集成与正式门禁 | **完成** | 已协调 HANDOVER 冲突、修正 workbook 的 Task 7/8 commit 残留，并在 Node 22.22.2 / pnpm 11.16.0 下执行合并后 `pnpm verify`：798 通过、42 条环境条件跳过，lint / typecheck / build / placeholders 全绿，exit 0 |

### 2026-08-24 本轮最终判定

1. **当前阶段**：Phase 6B 的产品代码、迁移、契约、BFF、审核 UI、授权矩阵与文档已完成并集成到主线。“主线集成完成”和“生产部署完成”仍必须分开表述；后者尚未发生。
2. **本轮集成结果**：已合入 `codex/phase-6b-failed-ai-review`，人工协调本手册并保留 §8.5 生产检查点；修正 workbook 的 Task 7/8 commit 残留和重复 Task 7 汇总；Node 22.22.2 / pnpm 11.16.0 合并后 `pnpm verify` exit 0。
3. **生产 rollout 不是当前可自动执行的下一步**：截至 2026-08-22 最后一次只读预检，仍缺项目所有者确认的 human reviewer、健康的生产 Auth 服务和已演练的迁移前备份；三项补齐后还需显式生产授权，才能应用第 20 个迁移并执行 smoke/拒绝矩阵。
4. **下一项功能开发**：现在进入项目详情页 `score_factors` + 经审核 Evidence 引用展示及其 anon 安全读模型/策略设计。Raw quote 不得直接公开，机会/风险/置信度继续独立。教程生成仍应排在链接白名单与 security incidents 前置设计之后。
> **2026-08-22 本轮接续结果（Codex → WorkBuddy 交接）**：Codex 完成 Task 1–7 实现与多轮评审，但 Task 7 fix round 1（partial Auth setup 精确清理缺口修复）因账户额度耗尽，其 disposable focused 复验与 scoped re-review 未获审批而搁置，代码与文档修改未提交。WorkBuddy 接手后：① 通读 HANDOVER、6B spec/plan/workbook/progress 与未提交 diff，确认修复最小且与报告一致；② 以容器名 `governance-test` 双重白名单脚本在远程 disposable 栈推导 4 个集成测试环境变量（脚本仅输出行数校验，值经 SSH 加密通道回传本地 `/tmp/airdrop-6b-test.env`，umask 077/chmod 600，远程副本当场删除）；③ 恢复 `16433 → 64321` 隧道并以 `/auth/v1/health` 200 确认目标为 disposable 栈；生产端口（54321/54322）无隧道、未访问。随后按序执行 focused integration 6/6 复验、提交 fix round 1、scoped re-review，并续作 Task 8/9。Phase 6A 生产落地、Evidence 补证/对账与 Web 验证保持不变，详见 §8.2。

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
| **Phase 6B Task 4 authenticated BFF/routes（DONE）**（2026-08-22） | 新增失败 AI run list/detail/decision handlers 与三条 `/api/v1/review/ai-runs` routes；先用既有 `AuthenticatedUserVerifier` 验证，再提取并仅按请求传 bearer；fix round 1 补全 canonical error envelope、Authorization fail-closed、wrong-operation fallback 与逐映射 secrets exclusion | leak sensitivity mutation 触发 list/detail/decision 3 个具名失败，恢复后 focused 52/52、Web 69/69；lint/typecheck/build 全绿；Node 22.22.2 根 `pnpm verify` 739 tests、exit 0；独立评审已通过。 |
| **Phase 6B Task 5 session/API clients（DONE）**（2026-08-22） | 新增 public-only Supabase browser client/auth port、无 token 副本的 reviewer session controller，以及 fresh token/idempotency key 的 strict BFF client；fix round 1 静态读取 public env；fix round 2 隔离 bundle；fix round 3 增加 session/API 运行时图覆盖 | runtime RED 同时报告 session/API markers 为 false；恢复后 isolated bundle 1/1、Web 98/98，public + `sign_in_failed` + `review_version_conflict` markers 存在，forbidden server markers/names 缺席，同级哨兵存活；Node 22.22.2 根 `pnpm verify` 768 tests、exit 0；独立评审已通过。 |
| **Phase 6B Task 6 reviewer UI（DONE）**（2026-08-22） | `/review` 绕过公开 `AppShell`；compact JWS/JWT 不再要求每段至少 8 字符，而是要求三段 base64url 结构及 protected header 可解码为含非空 `alg` 的 JSON；覆盖 `e30`、detached payload 与空 signature | focused 28/28、Web 126/126；移除 compact predicate 同时命中两个唯一具名失败，长自然点分标识仍可见；lint/typecheck/build 全绿；Node 22.22.2 根 `pnpm verify` 796 个非跳过测试、exit 0；scoped re-review 通过；未部署、未访问生产。 |
| **Phase 6B Task 7 E2E/授权矩阵（DONE）**（2026-08-22） | 真实 reviewer 全流程（list 三状态、safe detail、`needs_investigation` + 精确 replay + 下一版 `dismiss`、两版不可变历史）、七主体授权矩阵、两类独立 client race、malformed repository detail → 规范化 500 的 HTTP 回归；fix round 1 将 Auth signup 返回的 user ID 在 confirmation/sign-in 前写入共享 Set，teardown 复用经测试的 `presentFixtureUserIds` | Codex 原始门禁：focused 6/6、full 40/40、pgTAP 1031/1031；WorkBuddy 验收：disposable focused 6/6（Node 22.22.2）、fixture 5/5、full `test:integration` 40/40；scoped re-review 无 Critical/Important 破坏；提交 `b2f104b`、`e9b3e52`、`bcbbe7c` |
| **Phase 6B Task 8 runbook/安全审查/仓库门禁（DONE）**（2026-08-22） | runbook 新增「Failed AI run review (Phase 6B)」操作节（flat-SQL 审核人供给、`revoked_at` 即时失效语义、`/review/sign-in` 流程、focused 测试命令、disposable-only 集成变量、迁移前向安全、failed-run retry 明确排除；UI 不建账号/角色）；全分支 secret/unsafe-field 扫描逐条人工分类；本地与远端产物 SHA 一致 | 扫描命中全部归类为测试 fixture/禁令/服务端 bearer 管道/既有 schema 列/ACL revoke（grant 仅 `execute` 给 `authenticated` 且函数内复核）；migration SHA `5150c830…`、011 SHA `e9158648…` 本地=远端；disposable reset exit 0 + full pgTAP 11 files / 1031 PASS；Node 22 根 `pnpm verify` exit 0（798 非跳过）；`git diff --check` 清洁；生产未访问 |

当前测试基线：**Node 22.22.2 / pnpm 11.16.0 下 `pnpm verify` 全绿**（lint / typecheck / test / build / placeholders），798 个非跳过测试，exit 0（contracts 78 / domain 222 / database 159+40 skipped / worker 212+2 skipped / web 127）。Task 7 fix round 1 后 disposable focused integration 6/6、full repository integration 40/40、fixture 5/5；隔离栈 reset exit 0 + full pgTAP 1031/1031（本地与远端 artifact SHA 一致）。

### ⚠️ 半成品 / 已知缺口

| 项 | 状态 | 说明 |
|----|------|------|
| `collection_schedule_admin_login` 角色 | **不存在** | 早期经 ssh 传 `DO $$` 块静默失败遗留。`apps/web/.env.local` 里的 `AIRDROP_QUEUE_ADMIN_DATABASE_URL` 指向它，**目前不可用**。需要时用平铺语句重建：`create role collection_schedule_admin_login with login password '...' in role collection_schedule_admin;`（注意：`collection_queue_worker_login` 已于 Phase 5 补建，模式可参考 §6.2） |
| airdrops.io 数据接入方式 | **开发注入，非正式通道** | 采集器 INSERT 策略深度校验「official+verified」，第三方源被正确拒绝（产品设计）。当前用 `dev_fixture_admin`（bypassrls，仅 raw_items/discovered_items 两表 insert/select）+ `seed-nonofficial-feed.ts` 注入真实 feed。**正式的多源接入（含第三方源的审核接收流）尚未设计实现** |
| Phase 6B integration fixture cleanup | **Task 7/8 已闭环** | 评审发现用户已由 Auth 创建、但 confirmation/sign-in 失败时外层 ID 仍为空。修复为 signup 返回 user 后立即注册到 Set，tear-down 复用经测试的去重/空值过滤 helper；focused 6/6、full integration 40/40、全分支安全审查与完整仓库门禁均已通过。 |
| Failed-run decision concurrency proof | **Task 3 已闭环** | 两个独立 repository/client session 实测：同 reviewer+同 key 仅一写一 replay；同 run+不同 key/同 expected version 仅一成功，另一方 `review_version_conflict`。两种场景逐字段绑定唯一 decision/receipt/outbox、获胜 command/decision IDs 与 idempotency key；outbox payload 精确七个安全字段。 |
| worktree 清理 | **待清理（确认后执行，见 §8.3）** | `.worktrees/phase-2-source-collection`（提交已在主线历史）与 `.worktrees/phase-6a-canonical-governance`（分支已于 2026-08-21 合并回主线）均可清理：`git worktree remove <path>` + `git branch -d <branch>`。⚠️ phase-6a worktree 里若有未跟踪的个人文件，先自查再删 |

### ❌ 未开始（按建议优先级）

1. ~~**评分管线**~~ ✅ **2026-08-15 完成**：score-model-v1 确定性评分 + 因子分解 + recommendation 决策表；Ethereum 及 11 个 demo 项目全部评分，Ethereum 自动进入 `opportunity_list`。见 `docs/superpowers/specs/2026-08-15-score-pipeline-design.md`
2. ~~**机会列表纳入真实项目**~~ ✅ **2026-08-15 完成**：Ethereum 评分后由读模型视图自动纳入（第 6 位）
3. ~~**失败 AI run 的交互式 review / dead-letter 界面（Phase 6B）**~~ ✅ **2026-08-22 本地完成，2026-08-24 主线集成完成**：Task 1–8 已完成严格契约、追加式审核 schema/RPC、bearer-scoped repository、认证 BFF、session/API client、审核 UI、E2E 授权矩阵、runbook 与安全审查；Node 22 门禁 798 非跳过全绿、disposable focused 6/6、full integration 40/40、pgTAP 1031/1031。Task 9 止于 `PRODUCTION_READY — REVIEWER_ACCOUNT_REQUIRED`（见 §8.5），生产应用前置未满足。
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

### 2026-08-24 产出文件复核摘要

- **主线现状**：当前分支 `codex/phase-0-1-foundation`，HEAD `d2c71de`，共 228 个 Git 跟踪文件；源码分布为 Web 18、worker 48、contracts 13、domain 23、database 35 个文件；数据库为 19 个 forward-only 迁移和 10 个 pgTAP 文件。主线的 `failed-ai-run-review-workbook.md` 仍是 Task 1–9 全部 `READY` 的设计起点，不代表实际 6B 进度。
- **Phase 6B 实际产出**：独立分支 `codex/phase-6b-failed-ai-review` HEAD `4ce6466`，相对主线新增/修改 46 个文件（`+8,776 / -31`）。产出包括严格 contracts、两张追加式审核表、3 个受保护 RPC、第 20 个迁移与第 11 个 pgTAP 文件、bearer-scoped server-only repository、3 条 `/api/v1/review/ai-runs` BFF 路由、登录/列表/详情/决策页面、浏览器 session/API client、安全文本显示策略、集成/授权矩阵测试、runbook 与 263 行执行 workbook。
- **6B 验证证据**：worktree workbook 记录 Node 22 `pnpm verify` 798 个非跳过测试全绿，disposable focused integration 6/6、full repository integration 40/40、fixture 5/5、full pgTAP 1031/1031；迁移和 pgTAP 产物本地/远端 SHA-256 一致。当前 6B worktree 无已跟踪文件改动，仅有未跟踪 `.DS_Store`。
- **分支关系**：主线与 6B 的 merge-base 是 `13c19e`；主线此后只有 `d2c71de` 这一笔 HANDOVER 状态同步，6B 此后有完整实现提交。两边共同修改 `docs/HANDOVER.md`，因此合并时应先保留本轮 2026-08-24 复核记录，再吸收 6B 手册的实时状态，不能用任一版本整文件覆盖另一版本。
- **文档一致性已修正**：主线集成时已把 6B workbook 的 Task 7/8 commit 单元格更新为实际提交，并移除重复的 Task 7 汇总行；代码与测试结论不变。

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
pnpm verify             # lint + typecheck + test(798 non-skipped) + build + placeholders
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

> 新接手者三步上手：起隧道 → `pnpm dev`（含 AI env 时编排循环自动运行）→ 浏览 `/`、`/opportunities`、`/projects/ethereum`；随后用 Node 22.22.2 / pnpm 11.16.0 执行 `pnpm verify`，确认 798 个非跳过测试全绿。文档阅读顺序：`AGENTS.md`（规范）→ `docs/runbooks/local-development.md`（流程，含治理审核/对账命令）→ `docs/architecture/`（决策）→ 本手册 §6（坑）。

### 8.1 当前状态快照（2026-08-24 主线集成后）

| 维度 | 状态 |
|------|------|
| 代码 | Phase 0–6B Task 1–8 已在主线 `codex/phase-0-1-foundation`；Task 9 止于 `PRODUCTION_READY — REVIEWER_ACCOUNT_REQUIRED`（§8.5）；审核页不复用公开 shell，且没有 raw/provider detail 渲染路径；仓库**无 remote**，纯本地 |
| 测试 | Node 22.22.2 / pnpm 11.16.0 下 `pnpm verify` 798 个非跳过测试全绿，exit 0；lint/typecheck/build/placeholder 全部通过。Task 7 fix round 1 后 disposable 复验：focused integration 6/6、fixture 5/5、full repository integration 40/40；011 focused 87/87、full pgTAP 1031/1031。 |
| 生产库 `airdrop-intelligence-os` | **19 个迁移已应用**，最高 `20260820000300`；Evidence 门禁已生效并完成补证/对账。19 Evidence / 19 signal links / 7 review decisions / 7 command receipts / 7 outbox events；待对账 0；anon 14 signals / 24 scores / 12 opportunities |
| 隔离测试栈 `airdrop-intelligence-governance-test` | API 64321 / DB 64322、容器健康（auth/db/kong 均 healthy）；20 migrations reset exit 0，updated focused pgTAP 87/87、full 1031/1031；**fix round 1 后复验**：focused integration 6/6（4.05s）、full repository integration 40/40（74.19s），cleanup 经 marker 校验且仅删精确 fixture；`errorDetail` 与 revoked-role mutation 均命中具名回归。**只允许对它 reset**；生产未访问。 |
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

### 8.4 本轮四项优先事项结果与下一开发方向（2026-08-24）

1. **交接基线固化：完成**——先独立提交本轮阅读、目录复核、阶段判断与生产检查点，避免在功能分支合并中丢失当前事实。
2. **Phase 6B 主线集成：完成**——产品代码自动合入；唯一冲突为 `docs/HANDOVER.md`，已人工协调；workbook 的 Task 7/8 commit 残留和重复 Task 7 汇总已修正。
3. **声明运行时正式复验：完成**——Node 22.22.2 / pnpm 11.16.0 下合并后 `pnpm verify` exit 0；contracts 78 / domain 222 / database 159（另 40 skipped）/ worker 212（另 2 skipped）/ web 127，合计 798 个非跳过测试通过，lint / typecheck / build / placeholders 全绿。
4. **生产边界与后续入口确认：完成**——本轮未访问、未写入生产；沿用 §8.5 四项停止条件，第 20 个迁移继续冻结。现在进入详情页 `score_factors` / 经审核 Evidence 引用 + anon 安全读策略的设计阶段。

后续顺序：先完成并审批上述详情页功能设计，再按 TDD 实现；其后才是 tutorials。教程的安全 incidents / 白名单链接前置仍未设计，不能提前绕过。

### 8.5 ⛔ Phase 6B 生产受控检查点（2026-08-22，止于 PRODUCTION_READY — REVIEWER_ACCOUNT_REQUIRED）

只读预检（仅 SELECT/exists/health 探测，无任何写操作）结果：

| 预检项 | 结果 | 结论 |
|--------|------|------|
| 生产迁移台账 | 19 行，最高 `20260820000300` | 6B 第 20 个迁移未应用，正确 |
| `ai_run_review_decisions` 存在性 | 不存在 | 生产 schema 未被 6B 触碰 |
| human reviewer 账号 | `auth.users` 仅 2 行，均为 `@example.invalid` 运营 fixture（`fixture-reviewer` 无激活角色；`ops-reviewer` 为 Phase 6A 治理审核人） | **缺 human reviewer**，禁止以运营 fixture 充当人类登录、禁止猜身份建号 |
| 生产 Auth 可达性 | `/auth/v1/health` **503**（`docker ps` 无 `supabase_auth_airdrop-intelligence-os` 容器）；`/rest/v1/` 200 | 审核 UI 在生产无法登录；须先恢复/启动 Auth 服务 |
| 备份/恢复姿态 | 无 cron 定期 DB 备份；仅有历史手工备份目录（task4/task5/task9-*-backup） | 上生产前须建立并演练预检备份流程 |

**决定**：按 plan Task 9 Step 2 停在此检查点，**不执行**迁移应用、角色/账号创建、数据或配置变更。恢复 rollout（Step 3–5）的前置：① 项目所有者供给或指定 human reviewer（active reviewer-class 角色）；② 生产 Auth 服务恢复且 `/auth/v1/health` 返回 200；③ 建立并演练迁移前备份；④ 显式 rollout 授权。四者齐备后按 §8.2 同款远程规程（preflight → 事务原子应用 → 登记 → 校验 → 不打印凭据）执行，smoke 检查清单见 plan Task 9 Step 4。

> **2026-08-24 集成复核**：本轮只做本地 Git 集成与仓库门禁，没有连接、探测或修改生产环境。2026-08-22 的只读证据可能随外部环境变化，下一次 rollout 前必须重新执行只读 preflight；在新的 preflight 与四项授权条件全部满足前，仍按冻结状态处理。

**附带发现（建议尽快处理，不阻塞 6B 本地状态）**：生产栈缺 Auth 容器属 Phase 6A 上生产后未被使用到的服务面（6A CLI 走数据库角色，不经 Auth HTTP），但任何基于浏览器会话的功能（6B 审核 UI、未来用户认证）都依赖它；建议在下一次生产变更前先排查 `supabase_auth` 容器为何未随栈启动（可能是 compose 配置或崩溃退出），并确认 Kong 路由。

### 8.6 下一功能设计检查点：详情页评分因子与 Evidence 引用（2026-08-24）

**已完成的现状研究**：

- `score_factors` 已保存最新评分的三轴因子（axis / factor_code / contribution / input_value / detail），但 Phase 4 有意未向 `anon` / `authenticated` 开放；详情页目前只读取 `project_current_state` 的总分与 explanation。
- `score_signal_links` 记录“一次评分消费的全部 signals”，`signal_evidence_links` 再把 signal 追到 append-only Evidence；当前 schema **没有 factor → signal / Evidence 的逐因子链接**。因此首版必须把“评分因子”和“本次评分使用的证据集”分成两个区块，不能声称某条 Evidence 单独证明某个聚合因子。
- Evidence 的 `quote_text` 已受 10–500 字、确定性 grounding、Source / Raw Item 身份一致和人工 Promotion 门禁约束，但底表及链接表当前对浏览器全部拒绝；任何公开展示必须新增 forward-only、列级最小化、Evidence-gated 的专用读模型，不能直接放开治理底表。
- 当前 `project_current_state` 不返回 `project_score_id`。为保证总分、因子和证据来自同一不可变评分快照，设计应显式携带 score ID，再按该 ID 读取因子和 score-level Evidence 集合。
- `sources.canonical_url` 与 Raw Item URL 当前都不是匿名安全列；在 verified allowlisted references 功能落地前，不应把采集到的文章 URL直接变成可点击链接。

**推荐的最小方案（待产品边界确认后写正式 spec）**：

1. 新增 forward-only migration：扩展当前读模型携带 `project_score_id`；新增两个 security-invoker / security-barrier 安全投影，分别公开同一 Evidence-complete score 的安全因子列，以及其已发布 signals 对应的最小 Evidence citation 列。
2. 新增精确 RLS / 列授权和 pgTAP 全主体矩阵；`anon` / `authenticated` 只可读 active / rumored 项目当前 Evidence-complete score 关联的数据，不能读取 Raw Item、candidate payload、review note、hash 或治理命令。
3. Repository 严格映射并校验 score ID；页面按机会 / 风险 / 置信度分组显示因子，在独立“本次评分证据”区按 signal 显示引用，明确这是 score-level 证据集而非逐因子因果关系。
4. 引用文本只按纯文本渲染，不解释或执行来源中的任何指令；机会、风险、置信度继续独立，Evidence 数量或质量不得用于降低风险分。

**待确认的唯一产品边界**：首版 Evidence citation 展示“经 Promotion 审核的 10–500 字原文摘录 + 来源名称/类型 + `verified_at`，暂不提供外链”，还是只展示不含原文的来源元数据。确认后才能完成正式设计审批并进入 RED → GREEN 实现。

---

## 9. 其他

- Git 分支：主开发线 `codex/phase-0-1-foundation` 已含 Phase 0–6B Task 1–8；Phase 6B 通过双父提交 `3c96edf` 合并，合并后主线 `pnpm verify` 全绿。`.worktrees/phase-6b-failed-ai-review` 仍含未跟踪 `.DS_Store`，本轮未替用户删除，故未强制移除该 worktree；既有 Phase 2 / 6A worktree 清理说明见 §8.3。
- dev server / worker 是否仍在运行不作为持久状态；每次接手都按 §4 重新确认并从当次日志判断
- 历史决策细节（为什么这样做）：`docs/superpowers/specs/` 与 `docs/superpowers/plans/` 下的设计文档；Phase 6A 的逐任务 RED/GREEN 证据在 `docs/tasks/canonical-intelligence-governance-workbook.md`
- DeepSeek 计费注意：130 次真实抽取消耗约 62 万 prompt tokens（每输入截取 12K 字符上限）；批量跑前评估成本
- 隔离测试栈（Phase 6A 起长期存在）：远程 ECS 上第二个 Supabase 项目 `airdrop-intelligence-governance-test`（db `64322` / Kong `64321`，workdir `/root/airdrop-governance-test`，CLI `./cli/node_modules/.bin/supabase` v2.112.0）。本地隧道 `16432 → 64322`、`16433 → 64321` 跑真实集成测试。**只允许对它 reset**，生产栈（54322/54321）绝不 reset
- 交接时的数据库快照（2026-08-14，未含 Phase 6A 变化）：16 迁移已应用；14 项目（12 demo + Ethereum + novanet 等实为 13 项目含 novanet + Ethereum）；raw_items 23；discovered_items 131；ai_runs 131（130 Phase 3 + 1 Phase 5 编排验证）；extraction_candidates 7（全 promoted）；signals 20（demo + 6 Ethereum 真实 + 1 novanet 编排验证）；project_scores 26 行（12 项目含历史版本行）；score_factors 117；score_signal_links 已建。novanet 的 `airdrop_season_announcement` 信号及其评分（74.8/40/27 watch）是 Phase 5 端到端验证产物，内容为合成测试数据。2026-08-22 Phase 6A 门禁上线后的短暂隐藏已通过 demo 补证与 7 条历史对账恢复，实际结果见 §8.2
