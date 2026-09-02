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
| 2 | domain 纯规则（耦合矩阵 / 白名单 / 版本派生） | ✅ 完成（本地门禁绿） | 三模块 + 三测试文件；domain 18 files / **428 tests**（+16）；lint/typecheck 绿；变异 2/2 killed 且均打在实现上（M1 source_blocked 严重度反转→3 用例失败；M2 白名单扫描绕过→3 用例失败）。语义要点：blocked 永不自动降级；needs_review 仅在安全触发下升级为 blocked；version/lastVerifiedAt 按 append 顺序 fold（乱序输入被忽略并有用例锁定）。**未访问数据库/远端/生产**。 |
| 3 | 迁移 26 + pgTAP 017（七表两视图 / 四受保护命令 / 六联动 / outbox 扩展 / RLS+grants） | ✅ 完成（disposable 验收全绿） | 迁移 ~2,000 行 + pgTAP plan(41)；full pgTAP **17/17 文件 0 失败**；集成矩阵 **11 文件 / 74 测试**（168.76s）；残留核验（seed 4/2 + 台账全 0）；双 typegen 确定性 `cmp -s` 通过（180,081 bytes / SHA `0499c0ab…0981`）→ 生成物机械替换 +701 行；database 窄门禁（typecheck/lint/单测 302）绿。**验收期间修复迁移内 4 处真实缺陷**（见执行记录），生产未触碰。 |
| 4 | repositories（bearer 审核 + 匿名公开） | ✅ 完成（disposable 验收全绿） | `src/tutorials/{entry,browser-denied,tutorial-review-repository}.ts` + `src/repositories/tutorial-public-repository.ts`；单测 **22 新用例**（review 15 + public 8 + entrypoints 1）database 单测 302→**327**；变异 **5/5 killed**（M1 泄漏守卫 / M2 项目作用域 / M3 ordinal fold / M4 AT211 映射 / M5b strict-keys 整体中和）；contracts 补 receipt schema×4 + 投影类型导出（207 tests 保持绿）；**迁移 26 视图再修 2 处**（step_count 统计链接数→步骤数；detail 对不可渲染引用泄漏 normalized_url→case 置空）+ public detail 视图 folded rows 组装契约嵌套 steps；disposable：reset + full pgTAP 17/17 + 集成 **12 文件 / 78 测试**（含 tutorial 集成 4 用例）+ 残留全零 + typegen SHA 零漂移（`0499c0ab…`）+ 清理完毕。生产未触碰。 |
| 5 | BFF 路由与边界 | ✅ 完成（本地门禁绿 + build） | `lib/tutorial-cursor.ts`（结构化游标 ↔ base64url，畸形→invalid_cursor）、`lib/tutorial-review-handlers.ts`（8 handler）、`lib/tutorial-public-handlers.ts`（2 handler）、10 路由薄封装；web 单测 354→**376**；变异 **4/4 killed**；`next build` 成功。**未访问数据库/远端/生产**。 |
| 6 | 审核 UI（/review/tutorials） | ✅ 完成（本地门禁绿 + build） | api-client 8 方法 + 5 组件 + 3 页面 + shell 导航；web 单测 376→**402**；变异 **4/4 killed**；build 绿。**未访问数据库/远端/生产**。 |
| 7 | 公开页（教程卡 + /tutorials/[id]） | ✅ 完成（本地门禁绿 + build） | public-tutorial 组件 + 公开详情页 + 详情页教程卡 + loader 扩展；web 402→**408**；变异 **2/2 killed**；build 绿。**未访问数据库/远端/生产**。 |
| 8–10 | 见实施计划 | ⬜ 待执行 | — |

## 4. 执行记录

