import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  createPromotionRepositoryFromClient,
  PromotionCommandRejectionError,
  PromotionPersistenceError,
} from '../promotion/promotion-repository.js';
import type {
  PromotionFunctionCall,
  PromotionFunctionClient,
  PromotionFunctionTransaction,
} from '../promotion/types.js';

const candidateId = '85000000-0000-4000-8000-000000000001';
const reviewerUserId = '85000000-0000-4000-8000-000000000090';
const commandId = '85000000-0000-4000-8000-000000000101';
const decisionId = '85000000-0000-4000-8000-000000000102';
const signalId = '85000000-0000-4000-8000-000000000103';
const evidenceId = '85000000-0000-4000-8000-000000000104';

describe('PromotionRepository', () => {
  it('loads the default promotion worker export in Node', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import=tsx',
        '--eval',
        "import('@airdrop/database/promotion-worker').then((module) => process.stdout.write(typeof module.createPromotionRepository))",
      ],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('function');
    expect(result.stderr).toBe('');
  });

  it('forwards the exact canonical payload, literal SHA-256 vector, and transaction time', async () => {
    const client = new RecordingClient([[promotedResultRow()]]);

    await expect(createPromotionRepositoryFromClient(client).reviewCandidate(reviewInput()))
      .resolves.toEqual({
        version: 1,
        commandId,
        candidateId,
        candidateVersion: 2,
        decisionId,
        outcome: 'promoted',
        signalId,
        evidenceId,
        replayed: false,
      });

    expect(client.calls).toEqual([{
      functionName: 'execute_extraction_candidate_review',
      args: {
        p_reviewer_user_id: reviewerUserId,
        p_command_payload: '{"candidateId":"85000000-0000-4000-8000-000000000001","decision":"approve","expectedCandidateVersion":1,"note":"Verified exact quote.","reasonCode":"evidence_verified","reviewerUserId":"85000000-0000-4000-8000-000000000090","version":1}',
        p_idempotency_key: 'review-candidate-1',
        p_input_hash: 'b42169ab608fa7f3087bfa75f1b92f723a73c4d3debe8ad4024e2534fae00ef5',
        p_now: '2026-08-20T03:04:05.678Z',
      },
    }]);
    expect(client.transactions).toBe(1);
  });

  it.each([
    [
      'null note',
      null,
      1,
      '{"candidateId":"85000000-0000-4000-8000-000000000001","decision":"approve","expectedCandidateVersion":1,"note":null,"reasonCode":"evidence_verified","reviewerUserId":"85000000-0000-4000-8000-000000000090","version":1}',
      '604a54c555e5deb66746358ac6594734324a5fd8237381a5e7150693ce98cb82',
    ],
    [
      'quotes',
      'He said "yes".',
      1,
      '{"candidateId":"85000000-0000-4000-8000-000000000001","decision":"approve","expectedCandidateVersion":1,"note":"He said \\"yes\\".","reasonCode":"evidence_verified","reviewerUserId":"85000000-0000-4000-8000-000000000090","version":1}',
      'b4214318ad35d35adef150fbbbff6a2231f31de5a9481d266d2b8a7a0d87dc2b',
    ],
    [
      'backslashes',
      'C:\\review\\quote',
      1,
      '{"candidateId":"85000000-0000-4000-8000-000000000001","decision":"approve","expectedCandidateVersion":1,"note":"C:\\\\review\\\\quote","reasonCode":"evidence_verified","reviewerUserId":"85000000-0000-4000-8000-000000000090","version":1}',
      '7b6beabdfeb86542a842f29cdcbdc38e43cb40dfede02f64b686a117084bb540',
    ],
    [
      'permitted controls',
      'A\n\tB\b\fC\rD\u0001E',
      1,
      '{"candidateId":"85000000-0000-4000-8000-000000000001","decision":"approve","expectedCandidateVersion":1,"note":"A\\n\\tB\\b\\fC\\rD\\u0001E","reasonCode":"evidence_verified","reviewerUserId":"85000000-0000-4000-8000-000000000090","version":1}',
      '455b46d121359b3d548badc5efab146b09733bb4677672eb1cca0384f3daa730',
    ],
    [
      'BMP Unicode',
      '审查 café',
      1,
      '{"candidateId":"85000000-0000-4000-8000-000000000001","decision":"approve","expectedCandidateVersion":1,"note":"审查 café","reasonCode":"evidence_verified","reviewerUserId":"85000000-0000-4000-8000-000000000090","version":1}',
      'e1f20ffc8db8244dd4f5a4d004273b78b6a06f6deb1fa6fb7f07aa7fb902da99',
    ],
    [
      'astral Unicode',
      '审查 🚀',
      1,
      '{"candidateId":"85000000-0000-4000-8000-000000000001","decision":"approve","expectedCandidateVersion":1,"note":"审查 🚀","reasonCode":"evidence_verified","reviewerUserId":"85000000-0000-4000-8000-000000000090","version":1}',
      '0c228233b52059c6fb9ae2c3b52491e1b1d1d6f75dd0c33d0d21ad4fad4a5657',
    ],
    [
      'maximum safe version',
      null,
      Number.MAX_SAFE_INTEGER,
      '{"candidateId":"85000000-0000-4000-8000-000000000001","decision":"approve","expectedCandidateVersion":9007199254740991,"note":null,"reasonCode":"evidence_verified","reviewerUserId":"85000000-0000-4000-8000-000000000090","version":1}',
      '9cdb6cb8a20c424d59f289b1852d9d8c021a6d41dd6b4dac0041ef649cb75b9a',
    ],
  ] as const)('matches the independent canonical JSON/SHA vector for %s', async (
    _caseName,
    note,
    expectedCandidateVersion,
    payload,
    inputHash,
  ) => {
    const client = new RecordingClient([[promotedResultRow()]]);

    await createPromotionRepositoryFromClient(client).reviewCandidate({
      ...reviewInput(),
      command: { ...reviewInput().command, note, expectedCandidateVersion },
    });

    expect(client.calls[0]?.args.p_command_payload).toBe(payload);
    expect(client.calls[0]?.args.p_input_hash).toBe(inputHash);
  });

  it.each([
    ['NUL note', { command: { ...reviewInput().command, note: 'before\u0000after' } }],
    ['high lone-surrogate note', { command: { ...reviewInput().command, note: 'high\ud800surrogate' } }],
    ['terminal high-surrogate note', { command: { ...reviewInput().command, note: 'terminal\ud800' } }],
    ['low lone-surrogate note', { command: { ...reviewInput().command, note: 'low\udc00surrogate' } }],
    ['NUL idempotency key', { idempotencyKey: 'review\u0000key' }],
    ['high lone-surrogate idempotency key', { idempotencyKey: 'review\ud800key' }],
    ['terminal high-surrogate idempotency key', { idempotencyKey: 'review\ud800' }],
    ['low lone-surrogate idempotency key', { idempotencyKey: 'review\udc00key' }],
  ])('rejects %s before opening a transaction', async (_caseName, override) => {
    const client = new RecordingClient([[promotedResultRow()]]);

    await expect(createPromotionRepositoryFromClient(client).reviewCandidate({
      ...reviewInput(),
      ...override,
    })).rejects.toEqual(new PromotionPersistenceError());
    expect(client.transactions).toBe(0);
    expect(client.calls).toEqual([]);
  });

  it('preserves PostgreSQL-safe control, BMP, and astral idempotency text', async () => {
    const client = new RecordingClient([[promotedResultRow()]]);
    const idempotencyKey = 'review-\u0001-审查-🚀';

    await createPromotionRepositoryFromClient(client).reviewCandidate({
      ...reviewInput(),
      idempotencyKey,
    });

    expect(client.calls[0]?.args.p_idempotency_key).toBe(idempotencyKey);
  });

  it.each([
    ['BMP', 'k'],
    ['astral', '🚀'],
  ] as const)('counts %s idempotency-key limits in Unicode code points', async (_kind, character) => {
    const maximum = character.repeat(200);
    const accepted = new RecordingClient([[promotedResultRow()]]);

    await createPromotionRepositoryFromClient(accepted).reviewCandidate({
      ...reviewInput(),
      idempotencyKey: maximum,
    });
    expect(accepted.calls[0]?.args.p_idempotency_key).toBe(maximum);

    const rejected = new RecordingClient([[promotedResultRow()]]);
    await expect(createPromotionRepositoryFromClient(rejected).reviewCandidate({
      ...reviewInput(),
      idempotencyKey: character.repeat(201),
    })).rejects.toEqual(new PromotionPersistenceError());
    expect(rejected.transactions).toBe(0);
    expect(rejected.calls).toEqual([]);
  });

  it('preserves the former 101-astral-code-point failure boundary exactly', async () => {
    const idempotencyKey = '🚀'.repeat(101);
    const client = new RecordingClient([[promotedResultRow()]]);

    await createPromotionRepositoryFromClient(client).reviewCandidate({
      ...reviewInput(),
      idempotencyKey,
    });

    expect(client.calls[0]?.args.p_idempotency_key).toBe(idempotencyKey);
  });

  it('parses PostgreSQL bigint wire values and Date transaction timestamps', async () => {
    const repository = createPromotionRepositoryFromClient(new RecordingClient([[
      { ...promotedResultRow(), candidate_version: '2' },
    ]]));

    await expect(repository.reviewCandidate(reviewInput())).resolves.toMatchObject({
      candidateVersion: 2,
    });
  });

  it.each([
    ['fractional bigint', { candidate_version: '2.5' }],
    ['exponent bigint', { candidate_version: '2e0' }],
    ['whitespace bigint', { candidate_version: ' 2' }],
    ['unsafe bigint', { candidate_version: '9007199254740992' }],
    ['zero bigint', { candidate_version: '0' }],
  ])('conceals an invalid %s function result', async (_caseName, override) => {
    const repository = createPromotionRepositoryFromClient(new RecordingClient([[
      { ...promotedResultRow(), ...override },
    ]]));

    await expect(repository.reviewCandidate(reviewInput()))
      .rejects.toEqual(new PromotionPersistenceError());
  });

  it.each([
    ['extra key', { ...promotedResultRow(), untrusted_detail: 'secret' }],
    ['missing key', omitKey(promotedResultRow(), 'evidence_id')],
  ])('rejects a protected-function row with an %s before contract parsing', async (_caseName, row) => {
    const repository = createPromotionRepositoryFromClient(new RecordingClient([[row]]));

    await expect(repository.reviewCandidate(reviewInput()))
      .rejects.toEqual(new PromotionPersistenceError());
  });

  it('rejects an invalid transaction timestamp before invoking the function', async () => {
    const client = new RecordingClient([[promotedResultRow()]]);

    await expect(createPromotionRepositoryFromClient(client).reviewCandidate({
      ...reviewInput(),
      occurredAt: new Date('not-a-date'),
    })).rejects.toEqual(new PromotionPersistenceError());
    expect(client.calls).toEqual([]);
  });

  it.each([
    ['AI101', 'promotion_candidate_not_found'],
    ['AI102', 'promotion_candidate_not_reviewable'],
    ['AI103', 'promotion_version_conflict'],
    ['AI104', 'promotion_idempotency_conflict'],
    ['AI105', 'promotion_reviewer_not_authorized'],
    ['AI106', 'promotion_command_invalid'],
    ['AI107', 'promotion_evidence_quote_invalid'],
    ['AI108', 'promotion_source_identity_mismatch'],
    ['AI109', 'promotion_grounding_failed'],
  ] as const)('maps SQLSTATE %s to stable rejection code %s', async (sqlState, code) => {
    const client = new RecordingClient(
      [],
      Object.assign(new Error('untrusted source body and changed wording'), { code: sqlState }),
    );

    const error = await createPromotionRepositoryFromClient(client)
      .reviewCandidate(reviewInput())
      .catch((cause: unknown) => cause);

    expect(error).toEqual(new PromotionCommandRejectionError(code));
    expect(String(error)).not.toContain('untrusted source body');
  });

  it('does not trust a generic SQLSTATE with a promotion-like message', async () => {
    const client = new RecordingClient(
      [],
      Object.assign(new Error('promotion_version_conflict source payload'), { code: 'P0001' }),
    );

    await expect(createPromotionRepositoryFromClient(client).reviewCandidate(reviewInput()))
      .rejects.toEqual(new PromotionPersistenceError());
  });

  it('conceals unexpected persistence details', async () => {
    const client = new RecordingClient(
      [],
      Object.assign(new Error('password=secret select private_table'), { code: 'XX000' }),
    );

    const error = await createPromotionRepositoryFromClient(client)
      .reviewCandidate(reviewInput())
      .catch((cause: unknown) => cause);

    expect(error).toEqual(new PromotionPersistenceError());
    expect(String(error)).not.toMatch(/password|secret|select|private_table/i);
  });

  it('denies the promotion worker export under browser module resolution', () => {
    const result = spawnSync(
      process.execPath,
      ['--conditions=browser', '--import=tsx', '--eval', "import('@airdrop/database/promotion-worker')"],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '@airdrop/database/promotion-worker is unavailable in browser code.',
    );
    expect(result.stderr).not.toMatch(/postgres(?:\.js)?/i);
  });
});

