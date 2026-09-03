# Phase 9 Identity（用户认证与私有数据）— 设计规范

> 状态：**草案，待所有者采纳决策 D1–D6 后进入实施计划**。本规范只覆盖 AGENTS.md「Data ownership」中的 **Identity 域**（profiles、roles、public wallet addresses），为后续 Execution（任务管理）与 Notification 两域提供身份与私有行基础。

## 1. Goal

让真实用户能够登录，并拥有一块**归属自己、他人不可见**的私有数据：个人资料与公开钱包地址。据此建立并验证「用户私有行」的 RLS 模式（`user_id = auth.uid()`），使后续任务管理、关注列表、通知偏好可以直接复用同一模式，而不必各自重新设计授权。

## 2. 已采纳决策（D1–D6，2026-09-03 所有者「直接采纳」确认）

| # | 决策 | 建议 | 说明 |
|---|---|---|---|
| D1 | 登录方式 | **邮箱魔法链接（magic link）为主**，邮箱密码为辅 | 生产 gotrue 已就绪（health 200）；魔法链接无密码存储面，且免去找回流程。若需密码登录，须明确密码策略与找回路径 |
| D2 | 是否开放自助注册 | **是**，注册即创建 profile | 若选择「仅邀请」，需额外的邀请码/白名单机制 |
| D3 | 钱包地址范围 | **仅 EVM 公开地址**（`0x` + 40 hex），数量上限 5 | 只存公开地址；**永不存储私钥、助记词、keystore**。如需多链，后续按链类型扩展枚举 |
| D4 | 钱包地址可见性 | **默认 `hidden`（保守采纳值）**，用户逐条设为公开 | 采纳所有者在开工时的保守取向：避免地址聚类/画像风险；「public wallet address」指地址本身可公开，但**记录归用户私有管理** |
| D5 | profile 同步方式 | **登录时 upsert + auth.users 触发器兜底** | 触发器保证 CLI/后台创建的用户也有 profile；登录时 upsert 保证显示名更新 |
| D6 | 首版范围 | 登录/登出/会话/profile 编辑/钱包地址增删 | **不含**关注列表、任务、通知、团队、OAuth 第三方登录 |

## 3. Non-Goals

- 私钥、助记词、keystore、签名能力的任何存储或处理（产品铁律）
- 关注列表、任务、任务历史（Execution 域，Phase 10）
- 通知与偏好（Notification 域）
- 第三方 OAuth（Google/X/Discord）、多因素认证、组织/团队
- 钱包连接与任何链上交互（连签名都不做，遑论交易）
- 生产 rollout（另行授权，同 Phase 8 惯例）

## 4. Existing State and Required Integration Points

| 设施 | 现状 | 集成方式 |
|---|---|---|
| 生产 gotrue（auth 容器） | health 200，已有人类审核账号 | 终端用户复用同一 auth 服务；`auth.users` 为身份源 |
| `public.profiles` | 已存在（id, display_name, avatar_url, timezone, timestamps），RLS 未启用 user 场景 | 补齐 RLS + 自身更新命令 |
| `public.user_roles` | 已存在（user_id, role, granted_by, granted_at, revoked_at） | 沿用；**角色授予仍走既有管理路径，不由用户自助申请** |
| 审核会话链路（`lib/review-session.ts`、`lib/authenticated-user.ts`） | 已验证（AT201 fail-closed） | 终端用户会话复用 `auth.uid()` 解析，不复用 reviewer 角色校验 |
| 错误码体系（AR2xx / AT2xx） | 已建立 | Identity 启用 **`ID2xx`** |
| 受保护命令骨架（candidate + 回执 + 审计 + outbox） | 6A/6B/7B/8 同构 | 钱包地址变更走同构受保护命令（含 `expected_version` 与幂等键） |

## 5. Trust Boundaries and Invariants

1. **只存公开地址**：任何接口、表、日志都不得承载私钥、助记词、keystore、助记词派生信息。契约层用 strict schema 拒绝任何形如密钥的字段（越权字段直接拒绝，不静默丢弃）。
2. **私有行归用户**：所有用户数据行带 `user_id`，RLS 强制 `user_id = auth.uid()`；匿名只能看到 D4 允许公开的部分（且仅经公开投影）。
3. **会话失效 fail-closed**：会话过期/无效时，写命令返回 **401**（不回落、不猜身份），页面跳转登录并保留待办动作（沿用 `review-pending-action` 的模式）。
4. **角色不可自助提升**：`user_roles` 的写路径不向普通用户开放；钱包地址与 profile 的变更不得影响角色。
5. **冲突可见**：钱包地址重复、profile 并发修改等以稳定错误码返回，不静默覆盖。

## 6. Shared Contracts（`packages/contracts/src/identity/`）

