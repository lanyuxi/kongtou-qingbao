export { createBrowserSupabaseClient, type BrowserSupabaseClientOptions } from './client.js';
export type { Database, Json } from './generated/database.types.js';
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
