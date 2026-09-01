# Phase 8 Tutorials（参与教程）— 设计规范

> 状态：**Approved**（2026-09-02，所有者采纳提案 D1–D8 全部推荐项；提案 `2026-09-01-phase-8-tutorials-design-proposal.md`）
> 前置：Phase 7B 已合并主线（`f723457`）；生产 rollout 已完成（25 migrations / auth 200 / reviewer 已供给，2026-09-02）

## 1. Goal

把已核验的空投情报变成可执行的参与指导。围绕六类"可参与"信号（airdrop_campaign / points_program / snapshot_notice / task_launch / token_launch / eligibility_rule）生成结构化步骤教程，经人工审核后公开发布。三条不可 violated 的产品事实：

1. 教程内的每个链接都解析自 Phase 7B 已验证引用台账——**用户永远不可能从教程点进未验证目的地**；
2. 教程暴露机器可读的 `last_verified_at`，且来源/引用/安全状态变化**同步**联动教程状态；
3. AI 只产出候选，canonical 教程只能由持角色审核人形成。

## 2. Approved Product Decisions（D1–D8，2026-09-02 所有者采纳）

| # | 决策 | 采纳内容 |
|---|---|---|
| D1 | 生产模式 | AI 生成候选 + 人工审核；审核人也可在 `/review/tutorials` 从头创建（与 7B 登记模式一致） |
| D2 | 结构 | 结构化步骤：每教程 = 有序步骤列表，每步 = 标题 + 正文 + 0..n 个链接；**不引入自由 Markdown 正文** |
| D3 | 链接绑定 | 步骤链接存 `reference_id`（对 7B 台账的引用），渲染时 join 台账解析 URL；**不存裸 URL** |
| D4 | 核验时间 | 教程 `last_verified_at` = 最近一次人工核验（approve）决策时间；每个链接旁另渲染该引用自身的 `last_verified_at` |
| D5 | 联动宽严 | 安全类触发 → `blocked`；内容类触发 → `needs_review`；从 `blocked` 恢复必须经人工重新批准 |
| D6 | 版本模型 | canonical 当前行 + 追加式版本历史 + 追加式决策历史（与 6B/7B 同构） |
| D7 | 首版范围 | 每项目多篇、按机会类型（`tutorial_kind`）组织；`unique(project_id, kind)`；不做系列/多语言 |
| D8 | Non-Goals | 用户进度 / watchlist / tasks / 通知 / 多语言 / 富媒体 / 合约地址操作指引 / 生产 rollout（另行执行） |

## 3. Non-Goals

- 用户进度跟踪、user_projects、watchlist、tasks、task history（Execution 其余部分，后续 Phase）
- 通知系统（alerts/deliveries）
- 多语言、富媒体（图片/视频嵌入）
- 合约地址、链上交易签名类操作指引（7B 已排除合约地址，教程同样排除）
- 教程间关联/系列/课程树
- AI 自动发布（任何 AI 输出只能到 candidate）

## 4. Existing State and Required Integration Points

| 设施 | 集成方式 |
|---|---|
| 7B `public_project_references`（verified-only、granted 门禁、blocked 项目过滤） | 步骤链接解析的唯一来源；`reference_id` 稳定、`url`/`last_verified_at` 为投影 |
| 7B `reference_security_flags`（未释放 flag 强制渲染失效） | 引用被 flag → 引用它的教程步骤链接失效 + 教程 `needs_review` |
| 7A posture（project blocked / source blocked） | 项目 blocked → 教程 `blocked`；来源 blocked → 引用其证据的教程 `needs_review` |
| 6A Evidence 门禁与 `signal_verification` | 教程素材只取 `verification in ('verified','corroborated')` 且 lifecycle 未撤回的信号；信号 disputed/retracted → 教程 `needs_review` |
| AI 编排循环（Phase 5） | 教程生成器注册为新编排 tick（模式同 extract/scoring） |
| 审核骨架（6A/6B/7B 的 candidate + 受保护命令 + 回执 + 审计 + outbox） | 教程审核全套复用同构骨架；错误码启用 `AT2xx` 段 |
| RLS/会话（7B reviewer 会话与 `auth.uid()` 复核） | 审核命令逐次复核 bearer 与 active reviewer/senior_reviewer/admin |

