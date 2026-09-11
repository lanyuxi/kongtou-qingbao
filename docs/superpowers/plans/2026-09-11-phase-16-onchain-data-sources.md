# Phase 16 技术方案 — 接入链上数据 API（DeFiLlama，免费无 key）扩充数据源

- 状态：**待所有者确认**（本文档即第一阶段交付物；确认后才进入编码）
- 日期：2026-09-11
- 基线：主线 `codex/phase-0-1-foundation` / HEAD `91368ca`（= `origin/main`）
- 依据：`AGENTS.md`（产品红线与工程约束）、`docs/HANDOVER.md`、`.workbuddy/memory/MEMORY.md`、`docs/reviews/2026-09-10-independent-audit.md`

---

## 0. 背景：为什么是"换数据形态"

2026-09-11 的盘点结论（`.workbuddy/memory/2026-09-11.md`）：

- 已接入 9 个 RSS 源（3 官方 + 4 媒体 + 2 空投聚合），**公开可用的空投 RSS 已到极限**：实测 20+ 个候选源，唯一新的可用源是 `airdropalert.com/feed/`，且早已接入。
- 消化 100 条积压后 **候选增加 0**。剩余积压内容是生态综述、稳定币报告、更新日志、访谈 —— **本身不含空投机会**，AI 提取 0 候选是正确判断。
- 因此：**靠加 RSS 源扩量已到头，只能换数据形态**（链上/市场数据 API，或人工录入）。

本 Phase 要做的，是把"链上数据 API"这条路打通。

### 0.1 对交付价值的诚实判断（请所有者先读这一段）

先做过的实测（2026-09-11，走本机代理）：

| DeFiLlama 端点 | 结果 |
|---|---|
| `GET /v2/chains` | 200，64 KB，467 条链（`gecko_id` / `name` / `tvl` / `tokenSymbol` / `chainId`） |
| `GET /v2/historicalChainTvl/{chain}` | 200，120 KB，3272 个时间点，末点 `tvl` 与 `/v2/chains` 一致 |
| `GET /charts/{chain}` | 200，174 KB，3272 个时间点（`totalLiquidityUSD`，口径与 `/v2/chains` 不同） |
| `GET /hacks` | 200，343 KB，1263 条安全事件（`date`/`name`/`technique`/`amount`/`chain`/`source`） |
| `/airdrops`、`/v2/airdrops`、`/airdrops/list` 等 | **404 —— DeFiLlama 公开 API 没有空投列表端点** |

**结论（必须说清）**：DeFiLlama 提供的是**生态健康度（TVL）与安全事件**，**不是空投机会清单**。链 TVL 类条目大概率仍会被 AI 提取判为"非机会"（与当前生态综述的处境相同）。

所以本 Phase 的真实产出是两件：

1. **可复用的 JSON API 采集能力**（真正的"扩充数据源"基础设施）—— 有了它，后续任何 JSON 数据源都只需加一个纯函数适配器。
2. **DeFiLlama 链 TVL 作为第一个落地的真实 JSON 源**，提供**秒级/小时级新鲜度**（RSS 是发布式的，分钟到小时级延迟）与项目生态上下文。

若所有者的目标是**更多空投机会条目**，本 Phase 之后更该做的是"人工录入/审核录入入口"与空投专属数据源；本方案第 7 节列出了这些后续选项，供一并决策。

---

## 1. 必须先修的两个基线缺陷（P0，阻塞任何新开发）

**现状：主线 HEAD `91368ca` 自身门禁是红的。** 两个缺陷相互独立，都必须先修（独立提交，不计入 Phase 16 的功能范围）。

### 1.1 一个临时脚本被提交进了仓库，导致 lint 失败

- 证据：`packages/database/.tmp-test-roles.cjs`，**已被 `53704f3` 提交进 git**（`git ls-files` 可查）。
- 影响：`pnpm verify` 在第一步 lint 即失败（ESLint 6 errors：`no-require-imports` ×2、`no-undef` ×4），**后续 typecheck/build/test/placeholder 根本没跑到**。
- 安全性：该文件**不含硬编码凭据**（从 `/tmp/worker_role_passwords.json` 读），未造成口令泄露；但它出现在公开 GitHub 仓库里，且破坏了门禁。
- 修法：`git rm` 该文件；`.gitignore` 增补 `.tmp-*` 与 `*.tmp.*`，避免再次发生。

