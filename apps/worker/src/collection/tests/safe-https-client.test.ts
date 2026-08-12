import { EventEmitter } from 'node:events';
import type { LookupAddress } from 'node:dns';
import { PassThrough, Readable } from 'node:stream';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { MAX_DECOMPRESSED_BYTES } from '@airdrop/domain';

import {
  CollectionHttpError,
  createSafeHttpsClient,
  type HttpsRequestFactory,
  type HttpsRequestOptions,
  type TimerPort,
} from '../safe-https-client.js';
import type { SafeDnsResolver, SafeHttpRequest } from '../ports.js';

const BASE_INPUT: SafeHttpRequest = {
  url: 'https://test.example/feed',
  authorityDomains: ['test.example', 'verified.example'],
  ifNoneMatch: 'W/"feed-v1"',
  ifModifiedSince: 'Wed, 12 Aug 2026 07:00:00 GMT',
};

interface ResponseSpec {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly chunks?: readonly Uint8Array[];
}

function withResponseMetadata<T extends Readable>(
  response: T,
  statusCode: number,
  headers: Readonly<Record<string, string>> = {},
): T & { statusCode: number; headers: Readonly<Record<string, string>> } {
  return Object.assign(response, { statusCode, headers });
}

class FakeRequest extends EventEmitter {
  timeoutMilliseconds: number | null = null;
  readonly timeoutHistory: number[] = [];
  destroyedWith: Error | null = null;

  constructor(private readonly respond: () => void) {
    super();
  }

  setTimeout(milliseconds: number, callback: () => void): this {
    this.timeoutMilliseconds = milliseconds;
    this.timeoutHistory.push(milliseconds);
    this.once('test-timeout', callback);
    return this;
  }

  destroy(error?: Error): this {
    this.destroyedWith = error ?? null;
    if (error !== undefined) this.emit('error', error);
    return this;
  }

  end(): void {
    this.respond();
  }
}

function createHarness(specs: readonly ResponseSpec[], addresses = ['93.184.216.34']) {
  const options: HttpsRequestOptions[] = [];
  const requests: FakeRequest[] = [];
  let responseIndex = 0;
  const factory: HttpsRequestFactory = (requestOptions, onResponse) => {
    options.push(requestOptions);
    const request = new FakeRequest(() => {
      const spec = specs[responseIndex++];
      if (spec === undefined) throw new Error('Missing response fixture.');
      onResponse(withResponseMetadata(Readable.from(spec.chunks ?? []), spec.status, spec.headers));
    });
    requests.push(request);
    return request;
  };
  const resolvedHostnames: string[] = [];
  const resolver: SafeDnsResolver = {
    async resolve(hostname) {
      resolvedHostnames.push(hostname);
      return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 } as const));
    },
  };
  return { client: createSafeHttpsClient({ requestFactory: factory, resolver }), options, requests, resolvedHostnames };
}

function invokePinnedLookup(options: HttpsRequestOptions): Promise<LookupAddress> {
  return new Promise((resolve, reject) => {
    options.lookup(options.hostname, { all: false }, (error, address, family) => {
      if (error !== null) reject(error);
      else resolve({ address, family });
    });
  });
}

function expectCode(error: unknown, code: CollectionHttpError['code']): void {
  expect(error).toBeInstanceOf(CollectionHttpError);
  expect(error).toMatchObject({ code });
}

