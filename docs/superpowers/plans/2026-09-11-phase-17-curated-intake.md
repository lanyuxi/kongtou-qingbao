# Phase 17 实施计划 — 审核员录入（Curated Intake）

- 状态：**待所有者确认**
- 设计规范：`docs/superpowers/specs/2026-09-11-phase-17-curated-intake-design.md`
- 日期：2026-09-11
- 基线：`138639e`（Phase 16 完成并上线）

---

## 0. 为什么做这个

Phase 16 的结论要如实复述一次：**DeFiLlama 没有空投端点**，链 TVL 换来的是新鲜度与生态上下文，不是机会条目。当前系统里**没有任何人能写一条机会** —— `sources` 无注册界面，canonical signal 只能由 AI 候选发布产生。

于是"让机会变多"的唯一可靠杠杆，就是给运营者一条**刻意录入**的通路。

---

## 1. 技术方案（一句话）

审核员填写项目/来源/信号，系统**用既有安全采集器真抓一次**产出 `raw_item`，审核员从原文中选取引文，最后由一个**受保护命令**在单一事务内写入 signal + evidence + link + 回执 + outbox。

三条不可让步：

1. **不放宽证据链** —— 不加"人工佐证"这类绕开 `raw_item_id` 的字段。抓不到就录入失败。
2. **事务内不调外部 API** —— 抓取与落库分两步。
3. **只读 AI 之外的所有既有约束** —— 评分、读模型、公开投影全部不动。

---

## 2. 文件级改动清单

### 任务 1 — contracts（命令与回执契约）

| 动作 | 文件 |
|---|---|
| 新增 | `packages/contracts/src/curation/commands.ts`（`curatedSignalCommandSchema` 等） |
| 新增 | `packages/contracts/src/curation/receipts.ts`（`curatedSignalReceiptSchema`） |
| 新增 | `packages/contracts/src/curation/enums.ts`（信号类型限定为六类可参与类型、CU2xx 错误码） |
| 新增 | `packages/contracts/src/curation/projections.ts`（准备步骤返回体） |
| 新增 | 对应 `*.test.ts` |
| 修改 | `packages/contracts/src/index.ts` |

### 任务 2 — domain（纯规则）

| 动作 | 文件 |
|---|---|
| 新增 | `packages/domain/src/curation/quote-locator.ts`（精确引文定位与归一化，`deterministic_exact_quote_v1` 的纯函数实现） |
| 新增 | `packages/domain/src/curation/verification-policy.ts`（§4.2 的 verified / corroborated / 拒绝 判定） |
| 新增 | 对应 `*.test.ts` |
| 修改 | `packages/domain/src/index.ts` |

### 任务 3 — 迁移与 pgTAP

| 动作 | 文件 |
|---|---|
| 新增 | `supabase/migrations/2026xxxx_phase_17_curated_intake.sql`（`curated_signal_commands` + 唯一幂等键 + 受保护命令函数 + revoke/grant + RLS） |
| 新增 | `supabase/tests/024_phase_17_curated_intake.test.sql` |
| 可能修改 | `packages/database/src/generated/database.types.ts`（须在云端用 typegen 校验，Phase 16 已有先例与漂移守卫） |

### 任务 4 — database（仓储与命令边界）

| 动作 | 文件 |
|---|---|
| 新增 | `packages/database/src/curation/curated-intake-repository.ts` |
| 新增 | `packages/database/src/tests/curated-intake-repository.test.ts` |
| 新增 | `packages/database/src/tests/curated-intake.integration.test.ts`（环境门控） |

### 任务 5 — BFF（受保护路由）

| 动作 | 文件 |
|---|---|
| 新增 | `apps/web/src/app/api/v1/review/curation/prepare/route.ts` |
| 新增 | `apps/web/src/app/api/v1/review/curation/publish/route.ts` |
| 新增 | `apps/web/src/lib/curation-api-client.ts` |
| 新增 | `apps/web/src/tests/curation-handlers.test.ts`（auth 先于校验、他人资源 404、幂等/版本码不混用） |

