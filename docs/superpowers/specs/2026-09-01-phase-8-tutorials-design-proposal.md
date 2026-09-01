# Phase 8 教程生成（Tutorials）— 设计提案

> **状态：PROPOSAL（待所有者决策）** — 本文档是设计提案，非定稿规范。§5 的八个决策点（D1–D8）需要所有者逐项拍板；确认后按 Phase 7B 流程把本文扩写为定稿规范（含完整数据模型 / RLS / 状态矩阵），再出实施计划。
> 日期：2026-09-01 · 前置：Phase 7B verified allowlisted references 已完成并合并主线（`f723457`）· 生产未部署

## 1. 背景与目标

Phase 7B 的交付说明里写明：**7B 是 tutorials 开始前的最后一环**。在 canonical 引用台账存在之前，教程无法满足 `AGENTS.md` 的硬约束——

> Tutorials must expose `last_verified_at`, use allowlisted link references, and become `needs_review` or `blocked` when their source, contract, eligibility, or security state changes.（AGENTS.md L19）

现在这一环已补齐：引用台账提供「可公开渲染的链接」单一判定点（`reference_is_publicly_renderable_v1`），安全覆盖层提供项目/来源姿态，Evidence 链提供内容溯源。教程的目标：

1. **把已核验的情报变成可执行的参与指导**——围绕 `airdrop_campaign` / `points_program` / `snapshot_notice` / `task_launch` / `token_launch` / `eligibility_rule` 六类已核验信号，生成"该项目怎么参与"的步骤化教程；
2. **链接永远不可能指向未验证目的地**——教程内的链接不是裸 URL，而是对 7B 引用台账的引用；
3. **内容时效性与安全状态自动联动**——来源/合约/资格/安全任一变化，教程自动进入 `needs_review` 或 `blocked`，绝不静默过期。

## 2. 硬约束（AGENTS.md 摘录，不可协商）

| 约束 | 来源 | 对教程的含义 |
|---|---|---|
| AI 只能产出候选数据，不得直接写入 verified tutorials | L15 | 教程走「AI 候选 → 人工审核 → canonical」，与 6A promotion、7B reference 同模式 |
| 暴露 `last_verified_at` | L19 | 教程与每个链接都要有机器可读的核验时间 |
| 链接必须来自 allowlisted references | L19 | 教程不得存储裸 URL 作为链接；只能引用已验证引用条目 |
| source / contract / eligibility / security 状态变化 → `needs_review` 或 `blocked` | L19 | 需要一张明确的联动矩阵，且必须**同步**生效（7B 的同步联动先例：无后台任务） |
| `apps/worker` 拥有 tutorial generation | L26 | 生成器是 worker 内的 AI 编排阶段，复用既有 orchestrator |
| 追加式历史；更正用新版本 | 数据库约定 | 教程需要版本化，不得原地改写已发布内容 |
| Execution 模块拥有 tutorials | L40 | 新表落在 execution 域，不混入其他模块；跨模块只经服务接口 |

## 3. 现状与集成点（已核对仓库）

| 既有设施 | 对教程的作用 |
|---|---|
| 7B `public_project_references`（verified + granted 门禁 + 非 blocked 项目过滤） | **链接白名单的唯一来源**；每条带 `last_verified_at` |
| 7B `reference_security_flags` 同步联动 | 引用被 flag/withdraw 时，引用它的教程步骤必须同步失效 |
| 7A `public_project_security_state` / source posture | 项目或来源 blocked → 教程 blocked |
| 6A Evidence 门禁 + `signal_verification`（unverified/corroborated/verified/disputed/retracted） | 教程素材只取 `verified`/`corroborated` 信号；信号 disputed/retracted → 教程联动 |
| 抽取管线 9 类 claimType | 六类"可参与"类型是教程素材；`security_risk`/`scam_indicator` 不是教程素材而是联动触发器 |
| AI 编排循环（Phase 5，`ai_stage_worker`） | 教程生成作为新的编排 tick，复用退避/毒物防护/幂等模式 |
| 审核模式（6A promotion、6B failed-run、7B reference） | 复用「candidate 队列 + 受保护命令 + 回执 + 审计 + outbox」全套既有骨架 |
| 数据库 | **execution 域目前为零表**——教程是第一个 execution 落地，需要从零建表 |

