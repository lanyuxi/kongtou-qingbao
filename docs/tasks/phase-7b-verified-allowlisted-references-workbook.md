# Phase 7B Verified Allowlisted References — Development Workbook

> 日期：2026-08-29
> 当前状态：**架构设计已批准，实施计划已产出；Task 1 未开始**；生产未访问
> 权威设计：`docs/superpowers/specs/2026-08-29-phase-7b-verified-allowlisted-references-design.md`
> 实施计划：`docs/superpowers/plans/2026-08-29-phase-7b-verified-allowlisted-references.md`
> 前置：Phase 7A 已于 2026-08-29 以 merge `00b4497` 并入主线 `codex/phase-0-1-foundation`

## 1. 固定边界

- 分支与工作区：`codex/phase-7b-references`，worktree `.worktrees/phase-7b-references`（在 gitignore 的 `.worktrees/` 下）
- 运行时：Node.js 22.22.2 / pnpm 11.16.0，声明路径 `/tmp/airdrop-node22-pnpm/bin`
- 基线（2026-08-29 计划批准时）：主线 `pnpm verify` exit 0 = contracts 133 + domain 376 + database 257 + worker 236 + web 242 = **1,244 non-skipped / 68 gated skips**；22 migrations、13 个 pgTAP 文件
- 迁移编号：`20260829000100`（第 23 个）；pgTAP 文件：`014_phase_7b_verified_allowlisted_references.test.sql`（第 14 个）
- disposable 栈：`/root/airdrop-governance-test`，project `airdrop-intelligence-governance-test`，DB 64322 / Kong 64321，本地隧道 16432 / 16433；pinned CLI `./cli/node_modules/.bin/supabase`（2.112.0）
- 生产 `airdrop-intelligence-os` 与端口 54321/54322 **永不访问**；生产仍为 19 个已应用迁移

## 2. 已确认的产品决定

1. **两层建模**：`project_domain_authorities`（域名归属性）+ `project_references`（具体 URL 条目）。已验证域名**不**验证其下的任意 URL。
2. **复用 `reviewer` / `senior_reviewer` / `admin`**，不新增 `app_role` 值。
3. **`projects.official_website_url` 保留为 Catalog 线索**，但渲染链接必须经已验证引用；否则惰性文本 + 显式「未验证」标记。
4. **安全联动 protect-first**：Phase 7A indicator 命中即自动 `flagged` 并同步停止公开渲染；恢复只能由人工追加有 Evidence 支撑的核验决策，flag 行只置 `released_at` 不删除。

**归一化补充决定（计划中已标注待实现时确认）**：归一化只做 scheme/host 小写、去尾部点、去默认端口、去 fragment、空路径归一；**不剥离 `www.`**、不折叠 query。因此 `www.example.com` 与 `example.com` 是两个独立权威，需分别授予——这对安全白名单是更保守的选择。

## 3. 任务看板

