import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  AuthCallbackStatus,
  ForgotPasswordForm,
  IdentitySessionBar,
  PasswordSignInForm,
  PasswordSignUpForm,
  completeSignInOnce,
  identityAuthMessage,
  signOutOnce,
  submitPasswordResetOnce,
  submitSignInOnce,
  submitSignUpOnce,
  type IdentityAuthState,
} from '../components/identity/identity-auth-elements.js';
import {
  buildPasswordResetRedirect,
  buildSignInPath,
  buildSignUpPath,
  createIdentityAuthController,
  identityDefaultReturnPath,
  parseIdentityAuthEmail,
  parseIdentityAuthPassword,
  parseIdentityAuthPhone,
  sanitizeIdentityReturnPath,
  type IdentityAuthFailureCode,
  type IdentityAuthPort,
} from '../lib/identity-auth-session.js';
import { createPendingActionGate } from '../lib/review-pending-action.js';

interface AuthCall {
  readonly method: string;
  readonly input?: unknown;
}

const registeredEmail = 'alice@example.com';
const registeredPhone = '13800138000';

/**
 * `lookupEmail` defaults to the registered address; pass null to model a number
 * that has no account. The credential check is modelled faithfully: only the
 * registered address succeeds, so the decoy-address path behaves like the real
 * provider and returns a rejection.
 */
function recordingPort(
  overrides: Partial<IdentityAuthPort> = {},
  lookupEmail: string | null = registeredEmail,
): {
  readonly port: IdentityAuthPort;
  readonly calls: AuthCall[];
} {
  const calls: AuthCall[] = [];
  const port: IdentityAuthPort = {
    async resolveLoginEmail(input) {
      calls.push({ method: 'resolveLoginEmail', input });
      return { email: lookupEmail, error: null };
    },
    async signInWithPassword(input) {
      calls.push({ method: 'signInWithPassword', input });
      return input.email === registeredEmail
        ? { error: null }
        : { error: new Error('invalid credentials') };
    },
    async signUpWithPassword(input) {
      calls.push({ method: 'signUpWithPassword', input });
      return { error: null };
    },
    async requestPasswordReset(input) {
      calls.push({ method: 'requestPasswordReset', input });
      return { error: null };
    },
    async getSession() {
      calls.push({ method: 'getSession' });
      return { hasSession: true, error: null };
    },
    async signOut() {
      calls.push({ method: 'signOut' });
      return { error: null };
    },
    ...overrides,
  };
  return { port, calls };
}

type FailMethod = 'resolveLoginEmail' | 'signInWithPassword' | 'signUpWithPassword'
  | 'requestPasswordReset' | 'getSession' | 'signOut';

function failedPort(method: FailMethod): IdentityAuthPort {
  const overrides: Partial<IdentityAuthPort> = {};
  const message = 'provider rejected the request';
  switch (method) {
    case 'resolveLoginEmail':
      overrides.resolveLoginEmail = async () => ({ email: null, error: new Error(message) });
      break;
    case 'signInWithPassword':
      overrides.signInWithPassword = async () => ({ error: new Error(message) });
      break;
    case 'signUpWithPassword':
      overrides.signUpWithPassword = async () => ({ error: new Error(message) });
      break;
    case 'requestPasswordReset':
      overrides.requestPasswordReset = async () => ({ error: new Error(message) });
      break;
    case 'getSession':
      overrides.getSession = async () => ({ hasSession: false, error: new Error(message) });
      break;
    case 'signOut':
      overrides.signOut = async () => ({ error: new Error(message) });
      break;
  }
  return recordingPort(overrides).port;
}

function throwingPort(method: FailMethod): IdentityAuthPort {
  const boom = async () => { throw new Error('network'); };
  const overrides: Partial<IdentityAuthPort> = {};
  switch (method) {
    case 'resolveLoginEmail': overrides.resolveLoginEmail = boom as never; break;
    case 'signInWithPassword': overrides.signInWithPassword = boom as never; break;
    case 'signUpWithPassword': overrides.signUpWithPassword = boom as never; break;
    case 'requestPasswordReset': overrides.requestPasswordReset = boom as never; break;
    case 'getSession': overrides.getSession = boom as never; break;
    case 'signOut': overrides.signOut = boom as never; break;
  }
  return recordingPort(overrides).port;
}

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

function html(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element);
}

const idle: IdentityAuthState = { status: 'idle' };

