# Airdrop Intelligence OS（空投情报操作系统）

一个面向 Web3 的**空投情报与决策平台**：帮助用户发现、评估、执行并跟踪**公开且可核验**的参与机会。

它的定位是**决策基础设施**——不是资讯流，更不是自动撸毛机器人。

---

## 一、不可逾越的红线

这些是产品设计的硬约束，任何功能都不得违反：

- **永不**存储、请求、记录或传输：助记词、私钥、keystore、钱包密码、签名密钥。
- **永不**实现：自动交易签名、自动化钱包交互、女巫检测规避、设备指纹规避、地理或 KYC 绕过。
- **永不**在无充分证据时将某个空投、快照、领取、官网或合约标记为"已确认"。
- **机会、风险、置信度、建议是四个独立输出**，高机会绝不能冲抵高风险。
- 每条实质性结论与评分因子都必须**可溯源**到 Evidence → Raw Item → Source。
- AI 输出**只是候选数据**，不得直接写入权威事实、最终评分、已核验教程、官方链接或安全决策。
- 冲突证据必须**保持可见**，直到被显式解决；严禁静默覆盖或删除矛盾历史。

---

## 二、技术架构

采用 TypeScript monorepo，MVP 阶段为**模块化单体**：一个 PostgreSQL 数据库 + 一个 Web 进程 + 若干 Worker 进程。

| 模块 | 职责 |
|---|---|
| `apps/web` | 页面、短生命周期的 Route Handler / BFF 端点、认证校验、轻量用户命令 |
| `apps/worker` | 采集、AI 分阶段处理、Promotion、评分、教程生成、通知与维护任务 |
| `packages/contracts` | **唯一**的 API / AI 输出 / 任务载荷 / 领域事件 / 枚举契约来源 |
| `packages/domain` | 纯业务规则，不依赖 Next.js、数据库客户端、OpenAI SDK 或 HTTP 框架 |
| `packages/database` | 仓储层、事务、迁移、读模型、outbox 访问 |

数据所有权（不得跨模块直接改表）：

| 域 | 内容 |
|---|---|
| Identity | profiles、角色、公开钱包地址 |
| Catalog | projects、campaigns、sources、funding、metrics |
| Intelligence | raw items、AI runs、candidates、evidence、signals、conflicts |
| Review & Security | 审核项、决策、事件、incidents、indicators |
| Decision | 项目评分、评分因子、评分-证据关联 |
| Execution | tutorials、user projects、watchlists、tasks、task history |
| Notification | alerts、deliveries、偏好设置 |

---

## 三、已完成的阶段

| 阶段 | 内容 |
|---|---|
| Phase 0–1 | 工程地基与架构骨架 |
| Phase 2 | 有界、保证据的官方来源采集（HTML / RSS），基于 PostgreSQL 持久队列 |
| Phase 5 | 采集 → 抽取 → 评分的常态化编排 |
| Phase 6A | Canonical 治理闭环：AI 输出为候选，Promotion Service 受保护命令，Evidence 溯源 |
| Phase 6B | 失败 AI run 的交互式 review 与 dead-letter 处理 |
| Phase 7A | Security Ledger：protect-first 工作流、incidents、indicators |
| Phase 7B | Verified allowlisted references：仅已验证引用可渲染为链接 |
| Phase 8 | Tutorials：教程生成、审核、Golden Dataset |
| Phase 9 | Identity：邮箱魔法链接登录、profile、公开钱包地址、`user_id = auth.uid()` 私有行 RLS |
| Phase 10 | Execution：任务管理、关注列表、参与状态；9 个受保护命令 + 4 个读 RPC |

---

## 四、快速开始

环境要求：**Node.js 22**、**pnpm 11**、**Docker Desktop**（用于本地 Supabase）。

```bash
pnpm install --frozen-lockfile
pnpm verify          # lint + typecheck + test + build + placeholders
pnpm verify:full     # 额外跑本地 Supabase 数据库集成套件
pnpm test:db         # 重置本地库 → 应用迁移与种子 → 跑 pgTAP
```

> `pnpm test:db` **只能**针对本地库，绝不能指向共享、预发或生产数据。

种子数据刻意只包含固定 UUID、`.example.invalid` 域名与虚构项目/来源/信号/评分记录，**不含**任何真实人物、钱包、合约、凭据或生产域名。

本地开发的完整规程见 [`docs/runbooks/local-development.md`](docs/runbooks/local-development.md)。

---

## 五、数据库与迁移

- 全部迁移位于 `supabase/migrations/`，**forward-only**：已应用的迁移绝不修改。
- 所有暴露的表启用 **RLS**，并覆盖匿名 / 本人 / 他人 / 管理员 / service-role 五种角色行为。
- 历史与审计表**只追加**：更正通过新版本、撤回或取代行实现。
- 时间统一用 `timestamptz` 存 UTC。
- 当前共 **33 个迁移**（含 Phase 9 与 Phase 10）。

