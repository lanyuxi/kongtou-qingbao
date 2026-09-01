import type { ExtractionClaimType } from '@airdrop/contracts';
import type {
  ExtractionCandidateInput,
  ExtractionRepository,
  PendingExtractionInput,
  RecordExtractionRunInput,
} from '@airdrop/database';
import { describe, expect, it } from 'vitest';

import {
  canonicalReferencePayloadKeys,
  referenceGoldenCases,
  type ReferenceGoldenCase,
} from '../fixtures/reference-golden.js';
import { runExtractionOnce } from '../extract-discovered.js';
import type { StructuredModelClient } from '../model-client.js';

const articleRawItemId = '55555555-5555-4555-8555-555555555555';

interface GoldenOutcome {
  readonly claimTypes: readonly ExtractionClaimType[];
  readonly groundedCount: number;
  readonly canonicalReferenceCount: number;
  readonly processed: number;
  readonly status: string | undefined;
  readonly insertedPayloads: readonly string[];
  readonly schemaInvalid: number;
  readonly providerErrors: number;
}

const safeTerminalStatuses: readonly string[] = [
  'succeeded',
  'grounding_failed',
  'schema_invalid_after_repair',
];

describe('reference extraction golden dataset', () => {
  for (const fixture of referenceGoldenCases) {
    it(`${fixture.id}: ${fixture.intent}`, async () => {
      const outcome = await runGoldenCase(fixture);

      expect(outcome.processed).toBe(1);
      expect(outcome.providerErrors).toBe(0);
      expect(safeTerminalStatuses).toContain(outcome.status);
      expect(outcome.claimTypes).toEqual(fixture.expectedClaimTypes);
      expect(outcome.groundedCount).toBe(fixture.expectedGrounded);
      // The extraction stage may only ever produce a proposal. Nothing here may
      // become a verified reference; that requires a human Evidence-grounded
      // decision recorded in the append-only ledger.
      expect(outcome.canonicalReferenceCount).toBe(0);
      for (const forbidden of fixture.forbiddenInPayloads ?? []) {
        for (const payload of outcome.insertedPayloads) {
          expect(payload).not.toContain(forbidden);
        }
      }
    });
  }

  it('never records a candidate that carries canonical reference fields', async () => {
    for (const fixture of referenceGoldenCases) {
      const outcome = await runGoldenCase(fixture);

      for (const payload of outcome.insertedPayloads) {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        for (const key of canonicalReferencePayloadKeys) {
          expect(Object.keys(parsed)).not.toContain(key);
        }
      }
    }
  });

  it('keeps an injected instruction out of the payload even when the injection produces a grounded candidate', async () => {
    const fixture = referenceGoldenCases.find((entry) => entry.id === 'injected-instruction');
    expect(fixture).toBeDefined();

    const outcome = await runGoldenCase(fixture as ReferenceGoldenCase);

    expect(outcome.groundedCount).toBeGreaterThan(0);
    expect(outcome.insertedPayloads.length).toBeGreaterThan(0);
    for (const forbidden of fixture?.forbiddenInPayloads ?? []) {
      for (const payload of outcome.insertedPayloads) {
        expect(payload).not.toContain(forbidden);
      }
    }
    expect(outcome.canonicalReferenceCount).toBe(0);
  });

  it('drops a proposal whose evidence locator was invented', async () => {
    const fixture = referenceGoldenCases.find((entry) => entry.id === 'invented-evidence-locator');
    expect(fixture).toBeDefined();

    const outcome = await runGoldenCase(fixture as ReferenceGoldenCase);

    expect(outcome.groundedCount).toBe(0);
    expect(outcome.claimTypes).toEqual([]);
  });

  it('rejects a proposal that smuggles a canonical verification through the strict schema', async () => {
    const fixture = referenceGoldenCases.find((entry) => entry.id === 'canonical-field-injection');
    expect(fixture).toBeDefined();

    const outcome = await runGoldenCase(fixture as ReferenceGoldenCase);

    expect(outcome.groundedCount).toBe(0);
    expect(outcome.claimTypes).toEqual([]);
    expect(outcome.schemaInvalid).toBe(1);
    expect(outcome.status).toBe('schema_invalid_after_repair');
  });
});

async function runGoldenCase(fixture: ReferenceGoldenCase): Promise<GoldenOutcome> {
  const runs: RecordExtractionRunInput[] = [];
  const inserted: ExtractionCandidateInput[] = [];

  const repository: ExtractionRepository = {
    async listPendingInputs() {
      return [pendingInput({ articleText: fixture.articleText })];
    },
    async recordExtractionRun(input) {
      runs.push(input);
      return `run-${runs.length}`;
    },
    async insertCandidates(_runId, candidates) {
      inserted.push(...candidates);
      return candidates.length;
    },
    async listPendingCandidates() {
      return [];
    },
  };

  const summary = await runExtractionOnce({
    repository,
    modelClient: deterministicModelClient(JSON.stringify(fixture.modelOutput)),
    maxInputs: 1,
  });

  return {
    claimTypes: inserted.map((candidate) => candidate.payload.claimType),
    groundedCount: inserted.length,
    canonicalReferenceCount: inserted.filter((candidate) =>
      canonicalReferencePayloadKeys.some(
        (key) => key in (candidate.payload as unknown as Record<string, unknown>),
      ),
    ).length,
    processed: summary.processed,
    status: runs.at(-1)?.status,
    insertedPayloads: inserted.map((candidate) => JSON.stringify(candidate.payload)),
    schemaInvalid: summary.schemaInvalid,
    providerErrors: summary.providerErrors,
  };
}

function pendingInput(overrides: Partial<PendingExtractionInput>): PendingExtractionInput {
  return {
    discoveredItemId: '66666666-6666-4666-8666-666666666666',
    projectId: '77777777-7777-4777-8777-777777777777',
    sourceId: '88888888-8888-4888-8888-888888888888',
    articleRawItemId,
    title: 'Reference extraction golden case',
    summary: null,
    entryUrl: 'https://example.dev/blog/post',
    publishedAt: null,
    articleText: '',
    ...overrides,
  };
}

function deterministicModelClient(jsonText: string): StructuredModelClient {
  return {
    async completeJson() {
      return {
        jsonText,
        modelId: 'golden-mock-model',
        latencyMs: 1,
        usage: null,
      };
    },
  };
}