## 5. Trust Boundaries and Invariants

1. **不变式 I-1（链接安全）**：公开渲染的教程步骤中不存在任何不解析自 `public_project_references` 的 URL。步骤链接以 `reference_id` 存储；URL 仅在渲染时由台账投影提供。
2. **不变式 I-2（候选边界）**：AI 生成器的输出只能成为 `tutorial_candidates` 行；模型只允许从**输入中提供的** `reference_id` 列表中选择，不得发明 URL 或 id（与 7B"模型只选 id"同款约束）。
3. **不变式 I-3（同步联动）**：任一联动触发发生后的下一次公开读取，不得再看到应失效的链接或应隐藏的教程——blocked 走视图实时判定，needs_review 走触发器同步写状态。
4. **不变式 I-4（人工闸门）**：`draft → published`、`needs_review → published`、`blocked → published` 三条边都只能由持角色审核人的显式决策驱动；系统触发只能把状态**降级**。
5. **不变式 I-5（版本不可变）**：`tutorial_versions` 行一旦写入不可修改；公开页渲染当前 `published` 版本的快照。
6. 教程状态机不修改 projects、signals、scores、references 等任何其他模块的表。

## 6. Shared Contracts（`packages/contracts/src/tutorials/`）

- `tutorialKindSchema` = 六类可参与类型枚举（`airdrop_campaign|points_program|snapshot_notice|task_launch|token_launch|eligibility_rule`）。
- `tutorialStatusSchema` = `draft|in_review|published|needs_review|blocked|retired`。
- `tutorialCandidatePayloadSchema`（strict，AI 结构化输出 v1）：
  `title(5..200)`、`summary(10..2000)`、`steps[2..20]`（每步 `title(3..120)`、`body(10..1000)`、`links[0..5]`＝`{ referenceId: uuid }`）、`sourceSignalIds: uuid[]`（1..10，素材信号）、`confidence(0..100)`。**payload 中不允许出现任何 URL 字段**（URL 只能由台账解析，模型无 URL 概念）。
- 命令 v1（全部携带 `expectedVersion` 与 `idempotencyKey`）：`submitAcceptTutorialCandidate`、`submitRejectTutorialCandidate`、`submitPublishTutorialVersion`（含可选步骤编辑后的 steps）、`submitRetireTutorial`。candidate 接受即形成新版本并发布（`draft` 不落地为长期状态，接受即发布，避免僵尸 draft）。
- 投影 schema：公开教程（含 steps 与 resolved links：`referenceId/url/label/lastVerifiedAt/renderable`）、审核列表/详情（含候选 payload、决策历史、状态事件）、游标（`(updated_at desc, id desc)` 与 `(published_at desc, id desc)` base64url）。
- 错误码 `AT2xx`（Airdrop Tutorial，数值段实现时核对唯一性）：`tutorial_reviewer_required` / `tutorial_not_found` / `tutorial_not_decidable` / `tutorial_version_conflict` / `tutorial_idempotency_conflict` / `tutorial_command_invalid` / `tutorial_reference_not_allowlisted`（候选引用了输入清单之外的 referenceId）/ `tutorial_reference_not_renderable`（批准时引用已不可渲染）/ `tutorial_steps_invalid` / `tutorial_persistence_failed`。
- outbox 事件：`tutorial.published.v1`、`tutorial.status_changed.v1`（7B 事件白名单逐字保留，追加 2 个）。

## 7. Database Model（迁移 26：`20260902000100_phase_8_tutorials.sql`）

七张表 + 两个视图（全部 RLS；执行域）：

