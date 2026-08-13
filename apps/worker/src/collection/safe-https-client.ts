import { request as nodeHttpsRequest, type RequestOptions } from 'node:https';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { type Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

import {
  CONNECT_TIMEOUT_MS,
  MAX_DECOMPRESSED_BYTES,
  sanitizeCollectionEtag,
  sanitizeCollectionLastModified,
  TOTAL_TIMEOUT_MS,
  validateConfiguredCollectionUrl,
  validateRedirectUrl,
  validateResolvedAddresses,
  type ResolvedAddress,
  type ValidatedCollectionUrl,
} from '@airdrop/domain';

import type {
  SafeDnsResolver,
  SafeHttpClient,
  SafeHttpRequest,
  SafeHttpResponse,
} from './ports.js';

type CollectionHttpErrorCode = 'response_too_large' | 'timeout' | 'http_error';

export class CollectionHttpError extends Error {
  constructor(
    readonly code: CollectionHttpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CollectionHttpError';
  }
}

export interface HttpsRequestOptions {
  readonly protocol: 'https:';
  readonly hostname: string;
  readonly servername: string;
  readonly port: 443;
  readonly path: string;
  readonly method: 'GET';
  readonly rejectUnauthorized: true;
  readonly agent: false;
  readonly family: 4 | 6;
  readonly autoSelectFamily: false;
  readonly headers: Readonly<Record<string, string>>;
  readonly lookup: (
    hostname: string,
    options: { readonly all?: boolean },
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string,
      family: 4 | 6,
    ) => void,
  ) => void;
}

export type HttpsResponse = Pick<IncomingMessage, 'headers' | 'statusCode'> & Readable;

export interface HttpsRequest {
  once(event: 'error', listener: (error: Error) => void): this;
  setTimeout(milliseconds: number, callback: () => void): this;
  destroy(error?: Error): this;
  end(): void;
}

export type HttpsRequestFactory = (
  options: HttpsRequestOptions,
  onResponse: (response: HttpsResponse) => void,
) => HttpsRequest;

export interface TimerPort {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

interface SafeHttpsClientDependencies {
  readonly resolver: SafeDnsResolver;
  readonly requestFactory?: HttpsRequestFactory;
  readonly timer?: TimerPort;
  readonly userAgent?: string;
}

interface RequestContext {
  currentRequest: HttpsRequest | null;
  currentResponse: Readable | null;
  currentDecoder: Readable | null;
  abortError: CollectionHttpError | null;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_LOCATION_LENGTH = 4_096;
const MAX_MEDIA_TYPE_HEADER_LENGTH = 1_024;
const MAX_CONTENT_ENCODING_LENGTH = 32;
const ACCEPT_HEADER =
  'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html';
const USER_AGENT = 'AirdropIntelligenceOS-Collector/1.0';

const productionRequestFactory: HttpsRequestFactory = (options, onResponse) =>
  nodeHttpsRequest(options as RequestOptions, (response) => onResponse(response));

const productionTimer: TimerPort = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createSafeHttpsClient(dependencies: SafeHttpsClientDependencies): SafeHttpClient {
  const requestFactory = dependencies.requestFactory ?? productionRequestFactory;
  const timer = dependencies.timer ?? productionTimer;

  return {
    get(input) {
      const context: RequestContext = {
        currentRequest: null,
        currentResponse: null,
        currentDecoder: null,
        abortError: null,
      };
      let rejectDeadline: ((error: Error) => void) | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        rejectDeadline = reject;
      });
      const timeoutError = () => new CollectionHttpError('timeout', 'Collection request timed out.');
      const deadlineHandle = timer.setTimeout(() => {
        const error = timeoutError();
        context.abortError = error;
        destroyActiveBody(context);
        context.currentRequest?.destroy(error);
        rejectDeadline?.(error);
      }, TOTAL_TIMEOUT_MS);

      return Promise.race([
        performGet(
          input,
          dependencies.resolver,
          requestFactory,
          context,
          dependencies.userAgent ?? USER_AGENT,
        ),
        deadline,
      ]).finally(() => {
        timer.clearTimeout(deadlineHandle);
      });
    },
  };
}

