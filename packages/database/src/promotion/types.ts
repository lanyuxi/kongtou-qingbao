import type {
  CandidateReviewCommandV1,
  CandidateReviewResultV1,
} from '@airdrop/contracts';

export interface ExecuteCandidateReviewInput {
  readonly command: CandidateReviewCommandV1;
  readonly idempotencyKey: string;
  readonly occurredAt: Date;
}

export interface PromotionRepository {
  reviewCandidate(input: ExecuteCandidateReviewInput): Promise<CandidateReviewResultV1>;
}

export interface HistoricalCandidate {
  readonly candidateId: string;
  readonly candidateVersion: number;
}

export interface ListHistoricalCandidatesInput {
  readonly afterCandidateId: string | null;
  readonly limit: number;
}

export interface ReconcileHistoricalCandidateInput {
  readonly candidateId: string;
  readonly reviewerUserId: string;
  readonly expectedCandidateVersion: number;
  readonly idempotencyKey: string;
  readonly occurredAt: Date;
}

export interface HistoricalEvidenceRepository {
  listHistoricalCandidates(input: ListHistoricalCandidatesInput): Promise<readonly HistoricalCandidate[]>;
  reconcileHistoricalCandidate(input: ReconcileHistoricalCandidateInput): Promise<CandidateReviewResultV1>;
}

export type GovernedPromotionRepository = PromotionRepository & HistoricalEvidenceRepository;

export interface PromotionFunctionCall {
  readonly functionName:
    | 'execute_extraction_candidate_review'
    | 'list_historical_extraction_candidates'
    | 'reconcile_extraction_candidate_evidence';
  readonly args: Readonly<Record<string, string | null>>;
}

export interface PromotionFunctionTransaction {
  invoke(call: PromotionFunctionCall): Promise<unknown>;
}

export interface PromotionFunctionClient {
  transaction<T>(work: (transaction: PromotionFunctionTransaction) => Promise<T>): Promise<T>;
}

export type PromotionCommandRejectionCode =
  | 'promotion_candidate_not_found'
  | 'promotion_candidate_not_reviewable'
  | 'promotion_version_conflict'
  | 'promotion_idempotency_conflict'
  | 'promotion_reviewer_not_authorized'
  | 'promotion_command_invalid'
  | 'promotion_evidence_quote_invalid'
  | 'promotion_source_identity_mismatch'
  | 'promotion_grounding_failed'
  | 'security_reviewer_required'
  | 'security_review_required'
  | 'security_promotion_blocked';

export class PromotionCommandRejectionError extends Error {
  constructor(readonly code: PromotionCommandRejectionCode) {
    super(code);
    this.name = 'PromotionCommandRejectionError';
  }
}

export class PromotionPersistenceError extends Error {
  readonly code = 'promotion_persistence_failed' as const;

  constructor() {
    super('promotion_persistence_failed');
    this.name = 'PromotionPersistenceError';
  }
}
