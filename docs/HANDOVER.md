# Airdrop Intelligence OS — 交接手册

> 交接日期：2026-08-14（WorkBuddy → GPT Codex）
> 最近更新：2026-09-01（**Phase 7B Task 5 migration25 disposable GREEN 在单次同步路径错误处 BLOCKED，误放文件已精确清理**；需 fresh corrected GREEN 授权。）
> 权威规范：仓库根目录 `AGENTS.md`（产品规则与工程约束的唯一事实来源，本手册不重复其内容，只补充现状与经验）
>
> **当前一句话状态（2026-09-01 Phase 7B 实施中）**：Task 1–4 已完成；Task 5 Fix Round 1 本地实现/审查已完成。首次 migration25 disposable GREEN 的 local/remote preflight 通过，但 combined SCP 把两个文件误放到远端 `supabase/` 根目录；执行在 reset 前 fail-closed 停止，误放文件经 SHA 核对后精确删除，最终仍为 24 migrations/max migration24、marker=1。详细 Steps 10–11/master Step 4 未完成，需 fresh corrected GREEN 授权。Task 6–10 尚未实现；生产仍为 19 个已应用迁移，第20–25个按 production unapplied 处理。

**2026-08-31 Task 5 migration25 disposable GREEN AUTHORIZED**：在 controller 请求 exact phrase 后，项目所有者回复 `Task 5 migration25 disposable GREEN`。本次单次授权仅含 fail-closed preflight、只同步最终 migration25/016、一次 disposable reset、focused/full pgTAP、双 typegen 与 committed 158,662-byte types 逐字节无漂移证明、临时 IPv4 16432/16433 tunnels + 0600 四变量 endpoint parity、一次 sequential Task 4+5 integration、独立 residue 与 remote/local temp/tunnel exact cleanup。明确排除 production/54321/54322、source/test/dependency 编辑、第23/24 migration 修改、generated types 替换、额外 reset 或 integration rerun。详细 Step 9 已勾选；当前尚未连接远端或执行任何授权动作。

**2026-08-31 Task 5 migration25 disposable GREEN local preflight COMPLETE**：授权 bookkeeping HEAD `f34de67` 且 tracked worktree clean；SSH key mode `0600`、local `16432/16433` closed、Task1C env/socket names absent。Node runtime `/Users/xixi/.workbuddy/binaries/node/versions/22.22.2-2/bin/node` 精确 `v22.22.2`；seed/23/24/25/014/015/016/Task4/Task5 integration/generated types hashes exact，migration25=591 lines、016=292 lines、types=158,662 bytes。首次只读 types 路径探查误指向不存在的非-generated path，未触及远端，随后使用 committed `src/generated/database.types.ts` 完整复核通过；下一步 remote read-only preflight。

**2026-08-31 Task 5 migration25 disposable GREEN remote preflight COMPLETE**：仅 disposable 的远端只读 preflight exit 0：exact workdir/project/CLI `2.112.0`、DB/Kong running+healthy 且 only `64322/64321`、24 migrations/max `20260830000100`、paused marker=1；seed/23/24/014/015 hashes exact，remote migration25/016 与本轮 remote typegen temp 均 absent。尚未 sync/reset/test/tunnel/production；下一步仅 single sync migration25+016。

**2026-09-01 Task 5 migration25 disposable GREEN sync — BLOCKED**：本轮唯一 combined SCP 的 destination 错设为共同目录 `/root/airdrop-governance-test/supabase/`，SCP 保留 basename，因而 migration25（20,364 bytes）与 016（11,933 bytes）分别落到 `supabase/20260831000100_phase_7b_reference_security_locking.sql`、`supabase/016_phase_7b_reference_security_locking.test.sql`；要求的 `migrations/` 与 `tests/` 目标保持 absent。立即在 reset/pgTAP/typegen/tunnel/integration 前 fail-closed 停止；未访问生产。根因已收敛：修复版只能使用两条明确 source→exact-file destination 的同步命令，禁止 common-directory combined SCP。

**2026-09-01 Task 5 migration25 disposable GREEN mismatch cleanup COMPLETE / BLOCKED stop**：独立诊断确认误放的两个文件存在、正确目标 absent、DB/Kong healthy、数据库仍为 **24 migrations/max `20260830000100`**。删除前逐文件 `sha256sum -c` 精确匹配授权 SHA `e0f1f5bf…8f29` / `0fa44939…bd20`；随后仅删除这两个误放路径并复核四个候选路径全部 absent。最终 marker=1，本地 16432/16433 closed、Task1C temp absent。两次 controller cleanup probe 分别在本地 `$PWD` 展开和 remote `awk`/`set -u` 处于任何 mutation 前失败，最终 hash-guarded cleanup exit 0。无 reset/test/typegen/tunnel/integration/source change/production；Steps 10–11/master Step 4 保持 unchecked，fresh corrected authorization required。

**2026-08-31 Task 5 Fix Round 1 Phase B — local GREEN COMPLETE**：仅在 `submit_decide_domain_authority` 与 `submit_decide_reference` 的 strict Evidence→Raw Item→Source resolution 后、各自条件 source lock 前加入 exact `v_evidence_id is not null and v_evidence_source_id is null` → `reference_evidence_required` / `AR209` guard。migration25 现 **591 lines / SHA-256 `e0f1f5bf4bb00ca029f954cfe1084412d8ea3dd83e24d5a03a44e621c8d88f29`**；静态检查确认恰好两处 guard，均为 resolution < guard < source lock。integration 保持 SHA `1d6e7c97…f601b`；23/24、016、generated types、scripts 未改。Node 22.22.2 direct eslint/`tsc --noEmit` exit 0，focused Vitest 为 **1 passed / 1 environment-gated skipped file; 29 passed / 5 skipped tests / exit 0**。无 DB/remote/tunnel/reset/typegen/production；详细 Steps 7–8/master Step 3 已重新勾选，disposable SQL/behavioral GREEN 仍需单独授权。

**2026-08-31 Task 5 Fix Round 1 scoped re-review CLEAN**：独立 reviewer 对 `b696b82..826fa2c` 判定原 I1 **ADDRESSED**，最终 **APPROVED / 0 Critical / 0 Important / 0 Minor**。复核确认 mismatch regression 使用真实、FK-valid 且 source id 不一致的 Evidence/raw item，仍精确五个 integration tests 并由既有 exact cleanup/residue 接管；两个 RPC 各恰有一处 guard，位置均为 strict resolution 后、source advisory lock 前，精确抛 `AR209`。replay、锁序、receipt、audit/outbox、owner、signature 未漂移，第23/24 migration、016、generated types 与 package scripts 未改。本地 skipped 明确不算数据库行为 GREEN；Task 1B 本地实现/审查已闭环，下一步仅在新授权后执行 Step 9–11 disposable GREEN。

### Phase 7B verified allowlisted references（Task 1–4 完成；Task 5 计划已批准）

**2026-08-31 Task 5 Step 7 migration25 local implementation COMPLETE**：新增 `20260831000100_phase_7b_reference_security_locking.sql`（583 lines / SHA-256 `2e8013ccd041be9de2ed7910a707401ee96e051d132fa47b34bf90011242ce37`），仅以 `CREATE OR REPLACE` 替换 indicator trigger、reference decision RPC 与 domain-authority decision RPC。trigger 以 UUID text 排序并在 reference advisory wait 后重读版本；reference RPC 的 non-replay path 为 Evidence source → matching domain_authority → reference → aggregate `FOR UPDATE`，authority RPC 为 Evidence source → domain_authority → aggregate `FOR UPDATE`；Evidence 解析强制 Evidence→Raw Item→Source 的 source identity 一致。无 project-wide lock、新 schema/RPC/依赖或数据库/远端/生产访问。自审依据 relation correction 改为 `(project_id, normalized_domain)` 匹配 authority，而非不存在的 reference authority column。

**2026-08-31 Task 5 Step 8 local GREEN/static alignment COMPLETE**：`git diff --check`、不可变 migration23/24、016、integration 与 158,662-byte generated types hash 均通过；Node 22.22.2 direct database eslint/`tsc --noEmit` 均 exit 0，focused Vitest 为 **1 passed file / 1 environment-gated skipped file; 29 passed / 5 skipped tests / exit 0**。静态检查确认恰有三项函数替换、三个 owner、锁类顺序 `reference; source→domain_authority; source→domain_authority→reference`、两条 Evidence source identity 一致 join、authority `(project_id, normalized_domain)` 匹配及无 schema-shape DDL。未运行 SQL compile 或行为 GREEN；下一步须获 disposable GREEN 授权。

**2026-08-31 Task 5 Fix Round 1 Phase A — REVIEW REOPENED**：review I1 发现 strict Evidence→Raw Item→Source join 在三方 source id 不一致时返回 null，旧 migration25 随后跳过 source lock，而 `reference_evidence_is_usable()` 只看 Evidence source posture。仅扩展既有 restore/history 用例（仍精确 5 个具名 tests）：插入 Evidence source_id 为 target active source、raw_item_id 属于不同 active source 的真实 mismatch row，restore 必须返回 `AR209`，version/decision/outbox/history/released flag 均不变，随后有效 Evidence restore 断言保持。mismatched Evidence ID 已加入 exact cleanup/residue `evidenceIds`。migration25、23/24、016、generated types、scripts 未改；migration25 SHA 仍 `2e8013cc…ce37`。Node 22.22.2 eslint/tsc exit 0，focused no-env integration **1 skipped file / 5 skipped tests / exit 0**；这是静态 RED，未运行数据库/远端/tunnel/reset/typegen/production。详细 Steps 7–8 与 master Step 3 已取消勾选，等待测试复核后的 narrow disposable RED 授权；本轮明确未加入 SQL guard。

**2026-08-31 Task 5 Fix Round 1 Phase A test review CLEAN**：独立 reviewer 对 `b696b82..f07207b` 返回 **Test readiness APPROVED / 0C / 0I / 0M**。确认 mismatch 行的 Evidence source 与 raw-item source 均为真实 FK target 且值不同；migration24/未 guard draft 会错误成功，使 `.rejects {code: AR209}` 必然失败而非空转；version/decision/outbox/history/flag release 全部受保护，有效 restore 与 exact cleanup/residue 仍保留。migration25 未改、详细 Steps 7–8/master Step 3 保持 unchecked。本地 skipped 不构成 behavioral RED；下一步只请求不含 sync/reset 的 narrow disposable integration RED 授权。

**2026-08-31 Task 5 mismatched-Evidence focused RED AUTHORIZED**：项目所有者明确授权仅做 disposable read-only preflight、临时 IPv4 16432/16433 tunnels + 0600 四变量 env/parity、在原 24-migration schema 上运行一次 SHA `1d6e7c97…f601b` integration，以及 20 类 residue/temp exact cleanup/final read-only check。明确禁止任何 file sync、016、reset、pgTAP、migration25/任何 migration operation、typegen、第二次 run、生产/54321/54322。验收形状为 **5 tests / 4 failed / 1 passed**：三条 named missing-waiter + mismatched Evidence 被错误接受的 helper error，cleanup PASS；任一不同清理后 BLOCKED。

**2026-08-31 Task 5 mismatched-Evidence RED local preflight COMPLETE**：授权记录 HEAD `e97293b` 且 tracked worktree clean；SSH key mode `0600`、local `16432/16433` closed。integration SHA `1d6e7c97…f601b`、local draft migration25 `2e8013cc…ce37`、016 `0fa44939…bd20`、migration23/24 hashes 均与简报精确一致；draft migration25/016 仅本地只读核验，绝不复制或应用。尚未连接远端、建隧道或访问生产；下一步仅 remote read-only preflight。

**2026-08-31 Task 5 mismatched-Evidence RED remote preflight COMPLETE**：只读 disposable preflight exit 0：exact workdir/project/CLI `2.112.0`、DB/Kong running+healthy 且 only `64322/64321`、24 migrations/max `20260830000100`、paused marker=1、remote migration25/016 absent。未 sync/copy/reset/pgTAP/migration operation/tunnel/production；下一步仅 IPv4 tunnel/env/parity。

**2026-08-31 Task 5 mismatched-Evidence RED tunnel/env/parity COMPLETE**：仅 IPv4 `127.0.0.1:16432→64322` 与 `127.0.0.1:16433→64321`；local env `/private/tmp/phase7b-task5-mismatched-evidence-red.env` mode `0600`、恰好四个授权变量名，未输出值。先前 runtime 目录轮换使旧 Node 22 path absent，自动 cleanup、无 integration/sync/copy；经 `task-1b-report.md` 记录确认新 `/Users/xixi/.workbuddy/binaries/node/versions/22.22.2-2/bin/node` 为 `v22.22.2` 后继续。remote psql、tunnel PostgreSQL、anon PostgREST active/rumored count 都为 **2**，parity PASS；下一步唯一 integration。

**2026-08-31 Task 5 mismatched-Evidence RED integration ACCEPTED**：唯一 Node `v22.22.2` / `--no-file-parallelism` run 为 **1 file / 5 tests / 4 failed / 1 passed / exit 1**。flag-first/verify-first（1.985s）、revoke-first/verify-first（1.398s）、source-block-first（1.492s）均快速精确 `reference_security_advisory_wait_not_observed:1`；restore/history 以新 helper error `reference_security_restore_with_invalid_evidence_succeeded` 失败，证明 migration24 错误接受 source/raw mismatch（应 AR209）；exact cleanup test PASS。无 timeout、SQL/connection/harness/TAP 或额外失败；立即 cleanup，Steps7/8/master Step3 仍 unchecked。

**2026-08-31 Task 5 mismatched-Evidence RED cleanup COMPLETE / ACCEPTED**：remote 独立 **20/20** owned fixture residue categories 均为 zero；SSH master closed，local `16432/16433` closed，env/control socket absent。最终远端只读为 24 migrations/max `20260830000100`、paused marker=1、remote migration25/016 absent。无 sync/copy/reset/pgTAP/migration operation/typegen/production/source change/second run；精确 RED 已接受，但只授权后续本地 AR209 guard 修复，Steps7/8/master Step3 保持 unchecked。

**2026-08-31 Task 5 corrected locking design**：预检确认原计划“仅集成测试、不改迁移”与已批准 spec/最终验收的 shared target lock 要求冲突：现有 reference/authority 函数只有各自 aggregate row `FOR UPDATE`，没有调用 Phase 7A `security_target_lock_key_v1()`；仅在测试夹具手动加锁会形成假证明。项目所有者已批准 corrected 方案：保持第23/24 migration 字节不变，新增第25个 `20260831000100_phase_7b_reference_security_locking.sql` + `016` pgTAP。规格自审进一步排除了 project-wide keys：一个全局域名 indicator 可跨项目命中，而 Phase 7A 事务可能预持有不同 project/source key，继续锁其他 project 会产生反序死锁。最终顺序收紧为同一 helper namespace 内 Evidence `source` → matching `domain_authority` → `reference` → aggregate row locks；indicator trigger 按 reference UUID 排序。migration25 只替换 trigger + 两个 decision RPC，不改注册命令/schema/RPC shape；双 typegen必须与 Task 4 逐字节一致。真实 integration 覆盖两个竞争顺序、restore/history、blocked-source Evidence 与零残留，并加入显式 `test:integration` 列表。当前仅写入设计与交接文档，未写测试/SQL、未连接 disposable/远端/生产；下一步等待书面规格复核。

**2026-08-31 Task 5 corrected implementation plan**：书面规格确认后已新增独立 272 行实施计划 `2026-08-31-phase-7b-task-5-reference-security-locking.md`，并把主 Phase 7B 计划的旧 tests-only Task 5 段落替换为五步入口。详细计划锁定：clean/hash preflight；5 条 self-contained integration 行为测试；18 条 016 pgTAP；test-only disposable RED 授权停点；migration25 最小三函数替换；local GREEN；第二次 disposable GREEN 授权；reset→focused/full pgTAP→无漂移双 typegen→两文件 real-race integration→独立清理；fresh 五 workspace gate、review 与两次提交。placeholder/type/scope 自审通过，尚未写 RED 或 SQL、未访问远端/数据库/生产。下一步按 writing-plans 技能由项目所有者选择 Subagent-Driven（推荐）或 Inline execution。

**2026-08-31 Task 5 plan final self-review / commit**：声明 Node 22.22.2、`git diff --check`、仓库占位符脚本、272 行/13 steps/5 integration names 与关键约束结构检查全部 exit 0；第23/24 migration、015、generated types SHA 分别保持 `75e038d8…5966` / `570e6b89…aad8` / `a34cced6…5dd5b` / `e5dc3861…aedef`。两次通过 pnpm wrapper 启动检查分别在脚本前被缺失 Node PATH、registry/TTY 依赖自检阻断，未改依赖；随后直接执行同一 `scripts/check-placeholders.mjs` 通过。计划已以 `docs: plan phase 7b task 5 locking` 提交为 **`c28f6a2`**。尚未写 RED/SQL、未连接数据库或远端、生产未访问；下一步仅等待执行方式选择。

**2026-08-31 Task 5 SDD Step 1 baseline COMPLETE**：项目所有者选择 Subagent-Driven；已确认当前目录是 linked worktree、分支 `codex/phase-7b-references`、起始 HEAD `3f688e3`，并建立本计划独立 gitignored ledger。第23/24 migration、015、generated types 分别保持 SHA `75e038d8…5966` / `570e6b89…aad8` / `a34cced6…5dd5b` / `e5dc3861…aedef`，types 为 158,662 bytes。声明 Node 22.22.2 下 database lint/typecheck exit 0，Vitest **14 passed / 10 gated files，287 PASS / 69 gated tests**。首次组合命令仅因从 database 目录使用仓库根相对哈希路径而在测试前中止；拆分正确 cwd 后全绿。执行裁定：单一 Task 依授权停点分为 1A local RED、1B migration GREEN、1C final verification/commit，串行代理、逐单元规格+质量复核；016 的函数定义检查仅作结构补充，真实 advisory wait integration 为行为主证据。未写 RED/SQL、未连接数据库/远端/生产；下一步派发 1A。

**2026-08-31 Task 5 SDD 1A Step 2 integration RED artifact COMPLETE**：新增环境门控 `packages/database/src/tests/reference-security-coupling.integration.test.ts`，含五个具名真实路径：同 reference key 的 flag-first/verify-first、同 authority key 的 revoke-first/verify-first、Evidence-required restore/history、source-key wait 后 block-wins、exact cleanup/zero-residue。该套件使用 `owner`/`blocker`/`inserter` 三个 `max:1` PostgreSQL 连接、fresh Supabase auth clients 与真实 `ReferenceReviewRepository`；blocker 仅为观察屏障，生产 trigger/RPC 必须自己成为同 key waiter。未提供四个 integration 变量，故未执行任何数据库行为。

**2026-08-31 Task 5 SDD 1A Step 3 local gated RED checks COMPLETE**：`test:integration` 显式追加新文件；Node 22.22.2 直接入口 database eslint 与 `tsc --noEmit` 均 exit 0。focused Vitest 为 **1 file skipped / 5 tests skipped / exit 0**，确认环境门控而非行为通过。integration SHA-256 为 `4679ebd8df2de37debc49b75dd46a0a3430ce6fc34ff6b23896456268a7212aa`。真正 behavioral RED 仍未运行，必须先获得仅 disposable 的明确授权；未连接数据库、远端或生产。

**2026-08-31 Task 5 SDD 1A Step 4 pgTAP 016 structural RED artifact COMPLETE**：新增 `supabase/tests/016_phase_7b_reference_security_locking.test.sql`，`begin; plan(18); finish(); rollback;` 完整，含 trigger/reference/authority lock order 与 post-lock re-check、security-definer/owner/signature/privilege/direct-ledger denial 断言。016 SHA-256 为 `6d26ad0acecc7ebd9f69b6daec0d821cf717896365a3b366f0a676cfb4151ada`；`git diff --check` exit 0。函数定义断言仅为结构补充，load-bearing behavioral RED 仍待 disposable 授权；migration25 未创建，第23/24 SHA 仍为 `75e038d8…5966` / `570e6b89…aad8`。

**2026-08-31 Task 5 SDD 1A reviewer fix round 1 COMPLETE**：016 的全部七项 `strpos()` 位置断言现内嵌各自 token 的 `> 0` guards，缺失 lock、row lock 或 post-lock re-check 不再以 PostgreSQL `strpos` 的 `0 < positive` 误通过；仍精确 `plan(18)`。integration 的 restore 用例现在捕获 restore 前完整 decision history，要求缺 Evidence 不改变 history，且成功后仅 append 一个 `restore` / `verified` / 正确 Evidence / version 3 decision、原 history 按序不变；post-commit residue query 新增 `user_roles`、`profiles`、`security_incident_decisions`、`security_incident_indicator_links`、`security_indicator_evidence_links` 五项零计数。Node 22.22.2 database eslint/tsc 均 exit 0，focused Vitest **1 file / 5 tests skipped / exit 0**；016 envelope/18 assertion static check 与 diff check exit 0。当前 SHA：integration `9864d0d25262e04d9b51a3c18ad66e56e5e12a53379fc68785699aa8f2cdc3ae`、016 `0fa44939475ac0a3ac43c8caabc791c82a51589656dfe727e52517d0c011bd20`。behavioral RED 仍未运行，仍须 disposable 明确授权；未访问数据库/远端/生产，migration25 未创建。

**2026-08-31 Task 5 SDD 1A reviewer fix round 2 COMPLETE**：post-commit residue helper 现在对上一轮新增的每张 identity/security 表直接逐项断言 `0`：`user_roles`、`profiles`、`security_incident_decisions`、`security_incident_indicator_links`、`security_indicator_evidence_links`；保留通用全-row zero guard 以继续保护已有清理范围。Node 22.22.2 database eslint、`tsc --noEmit`、focused gated Vitest（**1 file / 5 tests skipped / exit 0**）以及 `git diff --check` 均 exit 0。integration 当前 SHA-256 `87b0a4ff73e3a9a6c19c8cec2a0c75005c97a15bcff9962c0a35e7c9300e9657`。behavioral RED 仍未运行，未访问数据库/远端/生产，migration25 未创建。

**2026-08-31 Task 5 SDD 1A scoped review CLEAN**：首个 reviewer 在返回 verdict 前因额度失败，未产生 findings；替补 reviewer 对 `06416a9..a08518c` 判定 scope/spec 合规、质量 0 Critical / 3 Important / 1 Minor。Round 1 提交 `d74ab87` 关闭 016 token-existence 与 restore append-only 两项，复审发现 residue 仅 select 未 assert；Round 2 提交 `e92d115` 增加五项直接零断言，最终 scoped re-review 判定全部 Important **ADDRESSED**、无新 Critical/Important。1A 实现链为 `a08518c` / `d74ab87` / `e92d115`；integration / 016 最终 SHA 为 `87b0a4ff…e9657` / `0fa44939…bd20`。唯一 Minor（主计划措辞未显式重复“behavioral RED 未运行”）按 SDD ledger 延后给 final review。详细计划 Steps 1–4 已勾选；behavioral RED 仍未运行，migration25 不存在，未连接数据库/远端/生产。下一步只请求 Step 5 test-only disposable RED 授权。

**2026-08-31 Task 5 Step 5 test-only disposable RED AUTHORIZED**：项目所有者已明确授权本轮仅执行：disposable 只读 fail-closed 预检、只同步最终 016、临时 IPv4 16432/16433 隧道与 0600 四变量环境、在当前 24-migration schema 上运行 focused 016 和唯一新 integration、exact fixture cleanup、关闭隧道并删除临时文件。明确禁止 reset、同步/应用 migration25、typegen、生产 `airdrop-intelligence-os` 与端口 54321/54322。详细计划 Step 5 已勾选；下一步从 exact identity/health/marker/hash/port/absence 预检开始，任一不一致立即停止。

**2026-08-31 Task 5 Step 6 disposable RED preflight COMPLETE**：本地 SSH key mode `0600`、IPv4 `16432/16433` 均关闭，seed/23/24/014/015/016/integration SHA 与授权简报完全一致且 migration25 不存在。只读远端预检 exit 0：精确 workdir/project/CLI `2.112.0`，DB/Kong running+healthy 且只绑定 `64322/64321`，24 migrations / max `20260830000100`、paused marker=1；seed/23/24/014/015 SHA 全部一致，remote migration25 与 016 均 absent。尚未同步、reset、建立隧道或访问生产；下一步仅同步 016 并核 SHA。

**2026-08-31 Task 5 Step 6 focused 016 RED COMPLETE**：仅同步 `016`，远端 SHA-256 `0fa44939475ac0a3ac43c8caabc791c82a51589656dfe727e52517d0c011bd20` 与本地完全一致。24-migration disposable schema 上 focused pgTAP 为 **Files=1 / Tests=18 / Failed=14 / exit 1**：Test 1–3 trigger reference-key/order/insert-before-flag，4–9 reference source/authority/reference key/order/row-lock/recheck，10–14 authority source/authority key/order/row-lock/recheck 均为预期缺 shared locks；Test 15–18 security-definer/owner/signature/privilege boundary PASS。无 SQL abort、TAP parse、No plan 或环境噪声，未 reset/同步 migration/typegen/访问生产；下一步建立临时 tunnel/env 后运行唯一 integration。

**2026-08-31 Task 5 Step 6 tunnel/env/parity COMPLETE**：同一 SSH master 仅 IPv4 `127.0.0.1:16432→64322` 与 `127.0.0.1:16433→64321`，local env 为 `/private/tmp/phase7b-task5-reference-security-red.env`、mode `0600`、恰好四个授权变量名，未输出值。remote psql、tunnel PostgreSQL（本机无 `psql`，改用已安装 `postgres` driver 并关闭连接）与 anon PostgREST 对 active/rumored projects 的同一只读计数均为 **2**，endpoint parity PASS；未访问生产/54321/54322。下一步只运行新的单一 integration file。

**2026-08-31 Task 5 Step 6 single integration result — BLOCKED before behavioral RED**：仅以 Node 22.22.2、`--no-file-parallelism` 运行 `reference-security-coupling.integration.test.ts`。sandbox 内首次连接 tunnel 被 EPERM、5 tests 未执行；授权的 tunnel 环境重跑为 **1 file / 5 tests / 4 failed / 1 passed / exit 1**。三个 race/source tests（`serializes flag-first…`、`serializes revoke-first…`、`waits on the Evidence source key…`）在 Vitest 5s 超时，restore/history test 报 `column public_reference.normalized_url does not exist`；`removes every Task 5 fixture and outbox row` PASS。该组不是可接受的 missing-lock behavioral RED，且测试字节需修复；按授权不改测试、不二次同步，现只做独立 residue/016/temp cleanup 并报告 BLOCKED。

**2026-08-31 Task 5 Step 6 blocker systematic diagnosis COMPLETE**：逐层回溯 migration23/24、generated types、014/015 与 Task 4 工作模式后确认两个测试根因。① `public_project_references` 精确暴露 `reference_id/project_id/kind/label/url/last_verified_at`，不暴露内部 `normalized_url`；broken helper 的 base-table URL join 越过 public contract，应直接按 `public_reference.reference_id` 计数。② waiter helper 的 200 次循环包含 200 次隧道 SQL 往返 + sleep，并非 2 秒墙钟 deadline；连同每 test 的 register 调用会先耗尽 Vitest 5s，使 `reference_security_advisory_wait_not_observed:1` 与 finally cleanup 来不及成为测试结果。最小假设修复：保持 exact blocker PID/key 查询与 rollback→allSettled 顺序，只改为 1000ms monotonic wall-clock deadline；不提高 Vitest timeout、不加 test-side production lock。无跟踪文件/数据库/远端变更；下一步原实现代理做这两项本地最小修复和门禁，随后 scoped review，再请求 fresh RED 授权。

**2026-08-31 Task 5 Step 6 cleanup COMPLETE / BLOCKED stop**：integration 内 exact cleanup test PASS；随后 remote 独立查询 Task 5 project/source/raw/Evidence/user/role/profile/reference/authority/command/decision/flag/indicator/incident/link/event/outbox **20/20 categories 均为 zero**。本轮加入的 remote `016` 已删除并复核 absent；SSH master 已关闭，local `16432/16433` closed，`/private/tmp/phase7b-task5-reference-security-red.env` 与 control socket 均 absent。最终只读复核仍为 24 migrations / max `20260830000100`、paused marker=1，remote 016/migration25 absent。未 reset/typegen/同步 migration/访问生产，test/production 字节未改且没有第二次 sync。因 `normalized_url` test harness error 与 three 5s timeouts，详细 Step 6 和主计划 Task 5 Step 2 保持 unchecked；待获准的本地 test 修复与新的 remote RED authorization。

#### 2026-08-30 Task 4 修订设计落盘

**2026-08-31 Task 4 max-page cursor focused RED**：收尾自审发现 reviewer list 的 `p_limit` 上限为 100，而 repository 只以 `rows.length > limit` 判断下一页；请求 `limit=100` 时无法 overfetch 第 101 条，因而会把仍有后续数据的完整上限页错误标记为末页。新增 100 行上限页具名回归后，目标断言精确 `expected cursor / received null`。同次从 monorepo 根直接运行的 browser export 用例因 Node 无法从根解析 workspace package 产生环境性第二失败，不属于产品 RED；正式 focused gate 将从 `packages/database` 工作区运行。下一步只改 `pageOf` 的上限页判断，不动 migration/RPC contract。

**2026-08-31 Task 4 max-page cursor focused GREEN**：先从 `packages/database` 工作区复跑，确认仅新增上限页断言失败（28 PASS / 1 expected FAIL），browser export 正常；随后以单一 `reviewerListMaximumLimit=100` 复用既有 RPC cap，并让共享 `pageOf` 在完整上限页保守返回最后一项游标。该策略不漏第101条，代价仅是总数恰为100时允许一个空末页。repository + entrypoints focused **2 files / 35 PASS / exit 0**；migration、RPC contract 与 generated types 均未改。下一步 fresh 全仓门禁与最终 diff 自审。

**2026-08-31 Task 4 fresh final gate / local COMPLETE**：五 workspace lint/typecheck/build 全部 exit 0；Vitest 为 contracts 167 + domain 410 + database 287 + worker 236 + web 242 = **1,342 PASS**，database/worker 共 **71 gated skips**。placeholder scanner 与其 2 条自测、`git diff --check` 均通过；server-only repository 精确扫描无 service-role/base-table fallback，唯一 `service.role` 命中是测试中的泄漏拒绝正则。辅助清理复核发现旧 158,522-byte typegen 临时文件仍在 `/private/tmp`，已按 Task 4 cleanup 范围删除；integration env 与 typegen temp 均 absent，16432/16433 无监听。本轮未连接任何数据库或远端，生产未访问。独立 reviewer 仍因额度未能读 diff，故完成结论来自主任务逐项自审与 fresh gate，不宣称 independent review clean。下一步原子提交 Task 4。

**2026-08-31 Task 4 commit COMPLETE**：Task 4 的 20 个实现/测试/迁移/文档文件已以 conventional subject `feat(database): add reference review repository` 提交为 **`93acfbf`**（4,693 insertions / 74 deletions）。提交只包含 Task 4 精确文件；生产未访问。下一步进入 Task 5，单独实现并证明 Phase 7A indicator → reference 的同步 security-coupling races。

项目所有者已批准修订 Task 4：不改已 reset 的 `20260829000100`，新增 `20260830000100_phase_7b_reference_review_boundary.sql` + `015_phase_7b_reference_review_boundary.test.sql`，正面补齐 protected reviewer list/detail/history RPC、strict query/cursor/authority/receipt contracts、内部 note 落库、域名权威 revoke 后公开链接同步失效，以及 `(project_id, normalized_url)` 唯一性。自审还删除了旧 spec 中与已批准角色边界和 Task 3 实现冲突的 `security_reviewer` restore 例外；Phase 7B 命令统一只允许 active reviewer/senior/admin。实施顺序固定为 contracts RED→GREEN、015 pgTAP RED、forward migration GREEN、repository RED→GREEN、经独立授权后的 disposable repository integration；Task 5 单独证明 Phase 7A security-coupling races。

书面规格确认后已进入 TDD。contracts RED 只改 `packages/contracts/src/references/commands.test.ts` 与 `projections.test.ts`；reference-focused run 为 **16 files，160 passed / 7 failed，exit 1**。7 个失败均为批准缺口：2 个 strict receipt、2 个 reviewer query/cursor、1 个 authority list/detail、2 个 decision note/history；既有 160 个用例通过。下一步写最小 schema GREEN；仍未访问数据库、SSH、远端或生产。

Contracts GREEN 最小修改 `commands.ts`、`projections.ts` 与根 `index.ts`：新增 domain/reference strict receipts、两套 `(updatedAt,id)` reviewer cursor/query、authority list/detail/history，以及 reference/authority history 的 strict decision/reason 和 bounded nullable note。focused 与完整 contracts 均为 **16 files / 167 PASS**，lint/typecheck exit 0；无依赖变更，仍未访问数据库、SSH、远端或生产。

本地新增 104 行 `supabase/tests/015_phase_7b_reference_review_boundary.test.sql`（SHA-256 `561a83d84e4f832f0f67ebbc355ed930260da4daffff5f32dc8cce4dad0785e4`），结构断言覆盖两张 decision note 列、4 个 bearer review RPC、项目级 URL unique、authority-granted render gate 与 execute privilege。`git diff --check` 通过；尚未同步或运行。下一步只可在新授权后向 marker-verified disposable workdir 复制这一 test 并执行 focused RED，不 reset、不复制 migration、不访问生产。

用户已授权 test-only focused RED。只读 fail-closed 预检确认 exact workdir/project、DB/Kong running+healthy 且只绑 64322/64321、paused marker、seed/第23迁移/014 SHA 全部匹配，remote 015 absent。首次 marker 查询因本地 shell 单引号剥离令 SQL 拼接字面量失真而 exit 1，发生在复制前；外层改双引号后同一只读查询 exit 0。下一步只复制 015 并核 SHA，不 reset、不复制 migration、不访问生产。

随后仅复制本地 015 到 disposable 同名路径，远端 SHA-256 `561a83d84e4f832f0f67ebbc355ed930260da4daffff5f32dc8cce4dad0785e4` 与本地精确一致。未 reset、未复制 migration、未访问生产；下一步只运行 focused 015 RED。

原 23-migration disposable 基线上 focused 015 为 **Files=1 / Tests=9 / Failed=9 / Result FAIL，exit 1**。失败 1–2 为 note 列，3–6 为四个 reviewer RPC，7 为 project-scoped unique，8 为 authority render gate，9 为 execute privilege；全部是批准缺口，无语法/fixture/环境噪声。未 reset、未复制/执行 migration、未 typegen、未访问生产。下一步本地扩充完整行为矩阵；更新版再次同步/RED 需新授权。

本地 015 随后扩为 **858 行 / 51 assertions**（SHA-256 `e6f9369ff713974bdc02289f4f13460ee19f8afc10ebcb479568c2f517420e96`），加入四 RPC exact OUT 列、public unsafe-field exclusion、六角色读矩阵、四命令 note round-trip/outbox exclusion、空 note、同/跨项目 URL unique、stable cursor/state filter/detail history 与 authority revoke public suppression。实际为 11 次 `set local role` 与 11 次 `reset role` 成对，`git diff --check` 通过。远端仍是旧 SHA `561a83d8…785e4`；覆盖新版并再次 focused RED 需要新授权，仍不 reset/不复制 migration/不访问生产。

新授权后重复只读预检全部通过：exact workdir/project、DB/Kong running+healthy 且只绑 64322/64321、paused marker、seed/第23迁移/014 SHA 均匹配；remote 015 精确仍为旧 SHA `561a83d8…785e4`。下一步仅覆盖该 test 并核新 SHA `e6f9369f…20e96`，不 reset/不复制 migration。

随后仅覆盖 disposable 同名 015，远端 SHA-256 `e6f9369ff713974bdc02289f4f13460ee19f8afc10ebcb479568c2f517420e96` 与本地精确一致。未 reset、未复制 migration、未访问生产；下一步只运行新版 focused RED。

新版旧基线首跑执行到 22 assertions，其中 19 failed 均为预期结构/note/unique 缺口；随后 line 483 在 pgTAP wrapper 外直接读取尚不存在的 `decision.note`，产生未捕获 SQL error 和 No plan found，余下授权/cursor/revoke 矩阵未执行。系统化定位根因为 test harness 未动态包装预期缺列查询，不是产品或环境。未 reset、未复制/执行 migration、未访问生产；下一步本地修复测试后重新授权 RED。

本地已最小修复该 harness：两处 note round-trip 不再在顶层静态解析缺失列，而是由动态 SQL `lives_ok` 写入临时结果表，再用 `is()` 校验存储值；因此旧 schema 上缺列应作为 pgTAP 失败继续执行，而不会中止整份计划。修复版为 **875 行 / 53 assertions**，SHA-256 `ba1c0bb5819740886e0032ccd3cc398a44448db3b431473f310d553d98512aef`；11 次 `set local role` 与 11 次 `reset role` 精确成对，`git diff --check` 通过。远端仍为上次授权同步的旧 SHA `e6f9369f…20e96`；重新预检、覆盖和 focused RED 均需新授权，不 reset、不复制/执行 migration、不 typegen、不建隧道、不访问生产。

用户已授权修复版 test-only focused RED。本地 source gate 复核 015 仍为 875 行、SHA `ba1c0bb5…12aef`，seed/第23 migration/014 SHA 仍分别为 `f1ceaddc…7e55` / `75e038d8…5966` / `31cee8dc…bd68`，diff check 通过。首次远端只读预检在 marker 查询处 fail-closed：SQL 误读不存在的 `projects.status`，返回 undefined column / exit 1；任何复制尚未发生。本地 `20260809000300_catalog.sql` 与 seed 已确认项目状态列实际为 `lifecycle`。下一步仅以该列名修正重复只读预检；授权范围不变。

改用 `projects.lifecycle` 后重复只读预检 exit 0：`/root/airdrop-governance-test` / `airdrop-intelligence-governance-test` 精确匹配，DB/Kong 均 running+healthy 且唯一端口为 64322/64321，paused marker 精确返回；seed/第23 migration/014 SHA 与本地一致，remote 015 精确仍为旧 SHA `e6f9369f…20e96`。下一步仅覆盖这一同名 test 并校验新 SHA `ba1c0bb5…12aef`；其余禁止项不变。

随后仅以 SCP 覆盖 disposable 同名 015，复制 exit 0；远端 SHA-256 `ba1c0bb5819740886e0032ccd3cc398a44448db3b431473f310d553d98512aef` 与本地精确一致。未 reset、未复制/执行 migration、未 typegen、未建隧道、未访问生产；下一步只运行 focused 015 RED。

focused 015 在旧 23-migration 基线上 exit 1：已执行 49 assertions，其中 43 failed，均命中缺 note 列/四 RPC/exact outputs/命令 note/项目级 unique/角色授权/cursor/detail/revoke 等预期产品缺口，并已越过上轮 line 483 中止点。随后第 822 行 anon 公共渲染断言读取 `pg_temp.phase_7b_015_reference_one`，因该测试临时 ID 表只授予 authenticated 而 permission denied；余下 4 个断言未执行，TAP 因 No plan found。根因是 test harness 临时表 grant 缺口，不是产品或环境；未 reset、未复制/执行 migration、未 typegen、未建隧道、未访问生产。下一步本地最小补 anon SELECT，更新 SHA 后需再次授权 test-only RED。

本地已做第二处最小 harness 修复：仅新增 `grant select on table pg_temp.phase_7b_015_reference_one to anon`，使 anon 公共投影断言可读取测试自有 ID，不改变任何 production table/view/RPC/grant。015 现为 **877 行 / 53 assertions**，SHA-256 `d7f4648a62f2c1eac1deb124d4c8c1dd765c61df1e4ac4f2deb9574802f0e9b9`；11 次 `set local role` 与 11 次 `reset role` 成对，`git diff --check` 通过。远端仍是上次同步的 SHA `ba1c0bb5…12aef`；重新预检、覆盖和 focused RED 需要新授权，其余禁止项不变。

用户已授权二次修复版 test-only focused RED。本地 gate 再次确认 015 为 877 行、SHA `d7f4648a…e9b9`，seed/第23 migration/014 SHA 未漂移且 diff check 通过；远端只读 fail-closed 预检 exit 0，exact workdir/project、DB/Kong running+healthy、唯一端口 64322/64321、paused marker 与三项基础 SHA 均匹配，remote 015 精确仍为上一版 `ba1c0bb5…12aef`。下一步仅覆盖同名 test 并核新 SHA。

随后仅 SCP 覆盖 disposable 同名 015，copy exit 0；远端 SHA-256 `d7f4648a62f2c1eac1deb124d4c8c1dd765c61df1e4ac4f2deb9574802f0e9b9` 与本地精确一致。未 reset、未复制/执行 migration、未 typegen、未建隧道、未访问生产；下一步仅运行 focused 015 RED。

二次修复版 focused 015 完整 RED：**Files=1 / Tests=53 / Failed=46 / Result FAIL / exit 1**，TAP 正常完成，无 SQL 中止、parse error 或 No plan found。通过的 7 项是旧基线仍应保留的安全/fixture 约束；46 个失败精确覆盖两张 decision note、4 个 reviewer RPC 与 exact OUT、安全字段排除、命令 note 接受/落库、项目级 unique、active reviewer/senior/admin 与 ordinary/security-only/revoked/anon 矩阵、稳定 cursor/filter/detail/history，以及 authority revoke public suppression。未 reset、未复制/执行 migration、未 typegen、未建隧道、未访问生产。下一步只在本地编写第24个 forward-only migration；应用/验证数据库需新授权。

本地已新增第24个 `20260830000100_phase_7b_reference_review_boundary.sql`，**1,233 行 / SHA-256 `04a912f937a923666557b58fb9de6cac3a6e4bc52ad34f2332edab7563561faa`**。最小范围包括：两张 append-only decision 表新增 bounded nullable note；global URL unique 改为 `(project_id, normalized_url)`；四个 mutation RPC 接受并持久化合法 note，同时仍以完整 payload 计算 input hash 且 receipt/outbox 不含 note；public render helper 加 matching granted authority；四个 security-definer reviewer list/detail RPC 逐次复核 `auth.uid()` + active reviewer/senior/admin，使用 `(latest decision created_at desc, id desc)` 游标并输出 exact allowlist/history；PUBLIC/anon/后台角色先 revoke，仅 authenticated execute。逐函数 diff 证明既有角色/Evidence/版本/幂等/事务性 outbox 逻辑未漂移；第23 migration SHA 仍 `75e038d8…5966`，015 SHA 仍 `d7f4648a…e9b9`，`git diff --check` 通过。本机无可用 PostgreSQL parser/runtime，故尚未证明 SQL 编译或 GREEN；下一步需要新授权只在 marker-verified disposable 栈同步 migration、reset、跑 focused/full pgTAP 并双次 typegen。生产未访问。

用户已授权第24 migration disposable GREEN。只读 fail-closed 预检 exit 0：远端精确为 23 个已应用 migration / 最高 `20260829000100`，第24 migration 文件不存在；exact workdir/project、DB/Kong running+healthy、唯一端口 64322/64321、paused marker、seed/第23/014/015 SHA 全部匹配。本地 generated types 基线为 156,630 bytes / SHA `c5f5cbe70e0f0f7b7a95c1297fa89c523f3deea23abba6aee679a4317c8253bf`。下一步仅同步第24 migration 并核 SHA，通过后才执行授权 reset。

随后只把本地第24 migration 同步到 `/root/airdrop-governance-test` 的同名路径，未复制其他文件；远端 SHA-256 `04a912f937a923666557b58fb9de6cac3a6e4bc52ad34f2332edab7563561faa` 与本地精确一致。下一步执行本次已授权的 disposable `db reset`；若 reset 失败则立即停止 focused/full pgTAP 与 typegen。

授权的 disposable `db reset` 随后 exit 0：第1–24个 migration 依序应用，第24 migration 成功通过 PostgreSQL 编译/执行，seed 和容器重启成功。reset 后只读复核返回 `24|20260830000100`，测试 marker 仍精确为 `90000000-0000-4000-8000-000000000019|disposable-integration-database-marker|paused`。下一步运行 focused 015；若失败则停止 full pgTAP/typegen 并进入系统化调试。

focused 015 随后按约定 fail-closed：前 8 条结构断言全部 PASS，但第100行 ACL 聚合调用 `has_function_privilege('PUBLIC', oid, 'EXECUTE')`，PostgreSQL 将 `PUBLIC` 当作真实角色名并报 `role "PUBLIC" does not exist`；run 为 Tests=8 / Failed=0 / SQL abort / No plan / exit 1。根因是测试 harness 的 PUBLIC ACL 检查写法，不是 migration 编译或前 8 个产品断言失败。full pgTAP 与 typegen 均未运行；下一步仅本地改用实际 ACL 展开检查，新的 015 字节需另行授权后才能覆盖/复跑。

本地已最小修复该 ACL harness：用 `aclexplode(coalesce(proacl, acldefault('f', proowner)))` 展开函数有效 ACL，并以 `grantee=0` 检查 PUBLIC execute，同时原样保留 anon 禁止/authenticated 允许断言。015 现为 **887 行 / 53 assertions**，SHA-256 `d6cb9ced5d15d26180a7debc109cfbe01036a8789b15458ed2a7c4c7a2fea465`；11 次 `set local role` / 11 次 `reset role` 成对，`git diff --check` 通过。第24 migration 未改、远端数据库仍处于已应用24个 migration 的 seed 状态、远端 015 仍是旧 SHA；覆盖修复版并恢复 focused→full→双 typegen 链需新授权。

用户授权修复版 015 GREEN 后，本地 source gate 再次确认 015 为 887 行 / 53 assertions / SHA `d6cb9ced…a465`，migration24、seed、014 SHA 未漂移，11 组 role 切换成对且 diff check 通过。首次远端 fail-closed 预检已通过 exact workdir/project、DB/Kong running+healthy 与唯一端口检查，但随后 SQL 字符串拼接中的单引号被 SSH 外层剥离，迁移计数语句变成非法 `|| | ||` 并 exit 1；任何复制尚未发生。下一步把 count/max 和 marker 字段拆成无拼接的独立只读查询后重复预检，原授权范围不变。

改用独立 `count(*)` / `max(version)` / marker count 查询后，重复只读预检 exit 0：远端精确 workdir/project、DB/Kong running+healthy 与唯一 64322/64321 端口、24 migrations / 最高 `20260830000100`、paused marker、seed/migration24/014 SHA 全部匹配；remote 015 仍精确为旧 SHA `d7f4648a62f2c1eac1deb124d4c8c1dd765c61df1e4ac4f2deb9574802f0e9b9`。下一步只覆盖修复版 015 并核新 SHA，不 reset、不访问生产。

随后只覆盖 disposable 同名 015，未复制其他文件、未 reset；远端 SHA-256 `d6cb9ced5d15d26180a7debc109cfbe01036a8789b15458ed2a7c4c7a2fea465` 与本地精确一致。下一步运行 focused 015；失败则立即停止 full pgTAP/typegen。

修复版 focused 015 完整 GREEN：**Files=1 / Tests=53 / Result PASS / exit 0**，无 SQL 中止、TAP parse error 或 No plan。PUBLIC ACL 展开检查已在真实 PostgreSQL 上执行通过。下一步按授权运行全量 pgTAP；若失败则停止 typegen。

随后全量 pgTAP 完整 GREEN：**Files=15 / Tests=1,477 / Result PASS / exit 0**，001–015 全部通过，证明第24 migration 未回归既有 schema/RLS/history/queue/governance/7A/7B ledger 行为。下一步按授权双次 typegen 并逐字节比较；仅一致时替换本地生成类型。

同一 disposable schema 上用 pinned CLI 连续 typegen 两次，生成物均为 **158,522 bytes**，SHA-256 均为 `24733d6d4e2b5721839c04ed70cafad057be6fecf9bed91c1f3c01484e97cf11`，`cmp -s` exit 0，证明生成稳定。下一步只下载第一份到本地临时目录，复核 SHA 后机械替换 `packages/database/src/generated/database.types.ts`。

第一份稳定生成物已下载到 `/private/tmp/phase7b-task4-database-types.ts`；本地复核仍为 158,522 bytes / SHA `24733d6d…cf11`。当前仓库 generated types 基线仍为 156,630 bytes / SHA `c5f5cbe7…53bf`；临时产物静态扫描包含四个 reviewer RPC 与两张 decision 表。下一步只机械替换该 generated 文件并运行本地静态/包级门禁。

本地 `packages/database/src/generated/database.types.ts` 已用稳定产物机械替换，随后 `cmp` 精确一致；最终为 158,522 bytes / SHA `24733d6d4e2b5721839c04ed70cafad057be6fecf9bed91c1f3c01484e97cf11`，相对旧文件只新增 73 行。四个 reviewer RPC 均可检索，`git diff --check` 通过。下一步运行 database 包窄门禁，再继续 bearer repository RED→GREEN；本轮不再做远端数据库写操作。

首次并行运行 database 包 lint/typecheck/test 均在代码执行前立即 exit 127，唯一错误为 `env: node: No such file or directory`；因此这不是源码或 generated types 的失败，也没有产生文件改动。当前非交互 shell 的 PATH 未包含此前基线使用的 Node 22。下一步只读定位既有 Node 22 安装路径，并通过 task-specific 显式 PATH 重跑三项门禁。

已定位 WorkBuddy Node `v22.22.2`，与仓库 engines 匹配；显式用它执行现有 pnpm 入口后，pnpm 在任何脚本前触发 registry metadata/dependency-status install，并因网络不可达和非 TTY 拒绝 modules purge 而三项 exit 1。没有依赖或源码改动，lint/typecheck/test 仍未执行。下一步直接以 Node 22 调用仓库已安装的 ESLint、TypeScript、Vitest 入口，避免 pnpm 的安装副作用。

随后用 Node 22.22.2 直接调用仓库现有 ESLint/TypeScript/Vitest，database 包窄门禁全部真实执行并通过：lint exit 0、typecheck exit 0、Vitest **13 passed / 9 environment-gated skipped，257 passed / 66 skipped**。未安装/清理依赖。至此第24 migration、focused/full pgTAP、stable typegen、本地 generated types 与 database 包门禁全部 GREEN；下一步进入 bearer-scoped reference review repository 的 RED→GREEN。

Repository RED 已完成：新增 `reference-review-repository.test.ts` 覆盖 per-call bearer、四 read/四 mutation exact RPC、双 cursor/空页、strict read/receipt parse、note/idempotency 保留、aggregate mismatch、完整 AR2xx 映射与 browser denial；`entrypoints.test.ts` 同时加入 package browser 条件断言。focused 2 files exit 1：新 suite 精确因 repository module absent 无法加载，browser 用例精确因 package subpath 未导出而失败；其余 5 个既有 entrypoint PASS，`git diff --check` 通过。下一步最小实现 repository/entry/browser/package export。

最小 GREEN 已实现：新增 `references/reference-review-repository.ts`、server-only `entry.ts`、直接抛错的 `browser-denied.ts`，package 增加条件 subpath，root 仅导出类型。repository 每次调用只使用入参 bearer、新建无持久 session 的 anon client，只调用 8 个 protected RPC；command 先 strict parse 并 canonical JSON，read/receipt 先 strict parse，错误仅映射 AR201/202/203/204/206/207/208/209/210/299。focused **2 files / 34 PASS**，`git diff --check` 通过。下一步 database 全量 test/lint/typecheck。

Database 全量本地 GREEN：lint/typecheck 均 exit 0，Vitest **14 passed / 9 environment-gated skipped，286 passed / 66 skipped**。没有依赖修改；repository 的 conditional export 未回归既有模块。计划 Step 7 完成。下一步只在本地准备 `reference-review-repository.integration.test.ts` 的 active/revoked bearer、per-call separation、note、project duplicate、replay/version conflict、cleanup/zero-residue 矩阵；实际隧道/数据库执行需另行显式授权。

本地 integration 准备完成：新增 3 条真实 PostgREST/PostgreSQL 测试，覆盖 authority/reference note round-trip、同 key replay、stale version、同项目 duplicate 与跨项目相同 URL、同 repository 的 bearer 分离、role revoke 后下一调用立即拒绝；fixture 全部为 run-scoped UUID，afterAll 先精确清理，再在提交后检查 references/authorities/commands/outbox/projects/auth users 零残留。无环境变量时 focused 为 1 file / 3 skipped；lint/typecheck exit 0，database full **14 passed / 10 gated skipped，286 passed / 69 skipped**。integration SHA `e213ab348061c68f154908273358cac31be6c638eeaca43e2d3cd01f88e1b2dd`，repository SHA `b7a54748ad38020c9356d967dfa31cfe474735c32ff7d826badda3b995eea440`，015/migration24 SHA 未漂移，`git diff --check` 通过。下一步需新授权后才可做远端 fail-closed preflight、临时 `16432/16433` 隧道、endpoint parity 与唯一 reference integration；无需 reset。

用户授权 Task 4 repository integration GREEN 后，fail-closed source/identity 预检 exit 0：本地 integration/repository/015/migration24/seed SHA 未漂移，16432/16433 均空闲，diff check 通过；远端 exact workdir/project、DB/Kong running+healthy、唯一 64322/64321、24 migrations/最高 `20260830000100`、paused marker、seed/migration24/014/015 SHA 全部匹配。reference/authority/command/相关 outbox 基线均为 0；remote active/rumored projects 计数为 2，供 tunnel-side PostgREST parity 使用。下一步建立临时隧道，不 reset、不访问生产。

临时 SSH 隧道已建立：同一 ssh 进程只以 IPv4 监听 `127.0.0.1:16432 → remote 64322` 与 `127.0.0.1:16433 → remote 64321`。首次 sandbox 内 `nc` 因本机策略返回 `Operation not permitted`，不代表远端拒绝；沙箱外重复相同只读 TCP 探测后两端均 succeeded。未读取凭据、未运行测试。下一步生成仅含四个授权变量的 0600 临时 env，并做 PostgREST/psql endpoint parity。

临时 integration env 已生成到 `/private/tmp/phase7b-task4-reference-integration.env`：mode `600`、恰好 4 行，只含 `AIRDROP_DATABASE_TEST_URL`、`AIRDROP_QUEUE_ADMIN_DATABASE_TEST_URL`、`AIRDROP_ANON_SUPABASE_URL`、`AIRDROP_ANON_SUPABASE_KEY`；未包含 service-role/JWT secret，所有值均未输出。下一步使用这些变量只读比较 tunnel DB 与 anon PostgREST 对 active/rumored projects 的 exact count，预期均为远端值 2。

Endpoint parity 已通过：使用 tunnel PostgreSQL 查询 active/rumored projects 得 2，使用 anon key 经 tunnel PostgREST 对相同 relation/filter 请求 exact count 也得 2，二者与远端 docker-exec psql 预检值一致。未输出凭据。下一步只运行 `reference-review-repository.integration.test.ts` 的 3 条测试，不执行其他 integration suite。

唯一 reference repository integration 完整 GREEN：**Test Files=1 passed / Tests=3 passed / exit 0**。真实路径覆盖 authority/reference note round-trip、同 key replay、stale version、同项目 duplicate 与跨项目相同 URL、同 repository 的 bearer 分离、role revoke 后下一调用立即拒绝；afterAll 对 run-scoped fixture 做 exact cleanup，并在事务提交后验证 references/authorities/commands/outbox/projects/auth users 全部零残留。下一步再以远端 docker-exec psql 独立核对全局 reference residue=0 与 paused marker，随后关闭隧道并删除临时 env。

独立远端只读 postcheck exit 0：paused marker 精确计数 1；migration 仍为 **24 / `20260830000100`**；`project_references`、`project_domain_authorities`、`reference_review_commands`、两张 decision 表、`reference_security_flags`、reference/domain-authority outbox、测试项目与测试用户均为 0；active/rumored 项目基线仍为 2。首次尝试只因交接记录中的旧私钥文件名不存在而未连接；第二次只读 SQL 误用不存在的 marker 表而在首句停止，修正为 seed 的 `projects` marker 后完整通过，均无写入。下一步关闭 `16432/16433` 隧道并删除 `/private/tmp/phase7b-task4-reference-integration.env`。

清理 COMPLETE：现有 SSH tunnel 会话收到中断并退出；`/private/tmp/phase7b-task4-reference-integration.env` 已删除且复核 absent；`lsof` 确认 `16432` / `16433` 均无 listener。Task 4 Step 8 完成，下一步仅在本地执行 Step 9 门禁、diff 审查与提交。

Task 4 Step 9 第一组 fresh 本地门禁：五个 workspace 的 lint 与 typecheck 全部 exit 0；完整 Vitest 最终 **contracts 167 + domain 410 + database 286 + worker 236 + web 242 = 1,341 non-skipped PASS**，database 69 / worker 2 为无 env 的预期 gated skips。首次误把根 `eslint .` 当作 `pnpm -r lint` 等价命令，额外扫描根 `scripts/*.mjs` 触发 12 个既有 Node-globals 配置错误；随后按正式五 workspace 边界重跑全绿，未改无关脚本。worker 首轮命中已知 SIGTERM 时序 flake（`exit.code=null`）；文件无 diff，独立 3 次 8/8 后原样全量复跑 236/236。下一步 workspace build、placeholder 与 final diff review。

Task 4 Step 9 第二组 fresh 本地门禁：contracts/domain/database/worker 的 `tsc -p` 与 Web **Next.js 16.3.0 production build** 全部 exit 0；placeholder 检查与 `git diff --check` exit 0。首次 Web build 只因误用不存在的根 `node_modules/next` 路径而在加载入口前中止，改用 workspace 实际安装路径后完整 GREEN，未改依赖。generated types/repository/integration/migration24/015 SHA 仍分别为 `24733d6d…cf11` / `b7a54748…a440` / `e213ab34…b2dd` / `04a912f9…1faa` / `d6cb9ced…a465`。下一步等待独立 code review；无 Critical/Important 后提交。

Task 4 提交前 review 未获独立结论：按 `requesting-code-review` 分派的只读 reviewer 因账户 usage limit 在读取中失败，未返回 findings、未改工作树；controller 不能伪称独立批准，遂按同一清单自审。自审确认 **Important aggregate-version 缺陷**：四个 reviewer list/detail RPC 的 `version` 均固定 `select 1`，但严格 contract 与后续高影响确认把该字段作为 authoritative aggregate version；grant/verify 后仍回 1 会让下一条 `expectedVersion` 命令产生错误 409。现已仅本地补 RED 规格：015 新增四条 list/detail 在 grant/verify 后必须 version=2 的断言（919 行 / SHA `30356c94…18c1`），真实 integration 同步增加四处 version=2 回归（503 行 / SHA `73150939…c77e`）。lint/typecheck/diff check 通过，无 env suite 3 skipped；migration24 尚未改，下一步需新授权只同步新版 015 并跑 focused RED，不 reset、不访问生产。

用户已授权 Task 4 aggregate-version focused RED。本地 source gate 通过：015 919 行 / SHA `30356c94…18c1`，四条具名 version=2 断言存在，seed/第23/24 migration/014 SHA 未漂移且 diff check 通过。远端只读 fail-closed 预检 exit 0：exact workdir/project、DB/Kong running+healthy、唯一 64322/64321、24 migrations / 最高 `20260830000100`、paused marker=1，四项基础 SHA 与本地一致；remote 015 精确仍为旧 SHA `d6cb9ced…a465`。下一步仅覆盖同名 015 并核新 SHA，不 reset、不修改 migration、不建隧道、不访问生产。

仅 SCP 新版 015 到 disposable 同名路径，copy exit 0；首次紧随其后的只读 SHA SSH 无输出而主动终止，未运行测试。改用显式 connect/keepalive 超时的独立 SSH 后校验 exit 0：远端 **919 行 / SHA `30356c94b31a80c6acb6fbc66dd3c3b4d19c96a821578b9fbb59099ee0ce18c1`** 与本地精确一致。未复制其他文件、未 reset；下一步只跑 focused 015 RED。

aggregate-version focused 015 exit 1：前 38 条既有断言通过，**Test 39 精确 RED：reference detail version have 1 / want 2**，证明审查发现不是静态误判。随后第 727 行直接调用 list RPC 的 `version integer` 与测试期望 `2::bigint` 传给 pgTAP `is()` 时无同签名函数，SQL 中止，余下三条未执行并 No plan。根因是新增测试的类型 harness，不是产品/环境；未 reset、未改 migration、未跑 full。下一步仅本地把该期望改为 integer；新 SHA 远端复跑需再授权。

本地只做最小 harness 修复：直接 list RPC 断言的 expected 从 `2::bigint` 改为 `2::integer`；另三条通过 bigint 临时表验证，原样保留。015 仍 **919 行**，新 SHA `37c09cad01b36368f0b745743b7e3375f4eaf8b27817b932b40487a2c27e4803`；11 组 set/reset role 成对，migration24 SHA 仍 `04a912f9…1faa`，`git diff --check` 通过。远端仍为上一版 `30356c94…18c1`；覆盖/复跑前需新授权，不 reset、不改 migration、不访问生产。

用户授权修复版 aggregate-version focused RED 后，重复预检 exit 0：本地 015 仍 919 行 / SHA `37c09cad…e4803` 且 diff check 通过；远端 exact workdir/project、DB/Kong running+healthy、唯一 64322/64321、24 migrations / 最高第24、paused marker=1，seed/23/24/014 SHA 全部匹配，remote 015 仍为上一版 `30356c94…18c1`。下一步仅覆盖同名 015 并核字节，不 reset/改 migration/建隧道/访问生产。

仅覆盖 disposable 同名 015，copy exit 0；独立 SHA/行数校验 exit 0，远端 **919 行 / SHA `37c09cad01b36368f0b745743b7e3375f4eaf8b27817b932b40487a2c27e4803`** 与本地精确一致。未复制其他文件、未 reset；下一步只运行 focused 015 RED。

修复版 focused 015 完整 RED：**Files=1 / Tests=57 / Failed=4 / Result FAIL / exit 1**。原 53 条全部 PASS；新增 Test 39–42 分别证明 reference detail/list 与 authority detail/list 都是 `have 1 / want 2`。无 SQL 中止、TAP parse error、No plan 或额外失败；未 reset、未改 migration、未跑 full。下一步仅本地把四个 RPC 的常量 version 替换为权威 aggregate version；远端同步/reset/GREEN 需另行授权。

实现前与 Phase 7A reviewer contract 交叉核对后校正语义：RPC 的 `version integer` 是协议 schema 版本，必须恒为 literal `1`；aggregate version 应独立命名为 `referenceVersion` / `authorityVersion`，不能覆盖协议字段。真正缺陷是四个 reviewer RPC/contract 缺少独立 aggregate-version，且 reference detail 内嵌 authority 仍把 aggregate version 错名为 `version`。先只改 contract tests：协议 version 改 1，新增两个 aggregate 字段。reference-focused RED **4 files / 34 tests：30 PASS / 4 FAIL / exit 1**，四个失败精确因 strict schema 尚不认识新字段；既有 30 条通过。migration/远端均未再修改或访问；下一步最小 contract GREEN。

最小 contract GREEN：reviewer reference list/detail 改为 `version: z.literal(1)` + `referenceVersion`；authority list/detail 改为 `version: z.literal(1)` + `authorityVersion`；reference detail 内嵌 authority 将误名 aggregate `version` 改为 `authorityVersion`。reference-focused **4 files / 34 PASS**，完整 contracts **16 files / 167 PASS**，lint/typecheck 均 exit 0。下一步校正 015 与 integration 的 RED 字段，migration 尚未改。

corrected database/integration RED 规格已本地完成：015 精确 OUT allowlist 为 protocol `version` + `referenceVersion`/`authorityVersion`，六处 read fixture 用 `to_jsonb` 兼容旧/new shape，避免缺列导致 SQL 中止；四条 aggregate value 断言继续要求 grant/verify 后为 2，并新增 nested authority `authorityVersion=2` 与禁止旧 `version` key。015 为 **957 行 / 预计 59 assertions / SHA `83a15ab336a0ab4a45f7ac270f15fb38a18a8a201ea349f4ced7f3f6c9770750`**；integration 为 **507 行 / SHA `7eba7f46…dcb9`**。database focused 28 PASS / 3 env-gated，lint/typecheck/diff check 通过，11 组 role 切换成对；migration24 仍旧 SHA `04a912f9…1faa`。远端仍为上一版 015 `37c09cad…e4803`，corrected focused RED 需新授权，不 reset/改 migration/访问生产。

用户授权 corrected aggregate-version focused RED 后，重复只读预检 exit 0：本地 015 957 行 / SHA `83a15ab…70750` 且 diff check 通过；远端 exact workdir/project、健康容器/唯一 64322/64321、24 migrations / 最高第24、paused marker=1，seed/23/24/014 SHA 全匹配，remote 015 仍为 `37c09cad…e4803`。下一步仅覆盖 corrected 015 并核字节，不 reset/改 migration/建隧道/访问生产。

仅覆盖 disposable 同名 corrected 015，copy exit 0；远端 **957 行 / SHA `83a15ab336a0ab4a45f7ac270f15fb38a18a8a201ea349f4ced7f3f6c9770750`** 与本地精确一致。未复制其他文件、未 reset；下一步只运行 focused RED。

corrected focused RED exit 1：**Files=1 / Tests=59 / Failed=13**。Test 10–13 精确证明四 RPC OUT shape 缺 `referenceVersion` / `authorityVersion`；aggregate/nested naming 断言也为 NULL/旧 key，目标缺口成立。但 Test 31 的 detail fixture 因 `referenceVersion` 临时列仍为 NOT NULL 而插入失败，连带 Test 38/45 既有 state/history 断言产生 3 项级联噪声。源码复核确认 nullable 修改误命中 command receipt 临时表而漏掉 detail 表。未 reset、未改 migration/full；下一步只在本地恢复 receipt NOT NULL、把 detail aggregate 临时列改 nullable，新字节需再授权。

本地 nullable harness 修复只改两处：command receipt 临时表 `referenceVersion` 恢复 NOT NULL；reviewer detail 临时表 `referenceVersion` 改 nullable，使旧 schema 缺字段只形成目标 RED 而不阻断 detail fixture。015 仍 **957 行**，新 SHA `a34cced69ca69a5247f0ff041851af2cdda47d61bf916098383fb29639e5dd5b`；migration24 未改，11 组 role set/reset 成对，diff check 通过。远端仍为 `83a15ab…70750`；覆盖/复跑需新授权，不 reset/访问生产。

用户已授权修复版 corrected Task 4 aggregate-version focused RED。重复 fail-closed 预检 exit 0：本地 015 为 957 行 / SHA `a34cced69ca69a5247f0ff041851af2cdda47d61bf916098383fb29639e5dd5b`，远端 015 仍为旧 SHA `83a15ab336a0ab4a45f7ac270f15fb38a18a8a201ea349f4ced7f3f6c9770750`；exact workdir/project、DB/Kong running+healthy、唯一端口 64322/64321、24 migrations / 最高 `20260830000100`、paused marker，以及 seed/第23/第24/014 SHA 全部匹配。下一步只覆盖 disposable 同名 015 并独立核对 SHA/行数；不 reset、不复制 migration、不建隧道、不访问生产。

随后仅以 SCP 覆盖 disposable 同名 015，copy exit 0；独立 SSH 核验返回 **957 行**、SHA-256 `a34cced69ca69a5247f0ff041851af2cdda47d61bf916098383fb29639e5dd5b`，与本地逐字节目标完全一致。未复制其他文件、未 reset、未建隧道、未访问生产；下一步只运行 focused 015 RED。

修复版 corrected focused 015 完整 RED：**Files=1 / Tests=59 / Failed=10 / Result FAIL / exit 1**。失败精确为 Test 10–13（四 RPC exact OUT 缺 `referenceVersion` / `authorityVersion`）、Test 39–40（nested authority 缺显式 `authorityVersion` 且仍存在旧 `version` key）、Test 41–44（四个 list/detail aggregate version 值为 NULL）；其余 49 项全部 PASS，无 SQL 中止、parse error、No plan 或 fixture 级联噪声。未 reset、未复制/执行 migration、未跑 full/typegen、未建隧道、未访问生产。下一步只在本地最小修复 production-unapplied 第24 migration；再次同步/reset/GREEN 需新授权。

本地最小 implementation 只修改 production-unapplied 第24 migration 的四个 reviewer read RPC：reference list/detail 在 state 后返回 `current_reference.version` 为 `referenceVersion bigint`；authority list/detail 返回 `authority_row.version` 为 `authorityVersion bigint`；reference detail nested authority 的 JSON key 从含混的 `version` 改为 `authorityVersion`；各 RPC 顶层 protocol `version integer` 仍固定返回 1。migration 现为 **1,241 行 / SHA-256 `570e6b89a7bbb2b48c1356fd0b210b741a46bc64ee4d4283a54431c9b509aad8`**，015 仍为 957 行 / SHA `a34cced6…5dd5b`，`git diff --check` 与静态 select/RETURNS 对位通过。尚未同步、reset、typegen 或访问生产；下一步本地窄门禁。

本地 aggregate-version GREEN 门禁全部通过：Node 22.22.2 直接执行现有工具，contracts lint/typecheck exit 0、**16 files / 167 PASS**；database lint/typecheck exit 0，focused entrypoints/reference repository 为 **2 files PASS / 1 integration gated，34 PASS / 3 skipped**。未安装依赖，未连接数据库；generated types 仍是旧 disposable schema 的稳定产物，必须等新 schema reset 后双次 typegen 再机械替换。下一步需要新授权：在 marker-verified disposable 环境同步已修改的第24 migration、reset、focused 015、full pgTAP、双 typegen、更新 generated types，并重跑真实 repository integration 与清理；生产不访问。

用户已授权 Task 4 aggregate-version disposable GREEN。现有隔离 worktree/branch 复核通过；重复 fail-closed 预检 exit 0：远端精确 workdir/project、pinned CLI 2.112.0、DB/Kong running+healthy、唯一端口 64322/64321、24 migrations / 最高 `20260830000100`、paused marker 均匹配；seed/第23/014/015 SHA 与本地一致，远端第24为预期旧 SHA `04a912f9…561faa` / 1,233 行，本地新版为 `570e6b89…aad8` / 1,241 行；本地 16432/16433 均未监听。下一步仅同步新版第24并独立核验，不复制其他文件；核验通过后才 reset。生产未访问。

随后仅同步修改后的第24 migration，SCP exit 0；独立 SSH 核验返回 **1,241 行**、SHA-256 `570e6b89a7bbb2b48c1356fd0b210b741a46bc64ee4d4283a54431c9b509aad8`，与本地完全一致。未复制其他文件、尚未 reset；下一步执行本次已授权的 disposable `db reset`，失败则停止 focused/full/typegen/integration。生产未访问。

授权的 disposable `db reset --yes` 随后完成：第1–24个 migration 依序应用，修改后的第24 migration 在真实 PostgreSQL 上编译/执行成功，seed 与容器重启完成。reset 后只读复核：DB/Kong running+healthy，migration count **24**、max `20260830000100`、paused marker count **1**，远端第24 SHA 仍为 `570e6b89…aad8`。下一步只运行 focused 015；失败则停止 full pgTAP/typegen/integration。生产未访问。

aggregate-version focused 015 随后完整 GREEN：**Files=1 / Tests=59 / Result PASS / exit 0**。四 RPC exact OUT、nested authority 正确命名、四个 aggregate value，以及原有 49 个 note/ACL/角色/cursor/history/unique/render-gate 断言全部通过；无 SQL/TAP 噪声。下一步运行全量 pgTAP，失败则停止 typegen/integration。生产未访问。

全量 pgTAP 随后完整 GREEN：**Files=15 / Tests=1,483 / Result PASS / exit 0**，001–015 全部通过；相较旧版 1,477 项，6 个新增 corrected aggregate-version 断言已进入完整矩阵，既有 schema/RLS/history/queue/governance/7A/7B 行为无回归。下一步在同一 disposable schema 连续 typegen 两次并逐字节比较；仅稳定一致才替换本地 generated types。生产未访问。

同一 disposable schema 上使用 pinned CLI 2.112.0 连续 typegen 两次，两份产物均为 **158,662 bytes**、SHA-256 `e5dc3861ebab1eda8206f7fca1a23d760d7c5a75b01b9ff3732bd734f17aedef`，`cmp -s` exit 0。远端临时目录为 `/tmp/task4-aggregate-types.jv3BjT`，只含两份生成物；下一步仅下载第一份至本地临时路径并复核 SHA/字段，确认后机械替换 generated types，最终清理临时目录。生产未访问。

第一份稳定生成物已下载至 `/private/tmp/phase7b-task4-aggregate-database-types.ts`；本地复核仍为 **158,662 bytes / SHA `e5dc3861…aedef`**。静态扫描确认 `get/list_reference_review_*` 均含 `referenceVersion: number`，`get/list_domain_authority_review_*` 均含 `authorityVersion: number`；当前仓库 generated types 仍为旧的 158,522 bytes / SHA `24733d6d…cf11`，差异符合预期。下一步只机械替换 generated 文件并用 `cmp` 证明一致。

本地 `packages/database/src/generated/database.types.ts` 已用稳定产物机械替换，随后 `cmp -s` exit 0；文件现为 **158,662 bytes / SHA `e5dc3861…aedef`**，相对 Task 3 跟踪基线累计新增 77 行，`git diff --check` 通过。下一步运行 database 全包 lint/typecheck/test；未安装依赖、未连接生产。

database 全包本地门禁全部真实执行并通过：lint exit 0、typecheck exit 0、Vitest **14 files PASS / 10 integration files gated，286 PASS / 69 skipped**。未提供 integration 环境变量，故 69 项仅按设计跳过；下一步建立临时 16432→64322 / 16433→64321 隧道，先以远端 DB 与隧道 PostgREST 同关系 count 对照证明端点，再只运行 reference review integration，完成 exact cleanup/zero-residue 后关闭隧道。生产未访问。

临时 SSH 双隧道已建立：同一 PID 仅以 IPv4 监听 `127.0.0.1:16432 → remote 64322` 与 `127.0.0.1:16433 → remote 64321`。首次把两个 `-iTCP` 与单个 `-sTCP:LISTEN` 合并的本地 `lsof` 命令被工具自身拒绝，未发起探测；拆分为两个只读 `lsof` 后均精确返回同一 SSH PID。下一步生成只含四个授权变量、mode 0600 的临时 env，值不输出，再执行 DB/PostgREST endpoint parity。生产未访问。

临时 integration env 已生成至 `/private/tmp/phase7b-task4-reference-integration.env`：mode **0600**、405 bytes、恰好 4 行，仅含 `AIRDROP_DATABASE_TEST_URL`、`AIRDROP_QUEUE_ADMIN_DATABASE_TEST_URL`、`AIRDROP_ANON_SUPABASE_URL`、`AIRDROP_ANON_SUPABASE_KEY`；两条 URL 被 test 自身限制为 loopback 16432/16433，文件不含 service-role/JWT secret，所有值均未输出。下一步以远端 docker psql、隧道 PostgreSQL、隧道 anon PostgREST 对同一 active/rumored projects count 做三方一致性证明。

Endpoint parity 完整通过：远端 `docker exec psql` 查询 active/rumored projects 为 **2**，同一关系经 `127.0.0.1:16432` 隧道 PostgreSQL 查询为 **2**，经 `127.0.0.1:16433` 与 anon key 的 PostgREST exact count 也为 **2**；三方精确一致且未输出凭据。下一步只运行 `reference-review-repository.integration.test.ts` 的 3 条测试，不运行其他 integration suite。

唯一 reference repository integration 完整 GREEN：**Test Files=1 passed / Tests=3 passed / exit 0**，测试文件 SHA `7eba7f4637d6dbbc0994ae8cf40b3070a42486273e1a29d136a01bd1a113dcb9`。真实路径验证 `referenceVersion` / `authorityVersion` 在 list/detail 与 nested authority 均为 authoritative 2，并覆盖 note round-trip、same-key replay、stale version、同项目 duplicate/跨项目相同 URL、同 repository bearer 分离、role revoke 后下一调用拒绝；测试内 afterAll exact cleanup 与提交后 zero-residue 全部通过。下一步远端 docker psql 独立复核全局 reference residue、marker 与 migration，再关闭隧道/删除临时文件。

独立远端只读 postcheck exit 0：`project_references`、两张 decision 表、`project_domain_authorities`、`reference_review_commands`、`reference_security_flags`、reference/domain-authority outbox，以及测试 project/source/raw/evidence/auth user 全部为 **0**；paused marker count **1**，migration count **24** / max `20260830000100`。下一步关闭 tunnel session，删除本地 0600 env、本地下载 typegen 临时文件和远端 `/tmp/task4-aggregate-types.jv3BjT`，并复核路径与 16432/16433 均清空。

清理 COMPLETE：SSH tunnel session 已终止；本地 16432/16433 均无 listener；`/private/tmp/phase7b-task4-reference-integration.env` 与 `/private/tmp/phase7b-task4-aggregate-database-types.ts` 均 absent；远端 `/tmp/task4-aggregate-types.jv3BjT` 已删除并只读复核 absent。disposable fixture 零残留，生产未访问。下一步只在本地运行最终 Task 4 门禁与 diff 自审。

Task 4 fresh 最终本地门禁：五 workspace lint/typecheck 全部 exit 0；完整 Vitest 为 **contracts 167 + domain 410 + database 286 + worker 236 + web 242 = 1,341 non-skipped PASS**，database 69 / worker 2 为无 env 的预期 gated skips。contracts/domain/database/worker build 均 exit 0；Web build 首次仅因命令错误指向不存在的根级 Next 入口而在源码执行前 exit 1，系统化定位确认 Next 只安装在 `apps/web/node_modules`，改用 workspace-local Next 16.3.0 后 production build exit 0、11 个静态页面生成完成。placeholder、`git diff --check` 均 exit 0；敏感扫描只命中四处 migration 对 `service_role` 的显式 revoke，无凭据、service-role 使用或 internal-field 泄漏。独立 scoped code review 已发起且只读，下一步等待 findings；生产未访问。

**2026-08-31 continuation / review availability**：按 `requesting-code-review` 发起的原 Task 4 reviewer 与本次 aggregate-version scoped reviewer 均在读取 diff 前因子代理账户额度限制失败；两者均没有 findings，也没有任何文件修改，故不能伪称独立 review clean。用户指示继续后，主任务按 `verification-before-completion` 执行逐文件要求对照、敏感边界分类与 fresh final gate；如发现缺口则回到 RED→GREEN。生产未访问。

**背景与定位**：按 `canonical-intelligence-governance-design.md` §17 的既定顺序第 3 项，「Security incidents, indicators, and verified allowlisted references」共同构成 tutorials 的前置条件。7A 已完成前两项，7B 即第三项，也是 tutorials 之前的最后一环。Gap 很具体：`AGENTS.md` 要求 tutorials 暴露 `last_verified_at`、使用 allowlisted 链接引用，并要求标记任何未经已验证引用解析的用户可见官方链接——但仓库里**不存在 canonical 引用对象**。`projects.official_website_url` 是无验证、无历史的自由文本；`project_sources.authority_domains` 只是**来源级**域名权限，无历史、无 URL 粒度；Phase 7A 的 indicator 明确声明「不判定某值官方、可安全访问或已加入白名单」。

**已确认的四项产品决策**（用户 2026-08-29 拍板）：
1. **两层建模**：`project_domain_authorities`（域名归属性）+ `project_references`（具体 URL 条目）。已验证域名**不**验证其下的任意 URL，这是对「官方域名下的伪造路径」的正面防御。
2. **复用 `reviewer` / `senior_reviewer` / `admin`**，不新增 `app_role` 值。
3. **`projects.official_website_url` 保留为 Catalog 线索，但渲染链接必须经已验证引用**；否则渲染为惰性文本并显式标注「未验证」。
4. **安全联动 protect-first**：Phase 7A indicator 命中即自动 `flagged` 并同步停止公开渲染；恢复只能由人工追加新的、有 Evidence 支撑的核验决策，且 flag 行不删除、只置 `released_at`（冲突保持可见）。

**设计要点**：五张 ledger 表（2 张 canonical 当前行 + 2 张决策历史 + 1 张 `reference_security_flags`）+ 1 张 append-only command receipt 表 + 3 个视图；当前状态由最新决策推导，但未释放的 flag 强制覆盖为 `flagged`（使联动同步生效、无需后台任务）；`last_verified_at` 由最近一次成功 verify 决策推导；verify/reverify/restore 必须引用未被 7A 封锁来源的 Evidence；注册时做共享的确定性 URL/域名归一化，避免「一种形式通过验证、另一种形式被 flag」；稳定错误码走 `AR2xx` 新波段；明确不做：tutorials、合约地址、DNS/WHOIS 自动所有权证明、AI 创建 canonical 验证、改写 sources 信誉或项目生命周期。

**产物**：`docs/superpowers/specs/2026-08-29-phase-7b-verified-allowlisted-references-design.md`（20 节，含目标/已确认决策/非目标/现状集成点/信任边界/契约/数据模型/流程/安全联动/幂等并发/同步门禁/公开读模型/仓储与 HTTP/审核 UI/公开 UI/授权 RLS/错误/测试/交付边界/验收）。

**计划状态（2026-08-30）**：原 10-task 计划已按获批的 Task 4 修订扩充。第 23 个 migration / 014 保持 immutable；计划新增第 24 个 `20260830000100_phase_7b_reference_review_boundary.sql` 与第 15 个 `015_phase_7b_reference_review_boundary.test.sql`。Task 4/5/10 的 disposable 操作仍需逐次显式授权。

**计划定稿时修正的两处实现细节（避免后续返工）**
1. **归一化不剥离 `www.`**：只做 scheme/host 小写、去尾部点、去默认端口、去 fragment、空路径归一；`www.example.com` 与 `example.com` 视为两个独立权威、需分别授予。对安全白名单这是更保守的选择；若产品后续要 apex 折叠，须作为显式决定并配套测试，不能作为归一化的隐式副作用。
2. **安全联动 SQL 随 Task 3 迁移一次交付**：计划初稿让 Task 5 回头修改 Task 3 的迁移，会在该迁移已被 reset 应用后改写它，违反 forward-only；已重构为 Task 5 只做集成测试与双会话竞态证明。

#### Task 1–3 执行状态（2026-08-30 更新，接手者从这里继续）

| Task | 交付物 | 状态 | 证据 / 提交 |
|---|---|---|---|
| 1 | Strict reference contracts（`packages/contracts/src/references/` 四模块） | ✅ 完成 | `f63f793`；contracts 16 files / 161 tests（+28），变异检验通过（strict 放宽 → 泄漏用例失败） |
| 2 | 纯归一化 / 状态机 / 派生规则（`packages/domain/src/references/` 三模块） | ✅ 完成（含复检修复） | `3cb69bf` + `0b3d721`；domain 410 tests（+26 后复检再 +8）；TS 侧**不用 `new URL`**、与 SQL 同一纯字符串解析算法 |
| 3 | Reference Ledger 迁移 + 受保护命令 + RLS + 安全联动 SQL + 014 pgTAP + types | ✅ 完成（disposable 验证全绿） | `87cc070` + `0b3d721` + `5772ad5`；迁移 1,992 行 / 37 对象（第 23 个）；full pgTAP 14 files / 1,424 PASS（014 = 74 断言）；集成矩阵 66 PASS；typegen 两次一致；清理回 seed 基线 |
| 4 | Bearer-scoped reference review repository + 双会话竞态集成 | ⬜ 待执行 | 涉及 disposable 栈，**需用户逐次显式授权** |
| 5 | 7A 联动集成测试（双会话竞态证明） | ⬜ 待执行 | 同上；SQL 已随 Task 3 交付，Task 5 只做集成测试 |
| 6–10 | 公共投影仓储 / BFF / reviewer UI / 公开链接解析 / Golden+收口 | ⬜ 待执行 | 详见实施计划 |

**已落地的关键设计事实（接手者必读）**：
- 数据模型实际为 **6 张表**（规范写 5 张）：额外加了 `reference_review_commands` 独立回执表（`security_review_commands` 的列与 aggregate 校验是安全专用，硬塞会扭曲语义）；决策历史表各含 `aggregate_version bigint` 列，状态推导按 `aggregate_version desc` 排序（同事务内 `transaction_timestamp()` 恒定，按时间排会退化为随机 UUID 序）。
- 受保护命令 4 个：`submit_register_domain_authority` / `submit_decide_domain_authority` / `submit_register_reference` / `submit_decide_reference`；命令 payload 同时携带 aggregateId 与 expectedVersion 并在 SQL 内比对一致。稳定错误码 `AR201/202/203/204/206/207/208/209/210/299`，与 `packages/contracts/src/references/enums.ts` 一一对应。
- 公开读模型：`reference_is_publicly_renderable_v1()`（security definer）是「可否公开渲染」的**单一判定点**（verified + `lifecycle in (active,rumored)` + 7A posture 非 blocked），RLS 策略与公共视图共用；不要把 7A 的 posture 函数授权给 anon。RLS 按 7A 约定**每角色独立策略**（`to anon` / `to authenticated` 分开、带 `comment on policy`），006 的精确策略矩阵已同步 4 条新策略。
- outbox 白名单新增 4 个 reference 事件，**7A 对 ai_run/security 事件的 payload 校验分支逐字保留**；`occurredAt` 必须用 `to_char(… 'MS"Z"')` 格式化后写入。

**复检与验证沉淀的 plpgsql/工程教训（写 Task 4+ 时直接引用，勿重蹈）**：
1. plpgsql `RETURNS TABLE(version …)` 的列名就是变量：`returning … version into` / `set version = version + 1` 会 42702 且被 `when others` 吞成 AR299——列引用必须限定（`update t as x set version = x.version + 1`），register 命令避免 `INSERT … RETURNING`。
2. **plpgsql `RETURN QUERY` 不退出函数**：replay 分支 `return query select …` 后必须显式 `return;`，否则直落进版本检查抛 AR206（此 bug 曾让四个命令的 replay 全部不可用）。
3. `position(x in y)` 是特殊语法不能加 schema 前缀（42601，改 `strpos`）；`coalesce/least/nullif` 是语法结构、同样不能写 `pg_catalog.` 前缀。
4. flag 创建与 release 可发生在同一事务：`released_at` 用 `clock_timestamp()`，不能用 `transaction_timestamp()`。
5. 归一化两层一致性铁律：TS 侧禁用 `new URL()`（过于宽容），与 SQL 逐行同算法的纯字符串解析；两侧都拒绝非 ASCII、`%` 编码 host、IDN/IPv6/下划线 host 与 dot-segment；不剥离 `www.`。
6. replay/幂等检查必须前移到 normalization/evidence 校验之前（否则证据事后被封时回放误报 AR209）；`unique_violation → AR208`。
7. 调试：psql `-q` 吞 SELECT 输出，用 pgTAP `select diag(...)`；查 RLS 拒绝的内部表先 `reset role`、查完重设 claim+role；pgTAP `is()` 无跨类型重载（bigint 需显式 cast）。

### Phase 7A 全景看板（2026-08-29 更新，Task 1–11 全部完成并已合并主线）

#### 任务看板总览

| Task | 交付物 | 状态 | 复审 | 关键提交 |
|---|---|---|---|---|
| 1 | Strict security contracts（五模块） | ✅ 完成 | Approved（fix round 后 clean） | 至 `5ac6f76` |
| 2 | Pure posture/transition/indicator rules（domain） | ✅ 完成 | Approved（两轮 fix 后 clean） | 至 `a6ac4b0` |
| 3 | Security Ledger migration + protected commands + RLS 矩阵 | ✅ 完成 | 初审 NEEDS_FIXES(0C/8I/5M) → Fix Round 1 → re-review **Approved** | `8134bf4`/`daf6d40`/`6b990fd` |
| 4 | Bearer-scoped security review repository + race 集成 | ✅ 完成 | re-review **Approved**（0C/0I） | `287f677`/`2d2c29b` |
| 5 | Route security extraction candidates and harden ordinary Promotion | ✅ 完成 | 初审 0C/1I/1M → scoped re-review **Approved**（0C/0I/0M） | `9dd3155` |
| 6 | Enforce protect-first collection and scoring races | ✅ 完成 | 初审 1C/1I/2M → scoped re-review **Approved**（0C/0I/0M） | `0bda9ce` |
| 7 | Strict public security repositories + project projections | ✅ 完成 | 初审 0C/3I/0M → Fix Round 1 → re-review **Approved** | `3f0e906`/`7b8c329` |
| 8 | Authenticated security BFF routes + browser client | ✅ 完成 | 初审 0C/3I/0M → Fix Round 1 → re-review **Approved** | `0f303d9`/`db05026`/`ada09c6` |
| 9 | Reviewer security workflow UI（`/review/security`） | ✅ 完成 | 初审 1C/1I → Fix Round 1 → 复审 2I → Fix Round 2 → re-review **Approved**（含 1 项 DISPROVEN） | `6a87a24`/`b791210`/`70e8ebc`/`e999a97`/`7292903` |
| 10 | Public blocked opportunities + project security presentation | ✅ 完成（review clean） | 初审 0C/3I/3M：历史快照提示语作为 grid 直接子元素破坏三列因子布局、caution 仅灰色文本后缀而非 badge、`after` 未校验导致 500 → Fix Round 1 → scoped re-review **Approved**（3 Minor 亦当轮闭环） | `5258ca8`/`54cda0a`/`72a41b7`/`14cf1ca` |
| 11 | Golden Dataset、E2E、runbook、full verification 收口 | ✅ 完成（review clean） | 初审 0C/2I/4M（runbook AS104/AS111 语义写反、prompt-injection 断言空转等）→ Fix Round → 全部闭环；Step 3 经授权执行 disposable 矩阵：reset exit 0、pgTAP 13 files/1,338 PASS、集成矩阵 9 files/66 PASS、零残留 | `942ee9f`/`7dd3ee9`/`d38f9af`/`55d7f2b` |

**Phase 7A 分支状态（2026-08-29，已合并主线）**：`codex/phase-7a-security-ledger` 上 Task 1–11 **全部完成并通过独立复审**，提交链 `fbf49d2..55d7f2b`，已以 merge 提交并入主线 `codex/phase-0-1-foundation`；功能 worktree `.worktrees/phase-7a-security-ledger` 按既有惯例保留。最终 `pnpm verify` exit 0：contracts 133 + domain 376 + database 257 + worker 236 + web 242 = **1,244 non-skipped / 68 gated skips**；lint、typecheck、build、placeholders 与 `git diff --check` 全绿。生产仍为 19 个已应用迁移，Phase 7A 迁移继续按 production unapplied 处理。

**下一步决策点（需项目所有者决定）**：复核已修订的书面 spec/plan；确认后先执行不接触远端的 contracts RED→GREEN。到 `015` pgTAP RED、reset/typegen 或 repository integration 动作前，再单独申请 disposable 授权。生产 rollout 的四项前置仍未满足。

Phase 7A 提交链：`fbf49d2..55d7f2b`（40 个提交，112 文件，`+18,231/-384`），现已全部并入主线；备份引用 `backup/pre-7a-merge-main` 与 `backup/pre-7a-merge-7a` 保留合并前两端状态。

#### Task 5–11 范围摘要（依据已批准实施计划）

- **Task 5（已完成，提交 `9dd3155`）**：extraction 事务按批调用 `route_security_extraction_candidate`，把 `security_risk` / `scam_indicator` 候选从普通 Promotion 路由进专用 security review queue；ordinary Promotion guards、稳定错误映射及真实授权回归均已闭环。
- **Task 6（已完成，提交 `0bda9ce`）**：collection/scoring protect-first gates 已实现；collection 写入前锁定并复核 Source posture，阻断后取消且不重试；scoring 锁定并复核全部关联 Evidence Source，受限输入不生成任何评分持久化记录；真实双会话竞态已覆盖。
- **Task 7（已完成，提交 `3f0e906`/`7b8c329`）**：anon 安全仓库严格映射四个 public 视图（blocked 列表游标、posture、获批 incident 摘要、逐条 public-safe indicator 惰性文本），immutable score ID 作组合锚点，禁止 base-table fallback。
- **Task 8（已完成，提交 `0f303d9`/`db05026`/`ada09c6`）**：thin `/api/v1/review/security/*` handlers 与 `/api/v1/security/blocked-projects` 公共端点 + strict browser API client（fresh token/idempotency key、expected version）；bundle isolation 已证明。
- **Task 9（已完成，提交 `6a87a24`/`b791210`/`70e8ebc`/`7292903`）**：reviewer 安全工作流 UI（候选队列/详情/incident 创建与调整/历史/解除/披露），高影响命令 affirmatice 确认绑定权威 aggregate 版本、409 清除确认、惰性渲染测试。
- **Task 10（已完成，提交 `5258ca8`/`54cda0a`/`72a41b7`）**：公共侧 blocked 机会独立视图与项目详情安全呈现（caution 保留排序+警示、blocked 退出统计但详情可访问、既有评分为安全事件前历史快照、官网外链停用、指标值惰性文本）。
- **Task 11（已完成，提交 `942ee9f`/`7dd3ee9`/`d38f9af`）**：Golden Dataset 增补（含变异检验）、最终授权矩阵扩展、runbook 补 Phase 7A 章节、经授权的 disposable 验收矩阵、敏感字段扫描与整分支收口复审。

#### 执行方式与决策点

1. 沿用 Subagent-Driven 流程：每任务 controller 写 brief（plan 章节 + RPC 速查 + fixture 惯例）→ 实现 agent TDD（RED 具名失败 → 最小 GREEN → 包内门禁）→ controller 代提交并在 disposable 栈跑真实验证（需 SSH 推导四变量至本地 0600 env 文件 + 显式 IPv4 绑定隧道）→ scoped independent review → Approved 后记录闭环。连续执行无需逐 task 请示（用户先前选定方案 1 并以“继续”推进），但任何超出既有授权的远程动作（如向 disposable 栈同步新文件）须重新确认。
2. 数据库守则不变：仅 marker fail-closed 后 reset disposable 栈（固定 marker 见 seed.sql；013 pgTAP 与 integration 测试的 marker 行均由 seed 提供）；生产栈与 54321/54322 端口绝不允许访问。
3. 已知工程坑位延续 §6（重点：包内跑 database 测试否则 browser-resolution 假失败；postgres.js 相邻模板插值产生 `$n$m`；隧道先核监听目标再连库）。

#### 完成定义与遗留边界

- Phase 7A 完成条件（spec §验收）：Evidence→Raw Item→Source 追溯、protect-first 原子性、即时门禁、公共零泄漏、clear 无回归、完整数据库与仓库门禁全绿并同步文档后，再做整分支 finishing review 与主线合并决策。
- 本阶段明确不做：tutorials、notifications、钱包/交易、第三方威胁情报源、AI 自动 canonical 决策、scope 自动升级、实时推送、生产 rollout。（verified allowlisted references 曾列为不做项，现为 **Phase 7B**：设计已批准，Task 1–3 已完成并通过 disposable 验证，Task 4–10 待执行。）
- 生产 rollout 冻结依旧：四前置（human reviewer 供给、Auth 恢复 200、迁移前备份演练、显式授权）齐备并重新 preflight 前，第 20–22 个 migration 不应用。

### 2026-08-28 本轮接续复核进度

| 步骤 | 状态 | 已核对内容 / 后续动作 |
|---|---|---|
| 1. 完整阅读交接手册 | **完成** | 已分段逐行读完当前 757 行；确认顶部 Phase 7A 看板将 Task 1–4 记为已闭环、Task 5 记为下一项，但本手册同时保留大量 Phase 6A/6B 与详情页历史记录；后续必须以当前 Git/worktree、已批准 spec/plan/workbook 和新鲜验证交叉校准，不直接把历史外部快照当作当前事实。主工作区现场 HEAD 为 `e84ed99`，较手册旧快照已有后续文档提交。 |
| 2. 详细复核项目目录产出 | **完成** | 已逐段读完仓库强制的 Phase 0/1 plan（599 行）与 workbook（386 行），并详细复核 README、两份 architecture、local runbook、Phase 7A Approved spec（716 行）、实施计划结构、Task 5 完整步骤与 worktree workbook。主线现有 279 个跟踪文件（docs 26 / apps 101 / packages 94 / migrations 21 / pgTAP 12 / scripts 4 / 其他 21）；Phase 7A worktree 为 302 个（packages 115 / migrations 22 / pgTAP 13），相对当前主线的实现差异为 34 文件约 `+11,681/-176`。实际产出覆盖 strict contracts、纯 domain 规则、九表追加式 Security Ledger + protected RPC/RLS/四个 public views、bearer-scoped SecurityReviewRepository 与真实集成测试。 |
| 3. 核验当前阶段与未完成项 | **完成** | Phase 7A worktree 现场 HEAD 为 `2d2c29b`，tracked worktree 干净，提交链和实际文件确认 Task 1–4 已产出、Task 5 尚无任何测试或实现 diff。可用本机运行时实为 Node 24.19.0 / pnpm 11.16.0（与仓库 `>=22 <23` 不符）；在该非声明版本下，Task 5 相关 focused 基线为 database 11 files passed / 8 skipped、225 tests passed / 51 skipped，worker 17 files passed / 1 skipped、212 tests passed / 2 skipped。完整 `pnpm verify` 两次均在 pnpm 自动依赖状态检查阶段尝试 registry，因 `ENOTFOUND` 中止；离线冻结安装明确缺 `@eslint/js@10.0.1` tarball。这不是代码门禁失败，也不能冒充 Node 22 的 fresh root 验收。诊断后原 `node_modules` 已从 `/tmp` 备份原位恢复，源码、lockfile 与 tracked worktree 仍无改动。 |
| 4. Task 5 方案与 RED | **完成** | 用户已批准短设计及 `AS104 → security_reviewer_required`、`AS111 → security_review_required`、`AS112 → security_promotion_blocked`。测试先行新增 extraction repository 7 个具名用例及 worker/Promotion 回归；有效 extraction RED 为 7/7 失败，精确证明现实现缺少事务、security route、回滚与 ordinary pending 隔离。Promotion suite 因 worktree 依赖链接缺失在 import 前阻断，未冒充业务 RED。下一步是最小 GREEN；远端 disposable integration 仍需另行精确授权。 |
| 5. Task 5 本地 GREEN | **完成** | 按 lockfile 恢复生成依赖后完成最小实现：每批单事务、新插入 security/scam 候选专用路由、重放不重路由、失败整批回滚、ordinary pending 隔离及 AS104/111/112 稳定映射；新增真实 ingress 与 Promotion caution/blocked integration 回归并纳入脚本。当前非声明 Node 24 / pnpm 11.19 验证为 database 235 pass / 54 gated skip、worker 217 pass / 2 skip，两包 lint/typecheck exit 0。下一步是 Node 22 root verify 与经单独授权的 disposable integration；生产继续禁止访问。 |
| 6. Task 5 当前运行时全仓门禁 | **完成** | Node 24.19.0 下 fresh `pnpm verify` exit 0：1,099 non-skipped / 56 environment-gated skips，lint/typecheck/build/placeholders 全绿；脚本内 pnpm 为 11.16.0。该结果证明当前 diff 无跨包回归，但 Node engine 不符，最终仍需 Node 22.22.2 重验。 |
| 7. Task 5 声明运行时全仓门禁 | **完成** | 通过隔离 `/tmp` runtime 精确核对 Node 22.22.2 / pnpm 11.16.0，fresh root `pnpm verify` exit 0：1,099 non-skipped / 56 gated skips，lint/typecheck/build/placeholders 全绿；未改用户 shell 或项目配置。下一步仅剩经单独授权的 disposable integration、最终 review 与独立提交。 |
| 8. Task 5 disposable focused integration / review fix | **完成** | 首轮两个 focused integration 文件 15/15 PASS；独立复审 0C/1I/1M 后补齐 security_risk/scam_indicator 真实 AS111、caution 两授权角色和 blocked reviewer/security_reviewer/admin 全拒绝，复跑 17/17 PASS（60.37s）。未 reset/复制远端文件，fixture 自清理，隧道关闭；生产端口未访问。 |
| 9. Task 5 final gate / scoped re-review | **完成（review clean）** | 最终精确 Node 22.22.2 / pnpm 11.16.0 root `pnpm verify` exit 0：1,099 non-skipped / 58 gated skips，lint/typecheck/build/placeholders 全绿。Scoped re-review 确认 prior Important/Minor 均 Resolved，无新增 C/I/M，Ready to merge: Yes。下一任务为 Task 6。 |
| 10. Task 5 atomic commit | **完成** | Task 5 已以提交 `9dd3155`（`feat(worker): route security extraction candidates`）在 Phase 7A worktree 原子提交，未包含主工作区 `.DS_Store` 或其他用户文件；下一步进入 Task 6 `Collection/scoring protect-first gates`。 |
| 11. Task 6 RED / local GREEN | **完成** | 测试先行覆盖 collection endpoint/feed/article 写入前 posture gate、typed `security_blocked` 终态、队列非重试取消，以及 scoring 输入筛选和持久化前二次复核；最小实现保持 opportunity/risk 分离并在受限输入下零写入 Score/Factor/Link。collector unit 40/40、queue repository 18/18 通过。 |
| 12. Task 6 disposable integration / review fix | **完成** | marker-verified disposable 栈双会话 focused integration 最终 2 files / 15 tests PASS。初审 1 Critical / 1 Important / 2 Minor 暴露 blocked→caution 评分竞态、article 阻断被吞、测试 promise 收尾与 workbook 状态问题；逐项用失败回归复现后修复。未 reset、未访问生产。 |
| 13. Task 6 final gate / scoped re-review | **完成（review clean）** | 最终精确 Node 22.22.2 / pnpm 11.16.0 root `pnpm verify` exit 0：contracts 133 + domain 376 + database 238 + worker 221 + web 140 = 1,108 non-skipped，66 gated skips；lint/typecheck/test/build/placeholders 全绿。Scoped re-review 为 0C/0I/0M、Ready to merge: Yes；隧道已关闭并核验无监听。 |
| 14. Task 6 atomic commit | **完成** | Task 6 已以提交 `0bda9ce`（`feat(security): enforce collection and scoring gates`）在 Phase 7A worktree 原子提交，22 files、`+1,127/-23`；worktree 干净，未包含主工作区 `.DS_Store` 或其他用户文件。下一步进入 Task 7 `Strict public security repositories + project projections`。 |

> 本轮 Step 2 只做本地读取与本手册更新，未访问数据库、远端或生产。已发现一处交接文档内部不一致：Phase 7A worktree workbook 顶部与 HANDOVER 记录 Task 4 已 Approved/闭环，但该 workbook 的 Task 4 看板行仍是“已实现（待复审 + 数据库集成）”。提交链 `287f677`→`2d2c29b`、手册与 workbook 后续执行记录支持“已闭环”；该陈旧看板单元格应在下一次 worktree 文档提交中更正，不改变代码状态。

> 本轮 Step 3 仅执行本地命令，未连接 Supabase、SSH、远端或生产。声明运行时与完整离线依赖的缺失是当前验收环境缺口，不阻止先经确认后按 TDD 编写 Task 5 本地 RED/实现，但任务不能在 Node 22 fresh `pnpm verify` 和需要的 disposable integration 成功前宣布完成。

### 2026-08-27 本轮执行记录（WorkBuddy 接手：Task 3 收口 + Task 4 完成）

**Task 3 Fix Round 1 disposable validation（经用户授权）**：按 6B 同款流程同步修复版 migration/013/006 至 authorized disposable 路径并 reset（22 migrations exit 0）；focused 013 暴露三个测试侧缺陷（authenticated 块直调被 revoke 的 `evidence_quote_sha256_v1`、outbox 约束 INSERT 缺省 occurred_at、锁序断言 SQL 字面量 `\n` 非换行）均测试侧最小修复；探针实测 outbox 分布后补入新 caution incident 聚合使 want=7 成立。终态 focused 013 **224/224**、full pgTAP **13 files / 1,338 PASS**、typegen 双次 SHA `61e8829c…` 一致并以生成产物替换手工 types（93 行 FK→视图漂移归位）、根 verify exit 0。提交 `daf6d40`。scoped re-review **Approved**（8 Important + 5 Minor 全部 Resolved、0 新增），Task 3 于 `6b990fd` 闭环。

**Task 4 bearer-scoped security review repository（完成）**：TDD 实现 `packages/database/src/security/`（repository/entry/browser-denied）、`./security-review` 条件导出、44 个新单测与环境门控集成测试（四变量 loopback fail-closed、marker 先验、randomUUID 自有资产 teardown 单事务 bulk 清理）。RED 具名缺失模块失败；GREEN database 包内 test **225 passed / 51 gated skipped**、lint/typecheck exit 0。controller 推导集成变量（值不打印、远程无副本）并以精确 IPv4 绑定隧道于 disposable 栈跑 focused integration：首轮暴露两处测试缺陷（teardown 以不存在的 project_id 查 indicators、相邻模板插值生成 `$7$8`）与一处实现缺陷（`limit+1` 越界 RPC 上限 AS108），修复后 **7/7 PASS**（授权矩阵/幂等重放冲突/版本冲突/双 incident 并发与独立解除），根 verify exit 0。提交 `287f677`；scoped re-review 八项安全核查全 Pass、**Approved**、0C/0I，3 个 Minor 当轮闭环后提交 `2d2c29b`。期间曾误建指向生产端口的短命隧道并即时拆除核验为唯一正确目标。全程生产零访问。下一任务 Task 5。

### 2026-08-28 Codex 接续与 Task 5 执行记录

| 步骤 | 状态 | 证据 / 下一步 |
|---|---|---|
| 1. 交接、产出与阶段复核 | **完成** | 已分段读完交接手册 757 行、Phase 0/1 plan 599 行与 workbook 386 行，并详读 Phase 7A Approved spec 716 行、Task 5 计划及 Task 1–4 实际产出。现场确认 linked worktree HEAD `2d2c29b`、tracked clean，Task 5 尚无实现 diff。 |
| 2. 新鲜本地基线 | **部分完成（环境限制）** | 当前可用运行时为 Node 24.19.0 / pnpm 11.16.0，非声明的 Node 22.22.2。在 Node 24 下 Task 5 相关 focused 基线为 database 225 passed / 51 skipped、worker 212 passed / 2 skipped。fresh root verify 未进入 lint/test：pnpm 依赖状态检查因 registry `ENOTFOUND`且离线 store 缺 `@eslint/js@10.0.1` 而中止；原 `node_modules` 已原位恢复，源码/lockfile 无改动。Task 5 不得在 Node 22 root verify 与所需 disposable integration 通过前宣布完成。 |
| 3. Task 5 方案确认 | **完成** | 用户已批准以单 extraction 批次事务原子写入/路由 security 候选、普通 pending 列表隔离 security claim，并在 Promotion repository/CLI 稳定映射 `AS104 → security_reviewer_required`、`AS111 → security_review_required`、`AS112 → security_promotion_blocked`；不根据人类错误文本分支，不泄漏 SQL。 |
| 4. Task 5 RED | **完成** | 已先新增 extraction repository 的 7 个具名测试，覆盖两类 security claim 路由、重复重放、普通候选不路由、混合批次选择性路由、路由失败整批回滚及普通 pending 隔离；另扩展 worker extraction 透传、Promotion SQLSTATE 与 CLI 稳定错误回归。有效 RED：extraction 7/7 失败，分别因事务数仍为 0、路由失败未拒绝、security rows 仍进入普通 pending；未写生产代码。Promotion focused suite 受当前 worktree 依赖链接缺失阻断于 import，不能计作业务 RED；后续使用恢复后的声明运行时/依赖复验。 |
| 5. Task 5 本地 GREEN | **完成** | extraction repository 已改为每批单事务，仅对成功新插入的 `security_risk` / `scam_indicator` 调用 `route_security_extraction_candidate`，重复项不重路由，任一路由失败整批回滚；普通 pending SQL 排除两类安全 claim。Promotion 仅按 SQLSTATE 映射 `AS104` / `AS111` / `AS112`，worker CLI 沿用稳定错误码输出。新增真实 ingress integration 及 Promotion caution/blocked 回归，并纳入 database integration script。依赖按 lockfile 恢复后，本地 database 12 files passed / 9 skipped、235 passed / 54 skipped，worker 17 files passed / 1 skipped、217 passed / 2 skipped；两包 lint/typecheck exit 0。 |
| 6. Task 5 全仓门禁（当前运行时） | **完成（非声明 Node）** | Node 24.19.0 下 fresh `pnpm verify` exit 0：contracts 132 + domain 375 + database 235 + worker 217 + web 140 = **1,099 non-skipped**，56 environment-gated skips；lint、typecheck、build、placeholders 全绿。脚本内 pnpm 为锁定的 11.16.0，但 Node 仍超出 `>=22 <23`，所以不能替代声明运行时验收。 |
| 7. Task 5 声明运行时验收 | **完成** | 通过隔离 `/tmp` runtime 精确核对 Node 22.22.2 / pnpm 11.16.0，并执行 fresh root `pnpm verify` exit 0：1,099 non-skipped / 56 gated skips，lint/typecheck/build/placeholders 全绿。临时 runtime 不改用户 shell 或项目配置。 |
| 8. Task 5 disposable integration | **完成** | 用户授权后，仅用手册指定 SSH key 建立 `16432→64322` / `16433→64321` disposable 隧道；仓库环境校验器 fail-closed 通过。首轮 2 files / 15 tests PASS；独立复审补强后复跑 **2 files / 17 tests PASS**（60.37s），覆盖 ingress 真实 ai_stage_worker 角色、RLS/RPC、安全 candidate/event/outbox、重放、路由失败整批回滚、security_risk/scam_indicator 真实 AS111，以及 reviewer/security_reviewer/admin 的 caution 放行矩阵与 blocked 全拒绝。未 reset、未复制远端文件、fixture 自清理；测试后隧道已关闭，生产 54322/54321 未访问。 |
| 9. Task 5 final review / gate / commit | **完成（review clean）** | 初审 0 Critical / 1 Important / 1 Minor；两项均修复。最终精确 Node 22.22.2 / pnpm 11.16.0 `pnpm verify` exit 0：contracts 132 + domain 375 + database 235 + worker 217 + web 140 = **1,099 non-skipped / 58 gated skips**，lint/typecheck/build/placeholders 全绿。Scoped re-review 判定 Important/Minor Resolved、无新增 C/I/M，Ready to merge: Yes。Task 5 已以 conventional subject `feat(worker): route security extraction candidates` 原子提交；下一步进入 Task 6 设计核对与 RED。 |

> 本轮仅在用户精确授权后通过 `16432→64322` / `16433→64321` 隧道运行 disposable focused integration；未同步远端文件、未 reset，测试 fixture 已清理且隧道已关闭。生产 54322/54321 未访问，任何后续外部动作仍需单独授权。

### 2026-08-26 本轮接续复核进度

| 步骤 | 状态 | 已核对内容 / 后续动作 |
|---|---|---|
| 1. 阅读交接手册与上一会话 `01a03208-81fd-7983-afad-2dec796e5aeb` | **完成** | 上一会话已完成详情页 score factors + reviewed Evidence 功能的最终复审、本地主线快进集成和合并后门禁；当前分支仍为 `codex/phase-0-1-foundation`，HEAD 为文档收尾提交 `74f0e6c`，功能提交锚点为 `a372880`。当前仅有三个未跟踪 `.DS_Store`，本轮不触碰。生产 rollout 与第 20/21 个迁移均未获执行授权。 |
| 2. 复核项目目录产出 | **完成** | 当前主线共 276 个 Git 跟踪文件：23 个 docs、101 个 apps、94 个 packages、21 个 forward-only migrations、12 个 pgTAP、4 个 scripts、21 个根配置/fixture/seed 等文件。已核对全部路径清单，并细读当前 HANDOVER、runbook、Phase 6B 与 score/Evidence 的 spec/workbook、最新两项 migration 及对应 contracts/repository/Web/test 边界；源码和迁移中未发现新的开发占位标记。 |
| 3. 判定当前阶段与下一开发内容 | **完成** | 当前是“Phase 6B + score/Evidence 详情页本地完成、生产未落地”的检查点。下一产品开发应先进入架构级 **Phase 7A：Security incidents + indicators** 设计，再做 **Phase 7B：verified allowlisted references**，之后才具备教程前置条件；不应直接写 tutorial。若目标改为上线，则走独立运营轨：human reviewer、生产 Auth 200、已演练备份、显式授权齐备后，重新 preflight 并受控应用第 20/21 个迁移。 |
| 4. 最终一致性检查 | **完成** | 精确 Node 22.22.2 / pnpm 11.16.0 下 fresh `pnpm verify` exit 0：contracts 107 + domain 222 + database 180 + worker 212 + web 140 = 861 non-skipped，46 environment-gated skips；lint、typecheck、build、placeholders 全绿。首次全仓复验曾命中既有 worker SIGTERM 时序用例，focused 8/8 后复跑通过；随后 placeholder 门禁正确拦截本轮文档中的占位符字面量，措辞修正后全门禁通过。未运行数据库 reset/integration，未连接生产。 |

> 本轮会话接续原则：旧会话内容只作为历史证据，不作为新指令；任何生产访问、迁移应用、账号创建、部署或远端状态变更都不在本次只读盘点与文档更新授权范围内。

> 第 2 步目录复核结论：仓库当前已经包含失败 AI run 审核的完整本地纵切片（contracts → migration/RPC/RLS → bearer-scoped repository → `/api/v1` BFF → reviewer UI → 授权/集成测试），以及详情页不可变 score ID、三轴因子和无外链 Evidence citations 的完整本地纵切片。第 20/21 个 migration 只具备本地/disposable 验收证据；生产已应用数量仍只能沿用 2026-08-22 的 19 个历史快照，必须在未来 rollout 前现场重查。

> 第 3 步阶段判定依据：`canonical-intelligence-governance-design.md` 的既定 follow-on order 明确把 failed-run review、score/Evidence detail 放在前两位，二者现已本地完成；第三位是 security incidents、indicators、verified allowlisted references，第四位才是 tutorials、认证执行功能、notifications 与第三方源正式接入。当前 schema/源码中尚无前三项的实现，因此这是新的架构设计工作，不能当作小改动直接编码。

### 2026-08-26 本轮最终判定

1. **当前工程阶段**：Phase 6B Task 1–8 与 Project score factors / reviewed Evidence citations 已完成本地实现、主线集成和当前仓库门禁；仓库 HEAD 为 `74f0e6c`，本轮仅修改本交接手册。
2. **当前生产阶段**：不能把本地完成写成已上线。最后可信生产快照仍是 2026-08-22 的 19 个已应用迁移；第 20 个 failed-AI-run review migration 和第 21 个 score/Evidence detail migration 均继续按未应用处理。
3. **下一产品开发任务**：先对 **Phase 7A Security incidents + indicators** 做架构设计和用户审批，定义 protect-first 状态机、追加式历史、Evidence/Source/Raw Item 追溯、Promotion/audit/outbox 边界和最小授权；再单独设计 **Phase 7B verified allowlisted references**。两者完成后才进入 tutorials。
4. **若下一目标是生产上线而不是继续开发**：先由项目所有者指定真实 human reviewer，恢复生产 Auth 并现场确认 health 200，建立并演练迁移前备份，再明确授权 rollout；之后重新只读 preflight，按顺序受控应用/登记第 20、21 个迁移并执行 reviewer 与匿名读路径 smoke/拒绝矩阵。

### 2026-08-26 Phase 7A 设计进度

| 步骤 | 状态 | 结论 / 后续动作 |
|---|---|---|
| 1. 现状与边界研究 | **完成** | 当前仓库已预留 `security_reviewer` 角色、`security_risk` / `scam_indicator` AI 候选类型、`paused` project lifecycle 与 `blocked` recommendation 枚举；但没有 security incident/indicator 的 canonical 表、契约、命令、repository、API 或 UI。现有确定性评分器只产生 `act_now/watch/research/avoid`，不会产生 `blocked`。 |
| 2. 产品范围澄清 | **完成** | 已确认独立 posture、两级作用域、三档状态、最严格合成、权限/候选入口、source/project 门禁、完整 reviewer/public UI 与逐 indicator 公共披露审批。 |
| 3. 架构方案与分节设计 | **完成** | **已确认**采用追加式 Security Ledger，不采用可变 incident 聚合或复用 signal/catalog；总体架构与数据边界、命令/状态/事务、读模型/门禁/UI、安全测试/验收/不做项四节均已逐节确认。 |
| 4. Spec / plan / TDD 实施 | **进行中** | 正式 spec 已批准；实施计划 `docs/superpowers/plans/2026-08-26-phase-7a-security-incidents-indicators.md` 与 workbook `docs/tasks/phase-7a-security-incidents-indicators-workbook.md` 已完成并自审，拆成 11 个独立 RED/GREEN/review/commit 任务。Task 1 strict contracts 已 review clean。Task 2 已以 TDD 完成 dependency-free posture precedence/target lock ordering、candidate/incident/disclosure reason-transition 和 indicator normalization/lexical/exact occurrence 规则；初始 RED 为 72 个 missing-export failures，初始 GREEN 为 domain 295。独立审查要求补齐穷举覆盖；Fix Round 1 完成 reason matrices、general length 与 composite identity，Fix Round 2 完成 5 actions × 3 current states lifecycle matrix。最终 domain 12 files / 375 tests，contracts 131，full `pnpm verify` 1,038 non-skipped / 46 skipped 全绿；round-2 scoped re-review APPROVED，无 production 文件修复 diff。deferred Minor 留待最终审查；数据库 parity/Evidence/RLS 归属 Task 3。未运行 DB reset/integration，未访问网络/生产，未增依赖/迁移。下一步执行 Task 3 Security Ledger migration、protected commands、RLS 与 pgTAP。 |

Phase 7A 设计铁律：安全态与 opportunity/risk/confidence/score recommendation 保持独立；AI/collector 只能提交候选数据，不能写 canonical incident、最终 security decision 或解除封锁；事件、指标、决策和解除历史必须追加保留并追溯到 Evidence、Raw Item 与 Source；先施加最小相关预防措施，再调查；本阶段不包含 verified links、tutorials、notifications、自动交易或绕过类功能。

**已确认的 Phase 7A 产品决定 1 — 独立安全覆盖层**：公开/内部消费者读取独立的 security posture，而不是由安全事件重写 Catalog lifecycle 或评分历史。安全封锁不会降低或覆盖 opportunity/risk/confidence，也不会伪造新的 deterministic score recommendation；页面可以同时显示原评分与当前安全限制。安全态恢复必须追加新的 reviewer decision，保留原 incident、indicator、precaution 与解除依据。

**已确认的 Phase 7A 产品决定 2 — 最小封锁粒度**：首版 canonical security effect 仅作用于 `project` 或 `source`。来源级风险只暂停该来源的后续安全消费，不自动扩大为项目级封锁；只有事件证据指向项目整体时才创建项目级 precaution。indicator 可以记录域名、URL、合约地址、交易哈希或其他受约束观察值，但本阶段不为这些值建立公开链接解析、reference 级 enforcement 或教程联动。

**已确认的 Phase 7A 产品决定 3 — 人工 canonical 权限边界**：只有当前持有未撤销 `security_reviewer` 或 `admin` grant 的 Supabase 会话，才能调用受保护命令创建 incident + 初始 precaution、升级/降级 precaution 或解除安全限制；调用者身份必须来自 `auth.uid()`，不能由请求体指定。AI、collector、普通 reviewer、普通 admin 以外的应用角色只能提交或持有候选数据，不能写 canonical security decision。接受命令必须把 decision、precaution history、audit/command receipt 与 transactional outbox 原子提交。

**已确认的 Phase 7A 产品决定 4 — blocked source 的 Evidence 门禁**：来源级 precaution 生效后，该 source 立即停止进入新的采集/公开情报消费，并从公开 Evidence 有效性判断中排除。仅由 blocked source 支撑的 published signals 与 scores 保留在数据库但从公共读模型隐藏；若同一 claim/score 仍有其他未封锁来源的完整有效 Evidence，则继续公开。项目详情与冲突/历史记录不被删除或静默覆盖。

**已确认的 Phase 7A 产品决定 5 — blocked project 的公开呈现**：项目级 precaution 生效后，该项目立即退出首页推荐、可执行机会排序和 `act_now/watch/research/avoid` 统计，但不删除项目、signals、scores、Evidence 或安全历史。公共机会页提供独立“安全封锁”视图；详情页继续可访问，优先展示安全警告、当前 posture 与可公开的 incident 摘要，并将既有机会/风险/置信度和 score recommendation 明确标成安全事件前的历史评分快照，不能作为当前行动建议。

**已确认的 Phase 7A 产品决定 6 — 三档 posture**：安全覆盖层使用 `clear / caution / blocked`。`clear` 表示没有有效 precaution；`caution` 保留公开展示与普通排序并显示警示，既有 Evidence 暂不失效，但该 target 的新 canonical intelligence 必须经过 active security reviewer 复核；`blocked` 执行已确认的 source/project 强制门禁。posture 不写回评分轴、score recommendation 或 project lifecycle。

**已确认的 Phase 7A 产品决定 7 — 并发 incident 合成与解除**：同一 target 的当前 posture 由全部未解除 precaution 的最严格等级确定，优先级固定为 `blocked > caution > clear`。incident 的降级、解除与重新开启都追加新 decision/precaution history，并要求受约束 reason code 与 Evidence；处理一个 incident 不影响其他 incident。`clear` 只能在该 target 不再存在任何有效 precaution 时由读模型推导，禁止用可变字段或最后写入覆盖历史。

**已确认的 Phase 7A 产品决定 8 — 两类 candidate 入口**：现有 AI/collector 管线产生的 `security_risk` / `scam_indicator` extraction candidates 必须从普通 signal Promotion 路由到专用 security candidate review queue；它们是非 canonical 候选，不能触发 precaution。active security reviewer 还可选择既有 Evidence 提交结构化 indicator candidate，但仍需经过同一受保护审核边界。首版不接第三方 threat-intelligence API、链上监控供应商或社区公开举报入口，这些后续单独设计来源可信度、速率限制与滥用防护。

**已确认的 Phase 7A 产品决定 9 — 完整 reviewer + public UI 纵切片**：复用既有 Supabase browser session、认证验证器和 `/review` 专用 shell，但在 contracts、database、repository、BFF routes 与 UI 上建立独立 security 模块，不把安全事件塞进 failed-AI-run review 表。reviewer 端覆盖候选列表/详情、人工候选、incident 创建、precaution 调整、历史与解除；公共端覆盖 blocked 列表、机会/详情 posture 与安全警示。CLI 仅作受保护运维辅助，不是主审核入口。

**已确认的 Phase 7A 产品决定 10 — 分级公共披露**：公共投影默认只暴露 posture、事件类别、严重度、安全摘要、首次发现/最近验证时间与受影响 scope。indicator 值只有在 security reviewer 的追加式决策中被逐条标记 `public_safe` 后才能公开，并始终按受约束惰性文本渲染，不生成 anchor、HTML、Markdown 或可执行链接。内部调查 note、Evidence locator、candidate payload、reviewer identity 和未批准 indicator 永不进入公共投影。

**已确认的 Phase 7A 架构选型 — 追加式 Security Ledger**：采用独立的 candidate → indicator → incident → decision/precaution history → derived posture 数据链。拒绝在 incident 主记录上覆盖当前状态，也拒绝复用 signals、project lifecycle 或 score recommendation 表达安全决定。protected command 必须以真实 Supabase reviewer session 归因，并原子写入追加式历史、command receipt、security audit 与 transactional outbox；公共/内部 current posture 只从 ledger 推导。

**已确认的 Phase 7A 设计第 1 节 — 总体架构与数据边界**：完整链路固定为“AI/collector 或 reviewer 人工提交 candidate → 专用 security candidate review → 受保护命令 → canonical indicator + Evidence links → incident + 追加式 decision/event history → project/source derived posture → collection、Evidence、opportunity 与公共投影门禁”。独立数据对象为 `security_indicator_candidates`、`security_candidate_review_decisions`、`security_indicators`、`security_indicator_evidence_links`、`security_incidents`、`security_incident_indicator_links`、`security_incident_decisions`、`security_events`、`security_review_commands`；事务性消息复用既有 `outbox_events`，但使用版本化 security event type。`packages/contracts` 唯一定义枚举、命令、回执、读模型、错误与事件 payload；`packages/domain` 只实现 posture 合成、状态转换、reason compatibility 与公开披露等纯规则；`packages/database` 负责追加式 schema、RLS、受保护事务命令、repository、读模型和 outbox。禁止在 incident 或 target 上存可覆盖的 `current_posture`：单 incident 当前效力由其最新追加决策推导，同一 target 再按 `blocked > caution > clear` 合成；canonical 写入不得经浏览器或普通表 DML 绕过受保护命令。

**已确认的 Phase 7A 设计第 2 节 — 命令、状态与事务流程**：candidate 审核支持追加式 `needs_review`、`reject`、`accept_and_open` 与 `accept_and_attach`；前两者不创建 canonical 数据，后两者必须先确定性验证 target、Evidence → Raw Item → Source、locator、indicator 类型/值、source posture 与 scope。grounding 失败时只追加 `needs_review` 决定与安全审计，不创建 indicator、incident 或 precaution。incident 命令固定为 `open`、`adjust`、`resolve`、`reopen`，indicator 披露由独立 `set_indicator_disclosure` 命令逐条追加或撤销 `public_safe`；初始/重开/调整 posture 只能显式选择 `caution` 或 `blocked`，`clear` 仅由无有效 precaution 推导。所有 posture 变化均要求受约束 reason code 与有效 Evidence。每个成功 mutation 必须在单一数据库事务中原子提交 decision、必要的 indicator/Evidence/incident links、security event、command receipt 与版本化 outbox；事务期间不得调用模型、collector 或外部 API。所有 mutation 使用 `Idempotency-Key`，candidate/incident mutable aggregate 命令使用 `expected_version`；同 key 同请求精确重放，同 key 异请求报幂等冲突，同 incident 并发仅一个期望版本成功，不同 incident 可并发且 target posture 始终按全部有效 precaution 的最严格等级推导。调用者只取当前 Supabase `auth.uid()`，每次重新验证 active `security_reviewer` 或 `admin`；错误使用稳定领域码并清洗，outbox 仅携带安全对象引用/版本/类型/scope/posture，不携带身份、内部 note、locator、candidate payload 或 indicator 值。

**已确认的 Phase 7A 设计第 3 节 — 读模型、门禁与界面流程**：内部读模型提供 candidate queue/detail、incident detail/history 与分别按 project/source 推导的 target posture；公共读模型只提供 project posture、获批 incident 摘要、逐条 `public_safe` indicator 和独立 blocked-project 游标列表。`blocked source` 在调度、外部请求前和写入事务前多点重检，停止新增采集/抽取/普通 Promotion/公开 Evidence 消费但保留历史；其已采集且确定性 grounded 的 Evidence 仍可由 Security Ledger 作为内部调查依据，绝不因此恢复普通公共资格。`caution` 可继续采集抽取，新 canonical intelligence 只能由 active security reviewer/admin Promotion。`clear` 沿用普通 Promotion 权限，`caution` 强制 security reviewer，`blocked` 除 Security Ledger 命令外拒绝新 canonical intelligence；强制检查必须落在受保护数据库命令边界。当前 schema 只有 score → signals → Evidence 而没有 factor → Evidence 归因，因此安全资格按整份 score 处理：每个 score-linked signal 均须保留至少一条非 blocked source Evidence，否则整份 score 及其 factor rows 退出当前公共排序并保留为历史，禁止伪造 factor 级证明；source 封锁不得自动升级为 project 封锁。reviewer UI 复用 `/review` 认证 shell，新建 `/review/security` 完整候选、incident、posture、披露和历史流程，高影响命令显式确认，409 刷新而不覆盖；公共 UI 提供独立安全封锁视图，`caution` 保留排序并警示，`blocked` 退出普通机会/统计但详情可访问且行动入口停用。公开 indicator 始终是经批准的惰性文本。Reviewer API 使用 `/api/v1/review/security/*`，公共 blocked 列表使用 `/api/v1/security/blocked-projects`，现有 opportunity/detail 只接严格 security projection；Route Handler 不执行长任务。

**已确认的 Phase 7A 设计第 4 节 — 安全测试、验收标准与明确不做项**：contracts 必须验证 strict schema、类型/scope/reason 兼容、游标/边界、精确安全投影及敏感字段泄漏变异；domain 必须穷举 posture 合成、多 incident、追加式状态转换、Evidence/整份 score 门禁与披露规则；disposable Supabase 必须覆盖全部主体 RLS、protected-command-only canonical 写入、`auth.uid()` 归因、append-only、原子回滚/outbox、幂等/版本与双 session 并发。集成测试必须覆盖 source 在排队后、请求前、请求中的封锁时序、替代 Evidence、最后有效 Evidence 失效、caution Promotion、blocked project 公共流与 incident 独立解除；BFF/UI 覆盖认证、角色撤销、游标、409、确认流程、惰性文本/XSS 与 browser bundle 泄漏。Golden Dataset 增补明确/否定/历史/错实体/格式/冲突/prompt injection/locator/虚构引用样本，模型永远只产 candidate。完成必须同时证明 Evidence → Raw Item → Source 追溯、protect-first 原子性、即时门禁、公共零泄漏、clear 无回归、完整数据库与仓库门禁全绿并同步文档；明确排除 Phase 7B、reference enforcement、tutorials、notifications、钱包/交易、第三方威胁源/链上监控/公众举报、AI 自动 canonical 决策、scope 自动升级、评分/lifecycle 改写、实时推送及生产 rollout。

**Phase 7A 正式设计规范与自审结论**：正式规范已写入 `docs/superpowers/specs/2026-08-26-phase-7a-security-incidents-indicators-design.md`，并已获用户最终批准，状态为 `Approved`。自审补强了三项不改变已批产品范围的实现约束：① Security Ledger 可使用 blocked source 的历史 grounded Evidence 进行内部调查，但普通公共 Evidence/score 资格继续 fail-closed；② 现有模型没有 factor 直接 Evidence 归因，故门禁整份 score 及其 factor set，避免虚构因果关系；③ security command、ordinary Promotion、score persistence 与 source collection persistence 使用同一确定性 target advisory lock，按提交先后序列化封锁竞态，且命令时间取数据库事务时钟、不接受调用者伪造 reviewer/timestamp。规范已明确严格枚举/契约、九张 ledger 对象、RLS/append-only、candidate 版本、outbox 安全字段、全部 reviewer/public API/UI、Golden Dataset 与完成门禁；下一步是完成实施计划并由用户选择执行方式，不是直接跳过计划编码。

**Phase 7A writing-plans 结果**：实施计划已写入 `docs/superpowers/plans/2026-08-26-phase-7a-security-incidents-indicators.md`，配套跟踪表已写入 `docs/tasks/phase-7a-security-incidents-indicators-workbook.md`。计划按 contracts → domain → 单一 forward migration/pgTAP → bearer repository/races → extraction/Promotion → collection/scoring → public repository → BFF/client → reviewer UI → public UI → Golden/E2E/runbook/full verify 拆为 11 个任务、67 个 checkbox steps；每个任务均要求 RED、具名失败、最小 GREEN、focused gate、HANDOVER/workbook 更新和独立 conventional commit。自审已逐节映射 approved spec，修正跨任务类型/函数名、candidate/incident/indicator 版本、数据库事务时钟、score-level Evidence 语义和同 target advisory-lock 竞态；占位措辞扫描、`pnpm check:placeholders`、结构检查与 `git diff --check` 均通过。执行前必须使用 using-git-worktrees 建立 `codex/phase-7a-security-ledger` 隔离 worktree 并重跑 declared-runtime baseline；生产继续不在授权范围。

> **2026-08-22 历史接续结果（当时状态）**：先完成 225 个跟踪产出与主线核验，再按 §8.2 将 Phase 6A 三迁移原子应用并逐条登记；创建强随机密码的最小权限治理登录与在册审核人；补齐 12 组 demo Evidence；历史对账 `processed=7 / linked=7 / needsReview=0` 且重跑为 0；四个真实 Web 请求均为 HTTP 200。Phase 6B 的详细设计、九任务实施计划和开发工作簿已经固化；当时的下一步是在隔离 worktree 中从 Task 1 contracts 开始执行 RED → GREEN（该动作现已由 6B 分支完成）。

### 2026-08-24 本轮交接复核进度

| 步骤 | 状态 | 已核对内容 / 后续动作 |
|---|---|---|
| 1. 完整阅读交接手册 | **完成** | 已逐行读完本文件 432 行；确认手册同时包含“主线 Phase 0–6A 快照”和“Phase 6B Task 1–8 本地完成”两层状态，后续必须用当前仓库事实校准，不能只沿用顶部旧摘要 |
| 2. 复核项目目录下产出文件 | **完成** | 已核对 228 个主线跟踪文件、应用/包源码、19 个迁移与 10 个 pgTAP 文件、全部阶段文档，以及 6B worktree 的 46 文件 / 8,776 行新增实现；确认 6B 分支干净（仅未跟踪 `.DS_Store`）且产出闭环 |
| 3. 判断当前阶段与下一开发内容 | **完成** | 详情页 score factors + 经审核 Evidence 的本地实现与最终整分支复审已完成，Ready to merge: Yes；下一步由用户决定如何集成。生产 rollout 仍须实时 preflight、备份、Auth/reviewer readiness 与显式授权 |
| 4. 执行主线集成与正式门禁 | **完成** | 已协调 HANDOVER 冲突、修正 workbook 的 Task 7/8 commit 残留，并在 Node 22.22.2 / pnpm 11.16.0 下执行合并后 `pnpm verify`：798 通过、42 条环境条件跳过，lint / typecheck / build / placeholders 全绿，exit 0 |
| 5. 集成详情页评分因子与 Evidence 引用 | **完成** | 用户选择本地合并；`codex/project-score-evidence-detail` 已从 `63f5278` 快进集成到 `codex/phase-0-1-foundation` 的 `a372880`。主工作区首次门禁因 registry DNS `ENOTFOUND` 止于依赖安装，随后从既有 pnpm v11 缓存以 frozen lockfile 离线恢复（lockfile 未变），fresh `pnpm verify` 861 non-skipped / 46 gated skips 全绿，lint/typecheck/build/placeholders 均 exit 0。生产未访问、迁移未应用。 |

### 2026-08-24 本轮最终判定

1. **当前阶段**：Phase 6B 的产品代码、迁移、契约、BFF、审核 UI、授权矩阵与文档已完成并集成到主线。“主线集成完成”和“生产部署完成”仍必须分开表述；后者尚未发生。
2. **本轮集成结果**：已合入 `codex/phase-6b-failed-ai-review`，人工协调本手册并保留 §8.5 生产检查点；修正 workbook 的 Task 7/8 commit 残留和重复 Task 7 汇总；Node 22.22.2 / pnpm 11.16.0 合并后 `pnpm verify` exit 0。
3. **生产 rollout 不是当前可自动执行的下一步**：截至 2026-08-22 最后一次只读预检，仍缺项目所有者确认的 human reviewer、健康的生产 Auth 服务和已演练的迁移前备份；三项补齐后还需显式生产授权，才能应用第 20 个迁移并执行 smoke/拒绝矩阵。
4. **详情页功能开发**：`score_factors` + 经审核 Evidence 引用的 anon 安全读模型、repository、真实集成与 Web 展示已在独立分支本地完成。引用只展示已审核、受 grounding 约束的惰性文本，无链接；机会/风险/置信度继续独立。该功能 production unapplied；教程生成仍应排在链接白名单与 security incidents 前置设计之后。
> **2026-08-22 本轮接续结果（Codex → WorkBuddy 交接）**：Codex 完成 Task 1–7 实现与多轮评审，但 Task 7 fix round 1（partial Auth setup 精确清理缺口修复）因账户额度耗尽，其 disposable focused 复验与 scoped re-review 未获审批而搁置，代码与文档修改未提交。WorkBuddy 接手后：① 通读 HANDOVER、6B spec/plan/workbook/progress 与未提交 diff，确认修复最小且与报告一致；② 以容器名 `governance-test` 双重白名单脚本在远程 disposable 栈推导 4 个集成测试环境变量（脚本仅输出行数校验，值经 SSH 加密通道回传本地 `/tmp/airdrop-6b-test.env`，umask 077/chmod 600，远程副本当场删除）；③ 恢复 `16433 → 64321` 隧道并以 `/auth/v1/health` 200 确认目标为 disposable 栈；生产端口（54321/54322）无隧道、未访问。随后按序执行 focused integration 6/6 复验、提交 fix round 1、scoped re-review，并续作 Task 8/9。Phase 6A 生产落地、Evidence 补证/对账与 Web 验证保持不变，详见 §8.2。

---

## 1. 项目定位（一段话版）

Web3 空投情报与决策平台（Airdrop Intelligence OS）：回答「今天该参与哪几个空投」。**不是**资讯聚合站，**不是**自动撸毛机器人。六大系统中的前四个（情报采集 → AI 抽取 → 确定性评分 → 页面展示）已端到端打通，采集之外的两个 AI 阶段（抽取、评分）由 worker 内编排循环自动驱动；Phase 6A 又把「AI 候选 → 人工审核 → Evidence 证据链 → 公开可见」的最后一环硬化为可执行的数据库边界（专用 promotion_service 角色、受保护幂等命令、审计与事务性 outbox，公开数据一律 Evidence 门禁）；Phase 7A 则在其上叠加了独立、追加式的安全事件与指标覆盖层（protect-first 门禁、审核工作流、公共 blocked/caution 呈现），已于 2026-08-29 合并主线。教程、任务管理、通知尚未开始；verified allowlisted references（Phase 7B）实施中——Task 1–3（契约 / 纯规则 / 迁移与 pgTAP）已完成并通过 disposable 验证。

核心铁律（详见 AGENTS.md）：永不接触私钥/助记词；永不自动签名；机会分、风险分、置信度三者独立不得合成单一总分；AI 输出只是候选数据，写入正式事实必须走 Promotion Service 并留审计；冲突证据保持可见，不静默覆盖。

---

## 2. 进度总览

### ✅ 已完成（按提交顺序；Phase 0–5 直接在 `codex/phase-0-1-foundation`，Phase 6A 在独立分支开发后已合并回主线）

| 阶段 | 内容 | 关键提交 |
|------|------|----------|
| Phase 0/1 | Monorepo 骨架（apps/web + apps/worker + packages/contracts·domain·database）、TS strict、9 个基础迁移（identity / catalog / intelligence / scores / execution / RLS / 读模型视图）、`/api/v1/health`、admin schedule API、verify 门禁 | 历史提交至 `57aa681` 之前 |
| Phase 2A | 源采集内核：RSS/Atom 解析（saxes）、官方源采集、正文抓取、feed replay 防护、跨源 replay 拒绝 | `3e737aa`、`4293c8c`、`d39f3f2` |
| Phase 2B | 持久化采集队列：durable queue 表、SKIP LOCKED + lease_epoch 围栏、调度器/消费者/组合根、30s 有界优雅停机、8 项敏感性变异全闭环、pgTAP 782 + 集成 20 + E2E 2 | `577ad8c`…`3c3ea5b` |
| 页面落地 | Overview / Opportunities（Tab+游标分页）/ Project Detail（三分立指标卡+信号时间线）三页面，消费 `opportunity_list` / `project_current_state` 读模型视图；12 个中文 seed 项目 | `b67f158` |
| 全站汉化 | UI 文案 + 12 个 seed 项目数据全部简体中文，`lang="zh-CN"` | `d96b69c` |
| Phase 3 管线 | `ai_runs` / `extraction_candidates` / `promotion_events` 三表 + `promote_extraction_candidate` security-definer 函数；contracts zod schema（additionalProperties: false）；extraction repository；DeepSeek（OpenAI 兼容）model client；抽取运行器（幂等、一次 schema-repair、evidenceQuote 空白归一化 grounding）+ 8 个 mock 单测 | `08c8992` |
| 真实数据源 | Ethereum 项目 + EF 博客 RSS（official+verified）fixtures；一次性采集入口 `collect-once.ts`；首次真实采集入库（21 raw_items / 120 discovered / 20 正文） | `0e097c1` |
| **端到端打通** | DeepSeek 真实抽取 130 输入全部处理（EF 博客 120 条正确判零候选；airdrops.io 真实 feed 10 条 → **6 个 grounded 候选 → 6 个 promoted signals**，含审计事件，`/projects/ethereum` 页面可见）；三个 CLI 补自执行入口；`ai_stage_worker` 读权限 RLS 迁移；`dev_fixture_admin` 开发注入角色 | `e0cd5e5` |
| **Phase 4 评分管线** | `packages/domain/src/scoring/score-model.ts` 确定性评分（机会/风险/置信度三轴独立 + 因子分解 + recommendation 决策表，11 个单测）；迁移 `20260815000100_scoring_factors`（score_factors + score_signal_links 两表，ai_stage_worker 写权限）与 `20260815000200_score_factors_axis_unique`（唯一约束修正为按轴）；`scoring-repository.ts`（事务写入 + on-conflict 回查）；`score-projects.ts` runner + `run-scoring.ts` CLI；真实库跑通 **12 个项目评分**（Ethereum 67.30/60.00/35% watch），重跑 12/12 幂等；Ethereum 自动进入 `opportunity_list`（第 6 位）；详情页 fixture 提示同步更新 | `1e9b675` |
| **Phase 5 常态化编排**（2026-08-15） | worker 进程内新增 AI 阶段编排循环（不动已硬化的采集 durable queue）：`packages/domain/src/orchestration/backoff.ts`（指数退避纯函数，7 单测）；`listPendingInputs` 毒物防护对齐——排除**一切**已有 run 的输入（schema 唯一键使失败重试必然重复 `on conflict do nothing`，故语义改为每输入至多一次尝试，失败输入成为事实 dead-letter，待 review 流接手）；`apps/worker/src/orchestration/`（ports + ai-stage-orchestrator 双定时循环 + create-ai-stage-runtime 组合根，13 个单测）；`index.ts` opt-in 集成——设 `AIRDROP_AI_STAGE_DATABASE_URL` + `AI_MODEL_API_KEY` 即启用（tick 可用 `AIRDROP_ORCHESTRATION_EXTRACT_TICK_MS` / `AIRDROP_ORCHESTRATION_SCORING_TICK_MS` 覆盖），缺席则单行 `ai_stage_orchestration_disabled` 日志后纯采集模式；远程库补建 `collection_queue_worker_login` 登录角色；真实库端到端验证：注入 discovered_item → extraction tick 自动拾取并真实调用 DeepSeek 产出候选 → 人工 promote → scoring tick 自动检测 input_version 变化重算（novanet 83.2/20/31 → 74.8/40/27，三轴独立语义正确），页面正确渲染 | `97983ad` |
| **Phase 6A 正式情报治理**（2026-08-21 完成，分支 `codex/phase-6a-canonical-governance`） | 把 Evidence、人工审核、Promotion、审计、事务性 outbox 从 CLI 约定升级为**可执行的数据库边界**：`evidence` / `signal_evidence_links` / `candidate_review_decisions` / `promotion_commands` / `outbox_events` 五表 + 专用 `promotion_service` NOLOGIN 角色 + 受保护幂等命令 `execute_extraction_candidate_review`（审核人在册、期望版本、确定性 grounding、单事务原子写入）与 `reconcile_extraction_candidate_evidence`（历史对账）；撤销 `ai_stage_worker` 直接 INSERT signals 与旧 promote 函数执行权；公开 signal/score 读模型与评分输入全部改为 **Evidence 门禁**（无证据历史保留但隐藏，不删除）；`review-candidate.ts` 治理审核 CLI（approve/reject/needs-review，读 `AIRDROP_PROMOTION_DATABASE_URL` + `AIRDROP_PROMOTION_REVIEWER_USER_ID`）替代旧 promote-candidate（已 fail-closed）；`reconcile-historical-evidence.ts` 有界幂等对账 runner（批次 1-100、UUID 游标、确定性幂等键）；seed/demo fixtures 全部补显式虚构 Evidence；契约与纯函数 grounding 规则（Unicode 空白归一化 + 精确包含 + SHA-256）跨 TS/PG 一致（码点级长度、代理对拒绝）。详见 `docs/superpowers/specs/2026-08-20-canonical-intelligence-governance-design.md` | `a9f1490`…`768df85` + `b67e7a3`（共 19 提交，分支 `codex/phase-6a-canonical-governance`）；2026-08-21 fast-forward 合并回主线，合并后主线 verify 全绿 |
| **Phase 6A 生产落地**（2026-08-22） | 三迁移原子应用并登记；生产治理登录/审核人就绪；12 组 demo Evidence 已补齐；7 个历史 promoted candidates 全部 deterministic-ground 成功并 linked；对账重跑为 0；匿名机会读模型 12 行，Ethereum 6 条真实 signals 恢复；页面验证通过 | 逐步运行证据见 §8.2 |
| **Phase 6B Task 1 contracts**（2026-08-22） | `packages/contracts/src/review/failed-ai-run.ts` 提供严格失败运行状态、查询、无原始错误的安全投影、审核历史、命令/回执 schemas 与 inferred types；决策 reason compatibility、版本边界、备注长度/空白、base64url cursor 均有测试；`packages/contracts/src/index.ts` 已公开导出 | `docs/tasks/failed-ai-run-review-workbook.md` Task 1 execution log；focused contracts 6 files / 77 tests passed，lint/typecheck passed |
| **Phase 6B Task 2 数据库边界（DONE）**（2026-08-22） | migration 保持不变；fix round 1 为普通 active `user` 拒绝、detail 精确/敏感键投影、command 精确结果签名、同时间 UUID 游标、101/102 limit 边界和三类非法 expected version 补强 pgTAP | disposable reset 应用 20 migrations exit 0；updated 011 Files=1 / Tests=87 / PASS；full pgTAP Files=11 / Tests=1031 / PASS；`errorDetail` mutation 命中具名 Failed test 31 并 exit 1，恢复 SHA 后 reset exit 0、focused 87 PASS；生产未访问。 |
| **Phase 6B Task 3 repository（DONE）**（2026-08-22） | 服务器专用 `@airdrop/database/failed-ai-run-review` 以每请求 bearer 创建非持久 Supabase client；strict parse list/detail/decision，安全生成下一页 cursor，稳定映射 AR101–AR105 并清洗意外错误；browser export fail-closed | generated types 两次 SHA-256 均为 `058c11dac49a44065f7bb9b509c0ac000df67b38f6ab4a925b29676ed479078d`；真实 Auth focused 3/3、全 repository integration 37/37；两种 race 均逐字段绑定唯一 decision/receipt/outbox 与获胜 result/key，outbox 仅七个安全字段；partial Auth signup cleanup 四分支有单测。 |
| **Phase 6B Task 4 authenticated BFF/routes（DONE）**（2026-08-22） | 新增失败 AI run list/detail/decision handlers 与三条 `/api/v1/review/ai-runs` routes；先用既有 `AuthenticatedUserVerifier` 验证，再提取并仅按请求传 bearer；fix round 1 补全 canonical error envelope、Authorization fail-closed、wrong-operation fallback 与逐映射 secrets exclusion | leak sensitivity mutation 触发 list/detail/decision 3 个具名失败，恢复后 focused 52/52、Web 69/69；lint/typecheck/build 全绿；Node 22.22.2 根 `pnpm verify` 739 tests、exit 0；独立评审已通过。 |
| **Phase 6B Task 5 session/API clients（DONE）**（2026-08-22） | 新增 public-only Supabase browser client/auth port、无 token 副本的 reviewer session controller，以及 fresh token/idempotency key 的 strict BFF client；fix round 1 静态读取 public env；fix round 2 隔离 bundle；fix round 3 增加 session/API 运行时图覆盖 | runtime RED 同时报告 session/API markers 为 false；恢复后 isolated bundle 1/1、Web 98/98，public + `sign_in_failed` + `review_version_conflict` markers 存在，forbidden server markers/names 缺席，同级哨兵存活；Node 22.22.2 根 `pnpm verify` 768 tests、exit 0；独立评审已通过。 |
| **Phase 6B Task 6 reviewer UI（DONE）**（2026-08-22） | `/review` 绕过公开 `AppShell`；compact JWS/JWT 不再要求每段至少 8 字符，而是要求三段 base64url 结构及 protected header 可解码为含非空 `alg` 的 JSON；覆盖 `e30`、detached payload 与空 signature | focused 28/28、Web 126/126；移除 compact predicate 同时命中两个唯一具名失败，长自然点分标识仍可见；lint/typecheck/build 全绿；Node 22.22.2 根 `pnpm verify` 796 个非跳过测试、exit 0；scoped re-review 通过；未部署、未访问生产。 |
| **Phase 6B Task 7 E2E/授权矩阵（DONE）**（2026-08-22） | 真实 reviewer 全流程（list 三状态、safe detail、`needs_investigation` + 精确 replay + 下一版 `dismiss`、两版不可变历史）、七主体授权矩阵、两类独立 client race、malformed repository detail → 规范化 500 的 HTTP 回归；fix round 1 将 Auth signup 返回的 user ID 在 confirmation/sign-in 前写入共享 Set，teardown 复用经测试的 `presentFixtureUserIds` | Codex 原始门禁：focused 6/6、full 40/40、pgTAP 1031/1031；WorkBuddy 验收：disposable focused 6/6（Node 22.22.2）、fixture 5/5、full `test:integration` 40/40；scoped re-review 无 Critical/Important 破坏；提交 `b2f104b`、`e9b3e52`、`bcbbe7c` |
| **Phase 6B Task 8 runbook/安全审查/仓库门禁（DONE）**（2026-08-22） | runbook 新增「Failed AI run review (Phase 6B)」操作节（flat-SQL 审核人供给、`revoked_at` 即时失效语义、`/review/sign-in` 流程、focused 测试命令、disposable-only 集成变量、迁移前向安全、failed-run retry 明确排除；UI 不建账号/角色）；全分支 secret/unsafe-field 扫描逐条人工分类；本地与远端产物 SHA 一致 | 扫描命中全部归类为测试 fixture/禁令/服务端 bearer 管道/既有 schema 列/ACL revoke（grant 仅 `execute` 给 `authenticated` 且函数内复核）；migration SHA `5150c830…`、011 SHA `e9158648…` 本地=远端；disposable reset exit 0 + full pgTAP 11 files / 1031 PASS；Node 22 根 `pnpm verify` exit 0（798 非跳过）；`git diff --check` 清洁；生产未访问 |

当前测试基线：**Node 22.22.2 / pnpm 11.16.0 下主线合并后 `pnpm verify` 全绿**（lint / typecheck / test / build / placeholders），861 个非跳过测试、46 个 environment-gated skips，exit 0（contracts 107 / domain 222 / database 180+44 skipped / worker 212+2 skipped / web 140）。详情页功能在 disposable 栈的最终执行报告记录 full pgTAP 1114/1114 与 anonymous repository integration 44/44；这些远端/数据库证据未在本次本地合并步骤重放，生产仍未访问或应用第 21 个 migration。

### ⚠️ 半成品 / 已知缺口

| 项 | 状态 | 说明 |
|----|------|------|
| `collection_schedule_admin_login` 角色 | **不存在** | 早期经 ssh 传 `DO $$` 块静默失败遗留。`apps/web/.env.local` 里的 `AIRDROP_QUEUE_ADMIN_DATABASE_URL` 指向它，**目前不可用**。需要时用平铺语句重建：`create role collection_schedule_admin_login with login password '...' in role collection_schedule_admin;`（注意：`collection_queue_worker_login` 已于 Phase 5 补建，模式可参考 §6.2） |
| airdrops.io 数据接入方式 | **开发注入，非正式通道** | 采集器 INSERT 策略深度校验「official+verified」，第三方源被正确拒绝（产品设计）。当前用 `dev_fixture_admin`（bypassrls，仅 raw_items/discovered_items 两表 insert/select）+ `seed-nonofficial-feed.ts` 注入真实 feed。**正式的多源接入（含第三方源的审核接收流）尚未设计实现** |
| Phase 6B integration fixture cleanup | **Task 7/8 已闭环** | 评审发现用户已由 Auth 创建、但 confirmation/sign-in 失败时外层 ID 仍为空。修复为 signup 返回 user 后立即注册到 Set，tear-down 复用经测试的去重/空值过滤 helper；focused 6/6、full integration 40/40、全分支安全审查与完整仓库门禁均已通过。 |
| Failed-run decision concurrency proof | **Task 3 已闭环** | 两个独立 repository/client session 实测：同 reviewer+同 key 仅一写一 replay；同 run+不同 key/同 expected version 仅一成功，另一方 `review_version_conflict`。两种场景逐字段绑定唯一 decision/receipt/outbox、获胜 command/decision IDs 与 idempotency key；outbox payload 精确七个安全字段。 |
| worktree 清理 | **待清理（确认后执行，见 §8.3）** | `.worktrees/phase-2-source-collection`（提交已在主线历史）与 `.worktrees/phase-6a-canonical-governance`（分支已于 2026-08-21 合并回主线）均可清理：`git worktree remove <path>` + `git branch -d <branch>`。⚠️ phase-6a worktree 里若有未跟踪的个人文件，先自查再删 |

### ❌ 未开始（按建议优先级）

1. ~~**评分管线**~~ ✅ **2026-08-15 完成**：score-model-v1 确定性评分 + 因子分解 + recommendation 决策表；Ethereum 及 11 个 demo 项目全部评分，Ethereum 自动进入 `opportunity_list`。见 `docs/superpowers/specs/2026-08-15-score-pipeline-design.md`
2. ~~**机会列表纳入真实项目**~~ ✅ **2026-08-15 完成**：Ethereum 评分后由读模型视图自动纳入（第 6 位）
3. ~~**失败 AI run 的交互式 review / dead-letter 界面（Phase 6B）**~~ ✅ **2026-08-22 本地完成，2026-08-24 主线集成完成**：Task 1–8 已完成严格契约、追加式审核 schema/RPC、bearer-scoped repository、认证 BFF、session/API client、审核 UI、E2E 授权矩阵、runbook 与安全审查；Node 22 门禁 798 非跳过全绿、disposable focused 6/6、full integration 40/40、pgTAP 1031/1031。Task 9 止于 `PRODUCTION_READY — REVIEWER_ACCOUNT_REQUIRED`（见 §8.5），生产应用前置未满足。
4. ~~**采集→抽取→评分的常态化编排**~~ ✅ **2026-08-15 完成（Phase 5）**：worker 进程内 AI 阶段编排循环（抽取 60s / 评分 300s 默认 tick，指数退避，错误隔离，opt-in 环境变量）。采集队列未动；人工 Promotion 门禁按产品设计保留。见 `docs/superpowers/specs/2026-08-15-orchestration-design.md`
5. 教程生成（tutorials，含 `last_verified_at`、链接白名单、状态联动）
6. 任务管理（用户项目、watchlist、tasks）
7. 通知系统（alerts、偏好）
8. ~~**安全风控（incidents、indicators、protect-first 工作流）**~~ ✅ **2026-08-29 本地完成并已合并主线（Phase 7A）**：Task 1–11 全部通过独立复审，提交链 `fbf49d2..55d7f2b`，merge 提交 `00b4497`。产出含 strict 契约、纯 domain 规则、九表追加式 Security Ledger + 受保护命令/RLS、bearer-scoped repository、extraction/Promotion 路由、collection/scoring 门禁、公共安全投影、BFF/浏览器客户端、`/review/security` 审核 UI、公共 blocked/caution 呈现、Golden Dataset 与 runbook。生产未应用第 22 个 migration。详见顶部 Phase 7A 全景看板
9. 用户认证与私有数据（profiles、RLS user_id 场景目前未启用）
10. 运营/审核后台界面（目前只有 API）；详情页 score factors / reviewed Evidence 的本地实现已完成，生产未应用
11. 多源扩展：X/Twitter、项目方公告页结构化解析等
12. **verified allowlisted references（Phase 7B）**：教程功能的前置条件，实施进行中——Task 1–3 已完成（contracts / domain / 迁移+pgTAP+types），Task 4（repository）起待执行

---

## 3. 架构与代码地图

### 2026-08-24 产出文件复核摘要

- **主线现状**：当前分支 `codex/phase-0-1-foundation`，HEAD `d2c71de`，共 228 个 Git 跟踪文件；源码分布为 Web 18、worker 48、contracts 13、domain 23、database 35 个文件；数据库为 19 个 forward-only 迁移和 10 个 pgTAP 文件。主线的 `failed-ai-run-review-workbook.md` 仍是 Task 1–9 全部 `READY` 的设计起点，不代表实际 6B 进度。
- **Phase 6B 实际产出**：独立分支 `codex/phase-6b-failed-ai-review` HEAD `4ce6466`，相对主线新增/修改 46 个文件（`+8,776 / -31`）。产出包括严格 contracts、两张追加式审核表、3 个受保护 RPC、第 20 个迁移与第 11 个 pgTAP 文件、bearer-scoped server-only repository、3 条 `/api/v1/review/ai-runs` BFF 路由、登录/列表/详情/决策页面、浏览器 session/API client、安全文本显示策略、集成/授权矩阵测试、runbook 与 263 行执行 workbook。
- **6B 验证证据**：worktree workbook 记录 Node 22 `pnpm verify` 798 个非跳过测试全绿，disposable focused integration 6/6、full repository integration 40/40、fixture 5/5、full pgTAP 1031/1031；迁移和 pgTAP 产物本地/远端 SHA-256 一致。当前 6B worktree 无已跟踪文件改动，仅有未跟踪 `.DS_Store`。
- **分支关系**：主线与 6B 的 merge-base 是 `13c19e`；主线此后只有 `d2c71de` 这一笔 HANDOVER 状态同步，6B 此后有完整实现提交。两边共同修改 `docs/HANDOVER.md`，因此合并时应先保留本轮 2026-08-24 复核记录，再吸收 6B 手册的实时状态，不能用任一版本整文件覆盖另一版本。
- **文档一致性已修正**：主线集成时已把 6B workbook 的 Task 7/8 commit 单元格更新为实际提交，并移除重复的 Task 7 汇总行；代码与测试结论不变。

### 2026-08-22 产出文件复核摘要

- **产品/UI 产出**：`apps/web` 已有 Overview、Opportunities、Project Detail 三个公开页面，另有 health 与采集调度管理 API；页面只消费数据库读模型，不承载采集、AI、评分等重任务。
- **后台能力产出**：`apps/worker` 已覆盖官方源采集、durable queue、AI 抽取、人工治理审核、历史 Evidence 对账、确定性评分和常态化抽取/评分编排。
- **共享边界产出**：`packages/contracts` 提供严格契约（含 Phase 6B failed AI run review）；`packages/domain` 提供网络/内容安全、队列策略、Evidence grounding、评分与退避纯规则；`packages/database` 提供浏览器隔离的 repository、事务与 server-only 入口。
- **数据库产出**：20 个 forward-only 迁移、11 个 pgTAP 文件、2 个 fixture 与本地 seed；生产仍为已应用 19 个迁移，第 20 个 Phase 6B migration 仅在 disposable 测试栈完成验收。
- **文档产出**：除本手册外共有 README、2 份架构说明、1 份本地运行手册、9 份阶段设计/计划和 4 份任务工作簿。`docs/superpowers/plans/` 内的复选框是历史执行模板，未逐项回填，**不得据其未勾选状态判断阶段未完成**；完成状态与 RED/GREEN 证据以 `docs/tasks/*workbook.md`、Git 提交和当前验证命令为准。
- **未发现新的未完成标记**：排除历史计划文本与本手册说明后，源码、迁移和测试中未发现常见的待办、修复或待定型开发占位。

```
apps/
  web/                      # Next.js（App Router，Turbopack）
    src/app/                #   / (Overview)  /opportunities  /projects/[slug]
    src/app/api/v1/         #   health、admin/source-collection-schedules
    src/components/         #   app-shell（导航/页脚）、opportunity-elements
    src/lib/                #   数据访问
    src/types/next-modules.d.ts  # ⚠️ next/link、next/navigation 的最小 tsc shim（见 §6 坑 4）
  worker/                   # 无 HTTP 端口的生命周期进程
    src/collection/         #   采集内核：RSS 解析、正文抓取、replay 防护
    src/queue/              #   durable queue：scheduler、consumer、lease 围栏
    src/ai/                 #   ⭐ Phase 3：model-client、extract-discovered、
    src/ai/                 #      run-extract.ts / promote-candidate.ts（已 fail-closed）
    src/scoring/            #   ⭐ Phase 4：score-projects runner、run-scoring CLI
    src/orchestration/      #   ⭐ Phase 5：AI 阶段编排循环（抽取/评分双 tick、
    src/orchestration/      #      退避、错误隔离、opt-in 组合根）
    src/promotion/          #   ⭐ Phase 6A：review-candidate.ts（治理审核 CLI）、
    src/promotion/          #      reconcile-historical-evidence.ts（历史对账 runner）
    src/e2e/                #   collect-once.ts、seed-nonofficial-feed.ts（开发注入）
packages/
  contracts/                # 唯一契约源：API/AI 输出/任务 payload zod schema
    src/intelligence/       #   ⭐ Phase 6A：governance.ts（审核命令/结果/outbox 事件契约）
  domain/                   # 纯业务规则（禁依赖 Next/DB/OpenAI/HTTP）
    src/intelligence/       #   ⭐ Phase 6A：evidence-grounding.ts（归一化+精确包含+SHA-256 纯函数）
  database/                 # repository、迁移产物、outbox；src/generated/ 为生成类型
    src/promotion/          #   ⭐ Phase 6A 治理仓库（server-only 导出，browser 入口 fail-closed）
supabase/
  migrations/               # 20 个 forward-only 迁移（勿改已应用者；
                           #   生产库应用前 19 个，第 20 个仅 disposable 验证）
  fixtures/                 #   demo-projects.sql（12 个虚构中文项目 + 显式虚构 Evidence，幂等可重放）
                           #   real-sources.sql（Ethereum + EF 博客 + airdrops.io）
scripts/                    # check-placeholders、verify-env
docs/
  architecture/             # phase-0-1、phase-2 架构文档
  runbooks/local-development.md   # 本地开发流程（权威）
  superpowers/              # 各阶段设计文档与 SDD 计划（历史决策依据）
  tasks/                    # 各阶段 workbook
```

### 数据流（已打通部分）

```
官方 RSS ──collect-once/队列──▶ raw_items ──▶ discovered_items（feed 条目）
                                              │
airdrops.io feed ──dev_fixture_admin 注入──▶（同上表结构）
                                              │
              run-extract.ts（DeepSeek, 幂等, grounding 过滤）
                                              │
                                    ai_runs（每次运行全量留痕）
                                              │
                              extraction_candidates（pending, version, review_status）
                                              │
        review-candidate.ts（治理审核：approve/reject/needs-review）
        │（Phase 6A：专用 promotion_service 边界 + 确定性 grounding + 单事务）
        │
        └─▶ evidence + signal_evidence_links（证据链）
        └─▶ signals（正式事实）+ promotion_events（审计）+ candidate_review_decisions
        └─▶ promotion_commands（幂等回执）+ outbox_events（事件，待投递）
                    │
        project_current_state / opportunity_list（读模型视图，⭐ Evidence 门禁：
                    │            无证据链路的 signal/score 保留但隐藏）
        评分输入（listScoringInputs）同样只消费 Evidence 门禁通过的 signals
                    │
            /projects/ethereum 页面渲染 ✅
```

### 数据库角色速查（表中本地开发角色默认使用 `local-password`；生产 `promotion_service_login` 例外，使用未打印的强随机密码）

| 登录角色 | SET ROLE 到 | 用途 |
|----------|-------------|------|
| `collection_worker_login` | collection_worker | 采集持久化 |
| `ai_stage_worker_login` | ai_stage_worker | AI 抽取阶段读写（Phase 6A 起无直接写 signals 权限） |
| `collection_queue_worker_login` | collection_queue_worker | 队列操作 |
| `collection_schedule_admin_login` | ⚠️ **未建成** | 调度管理（见 §2 缺口） |
| `promotion_service_login` | promotion_service | ⭐ Phase 6A 治理审核 CLI（生产已建；强随机密码仅在 gitignored 本地环境保存） |
| `dev_fixture_admin` | （bypassrls） | 开发注入 fixture，仅 raw_items/discovered_items 的 insert/select |

---

## 4. 环境与运行

### 远程 Supabase（当前唯一真实数据库，本地无 Docker）

固定服务器信息：

| 项目 | 值 |
|------|----|
| 公网 IP | `115.190.206.200` |
| 私网 IP | `172.31.0.2` |
| SSH 用户 | `root` |
| 首选认证 | `~/.ssh/airdrop_intelligence_ecs_ed25519` |
| 备用密码凭据 | macOS Keychain service：`airdrop-intelligence-ssh-115.190.206.200`，account：`root` |

> 服务器密码不得写入仓库、命令历史、日志或环境变量。需要备用密码时，从本机 Keychain 读取：
> `security find-generic-password -a root -s airdrop-intelligence-ssh-115.190.206.200 -w`。
> 后续接手者应优先使用 SSH 密钥；只有密钥不可用时才读取备用密码，不要再次向项目所有者询问已经保存的凭据。

```bash
# SSH（密钥与地址）
ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 root@115.190.206.200

# 隧道（保持开着才能连库）
ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 -N \
  -L 15432:localhost:54322 -L 15433:localhost:54321 root@115.190.206.200
#   15432 → Postgres(54322)   15433 → Kong API(54321)

# 远程 psql（本地无 psql 客户端）
ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 root@115.190.206.200 \
  "docker exec supabase_db_airdrop-intelligence-os psql -U postgres -d postgres -c \"<SQL>\""
```

### 环境变量（全部在 `apps/web/.env.local`，已 gitignore，不入库）

| 变量 | 用途 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器端（经隧道 15433） |
| `AIRDROP_QUEUE_ADMIN_DATABASE_URL` | ⚠️ 指向未建成角色，暂不可用 |
| `AIRDROP_QUEUE_DATABASE_URL` | 队列 worker 身份 |
| `AIRDROP_COLLECTION_DATABASE_URL` | 采集身份：`postgresql://collection_worker_login:local-password@127.0.0.1:15432/postgres` |
| `AIRDROP_AI_STAGE_DATABASE_URL` | 抽取身份：`postgresql://ai_stage_worker_login:local-password@127.0.0.1:15432/postgres` |
| `AI_MODEL_API_KEY` | DeepSeek Key（`sk-` 开头，本地-only） |
| `AIRDROP_COLLECTION_USER_AGENT` | 出站 UA |
| `AIRDROP_QUEUE_WORKER_ID` | 队列 worker 标识 |
| `AIRDROP_ORCHESTRATION_EXTRACT_TICK_MS` | 可选：抽取 tick 间隔（默认 60000） |
| `AIRDROP_ORCHESTRATION_SCORING_TICK_MS` | 可选：评分 tick 间隔（默认 300000） |
| `AIRDROP_PROMOTION_DATABASE_URL` | ⭐ Phase 6A：治理审核 CLI 的 server-only 连接（`promotion_service_login`，生产已配置） |
| `AIRDROP_PROMOTION_REVIEWER_USER_ID` | ⭐ Phase 6A：在册审核人 profile UUID（禁止用户名/actor 字符串） |
| `AIRDROP_EVIDENCE_RECONCILE_LIMIT` | ⭐ Phase 6A 可选：历史对账批量上限（1-100，默认 25） |
| `AIRDROP_EVIDENCE_RECONCILE_AFTER_ID` | ⭐ Phase 6A 可选：对账续跑 UUID 游标 |

> ⭐ **Phase 5 编排 opt-in**：worker 启动时若同时存在 `AIRDROP_AI_STAGE_DATABASE_URL` 与 `AI_MODEL_API_KEY`，则自动运行 AI 阶段编排循环（抽取/评分定时 tick）；任一缺席即纯采集模式（日志 `ai_stage_orchestration_disabled`）。promotion（候选→signal）按产品设计保持人工 CLI。

### 常用命令

```bash
pnpm dev                # web + worker 并行开发（web 在 localhost:3000）
                        # ⭐ 若 .env.local 同时含 AIRDROP_AI_STAGE_DATABASE_URL 与
                        #    AI_MODEL_API_KEY，worker 自动运行抽取/评分编排循环
pnpm verify             # lint + typecheck + test(798 non-skipped) + build + placeholders
env -u NODE_OPTIONS pnpm verify   # ⚠️ 必须这样跑（见 §6 坑 1）

# 手动评分（一次性，幂等：input_version 哈希）
AIRDROP_AI_STAGE_DATABASE_URL=... npx tsx apps/worker/src/scoring/run-scoring.ts

# AI 抽取（一次性，幂等：input_kind+input_id+input_hash+pipeline_version）
AIRDROP_AI_STAGE_DATABASE_URL=... AI_MODEL_API_KEY=... AI_EXTRACT_MAX_INPUTS=50 \
  npx tsx apps/worker/src/ai/run-extract.ts

# 列出/提升候选（⚠️ Phase 6A 起旧 CLI 已 fail-closed，仅输出
# legacy_promotion_cli_disabled_use_review_candidate 后退出）
npx tsx apps/worker/src/ai/promote-candidate.ts list

# ⭐ Phase 6A 治理审核（替代旧 promote；幂等键每次唯一，版本须精确匹配）
AIRDROP_PROMOTION_DATABASE_URL=... AIRDROP_PROMOTION_REVIEWER_USER_ID=... \
  npx tsx apps/worker/src/promotion/review-candidate.ts approve <candidate-id> <expected-version> <idempotency-key>
AIRDROP_PROMOTION_DATABASE_URL=... AIRDROP_PROMOTION_REVIEWER_USER_ID=... \
  npx tsx apps/worker/src/promotion/review-candidate.ts reject <candidate-id> <expected-version> <idempotency-key> claim_not_supported
AIRDROP_PROMOTION_DATABASE_URL=... AIRDROP_PROMOTION_REVIEWER_USER_ID=... \
  npx tsx apps/worker/src/promotion/review-candidate.ts needs-review <candidate-id> <expected-version> <idempotency-key> grounding_failed

# ⭐ Phase 6A 历史对账（有界幂等：批次 1-100 默认 25，UUID 游标续跑；
#    可 ground 的补 Evidence 链接，不可 ground 的 park 成 needs_review，永不删除）
AIRDROP_PROMOTION_DATABASE_URL=... AIRDROP_PROMOTION_REVIEWER_USER_ID=... \
  npx tsx apps/worker/src/promotion/reconcile-historical-evidence.ts

# 手动采集官方源
npx tsx apps/worker/src/e2e/collect-once.ts <project-id> <source-id>

# 开发注入第三方 feed（绕过 official 限制的专用通道）
AIRDROP_DEV_FIXTURE_DATABASE_URL=postgresql://dev_fixture_admin:local-password@127.0.0.1:15432/postgres \
  npx tsx apps/worker/src/e2e/seed-nonofficial-feed.ts <project-id> <source-id> <feed-url>
```

### 关键数据锚点

- Ethereum 项目 id：`fc77de62-1253-4fbc-a589-da4e7084eac7`（slug `ethereum`）
- 源 id：EF 博客 `90000000-0000-4000-8000-000000000030`；airdrops.io `90000000-0000-4000-8000-000000000031`
- 6 个真实 signals 已发布于 `/projects/ethereum`（Ondo 积分、$INK 空投、TrueNorth 等）

---

## 5. 数据库迁移注意（远程操作规程）

1. 迁移文件放 `supabase/migrations/`（forward-only，**绝不修改已应用者**）
2. 远程执行 SQL 后必须手工登记：
   ```sql
   insert into supabase_migrations.schema_migrations (version, name, statements)
   values ('<YYYYMMDDHHMMSS>', '<name>', '{}')
   on conflict (version) do nothing;
   ```
   ⚠️ `statements` 是**数组类型**，空值必须写 `'{}'`（写 `''` 会 malformed array literal）。
   Phase 6A 三迁移的登记值（version / name）：
   - `20260820000100` / `canonical_intelligence_governance`
   - `20260820000200` / `evidence_gated_read_models`
   - `20260820000300` / `historical_evidence_reconciliation`
3. 涉及 security_invoker 视图的迁移：视图引用的底表**每一列**都要对查询角色有列级 SELECT 授权，漏一列就是 42501（曾因此返工，见迁移 `20260814002000`）
4. **迁移文件必须经 stdin 管道执行，绝不用 `psql -c`**（坑 2：`-c` 传 `DO $$...$$`/函数体会静默失败）：
   ```bash
   ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 root@115.190.206.200 \
     "docker exec -i supabase_db_airdrop-intelligence-os psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
     < supabase/migrations/<migration-file>.sql
   ```
   `-v ON_ERROR_STOP=1` 让任何语句报错即中止，避免半应用状态。Phase 6A 迁移含大量 PL/pgSQL 函数体，必须走此通道。

---

## 6. 踩坑记录（血泪教训，务必读）

1. **`NODE_OPTIONS` 污染**：本机 shell 注入 `--use-system-ca` 会让 `next build` 失败。跑 verify 前必须 `env -u NODE_OPTIONS`（同时 unset `NODE_TLS_REJECT_UNAUTHORIZED`）。
2. **经 ssh 传 `DO $$ ... $$` 块会静默失败**（exit 0 但什么都没做）。建角色/密码等 DDL 一律用平铺语句。`collection_schedule_admin_login` 缺失就是这么来的。
3. **RLS 静默过滤不报错**：角色缺 SELECT 策略时查询返回空集而非报错。症状：「数据明明在，程序说没有」。排查：`set role <role>; select count(*) from <table>;`，再查 `pg_policies`。本次 `ai_stage_worker` 读不到待抽取输入就是这样，补了迁移 `20260814120000`。
4. **Turbopack + workspace 包**：apps/web 的 tsconfig 必须保持 **NodeNext**（无 paths/baseUrl），配 `src/types/next-modules.d.ts` shim 供 tsc。**勿用 bundler 模式**——会关闭 Turbopack 的 `.js`→`.ts` 解析，workspace 包 import 全挂。
5. **CLI 文件必须带自执行入口**：只 `export function main()` 不调用，`tsx` 运行时静默无操作（exit 0）。三个 CLI 都已修复，新增 CLI 时注意。
6. **`on conflict do nothing` 后做外键插入**：冲突被跳过时要**回查已有行的 id** 再引用，否则外键悬空。`discovered_items` 幂等键是 `(feed_raw_item_id, stable_entry_key, version)`。
7. **详情页 score 为 null 时整个信号区不渲染**（页面结构如此设计）。真实项目要有信号展示，需先有 `project_scores` 行。
8. **采集表的 INSERT RLS 深度校验 official+verified**：这是刻意的安全设计，**不要绕过**。第三方内容的正式入口应是「人工审核接收流」（未实现）；开发期用 `dev_fixture_admin` 注入。
9. **`set_config('role', ..., true)` 在 autocommit 下语句结束即失效**，要 session 级用 `false`。
10. **`@eslint/js` symlink 曾断裂**（被改名 `.ignored_js`，疑似文件同步层干扰）。遇到 `ERR_MODULE_NOT_FOUND` 先查 node_modules 符号链接。
11. **workspace 包导出 TS 源**：`node dist/index.js` 加载不了模块链，运行一律用 `node --import tsx`（tsx CLI 包装会拦截 SIGTERM，信号语义需同进程）。
12. **sed 单引号会被 zsh 吞**：批量文本替换用 Edit 工具或 Python 脚本。
13. **多数 Web3 项目官方博客 RSS 已枯竭/被墙**（scroll.io 是 SPA 伪装、多数超时）。目前验证可用的：`blog.ethereum.org/feed.xml`（official）、`airdrops.io/feed/`（第三方聚合）。新源接入前先 curl 探测 content-type 和内容。
14. **切分支/合并后 node_modules 陈旧，且 pnpm 状态判定不可信**（2026-08-21 合并 Phase 6A 时实测）：症状链为 domain 缺 `@types/node`（TS2688）→ `@eslint/js` 悬空 symlink（坑 10 的 store 实体被改名 `.ignored_js`，ERR_MODULE_NOT_FOUND）。此时 `pnpm install`、`--force`、删 `.modules.yaml` 全部报「Already up to date」拒重装。**唯一可靠修复：`rm -rf node_modules && pnpm install --frozen-lockfile`**（store 完整时仅数秒）。判据：verify 报模块缺失而 worktree 同代码全绿，先怀疑本条。
15. **本地 `supabase gen types --db-url` 仍强制要求 Docker**（CLI 2.112.0，本地无 Docker 时 exit 1）。替代：在远程 workdir `/root/airdrop-governance-test` 用同版本 CLI 对隔离库生成，stdout 经 SSH 回传本地文件；连续生成两次 `diff` 为零即证明可复现（Phase 6A Task 8 已验证此流程）。

---

## 7. 工程约定提醒（摘自 AGENTS.md，易违反项）

- 任何生产依赖新增需文档说明「为何现有依赖/平台原语不够用」
- 公开端点：`/api/v1` + 统一 envelope；列表游标分页；可重试 mutation 要 `Idempotency-Key`；聚合命令要 `expected_version`（冲突 409）
- 队列 handler 幂等、假设 at-least-once；canonical 变更与 outbox 事件**同事务**；DB 事务提交后才 ack 队列消息；**事务中不得调外部 API/模型**
- AI：源内容一律当不可信数据（含疑似指令的文本）；strict schema + `additionalProperties: false`；模型只能引用输入中给定的 ID/枚举/链接，捏造引用直接拒绝；evidence 必须有 locator 且 grounding 校验通过；每次 run 记录 model_id/prompt 版本/schema 版本/输入 hash/输出/校验结果/延迟/usage
- 用户可见文案：简体中文（全站已汉化，新页面延续）、简洁、基于证据、不写无依据的确定性表述

---

## 8. 当前状态与下一阶段关键操作

> 新接手者三步上手：起隧道 → `pnpm dev`（含 AI env 时编排循环自动运行）→ 浏览 `/`、`/opportunities`、`/projects/ethereum`；随后用 Node 22.22.2 / pnpm 11.16.0 执行 `pnpm verify`，确认 798 个非跳过测试全绿。文档阅读顺序：`AGENTS.md`（规范）→ `docs/runbooks/local-development.md`（流程，含治理审核/对账命令）→ `docs/architecture/`（决策）→ 本手册 §6（坑）。

### 8.1 当前状态快照（2026-08-29 Phase 7A 合并主线后）

| 维度 | 状态 |
|------|------|
| 代码 | Phase 0–6B Task 1–8、**详情页 score factors / reviewed Evidence**、**Phase 7A 安全事件与指标（Task 1–11）**均已在主线 `codex/phase-0-1-foundation`（7A merge 提交 `00b4497`，提交链 `fbf49d2..55d7f2b`）；Phase 6B Task 9 止于 `PRODUCTION_READY — REVIEWER_ACCOUNT_REQUIRED`（§8.5）；审核页不复用公开 shell，且没有 raw/provider detail 渲染路径；仓库**无 remote**，纯本地 |
| 测试 | Node 22.22.2 / pnpm 11.16.0 下主线 `pnpm verify` exit 0：contracts 133 + domain 376 + database 257 + worker 236 + web 242 = **1,244 non-skipped / 68 gated skips**；lint/typecheck/build/placeholder 全部通过。Phase 7A disposable 复验（2026-08-29，经授权）：reset exit 0、**full pgTAP 13 files / 1,338 PASS**、**集成矩阵 9 files / 66 tests PASS**，清理后回到 seed 基线零残留 |
| Phase 7A worktree | `.worktrees/phase-7a-security-ledger` / `codex/phase-7a-security-ledger` 已合并主线，分支与 worktree 按既有惯例保留未删除；合并前两端状态有备份引用 `backup/pre-7a-merge-main`、`backup/pre-7a-merge-7a` |
| 生产库 `airdrop-intelligence-os` | **19 个迁移已应用**，最高 `20260820000300`；Evidence 门禁已生效并完成补证/对账。19 Evidence / 19 signal links / 7 review decisions / 7 command receipts / 7 outbox events；待对账 0；anon 14 signals / 24 scores / 12 opportunities。**第 20–22 个 migration（6B / score-evidence / 7A ledger）均未应用**，生产仍无 `supabase_auth_airdrop-intelligence-os` 容器 |
| 隔离测试栈 `airdrop-intelligence-governance-test` | API 64321 / DB 64322、容器健康（auth/db/kong 均 healthy）；**22 migrations** reset exit 0，**full pgTAP 13 files / 1,338 PASS**，**repository 集成矩阵 9 files / 66 tests PASS**；cleanup 经 marker 校验且仅删精确 fixture，清理后安全表与 outbox 全 0。**只允许对它 reset**；生产未访问 |
| 运行中的进程 | 不作为持久项目状态；接手时应按 §4 重新启动并从当次日志确认 web、采集队列及 AI 编排状态 |

### 8.2 ✅ Phase 6A 上生产（2026-08-22 已完成；保留操作清单供审计）

#### 2026-08-22 实际执行记录

| 执行项 | 状态 | 本轮证据 |
|---|---|---|
| 只读预检与代码基线 | **完成** | 生产迁移 16 条、最高 `20260815000200`；14 projects / 20 signals / 26 scores / 7 promoted candidates；治理表和治理角色均不存在；`opportunity_list` 12 行、`project_current_state` 14 行。迁移文件 SHA-256 已核对，完整 `pnpm verify` 650 测试通过 |
| 迁移 `20260820000100` | **完成** | 使用 `--single-transaction` + `ON_ERROR_STOP=1` 原子应用并登记；5 个治理表与 2 个受保护函数存在；`promotion_service` 为 NOLOGIN/NOINHERIT/NOBYPASSRLS/NOSUPERUSER；`ai_stage_worker` 已无 signals INSERT 权限；20 signals / 26 scores / 7 candidates 保留 |
| 迁移 `20260820000200` | **完成** | 原子应用并登记；两个 Evidence helper 存在；底层 20 signals / 26 scores 保留；owner 与 anon 的公开 signals、scores、opportunity 及带分项目暂时均为 0，符合补 Evidence 前的预期门禁中间态 |
| 迁移 `20260820000300` | **完成** | 原子应用并登记；历史扫描函数存在，仅 `promotion_service` 可执行，anon 与 `ai_stage_worker` 无权限；扫描精确返回 7 个待对账 promoted candidates |
| promotion 登录与审核人 | **完成** | `promotion_service_login` 使用未打印的 256-bit 随机密码，LOGIN/非 superuser/非 bypassrls，且为 `promotion_service` 成员；固定审核人 UUID 的 auth user/profile/active reviewer 均已验证；两项本地配置已写入 gitignored `.env.local`，文件权限由 0644 收紧为 0600 |
| demo Evidence fixture | **完成** | 原子重放新增 12 sources / 12 raw items / 12 Evidence / 12 signal links / 12 score links；14 projects / 20 signals / 26 scores 保持不变；门禁后 anon 实测恢复 7 signals、22 历史 scores、11 opportunity 行。旧文档“12 demo + Ethereum”是概括值，最终以生产读模型实测为准 |
| 历史 Evidence 对账 | **完成** | 最小权限 CLI 首次 `processed=7 / linked=7 / needsReview=0`；立即重跑 `processed=0`，幂等成立。生产现有 19 Evidence / 19 signal links / 7 review decisions / 7 command receipts / 7 outbox events，待对账 0；anon 可见 14 signals / 24 scores / 12 opportunities，Ethereum 6 条 signals 已恢复 |
| 页面与最终门禁 | **完成** | 四个页面/API 均 HTTP 200 并出现预期项目/信号文案；最终矩阵确认 19 migrations、历史 14 projects / 20 signals / 26 scores / 7 candidates 不变、公开 signal/score Evidence 缺口均为 0、outbox 敏感键命中 0、4 个 append-only triggers 有效、AI 直接写入/执行 Promotion 均被拒绝；最终 `pnpm verify` 650 测试通过 |

> 目标：让 Evidence 门禁在生产生效，并恢复全部应可见数据。**建议一次性连续执行 Step 1–6**（Step 5/6 完成前，公开页面会因门禁生效而暂时「变空」——数据保留不删，属预期中间态）。前置：SSH 密钥可用、15432 隧道已起、本机位于仓库根目录。

**Step 1 — 按序应用三个迁移**（stdin 管道 + `ON_ERROR_STOP=1`，见 §5 规程 4；严格按文件名顺序）：

```bash
for f in 20260820000100_canonical_intelligence_governance \
         20260820000200_evidence_gated_read_models \
         20260820000300_historical_evidence_reconciliation; do
  ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 root@115.190.206.200 \
    "docker exec -i supabase_db_airdrop-intelligence-os psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
    < "supabase/migrations/${f}.sql" || { echo "FAILED at ${f}"; break; }
done
```

**Step 2 — 手工登记三行 `schema_migrations`**（version/name 对照见 §5 规程 2）。

**Step 3 — 建治理登录角色**（平铺语句，勿用 `DO $$` 块；生产环境必须使用现场生成且不打印的强随机密码，禁止使用本地测试密码）：

```sql
create role promotion_service_login with login password '<generated-strong-password>' in role promotion_service;
```

**Step 4 — 建审核人身份**（幂等；记下 UUID 供 Step 6 与 `.env.local` 使用；profile 必须存在，`user_roles.user_id` 外键指向 `public.profiles`）：

```sql
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ops-reviewer@example.invalid',
  '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.profiles (id) values ('a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role, granted_at)
values ('a0000000-0000-4000-8000-000000000001', 'reviewer', now());
```

**Step 5 — 为 12 个 demo 项目补虚构 Evidence**：重放幂等 fixture（固定 UUID，全部 `on conflict do nothing`，生产已有行冲突跳过，仅新增 demo 专用 source/raw_item/evidence/links）：

```bash
ssh -i ~/.ssh/airdrop_intelligence_ecs_ed25519 root@115.190.206.200 \
  "docker exec -i supabase_db_airdrop-intelligence-os psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
  < supabase/fixtures/demo-projects.sql
```

**Step 6 — 跑历史对账**（恢复 Ethereum 真实 signals；经 15432 隧道）：

```bash
AIRDROP_PROMOTION_DATABASE_URL=postgresql://promotion_service_login:<generated-strong-password>@127.0.0.1:15432/postgres \
AIRDROP_PROMOTION_REVIEWER_USER_ID=a0000000-0000-4000-8000-000000000001 \
  npx tsx apps/worker/src/promotion/reconcile-historical-evidence.ts
```

预期：7 个 promoted 候选被处理——Ethereum 6 个（airdrops.io 正文在库，Phase 3 用同一确定性算法过滤过，应全部 link 成功）；novanet 1 个为 Phase 5 合成数据，ground 成功则 link、失败则 park 成 `needs_review`（无害，属 Phase 6B 审核范围）。输出仅含计数与游标；重跑幂等。候选多于一批（>25）时按打印的 next cursor 设 `AIRDROP_EVIDENCE_RECONCILE_AFTER_ID` 续跑。

**Step 7 — 页面验证**：`/opportunities`（12 demo + Ethereum 恢复）、`/projects/ethereum`（6 信号恢复）、`/projects/novanet`（视对账结果）。同时把 `AIRDROP_PROMOTION_DATABASE_URL` / `AIRDROP_PROMOTION_REVIEWER_USER_ID` 补进 `apps/web/.env.local`（治理审核 CLI 用）。

**注意事项**：
- 回滚：迁移 forward-only 不可逆；但它们只新增表/角色、撤销权限、替换视图与策略，**不修改/删除任何现有数据行**，应用本身无数据损失风险。
- worker 若在运行：迁移撤销了 `ai_stage_worker` 直接写 signals 的权限——编排循环（抽取写 candidates、评分读 gated signals）不受影响；旧 `promote-candidate.ts` CLI 本就已 fail-closed。
- 对账后 scoring 输入集合可能变化（Ethereum 信号恢复后 `input_version` 变化触发重算），属设计行为。

### 8.3 下一阶段关键操作二：worktree 清理（确认后执行）

```bash
git worktree remove .worktrees/phase-2-source-collection
git worktree remove .worktrees/phase-6a-canonical-governance
git branch -d codex/phase-2-source-collection
git branch -d codex/phase-6a-canonical-governance
```

⚠️ 删除前自查 phase-6a worktree 内有无未跟踪的个人文件（`git -C .worktrees/phase-6a-canonical-governance status --short`）。

### 8.4 本轮四项优先事项结果与下一开发方向（2026-08-24）

1. **交接基线固化：完成**——先独立提交本轮阅读、目录复核、阶段判断与生产检查点，避免在功能分支合并中丢失当前事实。
2. **Phase 6B 主线集成：完成**——产品代码自动合入；唯一冲突为 `docs/HANDOVER.md`，已人工协调；workbook 的 Task 7/8 commit 残留和重复 Task 7 汇总已修正。
3. **声明运行时正式复验：完成**——Node 22.22.2 / pnpm 11.16.0 下合并后 `pnpm verify` exit 0；contracts 78 / domain 222 / database 159（另 40 skipped）/ worker 212（另 2 skipped）/ web 127，合计 798 个非跳过测试通过，lint / typecheck / build / placeholders 全绿。
4. **生产边界与后续入口确认：完成**——本轮未访问、未写入生产；沿用 §8.5 四项停止条件，第 20 个迁移继续冻结。现在进入详情页 `score_factors` / 经审核 Evidence 引用 + anon 安全读策略的设计阶段。

后续顺序：先完成并审批上述详情页功能设计，再按 TDD 实现；其后才是 tutorials。教程的安全 incidents / 白名单链接前置仍未设计，不能提前绕过。

### 8.5 ⛔ Phase 6B 生产受控检查点（2026-08-22，止于 PRODUCTION_READY — REVIEWER_ACCOUNT_REQUIRED）

只读预检（仅 SELECT/exists/health 探测，无任何写操作）结果：

| 预检项 | 结果 | 结论 |
|--------|------|------|
| 生产迁移台账 | 19 行，最高 `20260820000300` | 6B 第 20 个迁移未应用，正确 |
| `ai_run_review_decisions` 存在性 | 不存在 | 生产 schema 未被 6B 触碰 |
| human reviewer 账号 | `auth.users` 仅 2 行，均为 `@example.invalid` 运营 fixture（`fixture-reviewer` 无激活角色；`ops-reviewer` 为 Phase 6A 治理审核人） | **缺 human reviewer**，禁止以运营 fixture 充当人类登录、禁止猜身份建号 |
| 生产 Auth 可达性 | `/auth/v1/health` **503**（`docker ps` 无 `supabase_auth_airdrop-intelligence-os` 容器）；`/rest/v1/` 200 | 审核 UI 在生产无法登录；须先恢复/启动 Auth 服务 |
| 备份/恢复姿态 | 无 cron 定期 DB 备份；仅有历史手工备份目录（task4/task5/task9-*-backup） | 上生产前须建立并演练预检备份流程 |

**决定**：按 plan Task 9 Step 2 停在此检查点，**不执行**迁移应用、角色/账号创建、数据或配置变更。恢复 rollout（Step 3–5）的前置：① 项目所有者供给或指定 human reviewer（active reviewer-class 角色）；② 生产 Auth 服务恢复且 `/auth/v1/health` 返回 200；③ 建立并演练迁移前备份；④ 显式 rollout 授权。四者齐备后按 §8.2 同款远程规程（preflight → 事务原子应用 → 登记 → 校验 → 不打印凭据）执行，smoke 检查清单见 plan Task 9 Step 4。

> **2026-08-24 集成复核**：本轮只做本地 Git 集成与仓库门禁，没有连接、探测或修改生产环境。2026-08-22 的只读证据可能随外部环境变化，下一次 rollout 前必须重新执行只读 preflight；在新的 preflight 与四项授权条件全部满足前，仍按冻结状态处理。

**附带发现（建议尽快处理，不阻塞 6B 本地状态）**：生产栈缺 Auth 容器属 Phase 6A 上生产后未被使用到的服务面（6A CLI 走数据库角色，不经 Auth HTTP），但任何基于浏览器会话的功能（6B 审核 UI、未来用户认证）都依赖它；建议在下一次生产变更前先排查 `supabase_auth` 容器为何未随栈启动（可能是 compose 配置或崩溃退出），并确认 Kong 路由。

### 8.6 下一功能设计检查点：详情页评分因子与 Evidence 引用（2026-08-24）

**已完成的现状研究**：

- `score_factors` 已保存最新评分的三轴因子（axis / factor_code / contribution / input_value / detail），但 Phase 4 有意未向 `anon` / `authenticated` 开放；详情页目前只读取 `project_current_state` 的总分与 explanation。
- `score_signal_links` 记录“一次评分消费的全部 signals”，`signal_evidence_links` 再把 signal 追到 append-only Evidence；当前 schema **没有 factor → signal / Evidence 的逐因子链接**。因此首版必须把“评分因子”和“本次评分使用的证据集”分成两个区块，不能声称某条 Evidence 单独证明某个聚合因子。
- Evidence 的 `quote_text` 已受 10–500 字、确定性 grounding、Source / Raw Item 身份一致和人工 Promotion 门禁约束，但底表及链接表当前对浏览器全部拒绝；任何公开展示必须新增 forward-only、列级最小化、Evidence-gated 的专用读模型，不能直接放开治理底表。
- 当前 `project_current_state` 不返回 `project_score_id`。为保证总分、因子和证据来自同一不可变评分快照，设计应显式携带 score ID，再按该 ID 读取因子和 score-level Evidence 集合。
- `sources.canonical_url` 与 Raw Item URL 当前都不是匿名安全列；在 verified allowlisted references 功能落地前，不应把采集到的文章 URL直接变成可点击链接。

**推荐的最小方案（待产品边界确认后写正式 spec）**：

1. 新增 forward-only migration：扩展当前读模型携带 `project_score_id`；新增两个 security-invoker / security-barrier 安全投影，分别公开同一 Evidence-complete score 的安全因子列，以及其已发布 signals 对应的最小 Evidence citation 列。
2. 新增精确 RLS / 列授权和 pgTAP 全主体矩阵；`anon` / `authenticated` 只可读 active / rumored 项目当前 Evidence-complete score 关联的数据，不能读取 Raw Item、candidate payload、review note、hash 或治理命令。
3. Repository 严格映射并校验 score ID；页面按机会 / 风险 / 置信度分组显示因子，在独立“本次评分证据”区按 signal 显示引用，明确这是 score-level 证据集而非逐因子因果关系。
4. 引用文本只按纯文本渲染，不解释或执行来源中的任何指令；机会、风险、置信度继续独立，Evidence 数量或质量不得用于降低风险分。

**2026-08-24 产品确认、规范与计划**：项目所有者已确认采用“经 Promotion 审核的 10–500 字原文摘录 + 安全来源元数据 + `verified_at`，首版不提供外链”的推荐方案，并已审核通过 `docs/superpowers/specs/2026-08-24-project-score-evidence-detail-design.md`。详细实施计划已写入 `docs/superpowers/plans/2026-08-24-project-score-evidence-detail.md`，拆为 contracts、数据库读边界、repository、真实匿名集成、Web 展示、全门禁六个 RED → GREEN 任务；下一步是在隔离 worktree 中按所选执行方式实施。

**2026-08-24 执行基线**：已按用户选择启用 subagent-driven execution，在 `.worktrees/project-score-evidence-detail` / `codex/project-score-evidence-detail` 建立隔离环境；Node 22.22.2 / pnpm 11.16.0 基线 `pnpm verify` exit 0（798 non-skipped，42 skipped，lint/typecheck/build/placeholders 全绿）。受限网络无法访问 registry，依赖经明确授权从既有 pnpm v11 用户缓存离线重链接，lockfile 与依赖版本未变化。Task 1 当时尚未开始。

**2026-08-24 Project score Evidence Task 1（contracts）**：已完成严格 public projection contracts：新增 `scoringAxisSchema` / `ScoringAxis`、`PublicProjectScoreFactorRow`、`PublicProjectEvidenceCitationRow` 及严格 snake_case row schemas；复用 source/signal 枚举，拒绝额外或不安全字段，并要求登记为官方的来源具备 relation verification time。domain scoring model 现在重导出 contracts 的 `ScoringAxis`，评分算法未改。TDD RED 为缺失 exports（新 29 项失败、既有 78 项通过）；GREEN：contracts 107/107、domain 222/222，两个 typecheck 均 exit 0。无 application/database 行为、迁移或生产访问变更；详见 `docs/tasks/project-score-evidence-detail-workbook.md`。

**2026-08-24 Project score Evidence Task 2（database boundary，database/typegen GREEN）**：已在 migration 不存在的前提下编写 `supabase/tests/012_project_score_evidence_detail.test.sql`，覆盖所需对象、精确列/options/grants、RLS/列权限、浏览器 mutation/不安全字段拒绝、全角色矩阵，以及 active / rumored / historical / zero-link / unevidenced / paused / 同一 signal 两条 Evidence / unrelated private fixture。只读 SSH preflight 已确认远端 `/root/airdrop-governance-test` 的 project ID 为 `airdrop-intelligence-governance-test`、容器 `supabase_db_airdrop-intelligence-governance-test` 映射 DB host port `64322`、固定 paused marker 精确存在，并确认远端 Task 2 migration 不存在。首次同步因安全审查要求具体授权而在写入前停止；用户随后对精确 host/workdir/payload/操作白名单显式授权，由可信根上下文执行白名单同步/reset。focused RED 在 migration absent 状态下非零退出：11/12 已报告断言按名称命中两个 helper、两个 view、`project_score_id`、函数配置/授权和精确 view columns 缺失。随后三项 SQL SHA 匹配后仅 reset disposable 栈，exit 0。migration 首次即成功编译；两轮 test-only harness 修正（cross-join alias、view denial 消息）未改 migration。最终 `012` SHA-256 `0a66a679b0a7fb649d75dd3ddfa7309adf102b3569a7f63dbbdb0bbd1e3ad61c`，focused 83/83 PASS。full pgTAP 首轮仅 006 新 policy 期望顺序错误；最终 006 SHA-256 `b7bff1945a659eb49979cbe28e2a2e9dbbc8904915dd2b1d4952e76306dd8fdd`，12 files / 1114 tests / PASS。marker-verified DB 64322 上同版本 CLI typegen 两次，remote/local/committed bytes 完全一致，SHA-256 `f4fed028fb876e1ec8d5028ab352311281dae531101dfe13d5c7a0c67cc9b166`、91,425 bytes，新 views/helpers 与 `project_current_state.project_score_id` 均存在。连接值未输出。active/rumored current factors、active-only citations、历史/不完整/zero-link/paused/unrelated 隐藏、两条 Evidence 保留、精确 grants/不安全列/mutation 拒绝均通过。至此仍未访问生产或 54321/54322。

**2026-08-24 Project score Evidence Task 2（final local gate）**：精确浏览器授权为两个 helper 的 `EXECUTE`、`score_factors(project_score_id, axis, factor_code, contribution, input_value, detail)`、`score_signal_links(project_score_id, signal_id)`、`signal_evidence_links(signal_id, evidence_id)`、`evidence(id, source_id, source_field, quote_text, verified_at)`、`project_scores(id)` 的列级 `SELECT`，以及两个新安全 view 的 `SELECT`；无 Raw Item SELECT 或浏览器 mutation。citation 是无链接惰性纯文本，仅为 score-level Evidence，不声称 factor 因果。数据库 package lint/typecheck 均 exit 0，159 测试通过（40 环境门禁 skip）。全仓 `pnpm verify` 首轮在并发负载下触发既有 worker SIGTERM 用例 1 秒时序界限；该未修改用例随即 focused 8/8 PASS，未做无关修复。fresh 全仓复跑 exit 0：lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 159 + worker 212 + web 127 = 827 个 non-skipped 测试通过，42 个既有环境门禁 skip。opportunity/risk/confidence 及评分语义未改；生产、`airdrop-intelligence-os` 和 54321/54322 全部未触碰。

**2026-08-24 Project score Evidence Task 2（independent review）**：独立审查已核对 `28c2fef..e106c8a` 全部差异、设计、任务说明、migration、pgTAP、generated types、workbook/HANDOVER，并重新运行 database lint/typecheck/test（159 passed、40 environment-gated skipped）；结论为 **Compliant / Approved**，Critical、Important、Minor 均为 0。审查确认 helper 的 owner/search_path/revoke、security-invoker/barrier views、active/rumored factors 与 active-only citations、精确列授权、官方来源关系验证、score-level Evidence 非因果边界及无敏感字段暴露。远程 RED/GREEN、64322 reset、双 typegen 和“未访问生产”属于本轮审查未重放的 report-attested 证据，已明确标记 cannot-verify；现进入 Task 3 repository 严格读取实现。

**2026-08-24 Project score Evidence Task 3（repository + review fix）**：`1a5e26e` 新增两个严格 repository 读取 API；`ProjectScore.id` 与总分字段来自同一 `project_current_state` 行，因子/引用查询同时 filter `project_id` 与不可变 `project_score_id`，只选择 7/15 个安全列，每行先经 Task 1 strict Zod schema 再映射，PostgREST 错误不携带 message/details/hint/body，排序规则具备稳定 tie-breaker。首轮独立审查确认生产实现正确，但发现 1 个 Important：测试未锁住“同一次 current-state 查询 + 精确 projection”。原实现代理以 test-only commit `23c30d7` 增加 exact projection 与 exactly-once relation lookup 保护；移除 `project_score_id` 和增加第二次 lookup 的两项临时 mutation 均产生具名 RED，恢复后 focused 28/28、database lint/typecheck 及 fresh `pnpm verify`（842 non-skipped、42 existing skips）全绿。复审结论 **Compliant / Approved**，原 Important Resolved，Critical/Important/Minor 均为 0；生产 repository 相对 `1a5e26e` 无额外改动。现进入 Task 4 真实匿名 PostgREST 集成覆盖。

**2026-08-24 Project score Evidence Task 4（real anon integration + isolation fix）**：`97d5f46` 用随机 test-owned IDs 扩展真实匿名 PostgREST fixture，覆盖同一 `latestScore.id`、active 三轴 factors、active 同一 signal 的两条 distinct Evidence、rumored factors 可见但 citations 隐藏、historical factors/citations 隐藏及安全对象 exact keys。新断言因 Task 2–3 已完成而首次直接 GREEN（full integration 44/44）；按 ledger 临时移除 score-ID filter 后，历史 score 具名断言 RED，恢复后 focused 7/7。首轮独立审查发现 1 个 Important：focused run 遗留的 official+verified `project_sources` 会污染 durable-queue eligibility；另有 1 个 workbook commit Minor。`d039f3e` 在 `afterAll` 事务内先复验固定 disposable marker，再仅按本轮随机 source/project IDs 删除三条**可变** `project_sources`，不删除 Evidence、signal/Evidence links、score links、factors 或 score history。无中间 reset 的 project 7/7 → queue 9/9、连续两轮 full integration 44/44 均通过；fresh `pnpm verify` 842 non-skipped、46 environment-gated skips 全绿，最终 marker-verified disposable reset 后 repository-test score count=0。复审结论 **Compliant / Approved**，原 Important/Minor 均 Resolved，无剩余 Critical/Important/Minor；production repository/migration/generated types 无改动。现进入 Task 5 详情 loader 与安全展示。

**2026-08-24 Project score Evidence Task 5（detail loader + safe rendering）**：`ab73551` 新增纯 `loadProjectDetailFromRepository`，保留 signals timeline；scoreless 时不调用 factor/citation，有 current score 时以同一 `projectId + latestScore.id` 在 `Promise.all` 并行读取。页面新增机会/风险/置信度三组因子与独立的“本次评分快照使用的证据集”；active citation 按 signal 分组并保留多条/冲突 Evidence，非 active 隐藏，官方来源文案只在 relation official 且具 verified timestamp 时显示。引用正文直接作为 `<blockquote>` 的 React text child，动态 `<script>` fixture 只产生 escaped inert text；组件无 anchor/href、URL/Markdown/HTML parser、`dangerouslySetInnerHTML` 或 unsafe field。Web focused 13/13、full 140/140、lint/typecheck/Next build 全绿。独立审查结论 **Compliant / Approved**，Critical/Important 为 0；仅 1 个文档 Minor：workbook Task 5 Commit 单元格应从 subject 改为 `ab73551`，已交由 Task 6 修正。全仓 `pnpm verify` 按计划由 Task 6 执行。

**2026-08-24 Project score Evidence Task 6 Step 1（database sensitivity）**：所有写入/reset/test 前均 fail-closed 复验唯一 disposable `/root/airdrop-governance-test`、project `airdrop-intelligence-governance-test`、DB/Kong containers、64322/64321、fixed paused marker、21 migrations 以及 migration/012/006/seed hashes；16432/16433 现有隧道命令亦精确指向 64322/64321。仅在远端 disposable migration copy 临时向 `anon, authenticated` 授予 Evidence `normalized_quote_sha256` SELECT，mutation SHA-256 `5ea5bf2f7337d5068d1be97e4605090d27913b8a3d51e8a78f6dd2158655899e`。Focused 012 如期 exit 1：具名第 24 项“browser roles have the exact safe base-table column SELECT matrix”与第 58 项“anonymous users cannot read Evidence hashes”失败（81/83 通过）。立即用备份 `cmp` 恢复，本地 `git diff --exit-code` 与本地/远端 SHA 均证明 migration 恢复为 committed `8c0a2e3c4a76ad8b3b155701cc665544470b9b2715deabd91d6731566c42ea60`；再次 marker/hash 复验后 fresh reset，focused 012 为 83/83 PASS。变异未进入本地 diff；未访问生产项目、容器或 54321/54322。

**2026-08-24 Project score Evidence Task 6 Step 2（UI sensitivity）**：仅将现有 citation escaping 测试名强化为具名 no-anchor 边界，再在组件中临时包装 `<a href="https://unsafe.test">`。Focused Web RED 如期 exit 1：“renders reviewed citation content as escaped inert text with no anchor and score-level wording”的 `not.toContain('<a')` 以及组件源码的 unsafe/outbound-field 断言失败（8/10 通过）。组件在同一受控流程的 `finally` 中立即恢复，恢复后与 HEAD 零 diff，SHA-256 `3760b17ac6dff9a53d58d1352a7cdcdcf471fd3be66a5c22789a6b03c33ef9b1`；focused Web 恢复态 10/10 PASS，`git diff --check` exit 0。Unsafe anchor 未进入 diff。

**2026-08-24 Project score Evidence Task 6 Step 3（final disposable database + integration gates）**：在再次完整 marker/topology/hash 复验后，仅 reset `airdrop-intelligence-governance-test`；21 migrations 与 seed 应用成功。Focused 012 为 83/83 PASS，full pgTAP 为 12 files / 1114 tests PASS。再复验 16432 → 64322、16433 → 64321 的精确 SSH 隧道与 disposable marker/artifacts，仅从指定 test containers 在 shell 内派生临时凭据（不打印、不落盘，测试后 unset）；real repository integration 为 7 files / 44 tests PASS。遵守 append-only fixture 规则，未逐行删除 Evidence/links/history；最后仅用一次 guarded fresh reset 清理，并证明 `model_version = 'repository-test'` score count 为 0、`anon` 无 `evidence.normalized_quote_sha256` SELECT、migration SHA 仍为 `8c0a2e3c4a76ad8b3b155701cc665544470b9b2715deabd91d6731566c42ea60`。未访问生产项目、生产容器或 54321/54322。

**2026-08-24 Project score Evidence Task 6 Step 4–5（repository gate + classified scan）**：Node 22.22.2 / pnpm 11.16.0 声明运行时下 fresh `pnpm verify` exit 0；lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 174 + worker 212 + web 140 = 855 non-skipped tests，46 environment-gated skips。`git diff --check` exit 0。指定四文件 unsafe/secret scan 共 5 个命中，逐条分类为：contracts 的 `article_raw_text` 是安全 `source_field` locator enum，不是 Raw Item 正文；migration 两个 `service_role` 命中是既有安全 `project_current_state` view 的 revoke/grant ACL，另两个是新 views 的显式 revoke。组件与 repository 零命中；无 secret value、credential、unsafe URL、Raw Item body、candidate/reviewer/outbox payload 或 browser-visible privileged field。

**2026-08-24 Project score Evidence Task 6（local completion checkpoint）**：Task 1–6 实现、敏感性 RED→GREEN、focused/full pgTAP、真实 integration、root gate、whitespace 与人工分类 scan 已闭环；Task 5 workbook commit 修正为 `ab73551`。功能状态为 **local implementation complete; production unapplied**。Task 6 执行期间未访问生产；这是本次执行事实，不根据未访问行为推断任何其他外部状态。

**2026-08-24 Project score Evidence Task 6（independent-review docs cleanup）**：Task 6 审查结论为实质合规/非阻塞通过，Critical/Important 为 0，留下 3 个 docs Minor。本轮只做最小文档协调：将上方过期的“下一项先设计再 TDD”更正为“本地实现与 Task 6 审查完成，下一步整分支独立审查/主线集成决策，生产仍需实时 preflight 与显式 rollout 授权”；runbook 的 database focused 命令改为精确 Vitest 文件路径；workbook Task 6 Commit 改为 `ba055c9`。Node 22.22.2 / pnpm 11.16.0 下精确 focused 命令 1 file / 14 tests PASS。本轮不改代码、测试或迁移，不扩展 Task 6 范围；后续交由整分支 reviewer 统一复核。

**2026-08-24 Project score Evidence Task 5（preflight / Web baseline）**：已确认指定目录是 linked worktree `.worktrees/project-score-evidence-detail`，分支 `codex/project-score-evidence-detail`，HEAD 精确为基础提交 `d039f3ea3f3e4a9756aa9cd08cc1f17f245134e8`；仅保留 controller 未提交的上一段 Task 4 复审记录，workbook Task 4 Commit 仍为 `97d5f46`。Task 5 brief 与已批准设计一致，无需重新定型。Node 22.22.2 / pnpm 11.16.0 下 Web 基线 7 files / 127 tests passed，exit 0；尚未新增 Task 5 测试或生产实现，未访问数据库、生产或远端。

**2026-08-24 Project score Evidence Task 5（component RED）**：先只新增 `project-score-evidence.test.ts`，覆盖三轴与当前九个 axis/factor 中文标签、贡献/输入值、unknown fallback、factor empty、active citation 分组、多条冲突 Evidence、rumored 隐藏、八类来源中文标签、审慎官方来源文案、score-level 非因果说明、无 outbound/unsafe 字段，以及 `<script>` 引用的 React 纯文本 escaping。指定 focused 命令 exit 1，唯一新 suite 具名失败为无法解析尚不存在的 `../components/project-score-evidence.js`；既有 7 files / 127 tests 仍通过。失败原因精确属于缺失组件，未写生产代码。

**2026-08-24 Project score Evidence Task 5（loader RED）**：随后只新增 `project-detail-loader.test.ts`，以完整真实 `ProjectRepository` 记录实现而非 mock，锁住既有 signal timeline 的 `projectId + limit 20`、同一个 `projectId + latestScore.id` 两类 read 在 deferred 释放前已并行启动、scoreless 返回空 factors/citations 且零 score read，以及 not-found 零后续读取。指定命令 exit 1；新 suite 具名失败为缺失 `../lib/project-detail-loader.js`，同次全量收集的另一失败仍是已记录的缺失组件，既有 7 files / 127 tests 全过。未出现非预期 RED，生产代码仍未开始。

**2026-08-24 Project score Evidence Task 5（focused GREEN）**：最小实现新增纯 `loadProjectDetailFromRepository` 与两个展示组件；server-only `loadProjectDetail` 只创建 anon repository 后委托。loader 保留既有 `listProjectSignals(projectId, 20)`，scoreless 不读 factor/citation；有 score 时两类 read 以同一个 `project.projectId + latestScore.id` 在 `Promise.all` 并行。页面顺序为确定性解释 → 三轴因子 → 独立 score-level Evidence → 原 signal timeline；citation 直接作为 React `<blockquote>` text child，无 anchor/URL/HTML/Markdown 解析。首次 GREEN 的两个局部失败分别是 `<article>` 字面前缀触发明确的 `not '<a'` 断言，以及测试引用正文重复 signal 标题造成计数误报；改为语义等价 `<section>` 并修正 fixture 文本后，focused 2 files / 13 tests 与 brief package command 9 files / 140 tests 全绿，exit 0。

**2026-08-24 Project score Evidence Task 5（Web gates / ready to commit）**：Node 22.22.2 / pnpm 11.16.0 下 fresh Web test 9 files / 140 tests、lint、typecheck、Next 16.3.0 production build 全部 exit 0；动态 `/projects/[slug]` 编译成功。组件静态检查确认无 `href`、canonical/Raw、reviewer/outbox/hash、HTML 注入、Markdown 或 URL parsing；八类来源与当前九个 axis/factor 均有中文 label，unknown code 安全 fallback，active citations 按 signal 分组保留多条/冲突 Evidence，rumored 仅显示隐藏说明，官方文案仅为“项目登记为官方来源”。Task 5 只改 Web 与文档，未新增依赖、未改 DB/RLS/repository/评分，未访问生产或远端。按批准任务拆分，full `pnpm verify` 未在 Task 5 运行且不宣称通过，由 Task 6 fresh 全门禁负责。

**2026-08-24 Project score Evidence Task 3（preflight / baseline）**：已确认隔离 worktree `.worktrees/project-score-evidence-detail` / 分支 `codex/project-score-evidence-detail` 的 HEAD 精确为 Task 2 基础提交 `e106c8afed5d878693b429b45a424ea078932bdd`，并保留 controller 未提交的上一段 Task 2 独立审查记录。Task 3 brief、设计与当前 generated view types 一致。按指定 Node 22.22.2 / pnpm 11.16.0 环境运行既有 repository 基线，database 9 files / 159 tests passed，7 integration files / 40 tests 由既有环境门禁 skip，exit 0；尚未写 Task 3 生产代码、未访问数据库或生产环境。

**2026-08-24 Project score Evidence Task 3（RED 1）**：先只新增 repository 行为测试与 project score ID 期望，再运行指定 database test 命令，exit 1。具名失败一为新 suite 无法解析缺失 helper module `../repositories/project-score-evidence.js`；具名失败二为既有 `getProjectBySlug` 返回的 `latestScore` 缺少预期 immutable score ID `20000000-0000-4000-8000-000000000002`。其余 158 个既有测试通过，40 个集成测试保持环境门禁 skip。RED 覆盖双 ID filter、精确安全投影、strict row parsing、映射、空数组、确定排序、输入 UUID 和无响应详情泄露的错误包装；此时仍无 Task 3 生产实现。

**2026-08-24 Project score Evidence Task 3（RED 2）**：在 RED 1 后只加入由测试驱动的 focused helper 实现、尚未接入 `ProjectRepository`，同一命令再次 exit 1。新 suite 14/14 均按名称失败于缺失 repository API：`listCurrentScoreFactors is not a function` 或 `listCurrentScoreEvidenceCitations is not a function`；project lookup 继续因 `latestScore.id` 缺失失败。其余 158 个测试通过、40 个集成测试按既有环境门禁 skip。该迭代保留了 helper 与 repository 两层缺失行为的独立 RED 证据。

**2026-08-24 Project score Evidence Task 3（focused GREEN）**：`ProjectRepository` 已加入 `listCurrentScoreFactors(projectId, projectScoreId)` 与 `listCurrentScoreEvidenceCitations(projectId, projectScoreId)`，均委托 focused helper；`ProjectScore` 加入 `id`，并从同一 `project_current_state.project_score_id` 行读取。两种查询都同时 filter `project_id` 与不可变 `project_score_id`；每一 DB row 先经 Task 1 strict Zod schema 再映射，额外 `url` / `raw_text` 测试行均拒绝。factor 按 opportunity→risk→confidence、contribution 降序、factor code 升序；citation 按 signal publication 降序/null last、signal ID、Evidence verification 降序、Evidence ID。PostgREST 包装仅保留 code 与固定安全消息，不带 response message/details/hint。focused 命令 exit 0：10 files / 173 tests passed，40 integration tests 由既有环境门禁 skip。

**2026-08-24 Project score Evidence Task 3（package static gates）**：按指定 runtime 并行执行 database lint 与 typecheck，两个命令均 exit 0；未新增依赖。下一步仅做源码安全投影/diff 静态复核和最终 fresh 验证，不运行 migration、RLS 或真实数据库命令。

**2026-08-24 Project score Evidence Task 3（safe projection review）**：对生产 helper 执行 URL、raw body/item、candidate、review、hash、provider、audit、outbox、credential/password/secret 禁用词扫描，零命中（`rg` exit 1 为预期）；人工复核 exact selection 为 factor 7 列与 citation 15 列，无其他字段。两条查询源码均按顺序 `.eq('project_id', projectId)`、`.eq('project_score_id', projectScoreId)`，且 row schema parse 位于 mapping 之前；`git diff --check` exit 0。未修改 score math、RLS、migration、generated types 或任何生产/远端环境。

**2026-08-24 Project score Evidence Task 3（complete local gate）**：fresh `pnpm verify` exit 0；lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 173 + worker 212 + web 127 = 841 个 non-skipped 测试通过，42 个既有环境门禁 skip。Task 3 未新增依赖，未运行 migration/RLS/真实 DB 测试，未访问或修改生产/远端环境；controller 的 Task 2 independent-review 记录已原样纳入，workbook Task 2 Commit 已从 subject 修正为精确短 hash `e106c8a`。完整执行报告见 gitignored SDD ledger `task-3-report.md`；下一任务从 Task 4 真实匿名集成覆盖继续。

**2026-08-24 Project score Evidence Task 3（final-gate timing investigation）**：在最终文档写入后第二次执行 `pnpm verify`，contracts/domain/database 均绿，随后未修改的 worker repeated-SIGTERM 用例再次超过既有 1 秒 `stopping` 时序界限，full run exit 1。`git diff --name-only` 证明无 worker 文件；按 systematic debugging 立即精确重放 `apps/worker/src/tests/health.test.ts`，1 file / 8 tests 全绿、exit 0，符合 Task 2 已记录的并发负载敏感行为。未对无关 worker 源码/测试做任何修复；提交前必须 fresh 重跑完整门禁并以其结果为最终依据。

**2026-08-24 Project score Evidence Task 3（final fresh rerun）**：在 focused worker 8/8 后且保持 worker 零改动，fresh `pnpm verify` exit 0：lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 173 + worker 212 + web 127 = 841 个 non-skipped 测试通过，42 个既有环境门禁 skip。此轮为 Task 3 提交采用的最终全仓证据；仅剩文档占位/diff/提交范围检查，不再修改产品代码。

**2026-08-24 Project score Evidence Task 3（independent-review fix loop opened）**：独立审查 `1a5e26e` 发现 1 个 Important 测试敏感性缺口，生产实现本身确认正确：原 `createProjectLookupClient` 未记录 relation calls / exact selection，因此移除 `project_score_id` 投影或增加第二次 latest lookup 时测试可能仍通过。最小 test-only 修复已加入具名 current-state snapshot-query 用例，literal projection 同时包含 `project_score_id` 与全部已展示 score fields；fake 记录 relation/selections，并对非 `project_current_state` 或任何第二次 relation lookup 立即失败。workbook Task 3 Commit 已同步为 `1a5e26e`。下一步用 disposable mutation 分别证明 projection 与单次 lookup 断言会 RED，完整恢复后再运行 GREEN；不改生产实现、不做独立自审。

**2026-08-24 Project score Evidence Task 3（review-fix projection sensitivity RED）**：临时仅从生产 current-state selection 移除 `project_score_id`，精确运行 `project-repository.test.ts`；具名 “reads the immutable score identity and displayed score fields in one exact current-state query” 断言按预期失败，diff 明确为 expected `project_id,project_score_id,...`、received `project_id,...`，1 failed / 13 passed，exit 1。disposable mutation 随即用 apply_patch 完整恢复，不进入 fix diff；下一项验证任何第二次 relation lookup 均会具名失败。

**2026-08-24 Project score Evidence Task 3（review-fix single-query sensitivity RED）**：临时在 current-state response 后增加第二次 `client.from('project_current_state')`，并用 Vitest `-t` 只运行具名 invariant test；fake 按预期抛出 `Project lookup must query project_current_state exactly once.`，1 failed / 13 skipped，exit 1。disposable mutation 随即完整恢复，不进入 fix diff。至此 exact projection 与恰好一次 lookup 两个审查缺口均有独立 RED 证据；下一步验证生产文件相对 HEAD 零差异并运行 focused GREEN/package gates。

**2026-08-24 Project score Evidence Task 3（review-fix focused GREEN）**：先对 `project-repository.ts` 与 `project-score-evidence.ts` 执行相对 HEAD 的零差异检查，exit 0，确认两项 disposable mutation 均完整恢复且生产实现未改。随后精确运行 `project-repository.test.ts` + `project-score-evidence.test.ts`，2 files / 28 tests 全绿、exit 0；当前仅测试 fake/断言和文档有改动。

**2026-08-24 Project score Evidence Task 3（review-fix package gates）**：database lint 与 typecheck 均在指定 Node 22.22.2 / pnpm 11.16.0 环境下 exit 0。未新增依赖、生产代码、migration/RLS 或真实数据库访问；按仓库完成规则继续运行 fresh `pnpm verify` 后提交最小 test/docs fix。

**2026-08-24 Project score Evidence Task 3（review-fix complete local gate）**：fresh `pnpm verify` 一次通过、exit 0：lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 174 + worker 212 + web 127 = 842 个 non-skipped 测试通过，42 个既有环境门禁 skip。review fix 只修改 `project-repository.test.ts` 与交接文档；生产 repository 相对 `1a5e26e` 零差异，无依赖、评分、migration/RLS、真实 DB、生产或远端变更。Important 已由 exact projection 与 single-query 两项独立 sensitivity RED、focused GREEN 和 full gate 闭环。

**2026-08-24 Final pagination fix（count sensitivity RED）**：在 focused/package GREEN 后，临时且仅移除后续页 `response.count !== expectedCount` 检查，精确运行具名用例 `fails safely on 'a changed count on a later page'`；如期 exit 1，1 failed / 19 skipped，Promise 错误地 resolve，证明测试能捕获计数一致性保护被删除。立即用 `apply_patch` 完整恢复检查，mutation 未提交；下一步恢复态 focused GREEN、disposable integration 与 root gates。

**2026-08-24 Final pagination fix（restoration GREEN）**：恢复计数一致性检查后，在指定 Node 22.22.2 / pnpm 11.16.0 环境并行重跑 exact citation unit、database lint 与 typecheck，均 exit 0；unit 为 1 file / 20 tests PASS。已确认 sensitivity mutation 完整恢复；下一步只对既有 marker-verified disposable 运行真实 integration。

**2026-08-24 Final pagination fix（disposable integration）**：先验证 `/tmp/airdrop-6b-test.env` 权限精确 0600、四变量齐全且 URL 仅为 loopback PostgreSQL 16432 / HTTP 16433（值未打印），现有两条隧道均在监听；首轮 sandbox 内命令在首个 DB 连接即 `EPERM`，44 tests 全 skipped，未发生 fixture 写入。随后以完全相同命令获准访问该 loopback；各 suite 的 fail-closed fixed paused marker 检查在写入前通过，真实 repository integration 为 7 files / 44 tests PASS，exit 0，106.29s。生产与禁止端口 54321/54322 未访问。

**2026-08-24 Final pagination fix（root gate）**：fresh Node 22.22.2 / pnpm 11.16.0 `pnpm verify` 一次通过、exit 0；lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 180 + worker 212 + web 140 = 861 non-skipped tests，46 environment-gated skips。下一步仅执行 whitespace、safe-selection/unsafe-field 与提交范围检查。

**2026-08-24 Final pagination fix（static gate）**：`git diff --check` exit 0；tracked diff 精确为 citation helper/test 与 workbook/HANDOVER 四文件。生产 helper 的 URL/raw item/candidate/review/hash/provider/audit/outbox/credential/password/secret 扫描零命中；exact 15-column safe projection 未变，每页仍依次请求 exact count、双 immutable ID filters、四个稳定 order 与 ≤1000 range。Task 3 workbook Commit 保持精确 `1a5e26e`。最终报告与 ignored progress ledger 已同步；提交前只剩最终 placeholder/diff 复验。

**2026-08-24 Final pagination fix（ready to commit）**：最终 `pnpm check:placeholders`、`git diff --check` 均 exit 0，tracked scope 仍精确四文件；完整 ignored 报告为 `final-pagination-fix-report.md`。Important 已由真实 1000-row cap RED、最小分页实现、count mutation RED、20/20 focused、44/44 disposable integration、861-test root gate 与静态门禁闭环；无已知 concern。准备提交 `fix(database): paginate score evidence citations`。

**2026-08-24 Project score Evidence Task 4（preflight / baseline）**：Task 4 在同一隔离 worktree、HEAD `23c30d7ea3f1645bef5844fe1729b9b8f42941e5` 开始；controller 未提交的 Task 3 复审记录已保留。Task 3 workbook Commit 已经是精确 `1a5e26e`，不存在残留 `Pending`。指定 Node 22.22.2 / pnpm 11.16.0 database baseline 通过 174 tests、40 environment-gated skips，exit 0。只读 SSH preflight 仅检查 `/root/airdrop-governance-test`：project ID、DB/Kong 容器、DB 64322 / API 64321 和固定 paused marker 全部精确匹配；既有 `16432 -> 64322` 命令已核对，并启动精确 `16433 -> 64321` 隧道。0600 disposable env 的 URL 只校验为 loopback 16432/16433，不打印值；经 16432 再查固定 marker 通过。生产 `airdrop-intelligence-os` 与禁止端口 54321/54322 未访问。任何 fixture 写入仍须在 integration `beforeAll` 内重复 URL + marker fail-closed 校验。

**2026-08-24 Project score Evidence Task 4（fixture + first real run）**：仅修改 `project-repository.integration.test.ts`：现有 repository fixture 全部改为 `randomUUID()` test-owned IDs，并在任何 INSERT 前要求 integration DB/API URL 精确为 loopback `16432/16433`、四个 env 同时存在且固定 paused marker 精确匹配；加入 active current/historical score、active 三轴 factors、rumored factor、active 同一 signal 两条 distinct grounded Evidence、score/link history，以及 immutable latest score ID、rumored/historical denial、exact safe object keys 和 URL/raw/hash/reviewer/governance key 缺席断言。Tasks 2–3 已实现真实 contract，因此首轮 full `test:integration` 合法地直接 GREEN：7 files / 44 tests，exit 0，105.36s；未伪造 absent RED。按 ledger 下一步临时移除 production factor query 的 score-ID filter，使具名 historical integration assertion RED，然后完整恢复。

**2026-08-24 Project score Evidence Task 4（score-ID filter sensitivity RED）**：先确认 production `project-score-evidence.ts` 相对 HEAD 零 diff，再临时只移除 factor query 的 `.eq('project_score_id', projectScoreId)`，精确运行具名 historical snapshot integration assertion。用例按要求 exit 1：expected `[]`，实际误读当前 opportunity/risk/confidence 三条 factors；1 failed / 6 skipped。mutation 已立即 `apply_patch` 完整恢复，production helper 再次相对 HEAD 零 diff，绝不提交；下一步重跑 focused integration GREEN。

**2026-08-24 Project score Evidence Task 4（restored focused GREEN）**：mutation 恢复后，完整 `project-repository.integration.test.ts` 通过 1 file / 7 tests、exit 0、4.83s；brief 指定的 `pnpm --filter @airdrop/database test -- project-score-evidence.test.ts` 通过 174 tests、44 integration skips、exit 0。database lint/typecheck 均 exit 0。当前 production repository/migration/generated types/dependencies 均零改动；下一步 fresh full `test:integration`，随后只用 marker-verified disposable fresh reset 清除 append-only test history。

**2026-08-24 Project score Evidence Task 4（full integration state investigation）**：在 cleanup 前运行 full integration，38/44 通过、6 失败。系统化定位为两项 test-state 原因而非 production defect：① `randomUUID()` 后原同分 90 fixture 仍硬编码 active A/B 顺序，实际 repository 正确按 `project_id asc`；最小 test fix 改为按该公开 tie-breaker 独立排序，focused project integration 随后 7/7、exit 0、7.05s。② 前面多次 focused project run 按 append-only 规则保留 active official relations，queue reconcile 合法发现 7 个 eligible rows，而既有 queue cleanup 只清理自己的固定 project，故 5 项 queue 断言受污染。未改 queue/production；按 brief 现在先 marker-verified fresh reset，再重跑 full integration。

**2026-08-24 Project score Evidence Task 4（fresh-reset full GREEN + final cleanup）**：full gate 前以单条 fail-closed SSH 命令重新验证绝对 workdir、project `airdrop-intelligence-governance-test`、DB/Kong 容器名、64322/64321、固定 paused marker、21 migrations、seed SHA `f1ceaddc...7e55` 与 Task 2 migration SHA `8c0a2e3...ea60`，仅 reset disposable，21 migrations + seed 重建 exit 0，marker 复核通过。随后 fresh full `test:integration` 7 files / 44 tests 全绿、exit 0、104.45s。为不逐条 delete append-only Evidence/link history，GREEN 后再次执行同等 fail-closed final reset，exit 0；marker 精确且 `model_version = 'repository-test'` score count 为 0。生产项目/容器、54321/54322、生产数据与凭据始终未访问或传输。

**2026-08-24 Project score Evidence Task 4（complete local gate）**：最终源码/测试/文档树上 fresh `pnpm verify` exit 0；lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 174 + worker 212 + web 127 = 842 non-skipped tests，46 个 environment-gated skips。Task 4 最终 tracked diff 仅 `project-repository.integration.test.ts`、workbook 与 HANDOVER；production repository/migration/generated types/dependencies 均零改动，sensitivity mutation 不在 diff。完整执行报告见 gitignored SDD ledger `task-4-report.md`；实现代理未自审，交由 controller 做独立复审。

**2026-08-24 Project score Evidence Task 4（independent-review fix diagnosis）**：独立审查对 `97d5f46` 报告 1 Important + 1 Minor。代码复核确认 Important 成立：Task 4 teardown 只关闭连接，两个随机 active `project_sources` 在 focused 结束后仍同时满足 active project + active source + official + verified，durable queue 的全局 reconcile 因而读取跨测试残留；此前未清理状态下 full integration 38/44、其中 5 个 durable-queue 断言因 7 eligible rows 失败，是该隔离缺陷的具名 RED。最小 fix 只在 `afterAll` 内复验 disposable marker 后按 Task 4 随机 source/project IDs 精确删除三条可变 `project_sources`；append-only Evidence、signal/evidence links、score history 均不得逐行删除。workbook Task 4 Commit 已由 subject 更正为精确 `97d5f46`。

**2026-08-24 Project score Evidence Task 4（review-fix ordered GREEN）**：在未执行任何中间 reset 的同一 disposable 状态上，先运行完整 focused `project-repository.integration.test.ts`，1 file / 7 tests、exit 0；紧接着运行 `durable-queue-repository.integration.test.ts`，1 file / 9 tests、exit 0。teardown 的固定 marker 复验和精确 Task 4 relation DELETE 均成功，原先 7 eligible rows 导致的 queue 污染未复现；下一步继续不 reset 地连续运行 full integration 两次，验证重复与文件顺序独立。

**2026-08-24 Project score Evidence Task 4（review-fix full timing investigation）**：仍未 reset 地在上述 focused→queue 后运行首轮 full integration，project/queue 等 6 个文件通过，整体 43/44；唯一失败是未修改的 promotion 具名用例 `denies direct canonical and governance DML after SET ROLE but approves through the protected command` 超过其 5 秒 test timeout。立即仅重放该具名 promotion 用例，1 passed / 11 skipped、exit 0（总测试阶段 12.76s，含 hooks），未改任何无关代码。该证据不指向 Task 4 relation cleanup；继续在同一未 reset 状态上 fresh 重跑 full integration，要求完整 GREEN。

**2026-08-24 Project score Evidence Task 4（review-fix repeated full GREEN）**：同一数据库状态全程无 reset；promotion focused 复现通过后，fresh full integration 7 files / 44 tests、exit 0、105.43s，随后立即连续第二轮 full integration 再次 7 files / 44 tests、exit 0、106.62s。由此同时证明 focused project→durable queue 顺序和 full suite 重复运行均不再依赖外部 reset；Task 4 append-only history 保留，但其唯一会影响 collection eligibility 的三条随机可变 relation 每轮均被精确 teardown。下一步运行 unit/lint/typecheck 和生产零 diff 门禁。

**2026-08-24 Project score Evidence Task 4（review-fix package gates + final cleanup）**：指定 runtime 下 database unit 174 passed / 44 environment-gated skipped，lint 与 typecheck 均 exit 0。随后单个 fail-closed SSH 脚本在 reset 前精确验证 `/root/airdrop-governance-test`、project ID、DB/Kong 容器、64322/64321、固定 paused marker、21 migration files、seed SHA `f1ceaddc...7e55` 与 Task 2 migration SHA `8c0a2e3...ea60`；仅 disposable reset exit 0，reset 后 marker 精确且 `repository-test` score count 0。未逐行删除 append-only history，生产项目与 54321/54322 未访问；下一步仅更新报告、运行 fresh 全仓门禁和生产零 diff 后提交最小 fix。

**2026-08-24 Project score Evidence Task 4（review-fix complete local gate）**：fresh `pnpm verify` exit 0；lint/typecheck/build/placeholders 全绿，contracts 107 + domain 222 + database 174 + worker 212 + web 127 = 842 non-skipped tests，46 skips。tracked fix scope 精确为 `project-repository.integration.test.ts`、workbook 与 HANDOVER；production repository、migration、generated types 零 diff。Important 已由 marker-guarded test-owned relation teardown、focused→queue GREEN 和无 reset 连续两轮 full 44/44 闭环，Minor workbook Commit 已更正为 `97d5f46`；现在提交独立最小 fix。

**2026-08-24 Project score Evidence final whole-branch review（citation pagination fix opened）**：在 clean worktree / exact HEAD `e95e79495e724f2f771025bc1101a2c70caf7c25` 复核最终审查的 1 个 Important，结论成立：`supabase/config.toml` Data API `max_rows = 1000`，而 citation repository 只有一次无 count/range/order 的 select；score/signal/Evidence links 无 1000 上限，因此服务可成功却静默隐藏第 1001 条以后或冲突 Evidence。最小修复范围仅为 `project-score-evidence.ts`、对应 unit fake/tests、workbook/HANDOVER 与 gitignored final report；factor 读取受九个 factor codes 边界约束，不做 speculative pagination。Task 4 的 marker-guarded disposable-only integration 入口已存在；生产与 54321/54322 禁止访问。

**2026-08-24 Project score Evidence final pagination fix（unit RED）**：unit fake 已真实模拟 Data API 每请求最多 1000 rows，并新增 1001-row 完整性/最后冲突 citation、每页 exact safe projection + 双 ID filters + required orders/ranges/count，以及 count null、后页 count 变化、短页、重复替代缺失、第二页 PostgREST error 脱敏用例。精确运行 `project-score-evidence.test.ts`，6 个新用例全部 RED、14 个既有用例通过，exit 1；主回归实际只返回 1000 而非 1001，后续完整性/error 场景均被当前单请求实现错误接受。失败精确证明 reviewer 的 silent truncation path，未伪造 RED。

**2026-08-24 Project score Evidence final pagination fix（focused GREEN）**：citation repository 现在以 1000 rows/page 明确分页；每页均 select 原 exact 15-column safe projection + `{ count: 'exact' }`、同时 filter `project_id`/immutable `project_score_id`，并依 required final ordering 显式 order `signal_published_at desc null-last → signal_id asc → evidence_verified_at desc → evidence_id asc` 后 range。每页所有 row 先 strict Zod parse，使用 `signal_id:evidence_id` 唯一键拒绝重复；count null/非法、后页 count 变化、page length 与 expected boundary 不符、duplicate、最终 collected count 不精确或 PostgREST error 均用现有 `ProjectEvidenceCitationQueryError` + 固定安全消息 fail closed。最终仍保留 client deterministic sort。精确 unit 1 file / 20 tests 全绿、exit 0；factor query 未改。

**2026-08-24 Project score Evidence final pagination fix（first package-gate iteration）**：database lint exit 0；typecheck exit 2，唯一错误位于测试 helper 的显式返回注解：`typeof citationRow[]` 把动态 Evidence ID 错误收窄成 base fixture 的单一 literal ID。生产 helper 无类型错误。最小测试修正为复用 Task 1 既有 `PublicProjectEvidenceCitationRow[]`，不改变行为或生产代码；修正后必须重跑 focused/lint/typecheck。

**2026-08-24 Project score Evidence final pagination fix（corrected package GREEN）**：测试 fixture factory 改为既有共享 `PublicProjectEvidenceCitationRow[]` 后，精确 unit 1 file / 20 tests、database lint、database typecheck 均 exit 0。当前无类型/风格问题；下一步做 disposable count-consistency mutation RED，range/order/count request 已由 1001-row 用例逐页 literal recorder assertions 保护。

**2026-08-24 Project score Evidence final whole-branch review（Ready to merge）**：最终 reviewer 以 base `63f5278` 和精确 reviewed HEAD `2e80dbf565feba939252c4fed590b9dd9528b6f9` 复核整分支；原 citation pagination Important 已 Resolved，Critical / Important / Minor 全部为 None。Reviewer 独立重跑 focused 20/20，并在 Node 22.22.2 / pnpm 11.16.0 下重跑 `pnpm verify`：861 non-skipped 通过、46 environment-gated skipped，结论 **Ready to merge: Yes**。本次复审对 DB/remote/production 运行声明仍标记 cannot-verify，不将报告证据推导为当前外部事实。下一步由用户决定如何集成该分支；功能仍为 **production unapplied**，任何 rollout 前必须重做实时 preflight，确认备份、Auth 服务与 human reviewer readiness，并获得显式 rollout 授权。

**2026-08-24 Project score Evidence local integration（DONE）**：用户选择 finishing workflow 的 option 1。主工作区确认基线分支 `codex/phase-0-1-foundation` 精确位于 `63f5278`，仅有三个既有未跟踪 `.DS_Store`，随后将 `codex/project-score-evidence-detail` 快进合并到 `a372880`；这些个人文件未触碰。合并后首次 `pnpm verify` 因主工作区 `node_modules` 重建并尝试访问 registry，命中 DNS `ENOTFOUND`，未进入代码测试；用本机既有 pnpm v11 store 执行 `--offline --frozen-lockfile` 恢复 196 个锁定包后，fresh 完整门禁 exit 0：contracts 107 + domain 222 + database 180 + worker 212 + web 140 = 861 non-skipped，46 gated skips，lint/typecheck/build/placeholders 全绿。该步骤只做本地 Git 集成与本地门禁，未访问生产、未应用第 21 个 migration；下一步是保留生产冻结边界并选择后续产品功能，而不是自动 rollout。

**2026-08-24 Project score Evidence branch cleanup（DONE）**：在主线交接提交 `0293cd3` 后再次运行完整 `pnpm verify`，861 non-skipped / 46 gated skips 全绿。随后确认功能 worktree 无 tracked/untracked 改动、`a372880` 已是主线祖先，再移除 `.worktrees/project-score-evidence-detail`、执行 `git worktree prune` 并删除已合并分支 `codex/project-score-evidence-detail`。其他 Phase 2 / 6A / 6B worktree 与主工作区三个既有 `.DS_Store` 均未触碰；功能全部保留在主线，生产仍未应用。

**2026-08-26 Phase 7A Task 2（pure security rules）**：在隔离 worktree `codex/phase-7a-security-ledger` 上，先新增 3 个 security domain 测试文件；指定 Node `v22.22.2` / pnpm `11.16.0` 下 `CI=true pnpm --filter @airdrop/domain test -- security` 如预期 exit 1，72 个新增断言均因 root export 不存在而真实失败，既有 222 个断言通过。最小实现只新增依赖-free posture precedence/lock ordering、candidate/incident/disclosure transition matrix 与 indicator Unicode normalization/lexical/exact normalized Evidence occurrence 规则，并从 `@airdrop/domain` 根入口导出。修复一处 trailing high-surrogate `NaN` 边界后，focused 与完整 domain 均为 12 files / 295 tests，domain lint/typecheck exit 0，contracts 为 12 files / 131 tests exit 0。未运行 database reset/integration，未访问网络或生产，未添加 dependency/migration；下一步为 Task 3 ledger migration、protected commands、RLS 与 pgTAP。

**2026-08-26 Phase 7A Task 2 Fix Round 1（test coverage）**：只处理 review 的三项 Important 覆盖缺口，生产文件最终零 diff。`review-rules.test.ts` 以 literal expectations 覆盖 candidate 全部 28 decision×reason、disclosure 全部 6 decision×reason（包含 `publish + disclosure_no_longer_needed`），并补强 incident action-specific reason matrix、no-op/independent resolve；其后复审确认该轮未穷尽 action×current-state，已由 Fix Round 2 更正。`indicator.test.ts` 覆盖 general non-domain 1/500 accept 与 0/501 reject；`posture.test.ts` 覆盖 project/source 同 UUID 仍为两个 lock identity、仅 exact identity dedupe。临时将 acceptance allowlist 清空、general bound 改 499、lock map key 改 id-only 后，covering test 精确 3 failed / 356 passed（具名 accepted evidence、500 boundary、same-ID cross-target identity）；三行 production mutation 已立即恢复。声明运行时下 covering/full domain 为 12 files / 360 tests，domain lint/typecheck、contracts 12 files / 131 tests 和 full `pnpm verify` 均 exit 0。未运行 database reset/integration，未访问网络/生产、未增依赖或迁移；下一步仍为 Task 3。

**2026-08-26 Phase 7A Task 2 Fix Round 2（lifecycle state matrix）**：复审唯一剩余 Important 成立：Round 1 的 reason coverage 只以 `open/null`、`reopen/resolved`、`attach/active` 为主，未重新断言 `open` 在 active/resolved 必须拒绝。只加 test-only 5×3 action×current-state literal table；每个 action 使用独立有效 reason/payload，因此 state gate 是唯一变量。仅 `open/none`、`adjust/active`、`attach_indicator/active`、`resolve/active`、`reopen/resolved` 为 true。临时把 production `open` gate 放宽到 active，focused command exit 1，精确 1 failed / 374 passed，具名 `permits open from active: false` received true；立即恢复为 `current === null`。最终 covering/full domain 为 12 files / 375 tests，domain lint/typecheck、contracts 12 files / 131 tests 和 full `pnpm verify` 均 exit 0；最终 production file 相对 Task 2 commit 零 diff，deferred Minor helper typing 未触碰。无 DB reset/integration、网络或生产访问、迁移或依赖改动；下一步仍为 Task 3。

**2026-08-26 Phase 7A Task 3（BLOCKED / NEEDS_CONTEXT）**：在指定 linked worktree、BASE `3b7ec7e9a3670adcabc32842649c6e73cfac0add` 的干净状态下，先用 `apply_patch` 新建本地 `supabase/tests/013_phase_7a_security_incidents_indicators.test.sql`，覆盖九张 ledger 表、核心 helpers/RPCs/views、exact columns、forced RLS、append-only triggers、security-definer settings、grant matrix 与 security outbox allowlist 的 RED assertions。声明 runtime 为 Node `v22.22.2` / pnpm `11.16.0`。只读 preflight 确认本机 `16432 → 64322`、`16433 → 64321`，远端仅为 `/root/airdrop-governance-test` / `airdrop-intelligence-governance-test`、对应 disposable DB/Kong containers、固定 paused seed marker、21 个既有 migration 和 seed SHA；未访问 production 或 `54321`/`54322`。随后唯一将这个本地测试文件复制到已验证 disposable workdir 的 `scp` approval 被 managed policy 拒绝，原因是 source-code export；没有进行远端写入、`supabase test db`、reset、typegen 或 migration。严格 TDD 因而停止在 RED 之前。继续前需要显式允许报告中的精确单文件 copy command，或提供具同等 identity/marker/hash 证明且本地可访问的 disposable topology；不得以其他传输方式绕过该拒绝。完整证据见 gitignored SDD ledger `task-3-report.md`。

**2026-08-26 Phase 7A Task 3（resumed / local implementation pending controlled GREEN）**：用户显式授权原始 013 pgTAP 单文件 copy 后，controller 已完成 copy，本地/远端 SHA-256 均为 `fd157891c3d0718d5c93834f507dcc305c84b2e068deb863cd0df36b01a6f211`。随即再次完成 fail-closed disposable identity proof：loopback `16432 → remote 64322`、`16433 → remote 64321`，远端 `/root/airdrop-governance-test` / `airdrop-intelligence-governance-test`、指定 DB/Kong containers、paused marker UUID `90000000-0000-4000-8000-000000000019`（`disposable-integration-database-marker` / `paused`）、21 migration manifest `bdec8a14…926ad` 与 seed SHA `f1ceaddc…7e55` 全部匹配。仅后才执行 focused pgTAP：exit 1，1 file / 161 tests / 161 intended missing-object failures，故为有效 RED。随后只在本地以 `apply_patch` 新建 forward-only `20260826000100_phase_7a_security_incidents_indicators.sql`（nine tables/RLS/append-only ledger, active-bearer reviewer commands, deterministic Evidence→Raw Item→Source grounding, AI candidate-only ingress, receipt/audit/outbox, posture/locks, safe public views, ordinary Promotion/source-Evidence/collection gates）并扩展 013 behavior/atomicity assertions；`git diff --check` 与 SQL delimiter static checks 已通过。当前 migration SHA `b6111923…57d42`、test SHA `933f47fd…a9bf` 的远端 source copy 尚未获新的精确授权，故未 remote copy、reset、GREEN、full pgTAP、types 或 commit；生产和端口 `54321`/`54322` 仍未访问。

**2026-08-27 Phase 7A Task 3（continuation checkpoint / authorization gate）**：从 Git、SDD ledger 与本地文件恢复状态，HEAD 仍为 `3b7ec7e9a3670adcabc32842649c6e73cfac0add`；当前未提交范围只有 HANDOVER、workbook、forward migration 与 013 pgTAP。复核 migration 为 3518 行、SHA-256 `b6111923e268a3c24f2cd30054a8b24edff95d284acbb6e198e2379b5a057d42`，013 pgTAP 为 770 行、SHA-256 `933f47fdd1e1ddea70251d16d05f80c588cc4860962f68c33a054021ba8aa9bf`，`git diff --check` exit 0。该检查未连接任何数据库、未写远端、未 reset、未访问生产。继续受控 GREEN 前仍必须得到这两个精确文件到已验证 disposable ECS 精确目标路径的新授权；此前对旧版 013 的单文件授权不扩展到 migration 或更新后的 013。

**2026-08-27 Phase 7A Task 3（controlled copy complete）**：用户明确授权当前 migration 与更新后的 013 pgTAP 到已验证 disposable ECS 的精确路径；controller 只执行这两次 `scp`，两次均 exit 0。远端 SHA-256 已分别确认与本地完全一致：migration `b6111923e268a3c24f2cd30054a8b24edff95d284acbb6e198e2379b5a057d42`，013 pgTAP `933f47fdd1e1ddea70251d16d05f80c588cc4860962f68c33a054021ba8aa9bf`。尚未 reset、应用 migration、运行 GREEN/typegen 或访问生产；下一步必须先重新通过 disposable identity/marker/manifest fail-closed proof，才允许仅对该测试栈执行 reset。

**2026-08-27 Phase 7A Task 3（first reset compile failure / new copy gate）**：reset 前的即时 fail-closed proof 全部通过：精确 workdir/project、DB/Kong containers 及 64322/64321、fixed paused marker、22-file migration manifest、seed/test SHA 全部一致，生产与禁止端口 54321/54322 未访问。远程 bare `supabase` 命令不存在且未改变数据库；随后以该栈 pinned `./cli/node_modules/.bin/supabase db reset --yes` 开始 reset，旧 21 个 migration 应用成功，新 migration 在 statement 93 因 PostgreSQL 17 无法消解 chained JSONB `- 'key'` 的 `unknown - unknown` 运算符而 exit 1，seed 未执行。本地仅将这些表达式改为等价 `jsonb - text[]`，`git diff --check` clean，新 migration SHA-256 为 `99b6f01c5fcb7bebd60af8a1ec70503e090c4bccfa2e9a6c4d1f81dda842bf7c`，013 仍为 `933f47fdd1e1ddea70251d16d05f80c588cc4860962f68c33a054021ba8aa9bf`。因 migration bytes 已变，未获得这一新 SHA 到同一精确 disposable 目标路径的新授权前，不得重新 copy、reset、GREEN 或 typegen。

**2026-08-27 Phase 7A Task 3（corrected migration recopy complete）**：用户明确授权修正后的单个 migration 到既定 disposable ECS 精确路径；controller 只执行该次 `scp`，exit 0，远端 SHA-256 `99b6f01c5fcb7bebd60af8a1ec70503e090c4bccfa2e9a6c4d1f81dda842bf7c` 与本地完全一致。未复制其他文件、未在本步骤 reset、未访问生产。下一步仍需先重复 fail-closed disposable 身份、marker 与 manifest 校验，只有全部匹配才可再次 reset。

**2026-08-27 Phase 7A Task 3（corrected-copy recheck / marker recovery blocked）**：用户精确授权后，controller 只重新复制修正后 migration 到同一 disposable 精确路径，远端 SHA-256 与本地 `99b6f01c5fcb7bebd60af8a1ec70503e090c4bccfa2e9a6c4d1f81dda842bf7c` 匹配。reset 前立即 fail-closed proof 再次确认 workdir `/root/airdrop-governance-test`、project `airdrop-intelligence-governance-test`、仅 DB/Kong containers 与 64322/64321、22-file migration manifest、seed SHA `f1ceaddc…7e55` 及 013 SHA `933f47fd…a9bf` 全部匹配；但 fixed paused marker 查询返回 0 行。这与上轮 pinned reset 已 recreate DB、在新 migration 编译失败后于 seed 前中止的已知恢复态精确一致，但仍不满足 hard marker gate。因此没有再 reset、pgTAP、typegen，也没有自行 seed/insert marker；生产与 54321/54322 未访问。唯一建议恢复动作是：由用户明确授权在该已知 failed-reset recovery state 下，仅执行一次 pinned disposable `./cli/node_modules/.bin/supabase db reset --yes`；未授权前保持停止。

**2026-08-27 Phase 7A Task 3（one-time recovery reset succeeded）**：用户明确授权在已记录的 failed-reset recovery state 下，仅在 `root@115.190.206.200:/root/airdrop-governance-test` 执行一次 pinned `./cli/node_modules/.bin/supabase db reset --yes`。该唯一一次 reset exit 0：22 个 migration（包含 SHA `99b6f01c…bf7c` 的修正 Phase 7A migration）全部应用，seed 完成，containers 重启。紧接的只读查询精确返回 paused marker `90000000-0000-4000-8000-000000000019|disposable-integration-database-marker|Disposable Integration Database Marker|paused`，恢复安全门。本轮不会无授权再执行 reset；生产项目/容器和 54321/54322 均未访问。下一步在当前数据库上运行 focused/full pgTAP，任何 migration/test bytes 变化都必须先回到精确 source-copy 授权门。

**2026-08-27 Phase 7A Task 3（focused 013 harness collation gate）**：不再 reset，直接在恢复后 disposable DB 运行 focused `013_phase_7a_security_incidents_indicators.test.sql`。前 26/26 个已执行 catalog assertions 全部 PASS，但首个 exact-column `results_eq` 在 line 61 因 `could not determine which collation to use for string comparison` 中止，harness 因 no plan exit 1（内部 test status 3）。根因是 information_schema `sql_identifier` 与 expected text 的 collation 未显式统一，非 migration 编译或前 26 项 schema 断言失败。本地只对 9 个 exact-column actual/expected 比较增加 `COLLATE "C"`，`git diff --check` clean；新 013 SHA-256 为 `2647b0ff9fe008aaef5da56d1b90db42edff681d1635da5979ae29b98c1a9d53`，migration 仍为 `99b6f01c…bf7c`。因 test bytes 已变，不得在无新授权时重新复制；不会再 reset。继续前需用户明确授权仅复制本地 `supabase/tests/013_phase_7a_security_incidents_indicators.test.sql` 到 `root@115.190.206.200:/root/airdrop-governance-test/supabase/tests/013_phase_7a_security_incidents_indicators.test.sql`。生产和 54321/54322 未访问。

**2026-08-27 Phase 7A Task 3（updated 013 recopy complete）**：用户明确授权更新后的单个 013 pgTAP 到既定 disposable ECS 精确路径；controller 只执行该次 `scp`，exit 0，远端 SHA-256 `2647b0ff9fe008aaef5da56d1b90db42edff681d1635da5979ae29b98c1a9d53` 与本地完全一致。未复制其他文件、未 reset、未访问生产；下一步直接在已恢复的 disposable DB 上继续 focused pgTAP。

**2026-08-27 Phase 7A Task 3（focused 013 candidate-command failure / migration gate）**：Controller 仅复制用户精确授权的更新 013，远端 SHA-256 `2647b0ff9fe008aaef5da56d1b90db42edff681d1635da5979ae29b98c1a9d53` 匹配。没有 reset，直接重跑 focused 013：collation 修复已生效，前 165/165 个已执行断言全 PASS；随后 line 550 的 `accept_and_open` 在 `execute_security_candidate_review` 中抛出安全包装错误 `security_persistence_failed`，harness 因 no plan exit 1（内部 status 3）。代码数据流证实原因：`accept_and_open` 不赋值 generic `current_incident record`，但后面 incident outbox 的共享 SQL `CASE` 仍引用 `current_incident.resulting_posture`，PL/pgSQL 未赋值 record 错误被统一异常包装器转为固定安全错误。本地最小 migration 修复是：attach 路径将 current posture/severity/summary 复制到已有标量，共享 decision/outbox 仅使用这些标量。`git diff --check` clean；新 migration SHA-256 `261e37520b991b1d210d28bcb1cfe8025213c6f93daa06496c9b48b10b86b085`，013 SHA 不变。由于 migration bytes 改变，未获新精确 source-copy 授权前不得复制；且应用该 migration 需用户另行明确授权一次 marker-verified disposable pinned reset。生产与 54321/54322 未访问。

**2026-08-27 Phase 7A Task 3（candidate-command fix copy complete / reset authorized）**：用户明确授权 SHA-256 `261e37520b991b1d210d28bcb1cfe8025213c6f93daa06496c9b48b10b86b085` 的修正版 migration 到既定 disposable ECS 精确路径，并授权在复制及 fail-closed 校验通过后仅执行一次 pinned disposable reset。controller 复制前先核对本地 SHA，随后只执行该次 `scp`，exit 0；远端 SHA 与本地完全一致。尚未在本步骤 reset 或访问生产；下一步由 Task 3 implementer 重复 disposable identity/paused-marker/manifest proof，全部匹配后才使用这一次 reset 授权。

**2026-08-27 Phase 7A Task 3（scalar-fix reset GREEN）**：用户精确授权 migration SHA `261e37520b991b1d210d28bcb1cfe8025213c6f93daa06496c9b48b10b86b085` 到已验证 disposable 路径的 copy，以及完整 fail-closed proof 后的一次 pinned reset；controller 只复制该 migration 并确认远端 SHA 完全一致。reset 前 proof 通过：精确 workdir/project、仅 DB/Kong containers 与 64322/64321、fixed paused marker、22-file migration manifest、seed SHA `f1ceaddc…7e55`、013 SHA `2647b0ff…a9d53`。随后仅执行一次 `./cli/node_modules/.bin/supabase db reset --yes`，exit 0，22 migrations、seed、container restart 全部完成；紧接的只读查询精确恢复 marker `90000000-0000-4000-8000-000000000019|disposable-integration-database-marker|Disposable Integration Database Marker|paused`。不会无授权再 reset；生产项目/容器与 54321/54322 未访问。

**2026-08-27 Phase 7A Task 3（focused 013 anon temp-fixture gate）**：标量修复 migration 的唯一授权 reset 后，未再 reset 直接运行 focused 013。前 170/170 个已执行断言全 PASS，因而已跨过上轮 `accept_and_open` 失败点。随后 line 633 的 anon public-safe-indicator `results_eq` 在 where/expected 辅助 query 中读 `pg_temp.phase_7a_candidate_result`，而该 test fixture 仅 grant authenticated，PostgreSQL 精确报 `permission denied for table phase_7a_candidate_result`，harness no plan / exit 1。这是测试临时 ID/result 表的权限缺口，非 production public view/grant 失败。本地最小 test-only 修复只向 anon 授予该 pg_temp 表 SELECT，不修改 production SQL；`git diff --check` clean。新 013 SHA-256 `fa423b174bfb935aa6704e71b00a7eee93c83359f31e11b00b4839a1df02b816`，migration 仍 `261e3752…b086b`。由于 test bytes 改变，继续前需用户精确授权仅复制本地 013 到已验证 disposable 同一 test 路径；不需、也不得再 reset。生产和 54321/54322 未访问。

**2026-08-27 Phase 7A Task 3（anon temp-fixture 013 recopy complete）**：用户明确授权 SHA-256 `fa423b174bfb935aa6704e71b00a7eee93c83359f31e11b00b4839a1df02b816` 的更新后 013，并明确禁止 reset。controller 复制前核对本地 SHA，只执行该次 `scp`，exit 0；远端 SHA 与本地完全一致。未复制其他文件、未 reset、未访问生产；下一步直接继续 focused pgTAP。

**2026-08-27 Phase 7A Task 3（focused 013 GREEN）**：Controller 只复制用户精确授权的更新 013，远端 SHA-256 与本地 `fa423b174bfb935aa6704e71b00a7eee93c83359f31e11b00b4839a1df02b816` 完全一致。本步用户明确禁止 reset，因此直接在现有 disposable DB 运行 focused 013：exit 0，Files=1 / Tests=179 / Result PASS。这完整验证了本文件的 catalog/exact columns、forced RLS/grants、active/revoked bearer、grounding、candidate accept/open、disclosure/public projection、outbox receipt/rollback 断言。本步未 reset、未改 source bytes、未访问生产或 54321/54322；下一步为同一 DB 上的 full pgTAP。

**2026-08-27 Phase 7A Task 3（full pgTAP integration failures / three-file gate）**：focused 013 GREEN 后，未 reset 直接运行 full pgTAP：13 files / 1241 executed tests，013 仍 PASS。失败只落在两类 forward integration：① 006 tests 22/23 与 012 test 12 的旧 exact-column expectations 尚未加入计划内 `security_posture`；② 010 前 101 个断言 PASS 后，旧 ordinary `intelligence.signal.promoted.v1` outbox 因包含其既有合法 `evidenceId` 被 Phase 7A payload check 拒绝。根因是 security-sensitive denylist 误放在所有 outbox event 的 common 条件，而设计只要求新 security events 不泄漏 Evidence/Raw Item/内部字段。本地最小修复为：migration 将 denylist 精确移入 security-only branch，不放宽新 security event contract；006/012 只更新 intentional `security_posture` exact arrays。`git diff --check` clean。新精确 SHA：`supabase/migrations/20260826000100_phase_7a_security_incidents_indicators.sql` = `e77c0399b740283574d929536801918c1d6eae6c4a32d98990e5869623fdac4e`；`supabase/tests/006_read_models.test.sql` = `3eca558abb4f38ea6d19e0b9623ab2ce4c6a75dee6d407742b2bbb78c3225526`；`supabase/tests/012_project_score_evidence_detail.test.sql` = `9a3266174b8bd76fa5d580124d0d40b043639de8e3c5694e73a6e6cf3139dda2`。013 仍 `fa423b17…02b816`。因三个 source bytes 已变，未获新授权前不得复制；应用 migration 同样需新一次 marker-verified pinned reset 的单独授权。生产与 54321/54322 未访问。

**2026-08-27 Phase 7A Task 3（full-suite compatibility files copied / reset authorized）**：用户明确授权上述 migration、006 与 012 三个指定 SHA 到既定 disposable ECS 精确路径，并授权复制及 fail-closed 校验通过后仅执行一次 pinned disposable reset。controller 逐一核对本地 SHA 后只复制这三个文件，三次均 exit 0；远端 SHA 与本地分别精确匹配 `e77c0399b740283574d929536801918c1d6eae6c4a32d98990e5869623fdac4e`、`3eca558abb4f38ea6d19e0b9623ab2ce4c6a75dee6d407742b2bbb78c3225526`、`9a3266174b8bd76fa5d580124d0d40b043639de8e3c5694e73a6e6cf3139dda2`。尚未在本步骤 reset 或访问生产；下一步须重复 exact disposable identity/paused-marker/manifest proof，全部匹配后才使用这唯一一次 reset 授权。

**2026-08-27 Phase 7A Task 3（integration-fix reset GREEN）**：用户精确授权 migration/006/012 三个文件到已验证 disposable 同路径的 copy，以及完整 fail-closed proof 后的一次 pinned reset。Controller 只复制这三个文件，远端 SHA 分别与本地 `e77c0399…dac4e` / `3eca558a…25526` / `9a326617…9dda2` 匹配。reset 前 proof 再次确认 exact workdir/project、仅 DB/Kong 64322/64321、fixed paused marker、22 migrations、seed/006/012/013 SHA 全部精确匹配。仅执行一次 `./cli/node_modules/.bin/supabase db reset --yes`，exit 0，22 migrations、seed、restart 完成；紧接只读查询精确恢复 paused marker。不会无授权再 reset；生产项目/容器与 54321/54322 未访问。

**2026-08-27 Phase 7A Task 3（integration-fix focused GREEN）**：在三文件 integration-fix 的唯一授权 reset 与 marker 恢复后，未再 reset，直接运行 focused 013：exit 0，Files=1 / Tests=179 / Result PASS。最新 migration/outbox-scope 修正下 Phase 7A catalog、RLS/grants、bearer commands、grounding、incident/disclosure、public projections 与 rollback 断言全部通过。未改 source bytes，未访问生产/54321/54322；下一步为同一 DB 上 full pgTAP。

**2026-08-27 Phase 7A Task 3（full pgTAP GREEN）**：Integration-fix focused 013 179/179 PASS 后，未 reset 在同一 disposable DB 运行 full `supabase test db`。001–013 全部 `ok`，exit 0，Files=13 / Tests=1,293 / Result PASS。这闭环了 006/012 的 intentional `security_posture` exact columns、010 旧 ordinary Promotion outbox contract、以及 013 完整 Security Ledger 边界。本步未 reset、未改 source bytes、未访问生产或 54321/54322。下一步是在该 disposable schema 上使用 pinned CLI 连续 typegen 两次，要求 bytes 和 SHA-256 完全稳定后才更新本地 generated types。

**2026-08-27 Phase 7A Task 3（stable database typegen GREEN）**：Full pgTAP 13 files / 1,293 PASS 后，在同一 marker-verified disposable schema 使用 pinned CLI 连续执行两次 `supabase gen types typescript --local`。两份生成物均 129,843 bytes，`cmp -s` byte-for-byte 一致，SHA-256 均为 `f8eb56cdc4f66e7a3ea4bf35425f9f4951847e724ee924a40ec39323e8e76e53`。稳定生成物已机械替换本地 `packages/database/src/generated/database.types.ts`，本地 SHA 一致；静态扫描确认九张 Security Ledger 表、核心 candidate/incident/disclosure/list/detail RPCs 与四个 public views 全部出现，无 missing 输出，`git diff --check` clean。未 reset、未访问生产/54321/54322；下一步为 database package 及全仓 acceptance gates。

**2026-08-27 Phase 7A Task 3（generated-type consumer package GREEN）**：Stable generated types 更新后，database unit 首轮 180 PASS / 44 environment-gated skips，lint exit 0；typecheck 唯一失败类别是 `opportunity_list` full generated Row 新增 `security_posture`，但现有 repository 明确 SELECT 只取旧子集，mapper 和两个 test fixtures 仍以 full Row 注解。计划中 Task 7 才把 posture 加入 repository/public mapping，因此本 Task 只将 mapper/test fixture 的输入类型收窄为 `Omit<OpportunityListRow, 'security_posture'>`，不改实际 SELECT、返回对象或用户行为。修复后 database tests 为 10 passed files / 180 tests / 44 gated skips，lint/typecheck 均 exit 0。未 reset、未访问生产/54321/54322；下一步为 full `pnpm verify`。

**2026-08-27 Phase 7A Task 3（full verify GREEN / Step 6 coverage gap）**：fresh `pnpm verify` 在 Node 22.22.2 / pnpm 11.16.0、`CI=true` 下 exit 0，contracts 131 + domain 375 + database 180 + worker 212 + web 140 = 1,038 non-skipped，46 environment-gated skips，lint/typecheck/build/placeholders 全绿。但随后逐项对照 approved Task 3 Step 6，自审确认当前 013 的 179 个断言尚未完整覆盖双 incident 独立 resolve、blocked-source alternative/last Evidence、Security Ledger 复用已落地 blocked-source Evidence、普通 Promotion clear/caution/blocked、indicator-required open、database-owned timestamp 与 receipt 前失败的全量零写入矩阵。因此 Task 3 仍为 IN PROGRESS，不能因现有 suite 全绿而宣告完成。下一步只补这些最小真实 pgTAP fixtures；一旦 013 bytes 改变，必须先记录精确 SHA 并停在 disposable ECS 单文件 copy 授权门，不自行 copy/reset。生产及 54321/54322 未访问。

**2026-08-27 Phase 7A Task 3（Step 6 local pgTAP expansion / copy gate）**：仅本地扩展 013，未改 migration。新增真实 fixture 覆盖：同一 source 两个 active incidents、独立 resolve 后剩余 block、blocked-source-only/alternative ordinary Evidence、已阻断 source 的既有 grounded Evidence 仍可供 Security Ledger 开第二个 incident、clear/caution/blocked ordinary Promotion、incident open 必须存在 indicator、数据库 transaction timestamp、caller-forged timestamp 拒绝，以及 receipt 前失败时九张 ledger 表/receipt/outbox 计数全不变。新文件 1,345 行，SHA-256 `497efe15bea29ea3813e3686132923cfa76b6e4b97baf758f9ea7ed5e9e1c1d6`；`git diff --check` clean，`$$`/tagged dollar delimiters 成对，14 个 `set local role` 与 14 个 `reset role` 平衡，无顶层 `perform`、占位符标记、敏感凭据或禁止端口字样。尚未复制、未运行新 focused test、未 reset；继续前需用户明确授权只复制本地 `supabase/tests/013_phase_7a_security_incidents_indicators.test.sql` 到 `root@115.190.206.200:/root/airdrop-governance-test/supabase/tests/013_phase_7a_security_incidents_indicators.test.sql`，并由 controller 核验相同 SHA。该 test-only 变化不需要 reset。

**2026-08-27 Phase 7A Task 3（expanded 013 authorized copy / immediate preflight）**：用户仅授权扩展后 013 SHA `497efe15…e1c1d6`；controller 只复制该文件并确认 remote SHA 完全一致。运行测试前的即时只读 proof 再确认 `/root/airdrop-governance-test`、project `airdrop-intelligence-governance-test`、健康 DB/Kong containers、仅 64322/64321、精确 paused marker 与 remote 013 SHA 全部匹配。未 reset、未访问生产或 54321/54322；下一步直接在当前 disposable DB 上运行 focused 013。

**2026-08-27 Phase 7A Task 3（expanded focused 013 GREEN）**：不 reset，直接在 verified disposable DB 运行扩展后 013；exit 0，Files=1 / Tests=193 / Result PASS。新增 14 个行为断言连同既有 179 个边界断言全部通过，无 source bytes 变化、无生产或 54321/54322 访问。下一步在同一数据库上运行 full pgTAP。

**2026-08-27 Phase 7A Task 3（expanded full pgTAP GREEN）**：不 reset，在同一 disposable DB 运行 full `supabase test db`；001–013 全部 `ok`，exit 0，Files=13 / Tests=1,307 / Result PASS。Step 6 扩展覆盖没有破坏任何既有数据库边界，无 source bytes 变化、无生产或 54321/54322 访问。下一步为 fresh 全仓 `pnpm verify` 与最终静态验收/报告。

**2026-08-27 Phase 7A Task 3（fresh verify placeholder iteration）**：fresh `pnpm verify` 的 lint、typecheck、contracts 131 + domain 375 + database 180 + worker 212 + web 140、build 均通过，但最终 placeholder checker 因本轮三份交接文档的静态检查说明原样写入了其禁止的两个占位符 token 而 exit 1。根因仅为证据文案触发仓库门禁，不是代码、SQL 或测试失败；最小修正仅把三处说明改为“占位符标记”，随后必须完整重跑 `pnpm verify`。

**2026-08-27 Phase 7A Task 3（local acceptance complete / ready to commit）**：窄门禁 `pnpm check:placeholders` 修复后 exit 0；随后 fresh 完整 `pnpm verify` exit 0。最终本地门禁为 lint/typecheck/build/placeholder 全绿，contracts 131 + domain 375 + database 180 + worker 212 + web 140 = 1,038 non-skipped，46 environment-gated skips。数据库最终证据为 expanded focused 013 193/193 PASS、full pgTAP 13 files / 1,307 PASS，stable typegen SHA `f8eb56cd…e76e53`；整个扩展验证无 reset、无生产或 54321/54322 访问。Task 3 已满足本地验收，下一步仅为最终 diff 静态复核与提交 `feat(db): add phase 7a security ledger`；不得开始 Task 4。

**2026-08-27 Phase 7A Task 3（implementation committed / independent review）**：Controller 复核工作区范围、九个预期文件、generated-type SHA 与 `git diff --check` 后，将不变实现机械提交为 `8134bf4 feat(db): add phase 7a security ledger`（相对 BASE `3b7ec7e`）。该提交包含 forward migration、013 pgTAP、006/012 intentional column expectations、稳定 generated types，以及 generated-row consumer 的最小类型收窄；不包含生产部署或远端凭据。下一步仅对 `3b7ec7e..8134bf4` 做独立规格与质量审查，Task 4 尚未开始。

**2026-08-27 Phase 7A Task 3（independent review / Fix Round 1 opened）**：独立审查 `3b7ec7e..edd9077` 返回 `NEEDS_FIXES`，无 Critical、8 个 Important：blocked-source Evidence 需要逐条过滤；public security projections 需恢复 invoker/RLS 与 catalog visibility；extraction-origin candidate 的 reviewer target/Evidence 流程不完整；`accept_and_attach` 缺 expected incident version；candidate attach 与 incident command 锁顺序可能反转；`ai_stage_worker` 缺 posture/lock helper execute；blocked-project warning 可能选择 caution incident；013 未覆盖足以捕获这些边界的矩阵与 payload/rollback。另有 5 个 Minor 约束/无操作 decision 问题。本轮先按 receiving-review 流程逐项对照规格和实际数据流，只修复成立项并先补失败测试；尚未复制新文件、reset、访问生产或开始 Task 4。

**2026-08-27 Phase 7A Task 3（Fix Round 1 validation / contract RED）**：8/8 Important 与 5/5 Minor 均已对照 approved spec、contracts、forward migration 和旧 Evidence read boundary 技术确认成立，无盲目接受后的拒绝/缩限项。新增两个最小 contract RED：extraction detail 必须显式携带 context 且 canonical target/Evidence 未选择；`accept_and_attach` 必须携带 reviewer target 与 `expectedIncidentVersion`。contracts 运行 exit 1，130 PASS / 2 个预期失败，失败原因分别是旧 detail 强制 manual-only 非空字段且拒绝 `targetContext`，以及旧 attach schema 拒绝新增 target/version keys。本步未访问数据库、网络、生产或禁止端口。

**2026-08-27 Phase 7A Task 3（Fix Round 1 disposable validation，WorkBuddy 接手完成）**：经项目所有者对本轮精确授权（SCP 新版 migration + 013/006 至 `/root/airdrop-governance-test` 同一目标路径、仅对该 disposable 栈 reset、双次 typegen），执行 marker fail-closed 复验（project `airdrop-intelligence-governance-test`、db/kong 容器、64322/64321、固定 marker `fixture-paused/paused`）后同步文件并重置栈：修复版 migration（3,988 行 SHA `24d4b763…`）首次通过数据库执行，22 migrations + seed exit 0。首轮 focused 013 暴露三个测试侧缺陷：① authenticated 块直调已 revoke 的 `evidence_quote_sha256_v1` 触发 permission denied 并中断事务流；② outbox 约束 INSERT 缺省 `occurred_at` 使 NOT NULL 先于 payload check 触发；③ 锁序断言把 SQL 字面量 `\n` 当两个字符导致 strpos 恒 0。均按最小改动修复于测试文件（不改安全边界）。探针实测三个聚合 outbox 分布 candidate=2 / indicator=3 / incident=1，确认 Fix Round 1 将总数预期改为 7 时漏掉了新增 caution incident 场景的 opened 事件聚合 ID；过滤列表按幂等键补入该 command 的 aggregate_id 后为 7。终态：focused 013 **224/224 PASS**；全量 pgTAP **13 files / 1,338 PASS**（首次失败仅为远程缺未提交的 006 版本所致，同步后消除）；typegen 双次生成 SHA 一致 `61e8829c…` 且与手工 types 存在 93 行差异（PostgREST 将 ledger FK 关系映射到新安全视图，手工编辑不可覆盖），以生成产物替换；替换后 database 包内单测 180 passed / 44 gated skipped、lint/typecheck exit 0（先前的 7 个“browser resolution 失败”系自仓库根误跑 vitest 所致，包内标准命令无此问题；并因坑 14 对 worktree 重做离线 frozen install）；fresh 全仓 `pnpm verify` **exit 0**。本步零生产访问、零测试以外数据写入。下一步仅对 fix 范围执行独立复审，然后进入 Task 4。

**2026-08-27 Phase 7A Task 3（Fix Round 1 independent re-review — Approved，Task 3 闭环）**：scoped re-review 对 `edd9077..daf6d40` 逐项核验 8 Important 与 5 Minor，结论 **Approved**：全部 Resolved（blocked-source Evidence 逐条过滤 helper `current_score_citation_path_is_public`、四视图 invoker/barrier + 四表精确列级 RLS、extraction detail discriminated union 与 targetContext 归一校验、attach expectedIncidentVersion 由 DB CHECK 强制 resulting=expected+1、共享资源上 advisory lock 恒先行于行锁且双目标 project→source 恒定序、ai_stage_worker helper grants 补齐、blocked warning 按 rank=1 取最新 blocked incident、pgTAP 扩展约 +450 行覆盖矩阵/payload/rollback），新增 Critical/Important/Minor 均为 0。复审员本地复跑 contracts 132 / domain 375 / database（包内跑法）180 全绿，并专项确认 controller 的四处测试侧修复（SHA 预计算、outbox 过滤列表扩展、锁序真实换行断言、occurred_at 补齐）语义更强而非弱化。数据库层证据按惯例记为 report-attested cannot-verify。Task 3 全部收口；下一任务进入 Task 4（bearer-scoped security review repositories + races）。

**2026-08-27 Phase 7A Task 4（repository 实现，未提交待 controller 提交）**：在 BASE `6b990fd` 上以 TDD 完成 `packages/database/src/security/security-review-repository.ts`（9 个方法 listCandidates/getCandidate/submitManualCandidate/reviewCandidate/listIncidents/getIncident/openIncident/commandIncident/setIndicatorDisclosure；每次调用以传入 accessToken 创建非持久 Supabase client；结果与命令均先过 contracts strict zod schema 再映射；错误仅映射 migration 的 AS101–AS199 稳定枚举码到 `securityErrorCodeSchema`，不透传 response message/details/hint/body；payload 以 canonical key-order JSON 序列化，不注入 reviewer 或时间戳；cursor 按 (createdAt desc, id desc)，candidate 用 createdAt/candidateId、incident 用 lastDecisionAt/incidentId；openIncident 走专用 `open_security_incident` RPC，非 open 命令走 `execute_security_incident_command`）、`entry.ts`（server-only）、`browser-denied.ts` 与 `package.json` 新增 `./security-review` 条件导出（browser → deny）。RED：包内 `pnpm run test src/tests/security-review-repository.test.ts` exit 1，suite 失败精确为缺失模块 import。GREEN：database 包内 test **225 passed / 51 environment-gated skipped**（含新单测 44 用例与 entrypoints browser-deny 断言）、lint exit 0、typecheck exit 0。integration 测试文件按惯例环境门控：缺 env 整文件 skip；存在时要求四变量齐全、URL 仅 loopback 16432（DB）/16433（API）、fixed paused marker 存在后才允许任何 INSERT；fixture id 全部 randomUUID 自有资产，teardown 单事务 bulk 清理自身行、不逐行删除他人 append-only 历史。本轮实现 agent 未连接数据库、未执行 reset/integration，真实集成与 env 推导由 controller 负责；未 git commit。

**2026-08-27 Phase 7A Task 4（controller disposable 集成验证与修复）**：按 6B 同款流程从 `governance-test` 容器推导四个集成变量至本地 `/tmp/airdrop-7a-test.env`（0600，值不打印、远程不留副本）；期间发现本机残留旧隧道目标不明，全部清除后以显式 `-L 127.0.0.1:…` 重建精确 `16432→64322 / 16433→64321` disposable 隧道（曾误建指向生产端口的短命隧道并即刻拆除，最终监听经 lsof 逐条核验为唯一且正确）。focused integration 首轮暴露两处测试侧缺陷并修复：①teardown 以 `project_id` 查询 `security_indicators`（该表无此列，indicator 经 incident_indicator_links 与 review decisions 关联），改经由关联表收集；②raw_items INSERT 中两个相邻模板插值生成 SQL `$7$8` 相连导致 syntax error，合并为单一表达式；并将散落的 `in ${transaction(...)}` 插值统一为 `= any(…::uuid[])`（含 teardown 末尾四个 delete）。另一处实现层修复：ledger list RPC 校验 `p_limit between 1 and 100`，repository 原 `limit+1` 在满页查询时越界触发 AS108，改为 `Math.min(query.limit+1, 100)` 并同步 unit 断言；integration 的 replay 全等断言改为剔除 replayed 差异字段后比较。终态：**focused integration 7/7 PASS**（约 5s，覆盖 active reviewer/admin 成功路径、ordinary/revoked 拒绝、同 key 重放与异 payload 冲突、陈旧版本冲突、incident 并发竞态与独立解除）；database 包内 test 225 passed / 51 gated skipped、lint/typecheck exit 0；fresh 根 `pnpm verify` exit 0。生产零访问。

**2026-08-27 Phase 7A Task 4（independent re-review — Approved，附三个 Minor 即时闭环）**：scoped re-review 对 `6b990fd..287f677` 八项安全核查全部 Pass（per-call bearer 无缓存且 fail-closed、parse-before-map 及 manual receipt 手写 exact-key 校验足够、AS101–AS199 映射完整且未知 SQLSTATE 收敛 `security_persistence_failed` 不透传 response 文本、open/commandIncident 双路由与 migration 职责精确对齐、cursor encode 与 RPC order by 吻合、browser deny 三层闭合、integration fixture 含 signup-to-Set/双 marker/URL fail-closed/bulk 自有资产清理、exports 未破坏既有导出），新增 Critical/Important 为 0；3 个 Minor 当轮闭环：①repository 本地校验失败与真实持久化故障共用 fallback code 属枚举约束下可接受代价，已在本记录明示调用方语义；②`limit=100` 满页时 nextCursor 恒 null 的 hasNextPage 探测失效边界已在 repository 注释与本记录声明（需精确满页游标语义时客户端应取 limit≤99）；③teardown 末尾四个 delete 也统一为 `= any(…::uuid[])`，文档表述与实现一致。database 包内 lint/typecheck/test 复跑通过。Task 4 闭环；下一任务 Task 5（security extraction routing + ordinary Promotion guards）。

**2026-08-28 Phase 7A Task 6（Step 1 RED）**：在 clean `codex/phase-7a-security-ledger` / HEAD `9dd3155` 上按获批设计先补合同、retry policy、collection repository、collector、queue settlement 与 scoring runner 的 protect-first tests。指定 Node `22.22.2` / pnpm `11.16.0` focused RED 均按预期 exit 1：contracts 2 个具名失败（缺 `security_blocked` 与 `source_security_blocked`），domain 1 个具名失败（terminal classification 尚未实现），database 3 个具名失败（尚无 source lock/posture recheck 与 typed error），worker 5 个具名失败（blocked response 仍误映射 persistence failure、queue 未 cancel、评分无独立 security skip）。这些失败直接落在待实现边界，既有其余 131 contracts、375 domain、234 database、215 worker 测试保持通过；未连接数据库、未运行 reset、未访问生产。下一步最小实现 collection contract/transaction gate/queue cancellation，随后 focused GREEN 并再次更新本手册。

**2026-08-28 Phase 7A Task 6（collection gate focused GREEN）**：新增严格 `security_blocked` outcome 与 queue-only `source_security_blocked` result code；domain 将前者归类为 non-retryable。collection repository 的 endpoint/feed/article 新写事务现在先取得 `security_target_lock_key_v1('source', sourceId)` advisory lock、再用 `current_security_target_posture` 重读姿态；仅 blocked 抛出并原样保留 typed `SourceSecurityBlockedError`，caution/clear 继续，其他异常仍收敛 `persistence_failed`。collector 仅映射该 typed error 为 inert `security_blocked`（response body 丢弃、无 Raw Item/Attempt/Discovery），queue settlement 以 `source_security_blocked` cancel，抓取前既有 eligibility false 仍为 `source_ineligible`。focused GREEN：database repository 27/27，worker collector+queue 53/53；contracts 133/133、domain 376/376 已在同轮先行全绿。未连接数据库或生产。下一步实现 clear-only scoring input 与落库时 project/source 二次门禁。

**2026-08-28 Phase 7A Task 6（scoring gate local GREEN）**：`listScoringInputs` 现仅选择 posture=clear 的项目，并排除任何拥有当前 caution 合格 Evidence 来源的 Signal；blocked Evidence 不再参与普通评分，但同一 Signal 有 clear alternative 时仍保留。`recordProjectScore` 在单事务内先锁 project，再按 UUID 稳定顺序锁 linked Signals 当前 non-blocked Evidence sources；锁后重读 project/source posture，并验证每个 linked Signal 仍有至少一个合格来源。任何 caution/blocked/missing Evidence race 返回 `created:false / projectScoreId:null / skippedReason:security_restricted`，零 Score/Factor/Link 写入；duplicate 与 created 结果均显式 `skippedReason:null`。worker summary 新增独立 `securitySkipped`，不制造失败或重试风暴。已新增真实 collection/scoring 双会话 integration fixtures（当前无 env 故仅门控 skip），本地 package GREEN：database 237 passed / 63 gated skipped，worker 220/2，contracts 133，domain 376；database/worker typecheck 与 database lint 均 exit 0。下一步只连接 marker-verified disposable 栈运行两份 focused race integration，不 reset、不访问生产。

**2026-08-28 Phase 7A Task 6（real race integration GREEN）**：临时 SSH 隧道经 `lsof` 精确为本机 `16432→remote 64322`、`16433→remote 64321`；远端只读 proof 确认 `/root/airdrop-governance-test`、project `airdrop-intelligence-governance-test`、DB/Kong 容器端口 64322/64321 与 healthy，随后本地只读查询精确返回 paused marker `90000000-0000-4000-8000-000000000019 / disposable-integration-database-marker / paused`。无 reset。focused database integration 2 files / 14 tests PASS、exit 0、17.71s：覆盖 project blocked + clear source 仍可 collection、source caution 可 collection、resolve 后恢复、block-first collection 零 Raw/Attempt、ordinary-first history 保留；评分覆盖 project caution、caution Evidence source、blocked Evidence + clear alternative、clear resumption，以及双 SQL session advisory-lock block-first 零 Score/Factor/Link、ordinary-first score history 保留。前置 marker Node 小脚本首轮仅因从 monorepo 根无法解析 workspace-local `postgres` package 而失败；从 database workspace 重跑后精确通过，不涉及产品代码或数据库写入。生产与 54321/54322 未访问。下一步 fresh `pnpm verify`、静态范围检查与独立审查。

**2026-08-28 Phase 7A Task 6（independent review / Fix Round 1 opened）**：fresh `pnpm verify` 先行 exit 0（contracts 133 + domain 376 + database 237 + worker 220 + web 140 = 1,106 non-skipped，65 gated skips；lint/typecheck/build/placeholders 全绿）。独立 reviewer 对 BASE `9dd3155` 的 working-tree diff 判定 Ready to merge: No，报告 1 Critical / 1 Important / 2 Minor。技术复核确认均成立：① scoring 在加锁前过滤 blocked Evidence source，遗漏 blocked→caution transition，可能在未锁/recheck 新 caution source 时写入 score；② article-level `SourceSecurityBlockedError` 被 generic persistence fallback 吞掉，队列仍成功且继续抓后续文章；③两份 race tests 的 pending Promise 在 setup/assertion 失败路径未保证 settle；④workbook 仍显示 Task 6 待执行。下一步先增加 blocked→caution 双会话 RED 与 multi-article blocked RED，再逐项最小修复；workbook 仅在修复/复验完成后改为完成。

**2026-08-28 Phase 7A Task 6（Fix Round 1 focused GREEN）**：新增 multi-article RED 精确复现 blocked article commit 被 fallback 吞掉后仍返回 Feed success、继续三篇抓取；新增 marker-verified 双会话 blocked→caution RED 实际错误创建 Score，且后续 ordinary-first 因未完成恢复出现预期级联失败。最小修复后，scoring persistence 查询所有结构有效 Evidence sources（不按 posture 预过滤），按稳定顺序全部加锁，再按每个 linked Signal 执行“至少一个 clear、零 caution，blocked 可由 clear alternative 替代”的锁后判定；article 主 commit、fallback commit 和 validator-failure commit 均只对 typed `SourceSecurityBlockedError` 立即重新抛出，外层返回 terminal `security_blocked` 并停止后续文章。两份 integration race tests 的 pending Promise 已提升作用域并在 `finally` 保证 settle；durable queue repository 新增 `source_security_blocked` exact RPC argument 断言。GREEN：collector 40/40、queue repository 18/18、database/worker typecheck exit 0；真实 disposable collection/scoring 2 files / 15 tests PASS、18.41s，blocked→caution 零 Score/Factor/Link。无 reset、无生产或 54321/54322 访问。下一步 fresh 全仓验证与 scoped re-review。

**2026-08-28 Phase 7A Task 6（final gate / scoped re-review clean）**：Fix Round 1 后 fresh `pnpm verify` 首轮仅既有 worker SIGTERM spawned-process 用例在全套并发负载下出现 `exit.code=null`；Task 6 与 health files 零 diff，具名用例原样连续 3 次独立通过，代码检查定位为 child 输出 ready 与注册 signal handler 之间的既有窄时序窗口，因此未越界修改无关 health 代码。随后不改 source fresh 重跑完整 verify exit 0：contracts 133 + domain 376 + database 238 + worker 221 + web 140 = 1,108 non-skipped，66 gated skips；lint/typecheck/build/placeholders 全绿。Scoped re-review 判定 prior Critical/Important/2 Minor 全部 Resolved，新增 Critical/Important/Minor 全为 0，Ready to merge: Yes。disposable integration 完成后 SSH session 已显式关闭，`lsof` 确认本机 16432/16433 均无 listener。Task 6 review clean；下一开发任务为 Task 7 `Public security repositories/project projections`，生产仍未访问。

**2026-08-28 Phase 7A Task 7（Step 1 plan/baseline preflight）**：用户已确认继续 Task 7。Controller 复核既有 SDD ledger、approved spec 与计划 Task 7，确认 BASE `0bda9ce`、linked worktree `/Users/xixi/AI中心/AI中心/空投情报网站/.worktrees/phase-7a-security-ledger`、分支 `codex/phase-7a-security-ledger` 均正确且 tracked worktree 干净；Task 1–6 已闭环，Task 7 自身和跨任务 preflight 均无未裁决冲突。精确 Node 22.22.2 / pnpm 11.16.0 下 database 基线为 12 files passed / 9 gated skipped、238 tests passed / 64 gated skipped。下一步按 TDD 编写 `SecurityPublicRepository`、project `securityPosture` 与 immutable-score security composition 的具名 RED；未连接数据库、未 reset、未访问生产。

**2026-08-28 Phase 7A Task 7（strict public repository local GREEN）**：先运行 package focused RED：`pnpm --filter @airdrop/database test -- security-public project-repository project-score-evidence` exit 1，新 public security suite 因缺 `security-public-repository` 模块失败，既有 project suite 同时有 6 个具名失败，准确锁定 `securityPosture` 被省略和 exact current-state select 缺少 `security_posture`。最小实现新增 `SecurityPublicRepository`：只读匿名 `public_blocked_projects` 与 `public_project_security_state`，blocked query 只选 14 个公开字段、按 `(restricted_at desc, project_id desc)` 稳定翻页，raw snake_case row exact-key check 后再过 Task 3 public contract；不回退基础 security/Evidence 表，错误不透传 PostgREST response 文本。`ProjectRepository` 在 current state 与 opportunity 行中映射 `clear|caution|blocked`，factor/citation 继续使用同一 immutable score ID 与 Task 3 security-gated views；新增 tests 锁定 blocked-source 过滤后不回退表读取。focused GREEN 为 13 files / 249 passed / 64 gated skipped；fresh database package test 为 13 files / 250 passed / 65 gated skipped，lint/typecheck 与 `git diff --check` 均 exit 0。真实匿名 PostgREST fixture 已加入并且以四项 integration 环境变量严格门控；本地未配置环境，故未连接数据库、未 reset、未访问生产，controller 后续负责 disposable integration。

**2026-08-28 Phase 7A Task 7（final local gate）**：首轮 `pnpm verify` 的唯一失败是 `apps/web/src/tests/project-detail-loader.test.ts` 的直接 `ProjectDetail` fixture 尚无 Task 7 新必填 `securityPosture`，TS2741；controller 已在 SDD ledger 记录 ruling 并只授权给该 test fixture 补 `securityPosture: 'clear'`，没有 Web production 改动或其他越界文件。随后精确 Node 22.22.2 / pnpm 11.16.0 下 fresh `pnpm verify` exit 0：contracts 133、domain 376、database 250、worker 221、web 140，共 1,120 non-skipped / 67 gated skips；lint/typecheck/build/placeholders 全绿，`git diff --check` exit 0。真实匿名 integration 因本地无 gated environment 继续 skip；未连接数据库、未 reset、未访问生产。

**2026-08-28 Phase 7A Task 7（marker-verified anonymous integration GREEN）**：实现单元在最终提交前因 Git linked-worktree index 权限与随后额度限制退出，源码、测试、文档和完整报告均保留，controller 未改其产品实现。Controller 使用手册指定 SSH key 只读确认唯一目标 `/root/airdrop-governance-test`、project `airdrop-intelligence-governance-test`、healthy DB `64322` / Kong `64321`；首次未指定 key 的 SSH 在认证前以 publickey denial 退出。随后建立精确 `127.0.0.1:16432→64322` / `16433→64321` 隧道，Auth health 通过，本地只读查询返回固定 paused marker `90000000-0000-4000-8000-000000000019 / disposable-integration-database-marker / paused`。未 reset；单文件 `project-repository.integration.test.ts` 真实匿名 PostgREST 集成为 **1 file / 8 tests PASS**（3.58s），覆盖 public security state、blocked list 与既有 project/immutable-score/Evidence read boundary。测试 fixture 自清理；隧道已显式关闭，`lsof` 确认 16432/16433 无 listener。生产与 54321/54322 未访问。下一步原子提交当前不变 diff 并做独立 task review。

**2026-08-28 Phase 7A Task 7（independent review / Fix Round 1 opened）**：Task 7 已原子提交 `3f0e906 feat(database): expose safe public security projections`。独立 task review 对 BASE `0bda9ce..3f0e906` 判定 Needs fixes，0 Critical / 3 Important / 0 Minor；controller 对照 brief、实现和 Security Ledger SQL 确认三项均成立：①修改后的公开 `ProjectRepository` 仍直接信任 PostgREST raw rows 且错误类保留 response message，未满足 parse-before-map / sanitized boundary；②integration `afterAll` 仅删除 `project_sources`，会遗留 projects/source/raw/evidence/signals/scores 等 fixture，且 incident decision 插入失败可绕过局部 finally；③真实集成仅覆盖 project-target block，未覆盖 blocked Evidence source 单条过滤、clear alternative 保留与最后 eligible Evidence 丢失后 whole score/factor-set 消失。下一步 Fix Round 1 先补具名失败回归/覆盖，再做最小修复与 marker-verified disposable 复验；生产仍禁止访问。

**2026-08-28 Phase 7A Task 7（Fix Round 1 local GREEN，待 disposable integration）**：对 `3f0e906` 先新增 6 个具名 unit RED；基线 exit 1，证明机会/详情 raw row 接受额外私有字段、malformed posture 未在统一 strict boundary 失败，且机会/详情/信号三条查询均透传 response 私有文本。最小修复使 `ProjectRepository` 在 camel-case mapping 前对机会和 project-current-state 精确 key、标量/nullability、完整 immutable score group 及 `security_posture` 做运行时校验；三类 query error 只保留稳定 code 与通用安全文案。匿名集成 fixture 扩为两个 exact Source 与 source-target incidents/decisions：封锁第一 source 时只排除其 citation、clear alternative 保留 signal/current score/3 factors；封锁最后 eligible source 后 citations 为空且 current score/factors 全部退出，project posture 仍为 clear。`afterAll` 现 marker-gated，单事务按依赖逆序精确删除 decision/incident、factor/link、Evidence、score、signal、Raw Item、project-source/source/project，并查询每个 fixture relation 的残留；因此 setup failure 也由全局 cleanup 覆盖。Node 22.22.2 / pnpm 11.16.0：database 13 files / 256 PASS、66 gated skips，lint/typecheck/diff check 均 exit 0；fresh `pnpm verify` exit 0（contracts 133、domain 376、database 256、worker 221、web 140，66+2 gated skips，build/placeholder clean）。integration file 无环境时跳过，未连接数据库、未 reset、未访问生产。controller 仍须在 marker-verified disposable 栈执行新 9-test fixture；本实现单元不自行连接。

**2026-08-28 Phase 7A Task 7（Fix Round 1 signal boundary follow-up）**：controller 复核发现 `listProjectSignals` 仍直接把 PostgREST raw row 传入 camel-case mapper。新增具名 RED 以七个合法 selected fields 加私有 `reviewer_note`，基线 exit 1 并错误返回该 signal。最小修复令 signals 在 mapping 前 exact-key/类型解析：`signal_type`、`title`、`summary`、verification enum、finite confidence 与 nullable ISO `occurred_at`/`published_at` 均受约束，既有通用 error 脱敏不变。focused project repository 与完整 database 包均为 13 files / 257 PASS、66 gated skips；lint、typecheck、diff check exit 0。未连接数据库、未 reset、未访问生产，也未创建提交。

**2026-08-28 Phase 7A Task 7（Fix Round 1 citation request split）**：marker-verified integration 的 test-only stable-code rethrow 报出 `ProjectEvidenceCitationQueryError.code=57014`；controller 从 disposable PostgREST/DB 日志确认同一 citation 请求同时取 payload 与 `count=exact`，会分别评估昂贵的 security-aware public-view chain 并触发 statement timeout。无需、且未重新连接数据库。先修改 unit recorder，具名 RED exit 1（5 expected failures）：1,001-row 测试只记录 2 个 combined request、而契约要求每页分别 HEAD exact count 与 ordered/ranged data 共 4 个请求，计数缺失/变更 fixture 也验证了旧路径未消费 count probe。最小实现仅使每页先以相同 `project_id + immutable score ID` filter 请求 `select('project_id', { count: 'exact', head: true })`，再保留既有精确列、排序与 range 数据请求；每页 count consistency、page length、duplicate、strict row parse 和 stable code/通用安全文案不变。focused `project-score-evidence` + `project-repository` 与 database full 均 257 PASS、66 gated skips；database lint/typecheck 与 `git diff --check` exit 0。保留 integration diagnostic rethrow；未 reset、未连接 DB、未访问生产、未提交。controller 应在既有 marker-verified disposable stack 重跑一次 9-test integration 以验证 timeout 避免。

**2026-08-28 Phase 7A Task 7（Fix Round 1 marker-verified integration GREEN）**：citation request split 后 controller 重新通过 Auth 与 disposable marker gate。真实匿名 `project-repository.integration.test.ts` 为 **1 file / 9 tests PASS**，总时长 11.83s（tests 11.39s）；fixture 的 transactional exact-ID residue assertion 通过。未 reset、未访问生产。controller 已关闭隧道，并确认 16432/16433 无 listener；因此 timeout 修复与完整 cleanup 真实覆盖均已验证。未在本记录中创建提交。

**2026-08-28 Phase 7A Task 7（Fix Round 1 final independent review）**：独立复审范围 `3f0e906..7b8c329`，Assessment **Approved**。此前 3 个 Important 全部 Resolved：公开 `ProjectRepository` strict raw-row/error sanitization、transactional exact fixture cleanup 与 source-Evidence security composition 覆盖，以及 accepted 的 signal strict boundary。citation HEAD count/data split 经核对保留分页完整性与 fail-safe handling。新增 Critical / Important / Minor 均为 0。reviewer focused 为 3 files / 53 tests，database lint/typecheck 通过；reviewer 未访问 DB/network。Task 7 Fix Round 1/5：3 addressed、0 open，commits `3f0e906..7b8c329`；**Task 7 complete**。

**2026-08-28 Phase 7A Task 7（fresh root gate）**：Fix Round 1 已提交为 `7b8c329 fix(database): close public security projection review gaps`。Controller 随后在 Node 22.22.2 / pnpm 11.16.0 下 fresh `pnpm verify` exit 0：contracts 133、domain 376、database 257、worker 221、web 140，共 **1,127 non-skipped / 68 gated skips**；lint、typecheck、build、placeholder 全绿。Task 7 保持 review clean / complete；下一任务为 Task 8（authenticated security BFF/routes/browser client）。生产仍未访问。

**2026-08-28 Phase 7A Task 8（Step 1 plan/baseline preflight）**：用户回复“继续”，确认按已呈现的 bounded 设计进入 Task 8。Controller 复核 approved spec、计划 Task 8、既有 failed-AI-review BFF/client 模式、Task 4 `SecurityReviewRepository` 与 Task 7 `SecurityPublicRepository` 接口；candidate/incident GET+POST 路由、fresh bearer/idempotency、409 不自动重试及 public blocked cursor 的职责边界一致，无需新 ruling。现有 linked worktree `/Users/xixi/AI中心/AI中心/空投情报网站/.worktrees/phase-7a-security-ledger` / branch `codex/phase-7a-security-ledger` tracked clean，BASE `a36a9fe`。Node 22.22.2 / pnpm 11.16.0 下 Web 基线为 9 files / 140 tests PASS。下一步生成 Task 8 brief，按 TDD 先写 handler/client RED；未连接数据库、未 reset、未访问生产。

**2026-08-28 Phase 7A Task 8（RED→focused GREEN）**：先新增具名 security handler/client 测试；首次 `pnpm --filter @airdrop/web test -- security-review-handlers security-review-api-client` 按预期 exit 1，两个 suite 均因待建 `security-review-handlers` / `security-review-api-client` module 缺失而失败，既有 140 tests PASS。随后最小实现 authenticated reviewer candidate/incident/indicator routes、public blocked-projects handler及 browser API client；加入 bundle runtime/isolation markers。当前 bundled runtime Node 24.19.0 / pnpm 11.19.0（与声明 Node 22 不同）下 focused handler/client/bundle gate exit 0：11 files / 167 tests PASS；typecheck exit 0。未连接数据库、未 reset、未访问生产。

**2026-08-28 Phase 7A Task 8（Web gates / commit pending）**：在当前 bundled Node 24.19.0 / pnpm 11.19.0 下 full Web test 11 files / 167 tests、lint、typecheck 和 Next 16.3.0 build 均 exit 0；build route manifest 含八条新增 security BFF routes。`git diff --check` exit 0。安全自审确认 browser fixture 含 public auth/client markers，且拒绝 reviewer repository constructor、Postgres、service-role/database env 与 internal projection markers；public blocked route只构造 `SecurityPublicRepository`。未连接数据库/reset/生产。下一步仅尝试指定 atomic commit；Node 22.22.2 exact-runtime revalidation仍是环境 concern。

**2026-08-28 Phase 7A Task 8（commit blocked）**：按指定 `git add … && git commit -m "feat(web): add security review bff"` 尝试提交时，linked-worktree Git 元数据拒绝创建 `/Users/xixi/AI中心/AI中心/空投情报网站/.git/worktrees/phase-7a-security-ledger/index.lock`（`Operation not permitted`）。按任务约束已停止，未尝试任何权限、索引或 worktree 规避；已验证改动仍保留为未提交工作树状态，完整报告见 Task 8 report。

**2026-08-28 Phase 7A Task 8（declared-runtime controller revalidation）**：Controller 使用仓库声明的 Node 22.22.2 / pnpm 11.16.0 完成复验：focused handler/client/bundle 与 full Web 均为 11 files / 167 tests PASS，lint、顺序执行的 typecheck、Next 16.3.0 build、`git diff --check` 全部 exit 0。首次将 typecheck 与 build 并行启动时，build 重建 `.next/types` 导致 typecheck 临时缺失 `routes.js`；随后单独 typecheck 无源码修改即通过，确认是 generated-artifact race，不是实现类型错误。未连接数据库、未 reset、未访问生产。下一步精确暂存并提交 Task 8，再进行独立 code review。

**2026-08-28 Phase 7A Task 8（first independent review）**：实现提交为 `0f303d9 feat(web): add security review bff`。独立审查结论 **Needs fixes**，Critical 0 / Important 3 / Minor 0：candidate manual-submit 与 review endpoint 共用 union receipt schema，未满足 operation-strict response boundary；client/handler 测试尚未覆盖全部操作的 fresh token/key、严格 envelope 与 authenticated malformed body；bundle isolation 尚未显式拒绝 promotion/worker env 名及 `createSecurityPublicRepository`。下一步由原实现代理按 TDD 完成 Fix Round 1 后做 scoped re-review；未连接数据库、未 reset、未访问生产。

**2026-08-28 Phase 7A Task 8（Fix Round 1 RED→GREEN / controller revalidation）**：针对独立审查的三项 Important，先在精确 Node 22.22.2 / pnpm 11.16.0 下新增 cross-kind candidate receipt、非法 manual state、五条 mutation authenticated malformed body、九个 client operation strict-envelope/fresh-token、五个 mutation fresh-key/typed-409 no-retry 与 promotion/worker/server-constructor bundle marker 覆盖。focused RED exit 1：2 failed / 181 passed，manual submit 错接 review receipt、handler union schema 均错误接受对方 receipt。最小修复拆分 manual/review success schemas，manual state 使用 shared candidate-state schema，并将 client receipts 收紧为精确类型。实现代理 GREEN 后，Controller 顺序复验 focused/full Web 均为 11 files / 189 tests PASS，lint、typecheck、Next 16.3.0 build、`git diff --check` 全部 exit 0。未访问 DB/network/reset/production；下一步提交 Fix Round 1 并做 scoped re-review。

**2026-08-28 Phase 7A Task 8（Fix Round 1 scoped re-review）**：修复提交为 `db05026 fix(web): tighten security review boundaries`。原独立审查代理复核 `0f303d9..db05026`，三项 Important 全部 **Resolved**：manual/review operation-specific strict receipts、九个 client operation / 五个 mutation / authenticated malformed-body 覆盖，以及 promotion/worker/两类 security repository constructor bundle isolation。新增 Critical / Important / Minor 均为 0，Assessment **Approved**。下一步 fresh 全仓 `pnpm verify`；未连接数据库、未 reset、未访问生产。

**2026-08-28 Phase 7A Task 8（fresh root gate / COMPLETE）**：Node 22.22.2 / pnpm 11.16.0 下 fresh `CI=true pnpm verify` 完整 exit 0：contracts 133、domain 376、database 257、worker 221、web 189，共 **1,176 non-skipped / 68 gated skips**；lint、typecheck、build、placeholder 全绿。首次验证仅在依赖状态检查阶段因 sandbox DNS 阻断而 exit 1，尚未进入门禁；获准重跑后固定依赖全部从缓存复用（196 reused / 0 downloaded），随后完整通过。Task 8 review clean / complete；八条 security BFF routes、strict browser client 与 bundle isolation 已进入本地 Phase 7A 分支，未连接数据库、未 reset、未访问生产。下一任务是 Task 9：构建完整 reviewer security workflow UI。

**2026-08-29 Phase 7A Task 9（plan/baseline preflight）**：用户“继续下一步”确认执行已批准的 Task 9 bounded reviewer-security UI。Controller 复核 plan/spec、现有 `/review` shell/session、pending-action gate、safe-review-text、Task 8 security API client 与四个新页面的集成边界；linked worktree `codex/phase-7a-security-ledger` / BASE `ada09c6` tracked clean。Node 22.22.2 / pnpm 11.16.0 下 Web baseline 为 11 files / 189 tests PASS。两项最小 ruling 已写入 SDD ledger：允许修改共享 `review-browser-runtime.ts` 以由一个 session 复用两个 review clients；由于现有 protected read model 只有 indicator IDs、没有 disclosure version，披露表单要求审核员显式输入当前版本，严禁猜测、自动递增或冲突后替换。后者代价是保守的 reviewer UX，自动展示版本需未来单独扩展后端读模型。未连接 DB/network、未 reset、未访问生产。

**2026-08-29 Phase 7A Task 9（brief / implementation dispatch）**：已从 approved plan 精确生成 90-line `task-9-brief.md`，并由 fresh Task 9 实现代理在 BASE `ada09c6` 上执行。范围仅含七个 reviewer security components、四个 pages、review shell、最小 shared runtime integration、单一 component test、workbook/HANDOVER；要求先具名 RED、再最小 GREEN，依次跑 Web test/lint/typecheck/build/diff check。实现代理不得派生 subagent/reviewer，不得访问 DB/network/reset/production；controller 后续独立复验并派发 task-scoped reviewer。

**2026-08-29 Phase 7A Task 9（component RED）**：在精确 `PATH=/tmp/airdrop-node22-pnpm/bin:$PATH CI=true` 下运行 `pnpm --filter @airdrop/web test -- security-review-components`，exit 1；新增 suite 被发现但因待建 `security-candidate-detail` 模块无法导入，0 个新测试执行、1 个预期失败 suite，既有 11 files / 189 tests PASS。RED 直接证明 Task 9 目标组件尚不存在；测试已锁定 inert untrusted text、filters/cursors、manual Evidence-only target、candidate command payload、immutable incident history/high-impact confirmation、explicit disclosure version、409 one-reload/no-retry 与 revoked-session behavior。未连接 DB/network、未 reset、未访问生产。

**2026-08-29 Phase 7A Task 9（focused component GREEN）**：最小实现七个 security reviewer components、四个 `/review/security` pages、shell navigation 和共享 browser runtime 的 `securityApi`；session 在两个 API client 间复用。精确 focused 命令 `PATH=/tmp/airdrop-node22-pnpm/bin:$PATH CI=true pnpm --filter @airdrop/web test -- security-review-components` exit 0，12 files / 200 tests PASS。候选、来源、摘要、备注和指标自由文本均经既有 `displayReviewValue` 作为 inert text；只有受 schema 约束的 UUID 形成内部导航。candidate/incident/disclosure mutations 使用 pending gate，409 仅刷新一次且显示“安全记录已更新，请检查最新版本后重新提交。”，401/403 都先清 reviewer session。披露 version 仍显式输入、从不推导或替换。未连接 DB/network、未 reset、未访问生产；下一步执行完整 Web 门禁。

**2026-08-29 Phase 7A Task 9（final Web gates）**：Node 22.22.2 / pnpm 11.16.0，`PATH=/tmp/airdrop-node22-pnpm/bin:$PATH CI=true` 下 focused `security-review-components` 12 files / **201 tests PASS**；full Web 12 files / **201 tests PASS**；`pnpm --filter @airdrop/web lint`、顺序 `typecheck`、Next 16.3.0 `build` 均 exit 0，build route manifest 包含 `/review/security`、manual candidate、candidate detail 和 incident detail。`git diff --check` exit 0。最后新增测试锁定 pending gate 已拥有请求时不会调用第二次 candidate mutation。未连接 DB/network、未 reset、未访问生产；下一步只按 brief 尝试一次 atomic commit。

**2026-08-29 Phase 7A Task 9（commit blocked）**：所有 gates 后只执行一次指定 atomic `git add … && git commit -m "feat(web): add security reviewer workflow"`；linked-worktree index 在 `git add` 创建 `/Users/xixi/AI中心/AI中心/空投情报网站/.git/worktrees/phase-7a-security-ledger/index.lock` 时返回 `Operation not permitted`。已立即停止，未作权限、索引或 worktree 规避，也未作第二次尝试；产品改动保持 unstaged。完整报告：`.superpowers/sdd/2026-08-26-phase-7a-security-incidents-indicators/task-9-report.md`。

**2026-08-29 Phase 7A Task 9（controller revalidation）**：Controller 在声明运行时 Node 22.22.2 / pnpm 11.16.0 下重新顺序执行 focused component、full Web、lint、typecheck、Next build 与 `git diff --check`；结果仍为 12 files / 201 tests PASS，所有静态与构建门禁 exit 0，四条 `/review/security` 页面路线均进入 build manifest。静态复核同时把“高影响命令的确认摘要是否真正锁住提交按钮”列为独立评审重点；controller 未提前修改实现。未连接 DB/network、未 reset、未访问生产；下一步创建稳定初版提交并派发 task-scoped review。

**2026-08-29 Phase 7A Task 9（independent review / Fix Round 1 opened）**：Task 9 初版已提交为 `6a87a24 feat(web): add security reviewer workflow`。独立评审对 `ada09c6..6a87a24` 判定 `NEEDS_FIXES`：1 Critical / 1 Important / 0 Minor。Controller 对照实现与计划确认两项均成立：① candidate accept/open/attach、incident adjust/attach/resolve/reopen 与 indicator publish/withdraw 都只展示或完全缺少确认信息，提交按钮未由 affirmative confirmation 状态锁住；② `accept_and_attach` 未加载既有 incident，却把 hardcoded “无”当前处置与无关 draft 默认类别/严重性/摘要展示为确认上下文，不能作为可信安全确认。评审同时要求补齐真实交互门禁、attach incident context、disclosure visible target/context、401/403、duplicate/inert text 与版本边界回归。下一步由原实现代理按 TDD 修复，controller 不直接改产品代码；仍禁止 DB/network/reset/production。

**2026-08-29 Phase 7A Task 9 Fix Round 1（confirmation RED→GREEN）**：先新增 9 个 focused regressions；精确 `PATH=/tmp/airdrop-node22-pnpm/bin:$PATH CI=true pnpm --filter @airdrop/web test -- security-review-components` RED exit 1，20 tests 中 4 failed / 205 passed，直接复现未确认 candidate high-impact command 仍写入、attach 可手填 target/version、incident/disclosure 初始 submit 未 disabled、陈旧确认快照仍写入。最小修复将高影响 command 的确认建模为 affirmative snapshot：任一命令字段编辑、attach ID 变更或上下文重新加载均清空确认；submit helper 也重复门禁，不能被 UI 外调用绕过。attach 通过 protected `getIncident` load 后，严格以读取到的 target/incidentVersion/current state/posture/category/severity/public summary 构建与展示；未加载/not-found/failed/401/403 都不能确认或提交，权限返回等待清 session。open 诚实显示当前处置未由此视图建立；disclosure 可见 indicator ID + 显式版本，并以“不适用/未暴露”显示非 command 字段。focused GREEN exit 0，12 files / 210 tests PASS；未连接 DB/network、未 reset、未访问生产。

**2026-08-29 Phase 7A Task 9 Fix Round 1（final Web gates）**：在同一精确 PATH/CI、Node 22.22.2 / pnpm 11.16.0 下 full Web 为 12 files / 210 tests PASS；lint、顺序 typecheck、Next 16.3.0 build 和 `git diff --check` 均 exit 0，四条 `/review/security` 页面路线仍在 build manifest。改动保留 unstaged，未提交（controller 负责提交）；未连接 DB/network、未 reset、未访问生产。

**2026-08-29 Phase 7A Task 9 Fix Round 1（attach posture follow-up / controller revalidation）**：Controller 静态复核发现 attach 确认的“拟议处置”仍是动作描述而非处置值；实现代理先新增具名 RED，再改为从已加载 protected incident 显示 `{currentPosture}（保持不变）`，不再以“附加指标”冒充 posture。最终 Controller 使用 Node 22.22.2 / pnpm 11.16.0 顺序复跑 focused、full Web、lint、typecheck、Next build 和 diff check：12 files / **211 tests PASS**，全部 exit 0；四条 reviewer-security 页面路线仍在 build manifest。未连接 DB/network、未 reset、未访问生产；下一步提交 Fix Round 1 并 scoped re-review。

**2026-08-29 Phase 7A Task 9（Fix Round 1 scoped re-review / Fix Round 2 opened）**：Fix Round 1 已提交为 `b791210 fix(web): require security command confirmation`。同一独立 reviewer 对 `6a87a24..b791210` 确认原 Critical 与 Important 均 Resolved，但发现 2 个新 Important、0 Critical/Minor，结论仍为 `NEEDS_FIXES`。Controller 技术确认两项成立：① candidate/incident confirmation snapshot 未绑定 authoritative aggregate version/context；409 reload 后 child checkbox state 可保留，而命令构建从新 props 自动取得新 expected version，违背“检查最新版本后重新确认”与禁止自动替换版本；②确认面板把 contract-validated `source · UUID` 目标交给 free-text secret sanitizer，因 literal `source` 命中敏感词而整段隐藏，审核员无法确认目标。下一步 Fix Round 2 以 RED 锁定 aggregate refresh invalidation 与 source target visible-inert rendering，再最小修复；仍禁止 DB/network/reset/production。

**2026-08-29 Phase 7A Task 9 Fix Round 1（attach posture follow-up RED→GREEN）**：对 controller 指出的同一 Important 只补一项：accept-and-attach confirmation 的拟议处置必须是已加载 incident 的真实姿态，而非动作说明。focused RED：`security-review-components` 22 tests / 1 failed / 210 passed，缺少 confirmation mapping，无法显示 `caution（保持不变）`。最小修复抽出 `candidateConfirmationValues` 并让 attach 的 `proposedPosture` 取 protected incident `currentPosture ?? 已解决` 后明确标注“保持不变”；其余 target/version/context/confirmation logic 未变。focused/full Web 均 12 files / **211 tests PASS**，lint、顺序 typecheck、Next 16.3.0 build 与 `git diff --check` 均 exit 0；未提交、未连接 DB/network、未 reset、未访问生产。

**2026-08-29 Phase 7A Task 9 Fix Round 2（authoritative confirmation / literal target RED→GREEN）**：先新增 4 个 focused regressions；精确 `PATH=/tmp/airdrop-node22-pnpm/bin:$PATH CI=true pnpm --filter @airdrop/web test -- security-review-components` RED exit 1，12 suites 中 1 failed / 11 passed、3 failed / 212 passed。失败精确证明 candidate stateVersion 与 incident version/current context 变化后旧 affirmative snapshot 仍可触发 mutation，且 conflict 没有清 confirmation 的纯状态转换；新增 source target + hostile free-text test 作为安全渲染回归。最小修复令 candidate confirmation 同时快照 candidateId/stateVersion，incident confirmation 同时快照完整受保护 incident（ID、version、target、posture、category、severity、public summary）；组件与 helper 双重 equality gate 阻止 refresh 后借新 prop 替换 expected version。candidate/incident/disclosure conflict result 都立即清 checkbox confirmation，disclosure draft 中审核员输入的 version 保持原值且不推导/重试。共享 confirmation Metadata 仅对已验证/生成的 target、posture、severity、category、reason 与 Evidence ID 走 literal inert text；公开摘要仍经 `displayReviewValue`。focused/full Web 为 12 files / **215 tests PASS**；lint、顺序 typecheck、Next 16.3.0 build 均 exit 0。未连接 DB/network、未 reset、未访问生产，未提交；下一步 `git diff --check` 与 controller 复核。

**2026-08-29 Phase 7A Task 9 Fix Round 2（literal boundary follow-up RED→GREEN）**：自审确认 confirmation 的 target/Evidence input 在 command schema 成功前仍可来自编辑框，不能仅因调用方把字段标记 literal 就直接展示。新增 focused RED：`security-review-components` 1 failed / 215 passed，明确 URL target 与 Bearer Evidence 字符串被 literal 渲染。最小修复在 shared Metadata 的 literal 分支再要求精确 UUID、`project|source · UUID`、已知 contract enum 或固定 generated disclosure/context 文案；其余一律回退 `displayReviewValue`。有效 source target 继续可见，hostile target/Evidence/public-summary 仍 inert/hidden。最终 focused/full Web 均为 12 files / **216 tests PASS**，lint、顺序 typecheck、Next 16.3.0 build 均 exit 0；未连接 DB/network、未 reset、未访问生产、未提交，待 diff check/controller 复核。

---

## 9. 其他

- Git 分支：主开发线 `codex/phase-0-1-foundation` 已含 Phase 0–6B Task 1–8；Phase 6B 通过双父提交 `3c96edf` 合并，合并后主线 `pnpm verify` 全绿。`.worktrees/phase-6b-failed-ai-review` 仍含未跟踪 `.DS_Store`，本轮未替用户删除，故未强制移除该 worktree；既有 Phase 2 / 6A worktree 清理说明见 §8.3。
- dev server / worker 是否仍在运行不作为持久状态；每次接手都按 §4 重新确认并从当次日志判断
- 历史决策细节（为什么这样做）：`docs/superpowers/specs/` 与 `docs/superpowers/plans/` 下的设计文档；Phase 6A 的逐任务 RED/GREEN 证据在 `docs/tasks/canonical-intelligence-governance-workbook.md`
- DeepSeek 计费注意：130 次真实抽取消耗约 62 万 prompt tokens（每输入截取 12K 字符上限）；批量跑前评估成本
- 隔离测试栈（Phase 6A 起长期存在）：远程 ECS 上第二个 Supabase 项目 `airdrop-intelligence-governance-test`（db `64322` / Kong `64321`，workdir `/root/airdrop-governance-test`，CLI `./cli/node_modules/.bin/supabase` v2.112.0）。本地隧道 `16432 → 64322`、`16433 → 64321` 跑真实集成测试。**只允许对它 reset**，生产栈（54322/54321）绝不 reset
- 交接时的数据库快照（2026-08-14，未含 Phase 6A 变化）：16 迁移已应用；14 项目（12 demo + Ethereum + novanet 等实为 13 项目含 novanet + Ethereum）；raw_items 23；discovered_items 131；ai_runs 131（130 Phase 3 + 1 Phase 5 编排验证）；extraction_candidates 7（全 promoted）；signals 20（demo + 6 Ethereum 真实 + 1 novanet 编排验证）；project_scores 26 行（12 项目含历史版本行）；score_factors 117；score_signal_links 已建。novanet 的 `airdrop_season_announcement` 信号及其评分（74.8/40/27 watch）是 Phase 5 端到端验证产物，内容为合成测试数据。2026-08-22 Phase 6A 门禁上线后的短暂隐藏已通过 demo 补证与 7 条历史对账恢复，实际结果见 §8.2

**2026-08-29 Phase 7A Task 9 Fix Round 2（candidate detail targetContext literal follow-up）**：candidate detail 现仅将 contract-generated candidate ID、origin/state/indicator-type enums、formatted timestamp、Evidence UUID、typed target 与 generated extraction targetContext 标记为 literal；其中 targetContext 必须精确匹配 `提取上下文 · project UUID · source UUID`，其余字段仍走 `displayReviewValue`。新增 source-target 和 extraction-context 渲染回归，同时保持 hostile summary/note/indicator value 隐藏。首次 UI regression 为 29/29 PASS（当前 sanitizer 未实际隐藏合法 UUID 形式），故未虚报为 RED；随后 exact-literal validator regression 按预期 RED：12 suites、1 failed / 218 passed（validator 尚未提供）。最小实现后 focused/full Web 均为 12 files / 219 tests PASS，lint、typecheck、Next 16.3.0 build 与 `git diff --check` 均 exit 0。未访问 DB/network/reset/production，未提交；共享 worktree 的既有未暂存 Fix Round 2 改动均保留。

**2026-08-29 Phase 7A Task 9（candidate enum literal self-review follow-up）**：最终自查发现 indicator type 已被 candidate detail 标记 literal、却未列入 exact validator。新增 `domain` enum assertion取得 focused RED：12 suites、1 failed / 218 passed；最小把六个 contract indicator-type enum 加入 candidate-only literal allowlist，未扩展任何 free-text 路径。focused/full Web 12 files / 219 tests、lint、typecheck、Next 16.3.0 build 和 `git diff --check` 均 exit 0；未访问 DB/network/reset/production，未提交。

**2026-08-29 Phase 7A Task 9（literal-rendering correction）**：Controller 复核 `safe-review-text.ts` 后确认先前 finding 不成立：规则只匹配 `source body`（含空格、下划线或连字符）而非 bare `source`；此前 source-target 与 extraction-context UI regressions 在任何 literal 代码之前已通过。依简洁性准则，已删除 candidate detail/confirmation 的 literal 分支、exact-validator/export、相关 regex/allowlist 与只约束该分支的测试；保留 source target、extraction context 可见且 hostile candidate/confirmation free text 隐藏的行为回归，以及 authoritative aggregate snapshot/409 confirmation-clear Fix Round 2 实现和测试。最终 focused/full Web 为 12 files / 217 tests PASS，lint、typecheck、Next 16.3.0 build、`git diff --check` 均 exit 0；未访问 DB/network/reset/production，未提交。

**2026-08-29 Phase 7A Task 9 Fix Round 2（controller final Web revalidation）**：Controller 使用精确 Node 22.22.2 / pnpm 11.16.0 顺序重跑 focused component、full Web、lint、typecheck、Next build 与 diff check：12 files / **217 tests PASS**，所有命令 exit 0，四条 reviewer-security 页面路线仍在 build manifest。最终 production diff 仅保留 authoritative aggregate snapshot 与 409 clear-confirmation 行为；source/extraction target visible 与 hostile free-text inert 由行为测试覆盖，但不保留不必要的 literal allowlist。未连接 DB/network、未 reset、未访问生产；下一步提交 Fix Round 2 并 scoped re-review。

**2026-08-29 Phase 7A Task 9（Fix Round 2 scoped re-review — APPROVED）**：Fix Round 2 提交为 `70e8ebc fix(web): bind security confirmations to versions`。同一 reviewer 对 `b791210..70e8ebc` 确认 aggregate-version finding **Resolved**：candidate confirmation 绑定 candidateId/stateVersion 与完整 attached incident，incident confirmation 绑定完整 protected incident；UI/helper 均拒绝陈旧 aggregate，409 后 candidate/incident/disclosure 清确认而 disclosure 人工版本保持不变。source-target finding 经 reviewer 重新核对 `safe-review-text.ts` 后正式判为 **DISPROVEN**，行为测试确认 source/extraction target 可见、hostile free text 隐藏。新增 Critical/Important/Minor 均为 0，最终 Assessment **APPROVED**。下一步 fresh 根 `pnpm verify`；仍未连接 DB/network/reset/production。

**2026-08-29 Phase 7A Task 10（plan/baseline preflight）**：用户指定从 `codex/phase-7a-security-ledger` 的 Task 9 收口提交 `7292903` 接续执行已批准的 Task 10。复核 approved spec §3/§5 与 plan Task 10 步骤，并核对 Task 7 产出的 `SecurityPublicRepository`、`packages/database/src/index.ts` 导出、Task 8 的 `/api/v1/security/blocked-projects` 路由与现有 `opportunity_list` / `project_current_state` 视图定义后确认：`opportunity_list` 已在数据库层排除 `security_posture = 'blocked'`，`project_current_state` 仍保留 blocked 项目供详情访问，因此首页统计与普通 tab 天然使用受安全过滤的数据源，Task 10 只需保证 blocked tab 改由 `public_blocked_projects` 提供、且详情安全呈现来自同一原子读。linked worktree tracked clean；Node 22.22.2 / pnpm 11.16.0 Web baseline 为 12 files / 217 tests PASS。未连接 DB/network/reset/生产。

**2026-08-29 Phase 7A Task 10（public rendering/query RED）**：测试先行新增 `apps/web/src/tests/security-elements.test.ts`（19 个用例），并扩展 `project-detail-loader.test.ts`（3 个用例）与 `project-score-evidence.test.ts`（2 个新增用例）。精确 `PATH=/tmp/airdrop-node22-pnpm/bin:$PATH CI=true pnpm --filter @airdrop/web test -- security-elements project-detail-loader project-score-evidence` RED exit 1：3 failed files / 4 failed tests / 215 passed——新 suite 因 `Cannot find module '../components/security-elements.js'` 0 个用例执行；loader 两个具名失败证明结果缺少 `security` 字段与并行安全读；两个历史快照标注失败证明 `historical` 尚未实现。未写任何生产代码。

**2026-08-29 Phase 7A Task 10（local GREEN）**：新增 `apps/web/src/components/security-elements.tsx`（`SecurityPostureBadge`、`ProjectSecurityBanner`、`SafeSecurityIndicatorText`、`BlockedProjectRow/Table`、`blockedProjectsPageHref`、`OfficialWebsiteLink` 与类别/严重度/指标类型本地化）；`project-detail-loader` 改为接收 `SecurityPublicRepository`，在捕获不可变 `scoreId` 后与 signals/factors/citations 并行读取 `getProjectSecurity` 并返回 `security`，保证后续评分读无法改写快照；`opportunity-queries` 新增 `listBlockedProjects`；机会页新增 `blocked` tab 并只在该 tab 走 `public_blocked_projects` 游标，其余 tab 仍走 `listOpportunities`；详情页 warning-first 渲染横幅、blocked 时把因子/证据标为历史快照并以 `OfficialWebsiteLink` 停用官网外链；首页补充“被封锁项目不计入统计”与封锁视图入口。focused 与 full Web 均 13 files / 239 tests PASS，lint、顺序 typecheck、Next 16.3.0 build、`git diff --check` 全 exit 0。未连接 DB/network/reset/生产。

**2026-08-29 Phase 7A Task 10（fresh root gate / COMPLETE）**：Node 22.22.2 / pnpm 11.16.0 下 `PATH=/tmp/airdrop-node22-pnpm/bin:$PATH CI=true env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm verify` 一次 exit 0：contracts 133、domain 376、database 257（66 gated skips）、worker 221（2 gated skips）、web 239，共 **1,226 non-skipped / 68 gated skips**；lint、typecheck、全部 workspace tests、build 与 placeholder 检查全绿，`git diff --check` exit 0。已知环境要点：本机 shell 的 `NODE_OPTIONS` 含 `--use-system-ca`，Next 16 Turbopack worker 会因此以 `ERR_WORKER_INVALID_EXEC_ARGV` 中止，故 build/verify 必须以 `env -u NODE_OPTIONS` 运行。Task 10 本地完成，已以 conventional subject `feat(web): expose public security posture` 原子提交 `5258ca8`（未包含主工作区 `.DS_Store` 或任何其他用户文件）。生产未访问、未 reset、未应用迁移。

**2026-08-29 Phase 7A Task 10（independent review — NEEDS_FIXES，0C/3I/3M）**：对 `7292903..5258ca8` 的静态复审（不连库、不 reset、不访问生产）判定 Needs fixes。**I-1**：`ScoreFactorGroups` 把历史快照提示语作为 `.score-factor-groups`（`display:grid` / `repeat(3, minmax(0,1fr))`）的第一个直接子元素，四个 grid item 使提示语退化为窄列、置信度轴换行，每个 blocked 详情页因子布局错乱；**I-2**：caution 在机会行只以 `.project-cell-meta`（12px / `--ink-500`）灰色后缀 `· 谨慎` 呈现而非 badge，违反计划 Step 4「Render caution as a badge and warning without reordering」，且已导出的 `SecurityPostureBadge` 未被行复用；**I-3**：新 blocked tab 把未校验的 `params.after` 直接送进 `blockedProjectSecurityListQuerySchema.parse`，`?tab=blocked&after=xyz` 抛 `ZodError` 并 500，违反 AGENTS「validate untrusted values at boundaries」（普通 tab 的同类行为属既有问题，非本任务回归）。Minor：M-1 blocked 表格断言 `not.toContain('http://')` 与「URL 形指标按惰性文本渲染」用例自相矛盾，合法 `url` 指标会误报；M-2 同一 payload 的 `project.securityPosture` 与 `security.posture` 未声明权威性；M-3 测试文件少一个空行。报告见 gitignored `.superpowers/sdd/2026-08-26-phase-7a-security-incidents-indicators/task-10-review.md`。

**2026-08-29 Phase 7A Task 10 Fix Round 1（RED→GREEN）**：先补 3 个具名 RED：提示语索引必须小于 grid 起始索引（RED 实际 `expected 68 to be less than 5`，直接证明提示语在容器内）、机会行必须含 `badge warn`（RED 缺失）、`blockedCursorFromQuery` 需接受合法游标并拒绝 `xyz`/`../etc/passwd`/空串/尾空格（RED 因缺模块失败）。最小修复：以 Fragment 把提示语移出 grid 容器；`SecurityPostureBadge` 与标签/类名迁至 `opportunity-elements.tsx`（与 `RecommendationBadge`/`LifecycleBadge` 同处，依赖保持单向 `security-elements → opportunity-elements`，无循环）；新增 `blockedCursorFromQuery` 用 `safeParse` 在页面边界把非法游标降级为首屏（仓库层严格校验未放宽）；表格断言改为 `href="http`/`href="//` 并新增「URL 形公开指标渲染为惰性文本且无 anchor」正向用例；loader 加 JSDoc 声明 `security.posture` 为唯一呈现来源。focused/full Web 13 files / 242 tests PASS，lint、顺序 typecheck、Next build、`git diff --check` 均 exit 0；提交 `54cda0a`。

**2026-08-29 Phase 7A Task 10 Fix Round 1（scoped re-review — APPROVED）**：复审 `5258ca8..54cda0a` 判定六项发现全部 Resolved，新增 0 Critical / 0 Important / 3 Minor，Assessment **APPROVED**。三项 Minor 当轮闭环：`blockedCursorFromQuery` 由组件文件迁至 `apps/web/src/lib/security-cursor.ts`（AGENTS 要求业务逻辑不留在 React 组件）；泄漏源码扫描扩展覆盖迁走的 `opportunity-elements.tsx`；grid 回归补断言「grid 内容恰有 3 个 `<section>` 且不含提示语」。提交 `72a41b7`。

**2026-08-29 Phase 7A Task 11 Step 1-2（Golden Dataset RED→GREEN）**：新增 `apps/worker/src/ai/fixtures/security-extraction-golden.ts`（11 个具名用例）与 `apps/worker/src/ai/tests/security-extraction-golden.test.ts`。用例覆盖明确钓鱼域名、恶意合约/交易哈希、钓鱼 URL、否定表述、已结案历史事件、错实体、prompt injection、locator 偏移（千分位逗号）、冲突证据、虚构引用，以及「模型试图把 canonical `posture`/`incidentId` 塞进候选载荷」。全部经真实 `runExtractionOnce` + 记录型 repository 运行，断言 `claimTypes`、`groundedCount`、canonical 字段计数恒为 0，并对注入用例断言注入指令文本不进入任何候选载荷；冲突证据用例断言两条互相矛盾的逐字引文都被保留且不静默覆盖。**变异检验**：临时把 `filterGroundedCandidates` 改为接受全部候选后，5 个新用例（negated-scam / wrong-entity / prompt-injection / locator-mismatch / invented-reference）与 2 个既有用例一并失败，证明负例确有鉴别力；随后按备份逐行还原，`git diff` 为空。worker 由 221 → **235 tests**，lint/typecheck exit 0。

**2026-08-29 Phase 7A Task 11 Step 4（runbook）**：`docs/runbooks/local-development.md` 新增「Security incidents and indicators (Phase 7A)」章节：审核人供给/撤销（`public.user_roles` 追加式授予与 `revoked_at` 撤销，禁删行）、`/review/security` 登录与候选/事件/披露工作流（显式版本输入、高影响确认绑定权威 aggregate 版本、409 清确认）、12 条稳定错误码对照表（AS101–AS199 含 AS104/111/112）、blocked source 队列行为（typed `security_blocked` 终态、不重试、整份 score 门禁）、focused disposable 命令（含新 Golden 测试）、追加式恢复（禁止删改历史行）、生产 rollout 排除声明。未写入任何凭据或生产命令。

**2026-08-29 Phase 7A Task 11 Step 5（秘密/不安全字段扫描 + 全仓门禁）**：对 `apps/web/src`、`packages/contracts/src/security`、`packages/database/src/security` 扫描 `service_role|DATABASE_URL|reviewer_user_id|internal_note|evidence_locator|candidate_payload`，共 4 处命中并逐条人工分类：`lib/server-env.ts:13` 为 `import 'server-only'` 的服务端边界，唯一消费方是带 `createAuthenticatedUserVerifier` 的 admin Route Handler；其余 3 处均在 `review-session.test.ts` / `review-client-bundle.test.ts` 中，属显式泄漏拒绝测试与 bundle 断言。**无缺陷**，`packages/database/src/security` 与 `packages/contracts/src/security` 零命中。随后精确 Node 22.22.2 / pnpm 11.16.0 下 `pnpm verify` 一次 exit 0：contracts 133 + domain 376 + database 257 + worker **235** + web 242 = **1,243 non-skipped / 68 gated skips**；lint、typecheck、build、placeholder 与 `git diff --check` 全绿。Step 1/2/4/5 以 `942ee9f test(security): add phase 7a golden dataset and runbook` 提交。

**2026-08-29 Phase 7A Task 11 Step 3（disposable 集成矩阵 — 用户显式授权后执行完毕）**：授权后按 §5/§8.2 远程规程执行。① **fail-closed 预检全部精确匹配**：`/root/airdrop-governance-test`、project `airdrop-intelligence-governance-test`、DB/Kong 容器 healthy 且只有 `supabase_db_airdrop-intelligence-governance-test` 绑 64322、`supabase_kong_airdrop-intelligence-governance-test` 绑 64321、22 migrations、seed SHA `f1ceaddccd7bfdd5` 本地/远端一致、013 SHA `411cb917f0b3ac72` 本地/远端一致、迁移聚合 SHA `869a191ce883221c` 本地/远端一致、paused marker 精确存在。**因远端与本地字节一致，未复制任何文件**。② 以容器名双重白名单脚本经 SSH 推导 4 个集成变量，值只写入本地 `/tmp/airdrop-7a-test.env`（umask 077 / chmod 600，远程无临时副本），全程未打印。③ 隧道 `127.0.0.1:16432→64322`、`127.0.0.1:16433→64321` 精确 IPv4 绑定；`/auth/v1/health` 200；并以「隧道 PostgREST 与远端 `docker exec psql` 查询 `opportunity_list` 均为 5 行」交叉证明隧道终止于 disposable 库；54321/54322 自始至终无监听。④ pinned `./cli/node_modules/.bin/supabase db reset --yes`（CLI 2.112.0）exit 0，22 migrations + seed + 重启完成，marker 精确恢复。⑤ **full pgTAP 13 files / 1,338 tests / PASS**。⑥ **集成矩阵 9 files / 66 tests / PASS**（131.8s），覆盖 project-repository 匿名安全投影、source-collection 阻断/竞态、durable-queue、schedule-command、scoring 门禁、Promotion 门禁、failed-ai-run-review、security-review 双会话/撤销角色、security-candidate-ingress。

**2026-08-29 Phase 7A Task 11 Step 3（fixture 清理缺陷与修复）**：清理校验发现 `security_review_commands` 与 `security_events` 的 teardown 只按 candidate/incident 聚合删除，漏掉 **indicator** 聚合，首次矩阵后残留 2 条命令回执 + 3 条事件。先加具名 RED（按自有聚合断言零残留，RED 实际报 `fixture_aggregate_residue:{"security_review_commands":2,"security_events":3}`），再最小修复两处过滤改用 `aggregateIds`。**注意第一版断言有实现缺陷**：它位于清理事务内部，失败会回滚整个清理；且按共享 fixture project id 过滤会在完整矩阵里误判——第二次矩阵因此反而留下更多残留（5 incidents / 7 candidates / 21 outbox）。已改为**在事务提交之后**用 `owner` 连接断言，且只覆盖本套件自有的随机 UUID 聚合；随后 reset 回干净基线重跑，矩阵 66/66 且清理后 `projects=4 / opportunity_list=2 / 全部安全表与 outbox = 0`，与 seed 基线一致。提交 `7dd3ee9`。

**2026-08-29 Phase 7A Task 11 Step 6（收口独立复审 — NEEDS_FIXES，0C/2I/4M）**：复审 `14cf1ca..7dd3ee9`。**I1** runbook 错误码表把 AS104/AS111 的运维语义写反了：据 migration `3331`（AS111 = `security_risk`/`scam_indicator` 候选走普通 Promotion 或安全路由函数被拒）与 `3354`（AS104 = caution 目标由无安全角色的 reviewer 批准，或受保护命令无有效安全角色），原表会让运维走错分支；**I2** `prompt-injection` 用例的注入断言空转（grounded=0 → `insertedPayloads` 为空 → 循环 0 次）。Minor：负例断言恒真、`assertNoFixtureAggregateResidue` 覆盖窄于 teardown 影响面且注释与 randomUUID 事实矛盾、runbook 混淆 `security_blocked`（collector 结果）与 `source_security_blocked`（队列取消码）并把 command operation 写成 RPC、文档仍记 Step 3「待授权」。

**2026-08-29 Phase 7A Task 11 Fix Round（全部闭环）**：I1 按 migration 逐条校正 AS102/AS104/AS111 运维含义；I2 把注入用例改为「注入成功产出 grounded 候选」这一更强形态（引文取原文安全片段，grounded=1），并新增独立用例显式断言 `insertedPayloads.length > 0` 后再校验注入文本缺席——**变异检验**：把注入文本写入模型 summary 后 2 个用例失败，证明断言非恒真，随即还原；M1 在 runner 增加 `processed === 1` 与安全终态（`succeeded`/`grounding_failed`/`schema_invalid_after_repair`）断言，消除负例空转；M2 把残留断言扩到 commands/events/outbox/incidents/candidates 并覆盖全部自有随机 UUID 聚合，注释改为与 randomUUID 一致；M3 区分 collector `security_blocked` 与队列 `source_security_blocked`、把 `set_indicator_disclosure` 明确为 command operation。修复后重开隧道复跑：focused security-review 7/7、**完整矩阵 9 files / 66 tests / PASS**，清理后回到 seed 基线（4 projects / 2 opportunity_list / 全部安全表与 outbox = 0），marker 完好；隧道已关闭、54321/54322 全程无监听、凭据文件删除。提交 `d38f9af`。

**2026-08-29 Phase 7A Task 11（final gate）**：`PATH=/tmp/airdrop-node22-pnpm/bin:$PATH CI=true env -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED pnpm verify` 首次因 worker 既有 SIGTERM 时序用例（`src/tests/health.test.ts`，`exit.code` 为 null）失败；该文件 diff 为零且独立复跑 3 次均 8/8 通过（与 Task 6 记录的既有 flake 一致），原样重跑后 **exit 0**：contracts 133、domain 376、database 257（66 gated）、worker **236**（2 gated）、web 242，共 **1,244 non-skipped / 68 gated skips**；lint、typecheck、build、placeholder、`git diff --check` 全绿。Task 11 七步已全部完成；生产未访问、未应用迁移。

**2026-08-31 Task 5 Step 6 local test-harness repair COMPLETE**：按 blocker diagnosis 仅修正 integration harness 两处：公开投影断言直接以公开 `reference_id` 查询，取消越过 view contract 的 `normalized_url` join；advisory waiter 改为至少一次查询、`performance.now()` 1,000ms 单调 deadline，sleep 仍最多 10ms 且受余时限制。保留 exact blocker PID/key matcher、既有 named missing-waiter error 与 rollback→allSettled cleanup；未提高 Vitest timeout、未添加 test-side lock。Node 22.22.2 下 database eslint / `tsc --noEmit` 均 exit 0；focused gate 为 **1 file / 5 tests skipped / exit 0**，仅证明无 integration env 时不执行数据库行为。integration SHA-256 `32f58b1904647761055b1401913d05c187b47890d7f83cfa7c210f43eca67989`；016/23/24 SHA 未变，migration25 absent。新的 disposable behavioral RED 仍须明确授权；本轮未连接数据库、远端、隧道或生产。

**2026-08-31 Task 5 Step 6 local test-harness repair scoped review CLEAN**：独立 reviewer 审查 `b72678d..fa8c8f4`，结论 **APPROVED，0 Critical / 0 Important / 0 Minor**。确认公开投影只按 view `reference_id` 查询、无 base-table fallback；waiter 至少查询一次并以单调 1,000ms deadline 结束，sleep 不超过 10ms 且受剩余时间限制；exact blocker PID/classid/objid/objsubid matcher 与 rollback→allSettled cleanup 顺序保持；未提高 Vitest timeout、未增加 test-side production lock。016、第23/24 migration 未改，migration25 不存在；本地 skipped gate 不作为 behavioral RED。下一步停在远程边界，必须获得新的修复版 test-only disposable RED 明确授权。

**2026-08-31 Task 5 Step 6 repaired test-only disposable RED AUTHORIZED**：项目所有者明确授权“授权修复版 Task 5 test-only disposable RED”。本次单次授权仅含 read-only fail-closed preflight、一次 016-only sync、focused 016、临时 IPv4 16432/16433 tunnels + 0600 四变量 env/parity、修复后的唯一 integration、20 类 residue 独立归零、删除 remote 016 与关闭/删除临时状态。明确排除 reset、migration25、任何 migration sync、typegen、full pgTAP、生产与 54321/54322、测试/源码修改及第二次同步/重跑。下一步按 `task-1-red-rerun-brief.md` 执行；任一 identity/hash/schema/marker/port/test-shape/cleanup 不符即清理后 BLOCKED。

**2026-08-31 Task 5 Step 6 repaired RED rerun preflight COMPLETE**：授权记录 HEAD `32b9fff` 且 tracked worktree clean；SSH key mode `0600`、local `16432/16433` closed、migration25 absent，seed/23/24/014/015/016 与 repaired integration (`32f58b19…67989`) SHA exact，016 为 292 行。只读远端预检 exit 0：exact workdir/project/CLI `2.112.0`、DB/Kong healthy 且仅 `64322/64321`、24 migrations/max `20260830000100`、paused marker=1、seed/23/24/014/015 hashes exact，remote 016/migration25 absent。尚未 sync/reset/tunnel/production；下一步唯一 016 sync。

**2026-08-31 Task 5 Step 6 repaired RED rerun 016 sync COMPLETE**：单次授权 sync 仅复制 `supabase/tests/016_phase_7b_reference_security_locking.test.sql`；远端独立核验为 **292 lines**、SHA-256 `0fa44939475ac0a3ac43c8caabc791c82a51589656dfe727e52517d0c011bd20`，与本地精确一致。未复制 migration/其他文件、未 reset/typegen/tunnel/production；下一步仅 focused 016。

**2026-08-31 Task 5 Step 6 repaired RED rerun focused 016 ACCEPTED**：focused pgTAP 为 **Files=1 / Tests=18 / Failed=14 / exit 1**；失败精确 Test 1–3 trigger reference lock/order/insert，4–9 reference source/authority/reference lock/order/row/recheck，10–14 authority source/authority lock/order/row/recheck，Test 15–18 security-definer/owner/signature/privilege PASS。无 SQL abort、TAP parse、No plan 或额外失败，因此为授权的 structural RED；未 reset/migration/typegen/production，下一步临时 tunnel/env/parity。

**2026-08-31 Task 5 Step 6 repaired RED rerun tunnel/env/parity COMPLETE**：同一 SSH master 仅 IPv4 `127.0.0.1:16432→64322` 与 `127.0.0.1:16433→64321`；local `/private/tmp/phase7b-task5-reference-security-red-rerun.env` mode `0600`、恰好四个授权变量名且未输出值。remote psql、tunnel PostgreSQL（本机无 psql，使用已安装 `postgres` driver 并关闭连接）和 anon PostgREST 的 active/rumored projects count 均为 **2**，endpoint parity PASS；未访问 production/54321/54322。下一步唯一 repaired integration。

**2026-08-31 Task 5 Step 6 repaired RED rerun integration — BLOCKED**：仅以 Node 22.22.2 / `--no-file-parallelism` 执行修复后的唯一 integration，结果为 **1 file / 5 tests / 4 failed / 1 passed / exit 1**。三条预期 missing-lock behavioral RED 均快速、精确为 `reference_security_advisory_wait_not_observed:1`：flag-first/verify-first（1.608s）、revoke-first/verify-first（1.241s）与 source-block-first（1.414s），无 timeout/SQL/TAP noise。restore/history 已越过 public view，然而 raw `postgres` 返回 `released_at` 为 `Date`，test 仍断言 `expect.any(String)`，在 0.865s 失败；exact cleanup test PASS。该第四个 harness type mismatch 使预期 3 failed / 2 passed 形状不成立，按单次授权不修改/重跑，先 cleanup 后 BLOCKED。

**2026-08-31 Task 5 Step 6 repaired RED rerun cleanup COMPLETE / BLOCKED stop**：integration 内 exact cleanup test PASS；remote 独立查询 project/source/raw/Evidence/user/role/profile/reference/authority/command/decision/flag/indicator/incident/link/event/outbox **20/20 categories zero**。本轮 remote 016 已删除并复核 absent；SSH master closed，local `16432/16433` closed，`/private/tmp/phase7b-task5-reference-security-red-rerun.env` 与 control socket absent。最终只读远端仍为 24 migrations/max `20260830000100`、paused marker=1、remote migration25/016 absent。未 reset/migration sync/typegen/production，未改 test/source 且无第二次 sync/run；structural RED accepted 但 behavioral 形状 4/1 非精确，Step 6/master Task 5 Step 2 保持 unchecked，待新授权的 `released_at` Date assertion repair。

**2026-08-31 Task 5 Step 6 local released_at assertion repair COMPLETE**：仅把 raw `postgres` `released_at` assertion 从错误的 string 类型改为 `Date` instance + `getTime()` finite；保留 `released_by`、`release_evidence_id`、history/count/projection、race/waiter/cleanup 断言和 Vitest timeout。Node 22.22.2 database eslint / `tsc --noEmit` exit 0；focused 无环境门控为 **1 file / 5 tests skipped / exit 0**，仅为 gate 证据。integration SHA-256 `946c475dac34a09e178c9d34b2a3834d160a5692f9daf35070f3500088ed23b2`；016/23/24 SHA unchanged、migration25 absent。本轮未连接 DB/remote/tunnel/production；新的 disposable behavioral RED 仍须 single-use 明确授权。

**2026-08-31 Task 5 Step 6 released_at repair scoped review CLEAN**：独立 reviewer 审查 `065f9b9..f0d771b`，结论 **APPROVED，0 Critical / 0 Important / 0 Minor**。确认 `released_at` 同时验证 raw-driver `Date` instance 与 finite epoch，未序列化或弱化；released-by/Evidence、历史、计数、投影、竞态、waiter、cleanup 均保持；未改 timeout、016、第23/24 migration、generated types、生产代码或 package scripts，migration25 仍不存在。本地 5 skipped 只被记录为 gate evidence。下一步必须重新获得单次 disposable RED 明确授权。

**2026-08-31 Task 5 Step 6 second-repaired test-only disposable RED AUTHORIZED**：项目所有者明确授权“授权二次修复版 Task 5 test-only disposable RED”。新单次授权仅含 fail-closed preflight、一次 016-only sync/focused 016、临时 IPv4 16432/16433 tunnels + 0600 四变量 env/parity、一次 SHA `946c475d…23b2` integration、20 类 residue/remote016/temp exact cleanup 与 final read-only state。明确排除 reset、migration25/任何 migration sync、typegen/full pgTAP、生产/54321/54322、测试/源码修改、第二次 sync 或 integration rerun。精确验收为结构 18/14 与 integration **3 failed / 2 passed**；任一不符清理后 BLOCKED。

**2026-08-31 Task 5 Step 6 second-repaired RED local preflight COMPLETE**：授权记录 HEAD `2d1afea` 且 tracked worktree clean；SSH key mode `0600`、local `16432/16433` closed、migration25 absent。seed/23/24/014/015/016 与 second-repaired integration SHA `946c475d…23b2` 均与简报精确一致，016 为 292 行。尚未连接远端、同步、建隧道或访问生产；下一步仅只读远端预检。

**2026-08-31 Task 5 Step 6 second-repaired RED remote preflight COMPLETE**：只读 disposable 远端预检 exit 0：exact workdir/project/CLI `2.112.0`；DB/Kong running+healthy，且精确只绑定 `64322/64321`；24 migrations / max `20260830000100`、paused marker=1；seed/23/24/014/015 SHA exact，remote 016 与 migration25 absent。未 sync/reset/tunnel/production；下一步单次仅 016 sync。

**2026-08-31 Task 5 Step 6 second-repaired RED 016 sync COMPLETE**：已执行本轮唯一远端写入，仅复制 `supabase/tests/016_phase_7b_reference_security_locking.test.sql`；独立核验 remote SHA-256 `0fa44939475ac0a3ac43c8caabc791c82a51589656dfe727e52517d0c011bd20`、292 lines，均与本地精确一致。未复制 migration/其他文件、未 reset/typegen/tunnel/production；下一步仅 focused 016。

**2026-08-31 Task 5 Step 6 second-repaired RED focused 016 ACCEPTED**：focused pgTAP 为 **Files=1 / Tests=18 / Failed=14 / exit 1**。Test 1–14 精确为 trigger reference key/order/insert（1–3）、reference source/authority/reference key/order/aggregate/recheck（4–9）、authority source/authority key/order/aggregate/recheck（10–14）的预期 missing-lock structural failures；15–18 security-definer/owner/signature/privilege PASS。无 SQL abort、TAP parse、No plan 或额外失败；下一步临时 tunnel/env/parity。

**2026-08-31 Task 5 Step 6 second-repaired RED tunnel/env/parity COMPLETE**：仅一 SSH master 的 IPv4 `127.0.0.1:16432→64322` 与 `127.0.0.1:16433→64321` 已验证；local env `/private/tmp/phase7b-task5-reference-security-red-second-rerun.env` mode `0600`、恰好四个授权变量名、未输出值。remote psql、tunnel PostgreSQL（已安装 `postgres` driver，连接已关闭）与 anon PostgREST 的 active/rumored projects count 均为 **2**，endpoint parity PASS。初次本地监听器 regex 误拒绝自身有效 IPv4 行，自动 cleanup 后以无 regex 的精确字符串校验重建；未访问生产/54321/54322。下一步唯一 second-repaired integration。

**2026-08-31 Task 5 Step 6 second-repaired RED integration ACCEPTED**：唯一 Node 22.22.2 / `--no-file-parallelism` run 为 **1 file / 5 tests / 3 failed / 2 passed / exit 1**。失败精确为 flag-first/verify-first、revoke-first/verify-first、source-block-first 三条 race/source case，均快速且具名 `reference_security_advisory_wait_not_observed:1`（1.643s / 1.358s / 1.329s）；restore/history（含 public projection、Evidence、`released_at` Date/finite timestamp、released-by/Evidence、append-only history）与 exact cleanup PASS。无 timeout、SQL/harness、TAP 或额外噪声；立即进入强制 residue/remote016/temp cleanup。

**2026-08-31 Task 5 Step 6 second-repaired RED cleanup COMPLETE / ACCEPTED**：remote 独立查询 **20/20** owned fixture residue categories 均为 zero；本轮 remote 016 已删除并复核 absent。SSH master 已关闭，local `16432/16433` closed，env/control socket absent。最终只读远端为 24 migrations/max `20260830000100`、paused marker=1、remote 016/migration25 absent。未 reset/migration sync/typegen/production、未改 test/source、无第二次 sync/integration run。结构 **18/14** 与行为 **3 failed/2 passed** 精确，详细 Step 6 和 master Task 5 Step 2 已勾选；migration25 仍未写入。
