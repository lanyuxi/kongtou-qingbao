import type { PublicProjectSecurityState } from '@airdrop/contracts';
import type {
  ProjectDetail,
  ProjectEvidenceCitation,
  ProjectRepository,
  ProjectScoreFactor,
  ProjectSignal,
  SecurityPublicRepository,
} from '@airdrop/database';

export interface ProjectDetailResult {
  readonly project: ProjectDetail;
  readonly signals: readonly ProjectSignal[];
  readonly factors: readonly ProjectScoreFactor[];
  readonly citations: readonly ProjectEvidenceCitation[];
  /**
   * Authoritative posture for the security overlay. `project.securityPosture` is
   * read from `project_current_state` by the Catalog repository and is not used
   * for presentation; both fields derive from the same append-only ledger but are
   * separate reads, so consumers must use this one to stay consistent with the
   * active incident summaries rendered beside it.
   */
  readonly security: PublicProjectSecurityState;
}

export async function loadProjectDetailFromRepository(
  repository: ProjectRepository,
  securityRepository: SecurityPublicRepository,
  slug: string,
): Promise<ProjectDetailResult | null> {
  const project = await repository.getProjectBySlug(slug);
  if (project === null) {
    return null;
  }

  const scoreId = project.latestScore?.id;
  const [signals, factors, citations, security] = await Promise.all([
    repository.listProjectSignals(project.projectId, 20),
    scoreId === undefined ? [] : repository.listCurrentScoreFactors(project.projectId, scoreId),
    scoreId === undefined
      ? []
      : repository.listCurrentScoreEvidenceCitations(project.projectId, scoreId),
    securityRepository.getProjectSecurity(project.projectId),
  ]);
  return { project, signals, factors, citations, security };
}
