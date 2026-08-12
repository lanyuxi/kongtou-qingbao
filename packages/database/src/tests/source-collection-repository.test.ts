import { describe, expect, expectTypeOf, it } from 'vitest';

import type { CollectSourceResult } from '@airdrop/contracts';

import {
  createSourceCollectionRepositoryFromTransactions,
  SourceCollectionPersistenceError,
  type CollectionTransaction,
  type CollectionTransactionRunner,
} from '../collection/source-collection-repository.js';
import type {
  CollectionAttemptInput,
  CommitArticleOutcomeInput,
  CommitEndpointInput,
  CommitFeedInput,
  RawItemInput,
  SourceCollectionRepository,
} from '../collection/types.js';

const projectId = '50000000-0000-4000-8000-000000000001';
const sourceId = '50000000-0000-4000-8000-000000000002';
const attemptId = '50000000-0000-4000-8000-000000000003';
const rawItemId = '50000000-0000-4000-8000-000000000004';
const discoveredItemId = '50000000-0000-4000-8000-000000000005';

describe('SourceCollectionRepository', () => {
  it('executes every operation in a transaction after assuming the fixed worker role', async () => {
    const harness = createHarness();
    const repository = createSourceCollectionRepositoryFromTransactions(harness.run);

    await repository.loadContext(projectId, sourceId);
    await repository.findCommitted('collect:one');
    await repository.loadLatest('https://official.test/', projectId, sourceId);
    await repository.commitEndpoint(endpointInput());
    await repository.commitFeed(feedInput());
    await repository.commitArticleOutcome(articleInput());

    expect(harness.transactions).toHaveLength(6);
    expect(harness.transactions.every((events) => events[0] === 'set local role collection_worker')).toBe(
      true,
    );
  });

  it('exposes only persistence inputs and does not accept network callbacks', () => {
    expectTypeOf<SourceCollectionRepository['commitEndpoint']>().parameter(0).toEqualTypeOf<CommitEndpointInput>();
    expectTypeOf<CommitEndpointInput>().not.toHaveProperty('fetch');
    expectTypeOf<CommitFeedInput>().not.toHaveProperty('request');
    expectTypeOf<CommitArticleOutcomeInput>().not.toHaveProperty('networkCallback');
  });

  it('commits an endpoint attempt and optional raw item atomically', async () => {
    const harness = createHarness();
    const repository = createSourceCollectionRepositoryFromTransactions(harness.run);

    await expect(repository.commitEndpoint(endpointInput())).resolves.toEqual(result());

    expect(harness.transactions.at(-1)).toEqual([
      'set local role collection_worker',
      'lock idempotency collect:one',
      'find committed collect:one',
      `insert raw ${rawItemId}`,
      `insert attempt ${attemptId}:${rawItemId}`,
    ]);
  });

  it('references an existing raw item without inserting it for unchanged endpoint content', async () => {
    const harness = createHarness();
    const repository = createSourceCollectionRepositoryFromTransactions(harness.run);

    await expect(
      repository.commitEndpoint({
        attempt: { ...attemptInput(), outcome: 'unchanged_content' },
        rawItem: null,
        existingRawItemId: rawItemId,
      }),
    ).resolves.toEqual(result({ outcome: 'unchanged_content' }));

    expect(harness.transactions.at(-1)).toEqual([
      'set local role collection_worker',
      'lock idempotency collect:one',
      'find committed collect:one',
      `insert attempt ${attemptId}:${rawItemId}`,
    ]);
  });

  it('fails closed when an endpoint supplies both new and existing Raw Items', async () => {
    const harness = createHarness();
    const repository = createSourceCollectionRepositoryFromTransactions(harness.run);

    await expect(
      repository.commitEndpoint({
        ...endpointInput(),
        existingRawItemId: rawItemId,
      }),
    ).rejects.toMatchObject({ code: 'persistence_failed' });

    expect(harness.transactions.at(-1)).not.toContain(`insert raw ${rawItemId}`);
  });

  it.each([
    {
      name: 'stored content without a new Raw Item',
      input: { attempt: attemptInput(), rawItem: null, existingRawItemId: null },
    },
    {
      name: 'unchanged content without an existing Raw Item',
      input: {
        attempt: { ...attemptInput(), outcome: 'unchanged_content' as const },
        rawItem: null,
        existingRawItemId: null,
      },
    },
    {
      name: 'a failure with an existing Raw Item',
      input: {
        attempt: { ...attemptInput(), outcome: 'http_error' as const },
        rawItem: null,
        existingRawItemId: rawItemId,
      },
    },
  ])('fails closed for $name', async ({ input }) => {
    const harness = createHarness();
    const repository = createSourceCollectionRepositoryFromTransactions(harness.run);

    await expect(repository.commitEndpoint(input)).rejects.toMatchObject({
      code: 'persistence_failed',
    });
    expect(harness.transactions.at(-1)).toEqual(['set local role collection_worker']);
  });

  it('returns an existing committed result without inserting another attempt', async () => {
    const prior = result({ outcome: 'not_modified', rawItemId: null });
    const harness = createHarness({ committed: prior });
    const repository = createSourceCollectionRepositoryFromTransactions(harness.run);

    await expect(repository.commitEndpoint(endpointInput())).resolves.toEqual(prior);

    expect(harness.transactions.at(-1)).toEqual([
      'set local role collection_worker',
      'lock idempotency collect:one',
      'find committed collect:one',
    ]);
  });

  it('reuses a prior raw item on a content-hash conflict', async () => {
    const reusedRawItemId = '50000000-0000-4000-8000-000000000099';
    const harness = createHarness({ reusedRawItemId });
    const repository = createSourceCollectionRepositoryFromTransactions(harness.run);

    await expect(repository.commitEndpoint(endpointInput())).resolves.toEqual(
      result({ rawItemId: reusedRawItemId }),
    );
    expect(harness.transactions.at(-1)).toContain(`insert attempt ${attemptId}:${reusedRawItemId}`);
  });

  it('rolls the transaction back when an atomic endpoint write fails', async () => {
    const transactions: string[][] = [];
    const durableEvents: string[] = [];
    const run: CollectionTransactionRunner = async (work) => {
      const pendingEvents: string[] = [];
      transactions.push(pendingEvents);
      const transaction = createHarnessTransaction(pendingEvents);
      transaction.insertAttempt = async () => { throw new Error('insert failed'); };
      const value = await work(transaction);
      durableEvents.push(...pendingEvents);
      return value;
    };
    const repository = createSourceCollectionRepositoryFromTransactions(run);

    await expect(repository.commitEndpoint(endpointInput())).rejects.toMatchObject({
      code: 'persistence_failed',
    });

    expect(transactions[0]).toContain(`insert raw ${rawItemId}`);
    expect(durableEvents).toEqual([]);
  });

  it('commits a feed attempt, raw item, and initial discovery versions atomically', async () => {
    const harness = createHarness();
    const repository = createSourceCollectionRepositoryFromTransactions(harness.run);

    const committed = await repository.commitFeed(feedInput());

    expect(committed).toEqual({ result: result({ discoveredCount: 1 }), discoveryIds: [discoveredItemId] });
    expect(harness.transactions.at(-1)).toEqual([
      'set local role collection_worker',
      'lock idempotency collect:one',
      'find committed collect:one',
      `insert raw ${rawItemId}`,
      `insert attempt ${attemptId}:${rawItemId}`,
      `insert discoveries ${discoveredItemId}`,
    ]);
  });

  it('returns the original discovery identifiers when replaying a committed feed', async () => {
    const prior = result({ discoveredCount: 1 });
    const harness = createHarness({ committed: prior, discoveryIds: [discoveredItemId] });
    const repository = createSourceCollectionRepositoryFromTransactions(harness.run);

    await expect(repository.commitFeed(feedInput())).resolves.toEqual({
      result: prior,
      discoveryIds: [discoveredItemId],
    });
    expect(harness.transactions.at(-1)).toContain(`load discovery ids ${rawItemId}`);
  });

  it.each(['endpoint', 'feed', 'article'] as const)(
    'fails closed when a committed %s replay belongs to another aggregate',
    async (operation) => {
      const harness = createHarness({
        committed: result({ projectId: '50000000-0000-4000-8000-000000000099' }),
      });
      const repository = createSourceCollectionRepositoryFromTransactions(harness.run);

      const promise = operation === 'endpoint'
        ? repository.commitEndpoint(endpointInput())
        : operation === 'feed'
          ? repository.commitFeed(feedInput())
          : repository.commitArticleOutcome(articleInput());

      await expect(promise).rejects.toMatchObject({ code: 'persistence_failed' });
    },
  );

  it('commits an article attempt, optional raw item, and successor atomically', async () => {
    const harness = createHarness();
    const repository = createSourceCollectionRepositoryFromTransactions(harness.run);

    await repository.commitArticleOutcome(articleInput());

    expect(harness.transactions.at(-1)).toEqual([
      'set local role collection_worker',
      'lock idempotency collect:article:one',
      'find committed collect:article:one',
      `insert raw ${rawItemId}`,
      `insert attempt ${attemptId}:${rawItemId}`,
      `insert discoveries ${discoveredItemId}`,
    ]);
  });

  it('maps database failures to a stable persistence error without SQL details', async () => {
    const run: CollectionTransactionRunner = async () => {
      throw new Error('password=secret select * from public.raw_items at 10.0.0.4');
    };
    const repository = createSourceCollectionRepositoryFromTransactions(run);

    const error = await repository.loadContext(projectId, sourceId).catch((cause: unknown) => cause);

    expect(error).toEqual(new SourceCollectionPersistenceError('persistence_failed'));
    expect(String(error)).not.toMatch(/password|select|raw_items|10\.0\.0\.4/i);
  });
});

