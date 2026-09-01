import type {
  OpportunityListItem,
  ProjectDetail,
  ProjectEvidenceCitation,
  ProjectRepository,
  ProjectScoreFactor,
  ProjectSignal,
  PublicDomainAuthorityList,
  PublicDomainAuthorityListQuery,
  PublicReferenceListQuery,
  PublicReferencePage,
  ReferencePublicRepository,
  SecurityPublicRepository,
} from '@airdrop/database';
import type {
  PublicProjectDomainAuthority,
  PublicProjectReference,
  PublicProjectSecurityState,
} from '@airdrop/contracts';
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

const securityState: PublicProjectSecurityState = {
  version: 1,
  projectId,
  posture: 'blocked',
  activeIncidents: [
    {
      version: 1,
      incidentId: 'b1000000-0000-4000-8000-000000000006',
      target: { type: 'project', id: projectId },
      category: 'phishing',
      severity: 'critical',
      state: 'active',
      publicSummary: '该项目出现仿冒领取页面，请勿在任何页面连接钱包。',
      firstObservedAt: '2026-08-28T00:00:00.000Z',
      lastVerifiedAt: '2026-08-29T00:00:00.000Z',
      indicators: [],
    },
  ],
};

const references: readonly PublicProjectReference[] = [
  {
    projectId,
    referenceId: 'b1000000-0000-4000-8000-000000000007',
    kind: 'official_site',
    label: '官方网站',
    url: 'https://demo.example.test/',
    lastVerifiedAt: '2026-08-30T04:00:00.000Z',
  },
];

const authorities: readonly PublicProjectDomainAuthority[] = [
  {
    projectId,
    authorityId: 'b1000000-0000-4000-8000-000000000008',
    domain: 'demo.example.test',
    grantedAt: '2026-08-30T02:00:00.000Z',
  },
];

describe('loadProjectDetailFromRepository', () => {
  it('loads both score projections and the public security state in parallel with the exact project and immutable score IDs', async () => {
    const repository = new RecordingProjectRepository(projectWithScore, true);
    const securityRepository = new RecordingSecurityPublicRepository();
    const referenceRepository = new RecordingReferencePublicRepository();

    const pendingDetail = loadProjectDetailFromRepository(
      repository,
      securityRepository,
      referenceRepository,
      'demo-project',
    );
    await waitForMicrotasks();

    expect(repository.scoreReads).toEqual([
      { kind: 'factors', projectId, scoreId },
      { kind: 'citations', projectId, scoreId },
    ]);
    expect(securityRepository.reads).toEqual([projectId]);
    expect(referenceRepository.reads).toEqual([
      { kind: 'references', projectId },
      { kind: 'authorities', projectId },
    ]);

    repository.releaseScoreReads();
    securityRepository.release();
    referenceRepository.release();
    await expect(pendingDetail).resolves.toEqual({
      project: projectWithScore,
      signals,
      factors,
      citations,
      security: securityState,
      references,
      authorities,
    });
    expect(repository.signalReads).toEqual([{ projectId, limit: 20 }]);
  });

  it('keeps the reference snapshot independent of a slower score read', async () => {
    const repository = new RecordingProjectRepository(projectWithScore, true);
    const securityRepository = new RecordingSecurityPublicRepository();
    const referenceRepository = new RecordingReferencePublicRepository();
    securityRepository.release();

    const pendingDetail = loadProjectDetailFromRepository(
      repository,
      securityRepository,
      referenceRepository,
      'demo-project',
    );

    // The score reads stay unresolved while the reference reads resolve, so a
    // late score result cannot rewrite the reference snapshot.
    referenceRepository.release();
    await waitForMicrotasks();
    referenceRepository.reads.length = 0;
    repository.releaseScoreReads();

    const detail = await pendingDetail;
    expect(detail?.references).toEqual(references);
    expect(detail?.authorities).toEqual(authorities);
    expect(referenceRepository.reads).toEqual([]);
  });

  it('still reads the public security state when the project has no score', async () => {
    const projectWithoutScore: ProjectDetail = { ...projectWithScore, latestScore: null };
    const repository = new RecordingProjectRepository(projectWithoutScore, false);
    const securityRepository = new RecordingSecurityPublicRepository();
    const referenceRepository = new RecordingReferencePublicRepository();
    securityRepository.release();
    referenceRepository.release();

    await expect(
      loadProjectDetailFromRepository(
        repository,
        securityRepository,
        referenceRepository,
        'demo-project',
      ),
    ).resolves.toEqual({
      project: projectWithoutScore,
      signals,
      factors: [],
      citations: [],
      security: securityState,
      references,
      authorities,
    });
    expect(repository.scoreReads).toEqual([]);
    expect(securityRepository.reads).toEqual([projectId]);
  });

  it('returns null without follow-up reads when the project does not exist', async () => {
    const repository = new RecordingProjectRepository(null, false);
    const securityRepository = new RecordingSecurityPublicRepository();
    const referenceRepository = new RecordingReferencePublicRepository();

    await expect(
      loadProjectDetailFromRepository(
        repository,
        securityRepository,
        referenceRepository,
        'missing-project',
      ),
    ).resolves.toBeNull();
    expect(repository.signalReads).toEqual([]);
    expect(repository.scoreReads).toEqual([]);
    expect(securityRepository.reads).toEqual([]);
    expect(referenceRepository.reads).toEqual([]);
  });
});

class RecordingReferencePublicRepository implements ReferencePublicRepository {
  readonly reads: { readonly kind: 'references' | 'authorities'; readonly projectId: string }[] = [];

  private readonly referenceRead = createDeferred<PublicReferencePage>();
  private readonly authorityRead = createDeferred<PublicDomainAuthorityList>();

  listVerifiedReferences(input: PublicReferenceListQuery): Promise<PublicReferencePage> {
    this.reads.push({ kind: 'references', projectId: input.projectId });
    return this.referenceRead.promise;
  }

  listGrantedDomainAuthorities(
    input: PublicDomainAuthorityListQuery,
  ): Promise<PublicDomainAuthorityList> {
    this.reads.push({ kind: 'authorities', projectId: input.projectId });
    return this.authorityRead.promise;
  }

  release(): void {
    this.referenceRead.resolve({ version: 1, items: references, nextCursor: null });
    this.authorityRead.resolve({ version: 1, items: authorities });
  }
}

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

class RecordingSecurityPublicRepository implements SecurityPublicRepository {
  readonly reads: string[] = [];

  private readonly securityRead = createDeferred<PublicProjectSecurityState>();

  async getProjectSecurity(inputProjectId: string): Promise<PublicProjectSecurityState> {
    this.reads.push(inputProjectId);
    return this.securityRead.promise;
  }

  async listBlockedProjects(): Promise<never> {
    throw new Error('The project detail loader must not list blocked projects.');
  }

  release(): void {
    this.securityRead.resolve(securityState);
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
