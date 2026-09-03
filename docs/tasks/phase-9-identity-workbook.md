# Phase 9 Identity — 工作簿（逐任务台账）

> 分支 `codex/phase-9-identity` / worktree `.worktrees/phase-9-identity`。规范：`docs/superpowers/specs/2026-09-03-phase-9-identity-private-data-design.md`；计划：`docs/superpowers/plans/2026-09-03-phase-9-identity.md`。
> 每个任务按「RED → GREEN → 门禁 → 变异 → 文档 → 提交」推进；生产操作逐次显式授权。

## 进度看板

| Task | 内容 | 状态 | 提交 / 证据 |
|---|---|---|---|
| 1 | 契约（`packages/contracts/src/identity/`） | ⬜ 待 D3/D4 确认后开工 | — |
| 2 | 迁移 30 + pgTAP 021 | ⬜ 未开始 | — |
| 3 | 仓储（profile / wallet address） | ⬜ 未开始 | — |
| 4 | BFF 路由与会话边界 | ⬜ 未开始 | — |
| 5 | 认证流程 UI（依赖 D1） | ⬜ 未开始，阻塞于 D1 + 生产 SMTP 确认 | — |
| 6 | 设置 UI（profile / 钱包地址） | ⬜ 未开始 | — |
| 7 | 收口（runbook + 矩阵 + 台账） | ⬜ 未开始 | — |

## 决策记录（待所有者采纳）

| # | 决策 | 建议 | 状态 |
|---|---|---|---|
| D1 | 登录方式 | 邮箱魔法链接（需确认生产 SMTP 可用） | ⬜ 待确认 |
| D2 | 自助注册 | 开放 | ⬜ 待确认 |
| D3 | 钱包范围 | 仅 EVM 公开地址，上限 5，不做 EIP-55 强制 | ⬜ 待确认 |
| D4 | 地址可见性 | 默认 `hidden`（保守）；规范正文列的是「默认公开」供选择 | ⬜ 待确认 |
| D5 | profile 同步 | 登录 upsert + 触发器兜底 | ⬜ 待确认 |
| D6 | 首版范围 | 登录/登出/会话/profile/钱包地址 | ⬜ 待确认 |

## 日志

| 日期 | 事项 | 备注 |
|---|---|---|
| 2026-09-03 | 规范与实施计划草案完成 | 范围闭合在 Identity 域（profiles / roles / public wallet addresses），不侵入 Execution 与 Notification；`profiles` 与 `user_roles` 已存在，钱包地址表为新建；等待 D1–D6 采纳后开工 |
