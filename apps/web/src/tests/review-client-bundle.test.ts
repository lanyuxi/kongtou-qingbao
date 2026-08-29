import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = fileURLToPath(new URL('../..', import.meta.url));
const repositoryRoot = join(webRoot, '../..');
const nextBin = join(webRoot, 'node_modules/next/dist/bin/next');
const publicUrlMarker = 'https://public-review-bundle-marker.example.test';
const publicAnonMarker = 'public-review-anon-bundle-marker';
const sessionRuntimeMarker = 'sign_in_failed';
const apiRuntimeMarker = 'review_version_conflict';
const securityApiRuntimeMarker = 'security_version_conflict';
const forbiddenServiceMarker = 'forbidden-service-role-bundle-marker';
const forbiddenDatabaseMarker = 'postgresql://forbidden-database-bundle-marker';
const forbiddenPromotionMarker = 'forbidden-promotion-env-bundle-marker';
const forbiddenWorkerMarker = 'forbidden-worker-env-bundle-marker';

describe('review browser client production bundle', () => {
  it('bundles the review runtime with only public Supabase values and preserves a sibling', () => {
    const parent = mkdtempSync(join(tmpdir(), 'airdrop-review-client-bundle-'));
    const fixtureRoot = join(parent, 'owned-next-project');
    const sentinel = join(parent, 'pre-existing-sibling.txt');
    let build: ReturnType<typeof spawnSync> | undefined;
    let bundle: string | undefined;

    try {
      writeFileSync(sentinel, 'keep me');
      try {
        createFixture(fixtureRoot);
        build = spawnSync(process.execPath, [nextBin, 'build', '--webpack'], {
          cwd: fixtureRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            NEXT_TELEMETRY_DISABLED: '1',
            NEXT_PUBLIC_SUPABASE_URL: publicUrlMarker,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: publicAnonMarker,
            SUPABASE_SERVICE_ROLE_KEY: forbiddenServiceMarker,
            AIRDROP_DATABASE_URL: forbiddenDatabaseMarker,
            AIRDROP_PROMOTION_SERVICE_URL: forbiddenPromotionMarker,
            AIRDROP_WORKER_QUEUE_SECRET: forbiddenWorkerMarker,
          },
          timeout: 25_000,
        });
        if (build.status === 0) {
          bundle = clientJavaScript(join(fixtureRoot, '.next/static/chunks'));
        }
      } finally {
        rmSync(fixtureRoot, { recursive: true, force: true });
      }

      expect(readFileSync(sentinel, 'utf8')).toBe('keep me');
      expect(build?.status, `${build?.stdout ?? ''}\n${build?.stderr ?? ''}`).toBe(0);
      expect(bundle?.includes(publicUrlMarker)).toBe(true);
      expect(bundle?.includes(publicAnonMarker)).toBe(true);
      expect({
        sessionRuntime: bundle?.includes(sessionRuntimeMarker),
        apiRuntime: bundle?.includes(apiRuntimeMarker),
        securityApiRuntime: bundle?.includes(securityApiRuntimeMarker),
      }).toEqual({ sessionRuntime: true, apiRuntime: true, securityApiRuntime: true });
      expect(bundle?.includes(forbiddenServiceMarker)).toBe(false);
      expect(bundle?.includes(forbiddenDatabaseMarker)).toBe(false);
      expect(bundle?.includes(forbiddenPromotionMarker)).toBe(false);
      expect(bundle?.includes(forbiddenWorkerMarker)).toBe(false);
      expect(bundle).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|AIRDROP_DATABASE_URL|AIRDROP_PROMOTION_SERVICE_URL|AIRDROP_WORKER_QUEUE_SECRET/);
      expect(bundle).not.toMatch(/createSecurityReviewRepository|createSecurityPublicRepository|postgres|internalNote|evidenceLocator|rawPayload/);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 30_000);
});

