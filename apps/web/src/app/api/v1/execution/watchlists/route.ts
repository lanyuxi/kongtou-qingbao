import { createExecutionWatchlistRepository } from '@airdrop/database';

import { createAuthenticatedUserVerifier } from '../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../lib/env.js';
import { createExecutionWatchlistHandler } from '../../../../../lib/execution-handlers.js';

let handler: ReturnType<typeof createExecutionWatchlistHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createExecutionWatchlistHandler({
    auth: createAuthenticatedUserVerifier(environment),
    watchlists: createExecutionWatchlistRepository({
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(request: Request) { return getHandler()(request); }
export async function POST(request: Request) { return getHandler()(request); }