class RecordingClient implements PromotionFunctionClient {
  readonly calls: PromotionFunctionCall[] = [];
  transactions = 0;

  constructor(
    private readonly responses: unknown[] = [],
    private readonly error?: Error,
  ) {}

  async transaction<T>(work: (transaction: PromotionFunctionTransaction) => Promise<T>): Promise<T> {
    this.transactions += 1;
    if (this.error !== undefined) throw this.error;
    return work({
      invoke: async (call) => {
        this.calls.push(call);
        return this.responses.shift();
      },
    });
  }
}

function reviewInput() {
  return {
    command: {
      version: 1 as const,
      candidateId,
      reviewerUserId,
      expectedCandidateVersion: 1,
      decision: 'approve' as const,
      reasonCode: 'evidence_verified' as const,
      note: 'Verified exact quote.',
    },
    idempotencyKey: 'review-candidate-1',
    occurredAt: new Date('2026-08-20T03:04:05.678Z'),
  };
}

function promotedResultRow() {
  return {
    command_id: commandId,
    candidate_id: candidateId,
    candidate_version: '2',
    decision_id: decisionId,
    outcome: 'promoted',
    signal_id: signalId,
    evidence_id: evidenceId,
    replayed: false,
  };
}

function omitKey(row: Record<string, unknown>, key: string): Record<string, unknown> {
  const result = { ...row };
  delete result[key];
  return result;
}
