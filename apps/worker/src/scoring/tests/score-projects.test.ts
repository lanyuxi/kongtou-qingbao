import { describe, expect, it } from 'vitest';

import { SCORING_MODEL_VERSION } from '@airdrop/domain';
import type {
  RecordProjectScoreInput,
  ScoringProjectInput,
} from '@airdrop/database';

import { runScoringOnce } from '../score-projects.js';
import type { ScoringRepository } from '../ports.js';

function createMockRepository(projects: readonly ScoringProjectInput[]): {
  readonly repository: ScoringRepository;
  readonly recorded: RecordProjectScoreInput[];
} {
  const recorded: RecordProjectScoreInput[] = [];
  const repository: ScoringRepository = {
    async listScoringInputs() {
      return projects;
    },
    async recordProjectScore(input) {
      recorded.push(input);
      return { projectScoreId: 'aaaaaaaa-0000-4000-8000-000000000000', created: true, skippedReason: null };
    },
  };
  return { repository, recorded };
}

const projectId = 'fc77de62-1253-4fbc-a589-da4e7084eac7';

describe('runScoringOnce', () => {
  it('scores projects with live signals and records decomposed factors', async () => {
    const { repository, recorded } = createMockRepository([
      {
        projectId,
        projectLifecycle: 'active',
        signals: [
          {
            signalId: '11111111-1111-4111-8111-111111111111',
            verification: 'unverified',
            confidence: 80,
            publishedAt: '2026-08-10T00:00:00.000Z',
            expiresAt: null,
            provenance: 'third_party',
          },
        ],
      },
    ]);

    const summary = await runScoringOnce({
      repository,
      maxProjects: 10,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    });

    expect(summary).toEqual({ projectsScored: 1, projectsSkipped: 0, duplicatesSkipped: 0, securitySkipped: 0 });
    expect(recorded).toHaveLength(1);
    const record = recorded[0];
    expect(record?.modelVersion).toBe(SCORING_MODEL_VERSION);
    expect(record?.inputVersion).toMatch(/^v1:[0-9a-f]{64}$/);
    expect(record?.factors).toHaveLength(9);
    expect(record?.linkedSignalIds).toEqual(['11111111-1111-4111-8111-111111111111']);
    expect(record?.calculatedAtIso).toBe('2026-08-15T00:00:00.000Z');
  });

  it('skips projects whose signals are all expired', async () => {
    const { repository, recorded } = createMockRepository([
      {
        projectId,
        projectLifecycle: 'active',
        signals: [
          {
            signalId: '11111111-1111-4111-8111-111111111111',
            verification: 'verified',
            confidence: 90,
            publishedAt: '2026-01-01T00:00:00.000Z',
            expiresAt: '2026-02-01T00:00:00.000Z',
            provenance: 'official',
          },
        ],
      },
    ]);

    const summary = await runScoringOnce({
      repository,
      maxProjects: 10,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    });

    expect(summary.projectsSkipped).toBe(1);
    expect(summary.projectsScored).toBe(0);
    expect(recorded).toHaveLength(0);
  });

  it('counts duplicate input versions as idempotent skips', async () => {
    const repository: ScoringRepository = {
      async listScoringInputs() {
        return [
          {
            projectId,
            projectLifecycle: 'active',
            signals: [
              {
                signalId: '11111111-1111-4111-8111-111111111111',
                verification: 'unverified',
                confidence: 80,
                publishedAt: '2026-08-10T00:00:00.000Z',
                expiresAt: null,
                provenance: 'third_party',
              },
            ],
          },
        ];
      },
      async recordProjectScore() {
        return { projectScoreId: 'aaaaaaaa-0000-4000-8000-000000000000', created: false, skippedReason: null };
      },
    };

    const summary = await runScoringOnce({
      repository,
      maxProjects: 10,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    });

    expect(summary).toEqual({ projectsScored: 0, projectsSkipped: 0, duplicatesSkipped: 1, securitySkipped: 0 });
  });

  it('counts a security-restricted persistence race separately', async () => {
    const fixture = createMockRepository([
      {
        projectId,
        projectLifecycle: 'active',
        signals: [
          {
            signalId: '11111111-1111-4111-8111-111111111111',
            verification: 'unverified',
            confidence: 80,
            publishedAt: '2026-08-10T00:00:00.000Z',
            expiresAt: null,
            provenance: 'third_party',
          },
        ],
      },
    ]);
    fixture.repository.recordProjectScore = async () => ({
      projectScoreId: null,
      created: false,
      skippedReason: 'security_restricted',
    });

    const summary = await runScoringOnce({
      repository: fixture.repository,
      now: () => new Date('2026-08-15T00:00:00.000Z'),
    });

    expect(summary).toEqual({
      projectsScored: 0,
      projectsSkipped: 0,
      duplicatesSkipped: 0,
      securitySkipped: 1,
    });
  });

  it('passes the project limit through to the repository', async () => {
    const seenLimits: number[] = [];
    const repository: ScoringRepository = {
      async listScoringInputs(limit) {
        seenLimits.push(limit);
        return [];
      },
      async recordProjectScore() {
        throw new Error('unreachable');
      },
    };

    await runScoringOnce({ repository, maxProjects: 7, now: () => new Date('2026-08-15T00:00:00.000Z') });
    expect(seenLimits).toEqual([7]);
  });
});
