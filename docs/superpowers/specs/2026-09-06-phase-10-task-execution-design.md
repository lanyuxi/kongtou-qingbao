# Phase 10 Task execution（任务管理与关注列表）— 设计规范

> 状态：**Approved（2026-09-06，所有者已采纳 D1–D4；D5–D9 为本规范沿既有先例给出的边界值，开工时一并生效）**。
> 前置：Phase 9 Identity 已合并主线（`8f38102`），`user_id = auth.uid()` 私有行模式已建立并经 pgTAP 021（plan 91）验证。本规范只覆盖 AGENTS.md「Data ownership」中的 **Execution 域**（user projects / watchlists / tasks / task history），为后续 Notification 域提供 outbox 事件来源。

## 1. Goal

让登录用户把「看到的机会」变成「自己在做的事」：把项目加入关注、记录参与状态、把要做的事拆成任务并推进到完成。

同时把 Execution 域的写入从当前的**裸 DML**升级为与 Phase 9 同构的**受保护命令边界**——命令即事实来源，带回执、幂等、版本、追加式历史与事务性 outbox。这不是为一致性而一致性：任务与关注是用户唯一的私人执行记录，一旦被静默覆盖或丢失就无法重建。

## 2. 已采纳决策（2026-09-06 所有者确认）

| # | 决策 | 采纳值 | 说明 |
|---|---|---|---|
| D1 | 命令边界强度 | **对齐 Phase 9 硬化标准** | 新建 forward-only 迁移：revoke 浏览器直写 + 拒绝触发器；所有写走受保护 RPC；补回执（幂等键 + input hash）、append-only 任务历史、事务性 outbox。代价是必须同步 pgTAP 006 策略目录 |
| D2 | 首版范围 | **任务 + 关注列表 + 参与状态** | 三块全做；任务历史作为追加式审计自动记录，不单独做页面 |
| D3 | 默认关注列表 | **自动建默认列表** | 新建 profile 时自动建一个 `is_default` 关注列表，项目详情页的「加关注」始终有落点 |
| D4 | 数量上限 | **关注列表 20 / 单列表 200 项目 / 任务 500** | 比 Phase 9 的钱包地址上限（5）宽松——任务与关注条目天然更多，但仍能防失控增长与脚本滥用 |

### 本规范沿先例确定的边界值（D5–D9）

| # | 项 | 取值 | 依据 |
|---|---|---|---|
| D5 | 任务历史 | append-only `user_task_events` 表 | 对齐 Phase 9 的 `user_wallet_address_events`；AGENTS.md Execution 明确含 task history |
| D6 | 任务可否无关联项目 | **可以**（`project_id` 可空，沿用既有 schema，`on delete set null`） | 既有 schema 已如此设计，且私人待办确实可能不挂项目 |
| D7 | UI 位置 | `/tasks`、`/watchlists`，项目详情页加「关注 / 参与状态」切换 | 与 `/settings/*` 同构，共用 Phase 9 的会话条与重定向逻辑 |
| D8 | 通知联动 | **只发 outbox 事件，不做投递** | Notification 是独立域；本域只保证事件与状态变更同事务提交 |
| D9 | 错误码区间 | **`EX2xx`** | 与 AR2xx / AT2xx / ID2xx 同级，`EX` 前缀当前未占用 |

## 3. Non-Goals

- 通知与投递、提醒策略（Notification 域）
- 任务的 AI 自动生成或推荐（无 AI 阶段参与本域）
- 团队协作、任务指派、共享关注列表（首版为纯私人数据）
- 任务与链上交互的任何关联（不触碰签名与交易，产品铁律）
- 生产 rollout（另行授权）

## 4. Existing State and Required Integration Points

**这一节是本次Phase与以往最大的不同：Execution 不是从零开始。**

