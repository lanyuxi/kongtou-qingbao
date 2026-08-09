import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./verify-env.mjs', import.meta.url));

test('reports only missing required environment variable names', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {},
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stdout,
    [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'DATABASE_URL',
      '',
    ].join('\n'),
  );
  assert.equal(result.stderr, '');
});

test('succeeds without printing values when all required variables are present', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-test-value',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-value',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    },
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
