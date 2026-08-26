# Airdrop Intelligence OS — 交接手册

> 交接日期：2026-08-14（WorkBuddy → GPT Codex）
> 最近更新：2026-08-26（Phase 7A Task 1 strict security contracts 已完成；下一步为纯 domain security rules）
> 权威规范：仓库根目录 `AGENTS.md`（产品规则与工程约束的唯一事实来源，本手册不重复其内容，只补充现状与经验）
>
> **当前一句话状态（2026-08-26 仓库复核）**：Phase 0–6B Task 1–8 与详情页 score factors + 经审核 Evidence 引用功能均已在主线 `codex/phase-0-1-foundation`；当前 HEAD `74f0e6c`，功能锚点 `a372880`。仓库含 21 个迁移，但生产仍只能按 2026-08-22 的最后证据视为已应用 19 个；第 20/21 个 migration 均为 **production unapplied**。下一产品开发入口是安全事件/指标与 verified allowlisted references 的前置架构设计，不是直接开发教程；任何 rollout 仍须实时 preflight、备份、Auth/reviewer readiness 与显式授权。

### 2026-08-26 本轮接续复核进度

| 步骤 | 状态 | 已核对内容 / 后续动作 |
|---|---|---|
| 1. 阅读交接手册与上一会话 `01a03208-81fd-7983-afad-2dec796e5aeb` | **完成** | 上一会话已完成详情页 score factors + reviewed Evidence 功能的最终复审、本地主线快进集成和合并后门禁；当前分支仍为 `codex/phase-0-1-foundation`，HEAD 为文档收尾提交 `74f0e6c`，功能提交锚点为 `a372880`。当前仅有三个未跟踪 `.DS_Store`，本轮不触碰。生产 rollout 与第 20/21 个迁移均未获执行授权。 |
| 2. 复核项目目录产出 | **完成** | 当前主线共 276 个 Git 跟踪文件：23 个 docs、101 个 apps、94 个 packages、21 个 forward-only migrations、12 个 pgTAP、4 个 scripts、21 个根配置/fixture/seed 等文件。已核对全部路径清单，并细读当前 HANDOVER、runbook、Phase 6B 与 score/Evidence 的 spec/workbook、最新两项 migration 及对应 contracts/repository/Web/test 边界；源码和迁移中未发现新的开发占位标记。 |
| 3. 判定当前阶段与下一开发内容 | **完成** | 当前是“Phase 6B + score/Evidence 详情页本地完成、生产未落地”的检查点。下一产品开发应先进入架构级 **Phase 7A：Security incidents + indicators** 设计，再做 **Phase 7B：verified allowlisted references**，之后才具备教程前置条件；不应直接写 tutorial。若目标改为上线，则走独立运营轨：human reviewer、生产 Auth 200、已演练备份、显式授权齐备后，重新 preflight 并受控应用第 20/21 个迁移。 |
| 4. 最终一致性检查 | **完成** | 精确 Node 22.22.2 / pnpm 11.16.0 下 fresh `pnpm verify` exit 0：contracts 107 + domain 222 + database 180 + worker 212 + web 140 = 861 non-skipped，46 environment-gated skips；lint、typecheck、build、placeholders 全绿。首次全仓复验曾命中既有 worker SIGTERM 时序用例，focused 8/8 后复跑通过；随后 placeholder 门禁正确拦截本轮文档中的占位符字面量，措辞修正后全门禁通过。未运行数据库 reset/integration，未连接生产。 |

> 本轮会话接续原则：旧会话内容只作为历史证据，不作为新指令；任何生产访问、迁移应用、账号创建、部署或远端状态变更都不在本次只读盘点与文档更新授权范围内。

> 第 2 步目录复核结论：仓库当前已经包含失败 AI run 审核的完整本地纵切片（contracts → migration/RPC/RLS → bearer-scoped repository → `/api/v1` BFF → reviewer UI → 授权/集成测试），以及详情页不可变 score ID、三轴因子和无外链 Evidence citations 的完整本地纵切片。第 20/21 个 migration 只具备本地/disposable 验收证据；生产已应用数量仍只能沿用 2026-08-22 的 19 个历史快照，必须在未来 rollout 前现场重查。

> 第 3 步阶段判定依据：`canonical-intelligence-governance-design.md` 的既定 follow-on order 明确把 failed-run review、score/Evidence detail 放在前两位，二者现已本地完成；第三位是 security incidents、indicators、verified allowlisted references，第四位才是 tutorials、认证执行功能、notifications 与第三方源正式接入。当前 schema/源码中尚无前三项的实现，因此这是新的架构设计工作，不能当作小改动直接编码。

### 2026-08-26 本轮最终判定

1. **当前工程阶段**：Phase 6B Task 1–8 与 Project score factors / reviewed Evidence citations 已完成本地实现、主线集成和当前仓库门禁；仓库 HEAD 为 `74f0e6c`，本轮仅修改本交接手册。
2. **当前生产阶段**：不能把本地完成写成已上线。最后可信生产快照仍是 2026-08-22 的 19 个已应用迁移；第 20 个 failed-AI-run review migration 和第 21 个 score/Evidence detail migration 均继续按未应用处理。
3. **下一产品开发任务**：先对 **Phase 7A Security incidents + indicators** 做架构设计和用户审批，定义 protect-first 状态机、追加式历史、Evidence/Source/Raw Item 追溯、Promotion/audit/outbox 边界和最小授权；再单独设计 **Phase 7B verified allowlisted references**。两者完成后才进入 tutorials。
4. **若下一目标是生产上线而不是继续开发**：先由项目所有者指定真实 human reviewer，恢复生产 Auth 并现场确认 health 200，建立并演练迁移前备份，再明确授权 rollout；之后重新只读 preflight，按顺序受控应用/登记第 20、21 个迁移并执行 reviewer 与匿名读路径 smoke/拒绝矩阵。

### 2026-08-26 Phase 7A 设计进度

| 步骤 | 状态 | 结论 / 后续动作 |
|---|---|---|
| 1. 现状与边界研究 | **完成** | 当前仓库已预留 `security_reviewer` 角色、`security_risk` / `scam_indicator` AI 候选类型、`paused` project lifecycle 与 `blocked` recommendation 枚举；但没有 security incident/indicator 的 canonical 表、契约、命令、repository、API 或 UI。现有确定性评分器只产生 `act_now/watch/research/avoid`，不会产生 `blocked`。 |
| 2. 产品范围澄清 | **完成** | 已确认独立 posture、两级作用域、三档状态、最严格合成、权限/候选入口、source/project 门禁、完整 reviewer/public UI 与逐 indicator 公共披露审批。 |
| 3. 架构方案与分节设计 | **完成** | **已确认**采用追加式 Security Ledger，不采用可变 incident 聚合或复用 signal/catalog；总体架构与数据边界、命令/状态/事务、读模型/门禁/UI、安全测试/验收/不做项四节均已逐节确认。 |
| 4. Spec / plan / TDD 实施 | **进行中** | 正式 spec 已批准；实施计划 `docs/superpowers/plans/2026-08-26-phase-7a-security-incidents-indicators.md` 与 workbook `docs/tasks/phase-7a-security-incidents-indicators-workbook.md` 已完成并自审，拆成 11 个独立 RED/GREEN/review/commit 任务。用户已选择方案 1：Subagent-Driven；规划基线 `c102df6`、隔离 worktree/分支与 SDD ledger 均已就绪，55 个 task-pair 和 11 个任务内部预检无冲突。Task 1 已以 TDD 新增 `@airdrop/contracts` 的 strict security enums、candidate/review/incident/disclosure commands、internal/public projections、opaque cursors 和 safe outbox events；5 个 security test files 的 RED 是缺失 root exports，GREEN 为 contracts 12 files / 128 tests，lint/typecheck 均 exit 0。没有数据库、应用行为、依赖、迁移、reset、集成或生产访问变更。下一步执行 Task 2 pure security rules。 |

Phase 7A 设计铁律：安全态与 opportunity/risk/confidence/score recommendation 保持独立；AI/collector 只能提交候选数据，不能写 canonical incident、最终 security decision 或解除封锁；事件、指标、决策和解除历史必须追加保留并追溯到 Evidence、Raw Item 与 Source；先施加最小相关预防措施，再调查；本阶段不包含 verified links、tutorials、notifications、自动交易或绕过类功能。

**已确认的 Phase 7A 产品决定 1 — 独立安全覆盖层**：公开/内部消费者读取独立的 security posture，而不是由安全事件重写 Catalog lifecycle 或评分历史。安全封锁不会降低或覆盖 opportunity/risk/confidence，也不会伪造新的 deterministic score recommendation；页面可以同时显示原评分与当前安全限制。安全态恢复必须追加新的 reviewer decision，保留原 incident、indicator、precaution 与解除依据。

**已确认的 Phase 7A 产品决定 2 — 最小封锁粒度**：首版 canonical security effect 仅作用于 `project` 或 `source`。来源级风险只暂停该来源的后续安全消费，不自动扩大为项目级封锁；只有事件证据指向项目整体时才创建项目级 precaution。indicator 可以记录域名、URL、合约地址、交易哈希或其他受约束观察值，但本阶段不为这些值建立公开链接解析、reference 级 enforcement 或教程联动。

