import { describe, expect, it } from 'vitest';

import { createSourceCollector } from '../create-collector.js';

describe('createSourceCollector', () => {
  it.each([
    { databaseUrl: '', userAgent: 'Airdrop Collector/1.0' },
    { databaseUrl: 'https://database.example/db', userAgent: 'Airdrop Collector/1.0' },
    { databaseUrl: 'postgresql://collector@example.test/airdrop', userAgent: '' },
    { databaseUrl: 'postgresql://collector@example.test/airdrop', userAgent: 'bad\r\nheader' },
  ])('rejects invalid composition options before creating resources', (options) => {
    let caught: unknown;
    try {
      createSourceCollector(options);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      name: 'SourceCollectorConfigurationError',
      code: 'invalid_collection_configuration',
    });
  });

  it('returns a dormant collect function and explicit pool close operation', async () => {
    const collector = createSourceCollector({
      databaseUrl: 'postgresql://collection_worker@example.test/airdrop',
      userAgent: 'Airdrop Intelligence OS Collector/1.0',
    });

    expect(Object.keys(collector).sort()).toEqual(['close', 'collect']);
    expect(collector.collect).toEqual(expect.any(Function));
    await expect(collector.close()).resolves.toBeUndefined();
  });
});
