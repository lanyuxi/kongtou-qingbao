import type {
  TutorialCandidateRepository,
  TutorialGenerationMaterial,
} from '@airdrop/database';
import { describe, expect, it } from 'vitest';

import { ModelProviderError, type StructuredModelClient } from '../../ai/model-client.js';
import {
  hashContent,
  materialHash,
  runTutorialGenerationOnce,
  signalIdsOffenders,
} from '../generate-candidates.js';

const projectId = 'c6000000-0000-4000-8000-000000000001';
const signalId = 'c6000000-0000-4000-8000-000000000002';
const secondSignalId = 'c6000000-0000-4000-8000-000000000003';
const referenceId = 'c6000000-0000-4000-8000-000000000004';

const validPayload = {
  title: '官方空投参与教程',
  summary: '覆盖从钱包连接到任务领取的完整步骤。',
  steps: [
    { title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
    { title: '打开领取页', body: '前往官方领取页查看任务。', links: [{ referenceId }] },
  ],
  sourceSignalIds: [signalId],
  confidence: 80,
};

const material: TutorialGenerationMaterial = {
  projectId,
  projectName: 'Demo Project',
  signals: [
    {
      signalId,
      kind: 'airdrop_campaign',
      title: '空投活动开始',
      summary: '项目方公布了空投活动时间与资格规则。',
      publishedAt: '2026-09-02T04:00:00.000Z',
    },
  ],
  references: [{ referenceId, kind: 'claim_portal', label: '官方领取页' }],
};

class RecordingRepository implements TutorialCandidateRepository {
  readonly runs: {
    readonly inputId: string;
    readonly inputHash: string;
    readonly status: string;
    readonly errorDetail: string | null;
  }[] = [];
  readonly candidates: { readonly projectId: string; readonly kind: string; readonly contentHash: string }[] = [];
  materialLimit = 0;
  succeededHashes: readonly string[] = [];
  insertResult = true;
  runId = 'c6000000-0000-4000-8000-000000000009';

  constructor(private readonly materials: readonly TutorialGenerationMaterial[]) {}

  async listMaterials(limit: number): Promise<readonly TutorialGenerationMaterial[]> {
    this.materialLimit = limit;
    return this.materials;
  }

  async hasSucceededRun(_projectId: string, inputHash: string): Promise<boolean> {
    return this.succeededHashes.includes(inputHash);
  }

  async recordRun(input: {
    readonly inputId: string;
    readonly inputHash: string;
    readonly status: string;
    readonly errorDetail: string | null;
    readonly modelId: string;
    readonly output: unknown;
    readonly usage: unknown;
    readonly latencyMs: number | null;
  }): Promise<string> {
    this.runs.push({
      inputId: input.inputId,
      inputHash: input.inputHash,
      status: input.status,
      errorDetail: input.errorDetail,
    });
    return this.runId;
  }

  async insertCandidate(input: {
    readonly projectId: string;
    readonly kind: string;
    readonly contentHash: string;
  }): Promise<boolean> {
    this.candidates.push({
      projectId: input.projectId,
      kind: input.kind,
      contentHash: input.contentHash,
    });
    return this.insertResult;
  }
}

function modelReturning(responses: readonly string[]): {
  client: StructuredModelClient;
  attempts: () => number;
} {
  let index = 0;
  return {
    attempts: () => index,
    client: {
      async completeJson() {
        const response = responses[Math.min(index, responses.length - 1)] ?? '{}';
        index += 1;
        return {
          jsonText: response,
          modelId: 'demo-model',
          latencyMs: 12,
          usage: null,
        };
      },
    },
  };
}

function failingModel(): StructuredModelClient {
  return {
    async completeJson() {
      throw new ModelProviderError('provider unavailable');
    },
  };
}

function portsWith(
  repository: RecordingRepository,
  client: StructuredModelClient,
): { repository: TutorialCandidateRepository; modelClient: StructuredModelClient } {
  return { repository, modelClient: client };
}

describe('runTutorialGenerationOnce', () => {
  it('writes a candidate when the draft is valid and grounded', async () => {
    const repository = new RecordingRepository([material]);
    const model = modelReturning([JSON.stringify(validPayload)]);
    const summary = await runTutorialGenerationOnce(portsWith(repository, model.client));

    expect(summary).toEqual({
      processed: 1,
      succeeded: 1,
      skippedNoMaterial: 0,
      skippedDuplicate: 0,
      schemaInvalid: 0,
      providerErrors: 0,
      droppedUnallowlisted: 0,
      candidatesInserted: 1,
    });
    expect(repository.runs.map((run) => run.status)).toEqual(['succeeded']);
    expect(repository.candidates).toHaveLength(1);
    expect(repository.candidates[0]?.kind).toBe('airdrop_campaign');
    expect(repository.materialLimit).toBe(5);
  });

  it('derives a deterministic content hash from the project, kind and material', async () => {
    const repository = new RecordingRepository([material]);
    const model = modelReturning([JSON.stringify(validPayload)]);
    await runTutorialGenerationOnce(portsWith(repository, model.client));
    const expected = hashContent(
      `${projectId}:airdrop_campaign:${materialHash(projectId, 'airdrop_campaign', material.signals, material)}`,
    );
    expect(repository.candidates[0]?.contentHash).toBe(expected);
  });

  it('skips material with no participation signals without calling the model', async () => {
    const empty: TutorialGenerationMaterial = {
      ...material,
      signals: [],
    };
    const repository = new RecordingRepository([empty]);
    const model = modelReturning([JSON.stringify(validPayload)]);
    const summary = await runTutorialGenerationOnce(portsWith(repository, model.client));

    expect(summary.skippedNoMaterial).toBe(1);
    expect(summary.candidatesInserted).toBe(0);
    expect(model.attempts()).toBe(0);
    expect(repository.runs[0]?.status).toBe('skipped_no_content');
  });

  it('skips a material whose generation already succeeded', async () => {
    const repository = new RecordingRepository([material]);
    repository.succeededHashes = [
      materialHash(projectId, 'airdrop_campaign', material.signals, material),
    ];
    const model = modelReturning([JSON.stringify(validPayload)]);
    const summary = await runTutorialGenerationOnce(portsWith(repository, model.client));

    expect(summary.skippedDuplicate).toBe(1);
    expect(model.attempts()).toBe(0);
    expect(repository.candidates).toEqual([]);
  });

  it('drops a candidate whose link reference id is not in the allowlist', async () => {
    const hallucinated = {
      ...validPayload,
      steps: [
        { title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
        {
          title: '打开领取页',
          body: '前往官方领取页查看任务。',
          links: [{ referenceId: 'c6000000-0000-4000-8000-000000000099' }],
        },
      ],
    };
    const repository = new RecordingRepository([material]);
    const model = modelReturning([JSON.stringify(hallucinated)]);
    const summary = await runTutorialGenerationOnce(portsWith(repository, model.client));

    expect(summary.droppedUnallowlisted).toBe(1);
    expect(summary.candidatesInserted).toBe(0);
    expect(repository.runs[0]?.status).toBe('grounding_failed');
    expect(repository.runs[0]?.errorDetail).toBe('unallowlisted_1_ids');
  });

  it('drops a candidate that cites a signal outside the material', async () => {
    const repository = new RecordingRepository([material]);
    const model = modelReturning([
      JSON.stringify({ ...validPayload, sourceSignalIds: [secondSignalId] }),
    ]);
    const summary = await runTutorialGenerationOnce(portsWith(repository, model.client));

    expect(summary.droppedUnallowlisted).toBe(1);
    expect(repository.candidates).toEqual([]);
    expect(signalIdsOffenders([secondSignalId], [signalId])).toEqual([secondSignalId]);
  });

  it('records schema failures after one repair attempt and stores nothing', async () => {
    const repository = new RecordingRepository([material]);
    const model = modelReturning(['{"title":"短"}', '{"steps":[]}']);
    const summary = await runTutorialGenerationOnce(portsWith(repository, model.client));

    expect(summary.schemaInvalid).toBe(1);
    expect(summary.candidatesInserted).toBe(0);
    expect(model.attempts()).toBe(2);
    expect(repository.runs[0]?.status).toBe('schema_invalid_after_repair');
  });

  it('classifies provider failures and never retries within the tick', async () => {
    const repository = new RecordingRepository([material]);
    const summary = await runTutorialGenerationOnce({
      repository,
      modelClient: failingModel(),
    });

    expect(summary.providerErrors).toBe(1);
    expect(repository.runs[0]?.status).toBe('provider_error');
  });

  it('rejects steps whose text smuggles a url', async () => {
    const withUrl = {
      ...validPayload,
      steps: [
        { title: '连接钱包 https://evil.example', body: '在官方站点连接钱包并切换网络。', links: [] },
        { title: '打开领取页', body: '前往官方领取页查看任务。', links: [{ referenceId }] },
      ],
    };
    const repository = new RecordingRepository([material]);
    const model = modelReturning([JSON.stringify(withUrl), JSON.stringify(withUrl)]);
    const summary = await runTutorialGenerationOnce(portsWith(repository, model.client));

    expect(summary.schemaInvalid).toBe(1);
    expect(repository.candidates).toEqual([]);
  });

  it('counts nothing when the candidate insert is an idempotent no-op', async () => {
    const repository = new RecordingRepository([material]);
    repository.insertResult = false;
    const model = modelReturning([JSON.stringify(validPayload)]);
    const summary = await runTutorialGenerationOnce(portsWith(repository, model.client));

    expect(summary.succeeded).toBe(1);
    expect(summary.candidatesInserted).toBe(0);
    expect(repository.candidates).toHaveLength(1);
  });
});
