export const identityDefaultReturnPath = '/settings/profile';

export const identitySignInPath = '/auth/sign-in';

export const identitySignUpPath = '/auth/sign-up';

export const identityForgotPasswordPath = '/auth/forgot-password';

export const identityCallbackPath = '/auth/callback';

export type IdentityAuthFailureCode =
  | 'identity_auth_phone_invalid'
  | 'identity_auth_password_invalid'
  | 'identity_auth_email_invalid'
  | 'identity_auth_credentials_rejected'
  | 'identity_auth_registration_failed'
  | 'identity_auth_reset_request_failed'
  | 'identity_auth_lookup_failed'
  | 'identity_auth_callback_invalid'
  | 'identity_auth_sign_out_failed';

export type IdentityAuthOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: IdentityAuthFailureCode };

/**
 * The browser auth provider (Phase 11).
 *
 * Accounts are identified by a mainland mobile number, but Supabase
 * authenticates by email. Crucially the *server* performs that join: the email
 * behind a number is the account's recovery address and must never reach the
 * browser, so sign-in posts the number and password to our own endpoint and
 * receives tokens back. The client learns nothing but whether it worked.
 */
export interface IdentityAuthPort {
  signInWithPhone(input: {
    readonly phone: string;
    readonly password: string;
  }): Promise<{
    readonly error: unknown | null;
    readonly session: { readonly accessToken: string; readonly refreshToken: string } | null;
  }>;
  adoptSession(input: {
    readonly accessToken: string;
    readonly refreshToken: string;
  }): Promise<{ readonly error: unknown | null }>;
  signUpWithPassword(input: {
    readonly email: string;
    readonly password: string;
    readonly phone: string;
    readonly redirectTo: string;
  }): Promise<{ readonly error: unknown | null }>;
  requestPasswordReset(input: {
    readonly phone: string;
    readonly redirectTo: string;
  }): Promise<{ readonly error: unknown | null }>;
  getSession(): Promise<{
    readonly hasSession: boolean;
    readonly error: unknown | null;
  }>;
  signOut(): Promise<{ readonly error: unknown | null }>;
}

export interface IdentityAuthController {
  signIn(input: {
    readonly phone: string;
    readonly password: string;
  }): Promise<IdentityAuthOutcome>;
  register(input: {
    readonly phone: string;
    readonly email: string;
    readonly password: string;
    readonly redirectTo: string;
  }): Promise<IdentityAuthOutcome>;
  requestPasswordReset(input: {
    readonly phone: string;
    readonly redirectTo: string;
  }): Promise<IdentityAuthOutcome>;
  completeSignIn(params: URLSearchParams): Promise<IdentityAuthOutcome>;
  signOut(): Promise<IdentityAuthOutcome>;
}

const success: IdentityAuthOutcome = { ok: true };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

const maxEmailLength = 254;

const phonePattern = /^1[3-9][0-9]{9}$/u;

const minPasswordLength = 8;

const maxPasswordLength = 72;

export function parseIdentityAuthPhone(value: string): string | null {
  const trimmed = value.trim();
  if (hasControlCharacter(trimmed)) return null;
  return phonePattern.test(trimmed) ? trimmed : null;
}

export function parseIdentityAuthEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > maxEmailLength) return null;
  if (hasControlCharacter(trimmed)) return null;
  return emailPattern.test(trimmed) ? trimmed : null;
}

export function parseIdentityAuthPassword(value: string): string | null {
  if (value.length < minPasswordLength || value.length > maxPasswordLength) return null;
  if (hasControlCharacter(value)) return null;
  // Mirrors accountPasswordSchema: a phone account's password is the only
  // factor protecting it, so trivially weak strings are rejected up front
  // instead of coming back as an opaque provider error.
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return null;
  return value;
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

export function buildSignUpPath(returnPath: string): string {
  return `${identitySignUpPath}?next=${encodeURIComponent(sanitizeIdentityReturnPath(returnPath))}`;
}

/**
 * Where the sign-up confirmation email should drop the user. Passing this
 * explicitly matters: without it Supabase falls back to the project's Site URL,
 * which during setup is still http://localhost:3000.
 */
export function buildSignUpRedirect(origin: string, returnPath: string): string {
  const next = encodeURIComponent(sanitizeIdentityReturnPath(returnPath));
  return `${origin}${identityCallbackPath}?next=${next}`;
}

/**
 * Where the recovery email should drop the user. Supabase returns them to the
 * callback route with a session, which then forwards to the password form.
 */
export function buildPasswordResetRedirect(origin: string, returnPath: string): string {
  const next = encodeURIComponent(sanitizeIdentityReturnPath(returnPath));
  return `${origin}${identityCallbackPath}?next=${next}&mode=recovery`;
}

export function createIdentityAuthController(auth: IdentityAuthPort): IdentityAuthController {
  return {
    async signIn(input) {
      const phone = parseIdentityAuthPhone(input.phone);
      if (phone === null) return failure('identity_auth_phone_invalid');
      const password = parseIdentityAuthPassword(input.password);
      if (password === null) return failure('identity_auth_password_invalid');

      try {
        const result = await auth.signInWithPhone({ phone, password });
        if (result.error !== null) return failure('identity_auth_lookup_failed');
        if (result.session === null) return failure('identity_auth_credentials_rejected');
        // The session is minted server-side; adopt it so the rest of the app,
        // which reads the Supabase client session, sees a signed-in user.
        const adopted = await auth.adoptSession(result.session);
        return adopted.error === null ? success : failure('identity_auth_callback_invalid');
      } catch {
        return failure('identity_auth_lookup_failed');
      }
    },

    async register(input) {
      const phone = parseIdentityAuthPhone(input.phone);
      if (phone === null) return failure('identity_auth_phone_invalid');
      const email = parseIdentityAuthEmail(input.email);
      if (email === null) return failure('identity_auth_email_invalid');
      const password = parseIdentityAuthPassword(input.password);
      if (password === null) return failure('identity_auth_password_invalid');

      try {
        const result = await auth.signUpWithPassword({
          email,
          password,
          phone,
          redirectTo: input.redirectTo,
        });
        return result.error === null ? success : failure('identity_auth_registration_failed');
      } catch {
        return failure('identity_auth_registration_failed');
      }
    },

    async requestPasswordReset(input) {
      const phone = parseIdentityAuthPhone(input.phone);
      if (phone === null) return failure('identity_auth_phone_invalid');

      try {
        // Also server-side: an unknown number reports success without sending
        // anything, so this form cannot be used to test which numbers exist.
        const result = await auth.requestPasswordReset({
          phone,
          redirectTo: input.redirectTo,
        });
        return result.error === null ? success : failure('identity_auth_reset_request_failed');
      } catch {
        return failure('identity_auth_reset_request_failed');
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