### 1.2 正文抓取预算 20→35，但契约与数据库约束没跟上（真实生产缺陷）

- 证据链：
  - `packages/domain/src/collection/content-policy.ts`：`MAX_ARTICLE_FETCHES = 35`
  - `packages/contracts/src/collection/source-collection.ts`：`bodyFetchCount: z.number().int().min(0).max(20)`
  - `supabase/migrations/20260812000800_source_collection.sql:135-137`：`constraint collection_attempts_body_fetch_count_valid check (body_fetch_count between 0 and 20)`
  - 失败测试：`apps/worker/src/collection/tests/collect-source.test.ts:445`（断言仍是 `bodyFetchCount: 20`）
- 机制（已用探针实测确认，非推测）：一次采集里 eligible 条目 > 20 时，`bodyFetchCount = 35`：
  1. 契约 `collectSourceResultSchema.parse()` 抛 `ZodError`；且
  2. 即使绕过契约，`collection_attempts.body_fetch_count` 的 CHECK 也会拒绝写入 → `commitFeed` 事务整体回滚；
  3. 外层 catch 把整次采集记为 **`persistence_failed`**，**该批 raw_item 与全部 discoveries 一起丢失**。
- 影响面：**任何一轮新增条目超过 20 条的 feed 都会失败**。这很可能就是既有观察到的"媒体源偶发 dead-letter""Ethereum 源反复失败"的根因之一（`raw_items` 79 条、`discovered_items` 329 条的现状说明采集确实在部分失败）。
- 修法（推荐 A）：把上限统一对齐到 35，并**抽出共享常量**避免再次漂移：
  - 契约改为引用共享上限（见 3.1 文件清单）
  - 前向迁移替换 CHECK 为 `between 0 and 35`
  - 测试断言 20 → 35
- 备选 B（低风险、无迁移）：把 `MAX_ARTICLE_FETCHES` 回落到 20。放弃已获得的吞吐提升，但改动面最小。
- 迁移风险：仅替换 CHECK，既有行全部 ≤ 20 → 校验通过；**无数据回填、无历史改写**。

> 这两个缺陷修复后，必须重跑完整 `pnpm verify` 取得**绿色基线**，才允许开始 Phase 16。

---

## 2. 技术方案

### 2.1 总体思路

把 **JSON API** 提升为一等内容形态，**最大化复用**既有 feed 的落库 / 发现 / 证据路径：

```
source(JSON API)
  └─ collect ──> raw_item(content_kind='json_api')            ← 原始 JSON 体（证据底座）
                 + discovered_items(每条 = 一个结构化条目)     ← disposition='discovered_only'，不抓正文
        └─ ai extract（读 discovered_items.summary）
              └─ candidate ──> publish(+evidence, source_field='discovered_summary')
                    └─ score ──> opportunity_list
```

**关键点：AI 契约、评分契约、证据链全部不动。** JSON 条目复用"摘要即内容"的既有路径（该路径本就是当前采集器的常态：`article_raw_item_id` 恒为 NULL，证据来自 `discovered_summary`）。

### 2.2 适配器（Adapter）设计

- 形态：**纯函数** `(body: unknown) => readonly JsonApiEntry[]`，放在 `packages/domain/src/collection/`（domain 不得依赖 IO / Next / DB）。
- 选择方式：**代码内 allowlist，按 source 的 `canonical_url` 精确匹配**。未知 JSON 源 → **fail closed**（不猜测、不自动识别），记 `unsupported_content_type`。
  - 理由：与产品红线"AI 只能选择输入中给出的 ID/枚举/链接，拒绝臆造引用"一致；新增数据源应当是显式动作。
  - 代价：新增一个 JSON 源需要一行代码 + 一次部署。可接受（每个新 API 的字段结构不同，本来就要写解析）。
- 首版**只注册 1 个适配器**：DeFiLlama 链 TVL。
- 仓库里已有的未跟踪草稿 `packages/domain/src/collection/chain-json-adapter.ts`（`parseDefiLlamaChains` / `parseDefiLlamaHacks` / `parseCoinGeckoGlobal`）**只能作为参考起点，不能直接采用**：
  - 草稿把 `entryUrl` 指向 API URL，会让条目变成 `eligible` → 触发**对 API 的无意义正文抓取**（每轮 35 次请求）。
  - 草稿无测试、未接入、`parseDefiLlamaHacks` 与 `parseCoinGeckoGlobal` 不在首版范围。

