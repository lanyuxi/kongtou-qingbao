import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import * as database from '../index.js';

describe('@airdrop/database entry points', () => {
  it('does not expose the server client from the browser-safe root export', () => {
    expect(database).not.toHaveProperty('createServerSupabaseClient');
    expect(database).not.toHaveProperty('createSourceCollectionRepository');
    expect(database).not.toHaveProperty('createDurableCollectionQueueRepository');
  });

  it('rejects the collection queue worker package export under browser module resolution', () => {
    const result = spawnSync(
      process.execPath,
      ['--conditions=browser', '--import=tsx', '--eval', "import('@airdrop/database/collection-queue-worker')"],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '@airdrop/database/collection-queue-worker is unavailable in browser code.',
    );
    expect(result.stderr).not.toMatch(/postgres(?:\.js)?/i);
  });

  it('rejects the server-only entry under client module resolution', async () => {
    await expect(import('../server-client.js')).rejects.toThrow('Client Component');
  });

  it('rejects the collection worker package export under browser module resolution', () => {
    const result = spawnSync(
      process.execPath,
      ['--conditions=browser', '--import=tsx', '--eval', "import('@airdrop/database/collection-worker')"],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '@airdrop/database/collection-worker is unavailable in browser code.',
    );
    expect(result.stderr).not.toMatch(/postgres(?:\.js)?/i);
  });
});