describe('createSafeHttpsClient', () => {
  it('pins the validated address while preserving hostname SNI and certificate verification', async () => {
    const harness = createHarness(
      [{ status: 200, chunks: [Buffer.from('feed')] }],
      ['93.184.216.34', '93.184.216.35'],
    );

    await harness.client.get(BASE_INPUT);

    expect(harness.resolvedHostnames).toEqual(['test.example']);
    expect(harness.options[0]).toMatchObject({
      protocol: 'https:', hostname: 'test.example', servername: 'test.example', port: 443,
      path: '/feed', method: 'GET', rejectUnauthorized: true, agent: false,
      family: 4, autoSelectFamily: false,
    });
    expect(await invokePinnedLookup(harness.options[0]!)).toEqual({ address: '93.184.216.34', family: 4 });
  });

  it('emits only the allowlisted request headers and ignores proxy environment variables', async () => {
    const previous = process.env.HTTPS_PROXY;
    process.env.HTTPS_PROXY = 'http://127.0.0.1:9999';
    try {
      const harness = createHarness([{ status: 200 }]);
      await harness.client.get(BASE_INPUT);
      expect(harness.options[0]!.headers).toEqual({
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'AirdropIntelligenceOS-Collector/1.0',
        'If-None-Match': 'W/"feed-v1"',
        'If-Modified-Since': 'Wed, 12 Aug 2026 07:00:00 GMT',
      });
      expect(harness.options[0]!.agent).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.HTTPS_PROXY;
      else process.env.HTTPS_PROXY = previous;
    }
  });

  it('revalidates policy and DNS on every manual redirect', async () => {
    const harness = createHarness([
      { status: 302, headers: { location: 'https://verified.example/next' } },
      { status: 200, chunks: [Buffer.from('ok')] },
    ]);
    const result = await harness.client.get(BASE_INPUT);
    expect(harness.resolvedHostnames).toEqual(['test.example', 'verified.example']);
    expect(result.redirects).toEqual([{ hop: 1, status: 302, url: 'https://verified.example/next' }]);
    expect(result.finalUrl).toBe('https://verified.example/next');
  });

  it('rejects redirect hop four', async () => {
    const harness = createHarness([
      { status: 302, headers: { location: 'https://test.example/1' } },
      { status: 302, headers: { location: 'https://test.example/2' } },
      { status: 302, headers: { location: 'https://test.example/3' } },
      { status: 302, headers: { location: 'https://test.example/4' } },
    ]);
    await expect(harness.client.get(BASE_INPUT)).rejects.toMatchObject({ code: 'redirect_rejected' });
    expect(harness.options).toHaveLength(4);
  });

  it('rejects a cross-authority redirect before resolving or connecting', async () => {
    const harness = createHarness([{ status: 302, headers: { location: 'https://attacker.test/next' } }]);
    await expect(harness.client.get(BASE_INPUT)).rejects.toMatchObject({ code: 'redirect_rejected' });
    expect(harness.resolvedHostnames).toEqual(['test.example']);
    expect(harness.options).toHaveLength(1);
  });

  it.each([
    'https://test.example:443/next',
    '//test.example:443/next',
    'HTTPS://test.example/next',
  ])('rejects raw redirect syntax before URL normalization can hide it: %s', async (location) => {
    const harness = createHarness([
      { status: 302, headers: { location } },
    ]);
    await expect(harness.client.get(BASE_INPUT)).rejects.toMatchObject({ code: 'redirect_rejected' });
    expect(harness.resolvedHostnames).toEqual(['test.example']);
    expect(harness.options).toHaveLength(1);
  });

  it.each([
    ['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync],
  ] as const)('decodes %s before returning and counting bytes', async (encoding, compress) => {
    const body = Buffer.from('decoded content');
    const harness = createHarness([{ status: 200, headers: { 'content-encoding': encoding }, chunks: [compress(body)] }]);
    const result = await harness.client.get(BASE_INPUT);
    expect(result.body).toEqual(new Uint8Array(body));
    expect(result.decompressedBytes).toBe(body.length);
  });

  it('accepts exactly 2 MiB of decompressed data', async () => {
    const body = Buffer.alloc(MAX_DECOMPRESSED_BYTES, 97);
    const harness = createHarness([{ status: 200, chunks: [body] }]);
    await expect(harness.client.get(BASE_INPUT)).resolves.toMatchObject({ decompressedBytes: MAX_DECOMPRESSED_BYTES });
  });

  it('aborts at 2 MiB plus one decompressed byte', async () => {
    const harness = createHarness([{ status: 200, chunks: [Buffer.alloc(MAX_DECOMPRESSED_BYTES), Buffer.from('x')] }]);
    await expect(harness.client.get(BASE_INPUT)).rejects.toSatisfy((error: unknown) => {
      expectCode(error, 'response_too_large'); return true;
    });
  });

  it('uses a 5-second connection timeout and maps it to timeout', async () => {
    let capturedRequest: FakeRequest | undefined;
    const factory: HttpsRequestFactory = () => {
      capturedRequest = new FakeRequest(() => undefined); return capturedRequest;
    };
    const resolver: SafeDnsResolver = { async resolve() { return [{ address: '93.184.216.34', family: 4 }]; } };
    const pending = createSafeHttpsClient({ requestFactory: factory, resolver }).get(BASE_INPUT);
    await Promise.resolve(); await Promise.resolve();
    expect(capturedRequest?.timeoutMilliseconds).toBe(5_000);
    capturedRequest?.emit('test-timeout');
    await expect(pending).rejects.toSatisfy((error: unknown) => { expectCode(error, 'timeout'); return true; });
  });

  it('disables the connection timeout after response headers arrive', async () => {
    const harness = createHarness([{ status: 200, chunks: [Buffer.from('ok')] }]);
    await harness.client.get(BASE_INPUT);
    expect(harness.requests[0]!.timeoutHistory).toEqual([5_000, 0]);
  });

  it('uses one 20-second deadline for redirects and body reads', async () => {
    const callbacks: Array<() => void> = [];
    const timer: TimerPort = {
      setTimeout(callback, milliseconds) { expect(milliseconds).toBe(20_000); callbacks.push(callback); return callbacks.length; },
      clearTimeout() {},
    };
    const response = new PassThrough();
    const factory: HttpsRequestFactory = (_options, onResponse) => new FakeRequest(() => {
      onResponse(withResponseMetadata(response, 200));
    });
    const resolver: SafeDnsResolver = { async resolve() { return [{ address: '93.184.216.34', family: 4 }]; } };
    const pending = createSafeHttpsClient({ requestFactory: factory, resolver, timer }).get(BASE_INPUT);
    await Promise.resolve(); await Promise.resolve();
    expect(callbacks).toHaveLength(1);
    callbacks[0]!();
    await expect(pending).rejects.toSatisfy((error: unknown) => { expectCode(error, 'timeout'); return true; });
    response.destroy();
  });

  it('does not connect when the deadline fires while DNS resolution is pending', async () => {
    let resolveDns: ((addresses: readonly [{ readonly address: string; readonly family: 4 }]) => void) | undefined;
    const resolver: SafeDnsResolver = {
      resolve() {
        return new Promise((resolve) => { resolveDns = resolve; });
      },
    };
    let requestCount = 0;
    const factory: HttpsRequestFactory = () => {
      requestCount += 1;
      return new FakeRequest(() => undefined);
    };
    let fireDeadline: (() => void) | undefined;
    const timer: TimerPort = {
      setTimeout(callback) { fireDeadline = callback; return 1; },
      clearTimeout() {},
    };
    const pending = createSafeHttpsClient({ requestFactory: factory, resolver, timer }).get(BASE_INPUT);
    fireDeadline!();
    await expect(pending).rejects.toMatchObject({ code: 'timeout' });

    resolveDns!([{ address: '93.184.216.34', family: 4 }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(requestCount).toBe(0);
  });

  it('maps native request failures to a stable adapter error without leaking details', async () => {
    const nativeMessage = 'certificate CN and socket 10.0.0.7:443 mismatch';
    let nativeRequest: FakeRequest;
    const factory: HttpsRequestFactory = () => {
      nativeRequest = new FakeRequest(() => {
        nativeRequest.emit('error', new Error(nativeMessage));
      });
      return nativeRequest;
    };
    const resolver: SafeDnsResolver = { async resolve() { return [{ address: '93.184.216.34', family: 4 }]; } };

    await expect(createSafeHttpsClient({ requestFactory: factory, resolver }).get(BASE_INPUT))
      .rejects.toSatisfy((error: unknown) => {
        expectCode(error, 'http_error');
        expect((error as Error).message).not.toContain(nativeMessage);
        expect((error as Error).message).toBe('HTTPS request failed.');
        return true;
      });
  });

  it('destroys the raw response when its decoder fails', async () => {
    const response = new PassThrough();
    let decoder: NodeJS.WritableStream | undefined;
    const originalPipe = response.pipe.bind(response);
    response.pipe = ((destination, options) => {
      decoder = destination;
      return originalPipe(destination, options);
    }) as typeof response.pipe;
    let responseClosed = false;
    response.once('close', () => { responseClosed = true; });
    const factory: HttpsRequestFactory = (_options, onResponse) => new FakeRequest(() => {
      onResponse(withResponseMetadata(response, 200, { 'content-encoding': 'gzip' }));
      response.write(Buffer.from('not a gzip stream'));
    });
    const resolver: SafeDnsResolver = { async resolve() { return [{ address: '93.184.216.34', family: 4 }]; } };

    await expect(createSafeHttpsClient({ requestFactory: factory, resolver }).get(BASE_INPUT))
      .rejects.toMatchObject({ code: 'http_error' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(responseClosed).toBe(true);
    expect(decoder).toMatchObject({ destroyed: true });
  });

  it('destroys the active decoder when the total deadline fires', async () => {
    const response = new PassThrough();
    let decoder: NodeJS.WritableStream | undefined;
    const originalPipe = response.pipe.bind(response);
    response.pipe = ((destination, options) => {
      decoder = destination;
      return originalPipe(destination, options);
    }) as typeof response.pipe;
    const factory: HttpsRequestFactory = (_options, onResponse) => new FakeRequest(() => {
      onResponse(withResponseMetadata(response, 200, { 'content-encoding': 'gzip' }));
    });
    const resolver: SafeDnsResolver = { async resolve() { return [{ address: '93.184.216.34', family: 4 }]; } };
    let fireDeadline: (() => void) | undefined;
    const timer: TimerPort = {
      setTimeout(callback) { fireDeadline = callback; return 1; },
      clearTimeout() {},
    };
    const pending = createSafeHttpsClient({ requestFactory: factory, resolver, timer }).get(BASE_INPUT);
    await Promise.resolve();
    await Promise.resolve();
    fireDeadline!();

    await expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(response.destroyed).toBe(true);
    expect(decoder).toMatchObject({ destroyed: true });
  });

  it('returns bounded response metadata and a null body for 304', async () => {
    const harness = createHarness([{ status: 304, headers: {
      etag: '"v2"', 'last-modified': 'Wed, 12 Aug 2026 07:00:00 GMT', 'content-type': 'application/rss+xml',
    }, chunks: [Buffer.from('must be discarded')] }]);
    await expect(harness.client.get(BASE_INPUT)).resolves.toMatchObject({
      status: 304, body: null, decompressedBytes: 0, mediaTypeHeader: 'application/rss+xml', etag: '"v2"',
    });
  });

  it('maps non-2xx to http_error without consuming its response body', async () => {
    let produced = false;
    const body = new Readable({ read() { produced = true; this.push(Buffer.from('secret')); this.push(null); } });
    const factory: HttpsRequestFactory = (_options, onResponse) => new FakeRequest(() => {
      onResponse(withResponseMetadata(body, 500));
    });
    const resolver: SafeDnsResolver = { async resolve() { return [{ address: '93.184.216.34', family: 4 }]; } };
    await expect(createSafeHttpsClient({ requestFactory: factory, resolver }).get(BASE_INPUT)).rejects.toSatisfy((error: unknown) => {
      expectCode(error, 'http_error'); return true;
    });
    expect(produced).toBe(false);
  });

  it('drops oversized bounded response headers', async () => {
    const harness = createHarness([{ status: 200, headers: {
      etag: 'x'.repeat(1_025), 'last-modified': 'x'.repeat(129), 'content-type': 'x'.repeat(1_025),
    } }]);
    await expect(harness.client.get(BASE_INPUT)).resolves.toMatchObject({ etag: null, lastModified: null, mediaTypeHeader: null });
  });

  it('rejects malformed bounded content-encoding instead of treating it as identity', async () => {
    const harness = createHarness([{ status: 200, headers: {
      'content-encoding': 'x'.repeat(33),
    }, chunks: [Buffer.from('encoded body')] }]);
    await expect(harness.client.get(BASE_INPUT)).rejects.toSatisfy((error: unknown) => {
      expectCode(error, 'http_error'); return true;
    });
  });
});
