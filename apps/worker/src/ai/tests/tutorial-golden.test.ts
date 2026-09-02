import type {
  TutorialCandidateInsert,
  TutorialCandidateRepository,
  TutorialGenerationMaterial,
  TutorialRunRecord,
} from '@airdrop/database';
import { describe, expect, it } from 'vitest';

import { runTutorialGenerationOnce } from '../../tutorials/generate-candidates.js';
import type { StructuredModelClient } from '../model-client.js';
import {
  canonicalTutorialPayloadKeys,
  tutorialGoldenCases,
  type TutorialGoldenCase,
  type TutorialGoldenMaterial,
} from '../fixtures/tutorial-golden.js';

interface GoldenOutcome {
  readonly stored: number;
  readonly links: readonly string[];
  readonly storedPayloads: readonly string[];
  readonly status: string | undefined;
  readonly providerErrors: number;
}

class GoldenRepository implements TutorialCandidateRepository {
  readonly inserted: TutorialCandidateInsert[] = [];
  readonly runs: TutorialRunRecord[] = [];

  constructor(private readonly materials: readonly TutorialGenerationMaterial[]) {}

  async listMaterials(): Promise<readonly TutorialGenerationMaterial[]> {
    return this.materials;
  }

  async hasSucceededRun(): Promise<boolean> {
    return false;
  }

  async recordRun(input: TutorialRunRecord): Promise<string> {
    this.runs.push(input);
    return '80000000-0000-4000-8000-000000000007';
  }

  async insertCandidate(input: TutorialCandidateInsert): Promise<boolean> {
    this.inserted.push(input);
    return true;
  }
}

function modelAlways(output: unknown): StructuredModelClient {
  return {
    async completeJson() {
      return {
        jsonText: JSON.stringify(output),
        modelId: 'golden-model',
        latencyMs: 1,
        usage: null,
      };
    },
  };
}

function asMaterial(material: TutorialGoldenMaterial): TutorialGenerationMaterial {
  return {
    projectId: material.projectId,
    projectName: material.projectName,
    signals: material.signals.map((signal) => ({
      signalId: signal.signalId,
      kind: signal.kind,
      title: signal.title,
      summary: signal.summary,
      publishedAt: signal.publishedAt,
    })),
    references: material.references,
  };
}

async function runGoldenCase(fixture: TutorialGoldenCase): Promise<GoldenOutcome> {
  const repository = new GoldenRepository([asMaterial(fixture.material)]);
  await runTutorialGenerationOnce({
    repository,
    modelClient: modelAlways(fixture.modelOutput),
  });

  return {
    stored: repository.inserted.length,
    links: repository.inserted.flatMap((candidate) =>
      candidate.payload.steps.flatMap((step) => step.links.map((link) => link.referenceId)),
    ),
    storedPayloads: repository.inserted.map((candidate) => JSON.stringify(candidate.payload)),
    status: repository.runs.at(-1)?.status,
    providerErrors: 0,
  };
}

describe('tutorial generation golden dataset', () => {
  for (const fixture of tutorialGoldenCases) {
    it(`${fixture.id}: ${fixture.intent}`, async () => {
      const outcome = await runGoldenCase(fixture);

      expect(outcome.providerErrors).toBe(0);
      expect(outcome.status).toBe(fixture.expectedStatus);
      expect(outcome.stored).toBe(fixture.expectedStored);
      expect(outcome.links).toEqual(fixture.expectedLinks);
      for (const forbidden of fixture.forbiddenInPayloads ?? []) {
        for (const payload of outcome.storedPayloads) {
          expect(payload).not.toContain(forbidden);
        }
      }
    });
  }

  it('never stores a draft that carries a canonical tutorial ledger key', async () => {
    for (const fixture of tutorialGoldenCases) {
      const outcome = await runGoldenCase(fixture);

      for (const payload of outcome.storedPayloads) {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        for (const key of canonicalTutorialPayloadKeys) {
          expect(Object.keys(parsed)).not.toContain(key);
          expect(payload).not.toContain(`"${key}"`);
        }
      }
    }
  });

  it('keeps every stored link inside the allowlist it was prompted with', async () => {
    for (const fixture of tutorialGoldenCases) {
      const outcome = await runGoldenCase(fixture);
      const allowlist = fixture.material.references.map((reference) => reference.referenceId);

      for (const link of outcome.links) {
        expect(allowlist).toContain(link);
      }
    }
  });

  it('stores step text without urls even when the positive case uses an allowlisted link', async () => {
    const positive = tutorialGoldenCases.find((entry) => entry.id === 'official-announcement');
    expect(positive).toBeDefined();

    const outcome = await runGoldenCase(positive as TutorialGoldenCase);

    expect(outcome.stored).toBe(1);
    for (const payload of outcome.storedPayloads) {
      expect(payload).not.toContain('http://');
      expect(payload).not.toContain('https://');
      expect(payload).not.toContain('www.');
    }
  });
});