**已确认的 Phase 7A 产品决定 3 — 人工 canonical 权限边界**：只有当前持有未撤销 `security_reviewer` 或 `admin` grant 的 Supabase 会话，才能调用受保护命令创建 incident + 初始 precaution、升级/降级 precaution 或解除安全限制；调用者身份必须来自 `auth.uid()`，不能由请求体指定。AI、collector、普通 reviewer、普通 admin 以外的应用角色只能提交或持有候选数据，不能写 canonical security decision。接受命令必须把 decision、precaution history、audit/command receipt 与 transactional outbox 原子提交。

**已确认的 Phase 7A 产品决定 4 — blocked source 的 Evidence 门禁**：来源级 precaution 生效后，该 source 立即停止进入新的采集/公开情报消费，并从公开 Evidence 有效性判断中排除。仅由 blocked source 支撑的 published signals 与 scores 保留在数据库但从公共读模型隐藏；若同一 claim/score 仍有其他未封锁来源的完整有效 Evidence，则继续公开。项目详情与冲突/历史记录不被删除或静默覆盖。

**已确认的 Phase 7A 产品决定 5 — blocked project 的公开呈现**：项目级 precaution 生效后，该项目立即退出首页推荐、可执行机会排序和 `act_now/watch/research/avoid` 统计，但不删除项目、signals、scores、Evidence 或安全历史。公共机会页提供独立“安全封锁”视图；详情页继续可访问，优先展示安全警告、当前 posture 与可公开的 incident 摘要，并将既有机会/风险/置信度和 score recommendation 明确标成安全事件前的历史评分快照，不能作为当前行动建议。

**已确认的 Phase 7A 产品决定 6 — 三档 posture**：安全覆盖层使用 `clear / caution / blocked`。`clear` 表示没有有效 precaution；`caution` 保留公开展示与普通排序并显示警示，既有 Evidence 暂不失效，但该 target 的新 canonical intelligence 必须经过 active security reviewer 复核；`blocked` 执行已确认的 source/project 强制门禁。posture 不写回评分轴、score recommendation 或 project lifecycle。

**已确认的 Phase 7A 产品决定 7 — 并发 incident 合成与解除**：同一 target 的当前 posture 由全部未解除 precaution 的最严格等级确定，优先级固定为 `blocked > caution > clear`。incident 的降级、解除与重新开启都追加新 decision/precaution history，并要求受约束 reason code 与 Evidence；处理一个 incident 不影响其他 incident。`clear` 只能在该 target 不再存在任何有效 precaution 时由读模型推导，禁止用可变字段或最后写入覆盖历史。

**已确认的 Phase 7A 产品决定 8 — 两类 candidate 入口**：现有 AI/collector 管线产生的 `security_risk` / `scam_indicator` extraction candidates 必须从普通 signal Promotion 路由到专用 security candidate review queue；它们是非 canonical 候选，不能触发 precaution。active security reviewer 还可选择既有 Evidence 提交结构化 indicator candidate，但仍需经过同一受保护审核边界。首版不接第三方 threat-intelligence API、链上监控供应商或社区公开举报入口，这些后续单独设计来源可信度、速率限制与滥用防护。

**已确认的 Phase 7A 产品决定 9 — 完整 reviewer + public UI 纵切片**：复用既有 Supabase browser session、认证验证器和 `/review` 专用 shell，但在 contracts、database、repository、BFF routes 与 UI 上建立独立 security 模块，不把安全事件塞进 failed-AI-run review 表。reviewer 端覆盖候选列表/详情、人工候选、incident 创建、precaution 调整、历史与解除；公共端覆盖 blocked 列表、机会/详情 posture 与安全警示。CLI 仅作受保护运维辅助，不是主审核入口。

**已确认的 Phase 7A 产品决定 10 — 分级公共披露**：公共投影默认只暴露 posture、事件类别、严重度、安全摘要、首次发现/最近验证时间与受影响 scope。indicator 值只有在 security reviewer 的追加式决策中被逐条标记 `public_safe` 后才能公开，并始终按受约束惰性文本渲染，不生成 anchor、HTML、Markdown 或可执行链接。内部调查 note、Evidence locator、candidate payload、reviewer identity 和未批准 indicator 永不进入公共投影。

**已确认的 Phase 7A 架构选型 — 追加式 Security Ledger**：采用独立的 candidate → indicator → incident → decision/precaution history → derived posture 数据链。拒绝在 incident 主记录上覆盖当前状态，也拒绝复用 signals、project lifecycle 或 score recommendation 表达安全决定。protected command 必须以真实 Supabase reviewer session 归因，并原子写入追加式历史、command receipt、security audit 与 transactional outbox；公共/内部 current posture 只从 ledger 推导。

**已确认的 Phase 7A 设计第 1 节 — 总体架构与数据边界**：完整链路固定为“AI/collector 或 reviewer 人工提交 candidate → 专用 security candidate review → 受保护命令 → canonical indicator + Evidence links → incident + 追加式 decision/event history → project/source derived posture → collection、Evidence、opportunity 与公共投影门禁”。独立数据对象为 `security_indicator_candidates`、`security_candidate_review_decisions`、`security_indicators`、`security_indicator_evidence_links`、`security_incidents`、`security_incident_indicator_links`、`security_incident_decisions`、`security_events`、`security_review_commands`；事务性消息复用既有 `outbox_events`，但使用版本化 security event type。`packages/contracts` 唯一定义枚举、命令、回执、读模型、错误与事件 payload；`packages/domain` 只实现 posture 合成、状态转换、reason compatibility 与公开披露等纯规则；`packages/database` 负责追加式 schema、RLS、受保护事务命令、repository、读模型和 outbox。禁止在 incident 或 target 上存可覆盖的 `current_posture`：单 incident 当前效力由其最新追加决策推导，同一 target 再按 `blocked > caution > clear` 合成；canonical 写入不得经浏览器或普通表 DML 绕过受保护命令。

**已确认的 Phase 7A 设计第 2 节 — 命令、状态与事务流程**：candidate 审核支持追加式 `needs_review`、`reject`、`accept_and_open` 与 `accept_and_attach`；前两者不创建 canonical 数据，后两者必须先确定性验证 target、Evidence → Raw Item → Source、locator、indicator 类型/值、source posture 与 scope。grounding 失败时只追加 `needs_review` 决定与安全审计，不创建 indicator、incident 或 precaution。incident 命令固定为 `open`、`adjust`、`resolve`、`reopen`，indicator 披露由独立 `set_indicator_disclosure` 命令逐条追加或撤销 `public_safe`；初始/重开/调整 posture 只能显式选择 `caution` 或 `blocked`，`clear` 仅由无有效 precaution 推导。所有 posture 变化均要求受约束 reason code 与有效 Evidence。每个成功 mutation 必须在单一数据库事务中原子提交 decision、必要的 indicator/Evidence/incident links、security event、command receipt 与版本化 outbox；事务期间不得调用模型、collector 或外部 API。所有 mutation 使用 `Idempotency-Key`，candidate/incident mutable aggregate 命令使用 `expected_version`；同 key 同请求精确重放，同 key 异请求报幂等冲突，同 incident 并发仅一个期望版本成功，不同 incident 可并发且 target posture 始终按全部有效 precaution 的最严格等级推导。调用者只取当前 Supabase `auth.uid()`，每次重新验证 active `security_reviewer` 或 `admin`；错误使用稳定领域码并清洗，outbox 仅携带安全对象引用/版本/类型/scope/posture，不携带身份、内部 note、locator、candidate payload 或 indicator 值。

**已确认的 Phase 7A 设计第 3 节 — 读模型、门禁与界面流程**：内部读模型提供 candidate queue/detail、incident detail/history 与分别按 project/source 推导的 target posture；公共读模型只提供 project posture、获批 incident 摘要、逐条 `public_safe` indicator 和独立 blocked-project 游标列表。`blocked source` 在调度、外部请求前和写入事务前多点重检，停止新增采集/抽取/普通 Promotion/公开 Evidence 消费但保留历史；其已采集且确定性 grounded 的 Evidence 仍可由 Security Ledger 作为内部调查依据，绝不因此恢复普通公共资格。`caution` 可继续采集抽取，新 canonical intelligence 只能由 active security reviewer/admin Promotion。`clear` 沿用普通 Promotion 权限，`caution` 强制 security reviewer，`blocked` 除 Security Ledger 命令外拒绝新 canonical intelligence；强制检查必须落在受保护数据库命令边界。当前 schema 只有 score → signals → Evidence 而没有 factor → Evidence 归因，因此安全资格按整份 score 处理：每个 score-linked signal 均须保留至少一条非 blocked source Evidence，否则整份 score 及其 factor rows 退出当前公共排序并保留为历史，禁止伪造 factor 级证明；source 封锁不得自动升级为 project 封锁。reviewer UI 复用 `/review` 认证 shell，新建 `/review/security` 完整候选、incident、posture、披露和历史流程，高影响命令显式确认，409 刷新而不覆盖；公共 UI 提供独立安全封锁视图，`caution` 保留排序并警示，`blocked` 退出普通机会/统计但详情可访问且行动入口停用。公开 indicator 始终是经批准的惰性文本。Reviewer API 使用 `/api/v1/review/security/*`，公共 blocked 列表使用 `/api/v1/security/blocked-projects`，现有 opportunity/detail 只接严格 security projection；Route Handler 不执行长任务。