| 日期 | 阶段 | 内容 |
|---|---|---|
| 2026-09-02 | Task 1 RED→GREEN | RED：4 测试文件全部 `Cannot find module`（0 新用例执行，既有 171 全过）。实现 enums（kind 六类/status 六态/候选三态/决策四类/理由码九类/AT2xx 十码/联动触发器六类/outbox 两事件）、commands（steps 2..20、每步 links ≤5 仅 referenceId、**step 文本 schema 层拒绝裸 URL（http/https/www）**、四命令 strict versioned）、projections（公开 detail/list + 审核列表/detail + 三种游标；公开投影无裸 URL 列、无 candidate payload/note/reviewer 字段）、events（两事件仅安全键）。实现期修正：projections 补 `tutorialReasonCodeSchema` 导入；review detail fixture 补第二步（steps min 2 镜像已发布版本约束）。**变异检验 2/2 killed**：M1 steps min 2→1（2 用例失败）、M2 移除 body URL 守卫（1 用例失败）——均打在实现上并已还原。**教训复现**：①macOS BSD grep 不支持 BRE `\|`，多模式必须 `-E`（曾误报导出缺失）；②未跟踪文件 `git checkout --` 无法还原，变异还原需用反向替换。 |
| 2026-09-02 | Task 3 迁移编写 + disposable 首轮 | 迁移 26（七表两视图、四受保护命令、六联动触发器、outbox 约束扩展保留既有分支逐字不动、RLS+grants）+ pgTAP 017 plan(38)。首轮 reset 后 017 全挂：fixture 与真实 schema 列不匹配（sources 无 is_official / project_sources 核验字段 / raw_items·evidence·signals·authority·decisions 列名逐一对齐）+ shell 引号残留 + JSON 内嵌 SQL 子查询等。 |
| 2026-09-02 | Task 3 修复序列（迁移 4 缺陷 + 017 重写，plan 38→41） | ①pgTAP 此版本双参 `has_table` 是 (表名，描述)，带 schema 前缀点号查不到 → 改三参 (schema, table, desc)（013 惯例）。②SRF 复合返回不能 `func(...).replayed` → FROM 子句形式。③AT208 重复规则测试改真实路径：插第二 pending 候选 + 合法双步 payload（原空 steps 恰好撞同一错误码但未测到规则）。④**accept 载荷须含 step link**：reference 联动靠 `tutorial_step_links` 找教程，无链接则联动无目标 → 领取页步骤绑定 allowlisted 引用（happy/replay 两处 payload 保持 hash 一致）。⑤plpgsql 坑再现：`RETURNS TABLE(version…)` 下子查询未限定 `version = 1` 歧义 → `tutorial_versions.version`。⑥**incident 联动挂错事件源（重大设计缺陷）**：原挂 `security_incidents` INSERT/UPDATE——7A 守卫禁 incident UPDATE，且命令路径 incident 先于决策插入、AFTER 触发时 posture 恒为 clear → 联动实为死代码；迁移到 `security_incident_decisions` AFTER INSERT（决策行此时可见、posture 正确派生），restore 分支同步修正，source 分支同理。⑦queue/block 状态事件 `from_status` 写死 'published' 失真 → CTE 捕获真实前状态。⑧publish 的 versions 插入误用 `insert…select default…`（INSERT...SELECT 列表不允许 DEFAULT）→ VALUES 形态。⑨signal 触发器比较枚举外字面量 `'retracted'`（22P02）→ 拆双分支：verification disputed→`signal_disputed`、lifecycle='rejected'→`signal_retracted`。⑩authenticated 只见 published 行（RLS）→ 017 用 `pg_temp` 临时表捕获 tutorial id + grant select（013 先例）。⑪anon 调命令是 42501（EXECUTE 只授 authenticated），AT201 是第二道防线；结尾"直接写台账"测试改为 authenticated 42501 grants 边界（tutorials 本行无 guard，超管/definer 才可写）。 |
| 2026-09-02 | Task 3 disposable 验收矩阵 | fail-closed 预检（43 个迁移/测试文件中仅 2 个差异，字节级确认）→ 一次 reset（26 迁移 + seed）→ 017 **41/41** → full pgTAP **17/17 文件 0 失败**（含 006/013/015/016 回归）→ 双隧道重建 + 交叉证明（隧道 PostgREST 2 = 远端 psql 2）→ 生产端口 54321/54322 无本地监听确认 → 集成矩阵 **11 文件 / 74 测试**（168.76s，`env -u NODE_OPTIONS`，node 22.22.2）→ 残留核验（projects=4 / opportunity_list=2 / 安全表·outbox·tutorial 台账全 0）→ 双 typegen `cmp -s` 确定性（180,081 bytes / SHA `0499c0ab8e01279d9798e12f2a3928c422118b3cde2da05f25d3a18997c10981`）→ 静态扫描（七表/两视图/八 RPC/两辅助函数全在）→ 生成物机械替换 +701 行、`git diff --check` clean → database 窄门禁（typecheck/lint/单测 302 passed / 74 gated skips）→ 本地与远端临时文件清理、隧道关闭。 |
| 2026-09-02 | Task 4 RED→GREEN→变异 | RED：新测试文件模块缺失（0 新用例执行，database 既有 302 全过）。实现：review 仓储（8 RPC：candidates/items 列表分页 limit+1、candidate/tutorial detail、四命令 receipt 解析 + AT2xx→契约错误码映射 + canonicalJson）、public 仓储（list 视图 keyset 分页 + detail 视图 folded rows 组装嵌套 steps + **不可渲染链接泄漏守卫**）、entry/browser-denied + `./tutorial-review` 导出 + index 导出。contracts 补：四 receipt schema（`tutorialAcceptReceiptSchema` 等，7B 先例 receipt 属 API 层）、`publicTutorialListItemSchema` 独立导出、cursor/list item 类型导出。**变异 5/5 killed**：M1 泄漏守卫置 false→泄漏用例失败；M2 项目作用域检查→越界行用例失败；M3 ordinal 匹配改恒真→fold 用例失败；M4 AT211→persistence_failed→映射用例失败；M5 strict-keys every 冗余层变异存活（长度检查独立兜底）→改打整体中和后 killed（教训：变异要打在**唯一防御层**上）。 |
| 2026-09-02 | Task 4 disposable 验收（用户授权） | 预检仅迁移 26 差异 → reset + full pgTAP **17/17 零失败** → 隧道 + env（双容器白名单、不回显、远程即删）+ 交叉证明 2=2 → 集成矩阵 12 文件首跑 tutorial 3/4 失败 → **定位 postgres.js 双重编码陷阱**：模板里把 `JSON.stringify` 的结果串接 `::jsonb`，postgres.js 会把参数再序列化一次，payload 落库成 jsonb 字符串（`jsonb_typeof='string'`），取 `->> 'title'` 得 null → 修复为 `sql.json(payload)`（探针实证 object + title 正确）→ tutorial 集成 **4/4 全绿**（含残留自清理断言）→ 全矩阵 **12 文件 / 78 测试 PASS**（168.58s）→ 残留核验全零 → 双 typegen 确定性且 **SHA 零漂移**（`0499c0ab…`，视图表达式变化不影响类型输出）→ 清理（临时文件/隧道关闭）。 |
| 2026-09-02 | Task 4 disposable 验收（用户授权） | 预检仅迁移 26 差异 → reset + full pgTAP **17/17 零失败** → 隧道 + env（双容器白名单、不回显、远程即删）+ 交叉证明 2=2 → 集成矩阵 12 文件首跑 tutorial 3/4 失败 → **定位 postgres.js 双重编码陷阱**：模板里把 `JSON.stringify` 的结果串接 `::jsonb`，postgres.js 会把参数再序列化一次，payload 落库成 jsonb 字符串（`jsonb_typeof='string'`），取 `->> 'title'` 得 null → 修复为 `sql.json(payload)`（探针实证 object + title 正确）→ tutorial 集成 **4/4 全绿**（含残留自清理断言）→ 全矩阵 **12 文件 / 78 测试 PASS**（168.58s）→ 残留核验全零 → 双 typegen 确定性且 **SHA 零漂移**（`0499c0ab…`，视图表达式变化不影响类型输出）→ 清理（临时文件/隧道关闭）。 |
| 2026-09-02 | Task 5 RED→GREEN→变异→build | RED：3 测试文件模块缺失。实现：`lib/tutorial-cursor.ts`（结构化游标 ↔ base64url 传输令牌，解码经契约 schema 验证，畸形→invalid_cursor 而非静默第一页）、`lib/tutorial-review-handlers.ts`（8 handler：候选/教程列表+详情、accept/reject/publish/retire，认证先于校验、信封精确、命令 id 与路径绑定）、`lib/tutorial-public-handlers.ts`（匿名列表+详情，not_found→404 不泄漏内部）、10 个路由文件薄封装（相对导入深度 per-directory 核对：candidates 子树最深 8 层）。测试修正过程：认证后请求需带 Authorization 头（否则 bearer 提取 null→401）；仓储接口为单对象入参。**变异 4/4 killed**（M1 reviewer_required 403→500；M2 路径绑定检查移除；M3 畸形游标静默回首页；M4 public not_found 404 移除）。门禁：web typecheck/lint 绿、**376 tests**（354+22）、`next build` 成功。 |
| 2026-09-02 | Task 6 审核 UI RED→GREEN→变异 | 实现：`lib/tutorial-review-api-client.ts`（8 方法；UI query 持**不透明传输令牌**——结构化游标在服务端 handler 解码，浏览器端 cursor 永远是 string token；409→typed conflict 不重试；403/404/401 映射）+ `components/tutorial/{tutorial-links,candidate-list,candidate-detail,tutorial-list,tutorial-detail}.tsx`（payload 经 displayReviewValue 惰性渲染；步骤编辑默认从候选 payload 种子化；accept/publish 确认绑定 {id, expectedVersion}；409→清确认+刷新）+ review-shell 导航加"教程审核" + 3 页面（列表双面板 / 候选详情双表单 / 教程详情 publish+retire 条件渲染）。runtime 注入 tutorialApi。测试 26 新用例（api-client 9 + components 17）。**修正过程**：①契约游标是结构化对象而 UI 需 opaque token → API client 输入类型改为 UI 侧 {status, cursor: string|null, limit} + 独立校验 schema；②路由相对深度又一轮（candidates 子树 5 层 / [tutorialId] 4 层）；③session stub 需 signIn 方法；④conflict stub 需完整 failure 形状。门禁：typecheck/lint 绿、web **402 tests**、build 绿。**变异 4/4 killed**（确认绑定放宽忽略版本 / payload 原样渲染 / accept schema 绕过 / forbidden 映射移除）。**未访问数据库/远端/生产。** |
| 2026-09-02 | Task 7 公开页 RED→GREEN→变异 | 实现：`components/tutorial/public-tutorial.tsx`（TutorialCard/TutorialCardList/PublicTutorialDetail/TutorialLink——**链接守卫：`renderable === true && url !== null` 才渲染 `<a>`，否则「暂不可用」纯文本**；教程级 lastVerifiedAt 用 `<time dateTime>` machine-readable；敌意文本 React 转义惰性）；`/app/tutorials/[id]/page.tsx`（server component：uuid 校验→getTutorial→空读/失败→notFound，fail-closed）；loader 扩展第 4 参 `tutorialRepository`（并行读取 limit 20）→ 详情页「参与教程」板块（blocked 时不渲染）。测试 10 用例（渲染 6 + loader 更新）。**测试断言修正**：I-1 不变量的正确形式是「无任何非台账来源的 `<a href>`」而非「文本中不含 URL」（敌意 URL 作为转义文本出现是安全的）。门禁：typecheck/lint 绿、web **408 tests**、build 绿；globals.css 补 `.tutorial-*` 样式块（全局 a 规则会剥样式）。**变异 2/2 killed**（M1 renderable 守卫移除→2 用例失败；M2 machine-readable time 移除→1 用例失败）。**未访问数据库/远端/生产。** |
