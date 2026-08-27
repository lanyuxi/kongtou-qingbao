import { createHash } from 'node:crypto';

import {
  candidateReviewCommandV1Schema,
  candidateReviewResultV1Schema,
  type CandidateReviewCommandV1,
} from '@airdrop/contracts';
import postgres, { type Sql, type TransactionSql } from 'postgres';

import {
  PromotionCommandRejectionError,
  type PromotionCommandRejectionCode,
  type PromotionFunctionClient,
  type PromotionFunctionTransaction,
  PromotionPersistenceError,
  type GovernedPromotionRepository,
} from './types.js';

export { PromotionCommandRejectionError, PromotionPersistenceError } from './types.js';
export type {
  ExecuteCandidateReviewInput,
  GovernedPromotionRepository,
  HistoricalCandidate,
  HistoricalEvidenceRepository,
  ListHistoricalCandidatesInput,
  PromotionCommandRejectionCode,
  PromotionFunctionCall,
  PromotionFunctionClient,
  PromotionFunctionTransaction,
  PromotionRepository,
  ReconcileHistoricalCandidateInput,
} from './types.js';

export function createPromotionRepository(
  databaseUrl: string,
): GovernedPromotionRepository & { close(): Promise<void> } {
  const sql = postgres(databaseUrl, {
    max: 2,
    idle_timeout: 20,
    connect_timeout: 5,
  });
  const repository = createPromotionRepositoryFromClient(createPostgresPromotionClient(sql));
  return Object.assign(repository, { close: async () => sql.end() });
}

export function createPromotionRepositoryFromClient(
  client: PromotionFunctionClient,
): GovernedPromotionRepository {
  return {
    reviewCandidate: async (input) => {
      try {
        const command = candidateReviewCommandV1Schema.parse(input.command);
        const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
        const occurredAt = parseTimestamp(input.occurredAt);
        const payload = canonicalPayload(command);
        const inputHash = createHash('sha256').update(payload, 'utf8').digest('hex');
        const row = await client.transaction(async (transaction) => oneRow(
          await transaction.invoke({
            functionName: 'execute_extraction_candidate_review',
            args: {
              p_reviewer_user_id: command.reviewerUserId,
              p_command_payload: payload,
              p_idempotency_key: idempotencyKey,
              p_input_hash: inputHash,
              p_now: occurredAt,
            },
          }),
        ));

        return candidateReviewResultV1Schema.parse({
          version: 1,
          commandId: row.command_id,
          candidateId: row.candidate_id,
          candidateVersion: parsePositivePgBigint(row.candidate_version),
          decisionId: row.decision_id,
          outcome: row.outcome,
          signalId: row.signal_id,
          evidenceId: row.evidence_id,
          replayed: row.replayed,
        });
      } catch (error) {
        const rejection = promotionCommandRejection(error);
        if (rejection !== undefined) throw new PromotionCommandRejectionError(rejection);
        throw new PromotionPersistenceError();
      }
    },
    listHistoricalCandidates: async (input) => {
      try {
        const afterCandidateId = parseOptionalUuid(input.afterCandidateId);
        const limit = parseBatchLimit(input.limit);
        const rows = await client.transaction(async (transaction) => manyRows(
          await transaction.invoke({
            functionName: 'list_historical_extraction_candidates',
            args: {
              p_after_candidate_id: afterCandidateId,
              p_limit: String(limit),
            },
          }),
        ));
        return rows.map((row) => ({
          candidateId: parseUuid(row.candidate_id),
          candidateVersion: parsePositivePgBigint(row.candidate_version),
        }));
      } catch {
        throw new PromotionPersistenceError();
      }
    },
    reconcileHistoricalCandidate: async (input) => {
      try {
        const candidateId = parseUuid(input.candidateId);
        const reviewerUserId = parseUuid(input.reviewerUserId);
        const expectedCandidateVersion = parsePositivePgBigint(input.expectedCandidateVersion);
        const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
        const occurredAt = parseTimestamp(input.occurredAt);
        const row = await client.transaction(async (transaction) => oneRow(
          await transaction.invoke({
            functionName: 'reconcile_extraction_candidate_evidence',
            args: {
              p_reviewer_user_id: reviewerUserId,
              p_candidate_id: candidateId,
              p_expected_candidate_version: String(expectedCandidateVersion),
              p_idempotency_key: idempotencyKey,
              p_now: occurredAt,
            },
          }),
        ));

        return candidateReviewResultV1Schema.parse({
          version: 1,
          commandId: row.command_id,
          candidateId: row.candidate_id,
          candidateVersion: parsePositivePgBigint(row.candidate_version),
          decisionId: row.decision_id,
          outcome: row.outcome,
          signalId: row.signal_id,
          evidenceId: row.evidence_id,
          replayed: row.replayed,
        });
      } catch (error) {
        const rejection = promotionCommandRejection(error);
        if (rejection !== undefined) throw new PromotionCommandRejectionError(rejection);
        throw new PromotionPersistenceError();
      }
    },
  };
}

export function createPostgresPromotionClient(sql: Sql): PromotionFunctionClient {
  return {
    transaction: async <T>(work: (transaction: PromotionFunctionTransaction) => Promise<T>) => {
      const result = await sql.begin(async (transactionSql) => {
        await transactionSql`set local role promotion_service`;
        return [await work(createPostgresTransaction(transactionSql))] as const;
      });
      return result[0];
    },
  };
}

