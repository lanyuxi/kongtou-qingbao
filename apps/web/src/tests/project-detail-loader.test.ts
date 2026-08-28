import type {
  OpportunityListItem,
  ProjectDetail,
  ProjectEvidenceCitation,
  ProjectRepository,
  ProjectScoreFactor,
  ProjectSignal,
} from '@airdrop/database';
import { describe, expect, it } from 'vitest';

import { loadProjectDetailFromRepository } from '../lib/project-detail-loader.js';

const projectId = 'b1000000-0000-4000-8000-000000000001';
const scoreId = 'b1000000-0000-4000-8000-000000000002';

const projectWithScore: ProjectDetail = {
  projectId,
  slug: 'demo-project',
  name: '演示项目',
  summary: '用于详情页 loader 测试。',
  lifecycle: 'active',
  primaryChain: 'Ethereum',
  officialWebsiteUrl: 'https://demo.example.test',
  updatedAt: '2026-08-24T00:00:00.000Z',
  securityPosture: 'clear',
  latestScore: {
    id: scoreId,
    modelVersion: 'score-model-v1',
    inputVersion: 'fixture-input-v1',
    opportunityScore: 72.5,
    riskScore: 31,
    confidence: 64,
    recommendation: 'watch',
    explanation: '确定性评分说明。',
    calculatedAt: '2026-08-24T01:00:00.000Z',
  },
};

const signals: readonly ProjectSignal[] = [
  {
    signalType: 'points_program',
    title: '积分计划延长',
    summary: '现有已发布信号时间线必须继续返回。',
    verification: 'verified',
    confidence: 88,
    occurredAt: '2026-08-23T00:00:00.000Z',
    publishedAt: '2026-08-24T00:00:00.000Z',
  },
];

const factors: readonly ProjectScoreFactor[] = [
  {
    axis: 'opportunity',
    factorCode: 'signal_strength',
    contribution: 42.5,
    inputValue: 0.8,
    detail: '加权信号强度 80.0%',
  },
];

const citations: readonly ProjectEvidenceCitation[] = [
  {
    signalId: 'b1000000-0000-4000-8000-000000000003',
    signalTitle: '积分计划延长',
    signalVerification: 'verified',
    signalPublishedAt: '2026-08-24T00:00:00.000Z',
    evidenceId: 'b1000000-0000-4000-8000-000000000004',
    citationText: '官方公告明确说明积分计划将继续开放。',
    evidenceSourceField: 'article_raw_text',
    evidenceVerifiedAt: '2026-08-24T01:00:00.000Z',
    sourceId: 'b1000000-0000-4000-8000-000000000005',
    sourceName: '项目官方博客',
    sourceType: 'official_web',
    sourceIsOfficial: true,
    sourceRelationVerifiedAt: '2026-08-23T00:00:00.000Z',
  },
];

describe('loadProjectDetailFromRepository', () => {
  it('loads both score projections in parallel with the exact project and immutable score IDs', async () => {
    const repository = new RecordingProjectRepository(projectWithScore, true);

    const pendingDetail = loadProjectDetailFromRepository(repository, 'demo-project');
    await waitForMicrotasks();

    expect(repository.scoreReads).toEqual([
      { kind: 'factors', projectId, scoreId },
      { kind: 'citations', projectId, scoreId },
    ]);

    repository.releaseScoreReads();
    await expect(pendingDetail).resolves.toEqual({
      project: projectWithScore,
      signals,
      factors,
      citations,
    });
    expect(repository.signalReads).toEqual([{ projectId, limit: 20 }]);
  });

  it('keeps the signal timeline but skips both score projection reads when no score exists', async () => {
    const projectWithoutScore: ProjectDetail = { ...projectWithScore, latestScore: null };
    const repository = new RecordingProjectRepository(projectWithoutScore, false);

    await expect(
      loadProjectDetailFromRepository(repository, 'demo-project'),
    ).resolves.toEqual({
      project: projectWithoutScore,
      signals,
      factors: [],
      citations: [],
    });
    expect(repository.signalReads).toEqual([{ projectId, limit: 20 }]);
    expect(repository.scoreReads).toEqual([]);
  });

  it('returns null without follow-up reads when the project does not exist', async () => {
    const repository = new RecordingProjectRepository(null, false);

    await expect(
      loadProjectDetailFromRepository(repository, 'missing-project'),
    ).resolves.toBeNull();
    expect(repository.signalReads).toEqual([]);
    expect(repository.scoreReads).toEqual([]);
  });
});

class RecordingProjectRepository implements ProjectRepository {
  readonly signalReads: { readonly projectId: string; readonly limit: number }[] = [];
  readonly scoreReads: {
    readonly kind: 'factors' | 'citations';
    readonly projectId: string;
    readonly scoreId: string;
  }[] = [];

  private readonly factorRead = createDeferred<ProjectScoreFactor[]>();
  private readonly citationRead = createDeferred<ProjectEvidenceCitation[]>();

  constructor(
    private readonly project: ProjectDetail | null,
    private readonly holdScoreReads: boolean,
  ) {}

  async listOpportunities(): Promise<OpportunityListItem[]> {
    return [];
  }

  async getProjectBySlug(): Promise<ProjectDetail | null> {
    return this.project;
  }

  async listProjectSignals(inputProjectId: string, limit: number): Promise<ProjectSignal[]> {
    this.signalReads.push({ projectId: inputProjectId, limit });
    return [...signals];
  }

  listCurrentScoreFactors(
    inputProjectId: string,
    inputScoreId: string,
  ): Promise<ProjectScoreFactor[]> {
    this.scoreReads.push({
      kind: 'factors',
      projectId: inputProjectId,
      scoreId: inputScoreId,
    });
    return this.holdScoreReads ? this.factorRead.promise : Promise.resolve([...factors]);
  }

  listCurrentScoreEvidenceCitations(
    inputProjectId: string,
    inputScoreId: string,
  ): Promise<ProjectEvidenceCitation[]> {
    this.scoreReads.push({
      kind: 'citations',
      projectId: inputProjectId,
      scoreId: inputScoreId,
    });
    return this.holdScoreReads ? this.citationRead.promise : Promise.resolve([...citations]);
  }

  releaseScoreReads(): void {
    this.factorRead.resolve([...factors]);
    this.citationRead.resolve([...citations]);
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function waitForMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
