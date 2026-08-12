import { describe, expect, it } from 'vitest';

import {
  CollectionNetworkPolicyError,
  isWithinAuthorityDomains,
  validateConfiguredCollectionUrl,
  validateRedirectUrl,
  validateResolvedAddresses,
} from './network-policy.js';

function expectPolicyError(
  action: () => unknown,
  code: CollectionNetworkPolicyError['code'],
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(CollectionNetworkPolicyError);
  expect(thrown).toMatchObject({ code });
}

describe('validateConfiguredCollectionUrl', () => {
  it.each([
    'http://official.example/feed',
    'https://user:pass@official.example/feed',
    'https://official.example:443/feed',
    'https://127.0.0.1/feed',
    'https://[::1]/feed',
    'https://0177.0.0.1/feed',
    'https://OFFICIAL.example/feed',
  ])('rejects unsafe collection URL %s', (url) => {
    expect(() =>
      validateConfiguredCollectionUrl({
        candidateUrl: url,
        configuredUrl: url,
        authorityDomains: ['official.example'],
      }),
    ).toThrow(CollectionNetworkPolicyError);
  });

  it('requires the initial request to equal the configured URL exactly', () => {
    expectPolicyError(
      () =>
      validateConfiguredCollectionUrl({
        candidateUrl: 'https://official.example/other',
        configuredUrl: 'https://official.example/feed',
        authorityDomains: ['official.example'],
      }),
      'rejected_url',
    );
  });

  it('accepts an exact canonical HTTPS URL in the authority set', () => {
    const result = validateConfiguredCollectionUrl({
      candidateUrl: 'https://feeds.official.example/path?q=1',
      configuredUrl: 'https://feeds.official.example/path?q=1',
      authorityDomains: ['official.example'],
    });

    expect(result.hostname).toBe('feeds.official.example');
    expect(result.url.href).toBe('https://feeds.official.example/path?q=1');
  });

  it('rejects a raw Unicode hostname instead of silently converting it', () => {
    expectPolicyError(
      () =>
      validateConfiguredCollectionUrl({
        candidateUrl: 'https://münich.example/feed',
        configuredUrl: 'https://münich.example/feed',
        authorityDomains: ['xn--mnich-kva.example'],
      }),
      'rejected_url',
    );
  });

  it('accepts an exact canonical xn-- hostname when that ASCII hostname is authorized', () => {
    const result = validateConfiguredCollectionUrl({
      candidateUrl: 'https://xn--mnich-kva.example/feed',
      configuredUrl: 'https://xn--mnich-kva.example/feed',
      authorityDomains: ['xn--mnich-kva.example'],
    });

    expect(result.hostname).toBe('xn--mnich-kva.example');
  });

  it.each([
    'https://official.example.attacker.test/feed',
    'https://not-official.example/feed',
  ])('rejects hostname outside authority label boundaries: %s', (url) => {
    expectPolicyError(
      () =>
      validateConfiguredCollectionUrl({
        candidateUrl: url,
        configuredUrl: url,
        authorityDomains: ['official.example'],
      }),
      'rejected_url',
    );
  });
});

describe('isWithinAuthorityDomains', () => {
  it.each([
    ['official.example', true],
    ['feeds.official.example', true],
    ['deep.feeds.official.example', true],
    ['official.example.attacker.test', false],
    ['not-official.example', false],
    ['officialexample', false],
  ] as const)('enforces hostname label boundaries for %s', (hostname, expected) => {
    expect(isWithinAuthorityDomains(hostname, ['official.example'])).toBe(expected);
  });

  it('accepts a verified sibling domain only when it is explicitly authorized', () => {
    expect(isWithinAuthorityDomains('cdn.verified-sibling.example', ['official.example'])).toBe(false);
    expect(
      isWithinAuthorityDomains('cdn.verified-sibling.example', [
        'official.example',
        'verified-sibling.example',
      ]),
    ).toBe(true);
  });

  it.each(['127.0.0.1', '2130706433', '0177.0.0.1'])(
    'rejects an IP literal or legacy numeric candidate hostname %s',
    (hostname) => {
      expect(isWithinAuthorityDomains(hostname, [hostname])).toBe(false);
    },
  );

  it.each([
    ['feeds.127.0.0.1', '127.0.0.1'],
    ['feeds.2130706433', '2130706433'],
    ['feeds.0177.0.0.1', '0177.0.0.1'],
  ])('rejects an IP literal or legacy numeric authority domain %s', (hostname, domain) => {
    expect(isWithinAuthorityDomains(hostname, [domain])).toBe(false);
  });
});

