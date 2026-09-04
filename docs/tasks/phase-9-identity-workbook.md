# Phase 9 Identity — 工作簿（逐任务台账）

> 分支 `codex/phase-9-identity` / worktree `.worktrees/phase-9-identity`。规范：`docs/superpowers/specs/2026-09-03-phase-9-identity-private-data-design.md`；计划：`docs/superpowers/plans/2026-09-03-phase-9-identity.md`。
> 每个任务按「RED → GREEN → 门禁 → 变异 → 文档 → 提交」推进；生产操作逐次显式授权。

## 进度看板

| Task | 内容 | 状态 | 提交 / 证据 |
|---|---|---|---|
| 1 | 契约（`packages/contracts/src/identity/`） | ✅ 完成 | enums（EVM 地址格式、`visibility` 默认 hidden、密钥字段黑名单）/ commands（四个 strict 命令 + `Idempotency-Key` + `expectedVersion`）/ projections（私有行 + 独立公开投影）；contracts 207→**229**；变异 **2/2 killed**（密钥守卫中和→7 失败、strict 放宽→1 失败） |
| 2 | Identity 数据库边界（migration 30 + forward-only remediation 31） | 🟠 修复中 | 原提交 `0f8e000` 只有两个命令且 pgTAP 021 仅 8 个 postgres-owner 断言；缺四角色真实证明、visibility/remove、可靠 replay/input hash、完整 expectedVersion、append-only guards、transactional outbox、匿名公开读与直接表写拒绝。补救计划：`docs/superpowers/plans/2026-09-04-phase-9-task-2-remediation.md`。**生产未触碰。** |
| 3 | 仓储（profile / wallet address） | ⬜ 未开始 | — |
| 4 | BFF 路由与会话边界 | ⬜ 未开始 | — |
| 5 | 认证流程 UI（依赖 D1） | ⬜ 未开始，阻塞于 D1 + 生产 SMTP 确认 | — |
| 6 | 设置 UI（profile / 钱包地址） | ⬜ 未开始 | — |
| 7 | 收口（runbook + 矩阵 + 台账） | ⬜ 未开始 | — |

## 决策记录（2026-09-03 所有者「直接采纳 D1–D6」确认）

| # | 决策 | 建议 | 状态 |
|---|---|---|---|
| D1 | 登录方式 | 邮箱魔法链接（生产 `GOTRUE_EXTERNAL_EMAIL_ENABLED=true`、`GOTRUE_MAILER_AUTOCONFIRM=true`） | ✅ 已采纳 |
| D2 | 自助注册 | 开放 | ✅ 已采纳 |
| D3 | 钱包范围 | 仅 EVM 公开地址（`0x` + 40 hex），上限 5，首版不做 EIP-55 强制 | ✅ 已采纳 |
| D4 | 地址可见性 | **默认 `hidden`**（保守取向，用户主动公开） | ✅ 已采纳 |
| D5 | profile 同步 | 登录 upsert + 触发器兜底 | ✅ 已采纳 |
| D6 | 首版范围 | 登录/登出/会话/profile/钱包地址 | ✅ 已采纳 |

## 日志

| 日期 | 事项 | 备注 |
|---|---|---|
| 2026-09-04 | Task 2 接手复核与补救开工 | 已冻结四 mutation + 四 read RPC、精确回执、profile/address 版本语义、追加式审计与四类 outbox；先写 RED，后加 forward-only migration 31。任何 disposable 验证仍需单独精确授权，Task 3 暂不开始。 |
| 2026-09-03 | D1–D6 已获所有者采纳（D4 取保守值 hidden） | 生产 auth 配置核查：`GOTRUE_EXTERNAL_EMAIL_ENABLED=true`、`GOTRUE_MAILER_AUTOCONFIRM=true`、`GOTRUE_SMTP_HOST` 已设置；**`GOTRUE_SITE_URL=http://127.0.0.1:3000` 为容器内部视角，部署 Task 5 前必须改为公网地址**，否则魔法链接回跳到用户本机 |
| 2026-09-03 | Task 2 迁移 30 + pgTAP 021 | 三处连带修正（**新策略必须同步 006 两份名单**——主目录按 tablename/policyname 严格字母序、命名例外集；并给新策略加 comment 以免落入「未加注释」集）。**教训：scp 目标目录写错把测试文件传进 migrations 目录会导致 reset 只应用 1 个迁移**（远端清理后恢复）。**生产未触碰。** |
| 2026-09-03 | Task 1 契约 RED→GREEN→变异 | `parseIdentityCommand` 对密钥形似字段**直接拒绝**（不静默丢弃）——发送方是事件而非格式问题；公开投影是独立 schema 而非私有行的过滤副本，新增字段不会自动变公开。**未访问数据库/远端/生产。** |
| 2026-09-03 | 规范与实施计划草案完成 | 范围闭合在 Identity 域（profiles / roles / public wallet addresses），不侵入 Execution 与 Notification；`profiles` 与 `user_roles` 已存在，钱包地址表为新建；等待 D1–D6 采纳后开工 |
