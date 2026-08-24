import type {
  ProjectDetail,
  ProjectEvidenceCitation,
  ProjectRepository,
  ProjectScoreFactor,
  ProjectSignal,
} from '@airdrop/database';

export interface ProjectDetailResult {
  readonly project: ProjectDetail;
  readonly signals: readonly ProjectSignal[];
  readonly factors: readonly ProjectScoreFactor[];
  readonly citations: readonly ProjectEvidenceCitation[];
}

export async function loadProjectDetailFromRepository(
  repository: ProjectRepository,
  slug: string,
): Promise<ProjectDetailResult | null> {
  const project = await repository.getProjectBySlug(slug);
  if (project === null) {
    return null;
  }

  const signals = await repository.listProjectSignals(project.projectId, 20);
  const scoreId = project.latestScore?.id;
  if (scoreId === undefined) {
    return { project, signals, factors: [], citations: [] };
  }

  const [factors, citations] = await Promise.all([
    repository.listCurrentScoreFactors(project.projectId, scoreId),
    repository.listCurrentScoreEvidenceCitations(project.projectId, scoreId),
  ]);
  return { project, signals, factors, citations };
}