describe('validateRedirectUrl', () => {
  it('accepts a same-domain redirect through hop 3', () => {
    const result = validateRedirectUrl({
      candidateUrl: 'https://official.example/redirected',
      authorityDomains: ['official.example'],
      hop: 3,
    });

    expect(result.hostname).toBe('official.example');
    expect(result.url.href).toBe('https://official.example/redirected');
  });

  it('accepts a redirect to an explicitly verified sibling authority domain', () => {
    const result = validateRedirectUrl({
      candidateUrl: 'https://cdn.verified-sibling.example/feed',
      authorityDomains: ['official.example', 'verified-sibling.example'],
      hop: 1,
    });

    expect(result.hostname).toBe('cdn.verified-sibling.example');
  });

  it('rejects redirect hop 4', () => {
    expectPolicyError(
      () =>
      validateRedirectUrl({
        candidateUrl: 'https://official.example/redirected',
        authorityDomains: ['official.example'],
        hop: 4,
      }),
      'redirect_rejected',
    );
  });

  it.each([
    'http://official.example/feed',
    'https://official.example:443/feed',
    'https://127.0.0.1/feed',
    'https://official.example.attacker.test/feed',
  ])('rejects an unsafe redirect URL without widening authority: %s', (candidateUrl) => {
    expectPolicyError(
      () =>
      validateRedirectUrl({
        candidateUrl,
        authorityDomains: ['official.example'],
        hop: 1,
      }),
      'redirect_rejected',
    );
  });
});

describe('validateResolvedAddresses', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '100.64.0.1',
    '169.254.1.1',
    '192.0.2.1',
    '224.0.0.1',
    '0.0.0.0',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
    'ff02::1',
    '::',
    '4000::1',
    '8000::1',
  ])('rejects non-global resolved address %s', (address) => {
    expectPolicyError(
      () => validateResolvedAddresses([{ address, family: address.includes(':') ? 6 : 4 }]),
      'rejected_dns_target',
    );
  });

  it('rejects the complete DNS answer when any returned address is unsafe', () => {
    expectPolicyError(
      () =>
      validateResolvedAddresses([
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]),
      'rejected_dns_target',
    );
  });

  it('rejects an empty DNS answer', () => {
    expectPolicyError(() => validateResolvedAddresses([]), 'rejected_dns_target');
  });

  it('accepts public IPv4 and IPv6 answers', () => {
    const records = [
      { address: '93.184.216.34', family: 4 as const },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 as const },
    ];

    expect(validateResolvedAddresses(records)).toEqual(records);
  });

  it('accepts an IPv4-mapped IPv6 address only when its mapped IPv4 address is public', () => {
    const records = [{ address: '::ffff:93.184.216.34', family: 6 as const }];

    expect(validateResolvedAddresses(records)).toEqual(records);
  });

  it.each([
    { address: 'not-an-ip', family: 4 as const },
    { address: '93.184.216.34', family: 6 as const },
    { address: '2606:2800:220:1:248:1893:25c8:1946', family: 4 as const },
  ])('rejects malformed or family-mismatched DNS record $address', (record) => {
    expectPolicyError(() => validateResolvedAddresses([record]), 'rejected_dns_target');
  });
});
