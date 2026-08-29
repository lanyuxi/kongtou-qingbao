// Deterministic normalization shared by reference registration, verification,
// and the Phase 7A indicator coupling. Both the TypeScript and the PostgreSQL
// implementations must implement this exact algorithm, otherwise a value could
// verify under one form and be flagged under another.
//
// The URL normalizer deliberately does NOT use `new URL()`: the WHATWG parser
// is more permissive than this allowlist needs (it accepts empty authorities,
// IDN/IPv6 hosts, percent-encoded hosts, and rewrites dot-segments and
// non-ASCII paths), which made the two layers diverge. Both sides now run the
// same strict string transformation.

const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;
const DOMAIN_LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

const CONTROL_CODE_LIMIT = 0x20;
const DELETE_CODE = 0x7f;
const MAX_URL_LENGTH = 2048;
const MAX_DOMAIN_LENGTH = 253;
const DEFAULT_HTTPS_PORT = '443';

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < CONTROL_CODE_LIMIT || code === DELETE_CODE;
  });
}

function isRejectedRawValue(value: string): boolean {
  return (
    value.length === 0 ||
    value !== value.trim() ||
    /\s/u.test(value) ||
    hasControlCharacter(value) ||
    !PRINTABLE_ASCII.test(value)
  );
}

export function normalizeReferenceDomain(value: string): string | null {
  if (isRejectedRawValue(value)) {
    return null;
  }
  if (/[/:@?#%]/u.test(value)) {
    return null;
  }

  const host = value.replace(/\.$/u, '').toLowerCase();
  if (host.length === 0 || host.length > MAX_DOMAIN_LENGTH) {
    return null;
  }

  const labels = host.split('.');
  if (!labels.every((label) => DOMAIN_LABEL.test(label))) {
    return null;
  }

  return host;
}

function hasDotSegment(path: string): boolean {
  return (
    path === '/.' ||
    path === '/..' ||
    path.includes('/./') ||
    path.includes('/../') ||
    path.endsWith('/.') ||
    path.endsWith('/..')
  );
}

function authorityEndIndex(rest: string): number {
  const candidates = ['/', '?', '#']
    .map((marker) => rest.indexOf(marker))
    .filter((index) => index !== -1);
  return candidates.length === 0 ? -1 : Math.min(...candidates);
}

export function normalizeReferenceUrl(value: string): string | null {
  if (isRejectedRawValue(value) || !value.startsWith('https://')) {
    return null;
  }

  const rest = value.slice('https://'.length);
  // An empty authority must be rejected explicitly, and the authority must not
  // carry percent-encoding: `https://ex%41mple.com` would otherwise decode to a
  // different host than the raw string suggests.
  if (rest.length === 0 || /^[/?#]/u.test(rest) || rest.includes('%')) {
    return null;
  }

  const end = authorityEndIndex(rest);
  const authority = end === -1 ? rest : rest.slice(0, end);
  const tail = end === -1 ? '' : rest.slice(end);

  // More than one colon means an IPv6 literal, which this allowlist does not
  // accept (the domain rules only admit ASCII hostname labels).
  if ((authority.match(/:/gu) ?? []).length > 1) {
    return null;
  }

  let host = authority;
  let port: string | null = null;
  if (authority.includes(':')) {
    const parts = authority.split(':');
    host = parts[0] ?? '';
    port = parts[1] ?? '';
    if (!/^[0-9]+$/.test(port)) {
      return null;
    }
    const portNumber = Number.parseInt(port, 10);
    if (!Number.isSafeInteger(portNumber) || portNumber < 0 || portNumber > 65535) {
      return null;
    }
    port = String(portNumber);
    if (port === DEFAULT_HTTPS_PORT) {
      port = null;
    }
  }

  const normalizedHost = normalizeReferenceDomain(host);
  if (normalizedHost === null) {
    return null;
  }

  let path = '/';
  let query = '';
  if (tail.length > 0) {
    const pathWithQuery = tail.split('#')[0] ?? '';
    if (pathWithQuery.startsWith('?')) {
      query = pathWithQuery;
    } else {
      const queryAt = pathWithQuery.indexOf('?');
      if (queryAt === -1) {
        path = pathWithQuery;
      } else {
        path = pathWithQuery.slice(0, queryAt);
        query = pathWithQuery.slice(queryAt);
      }
    }
  }

  if (path === '') {
    path = '/';
  }
  if (query === '?') {
    query = '';
  }
  if (hasDotSegment(path)) {
    return null;
  }

  const authorityWithPort = port === null ? normalizedHost : `${normalizedHost}:${port}`;
  const normalized = `https://${authorityWithPort}${path}${query}`;
  if (normalized.length > MAX_URL_LENGTH) {
    return null;
  }

  return normalized;
}

export function isReferenceUrlLexicallyValid(value: string): boolean {
  return normalizeReferenceUrl(value) !== null;
}

export function isReferenceDomainLexicallyValid(value: string): boolean {
  return normalizeReferenceDomain(value) !== null;
}

export function referenceUrlHost(normalizedUrl: string): string | null {
  const afterScheme = normalizedUrl.split('//')[1] ?? '';
  const authority = afterScheme.split('/')[0] ?? '';
  const host = authority.split(':')[0] ?? '';
  return normalizeReferenceDomain(host);
}
