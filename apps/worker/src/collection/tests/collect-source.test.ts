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

import { createCollectSource, createNodeContentHasher } from '../collect-source.js';
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

  it('parses the repository result strictly before returning it', async () => {
    const fixture = createFixture();
    fixture.repository.resultExtra = '<html>must not escape</html>';

    await expect(fixture.collect(validJob)).resolves.toMatchObject({
      outcome: 'persistence_failed',
      rawItemId: null,
    });
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
  failureOperation: 'findCommitted' | 'loadContext' | 'loadLatest' | 'commitEndpoint' | null = null;
  resultExtra: string | null = null;
  readonly commits: CommitEndpointInput[] = [];
  readonly loadedLatestUrls: string[] = [];

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
    return this.latest;
  }

  async commitEndpoint(input: CommitEndpointInput): Promise<CollectSourceResult> {
    this.events.push('repository.commitEndpoint');
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
    void input;
    throw new Error('Task 9 only');
  }

  async commitArticleOutcome(input: CommitArticleOutcomeInput): Promise<void> {
    void input;
    throw new Error('Task 9 only');
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
  readonly requests: SafeHttpRequest[] = [];

  constructor(private readonly events: string[]) {}

  async get(input: SafeHttpRequest): Promise<SafeHttpResponse> {
    this.events.push('http.get');
    this.requests.push(input);
    if (this.failure !== null) {
      throw Object.assign(new Error(this.failure.message), { code: this.failure.code });
    }
    return this.response;
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
  const clock: Clock = {
    now() {
      events.push('clock.now');
      const timestamp = times.shift();
      if (timestamp === undefined) throw new Error('test clock exhausted');
      return new Date(timestamp);
    },
  };
  const idGenerator: IdGenerator = {
    generate() {
      events.push('ids.generate');
      const id = ids.shift();
      if (id === undefined) throw new Error('test IDs exhausted');
      return id;
    },
  };
  const feedParser: FeedParser = {
    parse() {
      throw new Error('Task 9 only');
    },
  };
  const dependencies = { repository, http, feedParser, hasher, clock, ids: idGenerator };
  const collect = createCollectSource(dependencies) as (job: unknown) => Promise<StrictResult>;
  return { collect, repository, http, hasher, events };
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
