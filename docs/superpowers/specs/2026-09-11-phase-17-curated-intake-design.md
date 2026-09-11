# Phase 17 设计规范 — 审核员录入（Curated Intake）

- 状态：**待所有者确认**（本文件为设计提案，尚未编码）
- 日期：2026-09-11
- 前置：Phase 16 已完成并上线（JSON API 采集能力 + DeFiLlama 链 TVL）
- 依据：`AGENTS.md`、`docs/reviews/2026-09-10-independent-audit.md`、Phase 15/16 迁移与实现

---

## 1. 问题

机会列表只有 3 条，而 AI 提取**正确地**产出了极少的候选：现有 9 个源（3 官方 + 4 媒体 + 2 空投聚合）里没有真正的空投公告，剩余积压是生态综述、稳定币报告、更新日志与访谈。Phase 16 打通了链上数据 API，但 DeFiLlama 提供的是 TVL 与安全事件，**没有空投端点**（`/airdrops` 等全部 404）。

因此"更多机会"这条链路上的断点是：**没有任何人能往系统里写一条机会。**

现状事实（已核实）：

- `sources` 与 `project_sources` **没有注册界面** —— 今天只能直连数据库插入。
- 唯一能产生 canonical signal 的路径是 `promote_extraction_candidate` / `publish_candidate_with_evidence`，入口是 **`extraction_candidates` 表里的 AI 候选**。没有候选，就没有信号。
- 所以运营者即使知道一个真实空投，也**无法录入**。

## 2. 目标与非目标

**目标**

1. 让 `reviewer`（及以上）能**刻意地录入一条机会**：项目 + 来源 + 引文 + 信号，一步不省。
2. 录入结果必须**与 AI 候选发布的结果完全同构**：同样进 `signals`、同样有 `evidence`、同样可被评分、同样出现在机会列表。
3. 录入产物是**可核验的**：引文必须能在抓取到的原文里逐字找到。

**非目标（明确不做）**

- **不做 `campaigns` 实体**。`AGENTS.md` 的 Catalog 域列出了 campaigns，但库里没有这张表，Phase 8 的"六类可参与信号"实际上是用 `signals.signal_type` 表达的。引入 campaigns 是独立的大实体设计（窗口期、资格、奖励、领取），本 Phase 不碰。
- **不做第三方列表抓取/导入**。
- **不改评分算法**、不引入 AI。
- **不放宽任何证据约束**（关键，见 §4.1）。

## 3. 总体流程

```
审核员填：项目（已有/新建）+ 信号类型 + 标题 + 摘要 + 来源 URL
   │
   ├─ 第 1 步「准备」（异步，无事务）
   │    校验 URL（沿用 validateConfiguredCollectionUrl 的 DNS/重定向/协议策略）
   │    → 需要时建 sources + project_sources（curator 即 verified_by）
   │    → 用既有安全采集器抓取 → raw_items（content_kind = official_html）
   │    → 返回原文，供审核员选取引文
   │
   └─ 第 2 步「发布」（单一事务）
        create_curated_signal(...)
        → signals（verification=verified / lifecycle=published）
        → evidence（exact_quote，锚定刚抓到的 raw_item）
        → signal_evidence_links
        → curated_signal_commands（回执 + 幂等键）
        → outbox_events（版本化事件）
```

两个步骤必须分开：`AGENTS.md` 明确要求**事务期间不得调用外部 API 或模型**。

## 4. 关键设计决策

### 4.1 不放宽证据链 —— 而是真的去抓一次

`public.evidence` 的约束（迁移 `20260820000100:94-140`）：

- `raw_item_id` **NOT NULL**
- `quote_text` 长度 10–500，且两端无空白
- `normalized_quote_sha256` 必须是 64 位小写十六进制
- `verification_method` 恒为 `deterministic_exact_quote_v1`
- `source_field` 只能是 `article_raw_text` 或 `discovered_summary`

也就是说：**没有 raw_item 就没有证据。** 最省事的"人工录入"会想加一种 `operator_attestation` 来绕开它 —— **本设计拒绝这么做**，那会创造出一批无法追溯到原文的"权威事实"，正是产品红线所禁止的。

取而代之：审核员给的 URL 走**既有安全采集器**抓一次，产出真实 `raw_item`（`content_kind = official_html`），审核员从抓到的正文里选引文，服务端用 `deterministic_exact_quote_v1` 校验引文逐字存在于 `raw_text`。

