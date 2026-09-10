import 'server-only';

import {
  createProjectRepository,
  createReferencePublicRepository,
  createSecurityPublicRepository,
  createTutorialPublicRepository,
  type OpportunityListItem,
} from '@airdrop/database';
import type { PublicBlockedProjectSecurityPage } from '@airdrop/contracts';

import {
  loadProjectDetailFromRepository,
  type ProjectDetailResult,
} from './project-detail-loader.js';
import { createServerSupabaseClient } from './supabase-server.js';

export interface OpportunityOverview {
  readonly top: readonly OpportunityListItem[];
  readonly actNowCount: number;
  readonly highRiskCount: number;
  readonly rumoredCount: number;
  readonly activeCount: number;
  readonly freshestSignalAt: string | null;
}

const overviewLimit = 100;

// The overview shows a fixed grid of cards (five per row, four rows), so it
// asks for exactly that many rather than "whatever is left".
const overviewCardCount = 20;

export async function loadOpportunityOverview(): Promise<OpportunityOverview> {
  const items = await listOpportunities({ limit: overviewLimit });
  const highRiskThreshold = 70;
  return {
    top: items.slice(0, overviewCardCount),
    actNowCount: countBy(items, (item) => item.recommendation === 'act_now'),
    highRiskCount: countBy(items, (item) => item.riskScore >= highRiskThreshold),
    rumoredCount: countBy(items, (item) => item.lifecycle === 'rumored'),
    activeCount: countBy(items, (item) => item.lifecycle === 'active'),
    freshestSignalAt: items.reduce<string | null>(
      (latest, item) =>
        item.latestPublishedSignalAt !== null &&
        (latest === null || item.latestPublishedSignalAt > latest)
          ? item.latestPublishedSignalAt
          : latest,
      null,
    ),
  };
}

export async function listOpportunities(input: {
  readonly limit: number;
  readonly afterScore?: number | null;
  readonly afterProjectId?: string | null;
}): Promise<readonly OpportunityListItem[]> {
  const repository = createProjectRepository(createServerSupabaseClient());
  return repository.listOpportunities({
    limit: input.limit,
    afterScore: input.afterScore ?? null,
    afterProjectId: input.afterProjectId ?? null,
  });
}

export async function loadProjectDetail(slug: string): Promise<ProjectDetailResult | null> {
  const repository = createProjectRepository(createServerSupabaseClient());
  const securityRepository = createSecurityPublicRepository(createServerSupabaseClient());
  const referenceRepository = createReferencePublicRepository(createServerSupabaseClient());
  const tutorialRepository = createTutorialPublicRepository(createServerSupabaseClient());
  return loadProjectDetailFromRepository(
    repository,
    securityRepository,
    referenceRepository,
    tutorialRepository,
    slug,
  );
}

export function listBlockedProjects(input: {
  readonly cursor: string | null;
  readonly limit: number;
}): Promise<PublicBlockedProjectSecurityPage> {
  const repository = createSecurityPublicRepository(createServerSupabaseClient());
  return repository.listBlockedProjects(input);
}

function countBy(
  items: readonly OpportunityListItem[],
  predicate: (item: OpportunityListItem) => boolean,
): number {
  return items.reduce((total, item) => (predicate(item) ? total + 1 : total), 0);
}
