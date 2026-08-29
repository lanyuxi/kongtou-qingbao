import { describe, expect, it } from 'vitest';

import {
  isReferenceDomainLexicallyValid,
  isReferenceUrlLexicallyValid,
  normalizeReferenceDomain,
  normalizeReferenceUrl,
  referenceUrlHost,
} from './normalize.js';

describe('normalizeReferenceUrl', () => {
  it('lowercases scheme and host, drops the default port and fragment', () => {
    expect(normalizeReferenceUrl('https://Example.com:443/claim/?utm=x#frag')).toBe(
      'https://example.com/claim/?utm=x',
    );
  });

  it('keeps a non-default port', () => {
    expect(normalizeReferenceUrl('https://example.com:8443/claim')).toBe(
      'https://example.com:8443/claim',
    );
  });

  it('normalizes an empty path to root and keeps a query string', () => {
    expect(normalizeReferenceUrl('https://example.com')).toBe('https://example.com/');
    expect(normalizeReferenceUrl('https://example.com?a=1')).toBe('https://example.com/?a=1');
  });

  it('preserves path case and query order because they are part of identity', () => {
    expect(normalizeReferenceUrl('https://example.com/Claim?b=2&a=1')).toBe(
      'https://example.com/Claim?b=2&a=1',
    );
  });

  it('does not fold www into the apex host', () => {
    expect(normalizeReferenceUrl('https://www.example.com/claim')).toBe(
      'https://www.example.com/claim',
    );
  });

  it('strips a trailing dot and rejects non-https or malformed input', () => {
    expect(normalizeReferenceUrl('https://example.com./claim')).toBe(
      'https://example.com/claim',
    );
    expect(normalizeReferenceUrl('http://example.com/claim')).toBeNull();
    expect(normalizeReferenceUrl('example.com/claim')).toBeNull();
    expect(normalizeReferenceUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeReferenceUrl('https:///claim')).toBeNull();
  });

  it('rejects control characters and whitespace inside the url', () => {
    expect(normalizeReferenceUrl('https://example.com/claim\nx')).toBeNull();
    expect(normalizeReferenceUrl('https://example.com/claim x')).toBeNull();
    expect(normalizeReferenceUrl('https://exa mple.com/claim')).toBeNull();
  });

  it('rejects raw input outside printable ascii in both layers', () => {
    expect(normalizeReferenceUrl('https://example.com/é')).toBeNull();
    expect(normalizeReferenceUrl('https://例え.jp/x')).toBeNull();
    expect(normalizeReferenceUrl('https://example.com/claim\u00A0')).toBeNull();
    expect(normalizeReferenceDomain('exämple.com')).toBeNull();
  });

  it('rejects percent-encoded and idn/ipv6 hosts so both layers agree', () => {
    expect(normalizeReferenceUrl('https://ex%41mple.com/x')).toBeNull();
    expect(normalizeReferenceUrl('https://[::1]/x')).toBeNull();
    expect(normalizeReferenceUrl('https://exa_mple.com/x')).toBeNull();
  });

  it('normalizes a non-default port with leading zeros like the sql layer', () => {
    expect(normalizeReferenceUrl('https://example.com:0080/x')).toBe('https://example.com:80/x');
    expect(normalizeReferenceUrl('https://example.com:0/x')).toBe('https://example.com:0/x');
  });

  it('drops an empty query like the sql layer', () => {
    expect(normalizeReferenceUrl('https://example.com?')).toBe('https://example.com/');
    expect(normalizeReferenceUrl('https://example.com?x#y')).toBe('https://example.com/?x');
  });

  it('rejects dot-segments instead of silently rewriting them', () => {
    expect(normalizeReferenceUrl('https://example.com/a/../b')).toBeNull();
    expect(normalizeReferenceUrl('https://example.com/./b')).toBeNull();
    expect(normalizeReferenceUrl('https://example.com/a/.')).toBeNull();
    expect(normalizeReferenceUrl('https://example.com/a/..')).toBeNull();
    expect(normalizeReferenceUrl('https://example.com/a..b')).toBe('https://example.com/a..b');
  });
});

describe('referenceUrlHost', () => {
  it('extracts the host from a normalized url exactly like the sql helper', () => {
    expect(referenceUrlHost('https://www.example.com/claim')).toBe('www.example.com');
    expect(referenceUrlHost('https://example.com:8443/claim')).toBe('example.com');
    expect(referenceUrlHost('https://example.com')).toBe('example.com');
  });
});

describe('normalizeReferenceDomain', () => {
  it('lowercases, strips the trailing dot, and keeps www', () => {
    expect(normalizeReferenceDomain('WWW.Example.com.')).toBe('www.example.com');
    expect(normalizeReferenceDomain('Example.COM')).toBe('example.com');
  });

  it('rejects scheme, port, path, and malformed hosts', () => {
    expect(normalizeReferenceDomain('https://example.com')).toBeNull();
    expect(normalizeReferenceDomain('example.com:443')).toBeNull();
    expect(normalizeReferenceDomain('example.com/claim')).toBeNull();
    expect(normalizeReferenceDomain('example..com')).toBeNull();
    expect(normalizeReferenceDomain('-example.com')).toBeNull();
    expect(normalizeReferenceDomain('')).toBeNull();
  });

  it('derives the same host from a url and from a bare domain', () => {
    const url = normalizeReferenceUrl('https://WWW.Example.com:443/claim');
    expect(url).not.toBeNull();
    expect(normalizeReferenceDomain(new URL(url as string).hostname)).toBe('www.example.com');
  });
});

describe('reference lexical validation', () => {
  it('shares the normalization rules so a value cannot verify under one form and flag under another', () => {
    expect(isReferenceUrlLexicallyValid('https://Example.com:443/claim#frag')).toBe(true);
    expect(isReferenceUrlLexicallyValid('http://example.com/claim')).toBe(false);
    expect(isReferenceDomainLexicallyValid('Example.com.')).toBe(true);
    expect(isReferenceDomainLexicallyValid('https://example.com')).toBe(false);
  });
});