---

## 六、部署：云端托管，无需自备服务器

本项目可以在**零服务器、零成本**下运行：

| 组件 | 托管方 | 费用 |
|---|---|---|
| PostgreSQL + 认证 + 数据接口 | Supabase 云（Free） | $0 |
| Next.js 网页 | Vercel（Hobby） | $0 |
| 定时任务 | Vercel Cron | $0 |

网页只需配置**两个**环境变量（其余 `AIRDROP_*` 变量是 worker 用的）：

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目的 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 的 anon public key |

Vercel 部署时请将 **Root Directory 设为 `apps/web`**。这一项不能省：`next` 依赖声明在 `apps/web/package.json` 里，仓库根目录没有它；Root Directory 留空时构建会以
`No Next.js version detected` 失败。同时 **不要**再设 Output Directory，否则会得到
`apps/web/apps/web/.next` 这种重复路径。

**当前 Vercel 项目没有连接 Git 集成**，所以 `git push` 不会自动触发部署，需要手动发起：

```bash
curl -X POST https://api.vercel.com/v13/deployments \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"airdrop-intelligence-os","target":"production",
       "gitSource":{"type":"github","org":"lanyuxi","repo":"kongtou-qingbao","ref":"main"},
       "projectSettings":{"framework":"nextjs","rootDirectory":"apps/web",
         "outputDirectory":null,"installCommand":"pnpm install --frozen-lockfile",
         "buildCommand":"pnpm --filter @airdrop/web build"}}'
```

响应里的 `id` 即部署 ID，轮询 `GET /v13/deployments/{id}` 直到 `readyState` 变为
`READY`。成功后生产域名 `airdrop-intelligence-os.vercel.app` 会自动指向新部署。

完整迁移步骤见 [`docs/runbooks/cloud-hosted-migration.md`](docs/runbooks/cloud-hosted-migration.md)。

### 登录功能需要在 Supabase 后台配置跳转地址

「任务」和「关注列表」是登录后功能，采用**邮箱魔法链接**登录（Supabase 内置邮件服务，
不需要自备 SMTP）。上线前必须在 Supabase 控制台完成：

1. **Authentication → URL Configuration → Site URL** 设为
   `https://airdrop-intelligence-os.vercel.app`；
2. **Redirect URLs** 加入 `https://airdrop-intelligence-os.vercel.app/auth/callback`。

漏配这两项时，魔法链接会回落到默认的 `http://localhost:3000`，点击后无法完成登录。
免费层内置邮件服务有速率限制，仅供测试与个人使用。

### 免费层的两个注意事项

1. **Supabase 免费项目连续 7 天无访问会自动暂停**，需在后台手动恢复（升级 Pro 可消除）。
2. **Vercel Hobby 仅限个人非商业使用**；用于商业需升级 Pro。

---

## 七、环境变量总览

| 变量 | 用途 | 作用域 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 浏览器连接 Supabase | 公开 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器匿名密钥 | 公开 |
| `AIRDROP_QUEUE_ADMIN_DATABASE_URL` | 队列调度管理登录 | 服务端专用 |
| `AIRDROP_QUEUE_DATABASE_URL` | worker 持久队列仓储 | 服务端专用 |
| `AIRDROP_COLLECTION_DATABASE_URL` | 来源采集登录 | 服务端专用 |
| `AIRDROP_PROMOTION_DATABASE_URL` | Promotion 服务登录 | 服务端专用 |
| `AIRDROP_PROMOTION_REVIEWER_USER_ID` | 审核人 fixture UUID | 服务端专用 |
| `AIRDROP_COLLECTION_USER_AGENT` | 外发请求 UA | 服务端专用 |
| `AIRDROP_QUEUE_WORKER_ID` | worker 实例标识 | 服务端专用 |

> 变量名在 `.env.example` 中列出；**值永不提交、永不打印**。

---

## 八、安全与运维建议

- 数据库密码、token 等凭据**不要只存在服务器本机磁盘**，应同步到对象存储或异地。
- 备份后建议做一次**恢复演练**，确认可用。
- 生产栈**不要**用 `supabase stop/start` 整体重启（会拉起完整栈导致资源耗尽）；改配置应只重建单个容器。
- 定期轮换数据库密码与访问令牌。

---

## 九、文档索引

| 文档 | 内容 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | 产品规则与工程约束的**唯一事实来源** |
| [`docs/runbooks/local-development.md`](docs/runbooks/local-development.md) | 本地开发、数据库重置、测试、关停规程 |
| [`docs/runbooks/cloud-hosted-migration.md`](docs/runbooks/cloud-hosted-migration.md) | 云端托管迁移（Supabase + Vercel） |
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | 项目现状、交接记录与已知问题 |
| [`docs/architecture/`](docs/architecture) | 各阶段架构说明 |
| [`docs/tasks/`](docs/tasks) | 各阶段逐任务台账 |