| Task | 交付物 | 状态 | 证据 / 关键提交 |
|---|---|---|---|
| 1 | Strict reference contracts | ✅ 完成（本地门禁绿，待独立复审） | RED：4 个 suite 全部 `Cannot find module`（0 个新用例执行，既有 133 全过）；GREEN：contracts 16 files / **161 tests PASS**，lint/typecheck exit 0。变异检验：把 `publicProjectReferenceSchema` 放宽为 non-strict 后「公开投影携带内部字段」用例失败，随即还原。踩坑：测试导入路径误写为 `../`（会解析到 `src/enums.js` 而非同目录）；URL 控制字符判定用字面量正则会被 `no-control-regex` 拦下、且会往文件里写真实控制字节，已改为码点谓词。 |
| 2 | Pure normalization / transition / derivation rules | ✅ 完成（本地门禁绿，待独立复审） | RED：3 个 suite 全部 `Cannot find module`（既有 376 全过）；GREEN：domain 15 files / **402 tests PASS**（+26），lint/typecheck exit 0。**实现期发现真实缺陷**：`new URL('https:///claim')` 不抛错、反而被解析成 host `claim`，必须先拒绝空 authority，否则会被归一化成 `https://claim/`。两处变异检验通过：放开域名权威门禁 → 「无 granted 不得 verify」失败；`last_verified_at` 改用注册时间 → 两条派生用例失败。归一化按计划不剥离 `www.`。 |
| 3 | Reference Ledger migration + protected commands + RLS + 安全联动 SQL | ✅ 完成（014 pgTAP 74/74、disposable 验证全绿） | 迁移 1,992 行 / 37 个对象。**disposable 验证（2026-08-30，用户授权）**：同步迁移+014（SHA 逐个核对）、reset exit 0（23 迁移）、full pgTAP **14 files / 1,424 tests PASS**（含 014 的 74 个新断言）、typegen 两次一致（156,630 字节）并替换 generated types；集成矩阵 **9 files / 66 tests PASS**（155.6s）；清理后回到 seed 基线（4 projects / 2 opps / 全部引用·安全表与 outbox = 0）、marker 完好；隧道关闭、凭据删除、54321/54322 全程未访问。**验证期修掉的 4 个真缺陷**：① `pg_catalog.position(x in y)` 限定名与 `IN` 语法不兼容（42601），改 `strpos`；② `pg_catalog.coalesce/least/nullif` 是语法结构不能带 schema 前缀；③ **plpgsql `RETURN QUERY` 不退出函数**——replay 分支返回后直落进版本检查抛 AR206，四个命令的 replay 全部不可用，补 `return;`；④ restore 用 `transaction_timestamp()` 使同事务 flag+release 的 `released_at > created_at` 恒假（AR299），改 `clock_timestamp()`。另：决策表新增 `aggregate_version` 列（同事务内时间戳恒定导致「最新决策」按随机 UUID 排序的不确定性）与 006 精确策略矩阵更新（4 条新策略）。 |
| 4 | Bearer-scoped reference review repositories + race tests | 待执行 | — |
| 5 | Phase 7A coupling under real races（仅集成测试，不改迁移） | 待执行 | — |
| 6 | Strict public reference repositories and projections | 待执行 | — |
| 7 | Authenticated reference BFF routes + browser client | 待执行 | — |
| 8 | Reviewer reference workflow UI（`/review/references`） | 待执行 | — |
| 9 | Public link resolution + unverified-link marking | 待执行 | — |
| 10 | Golden Dataset / E2E / runbook / full verification | 待执行 | — |

## 4. 执行约定

- 每个任务独立 RED/GREEN/review/commit；评审结论必须写回本工作簿与 `docs/HANDOVER.md`
- 需要远端数据库的操作（Task 4/5/10）必须**先取得用户显式授权**，并在 reset 前做 fail-closed 预检（workdir/project/端口/容器/marker/迁移与测试哈希）
- 每轮提交都跑 `pnpm verify` 与 `pnpm check:placeholders`，两者都要 exit 0
- 本地完成与生产可用性分开陈述，不得混用措辞

## 5. 执行记录

