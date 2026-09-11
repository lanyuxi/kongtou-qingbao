import { describe, expect, it } from 'vitest';

import { selectJsonApiAdapter } from './json-api-adapter.js';
import { toJsonApiEntry } from './json-api-entry.js';

const SERIES = [{ date: 1_789_084_800, tvl: 49_287_487_551 }];

describe('selectJsonApiAdapter', () => {
  it('returns an adapter for a registered DeFiLlama chain source', () => {
    const adapter = selectJsonApiAdapter(
      'https://api.llama.fi/v2/historicalChainTvl/ethereum',
    );

    expect(adapter?.id).toBe('defillama-chain-tvl:ethereum');
    expect(adapter?.parse(SERIES)).toHaveLength(1);
  });

  it('binds the chain from the configured URL, not from the payload', () => {
    const solana = selectJsonApiAdapter('https://api.llama.fi/v2/historicalChainTvl/solana');
    const arbitrum = selectJsonApiAdapter('https://api.llama.fi/v2/historicalChainTvl/arbitrum');

    expect(solana?.parse(SERIES)[0]?.externalEntryId).toBe('defillama:chain-tvl:solana');
    expect(arbitrum?.parse(SERIES)[0]?.externalEntryId).toBe('defillama:chain-tvl:arbitrum');
  });

  it.each([
    ['an unknown host', 'https://api.other.test/v2/historicalChainTvl/ethereum'],
    ['an unregistered DeFiLlama path', 'https://api.llama.fi/v2/chains'],
    ['the DeFiLlama hacks path', 'https://api.llama.fi/hacks'],
    ['a prefix without a chain', 'https://api.llama.fi/v2/historicalChainTvl/'],
    ['a chain with a path', 'https://api.llama.fi/v2/historicalChainTvl/ethereum/extra'],
    ['a chain with a query', 'https://api.llama.fi/v2/historicalChainTvl/ethereum?x=1'],
    ['an uppercase chain', 'https://api.llama.fi/v2/historicalChainTvl/Ethereum'],
    ['a near-miss host', 'https://api.llama.fi.attacker.test/v2/historicalChainTvl/ethereum'],
    ['an empty URL', ''],
  ])('fails closed for %s', (_label, url) => {
    expect(selectJsonApiAdapter(url)).toBeNull();
  });
});

describe('toJsonApiEntry', () => {
  const valid = {
    externalEntryId: 'defillama:chain-tvl:ethereum',
    entryUrl: null,
    title: 'DeFiLlama chain TVL — ethereum',
    summary: 'DeFiLlama chain TVL for ethereum: 49,287,487,551 USD as of 2026-09-11.',
    publishedAt: '2026-09-11T00:00:00.000Z',
  };

  it('accepts a fully formed entry', () => {
    expect(toJsonApiEntry(valid)).toEqual(valid);
  });

  it('trims surrounding whitespace', () => {
    expect(toJsonApiEntry({ ...valid, title: '  spaced  ' })?.title).toBe('spaced');
  });

  it('requires an identity', () => {
    expect(toJsonApiEntry({ ...valid, externalEntryId: null })).toBeNull();
    expect(toJsonApiEntry({ ...valid, externalEntryId: '   ' })).toBeNull();
    expect(toJsonApiEntry({ ...valid, externalEntryId: undefined })).toBeNull();
  });

  it.each([
    ['a non-string title', { title: 42 }],
    ['an over-long title', { title: 't'.repeat(501) }],
    ['an over-long summary', { summary: 's'.repeat(2_001) }],
    ['an over-long identity', { externalEntryId: 'i'.repeat(2_049) }],
  ])('rejects %s rather than truncating a quote', (_label, patch) => {
    expect(toJsonApiEntry({ ...valid, ...patch })).toBeNull();
  });

  it('allows absent optional display fields', () => {
    expect(
      toJsonApiEntry({ ...valid, title: null, summary: null, publishedAt: null }),
    ).toEqual({ ...valid, title: null, summary: null, publishedAt: null });
  });

  it.each([
    '2026-09-11',
    '2026-09-11T00:00:00',
    '2026-09-11T00:00:00+02:00',
    'yesterday',
  ])('rejects the non-UTC-instant publishedAt %s', (publishedAt) => {
    expect(toJsonApiEntry({ ...valid, publishedAt })).toBeNull();
  });

  it('accepts a UTC instant with or without milliseconds', () => {
    expect(toJsonApiEntry({ ...valid, publishedAt: '2026-09-11T00:00:00Z' })?.publishedAt).toBe(
      '2026-09-11T00:00:00Z',
    );
  });
});