```
tutorials                         canonical 当前行
  id, project_id→projects, kind tutorial_kind, status tutorial_status
    default 'in_review', version int not null default 0,
  title, summary, last_published_version int null,
  last_verified_at timestamptz null,           -- 派生：最近一次 approve 决策
  created_at, updated_at
  unique (project_id, kind)

tutorial_versions                 追加式、不可变版本
  id, tutorial_id→tutorials, version int, steps jsonb not null,
  content_hash text, created_at, created_by uuid
  unique (tutorial_id, version)

tutorial_step_links               版本作用域的链接绑定（联动主干）
  id, tutorial_id, version_id→tutorial_versions, step_ordinal int,
  reference_id→project_references,
  unique (version_id, step_ordinal, reference_id)

tutorial_candidates               AI/人工提议（append-only）
  id, project_id, kind, payload jsonb, source_signal_ids uuid[],
  status (pending|accepted|rejected), model_run_id null, created_at

tutorial_review_decisions         审核决策（append-only）
  id, tutorial_id null, candidate_id null, decision, reason_code,
  note null(≤1000), aggregate_version, reviewer uuid, idempotency_key,
  created_at

tutorial_review_commands          命令回执（6A/7B 同构）
tutorial_status_events            系统联动事件（append-only：trigger/ref/from/to）
```

RLS：`tutorials`/`tutorial_versions`/`tutorial_step_links` 匿名仅 `status='published'` 且项目 posture ≠ blocked 可 SELECT；全部写操作只经受保护函数（`revoke all from public, anon, authenticated`，函数内复核 `auth.uid()` + active reviewer/senior_reviewer/admin——7B 同款）。审核读 RPC bearer-scoped（7B Task 4 同款边界）。

## 8. Candidate Ingress and Review Flow

1. **生成**：worker 编排新 tick 扫描「有 ≥1 条 verified/corroborated 可参与信号、且尚无同 kind 教程/候选」的项目 → 组装生成输入（信号摘要 + 该项目 `public_project_references` 的 `reference_id/label` 白名单 + 素材信号的 Evidence 摘要）→ 模型结构化输出 → strict parse → 写 `tutorial_candidates`（幂等键：项目+kind+素材信号集合 hash）。
2. **候选边界**：生成管道对 payload 做三重校验——schema strict、`referenceId ∈ 输入白名单`（否则 `tutorial_reference_not_allowlisted` 丢弃该步/该候选）、步数与长度界限。
3. **审核**：`/review/tutorials` 列表/详情；`accept`（可先编辑 steps）→ 单事务内：写版本 + step_links（逐条校验引用当前 renderable，任何一条不可渲染则整单拒绝 `tutorial_reference_not_renderable`）→ 教程行 upsert（version+1，status=published，last_verified_at=now）→ outbox `tutorial.published.v1`；`reject` → 候选关闭。
4. 人工从头创建 = 同一 accept 命令的手工 payload 入口（D1）。

## 9. Status Coupling（D5 矩阵，全部同步）

| 触发 | 机制 | 结果 |
|---|---|---|
| 项目 posture → blocked | 公开视图实时 join 姿态（参照 7B）+ 7A 状态变更触发器写 `status='blocked'` + status_event | 教程退出公开；恢复需人工重新批准 |
| 来源 blocked | 7A 来源阻断事件触发器 → 引用其证据的教程 `needs_review` + event | 内容待复核 |
| 引用被 flag/withdraw（7B 已有触发器处追加） | `tutorial_step_links` 反查 → 教程 `needs_review` + event | 失效链接由视图实时隐藏（join 不中即「暂不可用」） |
| 素材信号 disputed/retracted | signals 触发器 → 教程 `needs_review` + event | 内容待复核 |
| 项目 lifecycle 变化 | projects 触发器 → `needs_review` + event | 内容待复核 |
| 触发清除（来源/项目解除） | 不自动恢复；`needs_review` 的人工重新批准是唯一回归 `published` 的路径（protect-first） | — |

`blocked → published` 与 `needs_review → published` 都必须产生**新版本**（人工重新批准）。

## 10. Idempotency, Concurrency, Transaction Semantics

- 全部命令幂等键 + `expected_version`；replay 返回原回执；版本冲突 `tutorial_version_conflict`。
- accept 命令单事务：候选状态翻转 + 版本 + step_links + 教程行 + outbox——同 7B「canonical 写入与 outbox 同事务」。
- 生成 tick 幂等：`unique(project_id, kind)` + 素材信号集合 hash 防重复候选。
- 联动触发器与审核命令并发：教程行行锁（7B shared-lock 先例）；触发器只降级状态、不与人工升级冲突。

## 11. Synchronous Enforcement

