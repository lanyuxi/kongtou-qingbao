import { describe, expect, it } from 'vitest';

import { matchIndicatorToReference } from './flag-match.js';

const reference = {
  referenceId: '11111111-1111-4111-8111-111111111111',
  url: 'https://www.example.com/claim',
  domain: 'www.example.com',
};

describe('matchIndicatorToReference', () => {
  it('matches an accepted url indicator to the exact normalized url only', () => {
    expect(
      matchIndicatorToReference(
        { type: 'url', value: 'https://WWW.Example.com:443/claim#frag' },
        [reference, { ...reference, referenceId: '22222222-2222-4222-8222-222222222222', url: 'https://www.example.com/other' }],
      ),
    ).toEqual([reference.referenceId]);
  });

  it('matches an accepted domain indicator to every reference on that host', () => {
    const matches = matchIndicatorToReference({ type: 'domain', value: 'WWW.Example.com.' }, [
      reference,
      {
        referenceId: '22222222-2222-4222-8222-222222222222',
        url: 'https://www.example.com/other',
        domain: 'www.example.com',
      },
      {
        referenceId: '33333333-3333-4333-8333-333333333333',
        url: 'https://example.com/claim',
        domain: 'example.com',
      },
    ]);
    expect(matches).toEqual([
      reference.referenceId,
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('does not match a sibling path under the same host for a url indicator', () => {
    expect(
      matchIndicatorToReference({ type: 'url', value: 'https://www.example.com/evil' }, [reference]),
    ).toEqual([]);
  });

  it('ignores indicator types that cannot identify a link', () => {
    expect(
      matchIndicatorToReference(
        { type: 'observed_behavior', value: 'https://www.example.com/claim' },
        [reference],
      ),
    ).toEqual([]);
    expect(
      matchIndicatorToReference({ type: 'contract_address', value: 'www.example.com' }, [reference]),
    ).toEqual([]);
  });

  it('ignores malformed indicator values instead of falling back to substring matching', () => {
    expect(matchIndicatorToReference({ type: 'url', value: 'not-a-url' }, [reference])).toEqual([]);
    expect(matchIndicatorToReference({ type: 'domain', value: 'https://example.com' }, [reference]))
      .toEqual([]);
  });
});
