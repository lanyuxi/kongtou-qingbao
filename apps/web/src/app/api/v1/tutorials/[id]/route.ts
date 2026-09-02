import { createTutorialPublicRepository } from '@airdrop/database';
import { createPublicTutorialDetailHandler } from '../../../../../lib/tutorial-public-handlers.js';
import { createServerSupabaseClient } from '../../../../../lib/supabase-server.js';

let handler: ReturnType<typeof createPublicTutorialDetailHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  handler = createPublicTutorialDetailHandler({
    publicTutorials: createTutorialPublicRepository(createServerSupabaseClient()),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return getHandler()(request, context);
}
