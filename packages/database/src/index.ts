export { createBrowserSupabaseClient, type BrowserSupabaseClientOptions } from './client.js';
export type { Database } from './generated/database.types.js';
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