## 4. 推荐方案草图

### 4.1 数据模型（示意，定稿时细化）

```
tutorials                          教程当前行（canonical，版本化）
  id, project_id, kind, status(draft|in_review|published|
  needs_review|blocked|retired), version, title, summary,
  last_verified_at(派生：最近一次人工核验决策), created_at, updated_at

tutorial_versions                  追加式版本历史（每次发布形成新版本，不可变）
  id, tutorial_id, version, steps(jsonb，结构化步骤), content_hash,
  published_at, published_by

tutorial_steps                     步骤规范化展开（每步可独立联动）——是否单独建表见 D2
  id, tutorial_id, version_id, ordinal, title, body,
  (每步的链接存 step_links，见下)

tutorial_step_links                步骤 ↔ 引用台账的引用关系（白名单绑定点）
  id, step_id, reference_id  →  渲染时 join public_project_references 解析 URL
                                引用不可渲染 → 该链接渲染为「暂不可用」，绝不输出裸 URL

tutorial_candidates                AI 生成候选（append-only，含严格 payload schema）
tutorial_review_decisions          审核决策（append-only：submit/edit/approve/reject/…）
tutorial_review_commands           命令回执（幂等键、expected_version）
tutorial_status_events             状态联动事件（哪个触发源、何时、什么变化）——审计与排障
```

### 4.2 生成与审核流

```
已发布 verified/corroborated 信号（六类可参与类型）
        │  worker 新编排 tick（教程生成器）
        ▼
tutorial_candidates（AI 结构化输出：标题/摘要/步骤/每步引用的 referenceId）
        │  生成约束（prompt + schema 双重）：链接只能从该项目的
        │  public_project_references 现有条目中选 id，模型无权发明 URL
        ▼
/review/tutorials 人工审核（复用 reviewer/senior_reviewer/admin）
        │  approve（可编辑后批准）→ 形成新 tutorial_version 并发布
        ▼
tutorials.published + tutorial_step_links 绑定台账
        │
        ▼
公开教程页（匿名可读，走状态门禁投影）
```

### 4.3 状态联动矩阵（推荐草案，定稿时逐条给出 pgTAP 证明）

| 触发源 | 动作 | 生效方式 |
|---|---|---|
| 项目被 7A blocked | 教程 → `blocked`（退出公开） | 同步（视图判定，参照 7B） |
| 来源被 blocked | 引用该来源证据的教程 → `blocked` | 同步 |
| 步骤引用的 reference 被 flag/withdraw | 该链接渲染为「暂不可用」；整篇 → `needs_review` | 同步 |
| 素材信号 disputed/retracted | 教程 → `needs_review` | 同步 |
| 项目生命周期/lifecycle 变化 | 教程 → `needs_review` | 同步 |
| `official_website_url` / eligibility 相关信号更新 | 教程 → `needs_review` | 同步 |

实现取向：`blocked` 走视图判定（先例：7B 的 `reference_is_publicly_renderable_v1`）；`needs_review` 由触发事件写状态（需要在触发点挂事件/触发器，7B 的 indicator→flag 触发器是同款先例）。

### 4.4 公开面与授权

- 公开：项目详情页新增「参与教程」入口 + `/tutorials/[id]`；匿名可读；每步链接旁显示该引用的 `last_verified_at`。
- 审核：`/review/tutorials`（候选队列 / 详情 / 决策），复用既有 reviewer 会话与 `review-shell`。
- RLS：匿名只读 published；审核操作走 bearer + 受保护命令（先例照抄）。

## 5. 需要所有者拍板的八个决策点

### D1. 教程内容的生产模式
- **A. AI 生成候选 + 人工审核（推荐）**——复用既有 candidate 骨架，符合 L15；人工也可在 `/review` 从头创建（同 7B 的登记模式）。
- B. 纯人工编写——不利用既有 AI 管线，生成效率低。
- **推荐 A**。理由：AGENTS.md L26 明确 worker 负责 tutorial generation；candidate 模式已有三轮实战先例。