### 2.3 项目归属（关键设计决策）

采集是 **(project, source)** 维度的：一次采集产出归属某一个项目。`/v2/chains` 是全局 467 条链，**不能整包算到一个项目头上**。

**采用方案：按链拆分为独立 source，用不同的真实 URL 区分（推荐，风险最低）**

| 项目 | source canonical_url | 说明 |
|---|---|---|
| Ethereum | `https://api.llama.fi/v2/historicalChainTvl/ethereum` | 该链 TVL 时间序列，取末点 |
| Solana | `https://api.llama.fi/v2/historicalChainTvl/solana` | 同上 |
| Arbitrum | `https://api.llama.fi/v2/historicalChainTvl/arbitrum` | 同上 |

- 每个 source URL **天然唯一**（满足 `sources.canonical_url` 的 UNIQUE 约束），**无需把项目标识传进采集上下文**。
- 适配器从 URL 路径解析链名（确定性、可测），只产出一条条目。
- **避免了替换 `load_source_collection_context()`** —— 该函数是 `SECURITY DEFINER`，其 `RETURNS TABLE` 变更在 PG 里必须 `drop` + `create`（不能用 `create or replace`），会短暂丢失 `collection_worker` 的 EXECUTE 授权，是本次改动里风险最高的一处。**本方案绕开它。**

**备选方案（不推荐，仅记录）**：单一 source 指向 `/v2/chains`，前向迁移替换 `load_source_collection_context()` 增列 `project_primary_chain`，适配器按 `gecko_id`/`name` 匹配项目。更"集中"，但要动 SECURITY DEFINER 函数 + pgTAP + 生成类型，且依赖 `projects.primary_chain` 在生产有值（当前无法只读确认）。

### 2.4 JSON 采集路径的语义

| 环节 | 决定 |
|---|---|
| 媒体类型 | `parseCollectionMediaType` 新增 `json` family，接受 `application/json`（实测 DeFiLlama 返回 `content-type: application/json`，0 重定向） |
| 请求头 | `safe-https-client` 的 `ACCEPT_HEADER` 当前只有 rss/atom/xml/html，**补 `application/json`**（避免严格 API 返回 406） |
| 正文抓取 | **跳过**。JSON 条目一律 `disposition='discovered_only'`、`article_raw_item_id=null`，内容在 `summary` |
| content_kind | 新增枚举值 **`json_api`** |
| stable_entry_key | `id:<链名>` 或 `id:<gecko_id>`（稳定 → 重复采集原地更新，不产生重复行） |
| 条目数量上限 | 复用 `MAX_FEED_ENTRIES = 100`；首版每源 1 条 |
| summary 长度 | 表约束上限 10000 字符；适配器内部截断到 2000（与既有 `toJsonApiEntry` 一致） |
| 失败语义 | 非法 JSON → `invalid_feed`；未知适配器 → `unsupported_content_type`；体积超限 → `response_too_large`。**不新增 `collection_outcome` 枚举值**（最小化迁移面） |
| 幂等 | 沿用既有 `collect.source` job 幂等键 + `commitFeed` 的 `(feed_raw_item_id, stable_entry_key, version)` 唯一约束 |

### 2.5 证据与 AI 兼容性（无需改动，已核对）

- 抽取查询条件：`discovered.article_raw_item_id is not null or discovered.summary is not null` → **JSON 条目（仅 summary）可被抽取**。
- 证据：`publish_candidate_with_evidence` 已支持 `source_field='discovered_summary'` + `raw_item_id = discovered_items.feed_raw_item_id`（迁移 `20260910000800`/`20260910000900`）。
- 评分门槛 `score_has_complete_evidence` 要求证据引用**同项目**的 raw_item → feed raw_item 与 discovery 同属该项目/该源，满足。
- **本 Phase 不改动** `packages/contracts/src/ai/*`、`packages/domain/src/scoring/*`、任何 AI 提示词。

### 2.6 运维：源注册（无 UI，走 SQL）

沿用既有做法（`sources` / `project_sources` / `source_collection_schedules` 三张表，无管理界面）：

