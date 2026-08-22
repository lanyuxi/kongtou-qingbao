import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const webRoot = fileURLToPath(new URL('../..', import.meta.url));
const smokeRoute = join(webRoot, 'src/app/review-client-bundle-smoke-test');
const nextBin = join(webRoot, 'node_modules/next/dist/bin/next');
const publicUrlMarker = 'https://public-review-bundle-marker.example.test';
const publicAnonMarker = 'public-review-anon-bundle-marker';
const forbiddenServiceMarker = 'forbidden-service-role-bundle-marker';
const forbiddenDatabaseMarker = 'postgresql://forbidden-database-bundle-marker';

describe('review browser client production bundle', () => {
  afterAll(() => {
    rmSync(smokeRoute, { recursive: true, force: true });
    rmSync(join(webRoot, '.next'), { recursive: true, force: true });
  });

  it('inlines only the two public Supabase values into a real client chunk', () => {
    mkdirSync(smokeRoute, { recursive: true });
    writeFileSync(join(smokeRoute, 'page.tsx'), `
import { ReviewClientBundleSmoke } from './smoke-client.js';

export default function Page() {
  return <ReviewClientBundleSmoke />;
}
`);
    writeFileSync(join(smokeRoute, 'smoke-client.tsx'), `
'use client';

import { useEffect } from 'react';
import { createReviewBrowserSupabaseClient } from '../../lib/supabase-browser.js';

export function ReviewClientBundleSmoke() {
  useEffect(() => {
    createReviewBrowserSupabaseClient();
  }, []);
  return null;
}
`);

    const build = spawnSync(process.execPath, [nextBin, 'build'], {
      cwd: webRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_PUBLIC_SUPABASE_URL: publicUrlMarker,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: publicAnonMarker,
        SUPABASE_SERVICE_ROLE_KEY: forbiddenServiceMarker,
        AIRDROP_DATABASE_URL: forbiddenDatabaseMarker,
      },
      timeout: 25_000,
    });
    expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);

    const bundle = clientJavaScript(join(webRoot, '.next/static/chunks'));
    expect(bundle.includes(publicUrlMarker)).toBe(true);
    expect(bundle.includes(publicAnonMarker)).toBe(true);
    expect(bundle.includes(forbiddenServiceMarker)).toBe(false);
    expect(bundle.includes(forbiddenDatabaseMarker)).toBe(false);
    expect(bundle).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|AIRDROP_DATABASE_URL/);
  }, 30_000);
});

function clientJavaScript(root: string): string {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return clientJavaScript(path);
      return entry.isFile() && path.endsWith('.js') ? [readFileSync(path, 'utf8')] : [];
    })
    .join('\n');
}
