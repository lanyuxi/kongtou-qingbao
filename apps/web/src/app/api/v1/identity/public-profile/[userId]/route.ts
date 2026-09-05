import { createIdentityProfileRepository, createIdentityWalletAddressRepository } from '@airdrop/database';

import { parsePublicEnvironment } from '../../../../../../lib/env.js';
import { createIdentityPublicProfileHandler } from '../../../../../../lib/identity-handlers.js';

let handler: ReturnType<typeof createIdentityPublicProfileHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createIdentityPublicProfileHandler({
    profiles: createIdentityProfileRepository({ url: environment.supabaseUrl, anonKey: environment.supabaseAnonKey }),
    wallets: createIdentityWalletAddressRepository({ url: environment.supabaseUrl, anonKey: environment.supabaseAnonKey }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) { return getHandler()(request, context); }
