import { createFailedAiRunReviewRepository } from '@airdrop/database/failed-ai-run-review';

import { createAuthenticatedUserVerifier } from '../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../lib/env.js';
import { createFailedAiRunListHandler } from '../../../../../lib/failed-ai-run-review-handlers.js';

let handler: ReturnType<typeof createFailedAiRunListHandler> | undefined;

function getHandler(): ReturnType<typeof createFailedAiRunListHandler> {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createFailedAiRunListHandler({
    auth: createAuthenticatedUserVerifier(environment),
    reviews: createFailedAiRunReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(request: Request): Promise<Response> {
  return getHandler()(request);
}
