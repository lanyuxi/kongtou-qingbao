# Phase 10 Task execution（任务管理与关注列表）— 工作簿（逐任务台账）

> 分支 `codex/phase-10-execution` / worktree `.worktrees/phase-10-execution`（待建）。规范：`docs/superpowers/specs/2026-09-06-phase-10-task-execution-design.md`；计划：`docs/superpowers/plans/2026-09-06-phase-10-task-execution.md`。
> 每个任务按「RED → GREEN → 门禁 → 变异 → 文档 → 提交」推进；生产与 disposable 操作逐次显式授权。

## 起点基线（2026-09-06，主线 `7b47800`）

fresh `CI=true pnpm verify` 全绿：contracts **232** + domain **428** + database **347** + worker **267** + web **552** = **1,826 PASS / 84 gated skips**。

## 进度看板

| Task | 内容 | 状态 | 提交 / 证据 |
|---|---|---|---|
| 1 | 契约（`packages/contracts/src/execution/`） | ✅ 完成 | 四模块（enums / commands / projections / receipts）+ `src/tests/execution.test.ts` **42 PASS**；contracts 232→**274**；lint/typecheck/build 绿；fresh root verify **1,868 PASS / 84 gated skips**；**变异 9/9 killed**（密钥守卫中和→9 失败、strict 放宽、完成态不变式、标题/名称长度、控制字符、行级完成态不变式、幂等键边界、投影 strict）。**未访问数据库/远端/生产**。 |
| 2 | 命令边界（迁移 32 + pgTAP 022 + 005/006 同步） | ✅ 完成 | 迁移 32（1,589 行）+ pgTAP 022（**68/68**）+ 005（**230/230**）+ 006（**83/83**）；**干净 reset 从零应用后全套 pgTAP 22 files / 1,725 断言 / 0 失败 / 无 Bad plan**；残留核验零残留、日志已清理。提交 `6ecd82a` + `ce8da3b`。7 个真实缺陷见下方段落 |
| 3 | 仓储（task / watchlist / participation） | ⬜ 未开始 | — |
| 4 | BFF 路由与会话边界 | ⬜ 未开始 | — |
| 5 | 任务 UI（`/tasks`） | ⬜ 未开始 | — |
| 6 | 关注列表与参与状态 UI | ⬜ 未开始 | — |
| 7 | 收口（runbook + 矩阵 + 台账） | ⬜ 未开始 | — |

## 七个真实缺陷（Task 2 disposable 验收中暴露并修复）

写迁移时看似成立、在真 PostgreSQL 上才暴露的问题——全部由测试或 reset 抓出，无一是靠静态审查发现的：

| # | 缺陷 | 症状 | 根因与修复 |
|---|---|---|---|
| 1 | `extensions.encode(bytea, unknown)` 不存在 | 命令调用 die | pgcrypto 的 `encode` 在 `pg_catalog`；更重要的是既有共享助手 `public.security_command_input_hash_v1(jsonb)` 已存在（迁移 26）。9 处自造 hash 全部改用共享助手 |
| 2 | outbox payload 混入域字段 | `outbox_events_payload_valid` 违反（23514） | 共享约束要求 payload **只含 5 个信封键**（`payload - array[...] = '{}'`）。4 处 payload 改为纯信封——域状态在表里，事件只是信号 |
| 3 | 回执表漏 4 个审计列 | `column "input_hash" does not exist` | Phase 9 是在迁移 31 里 `alter table` 补的；我建表时漏带。迁移文件补列 + 库内 `alter` |
| 4 | `user_task_events` 无 `grant select` | 以 authenticated 读历史 → 42501 | 新建表默认不授权任何角色；既有四表是老迁移授的。补 `grant select ... to authenticated`（RLS 已限定本行） |
| 5 | 事件类型约束漏 `status_changed` | `user_task_events_type_valid` 违反 | 函数会写 `status_changed`（状态变更）但约束只列了三种。约束扩为四种 |
| 6 | update 命令缺 completed 自洽校验 | 期望 EX211，实际撞表约束 | 只校验了「非 completed 却带 completedAt」，漏了反向。改为对称校验 `(status='completed') <> (completed_at is not null)` |
| 7 | 测试缺 `reset role`、清理段多余 | 断言被 42501 / 55000 打断，只跑到 36/72 | 021 的做法是**频繁 `reset role`**（10 处）：读 definer 内部表（outbox/receipts）用 postgres，浏览器行为用 authenticated；且**整个测试单事务 + rollback，无需清理段**。按此插入 5 处 `reset role` + 3 处 `set local role`，删除多余清理段（72→68） |

