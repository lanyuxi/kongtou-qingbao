import { createHash } from 'node:crypto';

import {
  collectSourceJobSchema,
  collectSourceResultSchema,
  type CollectSourceJob,
  type CollectSourceResult,
  type CollectionOutcome,
} from '@airdrop/contracts';
import type {
  CollectionAttemptInput,
  RawItemInput,
  SourceCollectionContext,
  SourceCollectionRepository,
} from '@airdrop/database/collection-worker';
import {
  CollectionContentPolicyError,
  CollectionNetworkPolicyError,
  decodeUtf8,
  decideContentStorage,
  parseCollectionMediaType,
  validateConfiguredCollectionUrl,
} from '@airdrop/domain';

import type {
  Clock,
  ContentHasher,
  FeedParser,
  IdGenerator,
  SafeHttpClient,
  SafeHttpResponse,
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
        );
      }

      if (response.status === 304) {
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
            outcome: 'not_modified',
            errorCode: null,
            errorDetail: null,
          }),
          null,
        );
      }

      let rawText: string;
      let sha256: string;
      let mediaType: string;
      let storageOutcome: 'stored_new_content' | 'unchanged_content';
      try {
        const parsedMediaType = parseCollectionMediaType(response.mediaTypeHeader);
        if (parsedMediaType.family !== 'html' || response.body === null) {
          throw new CollectionContentPolicyError(
            'unsupported_content_type',
            'Official HTML collection requires an HTML body.',
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
              mediaType,
              rawText,
              sha256,
              collectedAt: completedAt,
            })
          : null;
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
      );
    } catch {
      attemptId ??= dependencies.ids.generate();
      return buildResult(job, attemptId, 'persistence_failed', null);
    }
  };
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
): Promise<CollectSourceResult> {
  const result = await repository.commitEndpoint({ attempt, rawItem });
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
    contentKind: 'official_html',
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