async function performGet(
  input: SafeHttpRequest,
  resolver: SafeDnsResolver,
  requestFactory: HttpsRequestFactory,
  context: RequestContext,
  userAgent: string,
): Promise<SafeHttpResponse> {
  const requestedUrl = input.url;
  let validatedUrl = validateConfiguredCollectionUrl({
    candidateUrl: input.url,
    configuredUrl: input.url,
    authorityDomains: input.authorityDomains,
  });
  const redirects: Array<{ hop: number; status: number; url: string }> = [];

  for (;;) {
    throwIfAborted(context);
    const resolvedAddresses = await resolver.resolve(validatedUrl.hostname);
    throwIfAborted(context);
    const addresses = validateResolvedAddresses(resolvedAddresses);
    const selectedAddress = addresses[0];
    if (selectedAddress === undefined) {
      throw new CollectionHttpError('http_error', 'Validated DNS answer was unexpectedly empty.');
    }

    throwIfAborted(context);
    const response = await requestHop(
      validatedUrl,
      selectedAddress,
      buildRequestHeaders(input, userAgent),
      requestFactory,
      context,
    );
    throwIfAborted(context);
    const status = response.statusCode;
    if (status === undefined) {
      discardResponse(response);
      clearActiveBody(context);
      throw new CollectionHttpError('http_error', 'HTTPS response omitted its status code.');
    }

    if (REDIRECT_STATUSES.has(status)) {
      const location = boundedHeader(response.headers.location, MAX_LOCATION_LENGTH);
      discardResponse(response);
      clearActiveBody(context);
      if (location === null) {
        throw new CollectionHttpError('http_error', 'Redirect response omitted a valid Location header.');
      }

      const hop = redirects.length + 1;
      const candidateUrl = createRedirectCandidate(location, validatedUrl.url);
      const redirectedUrl = validateRedirectUrl({
        candidateUrl,
        authorityDomains: input.authorityDomains,
        hop,
      });
      redirects.push({ hop, status, url: redirectedUrl.url.href });
      validatedUrl = redirectedUrl;
      continue;
    }

    const responseMetadata = readResponseMetadata(response.headers);
    if (status === 304) {
      discardResponse(response);
      clearActiveBody(context);
      return {
        requestedUrl,
        finalUrl: validatedUrl.url.href,
        redirects,
        status,
        ...responseMetadata,
        body: null,
        decompressedBytes: 0,
      };
    }

    if (status < 200 || status >= 300) {
      discardResponse(response);
      clearActiveBody(context);
      throw new CollectionHttpError('http_error', `Collection endpoint returned HTTP ${status}.`);
    }

    throwIfAborted(context);
    context.currentResponse = response;
    const body = await readBoundedBody(
      response,
      response.headers['content-encoding'],
      context,
    );
    throwIfAborted(context);
    clearActiveBody(context);
    return {
      requestedUrl,
      finalUrl: validatedUrl.url.href,
      redirects,
      status,
      ...responseMetadata,
      body,
      decompressedBytes: body.byteLength,
    };
  }
}

function requestHop(
  validatedUrl: ValidatedCollectionUrl,
  selectedAddress: ResolvedAddress,
  headers: Readonly<Record<string, string>>,
  requestFactory: HttpsRequestFactory,
  context: RequestContext,
): Promise<HttpsResponse> {
  return new Promise((resolve, reject) => {
    throwIfAborted(context);
    let request: HttpsRequest;
    try {
      request = requestFactory(
        {
          protocol: 'https:',
          hostname: validatedUrl.hostname,
          servername: validatedUrl.hostname,
          port: 443,
          path: `${validatedUrl.url.pathname}${validatedUrl.url.search}`,
          method: 'GET',
          rejectUnauthorized: true,
          agent: false,
          family: selectedAddress.family,
          autoSelectFamily: false,
          headers,
          lookup(hostname, _options, callback) {
            if (hostname !== validatedUrl.hostname) {
              callback(
                Object.assign(new Error('Pinned lookup received an unexpected hostname.'), {
                  code: 'EINVAL',
                }),
                selectedAddress.address,
                selectedAddress.family,
              );
              return;
            }
            callback(null, selectedAddress.address, selectedAddress.family);
          },
        },
        (response) => {
          request.setTimeout(0, () => undefined);
          context.currentRequest = null;
          context.currentResponse = response;
          resolve(response);
        },
      );
    } catch {
      reject(new CollectionHttpError('http_error', 'HTTPS request failed.'));
      return;
    }
    context.currentRequest = request;
    request.once('error', (error) => {
      context.currentRequest = null;
      reject(
        error instanceof CollectionHttpError
          ? error
          : new CollectionHttpError('http_error', 'HTTPS request failed.'),
      );
    });
    request.setTimeout(CONNECT_TIMEOUT_MS, () => {
      request.destroy(new CollectionHttpError('timeout', 'HTTPS connection timed out.'));
    });
    request.end();
  });
}

