import { pathToFileURL } from 'node:url';

import {
  createPromotionRepository,
  type HistoricalEvidenceRepository,
} from '@airdrop/database/promotion-worker';

const PROMOTION_DATABASE_URL = 'AIRDROP_PROMOTION_DATABASE_URL';
const PROMOTION_REVIEWER_USER_ID = 'AIRDROP_PROMOTION_REVIEWER_USER_ID';
const RECONCILE_LIMIT = 'AIRDROP_EVIDENCE_RECONCILE_LIMIT';
const RECONCILE_AFTER_ID = 'AIRDROP_EVIDENCE_RECONCILE_AFTER_ID';

type Environment = Readonly<Record<string, string | undefined>>;

export interface HistoricalEvidenceReconciliationRepository extends HistoricalEvidenceRepository {
  close(): Promise<void>;
}

export interface HistoricalEvidenceReconciliationSummary {
  readonly processed: number;
  readonly linked: number;
  readonly needsReview: number;
  readonly nextCursor: string | null;
}

export interface RunHistoricalEvidenceReconciliationPorts {
  readonly environment: Environment;
  readonly createRepository: (databaseUrl: string) => HistoricalEvidenceReconciliationRepository;
  readonly clock: () => Date;
  readonly shouldAbort: () => boolean;
}

export interface HistoricalEvidenceReconciliationCliPorts
  extends RunHistoricalEvidenceReconciliationPorts {
  readonly writeStdout: (line: string) => void;
  readonly writeStderr: (line: string) => void;
  readonly setExitCode: (code: number) => void;
}

export async function runHistoricalEvidenceReconciliation(
  ports: RunHistoricalEvidenceReconciliationPorts,
): Promise<HistoricalEvidenceReconciliationSummary> {
  const options = parseOptions(ports.environment);
  const repository = ports.createRepository(options.databaseUrl);
  try {
    const candidates = await repository.listHistoricalCandidates({
      afterCandidateId: options.afterCandidateId,
      limit: options.limit,
    });
    let processed = 0;
    let linked = 0;
    let needsReview = 0;
    let nextCursor: string | null = null;

    for (const candidate of candidates) {
      if (ports.shouldAbort()) break;
      const result = await repository.reconcileHistoricalCandidate({
        candidateId: candidate.candidateId,
        reviewerUserId: options.reviewerUserId,
        expectedCandidateVersion: candidate.candidateVersion,
        idempotencyKey: `historical-evidence-v1:${candidate.candidateId}`,
        occurredAt: ports.clock(),
      });
      processed += 1;
      if (result.outcome === 'promoted') linked += 1;
      else if (result.outcome === 'needs_review') needsReview += 1;
      nextCursor = candidate.candidateId;
    }

    return { processed, linked, needsReview, nextCursor };
  } finally {
    await repository.close();
  }
}

export async function historicalEvidenceReconciliationCliMain(
  ports: HistoricalEvidenceReconciliationCliPorts,
): Promise<void> {
  try {
    const summary = await runHistoricalEvidenceReconciliation(ports);
    ports.writeStdout(`${JSON.stringify(summary)}\n`);
    ports.setExitCode(0);
  } catch {
    ports.writeStderr('historical_evidence_reconciliation_failed\n');
    ports.setExitCode(1);
  }
}

function parseOptions(environment: Environment) {
  return {
    databaseUrl: parseDatabaseUrl(environment[PROMOTION_DATABASE_URL]),
    reviewerUserId: parseUuid(environment[PROMOTION_REVIEWER_USER_ID]),
    limit: parseLimit(environment[RECONCILE_LIMIT]),
    afterCandidateId: parseOptionalUuid(environment[RECONCILE_AFTER_ID]),
  };
}

function parseDatabaseUrl(value: string | undefined): string {
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

function parseLimit(value: string | undefined): number {
  if (value === undefined) return 25;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error('invalid_reconciliation_limit');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('invalid_reconciliation_limit');
  }
  return parsed;
}

function parseOptionalUuid(value: string | undefined): string | null {
  if (value === undefined) return null;
  return parseUuid(value);
}

function parseUuid(value: string | undefined): string {
  if (value === undefined || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
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

let aborted = false;
const markAborted = (): void => { aborted = true; };

const isDirectExecution = (): boolean =>
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution()) {
  process.once('SIGINT', markAborted);
  process.once('SIGTERM', markAborted);
  void historicalEvidenceReconciliationCliMain({
    environment: process.env,
    createRepository: (databaseUrl) => createPromotionRepository(databaseUrl),
    clock: () => new Date(),
    shouldAbort: () => aborted,
    writeStdout: (line) => { process.stdout.write(line); },
    writeStderr: (line) => { process.stderr.write(line); },
    setExitCode: (code) => { process.exitCode = code; },
  });
}
