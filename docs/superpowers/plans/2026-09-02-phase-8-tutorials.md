# Phase 8 Tutorials 实施计划

> **状态：Approved**（2026-09-02；规范 `2026-09-02-phase-8-tutorials-design.md`，D1–D8 已采纳）
> 执行方式：沿用 Phase 7B 流程——每 Task RED→GREEN→变异检验→门禁→工作簿/HANDOVER 更新→原子提交；disposable 数据库操作与生产操作逐次显式授权。
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 或 executing-plans；开工前执行 using-git-worktrees 建分支 `codex/phase-8-tutorials` / worktree `.worktrees/phase-8-tutorials`。

## Global Constraints

- Node 22.22.2 / pnpm 11.16.0；verify 必须 `env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED`。
- AI 输出只能到 `tutorial_candidates`；模型只允许从输入白名单选 `referenceId`。
- 铁律 I-1/I-3：公开链接全部解析自台账（无裸 URL 列）；联动全部同步生效。
- 追加式历史；跨模块不直接改表（联动经触发器/事件，属数据库内闭环）。
- 错误码 `AT2xx`；outbox 追加 `tutorial.published.v1` / `tutorial.status_changed.v1`。
- 每个含迁移/数据库行为的 Task：disposable 操作逐次显式授权 + fail-closed 预检。
- 每 Task 更新 `docs/tasks/phase-8-tutorials-workbook.md` 与 `docs/HANDOVER.md` 后提交。

## Planned File Structure

- `packages/contracts/src/tutorials/`（enums/commands/projections/events + 测试）
- `packages/domain/src/tutorials/`（coupling-matrix/allowlist/version-rules + 测试）
- `supabase/migrations/20260902000100_phase_8_tutorials.sql`（第 26 个）
- `supabase/tests/017_phase_8_tutorials.test.sql`（第 17 个）
- `packages/database/src/repositories/tutorial-review-repository.ts`、`tutorial-public-repository.ts`、`src/tutorials/`（entry/browser-denied）+ 集成测试
- `apps/web/src/lib/tutorial-review-handlers.ts`、`tutorial-public-handlers.ts`、`/api/v1/review/tutorials/*`、`/api/v1/tutorials/[id]`
- `apps/web/src/components/tutorial/`、`/app/review/tutorials/`、`/app/tutorials/[id]/`、详情页教程卡
- `apps/worker/src/tutorials/`（candidate-generator + orchestrator 注册）、`src/ai/fixtures/tutorial-golden.ts` + 测试
- `docs/runbooks/local-development.md`（Phase 8 章节）、工作簿、HANDOVER

---

### Task 1: 教程契约（strict contracts）

**Files:** `packages/contracts/src/tutorials/{enums,commands,projections,events}.ts` + 四个测试 + `src/index.ts` 导出。

- [ ] **Step 1: RED**——kind/status/candidate payload（strict：payload 无 URL 字段、steps 2..20、links 0..5 只含 referenceId uuid）/命令（expectedVersion+idempotencyKey，accept 携带可编辑 steps）/投影（公开含 resolved links；审核含状态事件）/游标 base64url/事件 payload（published.v1、status_changed.v1 安全键）。表驱动：越权字段、长度界限、非法枚举、幻觉 referenceId 形态仍合法（uuid 层面）但投影层拒绝。
- [ ] **Step 2: GREEN + lint/typecheck + 变异（strict 放宽 → 泄漏用例失败）**
- [ ] **Step 3: 工作簿/HANDOVER + 提交** `feat(contracts): add tutorial contracts`

### Task 2: domain 纯规则（联动矩阵 + 白名单 + 版本派生）

**Files:** `packages/domain/src/tutorials/{coupling-matrix,allowlist,version-rules}.ts` + 测试。

- [ ] **Step 1: RED**——D5 矩阵全行（触发源×结果：安全→blocked、内容→needs_review；blocked 恢复仅经人工）；候选白名单校验（payload.referenceId ∈ 输入白名单，幻觉 id → `tutorial_reference_not_allowlisted`）；`last_verified_at` 派生（approve 推进、触发不推进）；版本号派生（接受=version+1）。
- [ ] **Step 2: GREEN + 变异（矩阵某行反转 → 对应用例失败）**
- [ ] **Step 3: 文档 + 提交** `feat(domain): add tutorial rules`

### Task 3: 迁移 26 + pgTAP 017（七表两视图 + 受保护命令 + RLS + 联动触发器）

**Files:** `supabase/migrations/20260902000100_phase_8_tutorials.sql`（第 26 个）、`supabase/tests/017_phase_8_tutorials.test.sql`（第 17 个）。**disposable reset/同步需显式授权。**

- [ ] **Step 1: pgTAP RED**——七表形状/RLS 矩阵（anon 只读 published 投影、写全拒）/四受保护命令（幂等、expectedVersion、角色复核、AT2xx）/登记格式/联动触发器逐行（flag 引用→needs_review、信号 disputed→needs_review、项目 posture→blocked 路径）/公开视图门禁（published+非 blocked+失效链接隐藏）/outbox 白名单追加。
- [ ] **Step 2: 授权后 disposable：同步迁移+017 → reset → focused 017 → full pgTAP → 双 typegen → 清理**（先例流程；任何失败即停）。
- [ ] **Step 3: 本地 GREEN（typegen 更新）+ 文档 + 提交** `feat(db): add tutorials ledger`

