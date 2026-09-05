import { createIdentityWalletAddressRepository } from '@airdrop/database';

import { createAuthenticatedUserVerifier } from '../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../lib/env.js';
import { createIdentityWalletAddressHandler } from '../../../../../lib/identity-handlers.js';

let handler: ReturnType<typeof createIdentityWalletAddressHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createIdentityWalletAddressHandler({
    auth: createAuthenticatedUserVerifier(environment),
    wallets: createIdentityWalletAddressRepository({ url: environment.supabaseUrl, anonKey: environment.supabaseAnonKey }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function GET(request: Request) { return getHandler()(request); }
export async function POST(request: Request) { return getHandler()(request); }
