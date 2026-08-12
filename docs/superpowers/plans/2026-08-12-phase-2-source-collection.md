# Phase 2 Source Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe, append-only collection kernel for exact configured official HTML and RSS/Atom sources, including verified-domain article discovery and a queue-ready single-collection use case.

**Architecture:** Use a ports-and-adapters boundary. Shared contracts define the collect command and stable results; pure domain code decides URL, address, content, and deduplication policy; `packages/database` owns the append-only schema and short transactions; `apps/worker` owns Node DNS/HTTPS/XML adapters and orchestration. No network operation occurs inside a database transaction, and no collected record is canonical intelligence.

**Tech Stack:** TypeScript strict mode, Zod 4, Node.js 22 `dns`/`https`/`zlib`/`crypto`, `ipaddr.js` 2.4.0, `saxes` 6.0.0, PostgreSQL/Supabase, postgres.js, pgTAP, Vitest, pnpm workspaces.

## Global Constraints

- Follow `AGENTS.md` and the approved design in `docs/superpowers/specs/2026-08-12-phase-2-source-collection-design.md` before every task.
- Use TDD for every behavior: write one failing test, observe the expected failure, implement the minimum behavior, observe GREEN, then refactor.
- Starting URLs must exactly match the configured source URL; article and redirect hosts must stay within verified authority domains.
- Every initial request and redirect hop must validate HTTPS, canonical hostname, default port, and every resolved IPv4/IPv6 address before connecting.
- Connect with the validated address while retaining the original hostname for TLS SNI and certificate verification; never perform an unvalidated connection-time lookup.
- Connection timeout is 5 seconds; total per-request timeout is 20 seconds; redirect limit is 3; decompressed response limit is 2 MiB.
- Only HTML and valid RSS/Atom XML encoded as UTF-8 are accepted.
- Feed entry limit is 100 and article body-fetch limit is 20, processed sequentially.
- Raw Items, collection attempts, and discovery versions are append-only and inaccessible to browser roles.
- Do not persist credentials, cookies, authorization data, arbitrary header collections, failed bodies, or stack traces.
- No queue runner, schedule, automatic retry, concurrent fetcher, browser automation, social API, chain scanner, AI stage, Evidence promotion, or canonical intelligence write is in scope.
- Queue payloads and use-case results contain object IDs and versions, never full source documents.
- Do not add a production dependency without retaining the dependency rationale in the Phase 2 architecture document.
- Update migrations, pgTAP, generated types, repository code, and RLS tests together.
- Run the narrowest relevant test first, then the task acceptance command; run `pnpm verify` before each task commit.

---

## File Map

```text
packages/contracts/src/collection/
  source-collection.ts        strict collect command, result, codes, and DTO schemas
  source-collection.test.ts   contract rejection and compatibility tests

packages/domain/src/collection/
  network-policy.ts           pure URL, authority-domain, redirect, and IP decisions
  content-policy.ts           media type, UTF-8, hash, stable key, and budget decisions
  *.test.ts                   exhaustive pure policy tests

supabase/migrations/
  20260812000800_source_collection.sql
supabase/tests/
  008_source_collection.test.sql

packages/database/src/collection/
  types.ts                    database-facing collection records and transaction inputs
  source-collection-repository.ts
                              postgres.js repository and short transaction implementation
  worker-entry.ts             explicit worker-only package entry point
packages/database/src/tests/
  source-collection-repository.test.ts
  source-collection-repository.integration.test.ts

apps/worker/src/collection/
  ports.ts                    DNS, HTTP, hash, feed parser, clock, ID, and repository ports
  dns-resolver.ts             Node resolver adapter
  safe-https-client.ts        pinned-address HTTPS, redirects, timeout, and decompression
  feed-parser.ts              DTD-free namespace-aware RSS/Atom parser
  collect-source.ts           single-collection HTML/Feed orchestration
  create-collector.ts         production dependency composition without scheduling
apps/worker/src/collection/tests/
  dns-resolver.test.ts
  safe-https-client.test.ts
  feed-parser.test.ts
  collect-source.test.ts

docs/architecture/phase-2-source-collection.md
docs/tasks/phase-2-source-collection-workbook.md
```

The existing `apps/worker/src/index.ts` remains the lifecycle entry point and does not initiate collection. The existing browser-safe `@airdrop/database` root export remains free of collection credentials and mutation repositories.

---

### Task 1: Collection Contracts and Branded IDs

**Files:**

- Create: `packages/contracts/src/collection/source-collection.ts`
- Create: `packages/contracts/src/collection/source-collection.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/domain/src/ids.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/tests/project.test.ts`

**Interfaces:**

- Produces: `collectSourceJobSchema`, a strict version-1 `collect.source` job with `{ projectId, sourceId }`.
- Produces: `collectionOutcomeSchema`, `collectionContentKindSchema`, `collectSourceResultSchema`.
- Produces: branded `SourceId`, `CollectionAttemptId`, `RawItemId`, and `DiscoveredItemId` parsers.
- Consumes: the existing `createJobEnvelopeSchema()` and UUID/timestamp conventions.

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  collectSourceJobSchema,
  collectSourceResultSchema,
  collectionOutcomeSchema,
} from '../index.js';

const baseJob = {
  jobId: '10000000-0000-4000-8000-000000000001',
  type: 'collect.source',
  version: 1,
  idempotencyKey: 'collect:project:source:v1',
  correlationId: '10000000-0000-4000-8000-000000000002',
  occurredAt: '2026-08-12T00:00:00.000Z',
  payload: {
    projectId: '10000000-0000-4000-8000-000000000003',
    sourceId: '10000000-0000-4000-8000-000000000004',
  },
};