1. 插入 3 条 `sources`（`source_type='chain_explorer'`、`collectable=true`）。
2. 每个项目建 1 条 `project_sources`：`authority_domains=array['api.llama.fi']`、`is_official=false`、**`verified_at` 与 `verified_by` 必须非空**（`is_source_collection_eligible` / `load_source_collection_context` 的权威性门槛不放松）。
3. 建 3 条 `source_collection_schedules`，建议 12h。
4. 交付形式：runbook 步骤 + 幂等 SQL 脚本（**凭据一律从环境变量读**，临时脚本用完即删 —— 这是 2026-09-10 的既有教训）。

---

## 3. 文件级改动清单

### 3.0 前置修复（独立提交，先做）

#### 3.0a 清理被提交的临时脚本
| 动作 | 文件 |
|---|---|
| 删除（git rm） | `packages/database/.tmp-test-roles.cjs` |
| 修改 | `.gitignore`（增 `.tmp-*`、`*.tmp.*`） |

#### 3.0b 对齐正文抓取预算
| 动作 | 文件 | 说明 |
|---|---|---|
| 修改 | `packages/contracts/src/collection/source-collection.ts` | `bodyFetchCount` 上限改为共享常量（35） |
| 新增 | `supabase/migrations/20260911000100_phase_16_collection_body_fetch_budget.sql` | 替换 `collection_attempts_body_fetch_count_valid` 为 `between 0 and 35` |
| 修改 | `apps/worker/src/collection/tests/collect-source.test.ts` | 断言 20 → 35 |
| 新增/修改 | `supabase/tests/008_source_collection.test.sql` | 若含该约束断言则同步 |
| 修改 | `docs/runbooks/local-development.md` | 记录该约束与预算常量的对应关系 |

### 3.1 Phase 16 主体

| 动作 | 文件 | 说明 |
|---|---|---|
| 新增 | `supabase/migrations/20260911000200_phase_16_json_api_collection.sql` | `alter type public.collection_content_kind add value 'json_api'` |
| 修改 | `packages/contracts/src/collection/source-collection.ts` | `collectionContentKindSchema` 加 `json_api` |
| 新增 | `packages/domain/src/collection/json-api-adapter.ts` | `JsonApiEntry` 端口、按 URL 选择的 allowlist 注册表、fail-closed 选择函数 |
| 新增 | `packages/domain/src/collection/json-api-adapter.test.ts` | 单测（选择/拒绝/边界/注入） |
| 采用并重写 | `packages/domain/src/collection/chain-json-adapter.ts` | DeFiLlama 链 TVL 适配器：`entryUrl=null`、强制 `discovered_only`、截断、无 hack/coingecko |
| 新增 | `packages/domain/src/collection/chain-json-adapter.test.ts` | 单测（末点取值、字段缺失、非法结构、超大数值、字符串注入） |
| 修改 | `packages/domain/src/collection/content-policy.ts` | `CollectionMediaType['family']` 增 `'json'`；`ACCEPTED_MEDIA_TYPES` 加 `application/json`；导出共享预算常量 |
| 修改 | `packages/domain/src/collection/content-policy.test.ts` | **把 `application/json` 从"拒绝列表"移到"接受列表"**（这是有意的行为变更） |
| 修改 | `packages/domain/src/index.ts` | 导出新模块 |
| 修改 | `apps/worker/src/collection/safe-https-client.ts` | `ACCEPT_HEADER` 补 `application/json` |
| 修改 | `apps/worker/src/collection/tests/safe-https-client.test.ts` | Accept 头断言同步 |
| 修改 | `apps/worker/src/collection/ports.ts` | 如需暴露适配器端口类型 |
| 修改 | `apps/worker/src/collection/collect-source.ts` | JSON 分支：`family==='json'` → 解析 JSON → 选适配器 → 复用 `buildFeedDiscoveries` 提交路径，**不进入 `collectArticle`** |
| 新增 | `apps/worker/src/collection/tests/collect-source-json.test.ts` | JSON 采集路径单测（成功/非法 JSON/未知适配器/超大/不抓正文） |
| 修改 | `packages/database/src/generated/database.types.ts` | typegen（新枚举值） |
| 修改 | `supabase/tests/008_source_collection.test.sql` | 枚举期望值加 `json_api` |
| 新增 | `supabase/tests/023_phase_16_json_api_collection.test.sql` | pgTAP：枚举精确值 + 既有约束不回退 |
| 修改 | `docs/runbooks/local-development.md` | Phase 16 章节（源注册 SQL、验收矩阵、回滚说明） |
| 新增 | `docs/tasks/phase-16-onchain-data-sources-workbook.md` | 逐任务台账 |
| 修改 | `docs/HANDOVER.md` | 交接条目 |