| 日期 | 阶段 | 内容 |
|---|---|---|
| 2026-08-29 | 设计批准 | 调研确认仓库不存在 canonical 引用对象（`official_website_url` 无验证；`project_sources.authority_domains` 为来源级、无历史、无 URL 粒度；7A indicator 明确不判定官方/可访问/白名单）。用户确认四项产品决策，规范 20 节定稿。 |
| 2026-08-29 | 实施计划 | 产出 10 个任务、574 行计划；Task 5 由「改迁移」重构为「仅集成测试」，把安全联动 SQL 前移到 Task 3，避免任务间改写已 reset 的迁移；归一化例子修正为不剥离 `www.`。 |
| 2026-08-29 | Task 1 预检 | 建分支 `codex/phase-7b-references` / worktree `.worktrees/phase-7b-references`（HEAD `e9aa866`）；`pnpm install --frozen-lockfile` exit 0；Node 22.22.2 / pnpm 11.16.0 下 `pnpm verify` exit 0 = 1,244 non-skipped / 68 gated skips（contracts 133 / domain 376 / database 257 / worker 236 / web 242）。未连库、未访问生产。 |
| 2026-08-29 | Task 1 RED→GREEN | 四个契约模块（enums/commands/projections/events）+ 四个测试；28 个新用例覆盖枚举取值、strict 拒绝越权字段与 `reviewerUserId`、https/绝对/无 fragment URL、长度边界（2048/2049、label 160/161）、verify·reverify·restore 必须带 Evidence、grant·regrant 必须带 Evidence、公开投影严格键集、游标 base64url 与 payload 校验、事件仅含安全键。变异检验通过。 |
| 2026-08-29 | Task 2 RED→GREEN | 三个纯规则模块（normalize/rules/flag-match）+ 三个测试；26 个新用例覆盖归一化（默认端口、空路径、fragment、尾部点、非 https、控制字符与空白、`www.` 不折叠）、decision×state 全矩阵与域名权威门禁、`last_verified_at` 派生（reverify 推进、注册不算）、indicator↔reference 匹配（url 精确匹配、domain 命中同主机全部、同主机兄弟路径不误伤、非链接类型忽略、畸形值不回退子串匹配）。实现期修掉 `https:///claim` 空 authority 缺陷；两处变异检验通过。 |
| 2026-08-29 | Task 3 迁移编写 | 用户授权 disposable 操作后编写迁移 `20260829000100`（1795 行）。关键取舍：**回执表独立为 `reference_review_commands`**（6 张表而非 5 张，因 `security_review_commands` 的 expected/resulting 列与 aggregate 校验都是安全专用，硬塞会扭曲语义）；RLS 策略用 `reference_current_state_v1()` security-definer 函数内联派生态，使 anon 直接读基表也只见 verified 行；公共视图双重过滤（RLS + 视图 WHERE）。两个避免的缺陷与结构自检见看板列。014 pgTAP、disposable reset、typegen 待执行。 |
| 2026-08-30 | Task 2/3 独立复检（NEEDS_FIXES，3C/6I/4M）→ 全部闭环 | 复审范围 `f63f793..87cc070`。**Critical**：① 公共视图权限自锁（`public_project_references` 从 definer 内层视图选、`public_project_domain_authorities` 直接读无 grant 的基表 → anon 查询即 permission denied）；② plpgsql `variable_conflict`（`RETURNS TABLE(version…)` 的 OUT 参数与 `returning … version into` / `set version = version+1` 同名，运行时 42702 会被 `when others` 吞成 AR299，全部命令不可用）；③ TS/SQL 归一化 5 类分叉（dot-segment 重写、端口前导零、空查询、非 ASCII 路径、`%` 编码/IDN/IPv6/下划线 host）。**Important**：公共视图漏 `lifecycle in (active,rumored)`（definer 内层视图绕过 RLS）；`reference.security_flagged.v1` 无生产者；Task 2 缺 flag-over-verified 优先级；TS 无 host 提取对应物。**修复**：TS 重写为与 SQL 同一算法的纯字符串解析（不再用 `new URL`，消灭分叉类）+ 新增 `referenceUrlHost` / `deriveEffectiveReferenceState`（+8 用例，domain 410 tests）；SQL 增 `reference_is_publicly_renderable_v1`（security-definer 单一判定点，RLS 与公共视图共用，避免把 7A posture 函数授权给 anon）、公共视图改读基表 + lifecycle 条件、`project_domain_authorities` 补 RLS 与列授权、全部列引用限定并去掉 `RETURNING version`、`unique_violation → AR208`、replay 检查前移、触发器补 flag outbox 事件。提交 `0b3d721`。**教训：plpgsql 里 `RETURNS TABLE` 的列名就是变量——同名表列必须限定；写公共视图前先推演「anon 从 PostgREST 直查该视图」的完整权限链。** |
| 2026-08-30 | Task 3 pgTAP / disposable 验证 | 按 fail-closed 预检同步迁移与 014（SHA 核对），reset exit 0（23 迁移），full pgTAP **14 files / 1,424 tests PASS**，typegen 两次一致后替换 generated types，集成矩阵 9 files / 66 tests PASS，清理后回 seed 基线、marker 完好。验证过程迭代修掉 4 个缺陷（strpos / 语法结构前缀 / RETURN QUERY 直落 / clock_timestamp）并新增 aggregate_version 列与 006 矩阵更新；014 共 74 个断言。隧道关闭、凭据删除、生产未访问。提交 `5772ad5`。 |
