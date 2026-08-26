# Phase 7A Security Incidents and Indicators — Development Workbook

> 日期：2026-08-26
> 当前状态：Task 1 strict security contracts 已完成；下一步为 Task 2 pure security rules
> 权威设计：`docs/superpowers/specs/2026-08-26-phase-7a-security-incidents-indicators-design.md`
> 实施计划：`docs/superpowers/plans/2026-08-26-phase-7a-security-incidents-indicators.md`

## 1. 固定边界

- 运行时：Node.js 22.22.2 / pnpm 11.16.0。
- 分支：计划在隔离 worktree 的 `codex/phase-7a-security-ledger` 执行。
- 数据库：只允许 marker-verified disposable Supabase reset/integration；生产不访问、不迁移、不部署。
- Canonical 安全写入：仅当前 bearer session 的 active `security_reviewer` / `admin` 经 protected command 执行。
- 追溯：indicator 与 posture decision 必须连接 Evidence → Raw Item → Source。
- 状态：追加式 ledger 推导 `blocked > caution > clear`；不写可变 current posture。
- 跨模块：Security Ledger 不直接改 projects/sources/queue/signals/scores；各 owner 通过安全 gate 写自己的表。
- 每个任务：先 RED、确认失败原因、最小 GREEN、focused gate、更新本 workbook 与 HANDOVER、再提交。

## 2. 任务看板

| Task | 交付物 | 状态 | RED / GREEN / 评审证据 |
|---|---|---|---|
| 1 | Strict security contracts | 已完成（Fix Round 1） | 初始 RED：`CI=true pnpm --filter @airdrop/contracts test -- security` exit 1，20 个新增断言均因根入口缺少 security schema 导出而失败；初始 GREEN：contracts 12 files / 128 tests。Fix Round 1 RED：`projections.test.ts incident.test.ts` 3 个具名状态/scope 矛盾断言失败；GREEN：contracts 12 files / 131 tests，lint、typecheck 均 exit 0。无数据库或应用行为变更。 |
| 2 | Pure posture/transition/indicator rules | 待执行 | — |
| 3 | Security Ledger migration、commands、RLS、pgTAP | 待执行 | — |
| 4 | Bearer-scoped security review repositories + races | 待执行 | — |
| 5 | Security extraction routing + ordinary Promotion guards | 待执行 | — |
| 6 | Collection/scoring protect-first gates | 待执行 | — |
| 7 | Public security repositories/project projections | 待执行 | — |
| 8 | Authenticated BFF/routes/browser client | 待执行 | — |
| 9 | Reviewer security UI | 待执行 | — |
| 10 | Public blocked/caution/project UI | 待执行 | — |
| 11 | Golden Dataset、E2E、runbook、full verification | 待执行 | — |

## 3. 计划阶段记录

| 日期 | 步骤 | 结果 |
|---|---|---|
| 2026-08-26 | 产品范围逐项确认 | 完成：独立 posture、project/source scope、角色、门禁、披露和完整纵切片均确认。 |
| 2026-08-26 | 架构选型与四节设计 | 完成：采用追加式 Security Ledger；数据边界、命令事务、读模型/UI、测试/不做项均确认。 |
| 2026-08-26 | 正式设计规范 | 完成：规范获用户批准，状态 `Approved`。 |
| 2026-08-26 | writing-plans | 完成：11 个任务、67 个 checkbox steps；spec 覆盖、占位措辞、类型/函数命名、任务顺序与 TDD 边界均已自审，文档门禁通过。 |
| 2026-08-26 | 执行方式 | 用户选择方案 1：Subagent-Driven。按技能强制流程先封存规划基线，建立 `codex/phase-7a-security-ledger` 隔离 worktree、SDD ledger 和 declared-runtime baseline；完成后不再逐 task 等待确认，直接进入 Task 1。 |
| 2026-08-26 | 隔离工作区 | 完成：规划文档以 `c102df6` 封存；从该提交创建 `.worktrees/phase-7a-security-ledger` 与 `codex/phase-7a-security-ledger`，初始 worktree 干净；旧 worktree 与三个既有 `.DS_Store` 均未触碰。 |
| 2026-08-26 | SDD 执行预检 | 完成：创建计划专属 gitignored ledger；逐行核对 55 个 task-pair 的共享文件/接口与 11 个任务内部测试-实现一致性。未发现互相矛盾、违反 Global Constraints 或计划强制但审查规则禁止的内容，无需 Ruling。 |
| 2026-08-26 | declared-runtime baseline | 完成：Node `v22.22.2` / pnpm `11.16.0`，offline frozen install 无 lockfile 变化；fresh `pnpm verify` exit 0，contracts 107 + domain 222 + database 180 + worker 212 + web 140 = 861 non-skipped，46 environment-gated skips，lint/typecheck/build/placeholders 全绿。未运行数据库 reset/integration，未连接生产。 |
| 2026-08-26 | Task 1 strict security contracts | 完成：新增严格 security 枚举、candidate/review/incident/disclosure 命令、internal/public projections、opaque cursor 与 safe outbox v1 schemas，全部仅由 `@airdrop/contracts` 根入口导出。有效 RED 为 5 files / 20 failed tests，缺失导出导致 schema 为 `undefined`；GREEN 为 contracts 12 files / 128 tests，lint/typecheck 均 exit 0。未运行数据库 reset/integration，未连接生产，未新增依赖、迁移或应用行为。 |
| 2026-08-26 | Task 1 Fix Round 1 review | 完成：public active incident collection 限为 `active`；blocked-project target 限为 matching project target；reviewer incident list 改为 `active`/非空 posture 与 `resolved`/null posture 的 discriminated union。RED 2 files / 3 failed tests，covering GREEN 与完整 contracts 皆为 12 files / 131 tests，lint/typecheck exit 0。未涉及 deferred Minor findings，未运行数据库 reset/integration，未连接生产。 |

## 4. 执行证据模板

每个 Task 完成时追加：

1. 起始 HEAD、worktree/branch、dirty-state 说明。
2. RED 命令、退出码、具名失败及其为何证明测试有效。
3. GREEN focused 命令、退出码、测试数量。
4. disposable 数据库拓扑、reset/pgTAP/integration 数量（适用时）。
5. 安全检查：RLS、append-only、idempotency/version、outbox、敏感字段、竞态。
6. HANDOVER 更新位置、评审结论、提交哈希。

## 5. 生产状态

Phase 7A 的本地设计、计划、实现或 disposable 验收均不得描述为生产上线。生产最后可信快照及第 20/21 个 migration 状态继续以 `docs/HANDOVER.md` 为准；本 workbook 不授权任何生产操作。