describe('identity auth phone parsing', () => {
  it.each([
    ['13800138000'],
    [' 13800138000 '],
    ['19912345678'],
  ])('accepts %s', (value) => {
    expect(parseIdentityAuthPhone(value)).toBe(value.trim());
  });

  it.each([
    ['', 'empty'],
    ['1380013800', 'ten digits'],
    ['138001380001', 'twelve digits'],
    ['12800138000', 'second digit out of range'],
    ['008613800138000', 'country code prefix'],
    ['138 0013 8000', 'spaces inside'],
    ['+8613800138000', 'plus prefix'],
    ['1380013800a', 'letter suffix'],
  ])('rejects %s (%s)', (value) => {
    expect(parseIdentityAuthPhone(value)).toBeNull();
  });

  it('rejects control characters inside an otherwise valid number', () => {
    expect(parseIdentityAuthPhone('1380013800\u0000')).toBeNull();
  });
});

describe('identity auth password parsing', () => {
  it('accepts a password with a letter and a digit of adequate length', () => {
    expect(parseIdentityAuthPassword('airdrop2026')).toBe('airdrop2026');
  });

  it.each([
    ['short1', 'too short'],
    ['12345678', 'digits only'],
    ['abcdefgh', 'letters only'],
    ['a1'.repeat(40), 'longer than 72'],
  ])('rejects %s (%s)', (value) => {
    expect(parseIdentityAuthPassword(value)).toBeNull();
  });

  it('rejects control characters without trimming them away', () => {
    expect(parseIdentityAuthPassword('airdrop2026\u0007')).toBeNull();
  });

  it('accepts a password padded with spaces because spaces are legal characters', () => {
    expect(parseIdentityAuthPassword(' pass word 1 ')).toBe(' pass word 1 ');
  });
});

describe('identity auth email parsing', () => {
  it.each([
    ['alice@example.com'],
    ['  alice@example.com  '],
    ['alice.bob+tag@sub.example.co'],
  ])('accepts %s', (value) => {
    expect(parseIdentityAuthEmail(value)).toBe(value.trim());
  });

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['alice', 'no domain'],
    ['alice@example', 'no tld'],
    ['alice@example.', 'trailing dot'],
    ['alice @example.com', 'inner space'],
    ['alice@example .com', 'inner space in domain'],
    ['@example.com', 'no local part'],
    ['alice@@example.com', 'double at'],
    [`${'a'.repeat(255)}@example.com`, 'too long'],
  ])('rejects %s (%s)', (value) => {
    expect(parseIdentityAuthEmail(value)).toBeNull();
  });

  it('rejects control characters inside an otherwise valid address', () => {
    expect(parseIdentityAuthEmail('alice\u0000@example.com')).toBeNull();
    expect(parseIdentityAuthEmail('alice@example\u007f.com')).toBeNull();
  });
});

describe('identity auth return path sanitisation', () => {
  it('falls back to the settings profile path when absent', () => {
    expect(identityDefaultReturnPath).toBe('/settings/profile');
    expect(sanitizeIdentityReturnPath(null)).toBe(identityDefaultReturnPath);
    expect(sanitizeIdentityReturnPath('')).toBe(identityDefaultReturnPath);
  });

  it('keeps same-origin absolute paths', () => {
    expect(sanitizeIdentityReturnPath('/tasks')).toBe('/tasks');
    expect(sanitizeIdentityReturnPath('/watchlists?tab=all')).toBe('/watchlists?tab=all');
  });

  it.each([
    ['https://evil.example.com/x'],
    ['//evil.example.com'],
    ['/\\evil.example.com'],
    ['/auth/sign-in'],
    ['/auth'],
    ['tasks'],
  ])('refuses %s', (value) => {
    expect(sanitizeIdentityReturnPath(value)).toBe(identityDefaultReturnPath);
  });

  it('builds sign-in and sign-up paths that carry a sanitised return path', () => {
    expect(buildSignInPath('/tasks')).toBe('/auth/sign-in?next=%2Ftasks');
    expect(buildSignUpPath('/watchlists')).toBe('/auth/sign-up?next=%2Fwatchlists');
    expect(buildSignInPath('https://evil.example.com')).toBe(
      '/auth/sign-in?next=%2Fsettings%2Fprofile',
    );
  });

  it('sends the reset link back through our own callback route', () => {
    const redirect = buildPasswordResetRedirect('https://app.example.test', '/settings/profile');

    expect(redirect).toBe(
      'https://app.example.test/auth/callback?next=%2Fsettings%2Fprofile&mode=recovery',
    );
    expect(sanitizeIdentityReturnPath(
      new URL(redirect).searchParams.get('next'),
    )).toBe('/settings/profile');
  });

  it('never lets the reset redirect point at a foreign origin', () => {
    const redirect = buildPasswordResetRedirect(
      'https://app.example.test',
      'https://evil.example.com/x',
    );

    expect(redirect).toBe(
      'https://app.example.test/auth/callback?next=%2Fsettings%2Fprofile&mode=recovery',
    );
  });
});

