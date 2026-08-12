import type { ResolvedAddress } from '@airdrop/domain';

export interface SafeDnsResolver {
  resolve(hostname: string): Promise<readonly ResolvedAddress[]>;
}

export interface SafeHttpRequest {
  readonly url: string;
  readonly authorityDomains: readonly string[];
  readonly ifNoneMatch: string | null;
  readonly ifModifiedSince: string | null;
}

export interface SafeHttpResponse {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly redirects: readonly { hop: number; status: number; url: string }[];
  readonly status: number;
  readonly mediaTypeHeader: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly body: Uint8Array | null;
  readonly decompressedBytes: number;
}

export interface SafeHttpClient {
  get(input: SafeHttpRequest): Promise<SafeHttpResponse>;
}
