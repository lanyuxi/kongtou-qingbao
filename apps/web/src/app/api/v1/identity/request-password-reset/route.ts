import { apiErrorSchema, loginPhoneSchema } from '@airdrop/contracts';
import { z } from 'zod';

import { createServerSupabaseClient } from '../../../../../lib/supabase-server.js';
import { parsePublicEnvironment } from '../../../../../lib/env.js';

/**
 * Requests a password-reset mail for a mobile number.
 *
 * Server-side for the same reason as sign-in: the address the mail goes to is
 * the account's recovery address and must not be revealed. The response is
 * identical whether or not the number is registered, so this endpoint cannot
 * be used to test which numbers have accounts.
 */
export const dynamic = 'force-dynamic';

const requestSchema = z.strictObject({
  phone: loginPhoneSchema,
  redirectTo: z.string().min(1).max(500),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'identity_command_invalid', requestId);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, 'identity_command_invalid', requestId);
  }

  const origin = new URL(request.url).origin;
  // Only our own callback may be used as the landing page; anything else would
  // turn this into an open redirect.
  const redirectTo = parsed.data.redirectTo.startsWith(`${origin}/`)
    ? parsed.data.redirectTo
    : `${origin}/auth/callback`;

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc('resolve_login_email', {
      p_phone: parsed.data.phone,
    });
    if (error !== null && error !== undefined) {
      return errorResponse(500, 'identity_query_failed', requestId);
    }

    // Unknown number: report success without sending anything.
    if (typeof data !== 'string' || data === '') {
      return successResponse(requestId);
    }

    const environment = parsePublicEnvironment();
    const response = await fetch(
      `${environment.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: 'POST',
        headers: {
          apikey: environment.supabaseAnonKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: data }),
        cache: 'no-store',
      },
    );
    // A mailer failure is reported as a failure, because the visitor is
    // waiting for something that will never arrive.
    if (!response.ok) {
      return errorResponse(502, 'identity_query_failed', requestId);
    }
    return successResponse(requestId);
  } catch {
    return errorResponse(500, 'identity_query_failed', requestId);
  }
}

function successResponse(requestId: string): Response {
  return Response.json(
    { ok: true, data: { requested: true }, meta: { requestId, nextCursor: null } },
    { status: 200 },
  );
}

function errorResponse(status: number, code: string, requestId: string): Response {
  return Response.json(
    apiErrorSchema.parse({
      ok: false,
      error: { code, message: 'The request failed.', requestId, details: null },
    }),
    { status },
  );
}
