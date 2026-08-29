import { describe, expect, it } from 'vitest';

import type { CollectSourceResult } from '@airdrop/contracts';
import type {
  CommitArticleOutcomeInput,
  CommitEndpointInput,
  CommitFeedInput,
  CommitFeedResult,
  LatestRawItem,
  SourceCollectionContext,
  SourceCollectionRepository,
} from '@airdrop/database/collection-worker';
import { SourceSecurityBlockedError } from '@airdrop/database/collection-worker';

import { createCollectSource, createNodeContentHasher } from '../collect-source.js';
import { createFeedParser } from '../feed-parser.js';
import type {
  Clock,
  ContentHasher,
  FeedParser,
  IdGenerator,
  SafeHttpClient,
  SafeHttpRequest,
  SafeHttpResponse,
} from '../ports.js';

const PROJECT_ID = '10000000-0000-4000-8000-000000000003';
const SOURCE_ID = '10000000-0000-4000-8000-000000000004';
const ATTEMPT_ID = '10000000-0000-4000-8000-000000000005';
const RAW_ITEM_ID = '10000000-0000-4000-8000-000000000006';
const PREVIOUS_RAW_ITEM_ID = '10000000-0000-4000-8000-000000000007';
const CANONICAL_URL = 'https://official.example/airdrop';
const COLLECTED_AT = '2026-08-12T01:02:03.000Z';
const HTML_BYTES = new TextEncoder().encode('<html>official</html>');
const HTML_SHA256 = '1111111111111111111111111111111111111111111111111111111111111111';

const validJob = {
  jobId: '10000000-0000-4000-8000-000000000001',
  type: 'collect.source',
  version: 1,
  idempotencyKey: 'collect:project:source:v1',
  correlationId: '10000000-0000-4000-8000-000000000002',
  occurredAt: '2026-08-12T00:00:00.000Z',
  payload: { projectId: PROJECT_ID, sourceId: SOURCE_ID },
} as const;

