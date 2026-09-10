import { apiErrorSchema, createApiSuccessSchema, loginPhoneSchema, accountPasswordSchema } from '@airdrop/contracts';
import { z } from 'zod';

/**
 * Exchanges a mobile number + password for a session.
 *
 * WHY THIS LIVES ON THE SERVER: Supabase authenticates by email, but the email
 * is not something the client should ever see — it is the account's recovery
 * address, and handing it to anyone who knows (or guesses) a phone number
 * makes the resolver an enumeration oracle. So the lookup and the credential
 * exchange both happen here, and only the resulting tokens go back to the
 * browser.
 *
 * The unknown-number path deliberately performs the same exchange against a
 * decoy address, so "no such account" and "wrong password" cost the same and
 * read the same.
 */
export type IdentityPasswordSignInDependencies = {
  readonly lookupEmail: (phone: string) => Promise<string | null>;
  readonly exchangePassword: (input: {
    readonly email: string;
    readonly password: string;
  }) => Promise<{ readonly accessToken: string; readonly refreshToken: string } | null>;
  readonly ids: { generate(): string };
};

const decoyEmail = 'unregistered@invalid.airdrop-intelligence-os.local';

const requestSchema = z.strictObject({
  phone: loginPhoneSchema,
  password: accountPasswordSchema,
});

const responseSchema = createApiSuccessSchema(
  z.strictObject({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
  }),
);

export function createIdentityPasswordSignInHandler(deps: IdentityPasswordSignInDependencies) {
  return async function handlePasswordSignIn(request: Request): Promise<Response> {
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
      const found = await deps.lookupEmail(parsed.data.phone);
      const session = await deps.exchangePassword({
        email: found ?? decoyEmail,
        password: parsed.data.password,
      });
      if (session === null) {
        // One code for both "unknown number" and "wrong password".
        return errorResponse(401, 'identity_session_required', 'Sign-in failed.', requestId);
      }
      return Response.json(
        responseSchema.parse({
          ok: true,
          data: { accessToken: session.accessToken, refreshToken: session.refreshToken },
          meta: { requestId, nextCursor: null },
        }),
        { status: 200 },
      );
    } catch {
      return errorResponse(500, 'identity_query_failed', 'The request failed.', requestId);
    }
  };
}

function errorResponse(status: number, code: string, message: string, requestId: string): Response {
  return Response.json(
    apiErrorSchema.parse({ ok: false, error: { code, message, requestId, details: null } }),
    { status },
  );
}
