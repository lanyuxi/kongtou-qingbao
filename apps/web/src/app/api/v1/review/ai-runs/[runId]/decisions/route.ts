import { createFailedAiRunReviewRepository } from '@airdrop/database/failed-ai-run-review';

import { createAuthenticatedUserVerifier } from '../../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../../lib/env.js';
import { createFailedAiRunDecisionHandler } from '../../../../../../../lib/failed-ai-run-review-handlers.js';

let handler: ReturnType<typeof createFailedAiRunDecisionHandler> | undefined;

function getHandler(): ReturnType<typeof createFailedAiRunDecisionHandler> {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createFailedAiRunDecisionHandler({
    auth: createAuthenticatedUserVerifier(environment),
    reviews: createFailedAiRunReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  return getHandler()(request, context);
}
