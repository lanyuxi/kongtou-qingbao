# 云托管迁移手册：Supabase 云 + Vercel（零服务器方案）

本手册回答一个问题：**如何不再自己养服务器**。目标是完全托管、零服务器、个人使用零成本。

> 适用前提（已与所有者确认）：系统**仅本人使用**、**数据可上云**、采集 worker 先低频化。
> 若日后要对外商用，请重新评估 Vercel 的商用条款（Hobby 限个人非商业用途）。

## 1. 目标架构与成本

| 组件 | 托管方 | 月费 | 说明 |
| --- | --- | --- | --- |
| Postgres + 认证 + 数据接口 | Supabase 云（Free） | $0 | 免费层无时限，非试用 |
| Next.js 网页 | Vercel（Hobby） | $0 | 限个人非商业用途 |
| 定时任务 | Vercel Cron（Hobby） | $0 | 每项目每天触发一次 |
| 服务器 | —— | —— | **不需要，可退掉现有 ECS |

免费额度（2026 年官方政策）：Supabase Free 给 2 个项目、500 MB 数据库、5 GB egress + 5 GB 缓存 egress、5 万 MAU；Vercel Hobby 给 100 GB 带宽、100 万 Edge 请求、4 CPU-小时、每天 100 次部署。当前数据量（十余个项目、几十条评分）远低于这些上限。

**必须知道的两个坑：**

1. **Supabase 免费项目连续 7 天无访问会自动暂停**，需在后台手动恢复。本人使用最容易踩到这一点。解决：接受偶尔手动恢复，或升级 Pro（$25/月，项目永不暂停 + 每日备份）。
2. **Vercel Hobby 不允许商业使用**。自用完全合规；一旦用它变现需升级 Pro（$20/席位/月）。

## 2. 迁移前的第一要务：把数据救出来

现有生产数据与备份**只存在于那台失联的 ECS 上**（数据库卷 + `/root/backups/*.sql`）。主机一旦能连上，**第一件事是把备份下载到本地或对象存储**，再谈其他。

```bash
scp root@115.190.206.200:/root/backups/prod-pre-phase9-20260909.sql ./backups/
scp root@115.190.206.200:/root/backups/prod-pre-phase10-20260909.sql ./backups/
```

> 教训：备份不要只放本机磁盘。以后应同步到对象存储或异地。

如果主机无法恢复：数据库结构（33 个迁移）**完整保存在代码里**，可以重建；丢失的只是业务数据（项目、评分、任务），可从 seed 或重新采集补回。

## 3. 步骤一：建立 Supabase 云项目并推迁移

