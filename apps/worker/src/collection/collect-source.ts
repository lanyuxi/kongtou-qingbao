import { createHash } from 'node:crypto';

import {
  collectSourceJobSchema,
  collectSourceResultSchema,
  type CollectSourceJob,
  type CollectSourceResult,
  type CollectionContentKind,
  type CollectionOutcome,
} from '@airdrop/contracts';
import type {
  CollectionAttemptInput,
  DiscoveredItemInput,
  LatestRawItem,
  RawItemInput,
  SourceCollectionContext,
  SourceCollectionRepository,
} from '@airdrop/database/collection-worker';
import {
  CollectionContentPolicyError,
  CollectionNetworkPolicyError,
  decodeUtf8,
  createStableFeedEntryKey,
  decideContentStorage,
  decideFeedArticleDisposition,
  parseCollectionMediaType,
  selectArticleFetches,
  selectFeedEntries,
  validateConfiguredCollectionUrl,
  type ValidatedCollectionUrl,
} from '@airdrop/domain';

import type {
  Clock,
  ContentHasher,
  FeedParser,
  IdGenerator,
  SafeHttpClient,
  SafeHttpResponse,
  ParsedFeed,
} from './ports.js';

type EndpointFailureOutcome = Extract<
  CollectionOutcome,
  | 'rejected_url'
  | 'rejected_dns_target'
  | 'redirect_rejected'
  | 'unsupported_content_type'
  | 'invalid_text_encoding'
  | 'response_too_large'
  | 'timeout'
  | 'http_error'
  | 'invalid_feed'
>;