function createPostgresTransaction(sql: TransactionSql): PromotionFunctionTransaction {
  return {
    invoke: async ({ functionName, args }) => {
      if (functionName === 'execute_extraction_candidate_review') {
        const reviewerUserId = requiredArgument(args, 'p_reviewer_user_id');
        const payload = requiredArgument(args, 'p_command_payload');
        const idempotencyKey = requiredArgument(args, 'p_idempotency_key');
        const inputHash = requiredArgument(args, 'p_input_hash');
        const occurredAt = requiredArgument(args, 'p_now');
        return sql`
          select * from public.execute_extraction_candidate_review(
            ${reviewerUserId}::uuid,
            ${sql.json(JSON.parse(payload))},
            ${idempotencyKey}::text,
            ${inputHash}::text,
            ${occurredAt}::timestamptz
          )
        `;
      }
      if (functionName === 'list_historical_extraction_candidates') {
        const afterCandidateId = optionalArgument(args, 'p_after_candidate_id');
        const limit = requiredArgument(args, 'p_limit');
        return sql`
          select * from public.list_historical_extraction_candidates(
            ${afterCandidateId}::uuid,
            ${limit}::integer
          )
        `;
      }
      const reviewerUserId = requiredArgument(args, 'p_reviewer_user_id');
      const candidateId = requiredArgument(args, 'p_candidate_id');
      const expectedCandidateVersion = requiredArgument(args, 'p_expected_candidate_version');
      const idempotencyKey = requiredArgument(args, 'p_idempotency_key');
      const occurredAt = requiredArgument(args, 'p_now');
      return sql`
        select * from public.reconcile_extraction_candidate_evidence(
          ${reviewerUserId}::uuid,
          ${candidateId}::uuid,
          ${expectedCandidateVersion}::bigint,
          ${idempotencyKey}::text,
          ${occurredAt}::timestamptz
        )
      `;
    },
  };
}

function canonicalPayload(command: CandidateReviewCommandV1): string {
  return JSON.stringify({
    candidateId: command.candidateId,
    decision: command.decision,
    expectedCandidateVersion: command.expectedCandidateVersion,
    note: command.note,
    reasonCode: command.reasonCode,
    reviewerUserId: command.reviewerUserId,
    version: command.version,
  });
}

function oneRow(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    throw new Error('invalid_result');
  }
  const row = value[0];
  const expected = [
    'candidate_id',
    'candidate_version',
    'command_id',
    'decision_id',
    'evidence_id',
    'outcome',
    'replayed',
    'signal_id',
  ];
  const actual = Object.keys(row).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('invalid_result');
  }
  return row;
}

function manyRows(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) {
    throw new Error('invalid_result');
  }
  const expected = ['candidate_id', 'candidate_version'];
  for (const row of value) {
    const actual = Object.keys(row).sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      throw new Error('invalid_result');
    }
  }
  return value;
}

function promotionCommandRejection(error: unknown): PromotionCommandRejectionCode | undefined {
  switch (sqlState(error)) {
    case 'AI101': return 'promotion_candidate_not_found';
    case 'AI102': return 'promotion_candidate_not_reviewable';
    case 'AI103': return 'promotion_version_conflict';
    case 'AI104': return 'promotion_idempotency_conflict';
    case 'AI105': return 'promotion_reviewer_not_authorized';
    case 'AI106': return 'promotion_command_invalid';
    case 'AI107': return 'promotion_evidence_quote_invalid';
    case 'AI108': return 'promotion_source_identity_mismatch';
    case 'AI109': return 'promotion_grounding_failed';
    case 'AS104': return 'security_reviewer_required';
    case 'AS111': return 'security_review_required';
    case 'AS112': return 'security_promotion_blocked';
    default: return undefined;
  }
}

function sqlState(error: unknown): string | undefined {
  if (!isRecord(error) || typeof error.code !== 'string') return undefined;
  return error.code;
}

function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string'
    || value.length < 1
    || value.trim().length === 0
    || !isPostgresText(value)
    || Array.from(value).length > 200) {
    throw new Error('invalid_idempotency_key');
  }
  return value;
}

function parseBatchLimit(value: unknown): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < 1 || value > 100) {
    throw new Error('invalid_batch_limit');
  }
  return value;
}

function parseOptionalUuid(value: unknown): string | null {
  if (value === null) return null;
  return parseUuid(value);
}

function parseUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('invalid_uuid');
  }
  return value;
}

function isPostgresText(value: string): boolean {
  if (value.includes('\u0000')) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function parsePositivePgBigint(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('invalid_positive_bigint');
    return value;
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error('invalid_positive_bigint');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('unsafe_bigint');
  return parsed;
}

function parseTimestamp(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('invalid_timestamp');
  }
  return value.toISOString();
}

function requiredArgument(args: Readonly<Record<string, string | null>>, key: string): string {
  const value = args[key];
  if (value === undefined || value === null) throw new Error('missing_argument');
  return value;
}

function optionalArgument(args: Readonly<Record<string, string | null>>, key: string): string | null {
  const value = args[key];
  if (value === undefined) throw new Error('missing_argument');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
