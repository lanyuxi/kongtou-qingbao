import { createHash } from 'node:crypto';

import {
  tutorialCandidatePayloadSchema,
  type TutorialCandidatePayload,
} from '@airdrop/contracts';
import { findUnallowlistedTutorialReferences } from '@airdrop/domain';
import type { TutorialKind } from '@airdrop/contracts';
import type {
  Json,
  TutorialCandidateRepository,
  TutorialGenerationMaterial,
  TutorialMaterialSignal,
} from '@airdrop/database';

import { ModelProviderError, type StructuredModelClient } from '../ai/model-client.js';

const MAX_MATERIAL_CHARS = 12_000;
const MAX_STEPS = 20;

const SYSTEM_PROMPT = `你是一个 Web3 参与教程起草器。用户会提供一个项目的一组已核验信号，以及一份"引用白名单"。
你的任务：把信号组织成一份可执行的参与教程草稿（candidate），供人工审核。
严格规则：
1. 只输出 JSON 对象，字段为：{"title": string, "summary": string, "steps": [...], "sourceSignalIds": [...], "confidence": number}。不要输出任何其他文字。
2. title 中文 5-200 字符；summary 中文 10-2000 字符；steps 2-${MAX_STEPS} 个。
3. 每个 step 为 {"title": string(3-120), "body": string(10-1000), "links": [{"referenceId": uuid}]}，links 最多 5 个。
4. **步骤文本中禁止出现任何 URL**（http://、https://、www. 均不可），需要引导用户访问的链接必须通过 links 的 referenceId。
5. links 的 referenceId **只能从引用白名单中选择**，不得编造或复用信号 id。
6. sourceSignalIds **只能从给定的信号 id 中选择**，至少 1 个、最多 10 个，且必须是你实际依据的信号。
7. confidence 为 0-100 的数字，表示信号对教程步骤的支撑强度。
8. 教程只描述公开可参与的官方流程：不得建议绕过 KYC、多账号、指纹规避或任何自动化脚本。`;

export interface TutorialGenerationSummary {
  readonly processed: number;
  readonly succeeded: number;
  readonly skippedNoMaterial: number;
  readonly skippedDuplicate: number;
  readonly schemaInvalid: number;
  readonly providerErrors: number;
  readonly droppedUnallowlisted: number;
  readonly candidatesInserted: number;
}

export interface TutorialGenerationPorts {
  readonly repository: TutorialCandidateRepository;
  readonly modelClient: StructuredModelClient;
  readonly maxProjects?: number;
}

interface MutableSummary {
  processed: number;
  succeeded: number;
  skippedNoMaterial: number;
  skippedDuplicate: number;
  schemaInvalid: number;
  providerErrors: number;
  droppedUnallowlisted: number;
  candidatesInserted: number;
}

