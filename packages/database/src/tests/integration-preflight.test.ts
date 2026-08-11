import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const preflightScript = fileURLToPath(
  new URL('../../scripts/require-integration-env.mjs', import.meta.url),
);

describe('database integration environment preflight', () => {
  it('fails with stable variable names without printing environment values', () => {
    const result = spawnSync(process.execPath, [preflightScript], {
      encoding: 'utf8',
      env: {},
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Database repository integration requires AIRDROP_DATABASE_TEST_URL, AIRDROP_ANON_SUPABASE_URL, and AIRDROP_ANON_SUPABASE_KEY.\n',
    );
  });
});
