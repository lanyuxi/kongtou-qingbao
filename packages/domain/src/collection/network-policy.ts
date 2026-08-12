import ipaddr from 'ipaddr.js';

export const MAX_REDIRECTS = 3;
export const CONNECT_TIMEOUT_MS = 5_000;
export const TOTAL_TIMEOUT_MS = 20_000;
export const MAX_DECOMPRESSED_BYTES = 2_097_152;

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export type ValidatedAddress = ResolvedAddress;

export interface ValidatedCollectionUrl {
  readonly url: URL;
  readonly hostname: string;
}

export class CollectionNetworkPolicyError extends Error {
  constructor(
    readonly code: 'rejected_url' | 'rejected_dns_target' | 'redirect_rejected',
    message: string,
  ) {
    super(message);
    this.name = 'CollectionNetworkPolicyError';
  }
}

interface ConfiguredCollectionUrlInput {
  readonly candidateUrl: string;
  readonly configuredUrl: string;
  readonly authorityDomains: readonly string[];
}

interface RedirectUrlInput {
  readonly candidateUrl: string;
  readonly authorityDomains: readonly string[];
  readonly hop: number;
}

const CANONICAL_HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV6_GLOBAL_UNICAST_PREFIX = ipaddr.IPv6.parse('2000::');

export function validateConfiguredCollectionUrl(
  input: ConfiguredCollectionUrlInput,
): ValidatedCollectionUrl {
  if (input.candidateUrl !== input.configuredUrl) {
    throw new CollectionNetworkPolicyError(
      'rejected_url',
      'The initial collection URL must exactly match the configured URL.',
    );
  }

  return validateUrl(input.candidateUrl, input.authorityDomains, 'rejected_url');
}

export function validateRedirectUrl(input: RedirectUrlInput): ValidatedCollectionUrl {
  if (!Number.isInteger(input.hop) || input.hop < 1 || input.hop > MAX_REDIRECTS) {
    throw new CollectionNetworkPolicyError(
      'redirect_rejected',
      `Redirect hop must be between 1 and ${MAX_REDIRECTS}.`,
    );
  }

  return validateUrl(input.candidateUrl, input.authorityDomains, 'redirect_rejected');
}

export function isWithinAuthorityDomains(
  hostname: string,
  domains: readonly string[],
): boolean {
  if (!isCanonicalAuthorityHostname(hostname)) {
    return false;
  }

  return domains.some(
    (domain) =>
      isCanonicalAuthorityHostname(domain) &&
      (hostname === domain || hostname.endsWith(`.${domain}`)),
  );
}

export function validateResolvedAddresses(
  records: readonly ResolvedAddress[],
): readonly ValidatedAddress[] {
  if (records.length === 0) {
    throw rejectedDnsTarget('DNS resolution returned no addresses.');
  }

  return records.map((record) => {
    const address = parseAddressForFamily(record);
    const publicAddress =
      address instanceof ipaddr.IPv6 && address.isIPv4MappedAddress()
        ? address.toIPv4Address()
        : address;

    if (
      publicAddress.range() !== 'unicast' ||
      (publicAddress instanceof ipaddr.IPv6 &&
        !publicAddress.match(IPV6_GLOBAL_UNICAST_PREFIX, 3))
    ) {
      throw rejectedDnsTarget(`DNS resolution returned a non-public address: ${record.address}`);
    }

    return { address: record.address, family: record.family };
  });
}

function validateUrl(
  candidateUrl: string,
  authorityDomains: readonly string[],
  errorCode: 'rejected_url' | 'redirect_rejected',
): ValidatedCollectionUrl {
  const authorityMatch = /^https:\/\/([^/?#]+)(?:[/?#]|$)/.exec(candidateUrl);
  if (authorityMatch === null) {
    throw rejectedUrl(errorCode, 'Collection URLs must use canonical HTTPS syntax.');
  }

  const authority = authorityMatch[1];
  if (authority === undefined || authority.includes('@')) {
    throw rejectedUrl(errorCode, 'Collection URLs must not contain user information.');
  }

  if (authority.startsWith('[') || authority.includes(':')) {
    throw rejectedUrl(errorCode, 'Collection URLs must not contain IP literals or explicit ports.');
  }

  if (!isCanonicalHostname(authority)) {
    throw rejectedUrl(errorCode, 'Collection URL hostnames must be canonical ASCII DNS names.');
  }

  let url: URL;
  try {
    url = new URL(candidateUrl);
  } catch {
    throw rejectedUrl(errorCode, 'Collection URL is malformed.');
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.hostname !== authority
  ) {
    throw rejectedUrl(errorCode, 'Collection URL is not in canonical safe form.');
  }

  if (ipaddr.isValid(url.hostname)) {
    throw rejectedUrl(errorCode, 'Collection URL hostnames must not be IP literals.');
  }

  if (!isWithinAuthorityDomains(url.hostname, authorityDomains)) {
    throw rejectedUrl(errorCode, 'Collection URL hostname is outside the verified authority set.');
  }

  return { url, hostname: url.hostname };
}

function isCanonicalHostname(hostname: string): boolean {
  return CANONICAL_HOSTNAME.test(hostname) && hostname === hostname.toLowerCase();
}

function isCanonicalAuthorityHostname(hostname: string): boolean {
  return isCanonicalHostname(hostname) && !ipaddr.isValid(hostname);
}

function parseAddressForFamily(record: ResolvedAddress): ipaddr.IPv4 | ipaddr.IPv6 {
  try {
    if (record.address.includes('%')) {
      throw new Error('Zone identifiers are not valid DNS addresses.');
    }

    if (record.family === 4 && ipaddr.IPv4.isValid(record.address)) {
      return ipaddr.IPv4.parse(record.address);
    }

    if (record.family === 6 && ipaddr.IPv6.isValid(record.address)) {
      return ipaddr.IPv6.parse(record.address);
    }
  } catch {
    throw rejectedDnsTarget(`DNS resolution returned an invalid address: ${record.address}`);
  }

  throw rejectedDnsTarget(
    `DNS resolution returned an address that does not match family ${record.family}: ${record.address}`,
  );
}

function rejectedUrl(
  code: 'rejected_url' | 'redirect_rejected',
  message: string,
): CollectionNetworkPolicyError {
  return new CollectionNetworkPolicyError(code, message);
}

function rejectedDnsTarget(message: string): CollectionNetworkPolicyError {
  return new CollectionNetworkPolicyError('rejected_dns_target', message);
}
