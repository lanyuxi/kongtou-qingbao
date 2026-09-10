import { apiErrorSchema, createApiSuccessSchema, loginPhoneSchema } from '@airdrop/contracts';
import { z } from 'zod';

/**
 * Looks up the email address behind a login mobile number, so the sign-in and
 * password-recovery forms can talk to Supabase Auth (which authenticates by
 * email, not by phone).
 *
 * The response is deliberately uniform: an unknown number returns
 * `{ email: null }` with the same 200 status as a known one, so this endpoint
 * cannot be used to enumerate which numbers have accounts. Callers must not
 * turn a null into a distinct user-facing message.
 */
export type IdentityLoginLookupDependencies = {
  readonly resolveLoginEmail: (phone: string) => Promise<string | null>;
  readonly ids: { generate(): string };
};

const requestSchema = z.strictObject({ phone: loginPhoneSchema });

const responseSchema = createApiSuccessSchema(
  z.strictObject({ email: z.string().min(1).nullable() }),
);

export function createIdentityResolveLoginHandler(deps: IdentityLoginLookupDependencies) {
  return async function handleResolveLogin(request: Request): Promise<Response> {
    const requestId = deps.ids.generate();

    if (request.method !== 'POST') {
      return errorResponse(405, 'identity_command_invalid', 'Method not allowed.', requestId);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, 'identity_command_invalid', 'The request is invalid.', requestId);
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, 'identity_command_invalid', 'The request is invalid.', requestId);
    }

    try {
      const email = await deps.resolveLoginEmail(parsed.data.phone);
      return Response.json(
        responseSchema.parse({
          ok: true,
          data: { email: email === null || email === '' ? null : email },
          meta: { requestId, nextCursor: null },
        }),
        { status: 200 },
      );
    } catch {
      return errorResponse(500, 'identity_query_failed', 'The request failed.', requestId);
    }
  };
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
): Response {
  return Response.json(
    apiErrorSchema.parse({
      ok: false,
      error: { code, message, requestId, details: null },
    }),
    { status },
  );
}