- `enums.ts`：钱包链类型（首版仅 `evm`）、可见性（`public` / `hidden`）
- `commands.ts`：`updateProfile`、`addWalletAddress`、`setWalletAddressVisibility`、`removeWalletAddress`（全部 strict，`expectedVersion` + `Idempotency-Key`）
- `projections.ts`：`userProfile`、`walletAddress`、`publicProfile`（匿名可读的最小投影：display_name + 公开地址）
- 不引入任何与密钥相关的字段；`walletAddress` 值经正则与校验和规则校验（首版：格式校验，不做 EIP-55 强制，留待决策 D3 扩展）

## 7. Database Model（迁移 30）

- `public.profiles`：补齐 `user_id` 语义（现有 `id` 即 auth user id）、启用 RLS：`select/update` 限本人；新增 `updated_at` 触发器
- `public.user_wallet_addresses`（新建）：`id`、`user_id`、`chain`（首版 `evm`）、`address`、`label`、`visibility`、`created_at`、`updated_at`、`version`；唯一 `(user_id, chain, address)`
- `public.user_wallet_address_events`（新建，追加式）：每次变更落一行，含 `occurred_at`、`actor_user_id`、`event_type`
- 命令表/回执表沿用既有骨架（与 7B/8 同构）
- RLS 矩阵必须覆盖：匿名、已登录本人、已登录他人、无会话四种角色；**他人读写必须全部被拒**

## 8. Authentication and Session Flow

1. 登录页提交邮箱 → gotrue 发送魔法链接 → 回跳 `/auth/callback` 建立会话
2. 首次登录落 profile（D5 触发器兜底）
3. 私有页面/写命令经 `auth.uid()` 解析；无效会话 → 401 + 保留待办动作
4. 登出清会话并回到公开页

## 9. Commands, Idempotency, Concurrency

- 所有变更命令：`Idempotency-Key` + `expectedVersion`；版本冲突 → **409**，客户端重新加载后再确认（不自动采纳新版本）
- 命令与 outbox 事件同事务提交（AGENTS.md 要求）
- 受保护命令仅授予 `authenticated`；`anon` 调用 → 42501/401

## 10. Error Codes（稳定，不按文案分支）

| 代码 | 含义 | 典型处理 |
|---|---|---|
| `identity_session_required` (`ID201`) | 无有效会话 | 重新登录，恢复待办动作 |
| `identity_profile_not_found` (`ID202`) | profile 缺失 | 触发兜底创建或重载 |
| `identity_address_invalid` (`ID203`) | 地址格式/链类型非法 | 修正输入 |
| `identity_address_duplicate` (`ID204`) | 同一用户下地址重复 | 改用既有记录 |
| `identity_address_limit_reached` (`ID205`) | 超过 D3 上限 | 先移除再添加 |
| `identity_version_conflict` (`ID206`) | `expectedVersion` 过期 | 重载后重新确认 |
| `identity_idempotency_conflict` (`ID207`) | 幂等键复用但体不同 | 生成新键 |
| `identity_command_invalid` (`ID208`) | 契约/状态校验失败 | 修正命令 |
| `identity_persistence_failed` (`ID299`) | 事务失败回滚 | 重试一次后查日志 |

## 11. Repositories and HTTP Boundaries

- `packages/database/src/identity/`：`profileRepository`（读写本人 profile、公开投影）、`walletAddressRepository`（受保护命令、列表、公开投影）
- HTTP：`/api/v1/identity/profile`、`/api/v1/identity/wallet-addresses`、`/api/v1/identity/wallet-addresses/{id}`（`PATCH` 可见性、`DELETE` 移除）
- 公开投影：`/api/v1/identity/public-profile/{userId}`（仅 D4 允许公开的字段）

## 12. User Interface

- 登录页（邮箱魔法链接）、`/auth/callback`、登出入口
- `/settings/profile`：显示名、时区、头像 URL
- `/settings/wallets`：地址列表、增删改、可见性切换；**页面显著提示永不要求私钥/助记词**
- 会话过期：保留待办动作，登录后继续（沿用既有 pending-action 模式）

## 13. Acceptance

- pgTAP（新增）：匿名用户不可读写他人数据；已登录本人可读写；已登录他人全部被拒；命令幂等；版本冲突返回 409；地址唯一与上限约束；追加式事件表不可变
- 集成测试：仓储与 RLS 四角色矩阵、命令回执与 outbox 同事务
- 契约测试：strict schema 拒绝越权字段（含任何密钥形似字段）
- 页面：登录→编辑 profile→添加地址→会话过期→恢复→登出 全链路
- `pnpm verify` exit 0；disposable 矩阵（reset + full pgTAP + 集成）全绿后，生产应用另行授权

## 14. Risks and Open Questions

- **D1 登录方式**直接决定是否需要密码找回与泄露面；建议采纳魔法链接
- **D3 是否引入 EIP-55 校验和校验**：提升正确性但会拒绝小写地址，需确认用户体验取舍
- 生产 auth 的 SMTP 配置状态需确认（魔法链接依赖邮件发送；若未配置，D1 须改走密码或 OAuth）
- 钱包地址公开展示可能被用于地址聚类/画像 —— 已按保守取向采纳 **默认 `hidden`**，用户主动公开才可见