describe('identity auth controller surface', () => {
  it('exposes password sign-in, registration, recovery, completion and sign-out', () => {
    const controller = createIdentityAuthController(recordingPort().port);

    expect(Object.keys(controller).sort()).toEqual([
      'completeSignIn',
      'register',
      'requestPasswordReset',
      'signIn',
      'signOut',
    ]);
  });
});

describe('identity password sign-in', () => {
  it('resolves the number to an address and presents the credential', async () => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    const outcome = await controller.signIn({
      phone: ' 13800138000 ',
      password: 'airdrop2026',
    });

    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual([
      { method: 'resolveLoginEmail', input: { phone: registeredPhone } },
      {
        method: 'signInWithPassword',
        input: { email: registeredEmail, password: 'airdrop2026' },
      },
    ]);
  });

  it('rejects a malformed number without touching the provider', async () => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    expect(await controller.signIn({ phone: '12345', password: 'airdrop2026' }))
      .toEqual({ ok: false, code: 'identity_auth_phone_invalid' });
    expect(calls).toEqual([]);
  });

  it('rejects a weak password without touching the provider', async () => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    expect(await controller.signIn({ phone: registeredPhone, password: 'short' }))
      .toEqual({ ok: false, code: 'identity_auth_password_invalid' });
    expect(calls).toEqual([]);
  });

  it('reports the provider rejection as rejected credentials', async () => {
    const controller = createIdentityAuthController(failedPort('signInWithPassword'));

    expect(await controller.signIn({ phone: registeredPhone, password: 'airdrop2026' }))
      .toEqual({ ok: false, code: 'identity_auth_credentials_rejected' });
  });

  it('maps a thrown provider error to the same rejected-credentials code', async () => {
    const controller = createIdentityAuthController(throwingPort('signInWithPassword'));

    expect(await controller.signIn({ phone: registeredPhone, password: 'airdrop2026' }))
      .toEqual({ ok: false, code: 'identity_auth_credentials_rejected' });
  });

  it('still presents a credential when the number is unknown, so the answer cannot be used to probe accounts', async () => {
    const { port, calls } = recordingPort({}, null);
    const controller = createIdentityAuthController(port);

    const outcome = await controller.signIn({ phone: registeredPhone, password: 'airdrop2026' });

    expect(outcome).toEqual({ ok: false, code: 'identity_auth_credentials_rejected' });
    const signIn = calls.find((call) => call.method === 'signInWithPassword');
    expect(signIn).toBeDefined();
    expect((signIn?.input as { email: string }).email).not.toBe(registeredEmail);
    expect((signIn?.input as { email: string }).email).toContain('invalid');
  });

  it('fails fast when the lookup itself is unavailable', async () => {
    const controller = createIdentityAuthController(failedPort('resolveLoginEmail'));

    expect(await controller.signIn({ phone: registeredPhone, password: 'airdrop2026' }))
      .toEqual({ ok: false, code: 'identity_auth_lookup_failed' });
  });
});

describe('identity registration', () => {
  it('creates the account with both the number and the recovery address', async () => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    const outcome = await controller.register({
      phone: '13800138000',
      email: ' Alice@Example.com ',
      password: 'airdrop2026',
    });

    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual([{
      method: 'signUpWithPassword',
      input: {
        phone: registeredPhone,
        email: 'Alice@Example.com',
        password: 'airdrop2026',
      },
    }]);
  });

  it.each([
    ['12345', 'alice@example.com', 'airdrop2026', 'identity_auth_phone_invalid'],
    ['13800138000', 'not-an-email', 'airdrop2026', 'identity_auth_email_invalid'],
    ['13800138000', 'alice@example.com', 'short', 'identity_auth_password_invalid'],
  ])('rejects %s / %s / %s', async (phone, email, password, code) => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    expect(await controller.register({ phone, email, password }))
      .toEqual({ ok: false, code: code as IdentityAuthFailureCode });
    expect(calls).toEqual([]);
  });

  it('reports a provider rejection as a registration failure', async () => {
    const controller = createIdentityAuthController(failedPort('signUpWithPassword'));

    expect(await controller.register({
      phone: registeredPhone,
      email: registeredEmail,
      password: 'airdrop2026',
    })).toEqual({ ok: false, code: 'identity_auth_registration_failed' });
  });
});