**已确认的 Phase 7A 设计第 4 节 — 安全测试、验收标准与明确不做项**：contracts 必须验证 strict schema、类型/scope/reason 兼容、游标/边界、精确安全投影及敏感字段泄漏变异；domain 必须穷举 posture 合成、多 incident、追加式状态转换、Evidence/整份 score 门禁与披露规则；disposable Supabase 必须覆盖全部主体 RLS、protected-command-only canonical 写入、`auth.uid()` 归因、append-only、原子回滚/outbox、幂等/版本与双 session 并发。集成测试必须覆盖 source 在排队后、请求前、请求中的封锁时序、替代 Evidence、最后有效 Evidence 失效、caution Promotion、blocked project 公共流与 incident 独立解除；BFF/UI 覆盖认证、角色撤销、游标、409、确认流程、惰性文本/XSS 与 browser bundle 泄漏。Golden Dataset 增补明确/否定/历史/错实体/格式/冲突/prompt injection/locator/虚构引用样本，模型永远只产 candidate。完成必须同时证明 Evidence → Raw Item → Source 追溯、protect-first 原子性、即时门禁、公共零泄漏、clear 无回归、完整数据库与仓库门禁全绿并同步文档；明确排除 Phase 7B、reference enforcement、tutorials、notifications、钱包/交易、第三方威胁源/链上监控/公众举报、AI 自动 canonical 决策、scope 自动升级、评分/lifecycle 改写、实时推送及生产 rollout。

**Phase 7A 正式设计规范与自审结论**：正式规范已写入 `docs/superpowers/specs/2026-08-26-phase-7a-security-incidents-indicators-design.md`，并已获用户最终批准，状态为 `Approved`。自审补强了三项不改变已批产品范围的实现约束：① Security Ledger 可使用 blocked source 的历史 grounded Evidence 进行内部调查，但普通公共 Evidence/score 资格继续 fail-closed；② 现有模型没有 factor 直接 Evidence 归因，故门禁整份 score 及其 factor set，避免虚构因果关系；③ security command、ordinary Promotion、score persistence 与 source collection persistence 使用同一确定性 target advisory lock，按提交先后序列化封锁竞态，且命令时间取数据库事务时钟、不接受调用者伪造 reviewer/timestamp。规范已明确严格枚举/契约、九张 ledger 对象、RLS/append-only、candidate 版本、outbox 安全字段、全部 reviewer/public API/UI、Golden Dataset 与完成门禁；下一步是完成实施计划并由用户选择执行方式，不是直接跳过计划编码。

**Phase 7A writing-plans 结果**：实施计划已写入 `docs/superpowers/plans/2026-08-26-phase-7a-security-incidents-indicators.md`，配套跟踪表已写入 `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`。计划按 contracts → domain → 单一 forward migration/pgTAP → bearer repository/races → extraction/Promotion → collection/scoring → public repository → BFF/client → reviewer UI → public UI → Golden/E2E/runbook/full verify 拆为 11 个任务、67 个 checkbox steps；每个任务均要求 RED、具名失败、最小 GREEN、focused gate、HANDOVER/workbook 更新和独立 conventional commit。自审已逐节映射 approved spec，修正跨任务类型/函数名、candidate/incident/indicator 版本、数据库事务时钟、score-level Evidence 语义和同 target advisory-lock 竞态；占位措辞扫描、`pnpm check:placeholders`、结构检查与 `git diff --check` 均通过。执行前必须使用 using-git-worktrees 建立 `codex/phase-7a-security-ledger` 隔离 worktree 并重跑 declared-runtime baseline；生产继续不在授权范围。

> **2026-08-22 历史接续结果（当时状态）**：先完成 225 个跟踪产出与主线核验，再按 §8.2 将 Phase 6A 三迁移原子应用并逐条登记；创建强随机密码的最小权限治理登录与在册审核人；补齐 12 组 demo Evidence；历史对账 `processed=7 / linked=7 / needsReview=0` 且重跑为 0；四个真实 Web 请求均为 HTTP 200。Phase 6B 的详细设计、九任务实施计划和开发工作簿已经固化；当时的下一步是在隔离 worktree 中从 Task 1 contracts 开始执行 RED → GREEN（该动作现已由 6B 分支完成）。

### 2026-08-24 本轮交接复核进度

| 步骤 | 状态 | 已核对内容 / 后续动作 |
|---|---|---|
| 1. 完整阅读交接手册 | **完成** | 已逐行读完本文件 432 行；确认手册同时包含“主线 Phase 0–6A 快照”和“Phase 6B Task 1–8 本地完成”两层状态，后续必须用当前仓库事实校准，不能只沿用顶部旧摘要 |
| 2. 复核项目目录下产出文件 | **完成** | 已核对 228 个主线跟踪文件、应用/包源码、19 个迁移与 10 个 pgTAP 文件、全部阶段文档，以及 6B worktree 的 46 文件 / 8,776 行新增实现；确认 6B 分支干净（仅未跟踪 `.DS_Store`）且产出闭环 |
| 3. 判断当前阶段与下一开发内容 | **完成** | 详情页 score factors + 经审核 Evidence 的本地实现与最终整分支复审已完成，Ready to merge: Yes；下一步由用户决定如何集成。生产 rollout 仍须实时 preflight、备份、Auth/reviewer readiness 与显式授权 |
| 4. 执行主线集成与正式门禁 | **完成** | 已协调 HANDOVER 冲突、修正 workbook 的 Task 7/8 commit 残留，并在 Node 22.22.2 / pnpm 11.16.0 下执行合并后 `pnpm verify`：798 通过、42 条环境条件跳过，lint / typecheck / build / placeholders 全绿，exit 0 |
| 5. 集成详情页评分因子与 Evidence 引用 | **完成** | 用户选择本地合并；`codex/project-score-evidence-detail` 已从 `63f5278` 快进集成到 `codex/phase-0-1-foundation` 的 `a372880`。主工作区首次门禁因 registry DNS `ENOTFOUND` 止于依赖安装，随后从既有 pnpm v11 缓存以 frozen lockfile 离线恢复（lockfile 未变），fresh `pnpm verify` 861 non-skipped / 46 gated skips 全绿，lint/typecheck/build/placeholders 均 exit 0。生产未访问、迁移未应用。 |

### 2026-08-24 本轮最终判定

1. **当前阶段**：Phase 6B 的产品代码、迁移、契约、BFF、审核 UI、授权矩阵与文档已完成并集成到主线。“主线集成完成”和“生产部署完成”仍必须分开表述；后者尚未发生。
2. **本轮集成结果**：已合入 `codex/phase-6b-failed-ai-review`，人工协调本手册并保留 §8.5 生产检查点；修正 workbook 的 Task 7/8 commit 残留和重复 Task 7 汇总；Node 22.22.2 / pnpm 11.16.0 合并后 `pnpm verify` exit 0。
3. **生产 rollout 不是当前可自动执行的下一步**：截至 2026-08-22 最后一次只读预检，仍缺项目所有者确认的 human reviewer、健康的生产 Auth 服务和已演练的迁移前备份；三项补齐后还需显式生产授权，才能应用第 20 个迁移并执行 smoke/拒绝矩阵。
4. **详情页功能开发**：`score_factors` + 经审核 Evidence 引用的 anon 安全读模型、repository、真实集成与 Web 展示已在独立分支本地完成。引用只展示已审核、受 grounding 约束的惰性文本，无链接；机会/风险/置信度继续独立。该功能 production unapplied；教程生成仍应排在链接白名单与 security incidents 前置设计之后。
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

当前测试基线：**Node 22.22.2 / pnpm 11.16.0 下主线合并后 `pnpm verify` 全绿**（lint / typecheck / test / build / placeholders），861 个非跳过测试、46 个 environment-gated skips，exit 0（contracts 107 / domain 222 / database 180+44 skipped / worker 212+2 skipped / web 140）。详情页功能在 disposable 栈的最终执行报告记录 full pgTAP 1114/1114 与 anonymous repository integration 44/44；这些远端/数据库证据未在本次本地合并步骤重放，生产仍未访问或应用第 21 个 migration。

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
10. 运营/审核后台界面（目前只有 API）；详情页 score factors / reviewed Evidence 的本地实现已完成，生产未应用
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

**2026-08-24 产品确认、规范与计划**：项目所有者已确认采用“经 Promotion 审核的 10–500 字原文摘录 + 安全来源元数据 + `verified_at`，首版不提供外链”的推荐方案，并已审核通过 `docs/superpowers/specs/2026-08-24-project-score-evidence-detail-design.md`。详细实施计划已写入 `docs/superpowers/plans/2026-08-24-project-score-evidence-detail.md`，拆为 contracts、数据库读边界、repository、真实匿名集成、Web 展示、全门禁六个 RED → GREEN 任务；下一步是在隔离 worktree 中按所选执行方式实施。

**2026-08-24 执行基线**：已按用户选择启用 subagent-driven execution，在 `.worktrees/project-score-evidence-detail` / `codex/project-score-evidence-detail` 建立隔离环境；Node 22.22.2 / pnpm 11.16.0 基线 `pnpm verify` exit 0（798 non-skipped，42 skipped，lint/typecheck/build/placeholders 全绿）。受限网络无法访问 registry，依赖经明确授权从既有 pnpm v11 用户缓存离线重链接，lockfile 与依赖版本未变化。Task 1 当时尚未开始。

