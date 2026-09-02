import type {
  PublicProjectDomainAuthority,
  PublicProjectReference,
  PublicProjectSecurityState,
  PublicTutorialListItem,
} from '@airdrop/contracts';
import type {
  ProjectDetail,
  ProjectEvidenceCitation,
  ProjectRepository,
  ProjectScoreFactor,
  ProjectSignal,
  ReferencePublicRepository,
  SecurityPublicRepository,
  TutorialPublicRepository,
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
  /**
   * Verified references only. The public projection already excludes candidate,
   * flagged, and withdrawn rows, and every reference under a blocked project, so
   * renderers must treat this as the single source for outbound links.
   */
  readonly references: readonly PublicProjectReference[];
  /**
   * Granted domain authorities. These prove ownership, not destination safety,
   * and must never be rendered as links.
   */
  readonly authorities: readonly PublicProjectDomainAuthority[];
  /**
   * Published tutorials for this project. The projection excludes needs-review,
   * blocked, and retired rows and every tutorial under a blocked project, so
   * renderers treat this as the single source for the tutorial cards.
   */
  readonly tutorials: readonly PublicTutorialListItem[];
}

// A project detail page renders a bounded set of references; deeper paging
// belongs to a dedicated references surface, not to this composition.
//
// Accepted trade-off: `official_website_url` is resolved against this page, so
// a project whose official entry has an old verification time and falls outside
// the first `referenceLimit` rows renders as unverified. That degrades closed —
// a missed link, never an unverified one rendered as an anchor — and a project
// with more than 100 verified references belongs on a dedicated surface.
const referenceLimit = 100;
const tutorialLimit = 20;

export async function loadProjectDetailFromRepository(
  repository: ProjectRepository,
  securityRepository: SecurityPublicRepository,
  referenceRepository: ReferencePublicRepository,
  tutorialRepository: TutorialPublicRepository,
  slug: string,
): Promise<ProjectDetailResult | null> {
  const project = await repository.getProjectBySlug(slug);
  if (project === null) {
    return null;
  }

  const scoreId = project.latestScore?.id;
  // All reads start together and compose once, so a slower score read can never
  // rewrite the reference snapshot taken for this render.
  const [signals, factors, citations, security, references, authorities, tutorials] = await Promise.all([
    repository.listProjectSignals(project.projectId, 20),
    scoreId === undefined ? [] : repository.listCurrentScoreFactors(project.projectId, scoreId),
    scoreId === undefined
      ? []
      : repository.listCurrentScoreEvidenceCitations(project.projectId, scoreId),
    securityRepository.getProjectSecurity(project.projectId),
    referenceRepository
      .listVerifiedReferences({ projectId: project.projectId, cursor: null, limit: referenceLimit })
      .then((page) => page.items),
    referenceRepository
      .listGrantedDomainAuthorities({ projectId: project.projectId, limit: referenceLimit })
      .then((page) => page.items),
    tutorialRepository
      .listProjectTutorials({ projectId: project.projectId, cursor: null, limit: tutorialLimit })
      .then((page) => page.items),
  ]);

  return { project, signals, factors, citations, security, references, authorities, tutorials };
}