describe('identity password recovery', () => {
  it('mails a reset link to the address bound to the number', async () => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    const outcome = await controller.requestPasswordReset({
      phone: registeredPhone,
      redirectTo: 'https://app.example.test/auth/callback?next=%2Fsettings%2Fprofile&mode=recovery',
    });

    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual([
      { method: 'resolveLoginEmail', input: { phone: registeredPhone } },
      {
        method: 'requestPasswordReset',
        input: {
          email: registeredEmail,
          redirectTo: 'https://app.example.test/auth/callback?next=%2Fsettings%2Fprofile&mode=recovery',
        },
      },
    ]);
  });

  it('reports success for an unknown number without sending anything', async () => {
    const { port, calls } = recordingPort({}, null);
    const controller = createIdentityAuthController(port);

    const outcome = await controller.requestPasswordReset({
      phone: registeredPhone,
      redirectTo: 'https://app.example.test/auth/callback',
    });

    expect(outcome).toEqual({ ok: true });
    expect(calls.map((call) => call.method)).toEqual(['resolveLoginEmail']);
  });

  it('rejects a malformed number without touching the provider', async () => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    expect(await controller.requestPasswordReset({
      phone: 'nope',
      redirectTo: 'https://app.example.test/auth/callback',
    })).toEqual({ ok: false, code: 'identity_auth_phone_invalid' });
    expect(calls).toEqual([]);
  });

  it('reports a provider rejection as a reset failure', async () => {
    const controller = createIdentityAuthController(failedPort('requestPasswordReset'));

    expect(await controller.requestPasswordReset({
      phone: registeredPhone,
      redirectTo: 'https://app.example.test/auth/callback',
    })).toEqual({ ok: false, code: 'identity_auth_reset_request_failed' });
  });
});

describe('identity sign-in completion', () => {
  it('resolves a callback that carries no auth error and yields a session', async () => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    expect(await controller.completeSignIn(params('code=pkce-code'))).toEqual({ ok: true });
    expect(calls).toEqual([{ method: 'getSession' }]);
  });

  it('rejects a callback that the provider flagged with an error', async () => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    const outcome = await controller.completeSignIn(
      params('error=access_denied&error_code=otp_expired&error_description=expired'),
    );

    expect(outcome).toEqual({ ok: false, code: 'identity_auth_callback_invalid' });
    expect(calls).toEqual([]);
  });

  it('rejects a callback that leaves no session behind', async () => {
    const controller = createIdentityAuthController(recordingPort({
      getSession: async () => ({ hasSession: false, error: null }),
    }).port);

    expect(await controller.completeSignIn(params('code=pkce-code')))
      .toEqual({ ok: false, code: 'identity_auth_callback_invalid' });
  });

  it('maps a session error and a thrown session error to the same callback code', async () => {
    const failed = createIdentityAuthController(failedPort('getSession'));
    const thrown = createIdentityAuthController(throwingPort('getSession'));

    expect(await failed.completeSignIn(params('code=pkce-code')))
      .toEqual({ ok: false, code: 'identity_auth_callback_invalid' });
    expect(await thrown.completeSignIn(params('code=pkce-code')))
      .toEqual({ ok: false, code: 'identity_auth_callback_invalid' });
  });
});

describe('identity sign out', () => {
  it('clears the session and reports success', async () => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    expect(await controller.signOut()).toEqual({ ok: true });
    expect(calls).toEqual([{ method: 'signOut' }]);
  });

  it('reports a sign-out failure instead of pretending the session ended', async () => {
    const failed = createIdentityAuthController(failedPort('signOut'));
    const thrown = createIdentityAuthController(throwingPort('signOut'));

    expect(await failed.signOut()).toEqual({ ok: false, code: 'identity_auth_sign_out_failed' });
    expect(await thrown.signOut()).toEqual({ ok: false, code: 'identity_auth_sign_out_failed' });
  });
});

describe('identity auth messages', () => {
  it('maps every failure code to a non-empty message', () => {
    const codes: readonly IdentityAuthFailureCode[] = [
      'identity_auth_phone_invalid',
      'identity_auth_password_invalid',
      'identity_auth_email_invalid',
      'identity_auth_credentials_rejected',
      'identity_auth_registration_failed',
      'identity_auth_reset_request_failed',
      'identity_auth_lookup_failed',
      'identity_auth_callback_invalid',
      'identity_auth_sign_out_failed',
    ];

    for (const code of codes) {
      expect(identityAuthMessage(code).length).toBeGreaterThan(0);
    }
  });
});