export interface CollectSourceDependencies {
  readonly repository: SourceCollectionRepository;
  readonly http: SafeHttpClient;
  readonly feedParser: FeedParser;
  readonly hasher: ContentHasher;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

interface EndpointBuildInput {
  readonly job: CollectSourceJob;
  readonly context: SourceCollectionContext;
  readonly attemptId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly response: SafeHttpResponse | null;
  readonly outcome: CollectionOutcome;
  readonly errorCode: string | null;
  readonly errorDetail: string | null;
}

const FAILURE_DETAILS: Readonly<Record<EndpointFailureOutcome, string>> = {
  rejected_url: 'Configured collection URL was rejected.',
  rejected_dns_target: 'Collection DNS target was rejected.',
  redirect_rejected: 'Collection redirect was rejected.',
  unsupported_content_type: 'Collection content type is unsupported.',
  invalid_text_encoding: 'Collection response is not valid UTF-8.',
  response_too_large: 'Collection response exceeds the size limit.',
  timeout: 'Collection request timed out.',
  http_error: 'Collection request failed.',
  invalid_feed: 'Collection Feed is invalid.',
};

export function createCollectSource(
  dependencies: CollectSourceDependencies,
): (job: CollectSourceJob) => Promise<CollectSourceResult> {
  return async (inputJob) => {
    const job = collectSourceJobSchema.parse(inputJob);
    let attemptId: string | null = null;

    try {
      const committed = await dependencies.repository.findCommitted(job.idempotencyKey);
      if (committed !== null) {
        return collectSourceResultSchema.parse(committed);
      }

      const context = await dependencies.repository.loadContext(
        job.payload.projectId,
        job.payload.sourceId,
      );
      if (context === null) {
        attemptId = dependencies.ids.generate();
        return buildResult(job, attemptId, 'rejected_url', null);
      }

      const latest = await dependencies.repository.loadLatest(
        context.canonicalUrl,
        job.payload.projectId,
        job.payload.sourceId,
      );
      const startedAt = dependencies.clock.now().toISOString();
      try {
        validateContext(context, job);
      } catch (error) {
        const failure = mapEndpointFailure(error);
        const completedAt = dependencies.clock.now().toISOString();
        attemptId = dependencies.ids.generate();
        return await commitAndParse(
          dependencies.repository,
          buildEndpointInput({
            job,
            context,
            attemptId,
            startedAt,
            completedAt,
            response: null,
            outcome: failure,
            errorCode: failure,
            errorDetail: FAILURE_DETAILS[failure],
          }),
          null,
          null,
        );
      }

      let response: SafeHttpResponse;
      try {
        response = await dependencies.http.get({
          url: context.canonicalUrl,
          authorityDomains: context.authorityDomains,
          ifNoneMatch: latest?.etag ?? null,
          ifModifiedSince: latest?.lastModified ?? null,
        });
      } catch (error) {
        const failure = mapEndpointFailure(error);
        const completedAt = dependencies.clock.now().toISOString();
        attemptId = dependencies.ids.generate();
        return await commitAndParse(
          dependencies.repository,
          buildEndpointInput({
            job,
            context,
            attemptId,
            startedAt,
            completedAt,
            response: null,
            outcome: failure,
            errorCode: failure,
            errorDetail: FAILURE_DETAILS[failure],
          }),
          null,
          null,
        );
      }

      if (response.status === 304) {
        const completedAt = dependencies.clock.now().toISOString();
        attemptId = dependencies.ids.generate();
        const outcome = latest === null ? 'http_error' : 'not_modified';
        return await commitAndParse(
          dependencies.repository,
          buildEndpointInput({
            job,
            context,
            attemptId,
            startedAt,
            completedAt,
            response,
            outcome,
            errorCode: latest === null ? 'http_error' : null,
            errorDetail: latest === null ? FAILURE_DETAILS.http_error : null,
          }),
          null,
          latest?.id ?? null,
        );
      }

      let rawText: string;
      let sha256: string;
      let mediaType: string;
      let contentKind: CollectionContentKind;
      let parsedFeed: ParsedFeed | null = null;
      let storageOutcome: 'stored_new_content' | 'unchanged_content';
      try {
        const parsedMediaType = parseCollectionMediaType(response.mediaTypeHeader);
        if (response.body === null) {
          throw new CollectionContentPolicyError(
            'unsupported_content_type',
            'Collection requires a response body.',
          );
        }
        mediaType = parsedMediaType.mediaType;
        sha256 = dependencies.hasher.sha256(response.body);
        rawText = decodeUtf8(response.body);
        storageOutcome = decideContentStorage({
          candidateByteLength: response.decompressedBytes,
          candidateSha256: sha256,
          latestSha256: latest?.sha256 ?? null,
        });
        if (parsedMediaType.family === 'html') {
          contentKind = 'official_html';
        } else if (storageOutcome === 'stored_new_content') {
          parsedFeed = dependencies.feedParser.parse(rawText);
          contentKind = parsedFeed.kind;
        } else {
          contentKind = mediaType === 'application/atom+xml' ? 'atom_feed' : 'rss_feed';
        }
      } catch (error) {
        const failure = mapEndpointFailure(error);
        const completedAt = dependencies.clock.now().toISOString();
        attemptId = dependencies.ids.generate();
        return await commitAndParse(
          dependencies.repository,
          buildEndpointInput({
            job,
            context,
            attemptId,
            startedAt,
            completedAt,
            response,
            outcome: failure,
            errorCode: failure,
            errorDetail: FAILURE_DETAILS[failure],
          }),
          null,
          null,
        );
      }

      const completedAt = dependencies.clock.now().toISOString();
      attemptId = dependencies.ids.generate();
      const rawItem =
        storageOutcome === 'stored_new_content'
          ? buildRawItem({
              id: dependencies.ids.generate(),
              job,
              context,
              response,
              contentKind,
              mediaType,
              rawText,
              sha256,
              collectedAt: completedAt,
            })
          : null;
      if (parsedFeed !== null && rawItem !== null) {
        const discoveryCandidates = buildFeedDiscoveries({
          job,
          context,
          feedRawItemId: rawItem.id,
          parsedFeed,
          ids: dependencies.ids,
        });
        const articleCandidates = selectArticleFetches(
          discoveryCandidates.map((discovery) => ({
            discovery,
            eligible: discovery.disposition === 'eligible',
          })),
        );
        const initialDiscoveries = discoveryCandidates.map((discovery) => {
          if (
            discovery.disposition === 'eligible' &&
            !articleCandidates.some((candidate) => candidate.discovery.id === discovery.id)
          ) {
            return { ...discovery, disposition: 'body_fetch_budget_exhausted' as const };
          }
          return discovery;
        });
        const feedAttempt = {
          ...buildEndpointInput({
            job,
            context,
            attemptId,
            startedAt,
            completedAt,
            response,
            outcome: storageOutcome,
            errorCode: null,
            errorDetail: null,
          }),
          discoveredCount: initialDiscoveries.length,
          bodyFetchCount: articleCandidates.length,
        };
        const committedFeed = await dependencies.repository.commitFeed({
          attempt: feedAttempt,
          rawItem,
          discoveries: initialDiscoveries,
        });
        if (!committedFeed.inserted) {
          return collectSourceResultSchema.parse(committedFeed.result);
        }
        for (const candidate of articleCandidates) {
          const discoveryId = committedFeed.discoveryIds[
            initialDiscoveries.findIndex(({ id }) => id === candidate.discovery.id)
          ];
          if (discoveryId === undefined || candidate.discovery.entryUrl === null) continue;
          await collectArticle({
            dependencies,
            job,
            context,
            feedRawItemId: committedFeed.result.rawItemId ?? rawItem.id,
            discovery: { ...candidate.discovery, id: discoveryId },
          });
        }
        return collectSourceResultSchema.parse(committedFeed.result);
      }
      return await commitAndParse(
        dependencies.repository,
        buildEndpointInput({
          job,
          context,
          attemptId,
          startedAt,
          completedAt,
          response,
          outcome: storageOutcome,
          errorCode: null,
          errorDetail: null,
        }),
        rawItem,
        storageOutcome === 'unchanged_content' ? latest?.id ?? null : null,
      );
    } catch {
      attemptId ??= dependencies.ids.generate();
      return buildResult(job, attemptId, 'persistence_failed', null);
    }
  };
}

function buildFeedDiscoveries(input: {
  readonly job: CollectSourceJob;
  readonly context: SourceCollectionContext;
  readonly feedRawItemId: string;
  readonly parsedFeed: ParsedFeed;
  readonly ids: IdGenerator;
}): DiscoveredItemInput[] {
  const discoveries: DiscoveredItemInput[] = [];
  for (const entry of selectFeedEntries(input.parsedFeed.entries)) {
    const validatedUrl = entry.url === null ? null : normalizeStableEntryUrl(entry.url);
    const stableEntryKey = createStableFeedEntryKey({ id: entry.externalId, validatedUrl });
    if (stableEntryKey === null) continue;
    const disposition = entry.url === null
      ? 'discovered_only'
      : decideFeedArticleDisposition({
          url: entry.url,
          authorityDomains: input.context.authorityDomains,
        });
    discoveries.push({
      id: input.ids.generate(),
      projectId: input.job.payload.projectId,
      sourceId: input.job.payload.sourceId,
      feedRawItemId: input.feedRawItemId,
      stableEntryKey,
      version: 1,
      supersedesDiscoveredItemId: null,
      entryUrl: entry.url,
      title: entry.title,
      summary: entry.summary,
      author: entry.author,
      externalEntryId: entry.externalId,
      publishedAt: entry.publishedAt,
      updatedAt: entry.updatedAt,
      isAuthorityDomain: disposition === 'eligible',
      disposition,
      articleCollectionAttemptId: null,
      articleRawItemId: null,
    });
  }
  return discoveries;
}

function normalizeStableEntryUrl(value: string): ValidatedCollectionUrl | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.port !== '' ||
      url.hostname !== url.hostname.toLowerCase()
    ) return null;
    return { url, hostname: url.hostname };
  } catch {
    return null;
  }
}