**2026-08-24 Project score Evidence Task 1（contracts）**：已完成严格 public projection contracts：新增 `scoringAxisSchema` / `ScoringAxis`、`PublicProjectScoreFactorRow`、`PublicProjectEvidenceCitationRow` 及严格 snake_case row schemas；复用 source/signal 枚举，拒绝额外或不安全字段，并要求登记为官方的来源具备 relation verification time。domain scoring model 现在重导出 contracts 的 `ScoringAxis`，评分算法未改。TDD RED 为缺失 exports（新 29 项失败、既有 78 项通过）；GREEN：contracts 107/107、domain 222/222，两个 typecheck 均 exit 0。无 application/database 行为、迁移或生产访问变更；详见 `docs/tasks/project-score-evidence-detail-workbook.md`。

**2026-08-24 Project score Evidence Task 2（database boundary，database/typegen GREEN）**：已在 migration 不存在的前提下编写 `supabase/tests/012_project_score_evidence_detail.test.sql`，覆盖所需对象、精确列/options/grants、RLS/列权限、浏览器 mutation/不安全字段拒绝、全角色矩阵，以及 active / rumored / historical / zero-link / unevidenced / paused / 同一 signal 两条 Evidence / unrelated private fixture。只读 SSH preflight 已确认远端 `/root/airdrop-governance-test` 的 project ID 为 `airdrop-intelligence-governance-test`、容器 `supabase_db_airdrop-intelligence-governance-test` 映射 DB host port `64322`、固定 paused marker 精确存在，并确认远端 Task 2 migration 不存在。首次同步因安全审查要求具体授权而在写入前停止；用户随后对精确 host/workdir/payload/操作白名单显式授权，由可信根上下文执行白名单同步/reset。focused RED 在 migration absent 状态下非零退出：11/12 已报告断言按名称命中两个 helper、两个 view、`project_score_id`、函数配置/授权和精确 view columns 缺失。随后三项 SQL SHA 匹配后仅 reset disposable 栈，exit 0。migration 首次即成功编译；两轮 test-only harness 修正（cross-join alias、view denial 消息）未改 migration。最终 `012` SHA-256 `0a66a679b0a7fb649d75dd3ddfa7309adf102b3569a7f63dbbdb0bbd1e3ad61c`，focused 83/83 PASS。full pgTAP 首轮仅 006 新 policy 期望顺序错误；最终 006 SHA-256 `b7bff1945a659eb49979cbe28e2a2e9dbbc8904915dd2b1d4952e76306dd8fdd`，12 files / 1114 tests / PASS。marker-verified DB 64322 上同版本 CLI typegen 两次，remote/local/committed bytes 完全一致，SHA-256 `f4fed028fb876e1ec8d5028ab352311281dae531101dfe13d5c7a0c67cc9b166`、91,425 bytes，新 views/helpers 与 `project_current_state.project_score_id` 均存在。连接值未输出。active/rumored current factors、active-only citations、历史/不完整/zero-link/paused/unrelated 隐藏、两条 Evidence 保留、精确 grants/不安全列/mutation 拒绝均通过。至此仍未访问生产或 54321/54322。

**2026-08-24 Project score Evidence Task 2（final local gate）**：精确浏览器授权为两个 helper 的 `EXECUTE`、`score_factors(project_score_id, axis, factor_code, contribution, input_value, detail)`、`score_signal_links(project_score_id, signal_id)`、`signal_evidence_links(signal_id, evidence_id)`、`evidence(id, source_id, source_field, quote_text, verified_at)`、`project_scores(id)` 的列级 `SELECT`，以及两个新安全 view 的 `SELECT`；无 Raw Item SELECT 或浏览器 mutation。citation 是无链接惰性纯文本，仅为 score-level Evidence，不声称 factor 因果。数据库 package lint/typecheck 均 exit 0，159 测试通过（40 环境门禁 skip）。全仓 `pnpm verify` 首轮在并发负载下触发既有 worker SIGTERM 用例 1 秒时序界限；该未修改用例随即 focused 8/8 PASS，未做无关修复。fresh 全仓复跑 exit 0：lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 159 + worker 212 + web 127 = 827 个 non-skipped 测试通过，42 个既有环境门禁 skip。opportunity/risk/confidence 及评分语义未改；生产、`airdrop-intelligence-os` 和 54321/54322 全部未触碰。

**2026-08-24 Project score Evidence Task 2（independent review）**：独立审查已核对 `28c2fef..e106c8a` 全部差异、设计、任务说明、migration、pgTAP、generated types、workbook/HANDOVER，并重新运行 database lint/typecheck/test（159 passed、40 environment-gated skipped）；结论为 **Compliant / Approved**，Critical、Important、Minor 均为 0。审查确认 helper 的 owner/search_path/revoke、security-invoker/barrier views、active/rumored factors 与 active-only citations、精确列授权、官方来源关系验证、score-level Evidence 非因果边界及无敏感字段暴露。远程 RED/GREEN、64322 reset、双 typegen 和“未访问生产”属于本轮审查未重放的 report-attested 证据，已明确标记 cannot-verify；现进入 Task 3 repository 严格读取实现。

**2026-08-24 Project score Evidence Task 3（repository + review fix）**：`1a5e26e` 新增两个严格 repository 读取 API；`ProjectScore.id` 与总分字段来自同一 `project_current_state` 行，因子/引用查询同时 filter `project_id` 与不可变 `project_score_id`，只选择 7/15 个安全列，每行先经 Task 1 strict Zod schema 再映射，PostgREST 错误不携带 message/details/hint/body，排序规则具备稳定 tie-breaker。首轮独立审查确认生产实现正确，但发现 1 个 Important：测试未锁住“同一次 current-state 查询 + 精确 projection”。原实现代理以 test-only commit `23c30d7` 增加 exact projection 与 exactly-once relation lookup 保护；移除 `project_score_id` 和增加第二次 lookup 的两项临时 mutation 均产生具名 RED，恢复后 focused 28/28、database lint/typecheck 及 fresh `pnpm verify`（842 non-skipped、42 existing skips）全绿。复审结论 **Compliant / Approved**，原 Important Resolved，Critical/Important/Minor 均为 0；生产 repository 相对 `1a5e26e` 无额外改动。现进入 Task 4 真实匿名 PostgREST 集成覆盖。

**2026-08-24 Project score Evidence Task 4（real anon integration + isolation fix）**：`97d5f46` 用随机 test-owned IDs 扩展真实匿名 PostgREST fixture，覆盖同一 `latestScore.id`、active 三轴 factors、active 同一 signal 的两条 distinct Evidence、rumored factors 可见但 citations 隐藏、historical factors/citations 隐藏及安全对象 exact keys。新断言因 Task 2–3 已完成而首次直接 GREEN（full integration 44/44）；按 ledger 临时移除 score-ID filter 后，历史 score 具名断言 RED，恢复后 focused 7/7。首轮独立审查发现 1 个 Important：focused run 遗留的 official+verified `project_sources` 会污染 durable-queue eligibility；另有 1 个 workbook commit Minor。`d039f3e` 在 `afterAll` 事务内先复验固定 disposable marker，再仅按本轮随机 source/project IDs 删除三条**可变** `project_sources`，不删除 Evidence、signal/Evidence links、score links、factors 或 score history。无中间 reset 的 project 7/7 → queue 9/9、连续两轮 full integration 44/44 均通过；fresh `pnpm verify` 842 non-skipped、46 environment-gated skips 全绿，最终 marker-verified disposable reset 后 repository-test score count=0。复审结论 **Compliant / Approved**，原 Important/Minor 均 Resolved，无剩余 Critical/Important/Minor；production repository/migration/generated types 无改动。现进入 Task 5 详情 loader 与安全展示。

**2026-08-24 Project score Evidence Task 5（detail loader + safe rendering）**：`ab73551` 新增纯 `loadProjectDetailFromRepository`，保留 signals timeline；scoreless 时不调用 factor/citation，有 current score 时以同一 `projectId + latestScore.id` 在 `Promise.all` 并行读取。页面新增机会/风险/置信度三组因子与独立的“本次评分快照使用的证据集”；active citation 按 signal 分组并保留多条/冲突 Evidence，非 active 隐藏，官方来源文案只在 relation official 且具 verified timestamp 时显示。引用正文直接作为 `<blockquote>` 的 React text child，动态 `<script>` fixture 只产生 escaped inert text；组件无 anchor/href、URL/Markdown/HTML parser、`dangerouslySetInnerHTML` 或 unsafe field。Web focused 13/13、full 140/140、lint/typecheck/Next build 全绿。独立审查结论 **Compliant / Approved**，Critical/Important 为 0；仅 1 个文档 Minor：workbook Task 5 Commit 单元格应从 subject 改为 `ab73551`，已交由 Task 6 修正。全仓 `pnpm verify` 按计划由 Task 6 执行。

**2026-08-24 Project score Evidence Task 6 Step 1（database sensitivity）**：所有写入/reset/test 前均 fail-closed 复验唯一 disposable `/root/airdrop-governance-test`、project `airdrop-intelligence-governance-test`、DB/Kong containers、64322/64321、fixed paused marker、21 migrations 以及 migration/012/006/seed hashes；16432/16433 现有隧道命令亦精确指向 64322/64321。仅在远端 disposable migration copy 临时向 `anon, authenticated` 授予 Evidence `normalized_quote_sha256` SELECT，mutation SHA-256 `5ea5bf2f7337d5068d1be97e4605090d27913b8a3d51e8a78f6dd2158655899e`。Focused 012 如期 exit 1：具名第 24 项“browser roles have the exact safe base-table column SELECT matrix”与第 58 项“anonymous users cannot read Evidence hashes”失败（81/83 通过）。立即用备份 `cmp` 恢复，本地 `git diff --exit-code` 与本地/远端 SHA 均证明 migration 恢复为 committed `8c0a2e3c4a76ad8b3b155701cc665544470b9b2715deabd91d6731566c42ea60`；再次 marker/hash 复验后 fresh reset，focused 012 为 83/83 PASS。变异未进入本地 diff；未访问生产项目、容器或 54321/54322。