describe('collect source contracts', () => {
  it('accepts only the strict version-one collect.source payload', () => {
    expect(collectSourceJobSchema.parse(baseJob)).toEqual(baseJob);
    expect(
      collectSourceJobSchema.safeParse({
        ...baseJob,
        payload: { ...baseJob.payload, url: 'https://attacker.test' },
      }).success,
    ).toBe(false);
    expect(collectSourceJobSchema.safeParse({ ...baseJob, version: 2 }).success).toBe(false);
  });

  it.each([
    'stored_new_content',
    'not_modified',
    'unchanged_content',
    'discovered_only',
    'body_fetch_budget_exhausted',
    'rejected_url',
    'rejected_dns_target',
    'redirect_rejected',
    'unsupported_content_type',
    'invalid_text_encoding',
    'response_too_large',
    'timeout',
    'http_error',
    'invalid_feed',
    'persistence_failed',
  ])('accepts stable outcome %s', (outcome) => {
    expect(collectionOutcomeSchema.parse(outcome)).toBe(outcome);
  });

  it('rejects raw content and unknown keys from a result', () => {
    const result = {
      attemptId: '10000000-0000-4000-8000-000000000005',
      projectId: baseJob.payload.projectId,
      sourceId: baseJob.payload.sourceId,
      outcome: 'stored_new_content',
      rawItemId: '10000000-0000-4000-8000-000000000006',
      discoveredCount: 0,
      bodyFetchCount: 0,
    };
    expect(collectSourceResultSchema.parse(result)).toEqual(result);
    expect(collectSourceResultSchema.safeParse({ ...result, rawText: '<html />' }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run the contract test and observe RED**

Run:

```bash
pnpm --filter @airdrop/contracts test -- src/collection/source-collection.test.ts
```

Expected: FAIL because the collection schemas are not exported.

- [ ] **Step 3: Implement strict schemas and types**

Use these exact public shapes:

```ts
export const collectionOutcomeSchema = z.enum([
  'stored_new_content',
  'not_modified',
  'unchanged_content',
  'discovered_only',
  'body_fetch_budget_exhausted',
  'rejected_url',
  'rejected_dns_target',
  'redirect_rejected',
  'unsupported_content_type',
  'invalid_text_encoding',
  'response_too_large',
  'timeout',
  'http_error',
  'invalid_feed',
  'persistence_failed',
]);

export const collectionContentKindSchema = z.enum([
  'official_html',
  'rss_feed',
  'atom_feed',
  'feed_article_html',
]);

export const collectSourcePayloadSchema = z
  .object({
    projectId: z.string().uuid(),
    sourceId: z.string().uuid(),
  })
  .strict();

export const collectSourceJobSchema = createJobEnvelopeSchema(
  'collect.source',
  collectSourcePayloadSchema,
);

export const collectSourceResultSchema = z
  .object({
    attemptId: z.string().uuid(),
    projectId: z.string().uuid(),
    sourceId: z.string().uuid(),
    outcome: collectionOutcomeSchema,
    rawItemId: z.string().uuid().nullable(),
    discoveredCount: z.number().int().min(0).max(100),
    bodyFetchCount: z.number().int().min(0).max(20),
  })
  .strict();
```

Add the four branded ID parsers using the existing UUID parser pattern. Export schemas, inferred types, and parsers only from the designated package roots.

- [ ] **Step 4: Run contract and domain tests GREEN**

```bash
pnpm --filter @airdrop/contracts test
pnpm --filter @airdrop/contracts typecheck
pnpm --filter @airdrop/domain test
pnpm --filter @airdrop/domain typecheck
```

Expected: all commands exit `0`.

- [ ] **Step 5: Verify and commit**

```bash
pnpm verify
git add packages/contracts packages/domain
git commit -m "feat(contracts): add source collection contracts"
```

---

### Task 2: Pure Network and SSRF Policy

**Files:**

- Create: `packages/domain/src/collection/network-policy.ts`
- Create: `packages/domain/src/collection/network-policy.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `validateConfiguredCollectionUrl(input): ValidatedCollectionUrl`.
- Produces: `validateRedirectUrl(input): ValidatedCollectionUrl`.
- Produces: `isWithinAuthorityDomains(hostname, domains): boolean`.
- Produces: `validateResolvedAddresses(records): readonly ValidatedAddress[]`.
- Produces constants `MAX_REDIRECTS = 3`, `CONNECT_TIMEOUT_MS = 5_000`, `TOTAL_TIMEOUT_MS = 20_000`, `MAX_DECOMPRESSED_BYTES = 2_097_152`.
- Adds `ipaddr.js@2.4.0`; rationale is recorded in the Phase 2 architecture document in Task 7 because security-correct IPv4/IPv6 CIDR and mapped-address parsing is not provided by Node's validation-only `net.isIP()` primitive.

- [ ] **Step 1: Add exhaustive failing policy tests**

Tests must name and cover:

```ts
it.each([
  'http://official.example/feed',
  'https://user:pass@official.example/feed',
  'https://official.example:443/feed',
  'https://127.0.0.1/feed',
  'https://[::1]/feed',
  'https://0177.0.0.1/feed',
  'https://OFFICIAL.example/feed',
])('rejects unsafe collection URL %s', (url) => {
  expect(() =>
    validateConfiguredCollectionUrl({
      candidateUrl: url,
      configuredUrl: url,
      authorityDomains: ['official.example'],
    }),
  ).toThrow(CollectionNetworkPolicyError);
});

it('requires the initial request to equal the configured URL exactly', () => {
  expect(() =>
    validateConfiguredCollectionUrl({
      candidateUrl: 'https://official.example/other',
      configuredUrl: 'https://official.example/feed',
      authorityDomains: ['official.example'],
    }),
  ).toThrowErrorMatchingObject({ code: 'rejected_url' });
});

it.each([
  '127.0.0.1',
  '10.0.0.1',
  '100.64.0.1',
  '169.254.1.1',
  '192.0.2.1',
  '224.0.0.1',
  '0.0.0.0',
  '::1',
  'fc00::1',
  'fe80::1',
  '2001:db8::1',
  '::ffff:127.0.0.1',
  'ff02::1',
  '::',
])('rejects non-global resolved address %s', (address) => {
  expect(() =>
    validateResolvedAddresses([{ address, family: address.includes(':') ? 6 : 4 }]),
  ).toThrowErrorMatchingObject({ code: 'rejected_dns_target' });
});

it('rejects the complete DNS answer when any returned address is unsafe', () => {
  expect(() =>
    validateResolvedAddresses([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]),
  ).toThrowErrorMatchingObject({ code: 'rejected_dns_target' });
});
```

Also cover valid public IPv4 and IPv6, empty DNS answers, hostname/subdomain label boundaries, redirect hop 4, same-domain redirects, verified sibling-domain redirects, attacker suffixes such as `official.example.attacker.test`, rejection of raw Unicode hostnames, and acceptance of an exact canonical `xn--` hostname only when that same ASCII hostname is in the authority set.

- [ ] **Step 2: Observe RED before installing or implementing**

```bash
pnpm --filter @airdrop/domain test -- src/collection/network-policy.test.ts
```

Expected: FAIL because the policy module is absent.

- [ ] **Step 3: Add the single justified IP dependency**

```bash
pnpm --filter @airdrop/domain add ipaddr.js@2.4.0
```

Do not add a general HTTP, proxy, browser, or URL library.

- [ ] **Step 4: Implement the minimum pure policy**

Use these public types:

```ts
export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface ValidatedCollectionUrl {
  readonly url: URL;
  readonly hostname: string;
}

export class CollectionNetworkPolicyError extends Error {
  constructor(
    readonly code: 'rejected_url' | 'rejected_dns_target' | 'redirect_rejected',
    message: string,
  ) {
    super(message);
  }
}
```

Parse the raw authority before constructing `URL` so explicit `:443` cannot disappear during WHATWG normalization. Reject all IP-literal forms before hostname comparison. Convert IPv4-mapped IPv6 through `ipaddr.js` and allow only addresses classified as public unicast after explicit exclusions. The redirect validator accepts `{ candidateUrl, authorityDomains, hop }` and never mutates the allowed domain set.

- [ ] **Step 5: Run network policy GREEN and dependency checks**

```bash
pnpm --filter @airdrop/domain test -- src/collection/network-policy.test.ts
pnpm --filter @airdrop/domain lint
pnpm --filter @airdrop/domain typecheck
pnpm install --frozen-lockfile
```

- [ ] **Step 6: Verify and commit**

```bash
pnpm verify
git add packages/domain pnpm-lock.yaml
git commit -m "feat(domain): enforce collection network policy"
```

---

### Task 3: Pure Content, Identity, and Budget Policy

**Files:**

- Create: `packages/domain/src/collection/content-policy.ts`
- Create: `packages/domain/src/collection/content-policy.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Produces: `parseCollectionMediaType(header): CollectionMediaType`.
- Produces: `decodeUtf8(bytes): string` using fatal decoding.
- Produces: `decideContentStorage(input): 'stored_new_content' | 'unchanged_content'`.
- Produces: `createStableFeedEntryKey(input): string | null`.
- Produces: `selectFeedEntries(entries)` and `selectArticleFetches(entries)` with limits 100 and 20.
- Consumes: authority-domain matching from Task 2.

- [ ] **Step 1: Write failing content-policy tests**

```ts
it.each([
  ['text/html; charset=utf-8', 'html'],
  ['application/rss+xml', 'xml'],
  ['application/atom+xml; charset=UTF-8', 'xml'],
  ['application/xml', 'xml'],
  ['text/xml', 'xml'],
])('accepts %s as %s', (header, expected) => {
  expect(parseCollectionMediaType(header).family).toBe(expected);
});

it.each(['application/json', 'text/plain', 'image/svg+xml', '', null])(
  'rejects unsupported content type %s',
  (header) =>
    expect(() => parseCollectionMediaType(header)).toThrowErrorMatchingObject({
      code: 'unsupported_content_type',
    }),
);

it('rejects malformed UTF-8 rather than replacing bytes', () => {
  expect(() => decodeUtf8(Uint8Array.from([0xc3, 0x28]))).toThrowErrorMatchingObject({
    code: 'invalid_text_encoding',
  });
});

it('prefers trimmed GUID or Atom ID and otherwise uses normalized URL', () => {
  expect(createStableFeedEntryKey({ id: ' urn:item:1 ', url: 'https://official.example/a' })).toBe(
    'id:urn:item:1',
  );
  expect(createStableFeedEntryKey({ id: null, url: 'https://official.example/a' })).toBe(
    'url:https://official.example/a',
  );
  expect(createStableFeedEntryKey({ id: null, url: null })).toBeNull();
});

it('limits deterministic document-order discovery to 100 and body fetches to 20', () => {
  const entries = Array.from({ length: 125 }, (_, index) => ({ index, eligible: true }));
  expect(selectFeedEntries(entries)).toHaveLength(100);
  expect(selectArticleFetches(selectFeedEntries(entries))).toHaveLength(20);
});
```

Cover weak/quoted ETags as opaque bounded strings, Last-Modified bounds, SHA-256 equality, external-domain disposition, stable URL fragments, empty identifiers, 2 MiB exact boundary, and 2 MiB plus one byte.

- [ ] **Step 2: Observe RED**

```bash
pnpm --filter @airdrop/domain test -- src/collection/content-policy.test.ts
```

- [ ] **Step 3: Implement the pure policy**

Use `new TextDecoder('utf-8', { fatal: true })`. Media type parsing lowercases only the media type token and ignores syntactically valid parameters. Stable IDs are trimmed and bounded to 2,048 characters. URLs are normalized with WHATWG `URL` only after Task 2 accepts them. Budget helpers preserve input order and return new readonly arrays.

Use these error codes only:

```ts
type ContentPolicyErrorCode =
  'unsupported_content_type' | 'invalid_text_encoding' | 'response_too_large';
```

- [ ] **Step 4: Run content and all domain tests GREEN**

```bash
pnpm --filter @airdrop/domain test -- src/collection/content-policy.test.ts
pnpm --filter @airdrop/domain test
pnpm --filter @airdrop/domain lint
pnpm --filter @airdrop/domain typecheck
```

- [ ] **Step 5: Verify and commit**

```bash
pnpm verify
git add packages/domain
git commit -m "feat(domain): add collection content policy"
```

---

### Task 4: Append-Only Collection Schema and RLS

**Files:**

- Create: `supabase/migrations/20260812000800_source_collection.sql`
- Create: `supabase/tests/008_source_collection.test.sql`
- Modify: `supabase/tests/006_read_models.test.sql`
- Modify: `packages/database/src/generated/database.types.ts`

**Interfaces:**

- Produces tables `collection_attempts`, `raw_items`, `discovered_items`.
- Produces effective role `collection_worker` with no login, no inheritance, and no RLS bypass.
- Produces security-definer read function `load_source_collection_context(uuid, uuid)` callable only by `collection_worker`.
- Produces exact constraints used by the repository: command idempotency, endpoint/hash idempotency, discovery versioning, and append-only enforcement.

- [ ] **Step 1: Write pgTAP RED for exact schema and authority**

Start `008_source_collection.test.sql` with a fixed plan and test all catalog metadata. The RED assertions must include:

```sql
select has_table('public', 'collection_attempts');
select has_table('public', 'raw_items');
select has_table('public', 'discovered_items');

select ok(
  exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'collection_worker'
      and not rolcanlogin
      and not rolinherit
      and not rolbypassrls
      and not rolsuper
  ),
  'collection_worker is a non-login least-privilege effective role'
);

select ok(
  not has_table_privilege('anon', 'public.raw_items', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.raw_items', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.raw_items', 'SELECT,INSERT,UPDATE,DELETE'),
  'browser and generic service identities have no raw item access'
);

select throws_ok(
  $$ update public.raw_items set raw_text = 'changed' where id = '80000000-0000-4000-8000-000000000001' $$,
  '55000',
  'collection_history_append_only'
);
```

Also assert exact column types/defaults/nullability, all foreign-key mappings, indexes, unique constraints, RLS and `relforcerowsecurity`, function owner/search path/EXECUTE ACL, bounded metadata columns, no arbitrary headers/body column on attempts, and exact new policy names in the global policy matrix test.

- [ ] **Step 2: Run database RED before creating the migration**

```bash
pnpm test:db
```

Expected: FAIL only on missing Phase 2 schema/policies/functions. If the local container runtime is unavailable, run the exact command on the approved remote Supabase test host and record the command, migration hash, and complete failing assertion list in the task report.

- [ ] **Step 3: Implement the forward migration**

Create enums:

```sql
create type public.collection_outcome as enum (
  'stored_new_content', 'not_modified', 'unchanged_content', 'discovered_only',
  'body_fetch_budget_exhausted', 'rejected_url', 'rejected_dns_target',
  'redirect_rejected', 'unsupported_content_type', 'invalid_text_encoding',
  'response_too_large', 'timeout', 'http_error', 'invalid_feed', 'persistence_failed'
);

create type public.collection_content_kind as enum (
  'official_html', 'rss_feed', 'atom_feed', 'feed_article_html'
);

create type public.discovery_disposition as enum (
  'eligible', 'discovered_only', 'body_fetch_budget_exhausted',
  'fetched', 'fetch_failed'
);
```

Create tables with these mandatory columns:

```text
collection_attempts
  id uuid PK
  project_id uuid NOT NULL -> projects ON DELETE RESTRICT
  source_id uuid NOT NULL -> sources ON DELETE RESTRICT
  parent_discovered_item_id uuid NULL
  idempotency_key text UNIQUE NOT NULL, trimmed length 1..255
  requested_url text NOT NULL, length <= 4096
  final_url text NULL, length <= 4096
  redirect_chain jsonb NOT NULL DEFAULT '[]', array of strict {hop,status,url}
  started_at timestamptz NOT NULL
  completed_at timestamptz NOT NULL, >= started_at
  collected_at timestamptz NOT NULL
  http_status integer NULL, 100..599
  media_type text NULL, length <= 255
  etag text NULL, length <= 1024
  last_modified text NULL, length <= 128
  decompressed_bytes integer NULL, 0..2097152
  outcome collection_outcome NOT NULL
  error_code text NULL, length <= 100
  error_detail text NULL, length <= 500
  raw_item_id uuid NULL
  discovered_count integer NOT NULL DEFAULT 0, 0..100
  body_fetch_count integer NOT NULL DEFAULT 0, 0..20
  created_at timestamptz NOT NULL DEFAULT now()

raw_items
  id uuid PK
  project_id uuid NOT NULL -> projects ON DELETE RESTRICT
  source_id uuid NOT NULL -> sources ON DELETE RESTRICT
  parent_discovered_item_id uuid NULL
  logical_url text NOT NULL, length <= 4096
  final_url text NOT NULL, length <= 4096
  content_kind collection_content_kind NOT NULL
  media_type text NOT NULL, length <= 255
  raw_text text NOT NULL, octet_length <= 2097152
  sha256 text NOT NULL, lowercase 64-hex
  published_at timestamptz NULL
  collected_at timestamptz NOT NULL
  created_at timestamptz NOT NULL DEFAULT now()
  UNIQUE (project_id, source_id, logical_url, sha256)

discovered_items
  id uuid PK
  project_id uuid NOT NULL -> projects ON DELETE RESTRICT
  source_id uuid NOT NULL -> sources ON DELETE RESTRICT
  feed_raw_item_id uuid NOT NULL -> raw_items ON DELETE RESTRICT
  stable_entry_key text NOT NULL, length <= 4096
  version integer NOT NULL, > 0
  supersedes_discovered_item_id uuid NULL -> discovered_items ON DELETE RESTRICT
  entry_url text NULL, length <= 4096
  title text NULL, length <= 500
  summary text NULL, length <= 10000
  author text NULL, length <= 500
  external_entry_id text NULL, length <= 2048
  published_at timestamptz NULL
  updated_at timestamptz NULL
  is_authority_domain boolean NOT NULL
  disposition discovery_disposition NOT NULL
  article_collection_attempt_id uuid NULL -> collection_attempts ON DELETE RESTRICT
  article_raw_item_id uuid NULL -> raw_items ON DELETE RESTRICT
  created_at timestamptz NOT NULL DEFAULT now()
  UNIQUE (feed_raw_item_id, stable_entry_key, version)
```

Add deferred circular foreign keys only after all three tables exist. Add one trigger function `reject_collection_history_mutation()` that raises SQLSTATE `55000` for UPDATE or DELETE on all three tables. Enable and force RLS.

Create `collection_worker` in an idempotent DO block without a password. Grant only schema usage, exact table SELECT/INSERT, sequence usage if needed, and EXECUTE on `load_source_collection_context`. Add exactly one SELECT and one INSERT policy per collection table, each targeting only `collection_worker`; INSERT policies must check the row's project/source relationship through the verified context function. Do not create UPDATE or DELETE policies or grants. Add composite keys and deferred foreign keys so attempts, Raw Items, discovery parents, article results, and discovery successors must share the same project/source identity; a successor must also share the stable entry key.

The security-definer context function returns only active source configuration joined to an official verified project-source row, including canonical URL and authority domains. Fix `search_path = pg_catalog, public`, validate both IDs, revoke PUBLIC/anon/authenticated/service_role execution, and make its owner `postgres`. Update the exact policy catalog in `006_read_models.test.sql` with these six `collection_worker` policies and no browser policies.

- [ ] **Step 4: Run database GREEN and regenerate types**

```bash
pnpm test:db
pnpm db:types
git diff -- packages/database/src/generated/database.types.ts
```

Expected: all pgTAP files pass; generated types contain the new enums/tables/function and no unrelated drift.

- [ ] **Step 5: Run full verification and commit**

```bash
pnpm verify
git add supabase/migrations/20260812000800_source_collection.sql \
  supabase/tests/008_source_collection.test.sql \
  supabase/tests/006_read_models.test.sql \
  packages/database/src/generated/database.types.ts
git commit -m "feat(db): add append-only source collection history"
```

---

### Task 5: Typed Source Collection Repository

**Files:**

- Create: `packages/database/src/collection/types.ts`
- Create: `packages/database/src/collection/source-collection-repository.ts`
- Create: `packages/database/src/collection/worker-entry.ts`
- Create: `packages/database/src/tests/source-collection-repository.test.ts`
- Create: `packages/database/src/tests/source-collection-repository.integration.test.ts`
- Modify: `packages/database/package.json`
- Modify: `packages/database/src/tests/entrypoints.test.ts`
- Modify: `packages/database/scripts/require-integration-env.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces `SourceCollectionRepository` with configuration, idempotency lookup, endpoint commit, feed commit, and article outcome commit methods.
- Produces worker-only package export `@airdrop/database/collection-worker` with a browser-condition denial module.
- Consumes generated database enums/types and a postgres.js `Sql` connection.
- Promotes existing `postgres@3.4.9` from development-only to production dependency because collection transactions are owned by `packages/database` and cannot be expressed as safe multi-step browser/PostgREST mutations.
- Adds `@airdrop/contracts: workspace:*` to `packages/database` because repository result DTOs must be parsed by the canonical shared contract.

Use this exact repository interface:

```ts
export interface SourceCollectionRepository {
  loadContext(projectId: string, sourceId: string): Promise<SourceCollectionContext | null>;
  findCommitted(idempotencyKey: string): Promise<CollectSourceResult | null>;
  loadLatest(
    logicalUrl: string,
    projectId: string,
    sourceId: string,
  ): Promise<LatestRawItem | null>;
  commitEndpoint(input: CommitEndpointInput): Promise<CollectSourceResult>;
  commitFeed(input: CommitFeedInput): Promise<CommitFeedResult>;
  commitArticleOutcome(input: CommitArticleOutcomeInput): Promise<void>;
}
```

- [ ] **Step 1: Write repository unit RED with an injected transaction port**

Tests must prove:

- Every operation executes `set local role collection_worker` inside a transaction.
- Network callbacks are not accepted by repository APIs.
- `commitEndpoint` atomically inserts attempt plus optional Raw Item.
- A unique idempotency conflict returns the prior committed result without adding another attempt.
- A content-hash conflict reuses the prior Raw Item.
- `commitFeed` inserts feed attempt, feed Raw Item, and initial discovery versions atomically.
- `commitArticleOutcome` inserts an article attempt, optional Raw Item, and a superseding discovery version atomically.
- Database error messages are mapped to `SourceCollectionPersistenceError('persistence_failed')` without leaking SQL or connection details.

Use a small internal `CollectionTransaction` port in unit tests rather than mocking Supabase query chains.

- [ ] **Step 2: Observe repository RED**

```bash
pnpm --filter @airdrop/database test -- src/tests/source-collection-repository.test.ts
```

- [ ] **Step 3: Implement repository and worker-only export**

Update the manifest before implementing:

```json
{
  "dependencies": {
    "@airdrop/contracts": "workspace:*",
    "@supabase/supabase-js": "^2.112.2",
    "postgres": "^3.4.9",
    "server-only": "^0.0.1"
  }
}
```

Remove `postgres` from `devDependencies` after promoting it; do not install a second PostgreSQL client.

Add package exports:

```json
{
  "./collection-worker": {
    "browser": "./src/collection/browser-denied.ts",
    "default": "./src/collection/worker-entry.ts"
  }
}
```

The browser-denied module throws a stable error without importing postgres.js. Keep the browser-safe root `src/index.ts` unchanged except for tests that assert it has no collection repository export.

The postgres implementation begins a transaction, executes the fixed literal `set local role collection_worker`, performs parameterized statements, and commits. It never accepts SQL fragments, role names, table names, or column names from callers.

- [ ] **Step 4: Write and run real database integration tests**

The integration suite connects with `AIRDROP_DATABASE_TEST_URL`, provisions fixed fictional project/source fixtures as owner, and calls the repository through a login role that has membership in `collection_worker`. It verifies real RLS, transaction rollback, idempotency replay, hash reuse, discovery successors, and append-only rejection. The suite cleans only its fixed UUID fixtures.

```bash
pnpm --filter @airdrop/database test:integration
```

Extend the preflight script and CI database job so this suite is mandatory whenever database integration runs. Do not print credential values.

- [ ] **Step 5: Run package and database gates**

```bash
pnpm --filter @airdrop/database lint
pnpm --filter @airdrop/database typecheck
pnpm --filter @airdrop/database test
pnpm test:db
pnpm verify
```

- [ ] **Step 6: Commit**

```bash
git add packages/database .github/workflows/ci.yml pnpm-lock.yaml
git commit -m "feat(database): add source collection repository"
```

---

### Task 6: Pinned-Address DNS and HTTPS Adapter

**Files:**

- Create: `apps/worker/src/collection/ports.ts`
- Create: `apps/worker/src/collection/dns-resolver.ts`
- Create: `apps/worker/src/collection/safe-https-client.ts`
- Create: `apps/worker/src/collection/tests/dns-resolver.test.ts`
- Create: `apps/worker/src/collection/tests/safe-https-client.test.ts`
- Modify: `apps/worker/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
export interface SafeDnsResolver {
  resolve(hostname: string): Promise<readonly ResolvedAddress[]>;
}

export interface SafeHttpRequest {
  readonly url: string;
  readonly authorityDomains: readonly string[];
  readonly ifNoneMatch: string | null;
  readonly ifModifiedSince: string | null;
}

export interface SafeHttpResponse {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly redirects: readonly { hop: number; status: number; url: string }[];
  readonly status: number;
  readonly mediaTypeHeader: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly body: Uint8Array | null;
  readonly decompressedBytes: number;
}

export interface SafeHttpClient {
  get(input: SafeHttpRequest): Promise<SafeHttpResponse>;
}
```

- [ ] **Step 1: Write DNS adapter RED**

Inject a Node lookup function into `createSafeDnsResolver`. Assert it calls lookup with `{ all: true, order: 'verbatim' }`, returns all address/family pairs, rejects an empty result, and passes the entire answer through Task 2 validation.

```bash
pnpm --filter @airdrop/worker test -- src/collection/tests/dns-resolver.test.ts
```

Expected: FAIL because the adapter is absent.

- [ ] **Step 2: Implement DNS adapter and observe GREEN**

Use `node:dns` `lookup()` and do not use `dns.resolve*()` or a second lookup in the connection path. Run the targeted test until GREEN.

- [ ] **Step 3: Write HTTPS contract RED using a local TLS server**

Inject a narrow `HttpsRequestFactory` matching the `https.request()` call shape. Its test implementation captures request/TLS options, invokes the supplied pinned lookup callback, and returns controlled `Readable` response streams. This verifies production request construction and streaming without storing any private key or weakening production TLS. Assert:

- TLS SNI and certificate verification use `test.example` while the socket target uses the selected validated address.
- Only `Accept`, `Accept-Encoding`, `User-Agent`, `If-None-Match`, and `If-Modified-Since` may be emitted.
- Redirects are manual; each hop invokes resolver and policy again; hop 4 fails.
- Cross-authority redirects fail before a connection.
- Gzip, deflate, and Brotli are decoded before byte counting.
- 2 MiB succeeds and 2 MiB plus one byte aborts with `response_too_large`.
- Connection timeout maps to `timeout` after 5 seconds using a fake clock/timer port.
- One 20-second deadline covers all redirects and body reads.
- `304` has a null body; non-2xx status maps to `http_error`; response bodies from errors are discarded.
- Proxy environment variables are ignored because the adapter uses `node:https` directly with `agent: false`.

- [ ] **Step 4: Observe HTTPS RED**

```bash
pnpm --filter @airdrop/worker test -- src/collection/tests/safe-https-client.test.ts
```

- [ ] **Step 5: Implement pinned-address HTTPS**

For each hop:

1. Validate URL and redirect authority with Task 2.
2. Resolve and reject the complete answer if any address is unsafe.
3. Select the first validated address in resolver order.
4. Call `https.request()` with original `hostname`/`servername`, `rejectUnauthorized: true`, `agent: false`, and a custom `lookup` callback that returns only the selected address/family.
5. Stream through the matching `node:zlib` decoder and abort immediately after byte 2,097,152.
6. Parse only bounded ETag, Last-Modified, Location, Content-Type, and Content-Encoding headers.

Never set `rejectUnauthorized: false`, inject a private key, or persist certificate material. The production factory is a direct wrapper around `node:https.request`; tests inject only the factory port.

- [ ] **Step 6: Run worker adapter gates**

```bash
pnpm --filter @airdrop/worker test -- src/collection/tests/dns-resolver.test.ts
pnpm --filter @airdrop/worker test -- src/collection/tests/safe-https-client.test.ts
pnpm --filter @airdrop/worker lint
pnpm --filter @airdrop/worker typecheck
pnpm --filter @airdrop/worker build
pnpm verify
```

- [ ] **Step 7: Commit**

```bash
git add apps/worker pnpm-lock.yaml
git commit -m "feat(worker): add safe pinned-address HTTP collection"
```

---

### Task 7: Strict RSS and Atom Parser

**Files:**

- Create: `apps/worker/src/collection/feed-parser.ts`
- Create: `apps/worker/src/collection/tests/feed-parser.test.ts`
- Modify: `apps/worker/src/collection/ports.ts`
- Modify: `apps/worker/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `docs/architecture/phase-2-source-collection.md`

**Interfaces:**

```ts
export interface FeedEntryCandidate {
  readonly externalId: string | null;
  readonly url: string | null;
  readonly title: string | null;
  readonly summary: string | null;
  readonly author: string | null;
  readonly publishedAt: string | null;
  readonly updatedAt: string | null;
}

export interface ParsedFeed {
  readonly kind: 'rss_feed' | 'atom_feed';
  readonly entries: readonly FeedEntryCandidate[];
  readonly invalidEntryCount: number;
}

export interface FeedParser {
  parse(xml: string): ParsedFeed;
}
```

- [ ] **Step 1: Write parser RED with hostile fixtures**

Cover valid RSS 2.0, namespaced Atom, relative Atom links resolved against `xml:base` only when the resulting URL passes later network validation, escaped text, deterministic document order, more than 100 entries, malformed XML, unsupported root, nested extension fields, DTD declaration, internal entity declaration, external entity reference, XInclude element, and excessive nesting.

```ts
it.each([
  '<!DOCTYPE rss SYSTEM "https://attacker.test/feed.dtd"><rss version="2.0" />',
  '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss>&xxe;</rss>',
  '<rss xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file:///etc/passwd" /></rss>',
])('rejects external-resource XML syntax without resolving it', (xml) => {
  expect(() => parser.parse(xml)).toThrowErrorMatchingObject({ code: 'invalid_feed' });
  expect(externalResolver).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Observe parser RED**

```bash
pnpm --filter @airdrop/worker test -- src/collection/tests/feed-parser.test.ts
```

- [ ] **Step 3: Add and document the XML dependency**

```bash
pnpm --filter @airdrop/worker add saxes@6.0.0
```

The architecture document must record:

- Node 22 has no built-in XML parser.
- `saxes` is a strict namespace-aware non-validating parser with no automatic external-resource fetch.
- The adapter rejects every `doctype` event, XInclude element, unresolved entity, parse error, and nesting depth above 64.
- Feed input is already limited to 2 MiB, and field lengths are bounded before persistence.
- The package is intentionally isolated behind `FeedParser` so it can be replaced without changing use cases.

Also document the `ipaddr.js` rationale from Task 2 and Node HTTPS pinned-lookup design from Task 6.

- [ ] **Step 4: Implement the strict parser**

Use `new SaxesParser({ xmlns: true })`. Stop using parser events after the first error. Reject DTD and XInclude explicitly. Extract only the defined RSS/Atom fields, clamp field lengths to the database contracts, parse timestamps to canonical ISO strings only when valid, and increment `invalidEntryCount` when stable identity cannot later be formed. Do not interpret feed `content` as an article body.

- [ ] **Step 5: Run parser and full worker gates**

```bash
pnpm --filter @airdrop/worker test -- src/collection/tests/feed-parser.test.ts
pnpm --filter @airdrop/worker test
pnpm --filter @airdrop/worker lint
pnpm --filter @airdrop/worker typecheck
pnpm --filter @airdrop/worker build
pnpm install --frozen-lockfile
pnpm verify
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker docs/architecture/phase-2-source-collection.md pnpm-lock.yaml
git commit -m "feat(worker): parse bounded RSS and Atom feeds"
```

---

### Task 8: Single-Collection HTML Use Case

**Files:**

- Create: `apps/worker/src/collection/collect-source.ts`
- Create: `apps/worker/src/collection/tests/collect-source.test.ts`
- Modify: `apps/worker/src/collection/ports.ts`
- Modify: `apps/worker/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces `createCollectSource(dependencies)` returning `(job: CollectSourceJob) => Promise<CollectSourceResult>`.
- Consumes `SourceCollectionRepository`, `SafeHttpClient`, `FeedParser`, `ContentHasher`, `Clock`, and `IdGenerator` through injected ports.
- This task implements official HTML and shared endpoint outcome handling; Feed orchestration is completed in Task 9.
- Adds worker dependencies on `@airdrop/contracts`, `@airdrop/domain`, and the worker-only `@airdrop/database/collection-worker` entry; these are existing workspace packages rather than new external production dependencies.

- [ ] **Step 1: Write HTML use-case RED**

Use real domain decisions and small in-memory port fakes. Cover:

```ts
it('stores changed official HTML and returns only IDs', async () => {
  const result = await collect(validJob);
  expect(result).toEqual({
    attemptId,
    projectId,
    sourceId,
    outcome: 'stored_new_content',
    rawItemId,
    discoveredCount: 0,
    bodyFetchCount: 0,
  });
  expect(repository.commits[0]?.rawItem?.rawText).toBe('<html>official</html>');
  expect(result).not.toHaveProperty('rawText');
});

it('returns a prior committed result before DNS or HTTP on idempotent replay', async () => {
  repository.priorResult = priorResult;
  await expect(collect(validJob)).resolves.toEqual(priorResult);
  expect(http.requests).toEqual([]);
});

it.each([
  'rejected_url',
  'rejected_dns_target',
  'redirect_rejected',
  'unsupported_content_type',
  'invalid_text_encoding',
  'response_too_large',
  'timeout',
  'http_error',
])('persists a body-free attempt for %s', async (code) => {
  http.failure = code;
  await collect(validJob);
  expect(repository.commits[0]?.rawItem).toBeNull();
  expect(repository.commits[0]?.attempt.errorCode).toBe(code);
});
```

Also cover inactive/unverified configuration, exact configured URL, conditional headers, `304`, same hash, changed hash, hash over bytes before decoding, bounded safe error detail, clock/ID determinism, and repository persistence failure mapping.

- [ ] **Step 2: Observe HTML use-case RED**

```bash
pnpm --filter @airdrop/worker test -- src/collection/tests/collect-source.test.ts
```

- [ ] **Step 3: Implement the minimum HTML path**

Add exact workspace dependencies to `apps/worker/package.json`:

```json
{
  "dependencies": {
    "@airdrop/contracts": "workspace:*",
    "@airdrop/database": "workspace:*",
    "@airdrop/domain": "workspace:*"
  }
}
```

Execution order must be:

```text
parse strict job
-> find committed idempotency result
-> load verified active context
-> load latest validators/hash
-> validate exact configured URL
-> execute HTTP outside a transaction
-> classify HTML and decode UTF-8
-> SHA-256 exact decompressed bytes
-> build body-free failure or immutable Raw Item input
-> commit one short endpoint transaction
-> parse and return strict result
```

Use Node `createHash('sha256')` behind the `ContentHasher` port. Never include fetched text in logs, thrown errors, or returned results.

- [ ] **Step 4: Run HTML use-case and package gates**

```bash
pnpm --filter @airdrop/worker test -- src/collection/tests/collect-source.test.ts
pnpm --filter @airdrop/worker test
pnpm --filter @airdrop/worker lint
pnpm --filter @airdrop/worker typecheck
pnpm --filter @airdrop/worker build
pnpm verify
```

- [ ] **Step 5: Commit**

```bash
git add apps/worker pnpm-lock.yaml
git commit -m "feat(worker): collect official HTML once"
```

---

### Task 9: Feed Discovery, Article Isolation, Composition, and Exit Verification

**Files:**

- Modify: `apps/worker/src/collection/collect-source.ts`
- Modify: `apps/worker/src/collection/tests/collect-source.test.ts`
- Create: `apps/worker/src/collection/create-collector.ts`
- Create: `apps/worker/src/collection/index.ts`
- Modify: `apps/worker/package.json`
- Create: `docs/tasks/phase-2-source-collection-workbook.md`
- Modify: `docs/architecture/phase-2-source-collection.md`
- Modify: `docs/runbooks/local-development.md`
- Modify: `README.md`

**Interfaces:**

- Completes `collect.source` for RSS/Atom and eligible sequential article collection.
- Produces `createSourceCollector(options)` for later queue adapters; it does not start a timer or consume a queue.
- Documents only environment variable names, never values: `AIRDROP_COLLECTION_DATABASE_URL` and `AIRDROP_COLLECTION_USER_AGENT`.

- [ ] **Step 1: Extend use-case tests and observe Feed RED**

Add tests for:

- Valid RSS and Atom XML is stored as its own Raw Item.
- Invalid Feed XML produces `invalid_feed` and no Raw Item/discoveries.
- The first 100 entries are processed in document order.
- Stable key uses ID first, then URL; missing identity increments invalid count and creates no discovery row.
- Same-authority and verified-subdomain entries are eligible.
- External-domain and deceptive suffix entries are stored only as `discovered_only` and never requested.
- At most 20 eligible article bodies are fetched sequentially.
- Eligible entries after 20 receive `body_fetch_budget_exhausted` discovery disposition.
- An article redirect is revalidated against the same authority-domain set.
- Article HTML uses conditional validators, byte hash, UTF-8, and 2 MiB limits.
- One article failure appends a `fetch_failed` successor but does not roll back Feed or other article outcomes.
- Replaying the exact command idempotency key performs no HTTP and returns the prior result.
- Replaying new idempotency with unchanged Feed hash creates an attempt but no duplicate Raw Item or discoveries.
- Feed commit persistence failure prevents all article requests.
- Article persistence failure returns a bounded `persistence_failed` result for that article and continues sequentially; the top-level Feed result remains the committed Feed outcome with accurate counts.

```bash
pnpm --filter @airdrop/worker test -- src/collection/tests/collect-source.test.ts
```

Expected: new Feed assertions FAIL while existing HTML assertions remain GREEN.

- [ ] **Step 2: Implement Feed orchestration minimally**

Use this order:

```text
fetch and validate Feed response
-> fatal UTF-8 decode
-> strict Feed parse
-> SHA-256 and Feed persistence decision
-> derive at most 100 discovery candidates
-> atomically commit Feed attempt + optional Feed Raw Item + discovery v1 rows
-> for first 20 eligible entries, sequentially:
     fetch article outside transaction
     commit article attempt + optional article Raw Item + discovery successor
-> return strict aggregate result
```

When Feed content is `not_modified` or `unchanged_content`, do not reprocess discoveries or fetch articles. A changed Feed produces new discovery versions tied to the new Feed Raw Item. Article idempotency keys are deterministic SHA-256 values derived from the command key, Feed Raw Item ID, and stable entry key, bounded to 255 characters.

- [ ] **Step 3: Add composition without runtime activation**

`createSourceCollector` validates:

```ts
export interface SourceCollectorOptions {
  readonly databaseUrl: string;
  readonly userAgent: string;
}
```

It constructs postgres.js with a small pool, the repository, resolver, HTTPS adapter, Feed parser, hasher, clock, and ID generator, and returns `{ collect, close }`. It does not modify `apps/worker/src/index.ts`, schedule work, retry, or log content.

- [ ] **Step 4: Write operational and task documentation**

The workbook must list Tasks 1–9 with `READY/IN_PROGRESS/REVIEW/DONE` status, exact commit, RED evidence, GREEN evidence, review findings, and acceptance commands. Mark only actually completed cards `DONE`.

Update documentation with:

- Exact scope and exclusions.
- The two environment variable names and secret-handling rules.
- Dedicated `collection_worker` provisioning requirement without passwords.
- How to run targeted tests and `pnpm verify:full`.
- How to shut down the returned collector pool.
- Dependency rationale for postgres.js, `ipaddr.js`, and `saxes`.
- Confirmation that collection is not automatically scheduled.

- [ ] **Step 5: Run narrow and full acceptance**

```bash
pnpm --filter @airdrop/contracts test
pnpm --filter @airdrop/domain test
pnpm --filter @airdrop/database test
pnpm --filter @airdrop/worker test
pnpm test:db
pnpm verify
```

All commands must exit `0`. Then inspect:

```bash
git diff --check
rg -n "seed phrase|private key|mnemonic|serviceRoleKey|authorization|cookie" \
  apps/worker packages supabase docs README.md
git status --short
```

Review every match to confirm it is a prohibition, type name in pre-existing server code, or test asserting non-persistence; no real value may appear.

- [ ] **Step 6: Perform regression sensitivity checks**

Temporarily mutate one production condition at a time in the working tree and confirm the named test becomes RED, then restore it before continuing:

```text
allow 127.0.0.1               -> network-policy test fails
use a normal connection lookup -> pinned-address adapter test fails
raise body limit by one byte    -> decompressed-size test fails
accept a DOCTYPE                -> Feed parser security test fails
remove Raw Item mutation trigger -> pgTAP append-only test fails
fetch external Feed entry       -> collect-source isolation test fails
```

After restoring all mutations, rerun `pnpm test:db` and `pnpm verify`. Do not commit mutation artifacts.

- [ ] **Step 7: Commit the completed source collection slice**

```bash
git add apps/worker docs README.md
git commit -m "feat(worker): collect official feeds and articles"
```

---

## Final Review Checklist

- [ ] `collect.source` accepts only project/source object references and version 1.
- [ ] Browser-safe exports contain no collection repository, credential option, Raw Item body, or mutation path.
- [ ] All starting URLs are exact configured URLs.
- [ ] All initial and redirected requests validate every resolved address and connect with the validated address.
- [ ] TLS certificate verification and SNI use the original hostname.
- [ ] Response bytes are counted after decompression and before fatal UTF-8 decoding.
- [ ] DTD, entities, XInclude, malformed XML, unsupported roots, and excessive nesting fail closed.
- [ ] Every execution or attempted article fetch has a bounded attempt record unless persistence itself fails.
- [ ] Raw Items and discovery history are append-only and idempotent.
- [ ] Feed summaries remain Feed metadata and never become article bodies.
- [ ] External-domain Feed entries are never fetched.
- [ ] Feed and article budgets are deterministic and tested.
- [ ] Network work occurs outside database transactions.
- [ ] No collector/AI/browser path writes canonical intelligence.
- [ ] No queue, scheduler, retry loop, concurrent fetcher, or AI call was added.
- [ ] Database tests, generated types, repository integration, package gates, `pnpm test:db`, and `pnpm verify` are fresh and GREEN.
