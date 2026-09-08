import { createExecutionParticipationRepository } from '@airdrop/database';

type IdContext = { params: Promise<Record<string, string>> };

import { createAuthenticatedUserVerifier } from '../../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../../lib/env.js';
import { createExecutionParticipationHandler } from '../../../../../../../lib/execution-handlers.js';

let handler: ReturnType<typeof createExecutionParticipationHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createExecutionParticipationHandler({
    auth: createAuthenticatedUserVerifier(environment),
    participation: createExecutionParticipationRepository({
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(request: Request, context: IdContext) {
  return getHandler()(request, context);
}
export async function PUT(request: Request, context: IdContext) {
  return getHandler()(request, context);
}
