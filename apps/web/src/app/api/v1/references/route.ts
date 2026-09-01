import { createReferencePublicRepository } from '@airdrop/database';
import { createPublicReferencesHandler } from '../../../../lib/reference-review-handlers.js';
import { createServerSupabaseClient } from '../../../../lib/supabase-server.js';

let handler: ReturnType<typeof createPublicReferencesHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  handler = createPublicReferencesHandler({
    publicReferences: createReferencePublicRepository(createServerSupabaseClient()),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(request: Request) {
  return getHandler()(request);
}
