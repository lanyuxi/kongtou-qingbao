import type {
  CollectSourceResult,
  CollectionContentKind,
  CollectionOutcome,
} from '@airdrop/contracts';

import type { Database, Json } from '../generated/database.types.js';

export type DiscoveryDisposition = Database['public']['Enums']['discovery_disposition'];

export interface SourceCollectionContext {
  readonly projectId: string;
  readonly sourceId: string;
  readonly canonicalUrl: string;
  readonly authorityDomains: readonly string[];
}

export interface LatestRawItem {
  readonly id: string;
  readonly logicalUrl: string;
  readonly finalUrl: string;
  readonly sha256: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly collectedAt: string;
}

export interface RedirectHop {
  readonly hop: number;
  readonly status: number;
  readonly url: string;
}

export interface CollectionAttemptInput {
  readonly id: string;
  readonly projectId: string;
  readonly sourceId: string;
  readonly parentDiscoveredItemId: string | null;
  readonly idempotencyKey: string;
  readonly requestedUrl: string;
  readonly finalUrl: string | null;
  readonly redirectChain: readonly RedirectHop[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly collectedAt: string;
  readonly httpStatus: number | null;
  readonly mediaType: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly decompressedBytes: number | null;
  readonly outcome: CollectionOutcome;
  readonly errorCode: string | null;
  readonly errorDetail: string | null;
  readonly discoveredCount: number;
  readonly bodyFetchCount: number;
}

export interface RawItemInput {
  readonly id: string;
  readonly projectId: string;
  readonly sourceId: string;
  readonly parentDiscoveredItemId: string | null;
  readonly logicalUrl: string;
  readonly finalUrl: string;
  readonly contentKind: CollectionContentKind;
  readonly mediaType: string;
  readonly rawText: string;
  readonly sha256: string;
  readonly publishedAt: string | null;
  readonly collectedAt: string;
}

export interface DiscoveredItemInput {
  readonly id: string;
  readonly projectId: string;
  readonly sourceId: string;
  readonly feedRawItemId: string;
  readonly stableEntryKey: string;
  readonly version: number;
  readonly supersedesDiscoveredItemId: string | null;
  readonly entryUrl: string | null;
  readonly title: string | null;
  readonly summary: string | null;
  readonly author: string | null;
  readonly externalEntryId: string | null;
  readonly publishedAt: string | null;
  readonly updatedAt: string | null;
  readonly isAuthorityDomain: boolean;
  readonly disposition: DiscoveryDisposition;
  readonly articleCollectionAttemptId: string | null;
  readonly articleRawItemId: string | null;
}

export interface CommitEndpointInput {
  readonly attempt: CollectionAttemptInput;
  readonly rawItem: RawItemInput | null;
  readonly existingRawItemId: string | null;
}

export interface CommitFeedInput {
  readonly attempt: CollectionAttemptInput;
  readonly rawItem: RawItemInput;
  readonly discoveries: readonly DiscoveredItemInput[];
}

export interface CommitFeedResult {
  readonly result: CollectSourceResult;
  readonly discoveryIds: readonly string[];
}

export interface CommitArticleOutcomeInput {
  readonly attempt: CollectionAttemptInput;
  readonly rawItem: RawItemInput | null;
  readonly discovery: DiscoveredItemInput;
}

export interface SourceCollectionRepository {
  loadContext(projectId: string, sourceId: string): Promise<SourceCollectionContext | null>;
  findCommitted(idempotencyKey: string): Promise<CollectSourceResult | null>;
  loadLatest(
    logicalUrl: string,
    projectId: string,
    sourceId: string,
  ): Promise<LatestRawItem | null>;
  commitEndpoint(input: CommitEndpointInput): Promise<CollectSourceResult>;
  commitFeed(input: CommitFeedInput): Promise<CommitFeedResult>;
  commitArticleOutcome(input: CommitArticleOutcomeInput): Promise<void>;
}

export function redirectChainAsJson(redirectChain: readonly RedirectHop[]): Json {
  return redirectChain.map(({ hop, status, url }) => ({ hop, status, url }));
}
