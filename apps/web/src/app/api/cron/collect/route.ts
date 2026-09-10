import 'server-only';

import { runCollectionOnce } from '@airdrop/worker/collection-once';

/**
 * Runs exactly one pass of the collection pipeline. Vercel Cron calls this on a
 * schedule; nothing else may, because each pass claims and executes collection
 * jobs and therefore costs outbound requests and (later) model tokens.
 *
 * Guarded by CRON_SECRET: when the variable is set, Vercel sends it as a
 * bearer token on its scheduled invocations. Without the check this endpoint
 * would be an open "spend my resources" button for anyone who finds the URL.
 */
export const dynamic = 'force-dynamic';

// Collecting a feed and writing its items is not instant; the Hobby limit is
// 10s by default, so raise it while staying inside the plan's ceiling.
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret === undefined || secret === '') {
    return Response.json(
      { ok: false, error: 'cron_not_configured' },
      { status: 503 },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const queueDatabaseUrl = process.env.AIRDROP_QUEUE_DATABASE_URL;
  const collectionDatabaseUrl = process.env.AIRDROP_COLLECTION_DATABASE_URL;
  const collectionUserAgent = process.env.AIRDROP_COLLECTION_USER_AGENT;

  const missing: string[] = [];
  if (queueDatabaseUrl === undefined) missing.push('AIRDROP_QUEUE_DATABASE_URL');
  if (collectionDatabaseUrl === undefined) missing.push('AIRDROP_COLLECTION_DATABASE_URL');
  if (collectionUserAgent === undefined) missing.push('AIRDROP_COLLECTION_USER_AGENT');
  // Spelled out rather than inferred from `missing.length`, so the compiler
  // narrows the three values to string for the call below.
  if (
    queueDatabaseUrl === undefined ||
    collectionDatabaseUrl === undefined ||
    collectionUserAgent === undefined
  ) {
    return Response.json(
      { ok: false, error: 'missing_configuration', missing },
      { status: 503 },
    );
  }

  try {
    const result = await runCollectionOnce({
      queueDatabaseUrl,
      collectionDatabaseUrl,
      collectionUserAgent,
      workerId: process.env.AIRDROP_QUEUE_WORKER_ID ?? 'vercel-cron',
    });
    return Response.json({ ok: true, data: result });
  } catch (error) {
    // The message is surfaced deliberately: this endpoint is secret-guarded and
    // only ever called by the scheduler, so a diagnosable error is worth more
    // than a generic one.
    return Response.json(
      {
        ok: false,
        error: 'collection_failed',
        message: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500 },
    );
  }
}
