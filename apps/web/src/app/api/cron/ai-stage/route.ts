import 'server-only';

import { runAiStageOnce } from '@airdrop/worker/ai-stage-once';

/**
 * Runs exactly one pass of the AI stage: extraction, scoring, tutorial
 * generation. Guarded by the same CRON_SECRET as the collection route.
 *
 * Extraction spends model tokens, so this is the more expensive of the two
 * endpoints — hence the shared secret rather than a public URL.
 */
export const dynamic = 'force-dynamic';

// Several model round-trips in one pass; the Hobby ceiling is 60s.
export const maxDuration = 60;

const DEFAULT_MODEL_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL_ID = 'deepseek-chat';

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

  try {
    const result = await runAiStageOnce({
      databaseUrl,
      modelApiKey,
      modelBaseUrl: process.env.AI_MODEL_BASE_URL ?? DEFAULT_MODEL_BASE_URL,
      modelId: process.env.AI_MODEL_ID ?? DEFAULT_MODEL_ID,
    });
    return Response.json({ ok: true, data: result });
  } catch (error) {
    // The repository wraps every driver failure in a generic persistence error
    // and keeps the real one in `cause`; surface it, or diagnosis stops at
    // "something failed".
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
    return Response.json(
      {
        ok: false,
        error: 'ai_stage_failed',
        message: error instanceof Error ? error.message : 'unknown error',
        cause,
      },
      { status: 500 },
    );
  }
}