> **不新增任何生产依赖**：沙箱无法 `pnpm install --no-frozen-lockfile`（symlink 被拒），且 `JSON.parse` 是运行时内置。lockfile 保持不变。

---

## 4. 数据迁移风险

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | `ALTER TYPE ... ADD VALUE` 在事务内执行报错/新值不可用 | 中 | PG 17.6 允许事务内 `ADD VALUE`，但新值在提交前不可用。本迁移**只新增、不在同一迁移内使用**该值；云端逐文件 `sql.unsafe()` 执行，需确认未被显式事务包裹。**在 disposable/云端先做"回滚空跑"再真实应用** |
| R2 | 枚举值只增不减，回滚后残留 | 低 | 新增值对旧代码完全惰性（旧代码只读已存在值）。回滚 = 回滚代码，枚举多一个值无害 |
| R3 | CHECK 约束替换触发全表校验 | 低 | `collection_attempts` 体量小（每源每轮 1 行）；既有行全部 ≤ 20，必然通过 |
| R4 | `pgTAP 008` 是 `results_eq` 精确枚举断言 | 中 | 必须同步加 `json_api`，否则 `full pgTAP` 红。这是**预期的测试改动**，不是回归 |
| R5 | typegen 漂移 | 中 | 迁移后必须重跑 typegen 并做**字节比对**（项目既有惯例：双 SHA 零漂移） |
| R6 | 生产版本序列跳号 | 中 | 生产当前 42 个迁移；新迁移号 `20260911000100`/`20260911000200` 必须**大于**生产最高号，且逐条显式授权后应用。**本 Phase 默认不动生产**，只到 disposable 验收 |
| R7 | `sources.canonical_url` UNIQUE 冲突 | 低 | 3 个链 URL 互不相同；注册脚本用 `on conflict do nothing` 幂等 |
| R8 | 历史数据被改写 | **无** | 本方案**不回写、不合并、不重建任何既有 `raw_items` / `discovered_items` / `sources` / `signals`**。只新增行（"旧数据只读、新数据前向保证"） |
| R9 | 证据链断裂导致评分不通过 | 中 | 依赖 `publish_candidate_with_evidence` 的 `discovered_summary` 路径；需在 disposable 端到端验证"JSON 源 → 条目 → 候选 → 发布 → 证据 → 评分"全绿 |
| R10 | 临时脚本再次泄漏凭据 | 中 | 所有临时脚本从环境变量读凭据、用完即删；`.gitignore` 增 `.tmp-*` |

---

## 5. 测试计划

### 5.1 单元 / 契约（每包独立门禁）
| 层 | 用例 |
|---|---|
| domain | `parseCollectionMediaType` 接受 `application/json`、拒绝 `text/plain`/`image/svg+xml`/空/畸形；`json-api-adapter` 选择与 fail-closed；`chain-json-adapter` 末点取值、字段缺失/类型错误、超大数值、超长字符串、非数组体、空数组 |
| contracts | `collectionContentKindSchema` 含 `json_api` 且为严格枚举；`bodyFetchCount` 新上限边界（0 / 35 / 36 拒绝） |
| worker | `collect-source` JSON 路径：成功落 raw_item + discoveries、**零正文请求**（`http.requests.length===1`）、非法 JSON → `invalid_feed`、未知适配器 → `unsupported_content_type`、体量超限 → `response_too_large`、稳定键去重、`safe-https-client` Accept 头 |
| database | `collection_attempts` 新 CHECK 边界（35 通过 / 36 拒绝）；生成类型与迁移一致 |

### 5.2 pgTAP
- `008`：`collection_content_kind` 精确枚举值加 `json_api`（保持 `results_eq` 精确匹配风格）。
- 新增 `023`：枚举精确值 + `collection_attempts_body_fetch_count_valid` 新边界 + `load_source_collection_context` 签名**未被改动**（防回归）。

