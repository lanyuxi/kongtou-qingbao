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

export interface PromotionFunctionCall {
  readonly functionName: 'execute_extraction_candidate_review';
  readonly args: Readonly<Record<string, string>>;
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
  | 'promotion_grounding_failed';

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