function endpointInput(): CommitEndpointInput {
  return { attempt: attemptInput(), rawItem: rawItemInput(), existingRawItemId: null };
}

function feedInput(): CommitFeedInput {
  return {
    attempt: { ...attemptInput(), discoveredCount: 1 },
    rawItem: { ...rawItemInput(), contentKind: 'rss_feed' },
    discoveries: [
      {
        id: discoveredItemId,
        projectId,
        sourceId,
        feedRawItemId: rawItemId,
        stableEntryKey: 'entry-1',
        version: 1,
        supersedesDiscoveredItemId: null,
        entryUrl: 'https://official.test/article',
        title: 'Article',
        summary: null,
        author: null,
        externalEntryId: 'entry-1',
        publishedAt: null,
        updatedAt: null,
        isAuthorityDomain: true,
        disposition: 'eligible',
        articleCollectionAttemptId: null,
        articleRawItemId: null,
      },
    ],
  };
}

function articleInput(): CommitArticleOutcomeInput {
  return {
    attempt: { ...attemptInput(), idempotencyKey: 'collect:article:one', parentDiscoveredItemId: discoveredItemId },
    rawItem: { ...rawItemInput(), contentKind: 'feed_article_html', parentDiscoveredItemId: discoveredItemId },
    discovery: {
      ...feedInput().discoveries[0]!,
      version: 2,
      supersedesDiscoveredItemId: discoveredItemId,
      disposition: 'fetched',
      articleCollectionAttemptId: attemptId,
      articleRawItemId: rawItemId,
    },
  };
}

