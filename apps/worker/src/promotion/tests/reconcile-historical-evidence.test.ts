import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';
import type { CandidateReviewResultV1 } from '@airdrop/contracts';

import {
  historicalEvidenceReconciliationCliMain,
  runHistoricalEvidenceReconciliation,
  type HistoricalEvidenceReconciliationRepository,
} from '../reconcile-historical-evidence.js';

const reviewerUserId = '86000000-0000-4000-8000-000000000090';
const candidateIds = [
  '86000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000002',
  '86000000-0000-4000-8000-000000000003',
] as const;
const now = new Date('2026-08-20T09:00:00.000Z');

describe('runHistoricalEvidenceReconciliation', () => {
  it('propagates the bounded cursor and commits candidates in stable ascending order', async () => {
    const repository = new RecordingRepository([
      historicalCandidate(candidateIds[1], 3),
      historicalCandidate(candidateIds[2], 5),
    ]);

    await expect(runHistoricalEvidenceReconciliation({
      environment: environment({
        AIRDROP_EVIDENCE_RECONCILE_LIMIT: '2',
        AIRDROP_EVIDENCE_RECONCILE_AFTER_ID: candidateIds[0],
      }),
      createRepository: () => repository,
      clock: () => now,
      shouldAbort: () => false,
    })).resolves.toEqual({
      processed: 2,
      linked: 1,
      needsReview: 1,
      nextCursor: candidateIds[2],
    });

    expect(repository.listInputs).toEqual([{
      afterCandidateId: candidateIds[0],
      limit: 2,
    }]);
    expect(repository.reconcileInputs).toEqual([
      reconcileInput(candidateIds[1], 3),
      reconcileInput(candidateIds[2], 5),
    ]);
    expect(repository.closeCalls).toBe(1);
  });

  it('uses the default limit and exact deterministic keys on an exact replay', async () => {
    const first = new RecordingRepository([
      historicalCandidate(candidateIds[0], 1),
      historicalCandidate(candidateIds[1], 1),
      historicalCandidate(candidateIds[2], 1),
    ]);
    const second = first.replayCopy();

    const firstSummary = await runHistoricalEvidenceReconciliation({
      environment: environment(),
      createRepository: () => first,
      clock: () => now,
      shouldAbort: () => false,
    });
    const replaySummary = await runHistoricalEvidenceReconciliation({
      environment: environment(),
      createRepository: () => second,
      clock: () => now,
      shouldAbort: () => false,
    });

    expect(first.listInputs).toEqual([{ afterCandidateId: null, limit: 25 }]);
    expect(first.reconcileInputs.map((input) => input.idempotencyKey)).toEqual([
      `historical-evidence-v1:${candidateIds[0]}`,
      `historical-evidence-v1:${candidateIds[1]}`,
      `historical-evidence-v1:${candidateIds[2]}`,
    ]);
    expect(replaySummary).toEqual(firstSummary);
    expect(second.reconcileInputs).toEqual(first.reconcileInputs);
  });

  it('honors abort only between committed records', async () => {
    const repository = new RecordingRepository([
      historicalCandidate(candidateIds[0], 1),
      historicalCandidate(candidateIds[1], 1),
      historicalCandidate(candidateIds[2], 1),
    ]);

    await expect(runHistoricalEvidenceReconciliation({
      environment: environment(),
      createRepository: () => repository,
      clock: () => now,
      shouldAbort: () => repository.reconcileInputs.length === 1,
    })).resolves.toEqual({
      processed: 1,
      linked: 1,
      needsReview: 0,
      nextCursor: candidateIds[0],
    });

    expect(repository.reconcileInputs).toEqual([reconcileInput(candidateIds[0], 1)]);
    expect(repository.closeCalls).toBe(1);
  });

  it('returns no next cursor when a continued page processes no candidate', async () => {
    const repository = new RecordingRepository([]);

    await expect(runHistoricalEvidenceReconciliation({
      environment: environment({ AIRDROP_EVIDENCE_RECONCILE_AFTER_ID: candidateIds[2] }),
      createRepository: () => repository,
      clock: () => now,
      shouldAbort: () => false,
    })).resolves.toEqual({
      processed: 0,
      linked: 0,
      needsReview: 0,
      nextCursor: null,
    });
  });

  it.each([
    [{ AIRDROP_PROMOTION_REVIEWER_USER_ID: reviewerUserId }, 'missing database URL'],
    [{ AIRDROP_PROMOTION_DATABASE_URL: 'postgresql://local.invalid/db' }, 'missing reviewer UUID'],
    [{ ...environment(), AIRDROP_EVIDENCE_RECONCILE_LIMIT: '0' }, 'zero limit'],
    [{ ...environment(), AIRDROP_EVIDENCE_RECONCILE_LIMIT: '101' }, 'over-limit batch'],
    [{ ...environment(), AIRDROP_EVIDENCE_RECONCILE_LIMIT: '1.5' }, 'decimal limit'],
    [{ ...environment(), AIRDROP_EVIDENCE_RECONCILE_AFTER_ID: 'not-a-uuid' }, 'malformed cursor'],
  ])('rejects configuration before opening a repository (%s: %s)', async (invalidEnvironment, label) => {
    let opened = false;
    await expect(runHistoricalEvidenceReconciliation({
      environment: invalidEnvironment,
      createRepository: () => {
        opened = true;
        return new RecordingRepository([]);
      },
      clock: () => now,
      shouldAbort: () => false,
    }), label).rejects.toThrow();
    expect(opened).toBe(false);
  });

  it('never falls back to AI-stage credentials', async () => {
    await expect(runHistoricalEvidenceReconciliation({
      environment: {
        AIRDROP_AI_STAGE_DATABASE_URL: 'postgresql://ai-stage.invalid/db',
        AIRDROP_PROMOTION_REVIEWER_USER_ID: reviewerUserId,
      },
      createRepository: () => new RecordingRepository([]),
      clock: () => now,
      shouldAbort: () => false,
    })).rejects.toThrow();
  });

  it('closes the repository when the protected listing fails', async () => {
    let closeCalls = 0;
    await expect(runHistoricalEvidenceReconciliation({
      environment: environment(),
      createRepository: () => ({
        listHistoricalCandidates: async () => {
          throw new Error('database URL and source payload');
        },
        reconcileHistoricalCandidate: async () => {
          throw new Error('unexpected_reconciliation');
        },
        close: async () => { closeCalls += 1; },
      }),
      clock: () => now,
      shouldAbort: () => false,
    })).rejects.toThrow('database URL and source payload');
    expect(closeCalls).toBe(1);
  });
});

