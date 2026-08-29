import { spawnSync } from 'node:child_process';

import {
  PromotionCommandRejectionError,
  PromotionPersistenceError,
} from '@airdrop/database/promotion-worker';
import { describe, expect, it } from 'vitest';

import {
  parseReviewCandidateOptions,
  reviewCandidateCliMain,
  runReviewCandidate,
  type ReviewCandidateRepository,
} from '../review-candidate.js';

const candidateId = '10000000-0000-4000-8000-000000000001';
const reviewerUserId = '10000000-0000-4000-8000-000000000090';
const databaseUrl = 'postgresql://promotion-login:local-password@127.0.0.1:54322/postgres';
const now = new Date('2026-08-20T08:00:00.000Z');

const environment = {
  AIRDROP_PROMOTION_DATABASE_URL: databaseUrl,
  AIRDROP_PROMOTION_REVIEWER_USER_ID: reviewerUserId,
};

const promotedResult = {
  version: 1 as const,
  commandId: '10000000-0000-4000-8000-000000000010',
  candidateId,
  candidateVersion: 2,
  decisionId: '10000000-0000-4000-8000-000000000020',
  outcome: 'promoted' as const,
  signalId: '10000000-0000-4000-8000-000000000030',
  evidenceId: '10000000-0000-4000-8000-000000000040',
  replayed: false,
};

describe('parseReviewCandidateOptions', () => {
  it('constructs the fixed approve reason and null note from the exact CLI positions', () => {
    expect(parseReviewCandidateOptions([
      'approve',
      candidateId,
      '1',
      'review-approve-10000000-v1',
    ], environment)).toEqual({
      databaseUrl,
      idempotencyKey: 'review-approve-10000000-v1',
      command: {
        version: 1,
        candidateId,
        reviewerUserId,
        expectedCandidateVersion: 1,
        decision: 'approve',
        reasonCode: 'evidence_verified',
        note: null,
      },
    });
  });

  it('constructs a reject command only from a contract-allowed reason', () => {
    expect(parseReviewCandidateOptions([
      'reject',
      candidateId,
      '1',
      'review-reject-10000000-v1',
      'claim_not_supported',
    ], environment).command).toEqual({
      version: 1,
      candidateId,
      reviewerUserId,
      expectedCandidateVersion: 1,
      decision: 'reject',
      reasonCode: 'claim_not_supported',
      note: null,
    });
  });

  it('maps needs-review to the contract decision and accepts its allowed reason', () => {
    expect(parseReviewCandidateOptions([
      'needs-review',
      candidateId,
      '1',
      'review-park-10000000-v1',
      'grounding_failed',
    ], environment).command).toEqual({
      version: 1,
      candidateId,
      reviewerUserId,
      expectedCandidateVersion: 1,
      decision: 'needs_review',
      reasonCode: 'grounding_failed',
      note: null,
    });
  });

  it.each([
    [{ AIRDROP_PROMOTION_REVIEWER_USER_ID: reviewerUserId }, 'missing database URL'],
    [{ ...environment, AIRDROP_PROMOTION_DATABASE_URL: '  ' }, 'blank database URL'],
    [{ ...environment, AIRDROP_PROMOTION_DATABASE_URL: 'not-a-url' }, 'malformed database URL'],
    [{ ...environment, AIRDROP_PROMOTION_DATABASE_URL: 'https://example.invalid/db' }, 'non-PostgreSQL URL'],
    [{ AIRDROP_PROMOTION_DATABASE_URL: databaseUrl }, 'missing reviewer UUID'],
    [{ ...environment, AIRDROP_PROMOTION_REVIEWER_USER_ID: 'local-admin' }, 'malformed reviewer UUID'],
  ])('rejects %s (%s)', (invalidEnvironment, label) => {
    expect(() => parseReviewCandidateOptions([
      'approve', candidateId, '1', 'review-approve-10000000-v1',
    ], invalidEnvironment), label).toThrow();
  });

  it('never falls back to the AI-stage database URL', () => {
    expect(() => parseReviewCandidateOptions([
      'approve', candidateId, '1', 'review-approve-10000000-v1',
    ], {
      AIRDROP_AI_STAGE_DATABASE_URL: databaseUrl,
      AIRDROP_PROMOTION_REVIEWER_USER_ID: reviewerUserId,
    })).toThrow();
  });

  it.each([
    [['approve', 'not-a-uuid', '1', 'valid-key'], 'malformed candidate UUID'],
    [['approve', candidateId, '0', 'valid-key'], 'zero version'],
    [['approve', candidateId, '-1', 'valid-key'], 'negative version'],
    [['approve', candidateId, '1.0', 'valid-key'], 'decimal version'],
    [['approve', candidateId, '9007199254740992', 'valid-key'], 'unsafe version'],
    [['approve', candidateId, '1', ''], 'empty Idempotency-Key'],
    [['approve', candidateId, '1', '   '], 'blank Idempotency-Key'],
    [['approve', candidateId, '1', 'nul\u0000key'], 'NUL Idempotency-Key'],
    [['approve', candidateId, '1', '\ud800'], 'unpaired-surrogate Idempotency-Key'],
    [['approve', candidateId, '1', 'x'.repeat(201)], 'overlong Idempotency-Key'],
    [['approve', candidateId, '1', 'valid-key', 'evidence_verified'], 'approve reason argument'],
    [['reject', candidateId, '1', 'valid-key'], 'missing reject reason'],
    [['reject', candidateId, '1', 'valid-key', 'grounding_failed'], 'invalid reject reason'],
    [['needs-review', candidateId, '1', 'valid-key', 'claim_not_supported'], 'invalid needs-review reason'],
    [['unknown', candidateId, '1', 'valid-key'], 'unknown command'],
  ])('rejects %s (%s)', (argv, label) => {
    expect(() => parseReviewCandidateOptions(argv, environment), label).toThrow();
  });

  it('accepts and preserves an exact 200-code-point PostgreSQL Idempotency-Key', () => {
    const key = ` ${'🚀'.repeat(198)} `;
    expect(Array.from(key)).toHaveLength(200);

    expect(parseReviewCandidateOptions([
      'approve', candidateId, '9007199254740991', key,
    ], environment)).toMatchObject({
      idempotencyKey: key,
      command: { expectedCandidateVersion: Number.MAX_SAFE_INTEGER },
    });
  });
});

