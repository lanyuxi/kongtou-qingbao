# Phase 8 Tutorials — Development Workbook

> 日期：2026-09-02
> 当前状态：**Task 1 完成（contracts GREEN + 变异 2/2 killed）**；Task 2–10 未开始
> 权威设计：`docs/superpowers/specs/2026-09-02-phase-8-tutorials-design.md`（20 节，Approved；D1–D8 已采纳）
> 实施计划：`docs/superpowers/plans/2026-09-02-phase-8-tutorials.md`（10 任务）
> 分支/工作区：`codex/phase-8-tutorials`，worktree `.worktrees/phase-8-tutorials`（HEAD 基线 `5fb784f`）
> 运行时：Node 22.22.2-2（managed）+ corepack pnpm 11.16.0（旧 /tmp 声明路径已轮换废弃）
> 前置：Phase 7B 已合并主线（`f723457`）；生产 rollout 已完成（25 migrations / auth 200 / reviewer 已建）

## 1. 固定边界

- disposable 栈与生产同主机 `115.190.206.200`；disposable 参数与验收规程沿用 Phase 7B（见 `airdrop-phase-delivery` 技能与项目 MEMORY.md）。
- 生产已于 2026-09-02 应用全部 25 个迁移；本 Phase 的迁移 26 上生产需另行显式授权。
- 迁移 26 = `20260902000100_phase_8_tutorials.sql`（生产第 26 个）；pgTAP 017（第 17 个）。

## 2. 已批准的产品决定（D1–D8）

1. **D1**：AI 生成候选 + 人工审核；审核人可从头创建。
2. **D2**：结构化步骤（每步标题/正文/0..5 个链接）；不引入自由 Markdown。
3. **D3**：链接存 `reference_id`，渲染时 join 7B 台账解析 URL；不存裸 URL。
4. **D4**：教程 `last_verified_at` = 最近一次人工核验决策；链接旁另渲染引用自身核验时间。
5. **D5**：安全触发 → `blocked`；内容触发 → `needs_review`；恢复必须人工新版本批准。
6. **D6**：canonical 当前行 + 追加式版本 + 追加式决策。
7. **D7**：每项目多篇、按 `tutorial_kind`（六类可参与类型）组织；`unique(project_id, kind)`。
8. **D8**：不做用户进度/watchlist/tasks/通知/多语言/富媒体/合约操作指引。

## 3. 任务看板

| Task | 交付物 | 状态 | 证据 / 关键提交 |
|---|---|---|---|
| 1 | 教程契约（enums/commands/projections/events + 候选 payload） | ✅ 完成（本地门禁绿） | 4 模块 + 4 测试文件；contracts 20 files / **207 tests**（+36）；lint/typecheck 绿；变异 2/2 killed（steps 下限 2→1、step body URL 守卫移除——均打在实现上）；index.ts 全量导出。**未访问数据库/远端/生产**。 |
| 2–10 | 见实施计划 | ⬜ 待执行 | — |

## 4. 执行记录

| 日期 | 阶段 | 内容 |
|---|---|---|
| 2026-09-02 | Task 1 RED→GREEN | RED：4 测试文件全部 `Cannot find module`（0 新用例执行，既有 171 全过）。实现 enums（kind 六类/status 六态/候选三态/决策四类/理由码九类/AT2xx 十码/联动触发器六类/outbox 两事件）、commands（steps 2..20、每步 links ≤5 仅 referenceId、**step 文本 schema 层拒绝裸 URL（http/https/www）**、四命令 strict versioned）、projections（公开 detail/list + 审核列表/detail + 三种游标；公开投影无裸 URL 列、无 candidate payload/note/reviewer 字段）、events（两事件仅安全键）。实现期修正：projections 补 `tutorialReasonCodeSchema` 导入；review detail fixture 补第二步（steps min 2 镜像已发布版本约束）。**变异检验 2/2 killed**：M1 steps min 2→1（2 用例失败）、M2 移除 body URL 守卫（1 用例失败）——均打在实现上并已还原。**教训复现**：①macOS BSD grep 不支持 BRE `\|`，多模式必须 `-E`（曾误报导出缺失）；②未跟踪文件 `git checkout --` 无法还原，变异还原需用反向替换。 |
