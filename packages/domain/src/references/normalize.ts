// Deterministic normalization shared by reference registration, verification,
// and the Phase 7A indicator coupling. Both sides must normalize with these
// exact functions, otherwise a value could verify under one form and be flagged
// under another.

const CONTROL_CODE_LIMIT = 0x20;
const DELETE_CODE = 0x7f;

function hasUnsafeCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < CONTROL_CODE_LIMIT || code === DELETE_CODE;
  });
}

function isRejectedRawValue(value: string): boolean {
  return value.length === 0 || value !== value.trim() || /\s/u.test(value) || hasUnsafeCharacter(value);
}

export function normalizeReferenceUrl(value: string): string | null {
  if (isRejectedRawValue(value) || !value.startsWith('https://')) {
    return null;
  }

  // `new URL` accepts `https:///claim` and repoints it at host `claim`, so an
  // empty authority must be rejected before parsing.
  const authorityStart = value.slice('https://'.length);
  if (/^[/?#]/u.test(authorityStart)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  // The URL parser already removes the default port; the trailing root dot is
  // not removed and must be stripped so `example.com.` and `example.com` agree.
  const host = parsed.hostname.replace(/\.$/u, '').toLowerCase();
  if (host.length === 0) {
    return null;
  }

  const port = parsed.port;
  const authority = port.length === 0 ? host : `${host}:${port}`;
  const path = parsed.pathname.length === 0 ? '/' : parsed.pathname;
  return `https://${authority}${path}${parsed.search}`;
}

const domainLabel = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;

export function normalizeReferenceDomain(value: string): string | null {
  if (isRejectedRawValue(value)) {
    return null;
  }
  if (/[/:@?#]/u.test(value)) {
    return null;
  }

  const host = value.replace(/\.$/u, '').toLowerCase();
  if (host.length === 0 || host.length > 253) {
    return null;
  }

  const labels = host.split('.');
  if (!labels.every((label) => domainLabel.test(label))) {
    return null;
  }

  return host;
}

export function isReferenceUrlLexicallyValid(value: string): boolean {
  return normalizeReferenceUrl(value) !== null;
}

export function isReferenceDomainLexicallyValid(value: string): boolean {
  return normalizeReferenceDomain(value) !== null;
}