export async function runTutorialGenerationOnce(
  ports: TutorialGenerationPorts,
): Promise<TutorialGenerationSummary> {
  const limit = ports.maxProjects ?? 5;
  const materials = await ports.repository.listMaterials(limit);
  const summary: MutableSummary = {
    processed: 0,
    succeeded: 0,
    skippedNoMaterial: 0,
    skippedDuplicate: 0,
    schemaInvalid: 0,
    providerErrors: 0,
    droppedUnallowlisted: 0,
    candidatesInserted: 0,
  };

  for (const material of materials) {
    const kinds = kindsForMaterial(material);
    if (kinds.length === 0) {
      // No participable signal means there is nothing to teach. The run is
      // still recorded so an empty material set stays auditable rather than
      // silently disappearing from the stage counters.
      await ports.repository.recordRun({
        inputId: material.projectId,
        inputHash: materialHash(material.projectId, 'no_material', [], material),
        modelId: 'none',
        status: 'skipped_no_content',
        output: null,
        usage: null,
        latencyMs: null,
        errorDetail: 'insufficient_tutorial_material',
      });
      summary.skippedNoMaterial += 1;
      continue;
    }

    for (const kind of kinds) {
      summary.processed += 1;
      const signals = material.signals.filter((signal) => signal.kind === kind);
      const userPrompt = buildUserPrompt(material, kind, signals);
      if (signals.length === 0 || material.references.length === 0 || userPrompt === null) {
        await ports.repository.recordRun({
          inputId: material.projectId,
          inputHash: materialHash(material.projectId, kind, signals, material),
          modelId: 'none',
          status: 'skipped_no_content',
          output: null,
          usage: null,
          latencyMs: null,
          errorDetail: 'insufficient_tutorial_material',
        });
        summary.skippedNoMaterial += 1;
        continue;
      }

      const inputHash = materialHash(material.projectId, kind, signals, material);
      if (await ports.repository.hasSucceededRun(material.projectId, inputHash)) {
        summary.skippedDuplicate += 1;
        continue;
      }

      const allowlist = material.references.map((reference) => ({
        referenceId: reference.referenceId,
      }));
      const signalIds = signals.map((signal) => signal.signalId);

      let parsed: TutorialCandidatePayload | null = null;
      let lastError: string | null = null;
      let providerFailed = false;
      let modelId = 'unknown';
      let latencyMs: number | null = null;
      let usage: unknown = null;

      for (let attempt = 0; attempt < 2 && parsed === null; attempt += 1) {
        try {
          const completion = await ports.modelClient.completeJson({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt:
              attempt === 0
                ? userPrompt
                : `${userPrompt}\n\n你上一次的输出未能通过校验：${lastError ?? 'unknown'}\n请修正后重新输出完整 JSON。`,
            maxOutputTokens: 4000,
          });
          modelId = completion.modelId;
          latencyMs = completion.latencyMs;
          usage = completion.usage;
          const validated = tutorialCandidatePayloadSchema.safeParse(
            parseJson(completion.jsonText),
          );
          if (validated.success) {
            parsed = validated.data;
          } else {
            lastError = validated.error.issues
              .slice(0, 5)
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ');
          }
        } catch (cause) {
          lastError = cause instanceof Error ? cause.message : 'provider_error';
          if (cause instanceof ModelProviderError) {
            providerFailed = true;
          }
          break;
        }
      }

      if (parsed === null) {
        const status = providerFailed ? 'provider_error' : 'schema_invalid_after_repair';
        await ports.repository.recordRun({
          inputId: material.projectId,
          inputHash,
          modelId,
          status,
          output: null,
          usage: asJson(usage),
          latencyMs,
          errorDetail: lastError === null ? null : lastError.slice(0, 1000),
        });
        if (status === 'provider_error') {
          summary.providerErrors += 1;
        } else {
          summary.schemaInvalid += 1;
        }
        continue;
      }

      // Grounding: both the link allowlist and the signal allowlist are
      // non-negotiable. A hallucinated reference id or signal id makes the
      // whole draft untrustworthy, so the candidate is dropped rather than
      // repaired — the reviewer must never see a candidate whose links or
      // provenance the generator invented.
      const unallowlisted = [
        ...findUnallowlistedTutorialReferences(parsed, allowlist),
        ...signalIdsOffenders(parsed.sourceSignalIds, signalIds),
      ];
      if (unallowlisted.length > 0) {
        await ports.repository.recordRun({
          inputId: material.projectId,
          inputHash,
          modelId,
          status: 'grounding_failed',
          output: null,
          usage: asJson(usage),
          latencyMs,
          errorDetail: `unallowlisted_${unallowlisted.length}_ids`,
        });
        summary.droppedUnallowlisted += 1;
        continue;
      }

      const runId = await ports.repository.recordRun({
        inputId: material.projectId,
        inputHash,
        modelId,
        status: 'succeeded',
        output: asJson(parsed),
        usage: asJson(usage),
        latencyMs,
        errorDetail: null,
      });
      summary.succeeded += 1;

      const inserted = await ports.repository.insertCandidate({
        runId,
        projectId: material.projectId,
        kind,
        payload: parsed,
        sourceSignalIds: parsed.sourceSignalIds,
        confidence: parsed.confidence,
        contentHash: hashContent(`${material.projectId}:${kind}:${inputHash}`),
      });
      if (inserted) {
        summary.candidatesInserted += 1;
      }
    }
  }

  return summary;
}

export function kindsForMaterial(
  material: TutorialGenerationMaterial,
): readonly TutorialKind[] {
  const seen: TutorialKind[] = [];
  for (const signal of material.signals) {
    if (!seen.includes(signal.kind)) {
      seen.push(signal.kind);
    }
  }
  return seen;
}

export function signalIdsOffenders(
  produced: readonly string[],
  allowed: readonly string[],
): readonly string[] {
  return produced.filter((id) => !allowed.includes(id));
}

export function buildUserPrompt(
  material: TutorialGenerationMaterial,
  kind: TutorialKind,
  signals: readonly TutorialMaterialSignal[],
): string | null {
  const signalBlock = signals
    .map((signal) => [
      `- id: ${signal.signalId}`,
      `  title: ${signal.title}`,
      `  summary: ${signal.summary}`,
      signal.publishedAt === null ? null : `  publishedAt: ${signal.publishedAt}`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n'))
    .join('\n');
  const referenceBlock = material.references
    .map(
      (reference) =>
        `- ${reference.referenceId} · ${reference.kind}${reference.label === null ? '' : ` · ${reference.label}`}`,
    )
    .join('\n');
  const prompt = `项目：${material.projectName}（${material.projectId}）
教程类型：${kind}

已核验信号：
${signalBlock}

引用白名单（links 只能使用这些 referenceId）：
${referenceBlock}

请输出单个候选 JSON 对象。`;
  if (prompt.length > MAX_MATERIAL_CHARS) {
    return null;
  }
  return prompt;
}

export function materialHash(
  projectId: string,
  kind: string,
  signals: readonly { readonly signalId: string }[],
  material: TutorialGenerationMaterial,
): string {
  const signalPart = [...signals.map((signal) => signal.signalId)]
    .sort()
    .join(',');
  const referencePart = [...material.references.map((reference) => reference.referenceId)]
    .sort()
    .join(',');
  return hashContent(
    `tutorial-material-v1|${projectId}|${kind}|${signalPart}|${referencePart}`,
  );
}

export function hashContent(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function asJson(value: unknown): Json | null {
  return value === null ? null : (value as Json);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
