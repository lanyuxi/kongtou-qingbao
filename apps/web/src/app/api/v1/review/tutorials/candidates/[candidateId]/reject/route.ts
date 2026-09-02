import { createTutorialReviewRepository } from '@airdrop/database/tutorial-review';
import { createAuthenticatedUserVerifier } from '../../../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../../../lib/env.js';
import { createTutorialRejectHandler } from '../../../../../../../../lib/tutorial-review-handlers.js';

let handler: ReturnType<typeof createTutorialRejectHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createTutorialRejectHandler({
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