| 设施 | 现状 | Phase 10 的处理 |
|---|---|---|
| `public.watchlists` | 已存在（id / user_id→profiles / name 1-80 去空白 / is_default / timestamps，`unique(user_id, name)`）；RLS 已启用，4 条 owner 策略 | 保留结构；revoke 直写并改为命令写入 |
| `public.watchlist_projects` | 已存在（`(watchlist_id, project_id)` 复合主键 / added_at）；RLS 已启用，3 条 owner 策略（经 watchlists 归属判定） | 同上 |
| `public.user_projects` | 已存在（`(user_id, project_id)` 主键 / participation_status / notes ≤4000 / started_at / updated_at）；RLS 已启用，4 条 owner 策略 | 同上 |
| `public.user_tasks` | 已存在（id / user_id / project_id 可空 / title 1-200 去空白 / status / priority / due_at / completed_at / **version** / timestamps；约束 `(status='completed') = (completed_at is not null)`、`version > 0`）；RLS 已启用，但**只有 select / insert / delete 三条策略，没有 UPDATE** | 补齐命令化更新；UPDATE 仍不向浏览器直接开放 |
| `public.update_user_task(task_id, expected_version, patch jsonb)` | **已存在的 SECURITY DEFINER 受保护命令**：校验 expected_version > 0、patch 必须是 object、字段白名单（project_id / title / status / priority / due_at / completed_at）、逐字段类型校验、material 变更才递增 version 并推进 updated_at、no-op 不改动 | **保留并复用**，不另造一个更新命令；本 Phase 只在其上补回执 / 历史 / outbox |
| 触发器 | `watchlists_set_updated_at`、`user_projects_set_updated_at` | 沿用；`user_tasks` 的 updated_at 由 update 命令自己维护 |
| 枚举 | `participation_status`（interested / researching / participating / paused / completed / abandoned）、`task_status`（backlog / planned / in_progress / completed / skipped / blocked）、`task_priority`（low / medium / high / urgent） | 沿用，不新增枚举值 |
| pgTAP `005_execution_rls.test.sql` | **plan(228)**，已覆盖四表 RLS 与 `update_user_task` 的全部边界（含 stale version、no-op、version 溢出） | **不得削弱**；本 Phase 新增断言放新文件 `022` |
| pgTAP `006_read_models.test.sql` | **维护三份精确策略名单**（主目录 / 命名例外集 / 无 comment 集），逐一枚举了现有 14 条 Execution 策略 | **新增或改动任何 Execution 策略都必须同步 006**，漏改即失败 |
| Phase 9 Identity | `profiles` RLS 已补齐、`user_id = auth.uid()` 模式已验证 | 四张 Execution 表已 `references public.profiles (id) on delete cascade`，可直接复用该模式 |
| 应用层 | **完全为空**——`packages/contracts`、`packages/database`、`apps/web` 无任何代码引用这四张表 | 本 Phase 新建 contracts / repositories / BFF / UI |

## 5. Trust Boundaries and Invariants

1. **执行记录归用户私有**：四表全部 RLS 强制 `user_id = auth.uid()`；匿名完全不可达；他人读写一律拒绝。
2. **浏览器不得直写**：迁移后撤销 `authenticated` 对四表的 INSERT / UPDATE / DELETE，并用拒绝触发器兜底（对齐 Phase 9 的 `reject_identity_ledger_mutation()`）。唯一写路径是受保护命令。
3. **命令幂等且版本化**：所有变更命令带 `Idempotency-Key` 与 `expectedVersion`；版本冲突返回 **409**，客户端重载后自行确认，**绝不自动采纳新版本**。
4. **历史不可变**：任务变更追加到 `user_task_events`，只增不改不删；更正靠新版本，不靠改写历史。
5. **事件与状态同事务**：outbox 事件与业务写入在同一事务提交（AGENTS.md 要求），保证后续 Notification 不会看到「有事件无状态」或反之。
6. **冲突可见**：关注列表重名、任务版本过期、上限触顶等均以稳定错误码返回，不静默覆盖。
7. **完成态自洽**：`user_tasks` 既有约束 `(status='completed') = (completed_at is not null)` 必须继续成立，命令层负责同时设置两个字段。

## 6. Shared Contracts（`packages/contracts/src/execution/`）