async function collectArticle(input: {
  readonly dependencies: CollectSourceDependencies;
  readonly job: CollectSourceJob;
  readonly context: SourceCollectionContext;
  readonly feedRawItemId: string;
  readonly discovery: DiscoveredItemInput;
}): Promise<void> {
  const url = input.discovery.entryUrl;
  if (url === null) return;
  const idempotencyKey = articleIdempotencyKey(
    input.job.idempotencyKey,
    input.feedRawItemId,
    input.discovery.stableEntryKey,
  );
  let latest: LatestRawItem | null;
  try {
    latest = await input.dependencies.repository.loadLatest(
      url,
      input.job.payload.projectId,
      input.job.payload.sourceId,
    );
  } catch {
    await commitArticlePersistenceFailure(input, url, idempotencyKey, 'Article validator persistence failed.');
    return;
  }
  const startedAt = input.dependencies.clock.now().toISOString();
  let response: SafeHttpResponse | null = null;
  let outcome: CollectionOutcome;
  let errorCode: string | null = null;
  let errorDetail: string | null = null;
  let rawItem: RawItemInput | null = null;
  let existingRawItemId: string | null = null;
  try {
    response = await input.dependencies.http.get({
      url,
      authorityDomains: input.context.authorityDomains,
      ifNoneMatch: latest?.etag ?? null,
      ifModifiedSince: latest?.lastModified ?? null,
    });
    if (response.status === 304) {
      if (latest === null) throw Object.assign(new Error('article 304 without prior item'), { code: 'http_error' });
      outcome = 'not_modified';
      existingRawItemId = latest.id;
    } else {
      const mediaType = parseCollectionMediaType(response.mediaTypeHeader);
      if (mediaType.family !== 'html' || response.body === null) {
        throw new CollectionContentPolicyError('unsupported_content_type', 'Feed article requires HTML.');
      }
      const sha256 = input.dependencies.hasher.sha256(response.body);
      const rawText = decodeUtf8(response.body);
      outcome = decideContentStorage({
        candidateByteLength: response.decompressedBytes,
        candidateSha256: sha256,
        latestSha256: latest?.sha256 ?? null,
      });
      if (outcome === 'unchanged_content') {
        existingRawItemId = latest?.id ?? null;
      } else {
        rawItem = {
          id: input.dependencies.ids.generate(),
          projectId: input.job.payload.projectId,
          sourceId: input.job.payload.sourceId,
          parentDiscoveredItemId: input.discovery.id,
          logicalUrl: url,
          finalUrl: response.finalUrl,
          contentKind: 'feed_article_html',
          mediaType: mediaType.mediaType,
          rawText,
          sha256,
          publishedAt: input.discovery.publishedAt,
          collectedAt: input.dependencies.clock.now().toISOString(),
        };
      }
    }
  } catch (error) {
    outcome = mapEndpointFailure(error);
    errorCode = outcome;
    errorDetail = FAILURE_DETAILS[outcome as EndpointFailureOutcome] ?? 'Collection article failed.';
  }
  const completedAt = input.dependencies.clock.now().toISOString();
  const attemptId = input.dependencies.ids.generate();
  const attempt: CollectionAttemptInput = {
    id: attemptId,
    projectId: input.job.payload.projectId,
    sourceId: input.job.payload.sourceId,
    parentDiscoveredItemId: input.discovery.id,
    idempotencyKey,
    requestedUrl: url,
    finalUrl: response?.finalUrl ?? null,
    redirectChain: response?.redirects ?? [],
    startedAt,
    completedAt,
    collectedAt: completedAt,
    httpStatus: response?.status ?? null,
    mediaType: safeMediaType(response?.mediaTypeHeader ?? null),
    etag: response?.etag ?? null,
    lastModified: response?.lastModified ?? null,
    decompressedBytes: response?.decompressedBytes ?? null,
    outcome,
    errorCode,
    errorDetail,
    discoveredCount: 0,
    bodyFetchCount: 0,
  };
  const successor: DiscoveredItemInput = {
    ...input.discovery,
    id: input.dependencies.ids.generate(),
    version: 2,
    supersedesDiscoveredItemId: input.discovery.id,
    disposition: errorCode === null ? 'fetched' : 'fetch_failed',
    articleCollectionAttemptId: attemptId,
    articleRawItemId: existingRawItemId,
  };
  try {
    await input.dependencies.repository.commitArticleOutcome({ attempt, rawItem, discovery: successor });
  } catch {
    const persistenceAttempt: CollectionAttemptInput = {
      ...attempt,
      id: input.dependencies.ids.generate(),
      idempotencyKey: articleIdempotencyKey(
        `${input.job.idempotencyKey}:persistence-failure`,
        input.feedRawItemId,
        input.discovery.stableEntryKey,
      ),
      outcome: 'persistence_failed',
      errorCode: 'persistence_failed',
      errorDetail: 'Article outcome persistence failed.',
    };
    const persistenceSuccessor: DiscoveredItemInput = {
      ...successor,
      id: input.dependencies.ids.generate(),
      disposition: 'fetch_failed',
      articleCollectionAttemptId: persistenceAttempt.id,
      articleRawItemId: null,
    };
    try {
      await input.dependencies.repository.commitArticleOutcome({
        attempt: persistenceAttempt,
        rawItem: null,
        discovery: persistenceSuccessor,
      });
    } catch {
      // Persistence itself can fail; the next article still proceeds.
    }
  }
}

