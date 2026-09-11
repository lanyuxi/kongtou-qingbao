# Phase 17 — 审核员录入（Curated Intake）— Development Workbook

**Spec:** `docs/superpowers/specs/2026-09-11-phase-17-curated-intake-design.md`
**Plan:** `docs/superpowers/plans/2026-09-11-phase-17-curated-intake.md`
**Status legend:** `READY` · `IN_PROGRESS` · `REVIEW` · `DONE` · `BLOCKED`

**状态：READY（待所有者确认后开工）。** 本文件在 Phase 16 上线后建立，用于记录 Phase 17 的逐任务进展与证据。

| Task | Status | Scope | Evidence / 备注 |
| --- | --- | --- | --- |
| 1 | DONE | contracts：命令与回执契约 | 新增 `packages/contracts/src/curation/{commands,enums,receipts,*.test}.ts` 与 `index.ts` 导出。`curatedSignalCommandV1Schema`（项目 existing\|new、sourceId/rawItemId、六类可参与信号、quote 10–500、verified\|corroborated 需 attestation、expectedVersion、idempotencyKey）；`prepareSourceCommandV1Schema`（canonical https URL + 项目 existing\|new，无 IP 字面量、无默认端口外的显式端口、无凭据）；`preparedSourceV1Schema` / `curatedSignalReceiptV1Schema` 含 idempotency-replayed 字段。错误码 `CU2xx`（CU201..CU210）。**GREEN**：contracts 全量 **332/332**（原 299 + 新 33）。**变异校验**：`corroborated-requires-attestation` 守卫被改成 `() => true` → "rejects corroborated when the attestation is empty" 用例精确 kill（已还原）。 |
| 2 | BLOCKED | domain：引文定位与核验策略 | `deterministic_exact_quote_v1` 的纯函数实现必须与 SQL `evidence_quote_sha256_v1` 产出一致（双向锁定）；`verified` / `corroborated` / 拒绝 三态判定。 |
| 3 | BLOCKED | 迁移 + pgTAP + 生成类型 | `curated_signal_commands` + 幂等唯一键 + 受保护命令函数 + **先 revoke 再 grant** + RLS；新增 pgTAP `024`。 |
| 4 | BLOCKED | database：仓储与命令边界 | 受保护函数的 TypeScript 封装、参数化模板、错误码映射。 |
| 5 | BLOCKED | BFF：prepare / publish | 认证先于校验；非审核角色拒绝；他人资源 404 不 403；幂等与版本冲突码不混用。 |
| 6 | BLOCKED | UI：`/review/curate` | 项目（已有/新建）+ 来源 + 信号类型 + 引文选择器；抓取失败需明确提示而不是降级。 |
| 7 | BLOCKED | 文档、门禁、独立审查 | runbook 章节、HANDOVER、`pnpm verify` 全绿、fresh 只读审查。 |

## 立项依据（已核实的事实）

- **系统里没有任何人能写一条机会**：`sources` / `project_sources` 无注册界面，canonical signal 只能由 `extraction_candidates` 的 AI 候选发布产生（`promote_extraction_candidate` / `publish_candidate_with_evidence`）。
- **`public.evidence` 要求 `raw_item_id` NOT NULL**（迁移 `20260820000100:94-140`），`quote_text` 长度 10–500、`verification_method` 恒为 `deterministic_exact_quote_v1`。因此**没有 raw_item 就没有证据**。
- **`campaigns` 至今不存在**：`AGENTS.md` 的 Catalog 域列出了它，但库里没有该表；Phase 8 的"六类可参与信号"实际用 `signals.signal_type` 表达（`airdrop_campaign` / `points_program` / `snapshot_notice` / `task_launch` / `token_launch` / `eligibility_rule`）。
- **自动发布的 AI 信号写的是 `verification='unverified'`**（`20260820000100:724`）；人工录入的意义正在于可以写到 `verified`，但必须设门槛。
- Phase 16 结论：DeFiLlama 无空投端点，链上数据不等于机会条目。

## 三条不可让步

1. **不放宽证据链** —— 拒绝新增 `operator_attestation` 这类绕开 `raw_item_id` 的字段；抓不到就录入失败。
2. **事务内不调外部 API** —— 抓取（prepare）与落库（publish）分两步。
3. **不动既有约束** —— 评分、读模型、公开投影、AI 契约均不修改。

## 已知高风险点（开工前必须先想清楚）

- Supabase 新函数默认 `PUBLIC EXECUTE` → 会被 PostgREST 暴露成匿名 RPC（2026-09-10 审查的既有教训）。**必须先 revoke 再 grant，并用 pgTAP 断言。**
- 角色判断必须复用既有 `actor_has_active_*` 模式，且每次执行前重新校验，避免权限回收后仍可写入。
- pgTAP `024` 必须覆盖四角色矩阵、幂等重放/冲突、原子回滚、append-only。