- `enums.ts`：直接复用数据库既有枚举的字面量联合（`participation_status` / `task_status` / `task_priority`），**不引入未采纳的枚举值**
- `commands.ts`：`createTask` / `updateTask` / `deleteTask` / `createWatchlist` / `renameWatchlist` / `deleteWatchlist` / `addWatchlistProject` / `removeWatchlistProject` / `setParticipationStatus`（全部 strict、`additionalProperties: false`、`expectedVersion` + `Idempotency-Key`）
- `projections.ts`：`userTask`、`watchlist`、`watchlistProject`、`userProjectParticipation`——**私有投影只暴露本域字段**，不拼装 Catalog 域的项目详情（跨域读取走既有读模型）
- `receipts.ts`：命令回执（对齐 Phase 9 的 receipt 形状：version / commandId / replayed）

## 7. Database Model（迁移 32）

沿用「迁移不可变 + forward-only 修复」的既有惯例，Phase 10 只新增迁移，**不改写迁移 5**：

- `public.user_task_events`（新建，append-only）：`id`、`task_id`、`user_id`、`occurred_at`、`event_type`（created / updated / deleted / status_changed）、以及删除后仍强制保留的快照字段（title / status / priority / version），对齐 Phase 9 钱包事件的做法
- `public.execution_command_receipts`（新建）：命令回执，含 `idempotency_key` 唯一、`input_hash`、`expected_version`、`resulting_version`、`replayed`
- 四张 Execution 表：撤销 `authenticated` 的 INSERT / UPDATE / DELETE，加拒绝触发器
- 新增受保护命令（SECURITY DEFINER，仅授予 `authenticated`）：任务的创建/删除、关注列表的创建/重命名/删除、关注项目的增删、参与状态设置；`update_user_task` 保留并在其内补回执/历史/outbox
- 新增只读 RPC：本人任务列表、本人关注列表（含项目计数）、指定项目的参与状态
- 新建 profile 时自动建默认关注列表的触发器（D3）
- outbox 事件类型：`execution_task_created` / `execution_task_updated` / `execution_task_deleted` / `execution_watchlist_project_added`（只产出，不投递）
- **同步 pgTAP 006 的策略目录三份名单**（主目录按 tablename/policyname 严格字母序、命名例外集、无 comment 集），并给新策略加 comment

## 8. Authorization Matrix

必须覆盖四种角色，且与 Phase 9 的四角色矩阵同构：

| Surface | 匿名 | 本人 | 其他登录用户 | 无会话 / 过期 |
|---|---|---|---|---|
| 读本人任务 / 关注列表 | 拒绝 | 允许（经只读 RPC） | 拒绝 | 拒绝（EX201） |
| 读他人任务 / 关注列表 | 拒绝 | 拒绝 | 拒绝 | 拒绝 |
| 写本人任务 / 关注列表 | 拒绝（42501） | 允许（经命令） | 拒绝 | 拒绝（EX201） |
| 四表直接 DML | 拒绝 | **拒绝**（revoke + 触发器） | 拒绝 | 拒绝 |
| 追加事件表 | 拒绝 | 拒绝（仅命令可追加） | 拒绝 | 拒绝 |

## 9. Error Codes（稳定，不按文案分支）

| 代码 | 含义 | 典型处理 |
|---|---|---|
| `execution_session_required` (`EX201`) | 无有效会话 | 重新登录，返回原页面 |
| `execution_task_not_found` (`EX202`) | 任务不存在或不属本人 | 重载列表 |
| `execution_watchlist_not_found` (`EX203`) | 关注列表不存在或不属本人 | 重载列表 |
| `execution_project_not_found` (`EX204`) | 项目不存在或当前不可关注 | 重载项目页 |
| `execution_task_limit_reached` (`EX205`) | 超过 D4 任务上限 500 | 先清理再添加 |
| `execution_watchlist_limit_reached` (`EX206`) | 超过 D4 关注列表上限 20 | 先删除再创建 |
| `execution_watchlist_project_limit_reached` (`EX207`) | 超过 D4 单列表 200 上限 | 换列表或先移除 |
| `execution_name_conflict` (`EX208`) | 同用户名下关注列表重名 | 改名 |
| `execution_version_conflict` (`EX209`) | `expectedVersion` 过期 | 重载后重新确认 |
| `execution_idempotency_conflict` (`EX210`) | 幂等键复用但体不同 | 生成新键 |
| `execution_command_invalid` (`EX211`) | 契约/状态校验失败（字段名、长度、completed 与 completed_at 不自洽） | 修正命令 |
| `execution_persistence_failed` (`EX299`) | 事务失败回滚 | 重试一次后查日志 |