### D2. 教程的结构化程度
- **A. 结构化步骤（推荐）**——每步有标题/正文/0..n 个链接，链接才能逐条绑定台账；联动也能精确到步。
- B. 自由 Markdown——无法白名单化正文中的 URL（L19 不可满足），放弃。
- **推荐 A**。这是铁律 L19 的直接推论：自由文本里的链接没有白名单抓手。

### D3. 链接绑定语义（本提案最关键的技术决策）
- **A. 存 `reference_id` 引用（推荐）**——渲染时 join 台账解析 URL；引用 reverify 更新 URL 时教程自动跟随；引用 flag/withdraw 时自动失效。
- B. 存裸 URL、渲染时校验——URL 会随 reverify 变化，存值必然过期；且等于把台账降级为黑名单比对。
- **推荐 A**。7B 台账的 `reference_id` 是稳定标识，`url` 是可变投影——这个分层正是为此准备的。

### D4. `last_verified_at` 的派生
- **A. 教程自身最近一次人工核验决策时间（推荐）**——与 7B 同语义；教程内容被重新 approve 时推进。
- B. 取所引引用的最新核验时间——引用核验 ≠ 教程内容核验，语义混淆。
- **推荐 A**；同时每个链接旁渲染引用自身的 `last_verified_at`（7B 已有），两级时间都暴露。

### D5. 状态联动矩阵的宽严
- **A. 安全→blocked、内容→needs_review（推荐）**——protect-first：安全事件宁可下线；内容过时降级为待复核而非下线。
- B. 全部 blocked——过严，会把"素材更新了"误伤为下线。
- C. 全部 needs_review——违反 protect-first 精神。
- **推荐 A**。与 7A/7B 的 protect-first 取向一致。

### D6. 版本模型
- **A. 当前行 + 版本历史 + 决策历史（推荐）**——教程发布即固化新版本；`needs_review` 修订批准后生成下一版本；公开页永远渲染当前 published 版本。
- B. 原地可变——违反追加式约定。
- **推荐 A**。与 6B/7B 的「canonical 当前行 + append-only 历史」完全同构。

### D7. 首版范围
- **A. 每项目多篇教程：按机会类型组织（推荐）**——一个项目可同时有 airdrop 教程 + points 教程；列表页按项目聚合。
- B. 每项目仅一篇——限制表达；六个 claimType 天然是多篇。
- **推荐 A**；首版不做教程间关联/系列，不做多语言（内容本身已是中文）。

### D8. 明确不做（本阶段 Non-Goals，请确认）
- 用户进度跟踪 / user_projects / watchlist / tasks / task history（Execution 其余部分，留后续 Phase）
- 通知（alerts）——教程上新/状态变化的通知留 Notification Phase
- 教程的多语言 / 富媒体（图片/视频）
- 合约地址类操作指引（7B 已排除合约地址，教程同样不提供链上操作签名指导）
- 生产 rollout（独立决策，四前置不变）

## 6. 测试与交付取向（预览）

- 契约 strict schema（候选/命令/投影）→ domain 纯规则（联动矩阵、白名单解析）→ 迁移 + pgTAP → repository → BFF → 审核 UI → 公开页 → **Golden Dataset（教程生成的注入/越权/幻觉链接用例）** → runbook → disposable 矩阵 → 合并。全程复用 Phase 7B 已验证的交付骨架。
- 变异检验与"链接永不指向未验证目的地"的不变量测试是本 Phase 的安全主轴。

## 7. 下一步（决策确认后）

1. 所有者对 D1–D8 逐项拍板（可整体采纳推荐项）；
2. 据此把本提案扩写为定稿规范（Phase 7B 同款 20 节结构，含完整数据模型、RLS、联动矩阵、错误码 `AT2xx`、pgTAP 矩阵）；
3. 出实施计划（预计 9–11 个 Task）；
4. 按 Task 推进，disposable 验收与合并沿用已沉淀流程。
