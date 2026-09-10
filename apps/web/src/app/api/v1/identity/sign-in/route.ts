import { createServerSupabaseClient } from '../../../../../lib/supabase-server.js';
import { parsePublicEnvironment } from '../../../../../lib/env.js';
import { createIdentityPasswordSignInHandler } from '../../../../../lib/identity-password-signin-handler.js';

/**
 * Reads the address behind a number without ever returning it to the caller —
 * the only consumer is `exchangePassword` below.
 */
async function lookupEmail(phone: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc('resolve_login_email', { p_phone: phone });
  if (error !== null && error !== undefined) throw new Error('Identity lookup failed.');
  return typeof data === 'string' && data !== '' ? data : null;
}

/**
 * Performs the password grant server-side. Uses the same public anon key the
 * browser would, but from here the email in the request body never leaves the
 * process.
 */
function createPasswordExchange(): (input: {
  readonly email: string;
  readonly password: string;
}) => Promise<{ readonly accessToken: string; readonly refreshToken: string } | null> {
  const environment = parsePublicEnvironment();

  return async ({ email, password }) => {
    const response = await fetch(
      `${environment.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          apikey: environment.supabaseAnonKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        cache: 'no-store',
      },
    );
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null) return null;
    const record = payload as Record<string, unknown>;
    if (typeof record.access_token !== 'string' || typeof record.refresh_token !== 'string') {
      return null;
    }
    return { accessToken: record.access_token, refreshToken: record.refresh_token };
  };
}

let handler: ReturnType<typeof createIdentityPasswordSignInHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  handler = createIdentityPasswordSignInHandler({
    lookupEmail,
    exchangePassword: createPasswordExchange(),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function POST(request: Request) {
  return getHandler()(request);
}
