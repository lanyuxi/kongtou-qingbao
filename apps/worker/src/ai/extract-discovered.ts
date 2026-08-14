import { createHash } from 'node:crypto';

import {
  extractionRunOutputSchema,
  type ExtractionCandidatePayload,
  type ExtractionRunOutput,
} from '@airdrop/contracts';
import type {
  ExtractionCandidateInput,
  ExtractionRepository,
  Json,
  PendingExtractionInput,
} from '@airdrop/database';

import { ModelProviderError, type StructuredModelClient } from './model-client.js';

const MAX_INPUT_CHARS = 12_000;
const MAX_CANDIDATES = 10;

const SYSTEM_PROMPT = `你是一个 Web3 空投情报抽取器。用户会提供一条来自公开来源的内容（RSS 条目或文章正文）。
你的任务：仅当内容包含与"空投、积分计划、快照、任务活动、代币发布、资格规则、安全风险、诈骗信号"相关的可验证情报时，抽取候选信号。
严格规则：
1. 只输出 JSON 对象：{"candidates": [...]}，不要输出任何其他文字。
2. 每个候选必须包含字段：claimType（枚举）、signalType（snake_case 英文短语）、title（中文，5-200 字符）、summary（中文，10-2000 字符）、confidence（0-100 数字）、evidenceQuote（从原文逐字复制的英文引文，10-500 字符，不得改写）、occurredAtIso（ISO 8601 字符串或 null）。
3. evidenceQuote 必须是原文的精确子串，禁止翻译、缩写或拼接。
4. 与空投情报无关的内容输出 {"candidates": []}。
5. 最多 ${MAX_CANDIDATES} 个候选。`;

export interface ExtractionRunSummary {
  readonly processed: number;
  readonly succeeded: number;
  readonly skippedNoContent: number;
  readonly schemaInvalid: number;
  readonly providerErrors: number;
  readonly candidatesInserted: number;
}

export interface ExtractionRunPorts {
  readonly repository: ExtractionRepository;
  readonly modelClient: StructuredModelClient;
  readonly maxInputs?: number;
}

interface GroundingOutcome {
  readonly grounded: readonly ExtractionCandidatePayload[];
  readonly droppedCount: number;
}

export async function runExtractionOnce(ports: ExtractionRunPorts): Promise<ExtractionRunSummary> {
  const limit = ports.maxInputs ?? 5;
  const inputs = await ports.repository.listPendingInputs(limit);

  const summary: MutableSummary = {
    processed: 0,
    succeeded: 0,
    skippedNoContent: 0,
    schemaInvalid: 0,
    providerErrors: 0,
    candidatesInserted: 0,
  };

  for (const input of inputs) {
    summary.processed += 1;
    const text = buildInputText(input);
    if (text === null) {
      await ports.repository.recordExtractionRun({
        inputId: input.discoveredItemId,
        inputHash: hashContent('empty'),
        modelId: 'none',
        status: 'skipped_no_content',
        output: null,
        usage: null,
        latencyMs: null,
        errorDetail: null,
      });
      summary.skippedNoContent += 1;
      continue;
    }

    const inputHash = hashContent(text);
    const userPrompt = buildUserPrompt(input, text);

    let parsed: ExtractionRunOutput | null = null;
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
          maxOutputTokens: 2000,
        });
        modelId = completion.modelId;
        latencyMs = completion.latencyMs;
        usage = completion.usage;
        const validated = extractionRunOutputSchema.safeParse(parseJson(completion.jsonText));
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
      await ports.repository.recordExtractionRun({
        inputId: input.discoveredItemId,
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

    const grounding = filterGroundedCandidates(parsed.candidates, text);
    if (parsed.candidates.length > 0 && grounding.grounded.length === 0) {
      await ports.repository.recordExtractionRun({
        inputId: input.discoveredItemId,
        inputHash,
        modelId,
        status: 'grounding_failed',
        output: null,
        usage: asJson(usage),
        latencyMs,
        errorDetail: `all_${parsed.candidates.length}_candidates_ungrounded`,
      });
      summary.schemaInvalid += 1;
      continue;
    }

    const runId = await ports.repository.recordExtractionRun({
      inputId: input.discoveredItemId,
      inputHash,
      modelId,
      status: 'succeeded',
      output: asJson({ candidates: grounding.grounded }),
      usage: asJson(usage),
      latencyMs,
      errorDetail:
        grounding.droppedCount > 0 ? `dropped_${grounding.droppedCount}_ungrounded` : null,
    });
    summary.succeeded += 1;

    if (grounding.grounded.length > 0) {
      const candidateInputs: ExtractionCandidateInput[] = grounding.grounded.map((payload) => ({
        projectId: input.projectId,
        sourceId: input.sourceId,
        discoveredItemId: input.discoveredItemId,
        rawItemId: input.articleRawItemId,
        payload,
        payloadSha256: hashContent(
          `${input.discoveredItemId}:${payload.signalType}:${payload.title}`,
        ),
      }));
      summary.candidatesInserted += await ports.repository.insertCandidates(
        runId,
        candidateInputs,
      );
    }
  }

  return summary;
}

interface MutableSummary {
  processed: number;
  succeeded: number;
  skippedNoContent: number;
  schemaInvalid: number;
  providerErrors: number;
  candidatesInserted: number;
}

export function buildInputText(input: PendingExtractionInput): string | null {
  const text = (input.articleText ?? input.summary ?? '').trim();
  if (text.length < 40) {
    return null;
  }
  return text.slice(0, MAX_INPUT_CHARS);
}

export function buildUserPrompt(input: PendingExtractionInput, text: string): string {
  const header = [
    input.title === null ? null : `标题：${input.title}`,
    input.entryUrl === null ? null : `链接：${input.entryUrl}`,
    input.publishedAt === null ? null : `发布时间：${input.publishedAt}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
  return `${header}\n\n原文内容：\n${text}`;
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

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function filterGroundedCandidates(
  candidates: readonly ExtractionCandidatePayload[],
  sourceText: string,
): GroundingOutcome {
  const normalizedSource = normalizeWhitespace(sourceText);
  const grounded = candidates.filter((candidate) =>
    normalizedSource.includes(normalizeWhitespace(candidate.evidenceQuote)),
  );
  return { grounded, droppedCount: candidates.length - grounded.length };
}
