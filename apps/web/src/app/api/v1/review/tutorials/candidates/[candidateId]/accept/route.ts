import { createTutorialReviewRepository } from '@airdrop/database/tutorial-review';
import { createAuthenticatedUserVerifier } from '../../../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../../../lib/env.js';
import { createTutorialAcceptHandler } from '../../../../../../../../lib/tutorial-review-handlers.js';

let handler: ReturnType<typeof createTutorialAcceptHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createTutorialAcceptHandler({
    auth: createAuthenticatedUserVerifier(environment),
    reviews: createTutorialReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ candidateId: string }> },
) {
  return getHandler()(request, context);
}
