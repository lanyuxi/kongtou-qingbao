# 空投情报站 · 独立审查报告

- 日期：2026-09-10
- 方法：三个独立审查员并行只读审查（前端交互 / 数据层与安全 / 产品完整性），不修改任何代码。关键结论由我另做**线上实测复核**，报告中标明「实测」的条目均已复现。
- 线上地址：`https://airdrop-intelligence-os.vercel.app`

---

## 一、前端与交互层

### P0 — 会出错或数据错

#### 1. 机会列表分页每页静默漏一行，并可能误报「暂无数据」

- 证据：`apps/web/src/app/opportunities/page.tsx:105-106`、`:131-134`
- 机制：`nextHref` 取 `filtered[20]`（第 21 条）**自身**的 `opportunityScore` / `projectId` 作为游标，而仓储的游标语义是**严格大于**（`packages/database/src/repositories/project-repository.ts:99-108`）。第 21 行会被下一页的过滤条件排除，**永远不显示**。
- 更严重的一层：本批 100 条内匹配数 ≤ 20 时 `nextHref` 直接为 `null`，即使后面还有匹配记录，页面也会显示「当前视图暂无机会」并**无法翻页**。
- 影响：任何分页浏览都会丢数据；数据量上来后筛选结果会假性为空。
- 状态：代码证据充分；当前线上仅 2 条数据，无法在线上复现丢行。

#### 2. 机会列表游标参数非法时页面 500（根因是缺失败降级，不是缺校验）

- 证据：`apps/web/src/app/opportunities/page.tsx:94-102`；`packages/database/src/repositories/project-repository.ts:267-274`
- 机制：页面层只判断 `afterScore !== null && Number.isFinite(afterScore) && afterProjectId !== null`，就把**用户完全可控的 URL 参数**直接交给仓储。仓储**确实会校验**（分数须在 0–100、`afterProjectId` 须匹配 UUID 格式），但**校验失败时抛 `RangeError`**；页面没有 try/catch，全站也没有 `error.tsx`，于是「参数不合法」被升级成 500 未处理异常页。
- 根因（经源码复核修正）：**不是缺少校验，而是校验失败的路径没有降级**——把一个可恢复的输入错误变成了服务端故障。同文件的 blocked 分支用 `lib/security-cursor.ts` 先校验再使用，反衬出这条分支的缺失。
- **实测（已复现）**：

  | 请求 | 结果 |
  |---|---|
  | `/opportunities` | 200 |
  | `?afterScore=999&afterProjectId=not-a-uuid` | **500** |
  | `?afterScore=99999&afterProjectId=11111111-1111-4111-8111-111111111111` | **500** |
  | `?afterScore=abc&afterProjectId=<合法 UUID>` | 200（`Number('abc')` 为 NaN，恰好被 `isFinite` 挡下） |

- 放大因素：全站**没有 `error.tsx`**，所以用户看到的是框架默认的未处理异常页，而不是可恢复的友好提示。

### P1 — 明显影响使用

3. **首页四个统计只按前 100 条机会计算**，数据超过 100 条后全部少报（`lib/opportunity-queries.ts:27,30-37`）。
4. **项目详情页头部生命周期徽标错误**：`paused` / `ended` / `archived` 一律显示「进行中」，与同页「基本信息」区的真实生命周期**自相矛盾**（`app/projects/[slug]/page.tsx:59` vs `:156`）。
5. **审核列表页 reload 无竞态取消**：快速切换筛选时旧响应会覆盖新结果（`app/review/references/page.tsx:41-52`、`app/review/tutorials/page.tsx:45-56`）。同目录的 `app/review/ai-runs/page.tsx:36-47` 有正确写法可对照。
6. **教程详情把数据库故障伪装成 404**：catch 后返回 `null` 再 `notFound()`，故障与「不存在」不可区分（`app/tutorials/[id]/page.tsx:25-28`）。

### P2 — 打磨项

