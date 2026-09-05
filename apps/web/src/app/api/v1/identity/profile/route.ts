import { createIdentityProfileRepository } from '@airdrop/database';

import { createAuthenticatedUserVerifier } from '../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../lib/env.js';
import { createIdentityProfileHandler } from '../../../../../lib/identity-handlers.js';

let handler: ReturnType<typeof createIdentityProfileHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createIdentityProfileHandler({
    auth: createAuthenticatedUserVerifier(environment),
    profiles: createIdentityProfileRepository({ url: environment.supabaseUrl, anonKey: environment.supabaseAnonKey }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(request: Request) { return getHandler()(request); }
export async function PATCH(request: Request) { return getHandler()(request); }
