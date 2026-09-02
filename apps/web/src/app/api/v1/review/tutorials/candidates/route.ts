import { createTutorialReviewRepository } from '@airdrop/database/tutorial-review';
import { createAuthenticatedUserVerifier } from '../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../lib/env.js';
import { createTutorialCandidateListHandler } from '../../../../../../lib/tutorial-review-handlers.js';

let handler: ReturnType<typeof createTutorialCandidateListHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createTutorialCandidateListHandler({
    auth: createAuthenticatedUserVerifier(environment),
    reviews: createTutorialReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(request: Request) {
  return getHandler()(request);
}
