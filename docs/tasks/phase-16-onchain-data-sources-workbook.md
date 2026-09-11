# Phase 16 — 链上数据源（DeFiLlama JSON API）— Development Workbook

**Plan:** `docs/superpowers/plans/2026-09-11-phase-16-onchain-data-sources.md`
**Runbook:** `docs/runbooks/local-development.md` → `## JSON API collection (Phase 16)`
**Status legend:** `READY` · `IN_PROGRESS` · `REVIEW` · `DONE` · `BLOCKED`

**Commits:** `f804079 feat(collection): collect JSON APIs and repair the fetch budget`（22 files / +935 −52）；`2f7e488 docs: plan and record phase 16 JSON API sources`（4 files / +470）。提交后在 HEAD 重跑 fresh `pnpm verify` **exit 0**，工作树 clean。**未 push、未部署。**

| Task | Status | Scope | Evidence |
| --- | --- | --- | --- |
| 0a | DONE | 移除被提交的临时脚本 | 缺陷：`packages/database/.tmp-test-roles.cjs` 由 `53704f3` 提交进 git，ESLint 6 error → `pnpm verify` 第一步 lint 即失败。删除该文件；`.gitignore` 增补 `.tmp-*` 与 `*.tmp.*`。GREEN：`pnpm -r lint` 5/5 包通过。该文件不含硬编码凭据（从 `/tmp/worker_role_passwords.json` 读取）。 |
| 0b | DONE | 正文抓取预算 20→35 全链路对齐 | 缺陷：`MAX_ARTICLE_FETCHES=35` 与契约 `bodyFetchCount.max(20)`、DB CHECK `body_fetch_count between 0 and 20` 不一致。探针实测：一轮 eligible 条目 >20 时 `bodyFetchCount=35` → 契约 parse 抛错 + CHECK 拒绝 → `commitFeed` 回滚 → 整批 raw_item 与 discoveries 丢失、记为 `persistence_failed`。修复：契约新增共享常量 `MAX_COLLECTION_BODY_FETCHES=35` / `MAX_COLLECTION_DISCOVERIES=100`，domain 直接导入（结构上无法再漂移）；前向迁移 `20260911000100` 替换 CHECK 为 `between 0 and 35`；`collect-source.test.ts` 断言 20/77/18 → 35/62/33。GREEN：contracts 23、domain 108、worker `collect-source.test.ts` 40 全通过。**变异：共享常量改回 20 → contracts 1 / domain 2 / worker 1 全部 kill，已还原。** |
| 1 | DONE | domain：JSON 采集能力 | `content-policy.ts` 新增 `json` family 并接受 `application/json`（刻意窄：`application/ld+json`、`text/json`、`+json` 全部拒绝）；新增 `json-api-entry.ts`（`JsonApiEntry` + 严格边界 `toJsonApiEntry`，拒绝超长字段与非法 `publishedAt` 而不截断引文）；新增 `json-api-adapter.ts`（allowlist 注册表 `selectJsonApiAdapter`，未知源 fail closed）；重写 `chain-json-adapter.ts` 为 DeFiLlama 链 TVL 适配器（只取末点、`entryUrl=null`、确定性数字分组不依赖 ICU）。`content-policy.test.ts` 把 `application/json` 从拒绝列表移到接受列表并补 3 个 `+json` 拒绝用例。GREEN：domain collection **170** tests（原 108）。 |
| 2 | DONE | contracts + 迁移 + pgTAP + 生成类型 | `collectionContentKindSchema` 增 `json_api`；迁移 `20260911000200` 执行 `alter type public.collection_content_kind add value if not exists 'json_api'`（纯追加、不在同文件内使用该值）；pgTAP `008` 枚举期望值加 `json_api`；新增 pgTAP `023`（plan 3：枚举精确值 + CHECK 允许 35 + 不再封顶 20）；手改 `generated/database.types.ts` 两处枚举（**须在 disposable 用 typegen 字节比对复核**）。 |
| 3 | DONE | worker：JSON 采集路径 | `safe-https-client` 的 `ACCEPT_HEADER` 补 `application/json`（同步测试断言）；`collect-source.ts` 新增 JSON 分支：按配置 URL 选适配器（无适配器 → `unsupported_content_type`）→ `JSON.parse`（失败 → `invalid_feed`，复用既有码、不新增 outcome 枚举）→ `buildJsonDiscoveries`（全部 `discovered_only`、`entryUrl=null`、`article_raw_item_id=null`、稳定键 `id:<adapter id>`）→ 复用 `commitFeed` 原子提交；**完全不进入 `collectArticle`**。新增 4 个 JSON 用例（成功且零正文请求 / 未注册源 fail closed / 非 JSON → invalid_feed / 未变内容不重复产出）。GREEN：worker collection **98** tests（`collect-source.test.ts` 40 → 44）。**变异 2/2 kill**：`disposition` 改为 `eligible` → worker kill；未知 JSON 源不再 fail closed → domain 5 + worker 1 kill；均已还原。 |
| 4 | DONE | 门禁与文档 | fresh `CI=true pnpm verify` **exit 0**：lint 5/5、typecheck 5/5、build（Next 成功）、placeholders 通过。测试：contracts **299** / domain **495** / database **362**（+87 gated skips）/ worker **271**（+2 skips）/ web **651**，合计 **2,078 通过、0 失败**（改动前基线为 2,001 通过 + 1 失败 + lint 红）。新增 runbook `## JSON API collection (Phase 16)` 章节与本 workbook。 |
| 5 | DONE | 独立代码审查 | fresh 只读 reviewer（独立子代理）结论 **APPROVE / 0 Critical / 0 Important / 5 Minor**。独立复核：`collectArticle` 对 JSON 不可达（只在 `parsedFeed !== null` 分支内）；JSON 每轮恰 1 次请求（测试断言 `requests` 长度 1、`articleCommits` 为空）；`selectJsonApiAdapter` 对大小写主机/近邻主机/查询串/路径穿越/空链全部返回 null；预算 20 在源码/测试/生成类型中已无残留（仅旧迁移 `20260812000800:136` 保留历史值，已被前向迁移覆盖）；`json_api` 五处一致；迁移号大于当前最大值且 `ADD VALUE` 仅追加；四项变异均可被 kill；无 `any`、无 ICU 依赖、lockfile 未变。独立复跑 `pnpm verify` **exit 0**，计数与上表一致。 |
| 5b | DONE | 审查 Minor 修复 | ①失败详情不再一律泛化：新增 `failureDetail()` 优先采用抛出方的有界 `detail`，JSON 路径可区分"未注册适配器"与"非法 JSON"（并补断言）；②`chain-json-adapter` 增加 TVL 合理上限 `1e15`，保证 `formatUsd` 的确定性分组在任意载荷下都成立，并删掉已不可达的负数分支（补边界用例）。其余 Minor（`entryUrl` 暂未落到 DB、SQL 中 35 为字面量、提交时须显式 stage 删除）已记入备注，未改代码。**修复后最终门禁 exit 0**：contracts **299** / domain **497** / database **362**（+87 skips）/ worker **271**（+2 skips）/ web **651** = **2,080 通过 / 0 失败 / 89 skipped**。 |
| 5c | DONE | 漂移守卫（新增） | 新增 `packages/database/src/tests/generated-enum-drift.test.ts`：把「生成类型 vs 契约枚举」的一致性变成测试失败，正是本次 P0 缺陷的同类风险（预算在两处漂移）。①`collection_content_kind` 与契约枚举**完全相等且同序**（闭环集合）；②`collection_outcome` 只做**子集**断言——契约还带 `security_blocked`，而采集器返回该值时**不写 attempt 行**，故它绝不能出现在列类型里（同时断言这一点）。**变异：从生成类型的常量数组里删掉 `json_api` → 测试精确 kill，已还原。** |
| 6 | DONE | 生产迁移 43/44（已授权应用） | 所有者授权后执行。**只读预检**：42 迁移、top `20260910000900`、枚举无 `json_api`、CHECK 仍 `<= 20`、`collection_attempts` 119 行 / max `body_fetch_count=20`（确认放宽安全）。**回滚空跑**：两份迁移各在事务内执行后回滚，均通过且零持久化。**真实应用并登记**：`version` 写完整文件名、`name` NULL、`statements='{}'`（与既有 42 行逐字段一致）。**终态**：枚举含 `json_api`；约束 `CHECK (((body_fetch_count >= 0) AND (body_fetch_count <= 35)))`；**迁移 44 条**；探针残留 0；数据基线未动（projects 9 / signals 37 / raw_items 79 / attempts 119）。**行为探针 4/4 PASS**：`raw_items` 可存 `json_api`；`body_fetch_count=35` 接受、`=36` 拒绝并报正确约束名；无残留行。**pgTAP 未跑**：云端未安装 pgtap（仅有 1.3.3 可装），`create extension` 属授权范围外的 schema 变更，故改用回滚式探针覆盖 023 的实际语义。**回滚记录**：43 → `drop constraint` 后重建 `check (body_fetch_count between 0 and 20)`；44 → 纯追加枚举、对旧代码惰性。 |
| 7 | BLOCKED | 源注册与部署 | 迁移已应用，但**未注册任何 JSON 源**（3 条 `sources` + 3 条 `project_sources` + 3 条 schedule，SQL 在 runbook 里）、**未 push**、**未部署**。各自需独立显式授权。 |

