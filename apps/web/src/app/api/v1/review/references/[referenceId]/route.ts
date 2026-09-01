import { createReferencePublicRepository } from '@airdrop/database';
import { createReferenceReviewRepository } from '@airdrop/database/reference-review';
import { createAuthenticatedUserVerifier } from '../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../lib/env.js';
import { createReferenceDetailHandler } from '../../../../../../lib/reference-review-handlers.js';
import { createServerSupabaseClient } from '../../../../../../lib/supabase-server.js';

let handler: ReturnType<typeof createReferenceDetailHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createReferenceDetailHandler({
    auth: createAuthenticatedUserVerifier(environment),
    reviews: createReferenceReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    }),
    publicReferences: createReferencePublicRepository(createServerSupabaseClient()),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ referenceId: string }> },
) {
  return getHandler()(request, context);
}
