import { describe, expect, it } from 'vitest';

import {
  createSafeDnsResolver,
  type DnsLookup,
} from '../dns-resolver.js';

describe('createSafeDnsResolver', () => {
  it('requests every DNS answer in resolver order and preserves address families', async () => {
    const calls: Array<{
      readonly hostname: string;
      readonly options: { readonly all: true; readonly order: 'verbatim' };
    }> = [];
    const lookup: DnsLookup = (hostname, options, callback) => {
      calls.push({ hostname, options });
      callback(null, [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ]);
    };

    const addresses = await createSafeDnsResolver(lookup).resolve('test.example');

    expect(calls).toEqual([
      {
        hostname: 'test.example',
        options: { all: true, order: 'verbatim' },
      },
    ]);
    expect(addresses).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
  });

  it('rejects an empty DNS answer', async () => {
    const lookup: DnsLookup = (_hostname, _options, callback) => callback(null, []);

    await expect(createSafeDnsResolver(lookup).resolve('test.example')).rejects.toMatchObject({
      code: 'rejected_dns_target',
    });
  });

  it('rejects the complete DNS answer when any returned address is unsafe', async () => {
    const lookup: DnsLookup = (_hostname, _options, callback) => {
      callback(null, [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]);
    };

    await expect(createSafeDnsResolver(lookup).resolve('test.example')).rejects.toMatchObject({
      code: 'rejected_dns_target',
    });
  });

  it('propagates lookup failures without accepting a partial result', async () => {
    const lookupError = Object.assign(new Error('lookup failed'), { code: 'EAI_AGAIN' });
    const lookup: DnsLookup = (_hostname, _options, callback) => callback(lookupError, []);

    await expect(createSafeDnsResolver(lookup).resolve('test.example')).rejects.toBe(lookupError);
  });
});
