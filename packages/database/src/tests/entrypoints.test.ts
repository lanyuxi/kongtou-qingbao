import { describe, expect, it } from 'vitest';

import * as database from '../index.js';

describe('@airdrop/database entry points', () => {
  it('does not expose the server client from the browser-safe root export', () => {
    expect(database).not.toHaveProperty('createServerSupabaseClient');
  });

  it('rejects the server-only entry under client module resolution', async () => {
    await expect(import('../server-client.js')).rejects.toThrow('Client Component');
  });
});
