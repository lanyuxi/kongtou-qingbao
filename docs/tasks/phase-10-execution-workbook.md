# Phase 10 Task execution（任务管理与关注列表）— 工作簿（逐任务台账）

> 分支 `codex/phase-10-execution` / worktree `.worktrees/phase-10-execution`（待建）。规范：`docs/superpowers/specs/2026-09-06-phase-10-task-execution-design.md`；计划：`docs/superpowers/plans/2026-09-06-phase-10-task-execution.md`。
> 每个任务按「RED → GREEN → 门禁 → 变异 → 文档 → 提交」推进；生产与 disposable 操作逐次显式授权。

## 起点基线（2026-09-06，主线 `7b47800`）

fresh `CI=true pnpm verify` 全绿：contracts **232** + domain **428** + database **347** + worker **267** + web **552** = **1,826 PASS / 84 gated skips**。

## 进度看板

| Task | 内容 | 状态 | 提交 / 证据 |
|---|---|---|---|
| 1 | 契约（`packages/contracts/src/execution/`） | ✅ 完成 | 四模块（enums / commands / projections / receipts）+ `src/tests/execution.test.ts` **42 PASS**；contracts 232→**274**；lint/typecheck/build 绿；fresh root verify **1,868 PASS / 84 gated skips**；**变异 9/9 killed**（密钥守卫中和→9 失败、strict 放宽、完成态不变式、标题/名称长度、控制字符、行级完成态不变式、幂等键边界、投影 strict）。**未访问数据库/远端/生产**。 |
| 2 | 命令边界（迁移 32 + pgTAP 022 + 006 同步） | ⬜ 未开始 | — |
| 3 | 仓储（task / watchlist / participation） | ⬜ 未开始 | — |
| 4 | BFF 路由与会话边界 | ⬜ 未开始 | — |
| 5 | 任务 UI（`/tasks`） | ⬜ 未开始 | — |
| 6 | 关注列表与参与状态 UI | ⬜ 未开始 | — |
| 7 | 收口（runbook + 矩阵 + 台账） | ⬜ 未开始 | — |

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
|---|---|---|
| 2026-09-06 | Task 1 契约 COMPLETE | 分支 `codex/phase-10-execution` / worktree `.worktrees/phase-10-execution` 建于 `d126e51`（新 worktree 需 `pnpm install`，不继承主 worktree 依赖）。RED（module-missing 42 failed）→ GREEN **42 PASS** → lint/typecheck/build 绿 → fresh root verify **1,868 PASS / 84 gated skips**（contracts 232→274，其余四包不变）→ **变异 9/9 killed** → `diff` 校验还原干净。**两个中途修正**：①contracts 顶层共享 `src/enums.ts` 里**早已定义** `participationStatusSchema`/`taskStatusSchema`/`taskPrioritySchema`（与迁移 5 同值）——typecheck 报 Duplicate identifier 才暴露；按「只有共享声明才不漂移」的既有教训改为**从 `../enums.js` 再导出**，未做第二份声明，index.ts 相应去掉重复导出；②控制字符字面量再次把测试文件变 binary，改为 `\u0000`/`\u007f` 转义。**未访问数据库/远端/生产。** |
| 2026-09-06 | 规范 + 计划 + 工作簿定稿，D1–D4 获所有者采纳 | 调研修正了初始假设：Execution 已有 schema 与 plan(228) 覆盖，本 Phase 是「硬化 + 建应用层」而非从零建表。规范据此重写了「Existing State」与「Risks」两节。未访问数据库/远端/生产。下一步建分支与 worktree，开始 Task 1 契约 RED。 |