- 公开视图 WHERE：`status='published' AND NOT project_blocked AND every step link renderable`——链接渲染性逐条 join `reference_is_publicly_renderable_v1` 口径，任一步引用失效不影响其他步骤（失效链接在详情里渲染「暂不可用」条目）。
- 铁律 I-1 由**视图结构**保证：公开投影根本没有裸 URL 列，URL 全部来自 join。

## 12. Public Read Models

- `public_project_tutorials`：每项目已发布教程列表（kind/title/summary/last_verified_at/step 数）。
- `public_tutorial_detail`：单教程全量（steps 有序 + 每链接 `url/label/last_verified_at/renderable`）。
- 匿名只读；blocked/needs_review/retired 不出公开投影。

## 13. Repositories and HTTP Boundaries

- `packages/database`：`tutorial-review-repository`（bearer，审核读/命令，`AT2xx` 映射）、`tutorial-public-repository`（匿名安全读，严格键集 + 项目作用域校验，6B/7B 同款）、browser-denied 导出边界。
- BFF：`/api/v1/review/tutorials`（GET 列表 / POST accept·reject）、`/api/v1/review/tutorials/[id]`（GET）、`/api/v1/tutorials/[id]`（公开 GET）；页面边界 `safeParse` 游标。

## 14. Reviewer User Interface

`/review/tutorials`（候选队列 + 已发布列表 + 状态过滤）、`/review/tutorials/[candidateId|tutorialId]`（详情：候选 payload 只读、步骤可编辑后批准、决策历史、状态事件时间线、高影响确认绑定 `{id, version}`、409 清确认——Task 8 全套先例照搬）。导航入 `review-shell`。

## 15. Public User Interface

项目详情页新增「参与教程」卡（`public_project_tutorials`）；`/tutorials/[id]` 全文（步骤序号、每步链接按钮 + 引用 `last_verified_at`、失效链接显式「暂不可用」、教程级 `last_verified_at`）。全部文案简体中文。

## 16. Authorization, RLS, and Privileges

匿名：公开两视图只读。authenticated 普通用户：无额外权限。reviewer/senior_reviewer/admin：审核 RPC（函数内逐次复核）。服务端写路径仅受保护函数；`ai_stage_worker` 仅可 INSERT `tutorial_candidates`。

## 17. Error and Security Behavior

`AT2xx` 全表 + HTTP 映射（401/403/404/409/422/500）沿用 7B 边界；注入/越权文本一律惰性渲染；候选 payload 是不可信数据（Golden Dataset 覆盖：注入指令、幻觉 referenceId、越权字段、跨项目 id、否定/过时素材）。

## 18. Testing Strategy

契约 strict → domain 纯规则（联动矩阵、白名单校验、版本派生）→ pgTAP（017：表/RLS/命令/幂等/联动矩阵逐行/公开门禁）→ repository（单测 + disposable 集成）→ BFF → 审核 UI → 公开页 → **Golden Dataset（教程生成边界）** → runbook → disposable 矩阵 → 合并。变异检验每个 Task 必做；「I-1 链接不变量」与「I-3 同步联动」须有实现级变异证明。

## 19. Delivery Boundaries

本地完成 ≠ 生产部署。生产应用 Phase 8 迁移（第 26 个）仍需：迁移前备份（沿 `/root/backups/` 惯例）、Auth/REST 健康、显式授权。生产 web 应用持久化部署为独立事项（当前无持久 web 进程）。

## 20. Acceptance Criteria

1. 公开教程的每一个链接都解析自已验证引用台账（实现级变异证明 I-1）。
2. AI/采集路径最多产出候选；candidate → published 必经持角色人工决策。
3. 步骤链接存 `reference_id`；公开投影无裸 URL 存储列。
4. D5 联动矩阵逐行有 pgTAP 证明且全部同步生效。
5. `blocked/needs_review → published` 只经人工新版本批准。
6. `last_verified_at` 两级暴露（教程级 + 链接级）且机器可读。
7. 生成器越权/注入/幻觉链接被 Golden Dataset 拒绝（变异证明区分力）。
8. full pgTAP + integration + `pnpm verify` 全绿；HANDOVER/workbook 区分本地完成与生产部署。
