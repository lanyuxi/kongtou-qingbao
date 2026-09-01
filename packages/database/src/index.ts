export { createBrowserSupabaseClient, type BrowserSupabaseClientOptions } from './client.js';
export type { Database, Json } from './generated/database.types.js';
export type {
  DomainAuthorityReviewListResult,
  ReferenceReviewListResult,
  ReferenceReviewRepository,
  ReferenceReviewRepositoryErrorCode,
  ReferenceReviewRepositoryOptions,
  ReferenceReviewRpc,
  ReferenceReviewRpcCall,
} from './references/reference-review-repository.js';
export {
  createReferencePublicRepository,
  ReferencePublicProjectionQueryError,
  type PublicDomainAuthorityList,
  type PublicDomainAuthorityListQuery,
  type PublicReferenceListQuery,
  type PublicReferencePage,
  type ReferencePublicRepository,
} from './repositories/reference-public-repository.js';
export {
  createSecurityPublicRepository,
  SecurityPublicProjectionQueryError,
  type PublicBlockedProjectQuery,
  type SecurityPublicRepository,
} from './repositories/security-public-repository.js';
export {
  createExtractionRepository,
  ExtractionPersistenceError,
  type ExtractionCandidateInput,
  type ExtractionCandidateRow,
  type ExtractionRepository,
  type PendingCandidateRecord,
  type PendingExtractionInput,
  type RecordExtractionRunInput,
} from './ai/extraction-repository.js';
export {
  ProjectEvidenceCitationQueryError,
  ProjectScoreFactorQueryError,
  type ProjectEvidenceCitation,
  type ProjectScoreFactor,
} from './repositories/project-score-evidence.js';
export {
  createProjectRepository,
  OpportunityListQueryError,
  ProjectLookupQueryError,
  ProjectSignalQueryError,
  type OpportunityListItem,
  type OpportunityListRow,
  type ProjectDetail,
  type ProjectLifecycle,
  type ProjectRepository,
  type ProjectScore,
  type ProjectScoreRow,
  type ProjectSignal,
  type SignalRow,
  type SignalVerification,
  type SecurityPosture,
} from './repositories/project-repository.js';
export {
  createScoringRepository,
  ScoringPersistenceError,
  type RecordProjectScoreInput,
  type RecordProjectScoreResult,
  type ScoreFactorRecord,
  type ScoringProjectInput,
  type ScoringRepository,
  type ScoringSignalRecord,
} from './scoring/scoring-repository.js';
