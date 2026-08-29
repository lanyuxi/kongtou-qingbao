import type { ExtractionClaimType } from '@airdrop/contracts';
import type {
  ExtractionCandidateInput,
  ExtractionRepository,
  PendingExtractionInput,
  RecordExtractionRunInput,
} from '@airdrop/database';
import { describe, expect, it } from 'vitest';

import { runExtractionOnce } from '../extract-discovered.js';
import type { StructuredModelClient } from '../model-client.js';
import {
  canonicalSecurityPayloadKeys,
  securityExtractionGoldenCases,
  type SecurityExtractionGoldenCase,
} from '../fixtures/security-extraction-golden.js';

const articleRawItemId = '44444444-4444-4444-8444-444444444444';

interface GoldenOutcome {
  readonly claimTypes: readonly ExtractionClaimType[];
  readonly groundedCount: number;
  readonly canonicalIncidentCount: number;
  readonly runs: readonly RecordExtractionRunInput[];
  readonly insertedPayloads: readonly string[];
  readonly schemaInvalid: number;
  readonly providerErrors: number;
}

describe('security extraction golden dataset', () => {
  for (const fixture of securityExtractionGoldenCases) {
    it(`${fixture.id}: ${fixture.intent}`, async () => {
      const outcome = await runGoldenCase(fixture);

      expect(outcome.claimTypes).toEqual(fixture.expectedClaimTypes);
      expect(outcome.groundedCount).toBe(fixture.expectedGrounded);
      expect(outcome.canonicalIncidentCount).toBe(0);
      expect(outcome.providerErrors).toBe(0);
      for (const forbidden of fixture.forbiddenInPayloads ?? []) {
        for (const payload of outcome.insertedPayloads) {
          expect(payload).not.toContain(forbidden);
        }
      }
    });
  }

  it('never records a candidate that carries canonical security fields', async () => {
    for (const fixture of securityExtractionGoldenCases) {
      const outcome = await runGoldenCase(fixture);

      for (const payload of outcome.insertedPayloads) {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        for (const key of canonicalSecurityPayloadKeys) {
          expect(Object.keys(parsed)).not.toContain(key);
        }
      }
    }
  });

  it('keeps every conflicting grounded candidate instead of overwriting history', async () => {
    const fixture = securityExtractionGoldenCases.find((entry) => entry.id === 'conflicting-evidence');
    expect(fixture).toBeDefined();

    const outcome = await runGoldenCase(fixture as SecurityExtractionGoldenCase);

    expect(outcome.groundedCount).toBe(2);
    expect(new Set(outcome.insertedPayloads).size).toBe(2);
  });

  it('rejects a candidate that smuggles a canonical posture through the strict schema', async () => {
    const fixture = securityExtractionGoldenCases.find(
      (entry) => entry.id === 'canonical-field-injection',
    );
    expect(fixture).toBeDefined();

    const outcome = await runGoldenCase(fixture as SecurityExtractionGoldenCase);

    expect(outcome.groundedCount).toBe(0);
    expect(outcome.claimTypes).toEqual([]);
    expect(outcome.schemaInvalid).toBe(1);
    expect(outcome.runs.at(-1)?.status).toBe('schema_invalid_after_repair');
  });
});

async function runGoldenCase(fixture: SecurityExtractionGoldenCase): Promise<GoldenOutcome> {
  const runs: RecordExtractionRunInput[] = [];
  const inserted: ExtractionCandidateInput[] = [];

  const repository: ExtractionRepository = {
    async listPendingInputs() {
      return [
        pendingInput({
          articleText: fixture.articleText,
        }),
      ];
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
    canonicalIncidentCount: inserted.filter((candidate) =>
      canonicalSecurityPayloadKeys.some(
        (key) => key in (candidate.payload as unknown as Record<string, unknown>),
      ),
    ).length,
    runs,
    insertedPayloads: inserted.map((candidate) => JSON.stringify(candidate.payload)),
    schemaInvalid: summary.schemaInvalid,
    providerErrors: summary.providerErrors,
  };
}

function pendingInput(overrides: Partial<PendingExtractionInput>): PendingExtractionInput {
  return {
    discoveredItemId: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    sourceId: '33333333-3333-4333-8333-333333333333',
    articleRawItemId,
    title: 'Security extraction golden case',
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
