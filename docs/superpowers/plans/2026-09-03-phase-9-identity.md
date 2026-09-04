# Phase 9 Identity（用户认证与私有数据）— 实施计划

> 前置：规范 `docs/superpowers/specs/2026-09-03-phase-9-identity-private-data-design.md` 的 **D1–D6 已于 2026-09-03 获所有者采纳**。Task 2 已按 `docs/superpowers/plans/2026-09-04-phase-9-task-2-remediation.md` 完成首轮 RED/GREEN/mutation evidence及 Fix Round 1；最终 scoped re-review 为 0 Critical / 0 Important / 0 Minor。Task 2 验收完成，待原子提交；Task 3 repositories 为下一开发任务。migration 30/31 仍未应用生产。
>
> 分支：`codex/phase-9-identity` / worktree `.worktrees/phase-9-identity`（沿用 7B/8 的分支惯例）。每个任务独立可测，验收通过后提交（AGENTS.md「Change workflow」）。

## Task 1: 契约（`packages/contracts/src/identity/`）

**Files:** `packages/contracts/src/identity/{enums,commands,projections}.ts` + 测试，index 导出。

- [x] **Step 1: RED**——strict 命令/投影；钱包地址按 D3 格式校验；**任何密钥形似字段一律拒绝**（不静默丢弃）；枚举不含未采纳项
- [x] **Step 2: GREEN + lint/typecheck + 变异**（密钥字段未被拒 → 用例失败）
- [x] **Step 3: 文档 + 提交** `feat(contracts): add identity contracts`（`5240b84`）

## Task 2: 迁移 30 + forward-only migration 31 + pgTAP 021（验收完成，待原子提交）

**Files:** `supabase/migrations/20260903000200_phase_9_identity.sql`（profiles RLS 补齐、`user_wallet_addresses`、`user_wallet_address_events`、命令/回执、受保护命令）、`supabase/tests/021_phase_9_identity.test.sql`。

- [x] **原始提交**——migration 30 / pgTAP 021 已以 `0f8e000` 提交，但 2026-09-04 复核发现四角色、四命令、幂等/版本、append-only、public read 与 outbox 验收均不完整，不能视为 Task 2 完成。
- [x] **Step 1: RED**——按补救计划写出匿名/本人/他人/无会话、四命令、直接写拒绝、幂等/版本、审计/outbox 与公开投影测试，并在 migration 30 上取得有效失败证据。
- [x] **Step 2: GREEN + disposable 验证**——用 forward-only migration 31 修复并完成 focused/full pgTAP、integration、deterministic typegen 与 7/7 mutation checks。
- [ ] **Step 3: 文档 + 提交** `fix(db): complete identity command boundary`

## Task 3: 仓储（`packages/database/src/identity/`）

**Files:** `profileRepository`、`walletAddressRepository`、集成测试。

- [ ] **Step 1: RED**——受保护命令调用、幂等键、版本冲突、公开投影仅含 D4 允许字段；越权访问被拒
- [ ] **Step 2: GREEN + 集成测试 + 变异**（他人数据不可达 → 用例失败）
- [ ] **Step 3: 文档 + 提交** `feat(database): add identity repositories`

## Task 4: BFF 路由与会话边界

**Files:** `apps/web/src/app/api/v1/identity/*`、`lib/identity-handlers.ts` + 测试。

- [ ] **Step 1: RED**——无会话 → `ID201`/401；他人资源 → 403/404（不泄漏存在性）；命令类回落 `_persistence_failed`，查询类 `_query_failed`；畸形游标 → `invalid_cursor`
- [ ] **Step 2: GREEN + 变异**（认证优先于查询 → 用例失败）
- [ ] **Step 3: 文档 + 提交** `feat(web): add identity bff`

## Task 5: 认证流程 UI（依赖 D1）

**Files:** 登录页、`/auth/callback`、登出、会话过期恢复（pending action）+ 测试。

- [ ] **Step 1: RED**——未登录访问私有页重定向并保留待办动作；会话过期 → 401 后恢复
- [ ] **Step 2: GREEN + 变异**
- [ ] **Step 3: 文档 + 提交** `feat(web): add identity auth flow`

## Task 6: 设置 UI（profile 与钱包地址）

**Files:** `/settings/profile`、`/settings/wallets` 页面与组件 + 测试。

- [ ] **Step 1: RED**——越权字段不可提交；重复地址/上限/版本冲突展示稳定错误码（不按文案分支）；页面显著提示永不索取私钥
- [ ] **Step 2: GREEN + 变异**
- [ ] **Step 3: 文档 + 提交** `feat(web): add identity settings`

## Task 7: 收口

**Files:** runbook 新增 Identity 章节、工作簿、HANDOVER。

- [ ] **Step 1: runbook**——登录/登出、RLS 四角色矩阵、ID2xx 表、focused 命令、生产应用规程
- [ ] **Step 2: 用户授权后 disposable 矩阵**（full pgTAP + 全集成 + 清理证明）
- [ ] **Step 3: 敏感扫描 + `pnpm verify` + 最终台账 + 提交** `test(security): complete phase 9 acceptance gates`；生产应用迁移 30 需另行显式授权

## 依赖与顺序

`Task 1 → 2 → 3 → 4 → 5/6 → 7`。Task 5 与 6 可并行；Task 5 阻塞于 D1 决策（生产 SMTP 可用性需先确认，否则 D1 改走密码或 OAuth）。