**2026-08-24 Project score Evidence Task 6 Step 2（UI sensitivity）**：仅将现有 citation escaping 测试名强化为具名 no-anchor 边界，再在组件中临时包装 `<a href="https://unsafe.test">`。Focused Web RED 如期 exit 1：“renders reviewed citation content as escaped inert text with no anchor and score-level wording”的 `not.toContain('<a')` 以及组件源码的 unsafe/outbound-field 断言失败（8/10 通过）。组件在同一受控流程的 `finally` 中立即恢复，恢复后与 HEAD 零 diff，SHA-256 `3760b17ac6dff9a53d58d1352a7cdcdcf471fd3be66a5c22789a6b03c33ef9b1`；focused Web 恢复态 10/10 PASS，`git diff --check` exit 0。Unsafe anchor 未进入 diff。

**2026-08-24 Project score Evidence Task 6 Step 3（final disposable database + integration gates）**：在再次完整 marker/topology/hash 复验后，仅 reset `airdrop-intelligence-governance-test`；21 migrations 与 seed 应用成功。Focused 012 为 83/83 PASS，full pgTAP 为 12 files / 1114 tests PASS。再复验 16432 → 64322、16433 → 64321 的精确 SSH 隧道与 disposable marker/artifacts，仅从指定 test containers 在 shell 内派生临时凭据（不打印、不落盘，测试后 unset）；real repository integration 为 7 files / 44 tests PASS。遵守 append-only fixture 规则，未逐行删除 Evidence/links/history；最后仅用一次 guarded fresh reset 清理，并证明 `model_version = 'repository-test'` score count 为 0、`anon` 无 `evidence.normalized_quote_sha256` SELECT、migration SHA 仍为 `8c0a2e3c4a76ad8b3b155701cc665544470b9b2715deabd91d6731566c42ea60`。未访问生产项目、生产容器或 54321/54322。

**2026-08-24 Project score Evidence Task 6 Step 4–5（repository gate + classified scan）**：Node 22.22.2 / pnpm 11.16.0 声明运行时下 fresh `pnpm verify` exit 0；lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 174 + worker 212 + web 140 = 855 non-skipped tests，46 environment-gated skips。`git diff --check` exit 0。指定四文件 unsafe/secret scan 共 5 个命中，逐条分类为：contracts 的 `article_raw_text` 是安全 `source_field` locator enum，不是 Raw Item 正文；migration 两个 `service_role` 命中是既有安全 `project_current_state` view 的 revoke/grant ACL，另两个是新 views 的显式 revoke。组件与 repository 零命中；无 secret value、credential、unsafe URL、Raw Item body、candidate/reviewer/outbox payload 或 browser-visible privileged field。

**2026-08-24 Project score Evidence Task 6（local completion checkpoint）**：Task 1–6 实现、敏感性 RED→GREEN、focused/full pgTAP、真实 integration、root gate、whitespace 与人工分类 scan 已闭环；Task 5 workbook commit 修正为 `ab73551`。功能状态为 **local implementation complete; production unapplied**。Task 6 执行期间未访问生产；这是本次执行事实，不根据未访问行为推断任何其他外部状态。

**2026-08-24 Project score Evidence Task 6（independent-review docs cleanup）**：Task 6 审查结论为实质合规/非阻塞通过，Critical/Important 为 0，留下 3 个 docs Minor。本轮只做最小文档协调：将上方过期的“下一项先设计再 TDD”更正为“本地实现与 Task 6 审查完成，下一步整分支独立审查/主线集成决策，生产仍需实时 preflight 与显式 rollout 授权”；runbook 的 database focused 命令改为精确 Vitest 文件路径；workbook Task 6 Commit 改为 `ba055c9`。Node 22.22.2 / pnpm 11.16.0 下精确 focused 命令 1 file / 14 tests PASS。本轮不改代码、测试或迁移，不扩展 Task 6 范围；后续交由整分支 reviewer 统一复核。

**2026-08-24 Project score Evidence Task 5（preflight / Web baseline）**：已确认指定目录是 linked worktree `.worktrees/project-score-evidence-detail`，分支 `codex/project-score-evidence-detail`，HEAD 精确为基础提交 `d039f3ea3f3e4a9756aa9cd08cc1f17f245134e8`；仅保留 controller 未提交的上一段 Task 4 复审记录，workbook Task 4 Commit 仍为 `97d5f46`。Task 5 brief 与已批准设计一致，无需重新定型。Node 22.22.2 / pnpm 11.16.0 下 Web 基线 7 files / 127 tests passed，exit 0；尚未新增 Task 5 测试或生产实现，未访问数据库、生产或远端。

**2026-08-24 Project score Evidence Task 5（component RED）**：先只新增 `project-score-evidence.test.ts`，覆盖三轴与当前九个 axis/factor 中文标签、贡献/输入值、unknown fallback、factor empty、active citation 分组、多条冲突 Evidence、rumored 隐藏、八类来源中文标签、审慎官方来源文案、score-level 非因果说明、无 outbound/unsafe 字段，以及 `<script>` 引用的 React 纯文本 escaping。指定 focused 命令 exit 1，唯一新 suite 具名失败为无法解析尚不存在的 `../components/project-score-evidence.js`；既有 7 files / 127 tests 仍通过。失败原因精确属于缺失组件，未写生产代码。

**2026-08-24 Project score Evidence Task 5（loader RED）**：随后只新增 `project-detail-loader.test.ts`，以完整真实 `ProjectRepository` 记录实现而非 mock，锁住既有 signal timeline 的 `projectId + limit 20`、同一个 `projectId + latestScore.id` 两类 read 在 deferred 释放前已并行启动、scoreless 返回空 factors/citations 且零 score read，以及 not-found 零后续读取。指定命令 exit 1；新 suite 具名失败为缺失 `../lib/project-detail-loader.js`，同次全量收集的另一失败仍是已记录的缺失组件，既有 7 files / 127 tests 全过。未出现非预期 RED，生产代码仍未开始。

**2026-08-24 Project score Evidence Task 5（focused GREEN）**：最小实现新增纯 `loadProjectDetailFromRepository` 与两个展示组件；server-only `loadProjectDetail` 只创建 anon repository 后委托。loader 保留既有 `listProjectSignals(projectId, 20)`，scoreless 不读 factor/citation；有 score 时两类 read 以同一个 `project.projectId + latestScore.id` 在 `Promise.all` 并行。页面顺序为确定性解释 → 三轴因子 → 独立 score-level Evidence → 原 signal timeline；citation 直接作为 React `<blockquote>` text child，无 anchor/URL/HTML/Markdown 解析。首次 GREEN 的两个局部失败分别是 `<article>` 字面前缀触发明确的 `not '<a'` 断言，以及测试引用正文重复 signal 标题造成计数误报；改为语义等价 `<section>` 并修正 fixture 文本后，focused 2 files / 13 tests 与 brief package command 9 files / 140 tests 全绿，exit 0。

**2026-08-24 Project score Evidence Task 5（Web gates / ready to commit）**：Node 22.22.2 / pnpm 11.16.0 下 fresh Web test 9 files / 140 tests、lint、typecheck、Next 16.3.0 production build 全部 exit 0；动态 `/projects/[slug]` 编译成功。组件静态检查确认无 `href`、canonical/Raw、reviewer/outbox/hash、HTML 注入、Markdown 或 URL parsing；八类来源与当前九个 axis/factor 均有中文 label，unknown code 安全 fallback，active citations 按 signal 分组保留多条/冲突 Evidence，rumored 仅显示隐藏说明，官方文案仅为“项目登记为官方来源”。Task 5 只改 Web 与文档，未新增依赖、未改 DB/RLS/repository/评分，未访问生产或远端。按批准任务拆分，full `pnpm verify` 未在 Task 5 运行且不宣称通过，由 Task 6 fresh 全门禁负责。

**2026-08-24 Project score Evidence Task 3（preflight / baseline）**：已确认隔离 worktree `.worktrees/project-score-evidence-detail` / 分支 `codex/project-score-evidence-detail` 的 HEAD 精确为 Task 2 基础提交 `e106c8afed5d878693b429b45a424ea078932bdd`，并保留 controller 未提交的上一段 Task 2 独立审查记录。Task 3 brief、设计与当前 generated view types 一致。按指定 Node 22.22.2 / pnpm 11.16.0 环境运行既有 repository 基线，database 9 files / 159 tests passed，7 integration files / 40 tests 由既有环境门禁 skip，exit 0；尚未写 Task 3 生产代码、未访问数据库或生产环境。

