// Development fixture: ingest a real third-party (non-official) feed through
// the same persistence contract the collector uses, so the AI extraction stage
// can see real airdrop-related content. The automatic collector only accepts
// official verified sources by design; this script is a manual development
// seeding path and must never run in production.

import { createHash, randomUUID } from 'node:crypto';

import postgres from 'postgres';

import { createFeedParser } from '../collection/feed-parser.js';

const DATABASE_URL = 'AIRDROP_DEV_FIXTURE_DATABASE_URL';
const COLLECTION_USER_AGENT = 'AIRDROP_COLLECTION_USER_AGENT';

class SeedFeedConfigurationError extends Error {
  readonly code = 'invalid_seed_feed_configuration' as const;
}

export async function main(projectId: string, sourceId: string, feedUrl: string): Promise<void> {
  const databaseUrl = process.env[DATABASE_URL];
  const userAgent = process.env[COLLECTION_USER_AGENT];
  if (
    databaseUrl === undefined || databaseUrl.length === 0 ||
    userAgent === undefined || userAgent.length === 0
  ) {
    throw new SeedFeedConfigurationError();
  }

  const response = await fetch(feedUrl, {
    headers: { 'user-agent': userAgent, accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!response.ok) {
    throw new Error(`feed_fetch_failed_http_${response.status}`);
  }
  const xml = await response.text();
  const feed = createFeedParser().parse(xml);

  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5, connect_timeout: 10 });
  try {

    const feedRawItemId = randomUUID();
    const now = new Date().toISOString();
    const sha256 = createHash('sha256').update(xml, 'utf8').digest('hex');
    const insertedFeed = await sql<readonly { id: string }[]>`
      insert into public.raw_items (
        id, project_id, source_id, logical_url, final_url,
        content_kind, media_type, raw_text, sha256, collected_at
      ) values (
        ${feedRawItemId}::uuid, ${projectId}::uuid, ${sourceId}::uuid,
        ${feedUrl}, ${feedUrl},
        'rss_feed', 'application/rss+xml', ${xml},
        ${sha256}, ${now}::timestamptz
      )
      on conflict (project_id, source_id, logical_url, sha256) do nothing
      returning id
    `;
    const existingFeed =
      insertedFeed[0] === undefined
        ? await sql<readonly { id: string }[]>`
            select id from public.raw_items
            where project_id = ${projectId}::uuid
              and source_id = ${sourceId}::uuid
              and logical_url = ${feedUrl}
              and sha256 = ${sha256}
            limit 1
          `
        : insertedFeed;
    const resolvedFeedRawItemId = existingFeed[0]?.id ?? feedRawItemId;

    let inserted = 0;
    for (const entry of feed.entries) {
      const stableEntryKey =
        entry.externalId !== null && entry.externalId.length > 0
          ? `id:${entry.externalId}`
          : entry.url === null
            ? null
            : `url:${entry.url}`;
      if (stableEntryKey === null || entry.summary === null || entry.summary.length < 40) continue;

      const rows = await sql`
        insert into public.discovered_items (
          id, project_id, source_id, feed_raw_item_id, stable_entry_key, version,
          entry_url, title, summary, author, external_entry_id,
          published_at, is_authority_domain, disposition
        ) values (
          ${randomUUID()}::uuid, ${projectId}::uuid, ${sourceId}::uuid,
          ${resolvedFeedRawItemId}::uuid, ${stableEntryKey}, 1,
          ${entry.url}, ${entry.title?.slice(0, 500) ?? null}, ${entry.summary.slice(0, 10_000)},
          ${entry.author?.slice(0, 500) ?? null}, ${entry.externalId},
          ${entry.publishedAt === null ? null : new Date(entry.publishedAt).toISOString()}::timestamptz,
          false, 'discovered_only'
        )
        on conflict (feed_raw_item_id, stable_entry_key, version) do nothing
        returning id
      `;
      inserted += rows.length;
    }

    process.stdout.write(`${JSON.stringify({ entriesParsed: feed.entries.length, discoveredInserted: inserted })}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const argv = process.argv.slice(2);
if (argv.length === 3) {
  void main(argv[0]!, argv[1]!, argv[2]!).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