7. **审核端 9 处表单 label 与控件未关联**（缺 `htmlFor` / `id`），屏幕阅读器无法识别；而 identity / task 表单的写法是对的，属局部退化。位置：`components/review/security-candidate-form.tsx:36-37`、`security-candidate-detail.tsx:42-43`、`security-incident-command-form.tsx:22-23`、`security-indicator-disclosure-form.tsx:21-22`、`reference/reference-detail.tsx:303-322`、`reference/authority-detail.tsx:302-321`、`reference/reference-list.tsx:247-266`、`tutorial/candidate-detail.tsx:471-490`、`tutorial/tutorial-detail.tsx:464-483`。
8. **时间格式两套并存**：公开页 `toISOString().slice(0,10)` 且不标 UTC（`components/opportunity-elements.tsx:125`），审核页带 ` UTC`（`components/review/failed-ai-run-list.tsx:162`）。中国用户可能看到**差一天**的日期。
9. **情报页直出英文 `signal_type`、置信度无 `%`**（`app/intelligence/page.tsx:58-60`），与 `opportunity-elements.tsx:170-187` 已有的中文映射与格式不一致。
10. **加载失败提示缺 `role="alert"`**：`components/execution/task-manager.tsx:237`、`watchlist-manager.tsx:229`、`project-execution-panel.tsx:219`。
11. **删除类操作绕过了 PendingActionGate**（创建/完成走 `*Once` 防重，删除直调），快速连点会发两次请求：`task-manager.tsx:301` vs `:276`；`watchlist-manager.tsx:275,296`。
12. **新建任务成功后未清空标题草稿**（新建关注列表则会清空，两者不一致）；`freshestSignalAt` 计算后从未渲染，是死代码。`task-manager.tsx:272-277` vs `watchlist-manager.tsx:252-258`；`opportunity-queries.ts:38-45`。

**未发现问题**：服务端组件误用客户端 API；`'use client'` 缺失/多余；定时器与订阅泄漏；图片缺 `alt`；导航链接指向不存在的路由。乐观更新在代码中未实现，故无回滚缺失问题。

---

## 二、数据层与安全

### P0 — 安全或数据正确性

#### 1. 教程权威状态可被匿名改写 —— **已修复并验证**

- 证据：`supabase/migrations/20260902000100_phase_8_tutorials.sql:426-465`（`queue_tutorials_for_review`）、`:470-494`（`block_tutorials_for_project`）
- 机制：两个函数都是 `SECURITY DEFINER`，函数体**只校验 `p_trigger`，完全不看 `auth.uid()` 或角色**；全仓**没有任何 grant/revoke**，于是沿用 PostgreSQL 默认的 `PUBLIC EXECUTE`。Supabase 的 PostgREST 会把 public schema 里可达的函数直接变成 RPC 端点。
- **实测（修复前）**：匿名 POST `/rest/v1/rpc/block_tutorials_for_project` → **HTTP 204（执行成功）**。
- 影响：任何匿名请求都能把任意项目的已发布教程置为 `blocked`，并伪造 `tutorial_status_events`。这直接违反「未认证不得写权威事实」「冲突证据必须保持可见」两条红线。
- **修复**：新增迁移 `20260910000200_phase_11_revoke_internal_function_exposure.sql`，收回 `public, anon, authenticated` 的 EXECUTE（保留 `service_role`）。这两个函数的**全部调用方都是同 schema 内的其他 `SECURITY DEFINER` 函数**（`perform public.xxx(...)`，见 `:515/546/577/585/628/662`），没有应用代码调用，所以收回权限不影响内部逻辑。
- **实测（修复后）**：同一请求 → **HTTP 401 `permission denied for function block_tutorials_for_project`**。漏洞确认关闭。

#### 2. 仓库内曾硬编码生产数据库口令 —— **已删除，未泄露**

- 证据：`packages/database/.tmp-activate-account.cjs:8-10` 曾明文包含 Supabase 生产 `postgres.<ref>` 超级用户口令与 pooler 主机；且该文件**不在 `.gitignore` 覆盖范围内**（该文件只忽略 `.env` 与 `.workbuddy/`）。
- 责任说明：**这是我在本次会话中写临时脚本时造成的**，不是既有代码的问题。
- 攻击路径：任何一次 `git add .`、打包或目录同步都会把全库写权限带出去。
- **已处理**：文件已删除；已用 `git log --all -- <path>` 确认**从未进入 git 历史**；`.workbuddy/` 经 `git check-ignore` 确认被正确忽略。
- **仍建议**：轮换该数据库口令（本次会话中它曾多次出现在命令行与日志里）。流程改进：临时脚本一律从环境变量读凭据——后续的 `20260910000200` 应用脚本已改成 `SUPABASE_DB_PASSWORD` 传参。