**2026-08-24 Project score Evidence Task 3（RED 1）**：先只新增 repository 行为测试与 project score ID 期望，再运行指定 database test 命令，exit 1。具名失败一为新 suite 无法解析缺失 helper module `../repositories/project-score-evidence.js`；具名失败二为既有 `getProjectBySlug` 返回的 `latestScore` 缺少预期 immutable score ID `20000000-0000-4000-8000-000000000002`。其余 158 个既有测试通过，40 个集成测试保持环境门禁 skip。RED 覆盖双 ID filter、精确安全投影、strict row parsing、映射、空数组、确定排序、输入 UUID 和无响应详情泄露的错误包装；此时仍无 Task 3 生产实现。

**2026-08-24 Project score Evidence Task 3（RED 2）**：在 RED 1 后只加入由测试驱动的 focused helper 实现、尚未接入 `ProjectRepository`，同一命令再次 exit 1。新 suite 14/14 均按名称失败于缺失 repository API：`listCurrentScoreFactors is not a function` 或 `listCurrentScoreEvidenceCitations is not a function`；project lookup 继续因 `latestScore.id` 缺失失败。其余 158 个测试通过、40 个集成测试按既有环境门禁 skip。该迭代保留了 helper 与 repository 两层缺失行为的独立 RED 证据。

**2026-08-24 Project score Evidence Task 3（focused GREEN）**：`ProjectRepository` 已加入 `listCurrentScoreFactors(projectId, projectScoreId)` 与 `listCurrentScoreEvidenceCitations(projectId, projectScoreId)`，均委托 focused helper；`ProjectScore` 加入 `id`，并从同一 `project_current_state.project_score_id` 行读取。两种查询都同时 filter `project_id` 与不可变 `project_score_id`；每一 DB row 先经 Task 1 strict Zod schema 再映射，额外 `url` / `raw_text` 测试行均拒绝。factor 按 opportunity→risk→confidence、contribution 降序、factor code 升序；citation 按 signal publication 降序/null last、signal ID、Evidence verification 降序、Evidence ID。PostgREST 包装仅保留 code 与固定安全消息，不带 response message/details/hint。focused 命令 exit 0：10 files / 173 tests passed，40 integration tests 由既有环境门禁 skip。

**2026-08-24 Project score Evidence Task 3（package static gates）**：按指定 runtime 并行执行 database lint 与 typecheck，两个命令均 exit 0；未新增依赖。下一步仅做源码安全投影/diff 静态复核和最终 fresh 验证，不运行 migration、RLS 或真实数据库命令。

**2026-08-24 Project score Evidence Task 3（safe projection review）**：对生产 helper 执行 URL、raw body/item、candidate、review、hash、provider、audit、outbox、credential/password/secret 禁用词扫描，零命中（`rg` exit 1 为预期）；人工复核 exact selection 为 factor 7 列与 citation 15 列，无其他字段。两条查询源码均按顺序 `.eq('project_id', projectId)`、`.eq('project_score_id', projectScoreId)`，且 row schema parse 位于 mapping 之前；`git diff --check` exit 0。未修改 score math、RLS、migration、generated types 或任何生产/远端环境。

**2026-08-24 Project score Evidence Task 3（complete local gate）**：fresh `pnpm verify` exit 0；lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 173 + worker 212 + web 127 = 841 个 non-skipped 测试通过，42 个既有环境门禁 skip。Task 3 未新增依赖，未运行 migration/RLS/真实 DB 测试，未访问或修改生产/远端环境；controller 的 Task 2 independent-review 记录已原样纳入，workbook Task 2 Commit 已从 subject 修正为精确短 hash `e106c8a`。完整执行报告见 gitignored SDD ledger `task-3-report.md`；下一任务从 Task 4 真实匿名集成覆盖继续。

**2026-08-24 Project score Evidence Task 3（final-gate timing investigation）**：在最终文档写入后第二次执行 `pnpm verify`，contracts/domain/database 均绿，随后未修改的 worker repeated-SIGTERM 用例再次超过既有 1 秒 `stopping` 时序界限，full run exit 1。`git diff --name-only` 证明无 worker 文件；按 systematic debugging 立即精确重放 `apps/worker/src/tests/health.test.ts`，1 file / 8 tests 全绿、exit 0，符合 Task 2 已记录的并发负载敏感行为。未对无关 worker 源码/测试做任何修复；提交前必须 fresh 重跑完整门禁并以其结果为最终依据。

**2026-08-24 Project score Evidence Task 3（final fresh rerun）**：在 focused worker 8/8 后且保持 worker 零改动，fresh `pnpm verify` exit 0：lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 173 + worker 212 + web 127 = 841 个 non-skipped 测试通过，42 个既有环境门禁 skip。此轮为 Task 3 提交采用的最终全仓证据；仅剩文档占位/diff/提交范围检查，不再修改产品代码。

**2026-08-24 Project score Evidence Task 3（independent-review fix loop opened）**：独立审查 `1a5e26e` 发现 1 个 Important 测试敏感性缺口，生产实现本身确认正确：原 `createProjectLookupClient` 未记录 relation calls / exact selection，因此移除 `project_score_id` 投影或增加第二次 latest lookup 时测试可能仍通过。最小 test-only 修复已加入具名 current-state snapshot-query 用例，literal projection 同时包含 `project_score_id` 与全部已展示 score fields；fake 记录 relation/selections，并对非 `project_current_state` 或任何第二次 relation lookup 立即失败。workbook Task 3 Commit 已同步为 `1a5e26e`。下一步用 disposable mutation 分别证明 projection 与单次 lookup 断言会 RED，完整恢复后再运行 GREEN；不改生产实现、不做独立自审。

**2026-08-24 Project score Evidence Task 3（review-fix projection sensitivity RED）**：临时仅从生产 current-state selection 移除 `project_score_id`，精确运行 `project-repository.test.ts`；具名 “reads the immutable score identity and displayed score fields in one exact current-state query” 断言按预期失败，diff 明确为 expected `project_id,project_score_id,...`、received `project_id,...`，1 failed / 13 passed，exit 1。disposable mutation 随即用 apply_patch 完整恢复，不进入 fix diff；下一项验证任何第二次 relation lookup 均会具名失败。

**2026-08-24 Project score Evidence Task 3（review-fix single-query sensitivity RED）**：临时在 current-state response 后增加第二次 `client.from('project_current_state')`，并用 Vitest `-t` 只运行具名 invariant test；fake 按预期抛出 `Project lookup must query project_current_state exactly once.`，1 failed / 13 skipped，exit 1。disposable mutation 随即完整恢复，不进入 fix diff。至此 exact projection 与恰好一次 lookup 两个审查缺口均有独立 RED 证据；下一步验证生产文件相对 HEAD 零差异并运行 focused GREEN/package gates。

**2026-08-24 Project score Evidence Task 3（review-fix focused GREEN）**：先对 `project-repository.ts` 与 `project-score-evidence.ts` 执行相对 HEAD 的零差异检查，exit 0，确认两项 disposable mutation 均完整恢复且生产实现未改。随后精确运行 `project-repository.test.ts` + `project-score-evidence.test.ts`，2 files / 28 tests 全绿、exit 0；当前仅测试 fake/断言和文档有改动。

**2026-08-24 Project score Evidence Task 3（review-fix package gates）**：database lint 与 typecheck 均在指定 Node 22.22.2 / pnpm 11.16.0 环境下 exit 0。未新增依赖、生产代码、migration/RLS 或真实数据库访问；按仓库完成规则继续运行 fresh `pnpm verify` 后提交最小 test/docs fix。

**2026-08-24 Project score Evidence Task 3（review-fix complete local gate）**：fresh `pnpm verify` 一次通过、exit 0：lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 174 + worker 212 + web 127 = 842 个 non-skipped 测试通过，42 个既有环境门禁 skip。review fix 只修改 `project-repository.test.ts` 与交接文档；生产 repository 相对 `1a5e26e` 零差异，无依赖、评分、migration/RLS、真实 DB、生产或远端变更。Important 已由 exact projection 与 single-query 两项独立 sensitivity RED、focused GREEN 和 full gate 闭环。

**2026-08-24 Final pagination fix（count sensitivity RED）**：在 focused/package GREEN 后，临时且仅移除后续页 `response.count !== expectedCount` 检查，精确运行具名用例 `fails safely on 'a changed count on a later page'`；如期 exit 1，1 failed / 19 skipped，Promise 错误地 resolve，证明测试能捕获计数一致性保护被删除。立即用 `apply_patch` 完整恢复检查，mutation 未提交；下一步恢复态 focused GREEN、disposable integration 与 root gates。

**2026-08-24 Final pagination fix（restoration GREEN）**：恢复计数一致性检查后，在指定 Node 22.22.2 / pnpm 11.16.0 环境并行重跑 exact citation unit、database lint 与 typecheck，均 exit 0；unit 为 1 file / 20 tests PASS。已确认 sensitivity mutation 完整恢复；下一步只对既有 marker-verified disposable 运行真实 integration。

**2026-08-24 Final pagination fix（disposable integration）**：先验证 `/tmp/airdrop-6b-test.env` 权限精确 0600、四变量齐全且 URL 仅为 loopback PostgreSQL 16432 / HTTP 16433（值未打印），现有两条隧道均在监听；首轮 sandbox 内命令在首个 DB 连接即 `EPERM`，44 tests 全 skipped，未发生 fixture 写入。随后以完全相同命令获准访问该 loopback；各 suite 的 fail-closed fixed paused marker 检查在写入前通过，真实 repository integration 为 7 files / 44 tests PASS，exit 0，106.29s。生产与禁止端口 54321/54322 未访问。