**连带发现**：默认列表触发器会为 005/006 的每个夹具用户建默认列表，撞 `watchlists_one_default_per_user` 部分唯一索引——既有套件假设「profile 可以没有默认列表」。修法：3 处夹具默认列表降级为 `is_default=false`，6 处「owner 可直写 / 改他人行返回 0 行」断言改为断言**权限拒绝**（RLS 层 → 授权层，语义更强）。

## 决策记录（2026-09-06 所有者确认）

| # | 决策 | 采纳值 | 状态 |
|---|---|---|---|
| D1 | 命令边界强度 | **对齐 Phase 9 硬化标准**（revoke 直写 + 受保护命令 + 回执/幂等/历史/outbox） | ✅ 已采纳 |
| D2 | 首版范围 | **任务 + 关注列表 + 参与状态** 三块全做 | ✅ 已采纳 |
| D3 | 默认关注列表 | **自动建默认列表**（profile 触发器兜底） | ✅ 已采纳 |
| D4 | 数量上限 | **关注列表 20 / 单列表 200 项目 / 任务 500** | ✅ 已采纳 |
| D5 | 任务历史 | append-only `user_task_events` | ✅ 按先例取定 |
| D6 | 任务可否无项目 | 可以（`project_id` 可空） | ✅ 沿用既有 schema |
| D7 | UI 位置 | `/tasks`、`/watchlists`、项目详情页切换 | ✅ 按先例取定 |
| D8 | 通知联动 | 只发 outbox 事件，不做投递 | ✅ 按先例取定 |
| D9 | 错误码区间 | `EX2xx`（前缀未占用） | ✅ 按先例取定 |

## 调研结论（务必读，本 Phase 与以往不同）

**Execution 不是从零开始。** 迁移 5（`20260809000500_execution.sql`）已建好：

| 已存在 | 说明 |
|---|---|
| `public.watchlists` | id / user_id→profiles / name(1-80 去空白) / is_default / timestamps；`unique(user_id, name)`；RLS 4 条 owner 策略 |
| `public.watchlist_projects` | `(watchlist_id, project_id)` 复合主键 / added_at；RLS 3 条（经 watchlists 归属判定） |
| `public.user_projects` | `(user_id, project_id)` 主键 / participation_status / notes(≤4000) / started_at / updated_at；RLS 4 条 |
| `public.user_tasks` | id / user_id / project_id 可空 / title(1-200 去空白) / status / priority / due_at / completed_at / **version** / timestamps；约束 `(status='completed') = (completed_at is not null)`、`version > 0`；RLS **只有 select/insert/delete，无 UPDATE** |
| `public.update_user_task(task_id, expected_version, patch jsonb)` | **已存在的 SECURITY DEFINER 受保护命令**：expected_version>0、patch 必须 object、字段白名单、逐字段类型校验、material 变更才递增 version、no-op 不改动 |
| 触发器 | `watchlists_set_updated_at`、`user_projects_set_updated_at` |
| 枚举 | `participation_status` / `task_status` / `task_priority`（迁移 1 定义，Phase 10 不新增值） |
| pgTAP `005` | **plan(228)**，已覆盖四表 RLS 与 update_user_task 全部边界 |
| pgTAP `006` | **维护三份精确策略名单**，逐一枚举了现有 14 条 Execution 策略——**新增/改动策略必须同步** |

**应用层完全为空**：`packages/contracts`、`packages/database`、`apps/web` 无任何代码引用这四张表（仅 generated types 与 pgTAP）。

**识别到的真实缺口**：无任务历史表（AGENTS.md 明确列 task history）；无回执/幂等/outbox；浏览器可直写绕过命令层；关注列表与参与状态无受保护命令。

**两条硬约束**：①不得削弱 pgTAP 005 的 228 条断言，新断言放 `022`；②新增/改动策略必须同步 006 三份名单，编辑按行号定位。

**outbox 实现要点**：`outbox_events` 的唯一身份键是 `(aggregate_type, aggregate_id, aggregate_version, event_type, event_version)`，因此**幂等 replay 必须在插入事件之前短路**，否则同版本同类型第二次插入撞唯一约束。全仓目前无 publisher，事件会累积（可接受，清理策略 Task 1 核实）。

## 日志