describe('identity auth screens', () => {
  it('renders the sign-in form with a phone field and a masked password field', () => {
    const markup = html(createElement(PasswordSignInForm, { state: idle, onSubmit: async () => {} }));

    expect(markup).toContain('type="password"');
    expect(markup).toContain('type="tel"');
    expect(markup).toContain('手机号');
    expect(markup).not.toContain('邮箱一次性链接');
    expect(markup).not.toContain('不使用密码');
  });

  it('renders the sign-up form with a recovery email and a confirmation field', () => {
    const markup = html(createElement(PasswordSignUpForm, { state: idle, onSubmit: async () => {} }));

    expect(markup).toContain('type="email"');
    expect(markup.match(/type="password"/gu)?.length).toBe(2);
    expect(markup).toContain('确认密码');
  });

  it('renders the recovery form with only the phone field', () => {
    const markup = html(createElement(ForgotPasswordForm, { state: idle, onSubmit: async () => {} }));

    expect(markup).toContain('type="tel"');
    expect(markup).not.toContain('type="password"');
    expect(markup).not.toContain('type="email"');
  });

  it('confirms registration without exposing whether the address exists', () => {
    const markup = html(createElement(PasswordSignUpForm, {
      state: { status: 'registered' },
      onSubmit: async () => {},
    }));

    expect(markup).toContain('注册成功');
  });

  it('confirms a reset request with wording that does not confirm the account exists', () => {
    const markup = html(createElement(ForgotPasswordForm, {
      state: { status: 'reset_requested' },
      onSubmit: async () => {},
    }));

    expect(markup).toContain('如果该手机号已注册');
  });

  it('renders the callback status and the session bar', () => {
    const callback = html(createElement(AuthCallbackStatus, { state: { status: 'pending' } }));
    const bar = html(createElement(IdentitySessionBar, { state: idle, onSignOut: async () => {} }));

    expect(callback).toContain('正在完成登录');
    expect(bar).toContain('登出');
  });

  it('escapes hostile content instead of rendering markup from a failure code', () => {
    const markup = html(createElement(PasswordSignInForm, {
      state: { status: 'failed', code: 'identity_auth_credentials_rejected' },
      onSubmit: async () => {},
    }));

    expect(markup).toContain('手机号或密码不正确');
    expect(markup).not.toContain('&lt;');
  });
});

describe('identity auth pending gate', () => {
  it('only lets one sign-in request through while the first is in flight', async () => {
    const gate = createPendingActionGate();
    let resolveFirst: ((value: { ok: true }) => void) | undefined;
    const controller = createIdentityAuthController(recordingPort({
      signInWithPassword: async () => {
        await new Promise<void>((resolve) => { resolveFirst = () => resolve(); });
        return { error: null };
      },
    }).port);

    const first = submitSignInOnce(gate, controller, {
      phone: registeredPhone,
      password: 'airdrop2026',
    });
    const second = await submitSignInOnce(gate, controller, {
      phone: registeredPhone,
      password: 'airdrop2026',
    });

    expect(second).toEqual({ status: 'pending' });
    resolveFirst?.({ ok: true });
    await first;
  });

  it('surfaces a failed sign-in as a failed state carrying the code', async () => {
    const gate = createPendingActionGate();
    const controller = createIdentityAuthController(failedPort('signInWithPassword'));

    expect(await submitSignInOnce(gate, controller, {
      phone: registeredPhone,
      password: 'airdrop2026',
    })).toEqual({ status: 'failed', code: 'identity_auth_credentials_rejected' });
  });

  it('surfaces registration and recovery successes as their own states', async () => {
    const gate = createPendingActionGate();
    const controller = createIdentityAuthController(recordingPort().port);

    expect(await submitSignUpOnce(gate, controller, {
      phone: registeredPhone,
      email: registeredEmail,
      password: 'airdrop2026',
    })).toEqual({ status: 'registered' });

    expect(await submitPasswordResetOnce(gate, controller, {
      phone: registeredPhone,
      redirectTo: 'https://app.example.test/auth/callback',
    })).toEqual({ status: 'reset_requested' });
  });

  it('reports completion and sign-out outcomes', async () => {
    const gate = createPendingActionGate();
    const controller = createIdentityAuthController(recordingPort().port);

    expect(await completeSignInOnce(gate, controller, params('code=abc')))
      .toEqual({ status: 'signed_in' });
    expect(await signOutOnce(gate, controller)).toEqual({ status: 'signed_out' });
  });
});
