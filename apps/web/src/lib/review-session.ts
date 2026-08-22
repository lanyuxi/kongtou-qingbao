export interface ReviewAuthPort {
  signInWithPassword(input: { email: string; password: string }): Promise<{
    accessToken: string | null;
  }>;
  getAccessToken(): Promise<string | null>;
  signOut(): Promise<void>;
}

export interface ReviewSessionController {
  signIn(email: string, password: string): Promise<
    { ok: true } | { ok: false; code: 'sign_in_failed' }
  >;
  getAccessToken(): Promise<string | null>;
  signOut(): Promise<void>;
}

export function createReviewSessionController(auth: ReviewAuthPort): ReviewSessionController {
  return {
    async signIn(email, password) {
      try {
        const result = await auth.signInWithPassword({ email, password });
        return result.accessToken === null || !/^\S+$/u.test(result.accessToken)
          ? { ok: false, code: 'sign_in_failed' }
          : { ok: true };
      } catch {
        return { ok: false, code: 'sign_in_failed' };
      }
    },

    async getAccessToken() {
      try {
        return await auth.getAccessToken();
      } catch {
        return null;
      }
    },

    async signOut() {
      try {
        await auth.signOut();
      } catch {
        // The browser UI has no safe use for provider-specific sign-out details.
      }
    },
  };
}
