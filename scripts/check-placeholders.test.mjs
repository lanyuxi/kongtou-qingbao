import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./check-placeholders.mjs', import.meta.url));

function runScanner(root) {
  return spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
}

test('fails for unfinished markers in owned files', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'airdrop-placeholder-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'owned.ts'), `// ${'TO' + 'DO'}: finish implementation\n`);

  const result = runScanner(root);

  assert.equal(result.status, 1);
  assert.match(result.stdout, new RegExp(`owned\\.ts:1: ${'TO' + 'DO'}`));
  assert.equal(result.stderr, '');
});

test('ignores dependency, generated, and lockfile paths', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'airdrop-placeholder-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });
  mkdirSync(join(root, 'packages', 'database', 'src', 'generated'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), `// ${'TO' + 'DO'}: dependency\n`);
  writeFileSync(join(root, 'dist', 'bundle.js'), `// ${'FIX' + 'ME'}: generated build\n`);
  writeFileSync(join(root, 'packages', 'database', 'src', 'generated', 'types.ts'), `// ${'X' + 'XX'} generated\n`);
  writeFileSync(join(root, 'pnpm-lock.yaml'), `# ${'TO' + 'DO'} lockfile\n`);

  const result = runScanner(root);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