async function commitArticlePersistenceFailure(
  input: {
    readonly dependencies: CollectSourceDependencies;
    readonly job: CollectSourceJob;
    readonly context: SourceCollectionContext;
    readonly feedRawItemId: string;
    readonly discovery: DiscoveredItemInput;
  },
  url: string,
  idempotencyKey: string,
  errorDetail: string,
): Promise<void> {
  const timestamp = input.dependencies.clock.now().toISOString();
  const attemptId = input.dependencies.ids.generate();
  try {
    await input.dependencies.repository.commitArticleOutcome({
      attempt: {
        id: attemptId,
        projectId: input.job.payload.projectId,
        sourceId: input.job.payload.sourceId,
        parentDiscoveredItemId: input.discovery.id,
        idempotencyKey,
        requestedUrl: url,
        finalUrl: null,
        redirectChain: [],
        startedAt: timestamp,
        completedAt: timestamp,
        collectedAt: timestamp,
        httpStatus: null,
        mediaType: null,
        etag: null,
        lastModified: null,
        decompressedBytes: null,
        outcome: 'persistence_failed',
        errorCode: 'persistence_failed',
        errorDetail,
        discoveredCount: 0,
        bodyFetchCount: 0,
      },
      rawItem: null,
      discovery: {
        ...input.discovery,
        id: input.dependencies.ids.generate(),
        version: 2,
        supersedesDiscoveredItemId: input.discovery.id,
        disposition: 'fetch_failed',
        articleCollectionAttemptId: attemptId,
        articleRawItemId: null,
      },
    });
  } catch {
    // Persistence itself failed; the next article still proceeds.
  }
}

