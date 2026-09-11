import { describe, expect, it } from 'vitest';

import {
  DEFILLAMA_CHAIN_TVL_URL_PREFIX,
  isDefiLlamaChainSlug,
  parseDefiLlamaChainTvl,
} from './chain-json-adapter.js';

// 1789084800 seconds === 2026-09-11T00:00:00.000Z
const SERIES = [
  { date: 1_784_000_000, tvl: 48_000_000_000 },
  { date: 1_789_084_800, tvl: 49_287_487_551 },
];

describe('parseDefiLlamaChainTvl', () => {
  it('keeps only the latest point and quotes it verbatim in the summary', () => {
    const entries = parseDefiLlamaChainTvl('ethereum', SERIES);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      externalEntryId: 'defillama:chain-tvl:ethereum',
      entryUrl: null,
      title: 'DeFiLlama chain TVL — ethereum',
      summary: 'DeFiLlama chain TVL for ethereum: 49,287,487,551 USD as of 2026-09-11.',
      publishedAt: '2026-09-11T00:00:00.000Z',
    });
  });

  it('has no entry URL, so the collector never treats an API endpoint as an article', () => {
    expect(parseDefiLlamaChainTvl('solana', SERIES)[0]?.entryUrl).toBeNull();
  });

  it('is deterministic for the same payload', () => {
    expect(parseDefiLlamaChainTvl('arbitrum', SERIES)).toEqual(
      parseDefiLlamaChainTvl('arbitrum', SERIES),
    );
  });

  it('groups digits without depending on host locale data', () => {
    const summary = parseDefiLlamaChainTvl('solana', [{ date: 1_789_084_800, tvl: 5_799_059_782.34 }])[0]
      ?.summary;
    expect(summary).toContain('5,799,059,782 USD');
  });

  it.each([
    ['a non-array body', { tvl: 1, date: 1_789_084_800 }],
    ['an empty series', []],
    ['a string body', '{"tvl":1}'],
    ['null', null],
  ])('fails closed on %s', (_label, body) => {
    expect(parseDefiLlamaChainTvl('ethereum', body)).toEqual([]);
  });

  it.each([
    ['a missing tvl', [{ date: 1_789_084_800 }]],
    ['a non-numeric tvl', [{ date: 1_789_084_800, tvl: 'lots' }]],
    ['a negative tvl', [{ date: 1_789_084_800, tvl: -1 }]],
    ['a non-finite tvl', [{ date: 1_789_084_800, tvl: Number.POSITIVE_INFINITY }]],
    ['a missing date', [{ tvl: 100 }]],
    ['a non-numeric date', [{ date: 'yesterday', tvl: 100 }]],
    ['an implausible date', [{ date: 1, tvl: 100 }]],
    ['a millisecond date', [{ date: 1_789_084_800_000, tvl: 100 }]],
    ['an implausibly large tvl', [{ date: 1_789_084_800, tvl: 1e15 + 1 }]],
    ['a null row', [null]],
    ['a non-object row', ['nope']],
  ])('fails closed on %s', (_label, body) => {
    expect(parseDefiLlamaChainTvl('ethereum', body)).toEqual([]);
  });

  it('still groups digits at the top of the plausible range', () => {
    const summary = parseDefiLlamaChainTvl('ethereum', [
      { date: 1_789_084_800, tvl: 1e15 },
    ])[0]?.summary;
    expect(summary).toContain('1,000,000,000,000,000 USD');
  });

  it('skips trailing unusable rows instead of discarding the pass', () => {
    const entries = parseDefiLlamaChainTvl('arbitrum', [
      { date: 1_789_084_800, tvl: 1_381_702_610.9 },
      { date: 1_789_171_200, tvl: null },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.summary).toContain('1,381,702,611 USD');
  });

  it.each(['', 'Ethereum', 'eth ereum', 'a/b', '../etc', 'a'.repeat(65)])(
    'fails closed on the invalid chain slug %s',
    (chain) => {
      expect(parseDefiLlamaChainTvl(chain, SERIES)).toEqual([]);
    },
  );
});

describe('isDefiLlamaChainSlug', () => {
  it.each(['ethereum', 'solana', 'arbitrum', 'op-mainnet', 'a', 'z9'])(
    'accepts %s',
    (chain) => expect(isDefiLlamaChainSlug(chain)).toBe(true),
  );

  it.each(['', 'Ethereum', 'eth/', 'eth?x=1', ' eth', '-eth', 'a'.repeat(65)])(
    'rejects %s',
    (chain) => expect(isDefiLlamaChainSlug(chain)).toBe(false),
  );
});

describe('the DeFiLlama URL prefix', () => {
  it('is the exact per-chain endpoint the adapter owns', () => {
    expect(DEFILLAMA_CHAIN_TVL_URL_PREFIX).toBe('https://api.llama.fi/v2/historicalChainTvl/');
  });
});
