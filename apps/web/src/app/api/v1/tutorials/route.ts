import { createTutorialPublicRepository } from '@airdrop/database';
import { createPublicTutorialsHandler } from '../../../../lib/tutorial-public-handlers.js';
import { createServerSupabaseClient } from '../../../../lib/supabase-server.js';

let handler: ReturnType<typeof createPublicTutorialsHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  handler = createPublicTutorialsHandler({
    publicTutorials: createTutorialPublicRepository(createServerSupabaseClient()),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(request: Request) {
  return getHandler()(request);
}