### P1 — 边界不严

#### 3. 匿名可获取账号绑定的邮箱（可枚举手机号）

- 证据：`supabase/migrations/20260910000100_phase_11_phone_password_auth.sql:102-120`（`resolve_login_email` 授权给 anon）；`apps/web/src/lib/identity-login-handler.ts:45-54`（把结果原样返回 `{email}`）
- 机制：BFF 直接把函数返回值透传给客户端。于是**只知道手机号**就能 POST `/api/v1/identity/resolve-login` 拿到绑定邮箱；并且 `null` 与非空可区分该号码是否已注册。
- **更正设计说明**：迁移注释与控制器注释里写的「无法枚举」**不成立**——控制器确实用哑邮箱抹平了*登录*路径的差异，但*这个解析接口本身*就是枚举器。
- 修复方向（未实施）：BFF 不再返回邮箱，改为接收 `{phone, password}` 并在服务端调用 Supabase 的 password grant，直接回传 session 给客户端 `setSession()`。这样邮箱不出服务端，且「未注册」与「密码错」在响应与耗时上都不可区分。

### P2 — 加固项

4. `actor_has_active_reference_role(uuid)`（`20260829000100_phase_7b_verified_allowlisted_references.sql:230-246`）同为 `SECURITY DEFINER` 且未 revoke，匿名可传任意 uuid 探测其角色成员身份。**已随 `20260910000200` 一并收回**——其调用方全部是其他 `SECURITY DEFINER` 函数内部的 `v_actor` / `auth.uid()` 自检。
5. 匿名被授予 `tutorial_versions` 全表 SELECT（`20260902000100_phase_8_tutorials.sql:316`），RLS 只按教程可见性过滤行，导致已发布教程的 `created_by`（内部审核人 user id，列定义 `:75-77`）与 `source_signal_ids`（内部 id）对匿名可见。建议改为列级 grant，只授予渲染真正需要的列。
6. 旧版 `update_user_task(uuid, bigint, jsonb)` 仍 grant 给 `authenticated`（`20260809000500_execution.sql:430-434`）。Phase 10 只 revoke 了四张表的 DML，未撤销这个 RPC，形成绕过命令边界的旁路：更新不写 `user_task_events` / receipt、不校验限额，与「每次变更都追加历史」的设计相悖。

**未发现问题（明确）**：59/59 张表全部启用了 RLS；`anon` / `authenticated` 上不存在 `using(true)` 策略（放宽策略只用于 `ai_stage_worker` / `collection_worker`，且浏览器角色不继承它们）；仓储层全部使用参数化 tagged template，无 SQL 拼接注入；无 `not valid` 约束、无破坏性 drop；客户端 bundle 未混入 `service_role` key（web 仅用 anon key）；唯一的 owner 视图 `project_reference_current_state` 已对浏览器角色 revoke。

---

## 三、产品完整性与体验

### A. 声称有、实际不可用（第一性原理：系统声称的每条数据路径必须真能跑通）

#### 1. 顶栏搜索是装饰品，不是功能

- 证据：`apps/web/src/components/app-shell.tsx:110` —— `topbar-search` 渲染成 **`<div>`**，不是输入框。
- **实测**：首页 HTML 里该元素为 `<div class="topbar-search">`，内部**没有 `<input>`**，全站也没有任何搜索接口。
- 影响：用户会以为能搜索，点击/输入毫无反应——比"没有搜索"更糟，因为它先建立预期再落空。

#### 2. `/tutorials` 列表页 404 —— 更正：这是设计如此，真正的问题是「没有入口」

- **实测**：`https://airdrop-intelligence-os.vercel.app/tutorials` → **404**。
- **复核后更正**：这不是缺陷。`packages/contracts/src/tutorials/projections.ts:52-56` 的 `publicTutorialListQuerySchema` 把 `projectId` 定为**必填**——教程在设计上就挂在项目之下，不存在「跨项目的教程列表」这个实体。因此没有列表页是正确的，侧栏不放「教程」项也合理。
- **真正的问题**：教程**没有任何可发现的入口**。它只能在项目详情页里以卡片形式出现（`components/tutorial/public-tutorial.tsx`），而当前 `tutorials` 表是空的，所以整条链路对用户完全不可见。
- 结论：需要补的不是页面，而是**「哪里能找到教程」的可见性**——等有教程数据后，在项目详情页与机会列表中体现。