### 任务 6 — UI（`/review/curate`）

| 动作 | 文件 |
|---|---|
| 新增 | `apps/web/src/app/review/curate/page.tsx` |
| 新增 | `apps/web/src/components/curation/curate-form.tsx`、`.tsx`（引文选择器） |
| 修改 | `apps/web/src/components/app-shell.tsx`（导航项） |
| 新增 | `apps/web/src/tests/curation-components.test.ts` |

### 任务 7 — 文档与收口

| 动作 | 文件 |
|---|---|
| 新增 | `docs/tasks/phase-17-curated-intake-workbook.md` |
| 修改 | `docs/runbooks/local-development.md`（Phase 17 章节） |
| 修改 | `docs/HANDOVER.md` |

> 依赖：Phase 16 已把 `content_kind` 的严格枚举、漂移守卫测试与"五处一致"习惯建立起来，本 Phase 沿用同一套纪律。

---

## 3. 数据迁移风险

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| M1 | 新增表与受保护函数 | 低 | 纯追加；既有表零改动 |
| M2 | Supabase 默认 `PUBLIC EXECUTE` 把新函数变成匿名 RPC | **高** | 一律先 `revoke from public, anon, authenticated`，再按需 `grant`；pgTAP 断言匿名不可执行 |
| M3 | 受保护函数内做角色判断若写错会放过非审核员 | **高** | 复用既有 `actor_has_active_*` 模式；pgTAP 覆盖四个角色矩阵 |
| M4 | 抓取步骤若与事务耦合会长期持锁 | 中 | 设计上强制两步（准备/发布）；评审时逐行确认 |
| M5 | 引文归一化与既有 `evidence_quote_sha256_v1` 不一致 | 中 | domain 纯函数必须与 SQL 函数产出一致，用 pgTAP 与单测双向锁定 |
| M6 | 幂等键冲突被误当成功 | 中 | 同键异请求必须报冲突；回执表唯一索引兜底 |
| M7 | 生成类型漂移 | 中 | 复用 Phase 16 的漂移守卫模式，云端 typegen 后比对 |
| M8 | 历史数据被改写 | **无** | 本设计不回写任何既有行 |

---

## 4. 测试计划

- **contracts**：严格 schema（未知键拒绝）、六类信号类型边界、幂等键格式、错误码稳定。
- **domain**：引文定位（命中/未命中/空白/大小写/超长/跨行）、归一化确定性、`verified`/`corroborated`/拒绝 三种判定。
- **pgTAP `024`**：匿名不可执行、四角色矩阵、幂等重放与冲突、原子回滚（强制失败后无任何残留）、回执 append-only、RLS。
- **BFF**：认证先于校验、非审核角色 401/403 区分、他人资源 404 不 403、响应不含内部细节。
- **变异（每任务至少一类）**：把引文校验改成"包含即通过"→ 必须被 kill；把角色判断改成"登录即可"→ 必须被 kill；把幂等冲突改成静默成功 → 必须被 kill。
- **门禁**：`pnpm verify` 全绿；`pnpm check:placeholders` 通过。

---

## 5. 预计工期

| 阶段 | 内容 | 估计 |
|---|---|---|
| T1 | contracts | 3–4 h |
| T2 | domain | 3–4 h |
| T3 | 迁移 + pgTAP + 类型 | 4–5 h |
| T4 | database 仓储与命令边界 | 4–5 h |
| T5 | BFF | 3–4 h |
| T6 | UI | 5–7 h |
| T7 | 文档、门禁、独立审查与修复 | 4–6 h |
| **合计** | | **约 26–35 h ≈ 3–4 个工作日** |

比 Phase 16 重，因为它第一次引入**人写的权威事实**，安全边界（角色、审计、幂等）必须一次做对。

---

## 6. 明确不做

- `campaigns` 实体。
- `/hacks` → 安全台账。
- 通知/订阅。
- 任何放宽证据约束的"便利"路径。
- 生产写入 —— 照例需逐次显式授权。
