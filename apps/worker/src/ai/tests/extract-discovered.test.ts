import { describe, expect, it } from 'vitest';

import type { ExtractionRunOutput } from '@airdrop/contracts';
import type {
  ExtractionCandidateInput,
  ExtractionRepository,
  PendingExtractionInput,
  RecordExtractionRunInput,
} from '@airdrop/database';

import { filterGroundedCandidates, runExtractionOnce } from '../extract-discovered.js';
import { ModelProviderError, type StructuredModelClient } from '../model-client.js';

function pendingInput(overrides: Partial<PendingExtractionInput> = {}): PendingExtractionInput {
  return {
    discoveredItemId: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    sourceId: '33333333-3333-4333-8333-333333333333',
    articleRawItemId: '44444444-4444-4444-8444-444444444444',
    title: 'Test entry',
    summary: null,
    entryUrl: 'https://example.dev/blog/post',
    publishedAt: null,
    articleText:
      'The points program will extend to week 12 with new node operator tasks. Snapshot planned for September.',
    ...overrides,
  };
}

function candidatePayload(evidenceQuote: string) {
  return {
    claimType: 'points_program' as const,
    signalType: 'points_program',
    title: '积分计划延长',
    summary: '官方确认积分计划延长至第 12 周。',
    confidence: 80,
    evidenceQuote,
    occurredAtIso: null,
  };
}

function modelClientReturning(outputs: string[]): StructuredModelClient & { calls: number } {
  const client = {
    calls: 0,
    async completeJson() {
      const jsonText = outputs.at(Math.min(client.calls, outputs.length - 1));
      client.calls += 1;
      if (jsonText === undefined) {
        throw new Error('mock outputs exhausted');
      }
      return {
        jsonText,
        modelId: 'mock-model',
        latencyMs: 10,
        usage: { total_tokens: 100 },
      };
    },
  };
  return client;
}

function recordingRepository(inputs: PendingExtractionInput[]) {
  const runs: RecordExtractionRunInput[] = [];
  const candidateBatches: Array<{ runId: string; candidates: readonly ExtractionCandidateInput[] }> = [];
  const repository: ExtractionRepository = {
    async listPendingInputs() {
      return inputs;
    },
    async recordExtractionRun(input) {
      runs.push(input);
      return `run-${runs.length}`;
    },
    async insertCandidates(runId, candidates) {
      candidateBatches.push({ runId, candidates });
      return candidates.length;
    },
    async listPendingCandidates() {
      return [];
    },
  };
  return { repository, runs, candidateBatches };
}

describe('runExtractionOnce', () => {
  it('records grounded candidates from a valid completion', async () => {
    const output: ExtractionRunOutput = {
      candidates: [candidatePayload('points program will extend to week 12')],
    };
    const { repository, runs, candidateBatches } = recordingRepository([pendingInput()]);
    const summary = await runExtractionOnce({
      repository,
      modelClient: modelClientReturning([JSON.stringify(output)]),
    });

    expect(summary).toEqual({
      processed: 1,
      succeeded: 1,
      skippedNoContent: 0,
      schemaInvalid: 0,
      providerErrors: 0,
      candidatesInserted: 1,
    });
    expect(runs).toHaveLength(1);
    expect(runs.at(0)!.status).toBe('succeeded');
    expect(candidateBatches).toHaveLength(1);
    expect(candidateBatches.at(0)!.runId).toBe('run-1');
  });

  it('drops ungrounded candidates but keeps grounded ones', async () => {
    const output: ExtractionRunOutput = {
      candidates: [
        candidatePayload('points program will extend to week 12'),
        candidatePayload('this quote does not exist in the source text at all'),
      ],
    };
    const { repository, runs, candidateBatches } = recordingRepository([pendingInput()]);
    const summary = await runExtractionOnce({
      repository,
      modelClient: modelClientReturning([JSON.stringify(output)]),
    });

    expect(summary.succeeded).toBe(1);
    expect(summary.candidatesInserted).toBe(1);
    expect(candidateBatches.at(0)!.candidates).toHaveLength(1);
    expect(runs.at(0)!.errorDetail).toBe('dropped_1_ungrounded');
  });

  it('records grounding_failed when every candidate is ungrounded', async () => {
    const output: ExtractionRunOutput = {
      candidates: [candidatePayload('nothing in the source matches this quote')],
    };
    const { repository, runs } = recordingRepository([pendingInput()]);
    const summary = await runExtractionOnce({
      repository,
      modelClient: modelClientReturning([JSON.stringify(output)]),
    });

    expect(summary.succeeded).toBe(0);
    expect(summary.schemaInvalid).toBe(1);
    expect(runs.at(0)!.status).toBe('grounding_failed');
  });

  it('repairs one schema violation before giving up', async () => {
    const bad = JSON.stringify({ candidates: [{ nope: true }] });
    const good = JSON.stringify({
      candidates: [candidatePayload('points program will extend to week 12')],
    });
    const { repository, runs } = recordingRepository([pendingInput()]);
    const client = modelClientReturning([bad, good]);
    const summary = await runExtractionOnce({ repository, modelClient: client });

    expect(client.calls).toBe(2);
    expect(summary.succeeded).toBe(1);
    expect(runs).toHaveLength(1);
  });

  it('records schema_invalid_after_repair when both attempts fail', async () => {
    const bad = 'not json at all';
    const { repository, runs } = recordingRepository([pendingInput()]);
    const summary = await runExtractionOnce({
      repository,
      modelClient: modelClientReturning([bad]),
    });

    expect(summary.schemaInvalid).toBe(1);
    expect(runs.at(0)!.status).toBe('schema_invalid_after_repair');
    expect(runs.at(0)!.output).toBeNull();
  });

  it('records provider_error without a repair attempt', async () => {
    const { repository, runs } = recordingRepository([pendingInput()]);
    const client = modelClientReturning(['{}']);
    const failing: StructuredModelClient = {
      async completeJson() {
        throw new ModelProviderError('http_401');
      },
    };
    void client;
    const summary = await runExtractionOnce({ repository, modelClient: failing });

    expect(summary.providerErrors).toBe(1);
    expect(runs.at(0)!.status).toBe('provider_error');
  });

  it('skips inputs without usable content', async () => {
    const { repository, runs } = recordingRepository([
      pendingInput({ articleText: null, summary: 'too short' }),
    ]);
    const summary = await runExtractionOnce({
      repository,
      modelClient: modelClientReturning(['{}']),
    });

    expect(summary.skippedNoContent).toBe(1);
    expect(runs.at(0)!.status).toBe('skipped_no_content');
  });
});

describe('filterGroundedCandidates', () => {
  it('normalizes whitespace before matching', () => {
    const source = 'The   points\nprogram will\textend to week 12.';
    const outcome = filterGroundedCandidates(
      [candidatePayload('points program will extend')],
      source,
    );
    expect(outcome.grounded).toHaveLength(1);
    expect(outcome.droppedCount).toBe(0);
  });
});
