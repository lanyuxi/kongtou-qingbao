import 'server-only';

import { runExtractionPassOnce } from '@airdrop/worker/extraction-pass-once';

/**
 * Extraction and publishing only — no scoring, no tutorial generation.
 *
 * Extraction is the throughput bottleneck: one model round-trip per item, so a
 * pass that also scores and generates tutorials can only clear a fraction of
 * the backlog. On its own it can spend the whole budget on extracting.
 *
 * The Vercel Hobby plan permits two cron jobs and both are taken (collection
 * and the full AI stage), so this endpoint has no schedule — it is triggered
 * by hand or by an external scheduler. Same secret as the others.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_MODEL_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL_ID = 'deepseek-chat';

// Larger than the full pass's default: with no scoring behind it, extraction
// can use most of the invocation.
const DEFAULT_MAX_INPUTS = 20;
const MAX_ALLOWED_INPUTS = 60;

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret === undefined || secret === '') {
    return Response.json({ ok: false, error: 'cron_not_configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const databaseUrl = process.env.AIRDROP_AI_STAGE_DATABASE_URL;
  const modelApiKey = process.env.AI_MODEL_API_KEY;
  if (databaseUrl === undefined || modelApiKey === undefined) {
    return Response.json(
      {
        ok: false,
        error: 'missing_configuration',
        missing: [
          ...(databaseUrl === undefined ? ['AIRDROP_AI_STAGE_DATABASE_URL'] : []),
          ...(modelApiKey === undefined ? ['AI_MODEL_API_KEY'] : []),
        ],
      },
      { status: 503 },
    );
  }

  // Optional override so a backlog can be worked off faster on demand, capped
  // so one call cannot run indefinitely.
  const requested = Number(new URL(request.url).searchParams.get('maxInputs'));
  const maxInputs =
    Number.isFinite(requested) && requested > 0
      ? Math.min(Math.trunc(requested), MAX_ALLOWED_INPUTS)
      : DEFAULT_MAX_INPUTS;

  try {
    const result = await runExtractionPassOnce({
      databaseUrl,
      modelApiKey,
      modelBaseUrl: process.env.AI_MODEL_BASE_URL ?? DEFAULT_MODEL_BASE_URL,
      modelId: process.env.AI_MODEL_ID ?? DEFAULT_MODEL_ID,
      maxInputs,
    });
    return Response.json({ ok: true, data: result });
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
    return Response.json(
      {
        ok: false,
        error: 'extraction_failed',
        message: error instanceof Error ? error.message : 'unknown error',
        cause,
      },
      { status: 500 },
    );
  }
}
