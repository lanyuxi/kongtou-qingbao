import 'server-only';

export {
  createPromotionRepository,
  PromotionCommandRejectionError,
  PromotionPersistenceError,
} from './promotion-repository.js';
export type {
  ExecuteCandidateReviewInput,
  PromotionCommandRejectionCode,
  PromotionRepository,
} from './promotion-repository.js';