### 5.3 变异测试（项目惯例：每任务至少一类具名变异）
- 把 `family==='json'` 分支改为走正文抓取 → 必须被"零正文请求"用例 kill。
- 把未知适配器改为"默认第一个适配器" → 必须被 fail-closed 用例 kill。
- 把 `bodyFetchCount` 上限改回 20 → 必须被边界用例 kill。

### 5.4 集成 / 端到端（需 disposable 授权）
1. reset + full pgTAP（含 023）。
2. 在 disposable 注册 1 个 JSON 源（fixture URL 指向本地 stub），跑一轮采集 → 断言 `raw_item.content_kind='json_api'`、`discovered_items.disposition='discovered_only'`、`article_raw_item_id is null`、无 article attempts。
3. 跑一轮 AI 阶段 → 断言候选/证据/发布/评分链路。
4. **残留核验**：执行域表回到基线；类型生成零漂移。

### 5.5 门禁命令（项目既有前缀）
```
env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED \
  PATH="<managed-node22>/bin:$PATH" CI=true pnpm verify
```
> 注意：本机 `pnpm` 需经 `corepack` 生成 shim 后方可被 `package.json` 内的嵌套 `pnpm` 调用；文档改动后必须重跑 `check:placeholders`。

---

## 6. 预计工期（相对工作量，非日历承诺）

| 阶段 | 内容 | 估计 |
|---|---|---|
| S0 | 前置修复（3.0a 清理 + 3.0b 预算对齐 + 绿色基线） | 3–4 h |
| S1 | domain：媒体类型 + 适配器 + 单测 | 3–4 h |
| S2 | contracts + 迁移 43 + pgTAP + typegen | 2–3 h |
| S3 | worker：JSON 采集路径 + 单测 + 变异 | 4–5 h |
| S4 | 运维：源注册 SQL + runbook | 1–2 h |
| S5 | disposable 集成验收（**需所有者精确授权**） | 2–3 h |
| S6 | 独立代码审查 + 修复轮次 | 2–4 h |
| **合计** | | **约 17–25 h ≈ 2–3 个工作日** |

---

## 7. 明确不做 / 后续候选（供一并决策）

**本 Phase 不做：**
- 交易、钱包、签名、私钥相关的任何事（红线）。
- 改写、回填、合并任何历史 `raw_items` / `discovered_items` / `signals` / 记忆数据。
- 引入新第三方依赖。
- `DeFiLlama /hacks` 与 `/protocols`（见下）。
- 生产迁移应用与生产部署（各自需独立显式授权）。

**后续候选（按建议优先级）：**
1. **人工/审核录入入口** —— 若目标是"更多空投机会条目"，这是最直接、最可控的一条（当前 `sources` 无注册 UI，`/review` 只能审 AI 候选）。**建议作为 Phase 17 首选。**
2. **`DeFiLlama /hacks` → 安全候选管线** —— 安全事件的正解是走 Phase 7A 的 security candidate / indicator / incident 链路，而不是通用抽取管线；需单独设计（来源可信度、名称匹配、公开披露分级）。
3. **`DeFiLlama /protocols` "上升生态雷达"** —— 用 TVL 增速筛出可能发空投的协议；需要可靠的名称/链匹配与阈值设计，价值待验证。
4. **其他 JSON 数据源** —— 有了本 Phase 的适配器能力，接入成本 = 一个纯函数 + 一次部署。
5. 审查报告遗留项（`update_user_task` 旧 RPC 未 revoke、`tutorial_versions` 匿名可读内部列、时区显示、移动端导航等）。

---

## 8. 验收标准（完成定义）

1. 前置两个缺陷修复，`pnpm verify` **全绿**（lint/typecheck/test/build/placeholders）。
2. Phase 16 代码 + 迁移 + 测试齐备；**每任务独立提交**，代码提交与 docs-only 提交分开。
3. disposable：full pgTAP 全绿（含 023）、集成矩阵全绿、**JSON 源端到端跑通**、残留核验全零、typegen 零漂移。
4. **独立代码审查通过**（0 Critical / 0 Important），修复轮次闭环。
5. HANDOVER / runbook / workbook 三处文档与实现逐条对拍一致。
6. 全程不触碰生产；生产迁移与部署各自另行显式授权。
7. 本 Phase **不 commit 到远端、不 push、不部署**，直至所有者确认。