**2026-08-24 Final pagination fix（root gate）**：fresh Node 22.22.2 / pnpm 11.16.0 `pnpm verify` 一次通过、exit 0；lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 180 + worker 212 + web 140 = 861 non-skipped tests，46 environment-gated skips。下一步仅执行 whitespace、safe-selection/unsafe-field 与提交范围检查。

**2026-08-24 Final pagination fix（static gate）**：`git diff --check` exit 0；tracked diff 精确为 citation helper/test 与 workbook/HANDOVER 四文件。生产 helper 的 URL/raw item/candidate/review/hash/provider/audit/outbox/credential/password/secret 扫描零命中；exact 15-column safe projection 未变，每页仍依次请求 exact count、双 immutable ID filters、四个稳定 order 与 ≤1000 range。Task 3 workbook Commit 保持精确 `1a5e26e`。最终报告与 ignored progress ledger 已同步；提交前只剩最终 placeholder/diff 复验。

**2026-08-24 Final pagination fix（ready to commit）**：最终 `pnpm check:placeholders`、`git diff --check` 均 exit 0，tracked scope 仍精确四文件；完整 ignored 报告为 `final-pagination-fix-report.md`。Important 已由真实 1000-row cap RED、最小分页实现、count mutation RED、20/20 focused、44/44 disposable integration、861-test root gate 与静态门禁闭环；无已知 concern。准备提交 `fix(database): paginate score evidence citations`。

**2026-08-24 Project score Evidence Task 4（preflight / baseline）**：Task 4 在同一隔离 worktree、HEAD `23c30d7ea3f1645bef5844fe1729b9b8f42941e5` 开始；controller 未提交的 Task 3 复审记录已保留。Task 3 workbook Commit 已经是精确 `1a5e26e`，不存在残留 `Pending`。指定 Node 22.22.2 / pnpm 11.16.0 database baseline 通过 174 tests、40 environment-gated skips，exit 0。只读 SSH preflight 仅检查 `/root/airdrop-governance-test`：project ID、DB/Kong 容器、DB 64322 / API 64321 和固定 paused marker 全部精确匹配；既有 `16432 -> 64322` 命令已核对，并启动精确 `16433 -> 64321` 隧道。0600 disposable env 的 URL 只校验为 loopback 16432/16433，不打印值；经 16432 再查固定 marker 通过。生产 `airdrop-intelligence-os` 与禁止端口 54321/54322 未访问。任何 fixture 写入仍须在 integration `beforeAll` 内重复 URL + marker fail-closed 校验。

**2026-08-24 Project score Evidence Task 4（fixture + first real run）**：仅修改 `project-repository.integration.test.ts`：现有 repository fixture 全部改为 `randomUUID()` test-owned IDs，并在任何 INSERT 前要求 integration DB/API URL 精确为 loopback `16432/16433`、四个 env 同时存在且固定 paused marker 精确匹配；加入 active current/historical score、active 三轴 factors、rumored factor、active 同一 signal 两条 distinct grounded Evidence、score/link history，以及 immutable latest score ID、rumored/historical denial、exact safe object keys 和 URL/raw/hash/reviewer/governance key 缺席断言。Tasks 2–3 已实现真实 contract，因此首轮 full `test:integration` 合法地直接 GREEN：7 files / 44 tests，exit 0，105.36s；未伪造 absent RED。按 ledger 下一步临时移除 production factor query 的 score-ID filter，使具名 historical integration assertion RED，然后完整恢复。

**2026-08-24 Project score Evidence Task 4（score-ID filter sensitivity RED）**：先确认 production `project-score-evidence.ts` 相对 HEAD 零 diff，再临时只移除 factor query 的 `.eq('project_score_id', projectScoreId)`，精确运行具名 historical snapshot integration assertion。用例按要求 exit 1：expected `[]`，实际误读当前 opportunity/risk/confidence 三条 factors；1 failed / 6 skipped。mutation 已立即 `apply_patch` 完整恢复，production helper 再次相对 HEAD 零 diff，绝不提交；下一步重跑 focused integration GREEN。

**2026-08-24 Project score Evidence Task 4（restored focused GREEN）**：mutation 恢复后，完整 `project-repository.integration.test.ts` 通过 1 file / 7 tests、exit 0、4.83s；brief 指定的 `pnpm --filter @airdrop/database test -- project-score-evidence.test.ts` 通过 174 tests、44 integration skips、exit 0。database lint/typecheck 均 exit 0。当前 production repository/migration/generated types/dependencies 均零改动；下一步 fresh full `test:integration`，随后只用 marker-verified disposable fresh reset 清除 append-only test history。

**2026-08-24 Project score Evidence Task 4（full integration state investigation）**：在 cleanup 前运行 full integration，38/44 通过、6 失败。系统化定位为两项 test-state 原因而非 production defect：① `randomUUID()` 后原同分 90 fixture 仍硬编码 active A/B 顺序，实际 repository 正确按 `project_id asc`；最小 test fix 改为按该公开 tie-breaker 独立排序，focused project integration 随后 7/7、exit 0、7.05s。② 前面多次 focused project run 按 append-only 规则保留 active official relations，queue reconcile 合法发现 7 个 eligible rows，而既有 queue cleanup 只清理自己的固定 project，故 5 项 queue 断言受污染。未改 queue/production；按 brief 现在先 marker-verified fresh reset，再重跑 full integration。

**2026-08-24 Project score Evidence Task 4（fresh-reset full GREEN + final cleanup）**：full gate 前以单条 fail-closed SSH 命令重新验证绝对 workdir、project `airdrop-intelligence-governance-test`、DB/Kong 容器名、64322/64321、固定 paused marker、21 migrations、seed SHA `f1ceaddc...7e55` 与 Task 2 migration SHA `8c0a2e3...ea60`，仅 reset disposable，21 migrations + seed 重建 exit 0，marker 复核通过。随后 fresh full `test:integration` 7 files / 44 tests 全绿、exit 0、104.45s。为不逐条 delete append-only Evidence/link history，GREEN 后再次执行同等 fail-closed final reset，exit 0；marker 精确且 `model_version = 'repository-test'` score count 为 0。生产项目/容器、54321/54322、生产数据与凭据始终未访问或传输。

**2026-08-24 Project score Evidence Task 4（complete local gate）**：最终源码/测试/文档树上 fresh `pnpm verify` exit 0；lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 174 + worker 212 + web 127 = 842 non-skipped tests，46 个 environment-gated skips。Task 4 最终 tracked diff 仅 `project-repository.integration.test.ts`、workbook 与 HANDOVER；production repository/migration/generated types/dependencies 均零改动，sensitivity mutation 不在 diff。完整执行报告见 gitignored SDD ledger `task-4-report.md`；实现代理未自审，交由 controller 做独立复审。

**2026-08-24 Project score Evidence Task 4（independent-review fix diagnosis）**：独立审查对 `97d5f46` 报告 1 Important + 1 Minor。代码复核确认 Important 成立：Task 4 teardown 只关闭连接，两个随机 active `project_sources` 在 focused 结束后仍同时满足 active project + active source + official + verified，durable queue 的全局 reconcile 因而读取跨测试残留；此前未清理状态下 full integration 38/44、其中 5 个 durable-queue 断言因 7 eligible rows 失败，是该隔离缺陷的具名 RED。最小 fix 只在 `afterAll` 内复验 disposable marker 后按 Task 4 随机 source/project IDs 精确删除三条可变 `project_sources`；append-only Evidence、signal/evidence links、score history 均不得逐行删除。workbook Task 4 Commit 已由 subject 更正为精确 `97d5f46`。

**2026-08-24 Project score Evidence Task 4（review-fix ordered GREEN）**：在未执行任何中间 reset 的同一 disposable 状态上，先运行完整 focused `project-repository.integration.test.ts`，1 file / 7 tests、exit 0；紧接着运行 `durable-queue-repository.integration.test.ts`，1 file / 9 tests、exit 0。teardown 的固定 marker 复验和精确 Task 4 relation DELETE 均成功，原先 7 eligible rows 导致的 queue 污染未复现；下一步继续不 reset 地连续运行 full integration 两次，验证重复与文件顺序独立。

**2026-08-24 Project score Evidence Task 4（review-fix full timing investigation）**：仍未 reset 地在上述 focused→queue 后运行首轮 full integration，project/queue 等 6 个文件通过，整体 43/44；唯一失败是未修改的 promotion 具名用例 `denies direct canonical and governance DML after SET ROLE but approves through the protected command` 超过其 5 秒 test timeout。立即仅重放该具名 promotion 用例，1 passed / 11 skipped、exit 0（总测试阶段 12.76s，含 hooks），未改任何无关代码。该证据不指向 Task 4 relation cleanup；继续在同一未 reset 状态上 fresh 重跑 full integration，要求完整 GREEN。

**2026-08-24 Project score Evidence Task 4（review-fix repeated full GREEN）**：同一数据库状态全程无 reset；promotion focused 复现通过后，fresh full integration 7 files / 44 tests、exit 0、105.43s，随后立即连续第二轮 full integration 再次 7 files / 44 tests、exit 0、106.62s。由此同时证明 focused project→durable queue 顺序和 full suite 重复运行均不再依赖外部 reset；Task 4 append-only history 保留，但其唯一会影响 collection eligibility 的三条随机可变 relation 每轮均被精确 teardown。下一步运行 unit/lint/typecheck 和生产零 diff 门禁。

