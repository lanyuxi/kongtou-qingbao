import { createIdentityResolveLoginHandler } from '../../../../../lib/identity-login-handler.js';
import { createServerSupabaseClient } from '../../../../../lib/supabase-server.js';

/**
 * Runs on the anon key, so the lookup goes through the SECURITY DEFINER
 * function `resolve_login_email` (see 20260910000100_phase_11) rather than
 * reading auth.users directly.
 */
async function resolveLoginEmail(phone: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc('resolve_login_email', { p_phone: phone });
  if (error !== null && error !== undefined) {
    throw new Error('Identity lookup failed.');
  }
  return typeof data === 'string' && data !== '' ? data : null;
}

let handler: ReturnType<typeof createIdentityResolveLoginHandler> | undefined;

function getHandler() {
  if (handler !== undefined) return handler;
  handler = createIdentityResolveLoginHandler({
    resolveLoginEmail,
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function POST(request: Request) {
  return getHandler()(request);
}
