import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('legacy promote-candidate CLI', () => {
  it('fails closed with only the stable replacement instruction', () => {
    const result = spawnSync(
      process.execPath,
      ['--import=tsx', 'src/ai/promote-candidate.ts'],
      { cwd: process.cwd(), encoding: 'utf8', env: {} },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('legacy_promotion_cli_disabled_use_review_candidate\n');
  });
});