describe('collect source', () => {
  it('parses the strict job before consulting persistence', async () => {
    const fixture = createFixture();
    const collect = fixture.collect;

    await expect(collect({ ...validJob, unexpected: 'not allowed' })).rejects.toMatchObject({
      name: 'ZodError',
    });
    expect(fixture.events).toEqual([]);
  });

  it('stores changed official HTML and returns only strict result IDs', async () => {
    const fixture = createFixture();

    const result = await fixture.collect(validJob);

    expect(result).toEqual({
      attemptId: ATTEMPT_ID,
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      outcome: 'stored_new_content',
      rawItemId: RAW_ITEM_ID,
      discoveredCount: 0,
      bodyFetchCount: 0,
    });
    expect(fixture.repository.commits[0]?.rawItem).toMatchObject({
      id: RAW_ITEM_ID,
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      logicalUrl: CANONICAL_URL,
      finalUrl: CANONICAL_URL,
      contentKind: 'official_html',
      mediaType: 'text/html',
      rawText: '<html>official</html>',
      sha256: HTML_SHA256,
      collectedAt: COLLECTED_AT,
    });
    expect(result).not.toHaveProperty('rawText');
    expect(fixture.events).toEqual([
      'repository.findCommitted',
      'repository.loadContext',
      'repository.loadLatest',
      'clock.now',
      'http.get',
      'hasher.sha256',
      'clock.now',
      'ids.generate',
      'ids.generate',
      'repository.commitEndpoint',
    ]);
  });

  it('returns a prior strict result before context, DNS, or HTTP on replay', async () => {
    const fixture = createFixture();
    fixture.repository.priorResult = priorResult();

    await expect(fixture.collect(validJob)).resolves.toEqual(priorResult());
    expect(fixture.events).toEqual(['repository.findCommitted']);
    expect(fixture.http.requests).toEqual([]);
  });

  it.each([
    { field: 'projectId', value: '10000000-0000-4000-8000-000000000090' },
    { field: 'sourceId', value: '10000000-0000-4000-8000-000000000091' },
  ] as const)('fails closed when a replay key belongs to another $field', async ({ field, value }) => {
    const fixture = createFixture();
    fixture.repository.priorResult = { ...priorResult(), [field]: value };

    await expect(fixture.collect(validJob)).resolves.toEqual({
      attemptId: ATTEMPT_ID,
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      outcome: 'persistence_failed',
      rawItemId: null,
      discoveredCount: 0,
      bodyFetchCount: 0,
    });
    expect(fixture.events).toEqual(['repository.findCommitted', 'ids.generate']);
    expect(fixture.http.requests).toEqual([]);
    expect(fixture.repository.commits).toEqual([]);
  });

  it('rejects inactive or unverified configuration before validators and HTTP', async () => {
    const fixture = createFixture();
    fixture.repository.context = null;

    await expect(fixture.collect(validJob)).resolves.toEqual({
      attemptId: ATTEMPT_ID,
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      outcome: 'rejected_url',
      rawItemId: null,
      discoveredCount: 0,
      bodyFetchCount: 0,
    });
    expect(fixture.events).toEqual([
      'repository.findCommitted',
      'repository.loadContext',
      'ids.generate',
    ]);
    expect(fixture.repository.commits).toEqual([]);
  });

  it('requests the exact configured URL and supplies only latest conditional validators', async () => {
    const fixture = createFixture();
    fixture.repository.latest = latestRawItem();

    await fixture.collect(validJob);

    expect(fixture.http.requests).toEqual([
      {
        url: CANONICAL_URL,
        authorityDomains: ['official.example'],
        ifNoneMatch: 'W/"version-1"',
        ifModifiedSince: 'Wed, 12 Aug 2026 00:00:00 GMT',
      },
    ]);
    expect(fixture.repository.loadedLatestUrls).toEqual([CANONICAL_URL]);
  });

  it('uses the real configured-URL policy and never requests an unsafe configured endpoint', async () => {
    const fixture = createFixture();
    fixture.repository.context = {
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      canonicalUrl: 'http://official.example/airdrop',
      authorityDomains: ['official.example'],
    };

    await expect(fixture.collect(validJob)).resolves.toMatchObject({
      outcome: 'rejected_url',
      rawItemId: null,
    });
    expect(fixture.http.requests).toEqual([]);
    expect(fixture.repository.commits[0]?.rawItem).toBeNull();
    expect(fixture.repository.commits[0]?.attempt.errorCode).toBe('rejected_url');
  });

  it('persists a body-free not-modified attempt for HTTP 304', async () => {
    const fixture = createFixture();
    fixture.repository.latest = latestRawItem();
    fixture.http.response = httpResponse({
      status: 304,
      body: null,
      decompressedBytes: 0,
      etag: null,
      lastModified: null,
    });

    await expect(fixture.collect(validJob)).resolves.toMatchObject({
      outcome: 'not_modified',
      rawItemId: PREVIOUS_RAW_ITEM_ID,
    });
    expect(fixture.repository.commits[0]?.rawItem).toBeNull();
    expect(fixture.repository.commits[0]?.existingRawItemId).toBe(PREVIOUS_RAW_ITEM_ID);
    expect(fixture.repository.commits[0]?.attempt).toMatchObject({
      httpStatus: 304,
      outcome: 'not_modified',
      errorCode: null,
      errorDetail: null,
    });
    expect(fixture.hasher.inputs).toEqual([]);
  });

  it('fails safely when HTTP 304 has no latest Raw Item to reference', async () => {
    const fixture = createFixture();
    fixture.http.response = httpResponse({
      status: 304,
      body: null,
      decompressedBytes: 0,
    });

    await expect(fixture.collect(validJob)).resolves.toMatchObject({
      outcome: 'http_error',
      rawItemId: null,
    });
    expect(fixture.repository.commits[0]).toMatchObject({
      rawItem: null,
      existingRawItemId: null,
      attempt: { errorCode: 'http_error' },
    });
  });

  it('persists no Raw Item when the exact byte hash is unchanged', async () => {
    const fixture = createFixture();
    fixture.repository.latest = latestRawItem({ sha256: HTML_SHA256 });

    await expect(fixture.collect(validJob)).resolves.toMatchObject({
      outcome: 'unchanged_content',
      rawItemId: PREVIOUS_RAW_ITEM_ID,
    });
    expect(fixture.repository.commits[0]?.rawItem).toBeNull();
    expect(fixture.repository.commits[0]?.existingRawItemId).toBe(PREVIOUS_RAW_ITEM_ID);
  });

  it('hashes a known SHA-256 vector with the Node production adapter', () => {
    const digest = createNodeContentHasher().sha256(new TextEncoder().encode('abc'));

    expect(digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes the exact decompressed bytes before fatal UTF-8 decoding', async () => {
    const fixture = createFixture();
    const invalidBytes = Uint8Array.from([0xc3, 0x28]);
    fixture.http.response = httpResponse({
      body: invalidBytes,
      decompressedBytes: invalidBytes.byteLength,
    });

    await expect(fixture.collect(validJob)).resolves.toMatchObject({
      outcome: 'invalid_text_encoding',
      rawItemId: null,
    });
    expect(fixture.hasher.inputs).toEqual([invalidBytes]);
    expect(fixture.repository.commits[0]?.rawItem).toBeNull();
  });

  it.each([
    'rejected_url',
    'rejected_dns_target',
    'redirect_rejected',
    'unsupported_content_type',
    'invalid_text_encoding',
    'response_too_large',
    'timeout',
    'http_error',
  ] as const)('persists a body-free attempt for %s', async (code) => {
    const fixture = createFixture();
    fixture.http.failure = { code, message: `<html>secret fetched text for ${code}</html>` };

    await expect(fixture.collect(validJob)).resolves.toMatchObject({ outcome: code, rawItemId: null });
    expect(fixture.repository.commits).toHaveLength(1);
    expect(fixture.repository.commits[0]?.rawItem).toBeNull();
    expect(fixture.repository.commits[0]?.attempt).toMatchObject({
      errorCode: code,
      outcome: code,
    });
    const detail = fixture.repository.commits[0]?.attempt.errorDetail;
    expect(detail?.length).toBeLessThanOrEqual(500);
    expect(detail).not.toContain('secret fetched text');
  });

  it('uses injected clock and IDs for deterministic immutable persistence input', async () => {
    const fixture = createFixture({
      times: ['2026-08-12T01:02:02.000Z', COLLECTED_AT],
    });

    await fixture.collect(validJob);

    expect(fixture.repository.commits[0]).toMatchObject({
      attempt: {
        id: ATTEMPT_ID,
        idempotencyKey: validJob.idempotencyKey,
        requestedUrl: CANONICAL_URL,
        startedAt: '2026-08-12T01:02:02.000Z',
        completedAt: COLLECTED_AT,
        collectedAt: COLLECTED_AT,
      },
      rawItem: { id: RAW_ITEM_ID, collectedAt: COLLECTED_AT },
    });
  });

  it.each(['findCommitted', 'loadContext', 'loadLatest', 'commitEndpoint'] as const)(
    'maps %s persistence failure to a strict body-free result without leaking detail',
    async (operation) => {
      const fixture = createFixture();
      fixture.repository.failureOperation = operation;

      const result = await fixture.collect(validJob);

      expect(result).toEqual({
        attemptId: ATTEMPT_ID,
        projectId: PROJECT_ID,
        sourceId: SOURCE_ID,
        outcome: 'persistence_failed',
        rawItemId: null,
        discoveredCount: 0,
        bodyFetchCount: 0,
      });
      expect(JSON.stringify(result)).not.toContain('postgres password');
    },
  );

  it('discards a fetched response when the source becomes blocked before persistence', async () => {
    const fixture = createFixture();
    fixture.repository.securityBlockedOperation = 'commitEndpoint';

    await expect(fixture.collect(validJob)).resolves.toEqual({
      attemptId: ATTEMPT_ID,
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      outcome: 'security_blocked',
      rawItemId: null,
      discoveredCount: 0,
      bodyFetchCount: 0,
    });
    expect(fixture.http.requests).toHaveLength(1);
    expect(fixture.repository.commits).toEqual([]);
  });

  it('parses the repository result strictly before returning it', async () => {
    const fixture = createFixture();
    fixture.repository.resultExtra = '<html>must not escape</html>';

    await expect(fixture.collect(validJob)).resolves.toMatchObject({
      outcome: 'persistence_failed',
      rawItemId: null,
    });
  });

  it.each([
    {
      kind: 'rss_feed' as const,
      mediaTypeHeader: 'application/rss+xml',
      xml: '<rss version="2.0"><channel><title>Official</title></channel></rss>',
    },
    {
      kind: 'atom_feed' as const,
      mediaTypeHeader: 'application/atom+xml',
      xml: '<feed xmlns="http://www.w3.org/2005/Atom"><title>Official</title></feed>',
    },
  ])('stores valid $kind XML as its own immutable Raw Item', async ({
    kind,
    mediaTypeHeader,
    xml,
  }) => {
    const fixture = createFixture();
    const bytes = new TextEncoder().encode(xml);
    fixture.http.response = httpResponse({
      mediaTypeHeader,
      body: bytes,
      decompressedBytes: bytes.byteLength,
    });

    await expect(fixture.collect(validJob)).resolves.toEqual({
      attemptId: ATTEMPT_ID,
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      outcome: 'stored_new_content',
      rawItemId: RAW_ITEM_ID,
      discoveredCount: 0,
      bodyFetchCount: 0,
    });
    expect(fixture.repository.feedCommits[0]?.rawItem).toMatchObject({
      id: RAW_ITEM_ID,
      contentKind: kind,
      mediaType: mediaTypeHeader,
      rawText: xml,
    });
  });

  it('persists invalid Feed XML as a body-free invalid_feed attempt without discoveries', async () => {
    const fixture = createFixture();
    const bytes = new TextEncoder().encode('<rss version="2.0"><channel>');
    fixture.http.response = httpResponse({
      mediaTypeHeader: 'application/rss+xml',
      body: bytes,
      decompressedBytes: bytes.byteLength,
    });

    await expect(fixture.collect(validJob)).resolves.toMatchObject({
      outcome: 'invalid_feed',
      rawItemId: null,
      discoveredCount: 0,
      bodyFetchCount: 0,
    });
    expect(fixture.repository.commits[0]).toMatchObject({
      rawItem: null,
      existingRawItemId: null,
      attempt: { outcome: 'invalid_feed', errorCode: 'invalid_feed' },
    });
    expect(fixture.repository.feedCommits).toEqual([]);
    expect(fixture.http.requests).toHaveLength(1);
  });

  it('processes the first 100 entries in order and isolates authority and body-fetch budgets', async () => {
    const fixture = createFixture();
    const items = [
      '<item><guid>id-first</guid><link>https://official.example/id-first-url</link></item>',
      '<item><link>https://news.official.example/url-fallback</link></item>',
      '<item><guid>external</guid><link>https://external.example/story</link></item>',
      '<item><guid>deceptive</guid><link>https://official.example.attacker.test/story</link></item>',
      '<item><title>missing identity</title></item>',
      ...Array.from(
        { length: 98 },
        (_, index) => `<item><guid>entry-${index + 6}</guid><link>https://official.example/${index + 6}</link></item>`,
      ),
    ];
    const xml = `<rss version="2.0"><channel>${items.join('')}</channel></rss>`;
    const bytes = new TextEncoder().encode(xml);
    fixture.http.response = httpResponse({
      mediaTypeHeader: 'application/rss+xml',
      body: bytes,
      decompressedBytes: bytes.byteLength,
    });

    const result = await fixture.collect(validJob);

    expect(result).toMatchObject({ discoveredCount: 99, bodyFetchCount: 20 });
    const discoveries = fixture.repository.feedCommits[0]?.discoveries ?? [];
    expect(discoveries).toHaveLength(99);
    expect(discoveries.slice(0, 5).map(({ stableEntryKey }) => stableEntryKey)).toEqual([
      'id:id-first',
      'url:https://news.official.example/url-fallback',
      'id:external',
      'id:deceptive',
      'id:entry-6',
    ]);
    expect(discoveries.slice(0, 4).map(({ disposition }) => disposition)).toEqual([
      'eligible',
      'eligible',
      'discovered_only',
      'discovered_only',
    ]);
    expect(discoveries.filter(({ disposition }) => disposition === 'eligible')).toHaveLength(20);
    expect(
      discoveries.filter(({ disposition }) => disposition === 'body_fetch_budget_exhausted'),
    ).toHaveLength(77);
    expect(fixture.http.requests.slice(1).map(({ url }) => url)).toEqual([
      'https://official.example/id-first-url',
      'https://news.official.example/url-fallback',
      ...Array.from({ length: 18 }, (_, index) => `https://official.example/${index + 6}`),
    ]);
    expect(fixture.http.requests.some(({ url }) => url.includes('external.example'))).toBe(false);
    expect(fixture.http.requests.some(({ url }) => url.includes('attacker.test'))).toBe(false);
  });

  it('isolates sequential article success and failure with validators and bounded successors', async () => {
    const fixture = createFixture();
    const xml = `<rss version="2.0"><channel>
      <item><guid>one</guid><link>https://official.example/one</link></item>
      <item><guid>two</guid><link>https://official.example/two</link></item>
      <item><guid>three</guid><link>https://official.example/three</link></item>
    </channel></rss>`;
    const feedBytes = new TextEncoder().encode(xml);
    const articleBytes = new TextEncoder().encode('<html>article</html>');
    fixture.repository.latestByUrl.set('https://official.example/one', latestRawItem({
      logicalUrl: 'https://official.example/one',
      etag: '"article-v1"',
      lastModified: 'Wed, 12 Aug 2026 00:01:00 GMT',
    }));
    fixture.http.scripts.push(
      { response: httpResponse({ mediaTypeHeader: 'application/rss+xml', body: feedBytes, decompressedBytes: feedBytes.byteLength }) },
      { response: httpResponse({ requestedUrl: 'https://official.example/one', finalUrl: 'https://official.example/one', body: articleBytes, decompressedBytes: articleBytes.byteLength }) },
      { failure: { code: 'timeout', message: '<html>failed body</html>' } },
      { response: httpResponse({ requestedUrl: 'https://official.example/three', finalUrl: 'https://news.official.example/three', redirects: [{ hop: 1, status: 302, url: 'https://news.official.example/three' }], body: articleBytes, decompressedBytes: articleBytes.byteLength }) },
    );

    const result = await fixture.collect(validJob);

    expect(result).toMatchObject({ discoveredCount: 3, bodyFetchCount: 3 });
    expect(fixture.http.maximumActiveRequests).toBe(1);
    expect(fixture.http.requests[1]).toEqual({
      url: 'https://official.example/one',
      authorityDomains: ['official.example'],
      ifNoneMatch: '"article-v1"',
      ifModifiedSince: 'Wed, 12 Aug 2026 00:01:00 GMT',
    });
    expect(fixture.repository.articleCommits).toHaveLength(3);
    expect(fixture.repository.articleCommits.map(({ discovery }) => discovery.disposition)).toEqual([
      'fetched',
      'fetch_failed',
      'fetched',
    ]);
    expect(fixture.repository.articleCommits[0]?.rawItem).toMatchObject({
      contentKind: 'feed_article_html',
      rawText: '<html>article</html>',
      logicalUrl: 'https://official.example/one',
    });
    expect(fixture.repository.articleCommits[1]).toMatchObject({
      rawItem: null,
      attempt: { outcome: 'timeout', errorCode: 'timeout', errorDetail: 'Collection request timed out.' },
    });
    expect(JSON.stringify(fixture.repository.articleCommits[1])).not.toContain('failed body');
    expect(fixture.repository.articleCommits[2]?.attempt.redirectChain).toEqual([
      { hop: 1, status: 302, url: 'https://news.official.example/three' },
    ]);
  });

  it('does not reprocess discoveries or articles for a new key with unchanged Feed content', async () => {
    const fixture = createFixture();
    const xml = '<rss version="2.0"><channel><item><guid>one</guid><link>https://official.example/one</link></item></channel></rss>';
    const bytes = new TextEncoder().encode(xml);
    fixture.repository.latest = latestRawItem({ sha256: HTML_SHA256 });
    fixture.http.response = httpResponse({
      mediaTypeHeader: 'application/rss+xml',
      body: bytes,
      decompressedBytes: bytes.byteLength,
    });

    await expect(fixture.collect({ ...validJob, idempotencyKey: 'collect:new-key' })).resolves.toMatchObject({
      outcome: 'unchanged_content',
      rawItemId: PREVIOUS_RAW_ITEM_ID,
      discoveredCount: 0,
      bodyFetchCount: 0,
    });
    expect(fixture.repository.feedCommits).toEqual([]);
    expect(fixture.repository.commits).toHaveLength(1);
    expect(fixture.http.requests).toHaveLength(1);
    expect(fixture.feedParserInputs).toEqual([]);
  });

  it('prevents every article request when the atomic Feed commit fails', async () => {
    const fixture = feedWithArticlesFixture(2);
    fixture.repository.failureOperation = 'commitFeed';

    await expect(fixture.collect(validJob)).resolves.toMatchObject({
      outcome: 'persistence_failed',
      rawItemId: null,
      discoveredCount: 0,
      bodyFetchCount: 0,
    });
    expect(fixture.http.requests).toHaveLength(1);
    expect(fixture.repository.articleCommits).toEqual([]);
  });

  it('does not fetch articles when a concurrent Feed collector wins the commit race', async () => {
    const fixture = feedWithArticlesFixture(2);
    fixture.repository.feedReplayResult = {
      attemptId: '10000000-0000-4000-8000-000000000099',
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      outcome: 'stored_new_content',
      rawItemId: '10000000-0000-4000-8000-000000000098',
      discoveredCount: 2,
      bodyFetchCount: 2,
    };

    await expect(fixture.collect(validJob)).resolves.toEqual(fixture.repository.feedReplayResult);
    expect(fixture.http.requests).toHaveLength(1);
    expect(fixture.repository.articleCommits).toEqual([]);
  });

  it('associates winner article successors with the matching inserted discoveries', async () => {
    const fixture = feedWithArticlesFixture(2);
    fixture.repository.feedDiscoveryIds = [
      '10000000-0000-4000-8000-000000000091',
      '10000000-0000-4000-8000-000000000092',
    ];

    await fixture.collect(validJob);

    expect(fixture.repository.articleCommits.map(({ discovery }) => ({
      stableEntryKey: discovery.stableEntryKey,
      supersedesDiscoveredItemId: discovery.supersedesDiscoveredItemId,
    }))).toEqual([
      {
        stableEntryKey: 'id:entry-1',
        supersedesDiscoveredItemId: '10000000-0000-4000-8000-000000000091',
      },
      {
        stableEntryKey: 'id:entry-2',
        supersedesDiscoveredItemId: '10000000-0000-4000-8000-000000000092',
      },
    ]);
  });

  it('continues after an article persistence failure and preserves committed Feed counts', async () => {
    const fixture = feedWithArticlesFixture(3);
    fixture.repository.failArticleCommitAt = 1;

    const result = await fixture.collect(validJob);

    expect(result).toMatchObject({
      outcome: 'stored_new_content',
      rawItemId: RAW_ITEM_ID,
      discoveredCount: 3,
      bodyFetchCount: 3,
    });
    expect(fixture.http.requests).toHaveLength(4);
    expect(fixture.repository.articleCommitAttempts).toBe(4);
    expect(fixture.repository.articleCommits).toHaveLength(3);
    expect(fixture.repository.articleCommits.map(({ discovery }) => discovery.stableEntryKey)).toEqual([
      'id:entry-1',
      'id:entry-2',
      'id:entry-3',
    ]);
    expect(fixture.repository.articleCommits[0]).toMatchObject({
      rawItem: null,
      attempt: {
        outcome: 'persistence_failed',
        errorCode: 'persistence_failed',
        errorDetail: 'Article outcome persistence failed.',
      },
      discovery: { disposition: 'fetch_failed' },
    });
    expect(fixture.repository.articleCommits.every(({ attempt }) => attempt.idempotencyKey.length <= 255)).toBe(true);
    expect(fixture.repository.articleCommits.every(({ attempt }) => /^article:[0-9a-f]{64}$/.test(attempt.idempotencyKey))).toBe(true);
  });

  it('stops later article requests when the source becomes blocked at article persistence', async () => {
    const fixture = feedWithArticlesFixture(3);
    fixture.repository.securityBlockArticleCommitAt = 1;

    const result = await fixture.collect(validJob);

    expect(result).toMatchObject({
      outcome: 'security_blocked',
      rawItemId: null,
      discoveredCount: 0,
      bodyFetchCount: 0,
    });
    expect(fixture.http.requests).toHaveLength(2);
    expect(fixture.repository.articleCommitAttempts).toBe(1);
    expect(fixture.repository.articleCommits).toEqual([]);
  });

  it('records a bounded persistence failure when article validators cannot load and continues', async () => {
    const fixture = feedWithArticlesFixture(2);
    fixture.repository.failLatestUrls.add('https://official.example/1');

    const result = await fixture.collect(validJob);

    expect(result).toMatchObject({ discoveredCount: 2, bodyFetchCount: 2 });
    expect(fixture.http.requests.map(({ url }) => url)).toEqual([
      CANONICAL_URL,
      'https://official.example/2',
    ]);
    expect(fixture.repository.articleCommits).toHaveLength(2);
    expect(fixture.repository.articleCommits[0]).toMatchObject({
      rawItem: null,
      attempt: {
        requestedUrl: 'https://official.example/1',
        outcome: 'persistence_failed',
        errorCode: 'persistence_failed',
        errorDetail: 'Article validator persistence failed.',
      },
      discovery: { disposition: 'fetch_failed' },
    });
    expect(fixture.repository.articleCommits[1]?.discovery.stableEntryKey).toBe('id:entry-2');
  });
});

type FailureCode =
  | 'rejected_url'
  | 'rejected_dns_target'
  | 'redirect_rejected'
  | 'unsupported_content_type'
  | 'invalid_text_encoding'
  | 'response_too_large'
  | 'timeout'
  | 'http_error';

type StrictResult = CollectSourceResult;

class InMemoryRepository implements SourceCollectionRepository {
  priorResult: CollectSourceResult | null = null;
  context: SourceCollectionContext | null = {
    projectId: PROJECT_ID,
    sourceId: SOURCE_ID,
    canonicalUrl: CANONICAL_URL,
    authorityDomains: ['official.example'],
  };
  latest: LatestRawItem | null = null;
  readonly latestByUrl = new Map<string, LatestRawItem>();
  readonly failLatestUrls = new Set<string>();
  failureOperation: 'findCommitted' | 'loadContext' | 'loadLatest' | 'commitEndpoint' | 'commitFeed' | null = null;
  securityBlockedOperation: 'commitEndpoint' | 'commitFeed' | null = null;
  failArticleCommitAt: number | null = null;
  securityBlockArticleCommitAt: number | null = null;
  articleCommitAttempts = 0;
  resultExtra: string | null = null;
  readonly commits: CommitEndpointInput[] = [];
  readonly feedCommits: CommitFeedInput[] = [];
  readonly articleCommits: CommitArticleOutcomeInput[] = [];
  readonly loadedLatestUrls: string[] = [];
  feedReplayResult: CollectSourceResult | null = null;
  feedDiscoveryIds: readonly string[] | null = null;

  constructor(private readonly events: string[]) {}

  async findCommitted(idempotencyKey: string): Promise<CollectSourceResult | null> {
    this.events.push('repository.findCommitted');
    void idempotencyKey;
    this.failIfSelected('findCommitted');
    return this.priorResult;
  }

  async loadContext(projectId: string, sourceId: string): Promise<SourceCollectionContext | null> {
    this.events.push('repository.loadContext');
    void projectId;
    void sourceId;
    this.failIfSelected('loadContext');
    return this.context;
  }

  async loadLatest(
    logicalUrl: string,
    projectId: string,
    sourceId: string,
  ): Promise<LatestRawItem | null> {
    this.events.push('repository.loadLatest');
    void projectId;
    void sourceId;
    this.loadedLatestUrls.push(logicalUrl);
    this.failIfSelected('loadLatest');
    if (this.failLatestUrls.has(logicalUrl)) {
      throw new Error('postgres validator lookup must never leak');
    }
    return this.latestByUrl.get(logicalUrl) ?? this.latest;
  }

  async commitEndpoint(input: CommitEndpointInput): Promise<CollectSourceResult> {
    this.events.push('repository.commitEndpoint');
    if (this.securityBlockedOperation === 'commitEndpoint') throw new SourceSecurityBlockedError();
    this.failIfSelected('commitEndpoint');
    this.commits.push(input);
    return {
      attemptId: input.attempt.id,
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      outcome: input.attempt.outcome,
      rawItemId: input.rawItem?.id ?? null,
      ...(input.existingRawItemId === null ? {} : { rawItemId: input.existingRawItemId }),
      discoveredCount: 0,
      bodyFetchCount: 0,
      ...(this.resultExtra === null ? {} : { rawText: this.resultExtra }),
    };
  }

  async commitFeed(input: CommitFeedInput): Promise<CommitFeedResult> {
    this.events.push('repository.commitFeed');
    if (this.securityBlockedOperation === 'commitFeed') throw new SourceSecurityBlockedError();
    this.failIfSelected('commitFeed');
    this.feedCommits.push(input);
    if (this.feedReplayResult !== null) {
      return {
        inserted: false,
        result: this.feedReplayResult,
      };
    }
    return {
      inserted: true,
      result: {
        attemptId: input.attempt.id,
        projectId: PROJECT_ID,
        sourceId: SOURCE_ID,
        outcome: input.attempt.outcome,
        rawItemId: input.rawItem.id,
        discoveredCount: input.discoveries.length,
        bodyFetchCount: input.attempt.bodyFetchCount,
      },
      discoveryIds: this.feedDiscoveryIds ?? input.discoveries.map(({ id }) => id),
    };
  }

  async commitArticleOutcome(input: CommitArticleOutcomeInput): Promise<void> {
    this.events.push('repository.commitArticleOutcome');
    this.articleCommitAttempts += 1;
    if (this.securityBlockArticleCommitAt === this.articleCommitAttempts) {
      throw new SourceSecurityBlockedError();
    }
    if (this.failArticleCommitAt === this.articleCommitAttempts) {
      throw new Error('postgres article body must never leak');
    }
    this.articleCommits.push(input);
  }

  private failIfSelected(operation: InMemoryRepository['failureOperation']): void {
    if (this.failureOperation === operation) {
      throw new Error('postgres password=must-never-leak');
    }
  }
}

class InMemoryHttp implements SafeHttpClient {
  failure: { readonly code: FailureCode; readonly message: string } | null = null;
  response: SafeHttpResponse = httpResponse();
  readonly scripts: Array<
    | { readonly response: SafeHttpResponse }
    | { readonly failure: { readonly code: FailureCode; readonly message: string } }
  > = [];
  readonly requests: SafeHttpRequest[] = [];
  activeRequests = 0;
  maximumActiveRequests = 0;

  constructor(private readonly events: string[]) {}

  async get(input: SafeHttpRequest): Promise<SafeHttpResponse> {
    this.events.push('http.get');
    this.requests.push(input);
    this.activeRequests += 1;
    this.maximumActiveRequests = Math.max(this.maximumActiveRequests, this.activeRequests);
    try {
      await Promise.resolve();
      const script = this.scripts.shift();
      const failure = script !== undefined && 'failure' in script ? script.failure : this.failure;
      if (failure !== null) {
        throw Object.assign(new Error(failure.message), { code: failure.code });
      }
      return script !== undefined && 'response' in script ? script.response : this.response;
    } finally {
      this.activeRequests -= 1;
    }
  }
}

class RecordingHasher implements ContentHasher {
  readonly inputs: Uint8Array[] = [];

  constructor(private readonly events: string[]) {}

  sha256(bytes: Uint8Array): string {
    this.events.push('hasher.sha256');
    this.inputs.push(bytes);
    return HTML_SHA256;
  }
}

function createFixture(options: { readonly times?: readonly string[] } = {}) {
  const events: string[] = [];
  const repository = new InMemoryRepository(events);
  const http = new InMemoryHttp(events);
  const hasher = new RecordingHasher(events);
  const times = [...(options.times ?? [COLLECTED_AT, COLLECTED_AT])];
  const ids = [ATTEMPT_ID, RAW_ITEM_ID];
  let generatedId = 100;
  const clock: Clock = {
    now() {
      events.push('clock.now');
      return new Date(times.shift() ?? COLLECTED_AT);
    },
  };
  const idGenerator: IdGenerator = {
    generate() {
      events.push('ids.generate');
      return ids.shift() ?? `10000000-0000-4000-8000-${String(generatedId++).padStart(12, '0')}`;
    },
  };
  const feedParserInputs: string[] = [];
  const realFeedParser = createFeedParser();
  const feedParser: FeedParser = {
    parse(xml) {
      feedParserInputs.push(xml);
      return realFeedParser.parse(xml);
    },
  };
  const dependencies = { repository, http, feedParser, hasher, clock, ids: idGenerator };
  const collect = createCollectSource(dependencies) as (job: unknown) => Promise<StrictResult>;
  return { collect, repository, http, hasher, events, feedParserInputs };
}

function feedWithArticlesFixture(count: number) {
  const fixture = createFixture();
  const items = Array.from(
    { length: count },
    (_, index) => `<item><guid>entry-${index + 1}</guid><link>https://official.example/${index + 1}</link></item>`,
  );
  const xml = `<rss version="2.0"><channel>${items.join('')}</channel></rss>`;
  const bytes = new TextEncoder().encode(xml);
  fixture.http.response = httpResponse({
    mediaTypeHeader: 'application/rss+xml',
    body: bytes,
    decompressedBytes: bytes.byteLength,
  });
  fixture.http.scripts.push({ response: fixture.http.response });
  for (let index = 0; index < count; index += 1) {
    fixture.http.scripts.push({
      response: httpResponse({
        requestedUrl: `https://official.example/${index + 1}`,
        finalUrl: `https://official.example/${index + 1}`,
      }),
    });
  }
  return fixture;
}

function httpResponse(overrides: Partial<SafeHttpResponse> = {}): SafeHttpResponse {
  return {
    requestedUrl: CANONICAL_URL,
    finalUrl: CANONICAL_URL,
    redirects: [],
    status: 200,
    mediaTypeHeader: 'text/html; charset=UTF-8',
    etag: '"version-2"',
    lastModified: 'Wed, 12 Aug 2026 01:00:00 GMT',
    body: HTML_BYTES,
    decompressedBytes: HTML_BYTES.byteLength,
    ...overrides,
  };
}

function latestRawItem(overrides: Partial<LatestRawItem> = {}): LatestRawItem {
  return {
    id: PREVIOUS_RAW_ITEM_ID,
    logicalUrl: CANONICAL_URL,
    finalUrl: CANONICAL_URL,
    sha256: '2222222222222222222222222222222222222222222222222222222222222222',
    etag: 'W/"version-1"',
    lastModified: 'Wed, 12 Aug 2026 00:00:00 GMT',
    collectedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

function priorResult(): StrictResult {
  return {
    attemptId: ATTEMPT_ID,
    projectId: PROJECT_ID,
    sourceId: SOURCE_ID,
    outcome: 'stored_new_content',
    rawItemId: RAW_ITEM_ID,
    discoveredCount: 0,
    bodyFetchCount: 0,
  };
}