function articleIdempotencyKey(commandKey: string, feedRawItemId: string, stableKey: string): string {
  return `article:${createHash('sha256')
    .update(`${commandKey}\n${feedRawItemId}\n${stableKey}`)
    .digest('hex')}`;
}

export function createNodeContentHasher(): ContentHasher {
  return {
    sha256(bytes) {
      return createHash('sha256').update(bytes).digest('hex');
    },
  };
}

function validateContext(context: SourceCollectionContext, job: CollectSourceJob): void {
  if (context.projectId !== job.payload.projectId || context.sourceId !== job.payload.sourceId) {
    throw new Error('source_collection_context_mismatch');
  }
  validateConfiguredCollectionUrl({
    candidateUrl: context.canonicalUrl,
    configuredUrl: context.canonicalUrl,
    authorityDomains: context.authorityDomains,
  });
}

async function commitAndParse(
  repository: SourceCollectionRepository,
  attempt: CollectionAttemptInput,
  rawItem: RawItemInput | null,
  existingRawItemId: string | null,
): Promise<CollectSourceResult> {
  const result = await repository.commitEndpoint({ attempt, rawItem, existingRawItemId });
  return collectSourceResultSchema.parse(result);
}

function buildEndpointInput(input: EndpointBuildInput): CollectionAttemptInput {
  return {
    id: input.attemptId,
    projectId: input.job.payload.projectId,
    sourceId: input.job.payload.sourceId,
    parentDiscoveredItemId: null,
    idempotencyKey: input.job.idempotencyKey,
    requestedUrl: input.context.canonicalUrl,
    finalUrl: input.response?.finalUrl ?? null,
    redirectChain: input.response?.redirects ?? [],
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    collectedAt: input.completedAt,
    httpStatus: input.response?.status ?? null,
    mediaType: safeMediaType(input.response?.mediaTypeHeader ?? null),
    etag: input.response?.etag ?? null,
    lastModified: input.response?.lastModified ?? null,
    decompressedBytes: input.response?.decompressedBytes ?? null,
    outcome: input.outcome,
    errorCode: input.errorCode,
    errorDetail: input.errorDetail,
    discoveredCount: 0,
    bodyFetchCount: 0,
  };
}

function buildRawItem(input: {
  readonly id: string;
  readonly job: CollectSourceJob;
  readonly context: SourceCollectionContext;
  readonly response: SafeHttpResponse;
  readonly contentKind: CollectionContentKind;
  readonly mediaType: string;
  readonly rawText: string;
  readonly sha256: string;
  readonly collectedAt: string;
}): RawItemInput {
  return {
    id: input.id,
    projectId: input.job.payload.projectId,
    sourceId: input.job.payload.sourceId,
    parentDiscoveredItemId: null,
    logicalUrl: input.context.canonicalUrl,
    finalUrl: input.response.finalUrl,
    contentKind: input.contentKind,
    mediaType: input.mediaType,
    rawText: input.rawText,
    sha256: input.sha256,
    publishedAt: null,
    collectedAt: input.collectedAt,
  };
}

function mapEndpointFailure(error: unknown): EndpointFailureOutcome {
  if (
    error instanceof CollectionNetworkPolicyError ||
    error instanceof CollectionContentPolicyError
  ) {
    return error.code;
  }
  if (hasFailureCode(error)) {
    return error.code;
  }
  return 'http_error';
}

function hasFailureCode(error: unknown): error is { readonly code: EndpointFailureOutcome } {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return Object.hasOwn(FAILURE_DETAILS, error.code as PropertyKey);
}

function safeMediaType(header: string | null): string | null {
  try {
    return parseCollectionMediaType(header).mediaType;
  } catch {
    return null;
  }
}

function buildResult(
  job: CollectSourceJob,
  attemptId: string,
  outcome: CollectionOutcome,
  rawItemId: string | null,
): CollectSourceResult {
  return collectSourceResultSchema.parse({
    attemptId,
    projectId: job.payload.projectId,
    sourceId: job.payload.sourceId,
    outcome,
    rawItemId,
    discoveredCount: 0,
    bodyFetchCount: 0,
  });
}