describe('historicalEvidenceReconciliationCliMain', () => {
  it('prints one bounded summary containing counts and cursor only', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCodes: number[] = [];
    await historicalEvidenceReconciliationCliMain({
      environment: environment(),
      createRepository: () => new RecordingRepository([
        historicalCandidate(candidateIds[0], 1),
        historicalCandidate(candidateIds[1], 1),
      ]),
      clock: () => now,
      shouldAbort: () => false,
      writeStdout: (line) => { stdout.push(line); },
      writeStderr: (line) => { stderr.push(line); },
      setExitCode: (code) => { exitCodes.push(code); },
    });

    expect(stdout).toEqual([`${JSON.stringify({
      processed: 2,
      linked: 1,
      needsReview: 1,
      nextCursor: candidateIds[1],
    })}\n`]);
    expect(Object.keys(JSON.parse(stdout[0]!))).toEqual([
      'processed', 'linked', 'needsReview', 'nextCursor',
    ]);
    expect(stdout[0]).not.toMatch(/title|url|quote|note|payload|password|reviewer/i);
    expect(stderr).toEqual([]);
    expect(exitCodes).toEqual([0]);
  });

  it('conceals failure details and prints no partial summary', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCodes: number[] = [];
    await historicalEvidenceReconciliationCliMain({
      environment: environment(),
      createRepository: () => ({
        listHistoricalCandidates: async () => [historicalCandidate(candidateIds[0], 1)],
        reconcileHistoricalCandidate: async () => {
          throw new Error('password=secret source URL quote note payload');
        },
        close: async () => undefined,
      }),
      clock: () => now,
      shouldAbort: () => false,
      writeStdout: (line) => { stdout.push(line); },
      writeStderr: (line) => { stderr.push(line); },
      setExitCode: (code) => { exitCodes.push(code); },
    });

    expect(stdout).toEqual([]);
    expect(stderr).toEqual(['historical_evidence_reconciliation_failed\n']);
    expect(stderr.join('')).not.toMatch(/password|secret|source|url|quote|note|payload/i);
    expect(exitCodes).toEqual([1]);
  });

  it('fails closed on direct execution without Promotion credentials', () => {
    const result = spawnSync(
      process.execPath,
      ['--import=tsx', 'src/promotion/reconcile-historical-evidence.ts'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          AIRDROP_AI_STAGE_DATABASE_URL: 'postgresql://ai-stage:secret@127.0.0.1:54322/postgres',
          AIRDROP_PROMOTION_REVIEWER_USER_ID: reviewerUserId,
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('historical_evidence_reconciliation_failed\n');
    expect(result.stderr).not.toMatch(/ai-stage|secret|54322/i);
  });
});