1. 在 [supabase.com](https://supabase.com) 注册并创建一个新项目（Region 选离你最近的）。
2. 记下 **Project ref**（形如 `abcdefghijklmnopqrst`）与数据库密码。
3. 在本仓库根目录执行：

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <你的 project ref>
pnpm exec supabase db push
```

`db push` 会把 `supabase/migrations/` 下全部迁移应用到云库。本项目的数据库层是**纯标准 Postgres**（RLS、受保护命令、投影视图、outbox 事件），无需修改。

**可能遇到的两个问题：**

- 早期迁移里若有 `CREATE ROLE`（如 `collection_queue_worker` 等专用登录），在 Supabase 云上可能因权限不足失败。这些角色**只有 worker 用**；web 不需要。处理方式：把涉及专用角色的语句从要推送的迁移中摘出，或改用 Supabase 提供的连接身份。
- 若 `db push` 报告冲突，可改用逐条应用的稳妥方式：

```bash
psql "<SUPABASE_DB_URL>" -v ON_ERROR_STOP=1 -f supabase/migrations/<某个迁移>.sql
```

并逐条登记 `supabase_migrations.schema_migrations`。

4. 验证迁移结果：

```bash
psql "<SUPABASE_DB_URL>" -c "select count(*) from supabase_migrations.schema_migrations;"
psql "<SUPABASE_DB_URL>" -c "select version from supabase_migrations.schema_migrations order by version desc limit 3;"
```

预期 33 条（含 Phase 9 的 30/31 与 Phase 10 的 32/33）。

## 4. 步骤二：导入现有数据（能拿到备份时）

```bash
# 从备份恢复到云库（用 direct connection，端口 5432）
pg_restore -d "<SUPABASE_DB_URL>" --no-owner --no-privileges --clean --if-exists backups/prod-pre-phase10-20260909.sql
```

若用 `pg_dump` 的纯文本格式，改用：

```bash
psql "<SUPABASE_DB_URL>" -v ON_ERROR_STOP=1 -f backups/prod-pre-phase10-20260909.sql
```

导入后核对：

```bash
psql "<SUPABASE_DB_URL>" -c "select count(*) from public.projects;"
```

## 5. 步骤三：把 web 部署到 Vercel

1. 把代码推送到 GitHub（私有仓库即可）。
2. 在 Vercel 新建项目，导入该仓库，设置：
   - **Root Directory**：`apps/web`
   - **Framework Preset**：Next.js
   - **Install Command**：`pnpm install`（Vercel 支持 pnpm workspace）
3. 配置环境变量（**只需要这两个**）：

| 变量 | 取值 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目的 Project URL，形如 `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 项目的 anon public key |

> 为什么只要两个：经核查，`apps/web` **不直连数据库**，全部通过 Supabase 客户端（PostgREST + 用户 bearer token）访问，这正是 Supabase 云的原生模式。`.env.example` 里那些 `AIRDROP_*` 变量是 **worker** 用的，web 不需要。

4. 推送即部署。部署完成后访问 Vercel 提供的域名。

## 6. 步骤四：处理 `output: 'standalone'`

`apps/web/next.config.ts` 目前写死了 `output: 'standalone'`——那是为在 650MB 小内存主机上构建而设的，Vercel 不需要，且可能与其构建流程冲突。

建议改为按环境变量启用，使自托管与 Vercel 兼容：

```ts
const nextConfig: NextConfig = {
  transpilePackages: ['@airdrop/contracts'],
  // 仅自托管时构建 standalone 包；Vercel 自行处理构建输出。
  output: process.env.NEXT_STANDALONE === 'true' ? 'standalone' : undefined,
};
```

自托管部署时设 `NEXT_STANDALONE=true` 即恢复原行为。

## 7. 步骤五：worker 的处理（分阶段）

worker（`apps/worker`）**直连 Postgres**，且依赖多个专用数据库登录（`AIRDROP_QUEUE_DATABASE_URL`、`AIRDROP_COLLECTION_DATABASE_URL`、`AIRDROP_PROMOTION_DATABASE_URL` 等，分别对应 `collection_queue_worker`、`collection_worker`、`promotion_service` 等角色）。这些自定义角色在 Supabase 云上创建比较麻烦。

因此建议**分阶段**：

- **阶段一（先跑通主体）**：不部署 worker。网页与数据库全部上云，采集暂用本地手动触发（`pnpm --filter @airdrop/worker start`），或暂时不采集。
- **阶段二（可选，每天一次）**：把 worker 的采集逻辑拆成一个 HTTP 接口，用 Vercel Cron 每天触发一次。注意 Hobby 的 Cron 限制是**每个项目每天一次**；若需要更频繁或 7×24 常驻，则需要一个常驻进程（如 Fly.io 最小实例，约几美元/月，属托管式，无需自己管系统）。

## 8. 验证清单

- [ ] Supabase 云迁移数为 33
- [ ] `public.projects` 有数据（或从 seed 重建）
- [ ] Vercel 部署成功，首页可打开
- [ ] 登录流程可用（需先配置真实 SMTP，见下）
- [ ] `/tasks`、`/watchlists` 可访问
- [ ] 本地备份已异地保存

## 9. 关于登录（Phase 9）

Phase 9 的魔法链接登录依赖 SMTP。原生产环境 `GOTRUE_SMTP_HOST` 指向 `supabase_inbucket_...`（测试用邮件捕获器）且该容器并不存在，因此**登录此前实际不可用**。

Supabase 云自带邮件服务，需在 **Authentication → Emails / SMTP** 中配置：

- 使用 Supabase 内置 SMTP（有发送限额，自用足够），或
- 填入自己的 SMTP 主机、端口、账号与发件人

同时确认 **Authentication → URL Configuration** 里的 Site URL 是 Vercel 给你的域名。

## 10. 退订与收尾

全部验证通过后，原 ECS 可以退订。退订前确认：

- 备份已下载到本地或对象存储
- 域名（若有）已切到 Vercel
- 不再需要该机器上的 docker 卷

## 参考

- 架构决策与事故记录：`.workbuddy/memory/2026-09-09.md`
- 本地开发规程：`docs/runbooks/local-development.md`
- Phase 10 台账：`docs/tasks/phase-10-execution-workbook.md`