**2026-08-24 Project score Evidence Task 4（review-fix package gates + final cleanup）**：指定 runtime 下 database unit 174 passed / 44 environment-gated skipped，lint 与 typecheck 均 exit 0。随后单个 fail-closed SSH 脚本在 reset 前精确验证 `/root/airdrop-governance-test`、project ID、DB/Kong 容器、64322/64321、固定 paused marker、21 migration files、seed SHA `f1ceaddc...7e55` 与 Task 2 migration SHA `8c0a2e3...ea60`；仅 disposable reset exit 0，reset 后 marker 精确且 `repository-test` score count 0。未逐行删除 append-only history，生产项目与 54321/54322 未访问；下一步仅更新报告、运行 fresh 全仓门禁和生产零 diff 后提交最小 fix。

**2026-08-24 Project score Evidence Task 4（review-fix complete local gate）**：fresh `pnpm verify` exit 0；lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 174 + worker 212 + web 127 = 842 non-skipped tests，46 skips。tracked fix scope 精确为 `project-repository.integration.test.ts`、workbook 与 HANDOVER；production repository、migration、generated types 零 diff。Important 已由 marker-guarded test-owned relation teardown、focused→queue GREEN 和无 reset 连续两轮 full 44/44 闭环，Minor workbook Commit 已更正为 `97d5f46`；现在提交独立最小 fix。

**2026-08-24 Project score Evidence final whole-branch review（citation pagination fix opened）**：在 clean worktree / exact HEAD `e95e79495e724f2f771025bc1101a2c70caf7c25` 复核最终审查的 1 个 Important，结论成立：`supabase/config.toml` Data API `max_rows = 1000`，而 citation repository 只有一次无 count/range/order 的 select；score/signal/Evidence links 无 1000 上限，因此服务可成功却静默隐藏第 1001 条以后或冲突 Evidence。最小修复范围仅为 `project-score-evidence.ts`、对应 unit fake/tests、workbook/HANDOVER 与 gitignored final report；factor 读取受九个 factor codes 边界约束，不做 speculative pagination。Task 4 的 marker-guarded disposable-only integration 入口已存在；生产与 54321/54322 禁止访问。

**2026-08-24 Project score Evidence final pagination fix（unit RED）**：unit fake 已真实模拟 Data API 每请求最多 1000 rows，并新增 1001-row 完整性/最后冲突 citation、每页 exact safe projection + 双 ID filters + required orders/ranges/count，以及 count null、后页 count 变化、短页、重复替代缺失、第二页 PostgREST error 脱敏用例。精确运行 `project-score-evidence.test.ts`，6 个新用例全部 RED、14 个既有用例通过，exit 1；主回归实际只返回 1000 而非 1001，后续完整性/error 场景均被当前单请求实现错误接受。失败精确证明 reviewer 的 silent truncation path，未伪造 RED。

**2026-08-24 Project score Evidence final pagination fix（focused GREEN）**：citation repository 现在以 1000 rows/page 明确分页；每页均 select 原 exact 15-column safe projection + `{ count: 'exact' }`、同时 filter `project_id`/immutable `project_score_id`，并依 required final ordering 显式 order `signal_published_at desc null-last → signal_id asc → evidence_verified_at desc → evidence_id asc` 后 range。每页所有 row 先 strict Zod parse，使用 `signal_id:evidence_id` 唯一键拒绝重复；count null/非法、后页 count 变化、page length 与 expected boundary 不符、duplicate、最终 collected count 不精确或 PostgREST error 均用现有 `ProjectEvidenceCitationQueryError` + 固定安全消息 fail closed。最终仍保留 client deterministic sort。精确 unit 1 file / 20 tests 全绿、exit 0；factor query 未改。

**2026-08-24 Project score Evidence final pagination fix（first package-gate iteration）**：database lint exit 0；typecheck exit 2，唯一错误位于测试 helper 的显式返回注解：`typeof citationRow[]` 把动态 Evidence ID 错误收窄成 base fixture 的单一 literal ID。生产 helper 无类型错误。最小测试修正为复用 Task 1 既有 `PublicProjectEvidenceCitationRow[]`，不改变行为或生产代码；修正后必须重跑 focused/lint/typecheck。

**2026-08-24 Project score Evidence final pagination fix（corrected package GREEN）**：测试 fixture factory 改为既有共享 `PublicProjectEvidenceCitationRow[]` 后，精确 unit 1 file / 20 tests、database lint、database typecheck 均 exit 0。当前无类型/风格问题；下一步做 disposable count-consistency mutation RED，range/order/count request 已由 1001-row 用例逐页 literal recorder assertions 保护。

**2026-08-24 Project score Evidence final whole-branch review（Ready to merge）**：最终 reviewer 以 base `63f5278` 和精确 reviewed HEAD `2e80dbf565feba939252c4fed590b9dd9528b6f9` 复核整分支；原 citation pagination Important 已 Resolved，Critical / Important / Minor 全部为 None。Reviewer 独立重跑 focused 20/20，并在 Node 22.22.2 / pnpm 11.16.0 下重跑 `pnpm verify`：861 non-skipped 通过、46 environment-gated skipped，结论 **Ready to merge: Yes**。本次复审对 DB/remote/production 运行声明仍标记 cannot-verify，不将报告证据推导为当前外部事实。下一步由用户决定如何集成该分支；功能仍为 **production unapplied**，任何 rollout 前必须重做实时 preflight，确认备份、Auth 服务与 human reviewer readiness，并获得显式 rollout 授权。

**2026-08-24 Project score Evidence local integration（DONE）**：用户选择 finishing workflow 的 option 1。主工作区确认基线分支 `codex/phase-0-1-foundation` 精确位于 `63f5278`，仅有三个既有未跟踪 `.DS_Store`，随后将 `codex/project-score-evidence-detail` 快进合并到 `a372880`；这些个人文件未触碰。合并后首次 `pnpm verify` 因主工作区 `node_modules` 重建并尝试访问 registry，命中 DNS `ENOTFOUND`，未进入代码测试；用本机既有 pnpm v11 store 执行 `--offline --frozen-lockfile` 恢复 196 个锁定包后，fresh 完整门禁 exit 0：contracts 107 + domain 222 + database 180 + worker 212 + web 140 = 861 non-skipped，46 gated skips，lint/typecheck/build/placeholders 全绿。该步骤只做本地 Git 集成与本地门禁，未访问生产、未应用第 21 个 migration；下一步是保留生产冻结边界并选择后续产品功能，而不是自动 rollout。

**2026-08-24 Project score Evidence branch cleanup（DONE）**：在主线交接提交 `0293cd3` 后再次运行完整 `pnpm verify`，861 non-skipped / 46 gated skips 全绿。随后确认功能 worktree 无 tracked/untracked 改动、`a372880` 已是主线祖先，再移除 `.worktrees/project-score-evidence-detail`、执行 `git worktree prune` 并删除已合并分支 `codex/project-score-evidence-detail`。其他 Phase 2 / 6A / 6B worktree 与主工作区三个既有 `.DS_Store` 均未触碰；功能全部保留在主线，生产仍未应用。

---

## 9. 其他

- Git 分支：主开发线 `codex/phase-0-1-foundation` 已含 Phase 0–6B Task 1–8；Phase 6B 通过双父提交 `3c96edf` 合并，合并后主线 `pnpm verify` 全绿。`.worktrees/phase-6b-failed-ai-review` 仍含未跟踪 `.DS_Store`，本轮未替用户删除，故未强制移除该 worktree；既有 Phase 2 / 6A worktree 清理说明见 §8.3。
- dev server / worker 是否仍在运行不作为持久状态；每次接手都按 §4 重新确认并从当次日志判断
- 历史决策细节（为什么这样做）：`docs/superpowers/specs/` 与 `docs/superpowers/plans/` 下的设计文档；Phase 6A 的逐任务 RED/GREEN 证据在 `docs/tasks/canonical-intelligence-governance-workbook.md`
- DeepSeek 计费注意：130 次真实抽取消耗约 62 万 prompt tokens（每输入截取 12K 字符上限）；批量跑前评估成本
- 隔离测试栈（Phase 6A 起长期存在）：远程 ECS 上第二个 Supabase 项目 `airdrop-intelligence-governance-test`（db `64322` / Kong `64321`，workdir `/root/airdrop-governance-test`，CLI `./cli/node_modules/.bin/supabase` v2.112.0）。本地隧道 `16432 → 64322`、`16433 → 64321` 跑真实集成测试。**只允许对它 reset**，生产栈（54322/54321）绝不 reset
- 交接时的数据库快照（2026-08-14，未含 Phase 6A 变化）：16 迁移已应用；14 项目（12 demo + Ethereum + novanet 等实为 13 项目含 novanet + Ethereum）；raw_items 23；discovered_items 131；ai_runs 131（130 Phase 3 + 1 Phase 5 编排验证）；extraction_candidates 7（全 promoted）；signals 20（demo + 6 Ethereum 真实 + 1 novanet 编排验证）；project_scores 26 行（12 项目含历史版本行）；score_factors 117；score_signal_links 已建。novanet 的 `airdrop_season_announcement` 信号及其评分（74.8/40/27 watch）是 Phase 5 端到端验证产物，内容为合成测试数据。2026-08-22 Phase 6A 门禁上线后的短暂隐藏已通过 demo 补证与 7 条历史对账恢复，实际结果见 §8.2