function createFixture(fixtureRoot: string): void {
  const app = join(fixtureRoot, 'src/app');
  const lib = join(fixtureRoot, 'src/lib');
  const stubs = join(fixtureRoot, 'src/stubs');
  const nodeModules = join(fixtureRoot, 'node_modules');
  mkdirSync(app, { recursive: true });
  mkdirSync(lib, { recursive: true });
  mkdirSync(stubs, { recursive: true });
  mkdirSync(nodeModules);
  for (const packageName of ['next', 'react', 'react-dom', 'zod']) {
    symlinkSync(join(webRoot, 'node_modules', packageName), join(nodeModules, packageName), 'dir');
  }
  mkdirSync(join(nodeModules, '@airdrop'));
  symlinkSync(
    join(webRoot, 'node_modules/@airdrop/contracts'),
    join(nodeModules, '@airdrop/contracts'),
    'dir',
  );
  symlinkSync(join(repositoryRoot, 'node_modules/typescript'), join(nodeModules, 'typescript'), 'dir');
  symlinkSync(join(webRoot, 'node_modules/@types'), join(nodeModules, '@types'), 'dir');

  for (const file of [
    'env.ts',
    'review-api-client.ts',
    'security-review-api-client.ts',
    'review-session.ts',
    'supabase-browser.ts',
  ]) {
    copyFileSync(join(webRoot, 'src/lib', file), join(lib, file));
  }

  writeFileSync(join(fixtureRoot, 'next.config.ts'), `
import type { NextConfig } from 'next';
import { join } from 'node:path';

const nextConfig: NextConfig = {
  transpilePackages: ['@airdrop/contracts'],
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    config.resolve.alias['@airdrop/database'] = join(process.cwd(), 'src/stubs/database.ts');
    return config;
  },
};

export default nextConfig;
`);
  writeFileSync(join(stubs, 'database.ts'), `
export function createBrowserSupabaseClient(input: { url: string; anonKey: string }) {
  return {
    auth: {
      async signInWithPassword() { return { data: { session: null }, error: null }; },
      async getSession() {
        return { data: { session: { access_token: 'fixture-access-token' } }, error: null };
      },
      async signOut() { return { error: null }; },
    },
    input,
  };
}
`);

  writeFileSync(join(fixtureRoot, 'package.json'), JSON.stringify({
    name: 'review-client-bundle-fixture',
    private: true,
    type: 'module',
  }));
  writeFileSync(join(fixtureRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['DOM', 'DOM.Iterable', 'ES2022'],
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      baseUrl: '.',
      ignoreDeprecations: '6.0',
      paths: { '@airdrop/database': ['src/stubs/database.ts'] },
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'Preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
    },
    include: ['next-env.d.ts', 'src/**/*.ts', 'src/**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }));
  writeFileSync(join(app, 'layout.tsx'), `
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return <html><body>{children}</body></html>;
}
`);
  writeFileSync(join(app, 'page.tsx'), `
import { ReviewClientBundleSmoke } from './smoke-client';

export default function Page() {
  return <ReviewClientBundleSmoke />;
}
`);
  writeFileSync(join(app, 'smoke-client.tsx'), `
'use client';

import { useEffect } from 'react';
import { createReviewApiClient } from '../lib/review-api-client';
import { createSecurityReviewApiClient } from '../lib/security-review-api-client';
import { createReviewSessionController } from '../lib/review-session';
import {
  createReviewBrowserAuthPort,
  createReviewBrowserSupabaseClient,
} from '../lib/supabase-browser';

export function ReviewClientBundleSmoke() {
  useEffect(() => {
    const browserClient = createReviewBrowserSupabaseClient();
    const session = createReviewSessionController(createReviewBrowserAuthPort(browserClient.auth));
    const api = createReviewApiClient({
      session,
      fetch: async () => Response.json({
        ok: false,
        error: {
          code: 'review_idempotency_conflict',
          message: 'Fixture conflict.',
          requestId: 'a1000000-0000-4000-8000-000000000001',
          details: null,
        },
      }, { status: 409 }),
      ids: { generate: () => 'fixture-idempotency-key' },
    });
    const securityApi = createSecurityReviewApiClient({
      session,
      fetch: async () => Response.json({
        ok: false,
        error: {
          code: 'security_version_conflict',
          message: 'Fixture conflict.',
          requestId: 'a1000000-0000-4000-8000-000000000001',
          details: null,
        },
      }, { status: 409 }),
      ids: { generate: () => 'fixture-security-idempotency-key' },
    });

    void session.signIn('reviewer@example.test', 'fixture-password').then((result) => {
      document.body.dataset.sessionResult = result.ok ? 'ok' : result.code;
    });
    void api.get('a2000000-0000-4000-8000-000000000001').then((result) => {
      document.body.dataset.apiResult = result.ok
        ? 'ok'
        : result.state === 'conflict'
          ? result.code
          : result.state;
    });
    void securityApi.reviewCandidate('a2000000-0000-4000-8000-000000000001', {
      version: 1,
      candidateId: 'a2000000-0000-4000-8000-000000000001',
      expectedCandidateVersion: 1,
      decision: 'reject',
      reasonCode: 'claim_not_supported',
      note: null,
    });
  }, []);
  return null;
}
`);
}

function clientJavaScript(root: string): string {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return clientJavaScript(path);
      return entry.isFile() && path.endsWith('.js') ? [readFileSync(path, 'utf8')] : [];
    })
    .join('\n');
}
