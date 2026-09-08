import { createExecutionWatchlistRepository } from '@airdrop/database';

type IdContext = { params: Promise<Record<string, string>> };

import { createAuthenticatedUserVerifier } from '../../../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../../../lib/env.js';
import { createExecutionWatchlistProjectHandler } from '../../../../../../../../lib/execution-handlers.js';

let handler: ReturnType<typeof createExecutionWatchlistProjectHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createExecutionWatchlistProjectHandler({
    auth: createAuthenticatedUserVerifier(environment),
    watchlists: createExecutionWatchlistRepository({
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function PUT(request: Request, context: IdContext) {
  return getHandler()(request, context);
}
export async function DELETE(request: Request, context: IdContext) {
  return getHandler()(request, context);
}
