import { createIdentityWalletAddressRepository } from '@airdrop/database';

import { createAuthenticatedUserVerifier } from '../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../lib/env.js';
import { createIdentityWalletAddressItemHandler } from '../../../../../../lib/identity-handlers.js';

let handler: ReturnType<typeof createIdentityWalletAddressItemHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  const environment = parsePublicEnvironment();
  handler = createIdentityWalletAddressItemHandler({
    auth: createAuthenticatedUserVerifier(environment),
    wallets: createIdentityWalletAddressRepository({ url: environment.supabaseUrl, anonKey: environment.supabaseAnonKey }),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return getHandler()(request, context); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return getHandler()(request, context); }
