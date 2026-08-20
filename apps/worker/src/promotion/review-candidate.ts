import { pathToFileURL } from 'node:url';

import {
  candidateReviewCommandV1Schema,
  type CandidateReviewCommandV1,
  type CandidateReviewResultV1,
} from '@airdrop/contracts';
import {
  createPromotionRepository,
  PromotionCommandRejectionError,
  PromotionPersistenceError,
  type PromotionRepository,
} from '@airdrop/database/promotion-worker';

const PROMOTION_DATABASE_URL = 'AIRDROP_PROMOTION_DATABASE_URL';
const PROMOTION_REVIEWER_USER_ID = 'AIRDROP_PROMOTION_REVIEWER_USER_ID';

type Environment = Readonly<Record<string, string | undefined>>;

export interface ReviewCandidateOptions {
  readonly databaseUrl: string;
  readonly idempotencyKey: string;
  readonly command: CandidateReviewCommandV1;
}

export interface ReviewCandidateRepository extends PromotionRepository {
  close(): Promise<void>;
}

export interface RunReviewCandidatePorts {
  readonly createRepository: (databaseUrl: string) => ReviewCandidateRepository;
  readonly clock: () => Date;
  readonly writeStdout: (line: string) => void;
}

export interface ReviewCandidateCliPorts extends RunReviewCandidatePorts {
  readonly writeStderr: (line: string) => void;
  readonly setExitCode: (code: number) => void;
}

export function parseReviewCandidateOptions(
  argv: readonly string[],
  environment: Environment,
): ReviewCandidateOptions {
  const databaseUrl = parsePromotionDatabaseUrl(environment[PROMOTION_DATABASE_URL]);
  const reviewerUserId = environment[PROMOTION_REVIEWER_USER_ID];
  const [operation, candidateId, rawVersion, idempotencyKey, reasonCode] = argv;
  const expectedCandidateVersion = parseExpectedVersion(rawVersion);

  parseIdempotencyKey(idempotencyKey);

  let command: CandidateReviewCommandV1;
  if (operation === 'approve' && argv.length === 4) {
    command = candidateReviewCommandV1Schema.parse({
      version: 1,
      candidateId,
      reviewerUserId,
      expectedCandidateVersion,
      decision: 'approve',
      reasonCode: 'evidence_verified',
      note: null,
    });
  } else if (operation === 'reject' && argv.length === 5) {
    command = candidateReviewCommandV1Schema.parse({
      version: 1,
      candidateId,
      reviewerUserId,
      expectedCandidateVersion,
      decision: 'reject',
      reasonCode,
      note: null,
    });
  } else if (operation === 'needs-review' && argv.length === 5) {
    command = candidateReviewCommandV1Schema.parse({
      version: 1,
      candidateId,
      reviewerUserId,
      expectedCandidateVersion,
      decision: 'needs_review',
      reasonCode,
      note: null,
    });
  } else {
    throw new Error('invalid_review_candidate_arguments');
  }

  return { databaseUrl, idempotencyKey, command };
}

export async function runReviewCandidate(
  options: ReviewCandidateOptions,
  ports: RunReviewCandidatePorts,
): Promise<void> {
  const repository = ports.createRepository(options.databaseUrl);
  try {
    const result = await repository.reviewCandidate({
      command: options.command,
      idempotencyKey: options.idempotencyKey,
      occurredAt: ports.clock(),
    });
    ports.writeStdout(formatResult(result));
  } finally {
    await repository.close();
  }
}

export async function reviewCandidateCliMain(
  argv: readonly string[],
  environment: Environment,
  ports: ReviewCandidateCliPorts,
): Promise<void> {
  try {
    await runReviewCandidate(parseReviewCandidateOptions(argv, environment), ports);
    ports.setExitCode(0);
  } catch (error) {
    const code = error instanceof PromotionCommandRejectionError ||
      error instanceof PromotionPersistenceError
      ? error.code
      : 'promotion_cli_failed';
    ports.writeStderr(`${code}\n`);
    ports.setExitCode(1);
  }
}

function parsePromotionDatabaseUrl(value: string | undefined): string {
  if (value === undefined || value.length === 0 || value.trim() !== value || !isPostgresText(value)) {
    throw new Error('invalid_promotion_database_url');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('invalid_promotion_database_url');
  }
  if ((parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') || parsed.hostname === '') {
    throw new Error('invalid_promotion_database_url');
  }
  return value;
}

function parseExpectedVersion(value: string | undefined): number {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error('invalid_expected_candidate_version');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('invalid_expected_candidate_version');
  }
  return parsed;
}

function parseIdempotencyKey(value: string | undefined): asserts value is string {
  if (value === undefined || value.length === 0 || value.trim().length === 0 ||
    !isPostgresText(value) || Array.from(value).length > 200) {
    throw new Error('invalid_idempotency_key');
  }
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

function formatResult(result: CandidateReviewResultV1): string {
  return `${JSON.stringify({
    commandId: result.commandId,
    candidateId: result.candidateId,
    decisionId: result.decisionId,
    outcome: result.outcome,
    signalId: result.signalId,
    evidenceId: result.evidenceId,
  })}\n`;
}

const isDirectExecution = (): boolean =>
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution()) {
  void reviewCandidateCliMain(process.argv.slice(2), process.env, {
    createRepository: (url) => createPromotionRepository(url),
    clock: () => new Date(),
    writeStdout: (line) => { process.stdout.write(line); },
    writeStderr: (line) => { process.stderr.write(line); },
    setExitCode: (code) => { process.exitCode = code; },
  });
}