查询类回落 `execution_query_failed`，变更类回落 `execution_persistence_failed`，不可混用（沿用 Phase 9 Task 4 的分流裁决）。

## 10. Repositories and HTTP Boundaries

- `packages/database/src/execution/`：`taskRepository`、`watchlistRepository`、`participationRepository`，全部 **bearer-scoped**（每请求用调用方 bearer 建非持久客户端），结果一律从 `unknown` 经 strict schema 解析
- HTTP：`/api/v1/execution/tasks`、`/api/v1/execution/tasks/{id}`、`/api/v1/execution/watchlists`、`/api/v1/execution/watchlists/{id}`、`/api/v1/execution/watchlists/{id}/projects/{projectId}`、`/api/v1/execution/projects/{projectId}/participation`
- 边界沿用 Phase 9 Task 4 的裁决：**认证严格先于查询/请求体校验**（401 时仓库零调用）；他人资源返回 **404** 而非 403（不泄漏存在性）；header 与 body 的幂等键必须同一；path 上的 ID 与 body 内的 ID 必须绑定

## 11. User Interface

- `/tasks`：任务列表 + 新建/编辑/完成/删除，按状态与优先级筛选，**不做伪分页**（沿用 Phase 9 Task 4 对「无 cursor 契约就不发明分页」的裁决）
- `/watchlists`：关注列表管理（新建 / 重命名 / 删除）与列表内项目增删
- 项目详情页：关注切换与参与状态切换
- 会话过期：沿用 Phase 9 的 `buildSignInPath(next)` 重定向并保留待办动作
- 首版不做拖拽排序、日历视图、批量操作

## 12. Acceptance

- pgTAP 新增 `022`：四角色矩阵、命令幂等与精确 replay、版本冲突、上限与重名、追加式事件不可变、outbox 与状态同事务、浏览器直写被拒绝
- 集成测试：仓储四角色矩阵、命令回执与 outbox 同事务
- 契约测试：strict schema 拒绝越权字段与未知 patch 字段
- 页面：登录 → 建关注列表 → 加项目 → 建任务 → 改状态 → 完成 → 删除 全链路
- `pnpm verify` exit 0；**disposable 矩阵（reset + full pgTAP + 全集成 + 清理证明）需所有者显式授权后执行**
- 生产应用迁移 32 需另行显式授权

## 13. Risks and Open Questions

- **`user_tasks` 目前没有 UPDATE 策略**：本 Phase 不直接开放 UPDATE，而是继续走 `update_user_task`。若后续需要多字段原子编辑之外的能力，再评估是否加策略（届时必须同步 006）
- **pgTAP 006 策略目录是硬耦合**：新增策略漏改 006 会直接失败；改动需按行号定位，勿按字符串首次匹配删除（既有教训）
- **迁移 5 的 `update_user_task` 是 SECURITY DEFINER**：在其内追加回执/历史/outbox 时，必须保持 `set search_path` 与既有校验顺序不变，否则会削弱 plan(228) 已覆盖的边界
- **任务上限 500 是产品判断**：若真实使用很快撞顶，需回到 D4 重新取值，而不是悄悄放宽
- **outbox 事件只有产出没有消费者**：全仓无 publisher（仅测试引用 `outbox_events`），`published_at` 至今无写入方，Notification 域落地前事件会持续累积——可接受，但清理策略需在 Task 1 核实
- **`outbox_events` 有唯一身份键** `(aggregate_type, aggregate_id, aggregate_version, event_type, event_version)`：这意味着**幂等 replay 必须在插入事件之前短路**（否则同版本同类型第二次插入会撞唯一约束）。命令实现顺序固定为：查回执 → 命中即原样返回 → 未命中才执行业务写入 + 事件写入（同事务）