describe('runReviewCandidate', () => {
  it('opens once, invokes once at the injected time, prints one bounded IDs/outcome line, and closes', async () => {
    const events: string[] = [];
    const repository: ReviewCandidateRepository = {
      reviewCandidate: async (input) => {
        events.push(`review:${JSON.stringify(input)}`);
        return promotedResult;
      },
      close: async () => { events.push('close'); },
    };
    const output: string[] = [];
    const options = parseReviewCandidateOptions([
      'approve', candidateId, '1', 'review-approve-10000000-v1',
    ], environment);

    await runReviewCandidate(options, {
      createRepository: (url) => {
        events.push(`open:${url}`);
        return repository;
      },
      clock: () => now,
      writeStdout: (line) => { output.push(line); },
    });

    expect(events).toEqual([
      `open:${databaseUrl}`,
      `review:${JSON.stringify({
        command: options.command,
        idempotencyKey: options.idempotencyKey,
        occurredAt: now,
      })}`,
      'close',
    ]);
    expect(output).toEqual([
      `${JSON.stringify({
        commandId: promotedResult.commandId,
        candidateId: promotedResult.candidateId,
        decisionId: promotedResult.decisionId,
        outcome: promotedResult.outcome,
        signalId: promotedResult.signalId,
        evidenceId: promotedResult.evidenceId,
      })}\n`,
    ]);
    expect(output[0]!.length).toBeLessThan(500);
    expect(output[0]).not.toContain(databaseUrl);
    expect(output[0]).not.toContain(reviewerUserId);
  });

  it('closes the repository when review rejects and writes no success output', async () => {
    let closeCalls = 0;
    const output: string[] = [];
    const options = parseReviewCandidateOptions([
      'approve', candidateId, '1', 'review-approve-10000000-v1',
    ], environment);

    await expect(runReviewCandidate(options, {
      createRepository: () => ({
        reviewCandidate: async () => { throw new PromotionCommandRejectionError('promotion_version_conflict'); },
        close: async () => { closeCalls += 1; },
      }),
      clock: () => now,
      writeStdout: (line) => { output.push(line); },
    })).rejects.toEqual(new PromotionCommandRejectionError('promotion_version_conflict'));

    expect(closeCalls).toBe(1);
    expect(output).toEqual([]);
  });

  it('closes the repository when stdout fails', async () => {
    let closeCalls = 0;
    const options = parseReviewCandidateOptions([
      'approve', candidateId, '1', 'review-approve-10000000-v1',
    ], environment);

    await expect(runReviewCandidate(options, {
      createRepository: () => ({
        reviewCandidate: async () => promotedResult,
        close: async () => { closeCalls += 1; },
      }),
      clock: () => now,
      writeStdout: () => { throw new Error('stdout_failed'); },
    })).rejects.toThrow('stdout_failed');

    expect(closeCalls).toBe(1);
  });
});

