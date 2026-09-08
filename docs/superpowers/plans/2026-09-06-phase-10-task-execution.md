# Phase 10 Task execution（任务管理与关注列表）— 实施计划

> 前置：规范 `docs/superpowers/specs/2026-09-06-phase-10-task-execution-design.md` 的 **D1–D4 已于 2026-09-06 获所有者采纳**（D5–D9 按先例取边界值），Phase 9 Identity 已合并主线（`8f38102`）。
>
> 分支：`codex/phase-10-execution` / worktree `.worktrees/phase-10-execution`（沿用 7B/8/9 的分支惯例）。每个任务独立可测，验收通过后提交（AGENTS.md「Change workflow」）。

## 与以往 Phase 最大的不同：本域已有 schema

迁移 5 已建好四张表、RLS 与一个 SECURITY DEFINER 命令 `update_user_task`，pgTAP `005`（plan 228）正在守着。因此本 Phase **不是建 schema，而是硬化 schema + 建应用层**。两条硬约束：

1. **不得削弱 pgTAP 005 的 228 条断言**——新增断言放新文件 `022`。
2. **新增或改动任何 Execution 策略都必须同步 pgTAP 006 的三份精确名单**（主目录 / 命名例外集 / 无 comment 集），漏改即失败；编辑按行号定位，勿按字符串首次匹配删除。

## Task 1: 契约（`packages/contracts/src/execution/`）

**Files:** `packages/contracts/src/execution/{enums,commands,projections,receipts}.ts` + 测试，index 导出。

- [x] **Step 1: RED**——strict 命令/投影/回执（`additionalProperties: false`）；枚举只允许数据库既有字面量；任务标题去空白与长度边界；`completed` 与 `completed_at` 必须自洽；**任何越权字段一律拒绝**（不静默丢弃）
- [x] **Step 2: GREEN + lint/typecheck + 变异**（密钥形似字段未被拒 → 用例失败；strict 放宽 → 用例失败）——**变异 9/9 killed**
- [x] **Step 3: 文档 + 提交** `feat(contracts): add execution contracts`

## Task 2: 命令边界（迁移 32 + pgTAP 022）

**Files:** `supabase/migrations/20260906000100_phase_10_execution_command_boundary.sql`、`supabase/tests/022_phase_10_execution.test.sql`，并同步 `006` 策略目录。

- [x] **Step 1: RED**——先写 022 的四角色矩阵、命令幂等与精确 replay、版本冲突、上限与重名、追加式事件不可变、outbox 与状态同事务、浏览器直写被拒绝；在**当前 schema**上取得有效失败证据
  - **注：本机无 Docker/Postgres，RED 无法在本地取得**；022 已按 plan(72) 写就，须在 disposable 上先验证「当前 schema 下 72 断言全红」再应用迁移
- [x] **Step 2: GREEN**——迁移 32 经 disposable 验证；过程中暴露并修复 **7 个真实缺陷**（见工作簿「七个缺陷」）
- [x] **Step 3: 同步 pgTAP 006 策略目录**——目录 + 命名例外集 + service_role 名单；005 契约收紧（plan 228→230）
- [x] **Step 4: 文档 + 提交**——disposable 验收：干净 reset 后**全套 pgTAP 22 files / 1,725 断言 / 0 失败 / 无 Bad plan**；022=68/68、005=230/230、006=83/83；残留核验零残留

## Task 3: 仓储（`packages/database/src/execution/`）

**Files:** `taskRepository`、`watchlistRepository`、`participationRepository`、集成测试。

- [x] **Step 1: RED**——受保护命令调用、幂等键、版本冲突、四角色越权被拒
- [x] **Step 2: GREEN + 变异**（他人数据不可达 → 用例失败）——**10/10 killed**；集成测试已写就，**执行待隧道授权**
- [x] **Step 3: 文档 + 提交** `feat(database): add execution repositories`

## Task 4: BFF 路由与会话边界

**Files:** `apps/web/src/app/api/v1/execution/*`、`lib/execution-handlers.ts` + 测试。

- [x] **Step 1: RED**——无会话 → `EX201`/401；他人资源 → 404（不泄漏存在性）；命令类回落 `execution_persistence_failed`、查询类回落 `execution_query_failed`；认证严格先于查询/请求体校验（401 时仓库零调用）
- [x] **Step 2: GREEN + 变异**——**8/8 killed**
- [x] **Step 3: 文档 + 提交** `feat(web): add execution bff`

## Task 5: 任务 UI（`/tasks`）

**Files:** `/tasks` 页面与组件 + 测试。

- [ ] **Step 1: RED**——越权字段不可提交；版本冲突/上限展示稳定错误码（不按文案分支）；会话过期重定向并保留待办动作
- [ ] **Step 2: GREEN + 变异**
- [ ] **Step 3: 文档 + 提交** `feat(web): add task management`

## Task 6: 关注列表与参与状态 UI（`/watchlists` + 项目详情页）

**Files:** `/watchlists` 页面与组件、项目详情页的关注/参与状态切换 + 测试。

- [ ] **Step 1: RED**——默认列表自动存在；重名/上限/版本冲突按稳定码展示；项目详情页切换只提交允许字段
- [ ] **Step 2: GREEN + 变异**
- [ ] **Step 3: 文档 + 提交** `feat(web): add watchlist and participation`

## Task 7: 收口

**Files:** runbook 新增 Execution 章节、工作簿、HANDOVER。

- [ ] **Step 1: runbook**——任务/关注操作、四角色矩阵、EX2xx 表、focused 命令、生产应用规程
- [ ] **Step 2: 用户授权后 disposable 矩阵**（full pgTAP + 全集成 + 清理证明）
- [ ] **Step 3: 敏感扫描 + `pnpm verify` + 最终台账 + 提交** `test(security): complete phase 10 acceptance gates`；生产应用迁移 32 需另行显式授权

## 依赖与顺序

`Task 1 → 2 → 3 → 4 → 5/6 → 7`。Task 5 与 6 可并行。

Task 2 的 disposable 验证、Task 7 Step 2 的 disposable 矩阵，均需所有者**逐次精确授权**后才执行，不因本地顺利而顺手跑。