function attemptInput(): CollectionAttemptInput {
  return {
    id: attemptId,
    projectId,
    sourceId,
    parentDiscoveredItemId: null,
    idempotencyKey: 'collect:one',
    requestedUrl: 'https://official.test/',
    finalUrl: 'https://official.test/',
    redirectChain: [],
    startedAt: '2026-08-12T00:00:00.000Z',
    completedAt: '2026-08-12T00:00:01.000Z',
    collectedAt: '2026-08-12T00:00:01.000Z',
    httpStatus: 200,
    mediaType: 'text/html',
    etag: '"v1"',
    lastModified: null,
    decompressedBytes: 17,
    outcome: 'stored_new_content',
    errorCode: null,
    errorDetail: null,
    discoveredCount: 0,
    bodyFetchCount: 0,
  };
}

function rawItemInput(): RawItemInput {
  return {
    id: rawItemId,
    projectId,
    sourceId,
    parentDiscoveredItemId: null,
    logicalUrl: 'https://official.test/',
    finalUrl: 'https://official.test/',
    contentKind: 'official_html',
    mediaType: 'text/html',
    rawText: '<html>ok</html>',
    sha256: 'a'.repeat(64),
    publishedAt: null,
    collectedAt: '2026-08-12T00:00:01.000Z',
  };
}

function result(overrides: Partial<CollectSourceResult> = {}): CollectSourceResult {
  return {
    attemptId,
    projectId,
    sourceId,
    outcome: 'stored_new_content',
    rawItemId,
    discoveredCount: 0,
    bodyFetchCount: 0,
    ...overrides,
  };
}

function createHarness(options: {
  committed?: CollectSourceResult;
  reusedRawItemId?: string;
  discoveryIds?: readonly string[];
} = {}): {
  readonly run: CollectionTransactionRunner;
  readonly transactions: string[][];
} {
  const transactions: string[][] = [];
  const run: CollectionTransactionRunner = async <T>(work: (transaction: CollectionTransaction) => Promise<T>) => {
    const events: string[] = [];
    transactions.push(events);
    const transaction = createHarnessTransaction(events, options);
    return work(transaction);
  };
  return { run, transactions };
}

function createHarnessTransaction(
  events: string[],
  options: {
    committed?: CollectSourceResult;
    reusedRawItemId?: string;
    discoveryIds?: readonly string[];
  } = {},
): CollectionTransaction {
  return {
    setCollectionWorkerRole: async () => { events.push('set local role collection_worker'); },
    lockIdempotencyKey: async (key) => { events.push(`lock idempotency ${key}`); },
    loadContext: async () => null,
    findCommitted: async (key) => { events.push(`find committed ${key}`); return options.committed ?? null; },
    loadDiscoveryIds: async (feedRawItemId) => { events.push(`load discovery ids ${feedRawItemId}`); return options.discoveryIds ?? []; },
    loadLatest: async () => null,
    insertRawItem: async (rawItem) => { events.push(`insert raw ${rawItem.id}`); return options.reusedRawItemId ?? rawItem.id; },
    insertAttempt: async (attempt, committedRawItemId) => { events.push(`insert attempt ${attempt.id}:${committedRawItemId ?? 'null'}`); },
    insertDiscoveries: async (discoveries) => { events.push(`insert discoveries ${discoveries.map(({ id }) => id).join(',')}`); },
  };
}
