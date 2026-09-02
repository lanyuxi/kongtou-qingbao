import { createTutorialReviewRepository } from '@airdrop/database/tutorial-review';
import { createAuthenticatedUserVerifier } from '../../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../../lib/env.js';
import { createTutorialCandidateDetailHandler } from '../../../../../../../lib/tutorial-review-handlers.js';

let handler: ReturnType<typeof createTutorialCandidateDetailHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createTutorialCandidateDetailHandler({
    auth: createAuthenticatedUserVerifier(environment),
    reviews: createTutorialReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ candidateId: string }> },
) {
  return getHandler()(request, context);
}
