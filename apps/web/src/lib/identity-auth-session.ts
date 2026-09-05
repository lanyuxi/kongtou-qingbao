export const identityDefaultReturnPath = '/settings/profile';

export const identitySignInPath = '/auth/sign-in';

export const identityCallbackPath = '/auth/callback';

export type IdentityAuthFailureCode =
  | 'identity_auth_email_invalid'
  | 'identity_auth_link_failed'
  | 'identity_auth_callback_invalid'
  | 'identity_auth_sign_out_failed';

export type IdentityAuthOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: IdentityAuthFailureCode };

/**
 * The browser auth provider. It intentionally exposes no password credential
 * path: end-user sign-in is magic-link only (decision D1).
 */
export interface IdentityAuthPort {
  sendMagicLink(input: {
    readonly email: string;
    readonly redirectTo: string;
  }): Promise<{ readonly error: unknown | null }>;
  getSession(): Promise<{
    readonly hasSession: boolean;
    readonly error: unknown | null;
  }>;
  signOut(): Promise<{ readonly error: unknown | null }>;
}

export interface IdentityAuthController {
  requestMagicLink(input: {
    readonly email: string;
    readonly redirectTo: string;
  }): Promise<IdentityAuthOutcome>;
  completeSignIn(params: URLSearchParams): Promise<IdentityAuthOutcome>;
  signOut(): Promise<IdentityAuthOutcome>;
}

const success: IdentityAuthOutcome = { ok: true };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

const maxEmailLength = 254;

export function parseIdentityAuthEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > maxEmailLength) return null;
  if (hasControlCharacter(trimmed)) return null;
  return emailPattern.test(trimmed) ? trimmed : null;
}

export function sanitizeIdentityReturnPath(value: string | null): string {
  if (value === null) return identityDefaultReturnPath;
  const candidate = value.trim();
  if (!candidate.startsWith('/')) return identityDefaultReturnPath;
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return identityDefaultReturnPath;
  if (candidate === '/auth' || candidate.startsWith('/auth/')) return identityDefaultReturnPath;
  if (hasControlCharacter(candidate)) return identityDefaultReturnPath;
  return candidate;
}

export function buildSignInPath(returnPath: string): string {
  return `${identitySignInPath}?next=${encodeURIComponent(sanitizeIdentityReturnPath(returnPath))}`;
}

export function buildMagicLinkRedirect(origin: string, returnPath: string): string {
  const next = encodeURIComponent(sanitizeIdentityReturnPath(returnPath));
  return `${origin}${identityCallbackPath}?next=${next}`;
}

export function createIdentityAuthController(auth: IdentityAuthPort): IdentityAuthController {
  return {
    async requestMagicLink(input) {
      const email = parseIdentityAuthEmail(input.email);
      if (email === null) return failure('identity_auth_email_invalid');
      try {
        const result = await auth.sendMagicLink({ email, redirectTo: input.redirectTo });
        return result.error === null ? success : failure('identity_auth_link_failed');
      } catch {
        return failure('identity_auth_link_failed');
      }
    },

    async completeSignIn(params) {
      if (isRejectedCallback(params)) return failure('identity_auth_callback_invalid');
      try {
        const result = await auth.getSession();
        return result.error === null && result.hasSession
          ? success
          : failure('identity_auth_callback_invalid');
      } catch {
        return failure('identity_auth_callback_invalid');
      }
    },

    async signOut() {
      try {
        const result = await auth.signOut();
        return result.error === null ? success : failure('identity_auth_sign_out_failed');
      } catch {
        return failure('identity_auth_sign_out_failed');
      }
    },
  };
}

/**
 * The provider redirects back with `error` params when a link is expired or
 * already used. Fail on those without consulting the local session, so a stale
 * session can never be mistaken for a successful sign-in.
 */
function isRejectedCallback(params: URLSearchParams): boolean {
  return params.has('error') || params.has('error_code') || params.has('error_description');
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
}

function failure(code: IdentityAuthFailureCode): IdentityAuthOutcome {
  return { ok: false, code };
}