### Task 4: repositories（bearer 审核 + 匿名公开）

**Files:** `packages/database/src/repositories/tutorial-{review,public}-repository.ts`、`src/tutorials/{entry,browser-denied}.ts`、单测 + 集成测试（disposable 授权）。

- [ ] **Step 1: RED**——parse-before-map、严格键集、项目作用域校验、cursor、AT2xx 映射、browser 导出拒绝、公开仓库无裸 URL 列。
- [ ] **Step 2: GREEN + lint/typecheck + 变异**
- [ ] **Step 3: 授权后 disposable 集成（连同 Task 3 迁移）**
- [ ] **Step 4: 文档 + 提交** `feat(database): add tutorial repositories`

### Task 5: BFF 路由与边界

**Files:** `apps/web/src/lib/tutorial-review-handlers.ts`、`tutorial-public-handlers.ts`、`/api/v1/review/tutorials/*`、`/api/v1/tutorials/[id]/route.ts` + 测试。

- [ ] **Step 1: RED**——认证先于校验、AT2xx→HTTP、畸形游标/UUID、信封精确、公开端点无敏感字段。
- [ ] **Step 2: GREEN + lint/typecheck + build + 变异**；打包隔离测试纳入新 handler。
- [ ] **Step 3: 文档 + 提交** `feat(web): add tutorial bff`

### Task 6: 审核 UI（/review/tutorials）

**Files:** `apps/web/src/components/tutorial/{candidate-list,candidate-detail,tutorial-list,tutorial-detail}.tsx`、`/app/review/tutorials/**`、`review-shell` 导航 + 测试。

- [ ] **Step 1: RED**——候选队列/详情（payload 惰性渲染、步骤编辑后批准、高影响确认绑定 `{id,version}`、409/编辑清确认）、已发布列表（状态过滤/游标）、决策历史与状态事件时间线、敌意文本惰性（断言转义后形式）。
- [ ] **Step 2: GREEN + lint/typecheck/build + 变异（含实现级变异）**
- [ ] **Step 3: 文档 + 提交** `feat(web): build tutorial reviewer workflow`

### Task 7: 公开页（教程卡 + /tutorials/[id]）

**Files:** `apps/web/src/components/tutorial/public-tutorial.tsx`、`/app/tutorials/[id]/page.tsx`、项目详情页教程卡 + 测试。

- [ ] **Step 1: RED**——仅 published 可见；步骤有序渲染；每链接 `url/label/last_verified_at` 全部来自台账解析（**断言渲染结果无任何非台账来源 URL**）；失效链接渲染「暂不可用」无 `<a>`；教程级 `last_verified_at` machine-readable；敌意文本惰性。
- [ ] **Step 2: GREEN + lint/typecheck/build + 变异（I-1 不变量实现级变异：去掉台账 join → 用例失败）**
- [ ] **Step 3: 文档 + 提交** `feat(web): publish tutorials publicly`

### Task 8: AI 生成器（worker 编排 tick）

**Files:** `apps/worker/src/tutorials/generate-candidates.ts`（输入组装/模型调用/三重校验/幂等写候选）、orchestrator 注册、`apps/worker/.env.example` 注释。

- [ ] **Step 1: RED**——素材选择（verified/corroborated 六类信号）、白名单组装、模型输出 strict parse、幻觉 referenceId 丢弃、幂等（同素材集合不重复生成）、失败退避。
- [ ] **Step 2: GREEN + lint/typecheck + 变异（幻觉 id 未被丢弃 → 用例失败）**
- [ ] **Step 3: 文档 + 提交** `feat(worker): generate tutorial candidates`

### Task 9: Golden Dataset（教程生成边界）

**Files:** `apps/worker/src/ai/fixtures/tutorial-golden.ts` + `tests/tutorial-golden.test.ts`。

- [ ] **Step 1: RED**——用例：明确官方公告（正例）、注入指令、幻觉 referenceId（白名单外）、跨项目 id、越权 canonical 字段、素材含 disputed 信号（应不生成）。断言：只能产候选、链接全部 ∈ 白名单、无 URL 字段、无 canonical 键。
- [ ] **Step 2: GREEN + 变异**（至少一项打在实现：白名单过滤被绕过 / schema 放宽）。
- [ ] **Step 3: 文档 + 提交** `test(worker): add tutorial golden dataset`

### Task 10: runbook + disposable 矩阵 + 收口

**Files:** runbook Phase 8 章节、工作簿、HANDOVER。

- [ ] **Step 1: runbook**——候选生成开关、审核流程、AT2xx 表、状态联动恢复操作、focused 命令、生产应用规程。
- [ ] **Step 2: 用户授权后 disposable 矩阵**（full pgTAP + 全 integration + 清理证明）。
- [ ] **Step 3: 敏感扫描 + `pnpm verify` + 最终台账 + 提交** `test(security): complete phase 8 acceptance gates`；生产应用迁移 26 需另行显式授权。