class RecordingRepository implements HistoricalEvidenceReconciliationRepository {
  readonly listInputs: Array<{ readonly afterCandidateId: string | null; readonly limit: number }> = [];
  readonly reconcileInputs: Array<{
    readonly candidateId: string;
    readonly reviewerUserId: string;
    readonly expectedCandidateVersion: number;
    readonly idempotencyKey: string;
    readonly occurredAt: Date;
  }> = [];
  closeCalls = 0;

  constructor(
    private readonly candidates: ReadonlyArray<{
      readonly candidateId: string;
      readonly candidateVersion: number;
    }>,
    private readonly replayed = false,
  ) {}

  replayCopy(): RecordingRepository {
    return new RecordingRepository(this.candidates, true);
  }

  async listHistoricalCandidates(input: {
    readonly afterCandidateId: string | null;
    readonly limit: number;
  }) {
    this.listInputs.push(input);
    return this.candidates;
  }

  async reconcileHistoricalCandidate(input: {
    readonly candidateId: string;
    readonly reviewerUserId: string;
    readonly expectedCandidateVersion: number;
    readonly idempotencyKey: string;
    readonly occurredAt: Date;
  }): Promise<CandidateReviewResultV1> {
    this.reconcileInputs.push(input);
    const index = this.candidates.findIndex((candidate) => candidate.candidateId === input.candidateId);
    const linked = index % 2 === 0;
    const common = {
      version: 1 as const,
      commandId: `86000000-0000-4000-8000-00000000010${index}`,
      candidateId: input.candidateId,
      candidateVersion: input.expectedCandidateVersion + 1,
      decisionId: `86000000-0000-4000-8000-00000000020${index}`,
      replayed: this.replayed,
    };
    if (linked) {
      return {
        ...common,
        outcome: 'promoted',
        signalId: `86000000-0000-4000-8000-00000000030${index}`,
        evidenceId: `86000000-0000-4000-8000-00000000040${index}`,
      };
    }
    return { ...common, outcome: 'needs_review', signalId: null, evidenceId: null };
  }

  async reviewCandidate(): Promise<never> {
    throw new Error('unexpected_live_review');
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

function historicalCandidate(candidateId: string, candidateVersion: number) {
  return { candidateId, candidateVersion };
}

function reconcileInput(candidateId: string, expectedCandidateVersion: number) {
  return {
    candidateId,
    reviewerUserId,
    expectedCandidateVersion,
    idempotencyKey: `historical-evidence-v1:${candidateId}`,
    occurredAt: now,
  };
}

function environment(overrides: Readonly<Record<string, string>> = {}) {
  return {
    AIRDROP_PROMOTION_DATABASE_URL: 'postgresql://promotion-login:local@127.0.0.1:16432/postgres',
    AIRDROP_PROMOTION_REVIEWER_USER_ID: reviewerUserId,
    ...overrides,
  };
}