代价：录入多一步"先抓后引"。收益：Evidence → Raw Item → Source 三段链条完整，与采集管线产出的证据完全同构。

> 若某个 URL 抓不到（403/超时/非 HTML），录入**失败并说明原因**，而不是降级为无证据发布。无证据的信号不会被评分，等于白录。

### 4.2 `verification = 'verified'`，但要有门槛

自动发布的 AI 候选写的是 `verification='unverified'`（见 `20260820000100:724`）。人工录入的意义恰恰在于**有人为它背书**，所以这里应写 `verified`。

但 `verified` 不是随便给的：

| 条件 | 结果 |
|---|---|
| 来源与项目的配对 `is_official = true` 且 `verified_at`/`verified_by` 非空，且引文通过精确校验 | `verified` |
| 配对非官方，但审核员填写了 `attestation`（说明为什么相信它） | `corroborated` |
| 无引文或未通过精确校验 | **拒绝写入**（不产生无证据的权威事实） |

### 4.3 角色与归属

- 仅 `reviewer` / `senior_reviewer` / `admin` 可执行；其余一律 fail-closed。
- 归属取 `auth.uid()`，不使用调用方传入的身份。
- 每次执行前重新校验角色是否 active（沿用既有 `actor_has_active_*` 思路），避免权限回收后仍能写入。

### 4.4 幂等与版本

- 命令带 `Idempotency-Key`：同键同请求精确重放（返回原回执），同键异请求报幂等冲突。
- `curated_signal_commands` 上 `idempotency_key` 唯一。
- 更正走 **`superseded` 生命周期 + 新版本**，不原地编辑（与既有信号历史语义一致）。

## 5. 数据模型

新增（纯追加，不改动任何既有表）：

| 对象 | 用途 |
|---|---|
| `public.curated_signal_commands` | 回执/审计：id、project_id、signal_id、source_id、raw_item_id、evidence_id、curator_user_id、idempotency_key、payload(jsonb)、created_at |
| `curated_signal_commands_idempotency_key_key` | 唯一索引，幂等基础 |
| `outbox_events` 新事件类型 | 版本化 `curated.signal.published`，仅携带对象引用/版本/类型 |

不新增 `collection_content_kind` 枚举值（抓取页面复用 `official_html`）。

## 6. 命令契约（`packages/contracts`）

- `curatedSignalCommandSchema`：project（已有 id 或新建的必要字段）、signalType（六类可参与类型之一）、title、summary、sourceUrl、quote、verification、attestation、expectedVersion、idempotencyKey。
- `curatedSignalReceiptSchema`：commandId、projectId、signalId、sourceId、rawItemId、evidenceId、verification、outcome。
- `preparedSourceSchema` / `preparedQuoteSchema`：第 1 步返回的原文与候选引文。
- 错误码：`CU2xx`（未授权、证据未通过、抓取失败、幂等冲突、版本冲突、角色失效）。

## 7. 安全与约束

- 抓取复用现有网络策略：HTTPS、禁止 IP 字面量与显式端口、重定向逐跳校验、响应体上限 2 MiB、超时受控。
- 浏览器侧只拿 anon key 与用户会话；命令在数据库受保护函数内执行，不开放对 `signals` / `evidence` 的直接 DML。
- 新建的受保护函数一律 `revoke ... from public, anon, authenticated` 后再按需 `grant`（2026-09-10 审查的既有教训：Supabase 默认 `PUBLIC EXECUTE` 会把函数变成匿名 RPC）。
- RLS：仅本人/审核角色可读自己的回执；公开面只看已发布信号（既有读模型不变）。

## 8. 验收标准

1. 审核员可在界面完成一次完整录入，产出 `verification=verified`、带 `evidence` 的已发布信号。
2. 该信号与 AI 发布的信号在下游完全同构：出现在情报页、可被评分、可进入机会列表。
3. 非审核角色调用任何一步均被拒绝；幂等与版本冲突返回稳定码。
4. 引文未逐字命中原文时**拒绝写入**，而不是静默降级。
5. `pnpm verify` 全绿；新增 pgTAP 覆盖 RLS、角色、幂等、原子回滚、append-only。
6. 不触碰既有数据；迁移纯追加。

## 9. 明确排除

- `campaigns` 实体（独立设计）。
- `/hacks` → 安全台账（Phase 7A 链路，独立设计）。
- 通知/订阅（Notification 域仍为空，独立设计）。