describe('reviewCandidateCliMain', () => {
  it.each([
    [new PromotionCommandRejectionError('promotion_idempotency_conflict'), 'promotion_idempotency_conflict'],
    [new PromotionCommandRejectionError('security_reviewer_required'), 'security_reviewer_required'],
    [new PromotionCommandRejectionError('security_review_required'), 'security_review_required'],
    [new PromotionCommandRejectionError('security_promotion_blocked'), 'security_promotion_blocked'],
    [new PromotionPersistenceError(), 'promotion_persistence_failed'],
  ])('prints only the stable repository error code', async (failure, expectedCode) => {
    const stderr: string[] = [];
    const exitCodes: number[] = [];

    await reviewCandidateCliMain(
      ['approve', candidateId, '1', 'review-approve-10000000-v1'],
      environment,
      mainPorts({ failure, stderr, exitCodes }),
    );

    expect(stderr).toEqual([`${expectedCode}\n`]);
    expect(exitCodes).toEqual([1]);
  });

  it('conceals unknown error messages, connection values, source text, notes, and stack traces', async () => {
    const stderr: string[] = [];
    const exitCodes: number[] = [];
    const secret = `${databaseUrl} source-body reviewer-note`;
    const failure = new Error(secret);

    await reviewCandidateCliMain(
      ['approve', candidateId, '1', 'review-approve-10000000-v1'],
      environment,
      mainPorts({ failure, stderr, exitCodes }),
    );

    expect(stderr).toEqual(['promotion_cli_failed\n']);
    expect(stderr.join('')).not.toContain(secret);
    expect(stderr.join('')).not.toContain('Error:');
    expect(exitCodes).toEqual([1]);
  });

  it('does not self-invoke on import and direct invalid execution fails with one bounded code', () => {
    const result = spawnSync(
      process.execPath,
      ['--import=tsx', 'src/promotion/review-candidate.ts', 'approve', candidateId, '1', 'valid-key'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          AIRDROP_AI_STAGE_DATABASE_URL: databaseUrl,
          AIRDROP_PROMOTION_REVIEWER_USER_ID: reviewerUserId,
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('promotion_cli_failed\n');
    expect(result.stderr.length).toBeLessThan(100);
    expect(result.stderr).not.toContain(databaseUrl);
  });
});

function mainPorts(input: {
  readonly failure: Error;
  readonly stderr: string[];
  readonly exitCodes: number[];
}) {
  const repository: ReviewCandidateRepository = {
    reviewCandidate: async () => { throw input.failure; },
    close: async () => undefined,
  };
  return {
    createRepository: (): ReviewCandidateRepository => repository,
    clock: () => now,
    writeStdout: () => undefined,
    writeStderr: (line: string) => { input.stderr.push(line); },
    setExitCode: (code: number) => { input.exitCodes.push(code); },
  };
}
