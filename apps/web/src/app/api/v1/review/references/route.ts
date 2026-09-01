import { createReferencePublicRepository } from '@airdrop/database';
import { createReferenceReviewRepository } from '@airdrop/database/reference-review';
import { createAuthenticatedUserVerifier } from '../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../lib/env.js';
import {
  createReferenceListHandler,
  createReferenceRegisterHandler,
} from '../../../../../lib/reference-review-handlers.js';
import { createServerSupabaseClient } from '../../../../../lib/supabase-server.js';

let handlers: {
  get: ReturnType<typeof createReferenceListHandler>;
  post: ReturnType<typeof createReferenceRegisterHandler>;
} | undefined;

function getHandlers() {
  if (handlers !== undefined) return handlers;
  const environment = parsePublicEnvironment();
  const dependencies = {
    auth: createAuthenticatedUserVerifier(environment),
    reviews: createReferenceReviewRepository({
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    }),
    publicReferences: createReferencePublicRepository(createServerSupabaseClient()),
    ids: { generate: () => crypto.randomUUID() },
  };
  handlers = {
    get: createReferenceListHandler(dependencies),
    post: createReferenceRegisterHandler(dependencies),
  };
  return handlers;
}

export async function GET(request: Request) {
  return getHandlers().get(request);
}

export async function POST(request: Request) {
  return getHandlers().post(request);
}