## 审查遗留（不阻塞，已记录）

- `JsonApiEntry.entryUrl` 目前被采集器恒定置为 null（DeFiLlama 单条数据点没有可打开的页面），因此适配器提供的 URL 暂不会落到 `discovered_items.entry_url`。已在类型注释中写明；将来支持"展示链接"只需改采集器一侧，无需改适配器契约。
- 迁移里的 `35` 是 SQL 字面量，与 TS 常量 `MAX_COLLECTION_BODY_FETCHES` 的一致性由 pgTAP `023` 正则锁定（SQL 无法导入 TS 常量）。
- **提交时必须显式 stage 删除**（`packages/database/.tmp-test-roles.cjs` 目前是未暂存删除）：若只 `git add` 修改路径会漏掉删除，lint 会继续红。

## 未做 / 明确排除

- `DeFiLlama /hacks`（应走 Phase 7A 安全台账）与 `/protocols`（缺可靠名称匹配）。
- 未新增任何生产依赖（lockfile 未变）。
- 未回写、未合并、未重建任何历史 `raw_items` / `discovered_items` / `sources` / `signals` 或记忆数据。
- 未 commit、未 push、未部署。

## 环境备注（本机）

- managed node 实际路径为 `~/.workbuddy-ai/binaries/node/versions/22.22.2-2/bin`（手册旧路径 `~/.workbuddy/...` 已失效）。
- 该目录不含 `pnpm`，而 `package.json` 脚本会嵌套调用 `pnpm`：需 `corepack enable --install-directory /tmp/pnshim` 并把 `/tmp/pnshim` 加入 PATH。
- macOS BSD `grep` 不支持 `\|`，用 `grep -E` 或检索工具。