| 日期 | 事项 | 备注 |
| 2026-09-08 | Task 2 disposable 验收：RED→GREEN，**全套 pgTAP 22 files / 1,725 断言 / 0 失败** | ①**主机于 9/7 被重启过**（`up 3 min`），重启后 **docker 未自启**（`systemctl is-enabled docker` = disabled）——已 `systemctl start docker` 恢复；**建议对 `systemctl enable docker` 单独授权**（生产容器同机，不自启有停机风险）。②reset 在重启前已完成到迁移 32 并进入 seeding；容器数据卷保留，恢复后 `schema_migrations`=**32**。③**RED 证据**（前一日取得）：当前 schema 跑 022 → 85 个错误全为 `relation "public.user_task_events" does not exist`，plan 已输出。④**迁移 32 先经回滚事务空跑验证**（`begin;…rollback;` exit 0 零错误），再经 reset 真实应用。⑤**GREEN 过程中暴露并修复 7 个真实缺陷**（详见下方「七个缺陷」段落）：自造 hash 用了不存在的 `extensions.encode`、outbox payload 混入域字段违反共享约束、回执表漏 4 个审计列、`user_task_events` 缺 `grant select`、事件类型约束漏 `status_changed`、update 命令缺 completed 自洽校验、测试缺 `reset role` 与清理段多余。⑥**既有套件按新契约收紧而非放宽**：005 plan 228→**230**（新增两列 ACL 断言），17 处列级授权向量 + 4 处表级向量改只读，6 类「owner 可直写/改他人行返回 0 行」断言改为断言权限拒绝，3 处夹具默认列表降级（触发器现拥有默认列表）；006 plan 81→**83**，新增策略进主目录 + 命名例外集 + service_role 名单，2 处读断言改为「读不到他人行」。⑦**plan 计数教训**：往 `values` 清单加行会产生新断言，必须同步 plan（005 +2、006 +2），否则 `Looks like you planned N tests but ran M`。**最后一步：干净 reset 复验修正后的迁移文件能否从零应用**（当前库是旧文件 + 原地补丁达到的）。 |

|---|---|---|
| 2026-09-06 | Task 2 代码完成，**SQL 未执行，DB 验证待所有者授权** | ①**本机无 Docker 也无 Postgres**（此前误把 `docker ps 2>/dev/null` 的空输出当成「无容器」），`pnpm db:start` 失败 → 本地 pgTAP 不可行，DB 验证必须走 disposable（需授权）。②迁移 32 写完：`user_task_events` + `execution_command_receipts`、四表 + 两新表 revoke `insert/update/delete/truncate`（角色清单与迁移 31 逐字对齐）、9 个 receipt-first 命令、4 个只读 RPC、profile 触发器自动建「默认关注」（幂等 `on conflict`）、outbox 按迁移 31 的「读旧约束表达式再 OR 并」模式扩展四类事件。③pgTAP 022 **plan(72)**：形态/函数面/ACL、无会话 EX201、直写 42501、命令全流程（创建→replay→幂等冲突→版本冲突→未知字段→半完成态）、material 与 no-op 更新、列表重名/默认列表保护/20 上限、跨用户不可达、历史与回执 55000 不可变、自清理。④**同步 006**：目录新增 `user_task_events_select_owner`（按 C 排序落在 user_tasks 之前）、service_role 无私有读名单加两新表。⑤**005 契约更新（非削弱）**：`columns_are` 两处补 `version`；列级授权断言与精确 ACL 向量改为「authenticated 只读」——迁移 32 把 DELETE 也 revoke 了，而 005 原本断言 authenticated **有** `SELECT,DELETE`，这正是 D1 要收紧的旧契约。断言数仍为 228。**风险声明：1,589 行 SQL 与 72 断言均未在真实 PostgreSQL 上跑过**，Phase 9 迁移 31 在有真实库反馈的情况下仍经历了修复轮，本迁移需在 disposable 上按 RED→应用→修复→GREEN 推进。**未访问数据库/远端/生产。** |
| 2026-09-06 | Task 1 契约 COMPLETE | 分支 `codex/phase-10-execution` / worktree `.worktrees/phase-10-execution` 建于 `d126e51`（新 worktree 需 `pnpm install`，不继承主 worktree 依赖）。RED（module-missing 42 failed）→ GREEN **42 PASS** → lint/typecheck/build 绿 → fresh root verify **1,868 PASS / 84 gated skips**（contracts 232→274，其余四包不变）→ **变异 9/9 killed** → `diff` 校验还原干净。**两个中途修正**：①contracts 顶层共享 `src/enums.ts` 里**早已定义** `participationStatusSchema`/`taskStatusSchema`/`taskPrioritySchema`（与迁移 5 同值）——typecheck 报 Duplicate identifier 才暴露；按「只有共享声明才不漂移」的既有教训改为**从 `../enums.js` 再导出**，未做第二份声明，index.ts 相应去掉重复导出；②控制字符字面量再次把测试文件变 binary，改为 `\u0000`/`\u007f` 转义。**未访问数据库/远端/生产。** |
| 2026-09-06 | 规范 + 计划 + 工作簿定稿，D1–D4 获所有者采纳 | 调研修正了初始假设：Execution 已有 schema 与 plan(228) 覆盖，本 Phase 是「硬化 + 建应用层」而非从零建表。规范据此重写了「Existing State」与「Risks」两节。未访问数据库/远端/生产。下一步建分支与 worktree，开始 Task 1 契约 RED。 |
