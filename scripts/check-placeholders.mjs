import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.pnpm-store',
  'coverage',
  'dist',
  'generated',
  'node_modules',
]);
const ignoredFiles = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
const markerPattern = new RegExp(`\\b(${['TO' + 'DO', 'FIX' + 'ME', 'X' + 'XX', 'PLACE' + 'HOLDER'].join('|')})\\b`);
const root = resolve(process.argv[2] ?? process.cwd());
const findings = [];

function scan(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const details = statSync(path);

    if (details.isDirectory()) {
      if (!ignoredDirectories.has(entry)) scan(path);
      continue;
    }
    if (!details.isFile() || ignoredFiles.has(entry)) continue;

    const contents = readFileSync(path, 'utf8');
    if (contents.includes('\0')) continue;
    const lines = contents.split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      const match = markerPattern.exec(line);
      if (match) findings.push(`${relative(root, path)}:${index + 1}: ${match[1]}`);
    }
  }
}

scan(root);

if (findings.length > 0) {
  process.stdout.write(`${findings.join('\n')}\n`);
  process.exitCode = 1;
}