#### 3. 「已连接远程数据源」是硬编码，不是真实状态

- 证据：`apps/web/src/components/app-shell.tsx:141` 固定文案。
- **实测**：首页 HTML 中确实存在该字符串。
- 影响：这是一个**真实的状态指示器位置被假状态占用**。用户被明确告知系统已连接数据源，而实际上采集链路完全没跑（见 B1）——属于"不可逾越的红线"里"未经验证不得声称已确认"的同一类问题。

#### 4. 审核工作区"进得去、用不了"（无授权入口）

- 证据：`app/review/layout.tsx:30` 要求 reviewer 角色；`packages/database/src/identity/*` 无角色授予能力。
- **实测（全仓检索复核）**：`insert into public.user_roles ... 'reviewer'` 只出现在**测试文件**（`supabase/tests/*.test.sql` 等 8 处）与**文档里的手工 SQL**（`docs/runbooks/local-development.md:174-175`、`docs/HANDOVER.md:1379-1380`）。**Web 层不存在任何授予入口**。
- 影响：`/review/**` 是红线的执行者——把候选池里的内容**人工提升为权威数据**正是靠它。目前只能手工连数据库执行 SQL 才能进去。对单人自用尚可接受，但作为产品能力它是缺的：**没有它，采集进来的数据永远无法合法入库**。

### B. 整条链路断掉的

#### 1. 采集链路线上完全没跑，且没有任何界面暴露这件事

- 证据：`supabase/migrations/20260812000800_source_collection.sql:24`（默认状态为待采集）、`apps/worker/src/queue/create-queue-runtime.ts:57`。
- 机制：采集 job 没人 claim、没人执行、没有调度；`/api/v1/admin/source-collection-schedules` 只是配置读写。
- 后果：**没有任何项目会自然产生**。现有 2 个项目是手工种子，页面也不会显示"这是样例数据"。

#### 2. 审核闭环两端都断

- 证据：`supabase/migrations/20260820000100_canonical_intelligence_governance.sql:70`（候选状态需人工审核）、`:748`。
- 机制：无审核者入口（A4）+ 无采集（B1）→ 写进候选池的只有测试 fixture，`/review/ai-runs` 因此永远无数据。

#### 3. 首页"最新信号"表格基本恒空

- 证据：`supabase/migrations/20260809000700_read_models.sql:142`（要求 `published_at <= now()` 且项目为 active/rumored）；种子信号 `published_at` 为 2026-09-10。
- 机制：这条本身逻辑正确（不该显示未来数据），但**没有"已就绪但尚未到发布时间"的提示**，用户只看到一个空表格，无法判断是"坏了"还是"还没到"。

### C. 关键缺失功能（按重要性）

1. **搜索**（对接 A1）——全站唯一的数据发现手段缺失。顶栏已经预留了位置却是个空壳，成本极低、收益最高。
2. **通知/提醒**——产品核心价值主张是"别错过窗口"，但没有任何到期提醒、新信号提醒、评分变化提醒（README「Notification 域」是空的）。
3. **数据时效与新鲜度指示**——页面上没有"最后更新时间""数据来源""这是样例数据"的标识。这是**最高优先级的诚实性问题**：当前种子数据绕过了全部 red line 防护，而界面看起来像是在展示真实情报。
4. **机会列表的全局筛选与排序**——只能按固定四个 tab 切，不能排序、不能按公链/生命周期/风险等级筛选，50 个项目时就不可用了。
5. **参与状态的推进与提醒**——`user_projects` 有状态，但没有任何"下一步该做什么/何时截止"的驱动机制。
6. **数据导出与分享**——无法把机会列表或项目结论导出，限制了"团队协作"场景。
7. **移动端适配**——侧栏在窄屏隐藏（`app/globals.css:625`），但**没有任何替代的移动导航**；信号、审核等宽表格在手机上不可用。
8. **多链支持**——钱包地址硬编码只支持 EVM（`packages/contracts/src/identity/enums.ts` 的 `walletChainSchema = z.enum(['evm'])`）。