function buildRequestHeaders(
  input: SafeHttpRequest,
  userAgent: string,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: ACCEPT_HEADER,
    'Accept-Encoding': 'gzip, deflate, br',
    'User-Agent': userAgent,
  };
  const etag = sanitizeCollectionEtag(input.ifNoneMatch);
  const lastModified = sanitizeCollectionLastModified(input.ifModifiedSince);
  if (etag !== null) headers['If-None-Match'] = etag;
  if (lastModified !== null) headers['If-Modified-Since'] = lastModified;
  return headers;
}

async function readBoundedBody(
  response: HttpsResponse,
  contentEncodingHeader: string | string[] | undefined,
  context: RequestContext,
): Promise<Uint8Array> {
  const contentEncoding = boundedHeader(contentEncodingHeader, MAX_CONTENT_ENCODING_LENGTH);
  if (contentEncodingHeader !== undefined && contentEncoding === null) {
    discardResponse(response);
    throw new CollectionHttpError('http_error', 'Collection response has malformed content encoding.');
  }
  let stream: Readable = response;
  const normalizedContentEncoding = contentEncoding?.toLowerCase() ?? null;
  if (normalizedContentEncoding === 'gzip') stream = response.pipe(createGunzip());
  else if (normalizedContentEncoding === 'deflate') stream = response.pipe(createInflate());
  else if (normalizedContentEncoding === 'br') stream = response.pipe(createBrotliDecompress());
  else if (normalizedContentEncoding !== null && normalizedContentEncoding !== 'identity') {
    discardResponse(response);
    throw new CollectionHttpError('http_error', 'Collection response uses unsupported content encoding.');
  }
  context.currentDecoder = stream === response ? null : stream;

  const chunks: Uint8Array[] = [];
  let decompressedBytes = 0;
  try {
    for await (const rawChunk of stream) {
      throwIfAborted(context);
      const chunk = toUint8Array(rawChunk);
      decompressedBytes += chunk.byteLength;
      if (decompressedBytes > MAX_DECOMPRESSED_BYTES) {
        const error = new CollectionHttpError(
          'response_too_large',
          `Decompressed response exceeds ${MAX_DECOMPRESSED_BYTES} bytes.`,
        );
        destroyActiveBody(context);
        throw error;
      }
      chunks.push(chunk);
    }
    throwIfAborted(context);
  } catch (error) {
    destroyActiveBody(context);
    if (context.abortError !== null) throw context.abortError;
    if (error instanceof CollectionHttpError) throw error;
    throw new CollectionHttpError('http_error', 'Collection response body could not be decoded.');
  }

  const body = new Uint8Array(decompressedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function throwIfAborted(context: RequestContext): void {
  if (context.abortError !== null) throw context.abortError;
}

function destroyActiveBody(context: RequestContext): void {
  context.currentDecoder?.destroy();
  context.currentResponse?.destroy();
  clearActiveBody(context);
}

function clearActiveBody(context: RequestContext): void {
  context.currentDecoder = null;
  context.currentResponse = null;
}

function readResponseMetadata(headers: IncomingHttpHeaders): Pick<
  SafeHttpResponse,
  'mediaTypeHeader' | 'etag' | 'lastModified'
> {
  return {
    mediaTypeHeader: boundedHeader(headers['content-type'], MAX_MEDIA_TYPE_HEADER_LENGTH),
    etag: sanitizeCollectionEtag(singleHeader(headers.etag)),
    lastModified: sanitizeCollectionLastModified(singleHeader(headers['last-modified'])),
  };
}

function boundedHeader(value: string | string[] | undefined, maximumLength: number): string | null {
  const single = singleHeader(value);
  if (single === null || single.length === 0 || single.length > maximumLength) return null;
  return /^[\t\x20-\x7e\x80-\xff]+$/.test(single) ? single : null;
}

function singleHeader(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function createRedirectCandidate(location: string, currentUrl: URL): string {
  if (location.startsWith('https://')) return location;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(location) || location.startsWith('//')) {
    return location;
  }

  try {
    return new URL(location, currentUrl).href;
  } catch {
    throw new CollectionHttpError('http_error', 'Redirect Location is malformed.');
  }
}

function discardResponse(response: Readable): void {
  response.destroy();
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new TextEncoder().encode(value);
  throw new CollectionHttpError('http_error', 'Collection response yielded an invalid body chunk.');
}
