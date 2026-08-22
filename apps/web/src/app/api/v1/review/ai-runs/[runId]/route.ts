import { createFailedAiRunReviewRepository } from '@airdrop/database/failed-ai-run-review';

import { createAuthenticatedUserVerifier } from '../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../lib/env.js';
import { createFailedAiRunDetailHandler } from '../../../../../../lib/failed-ai-run-review-handlers.js';

let handler: ReturnType<typeof createFailedAiRunDetailHandler> | undefined;

function getHandler(): ReturnType<typeof createFailedAiRunDetailHandler> {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createFailedAiRunDetailHandler({
    auth: createAuthenticatedUserVerifier(environment),
    reviews: createFailedAiRunReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  return getHandler()(request, context);
}
