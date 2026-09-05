import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  AuthCallbackStatus,
  IdentitySessionBar,
  MagicLinkForm,
  completeSignInOnce,
  identityAuthMessage,
  signOutOnce,
  submitMagicLinkRequestOnce,
  type IdentityAuthState,
} from '../components/identity/identity-auth-elements.js';
import {
  buildMagicLinkRedirect,
  buildSignInPath,
  createIdentityAuthController,
  identityDefaultReturnPath,
  parseIdentityAuthEmail,
  sanitizeIdentityReturnPath,
  type IdentityAuthFailureCode,
  type IdentityAuthPort,
} from '../lib/identity-auth-session.js';
import { createPendingActionGate } from '../lib/review-pending-action.js';

interface AuthCall {
  readonly method: string;
  readonly input?: unknown;
}

function recordingPort(overrides: Partial<IdentityAuthPort> = {}): {
  readonly port: IdentityAuthPort;
  readonly calls: AuthCall[];
} {
  const calls: AuthCall[] = [];
  const port: IdentityAuthPort = {
    async sendMagicLink(input) {
      calls.push({ method: 'sendMagicLink', input });
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

function failedPort(method: 'sendMagicLink' | 'getSession' | 'signOut'): IdentityAuthPort {
  return recordingPort(
    method === 'sendMagicLink'
      ? { sendMagicLink: async () => ({ error: new Error('smtp down') }) }
      : method === 'getSession'
        ? { getSession: async () => ({ hasSession: false, error: new Error('exchange failed') }) }
        : { signOut: async () => ({ error: new Error('sign out failed') }) },
  ).port;
}

function throwingPort(method: 'sendMagicLink' | 'getSession' | 'signOut'): IdentityAuthPort {
  return recordingPort(
    method === 'sendMagicLink'
      ? { sendMagicLink: async () => { throw new Error('network'); } }
      : method === 'getSession'
        ? { getSession: async () => { throw new Error('network'); } }
        : { signOut: async () => { throw new Error('network'); } },
  ).port;
}

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

function html(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element);
}

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
    expect(sanitizeIdentityReturnPath('/settings/wallets')).toBe('/settings/wallets');
    expect(sanitizeIdentityReturnPath('/opportunities')).toBe('/opportunities');
  });

  it.each([
    ['//evil.example.com/settings/profile', 'protocol-relative'],
    ['/\\evil.example.com', 'backslash protocol-relative'],
    ['https://evil.example.com/settings/profile', 'absolute url'],
    ['javascript:alert(1)', 'javascript scheme'],
    ['settings/profile', 'relative path'],
    ['/settings/profile\n', 'trailing newline'],
    ['/settings\twallets', 'inner tab'],
  ])('rejects %s (%s)', (value) => {
    expect(sanitizeIdentityReturnPath(value)).toBe(identityDefaultReturnPath);
  });

  it('never returns to the auth flow itself', () => {
    expect(sanitizeIdentityReturnPath('/auth/sign-in')).toBe(identityDefaultReturnPath);
    expect(sanitizeIdentityReturnPath('/auth/callback')).toBe(identityDefaultReturnPath);
    expect(sanitizeIdentityReturnPath('/auth')).toBe(identityDefaultReturnPath);
  });

  it('round-trips the pending action through the sign-in path', () => {
    const signInPath = buildSignInPath('/settings/wallets');
    const next = new URL(`https://app.example.test${signInPath}`).searchParams.get('next');

    expect(signInPath.startsWith('/auth/sign-in?next=')).toBe(true);
    expect(next).toBe('/settings/wallets');
    expect(sanitizeIdentityReturnPath(next)).toBe('/settings/wallets');
  });

  it('drops an attacker supplied next value instead of propagating it', () => {
    const signInPath = buildSignInPath('//evil.example.com');

    expect(signInPath).toBe('/auth/sign-in?next=%2Fsettings%2Fprofile');
  });

  it('carries the pending action into the absolute magic-link redirect', () => {
    const redirect = buildMagicLinkRedirect('https://app.example.test', '/settings/wallets');

    expect(redirect).toBe('https://app.example.test/auth/callback?next=%2Fsettings%2Fwallets');
    expect(sanitizeIdentityReturnPath(
      new URL(redirect).searchParams.get('next'),
    )).toBe('/settings/wallets');
  });

  it('never lets the magic link redirect to a foreign origin', () => {
    const redirect = buildMagicLinkRedirect('https://app.example.test', 'https://evil.example.com/x');

    expect(redirect).toBe('https://app.example.test/auth/callback?next=%2Fsettings%2Fprofile');
  });
});

describe('identity auth controller surface', () => {
  it('exposes only the magic-link, completion and sign-out entry points', () => {
    const controller = createIdentityAuthController(recordingPort().port);

    expect(Object.keys(controller).sort()).toEqual([
      'completeSignIn',
      'requestMagicLink',
      'signOut',
    ]);
  });
});

describe('identity magic link requests', () => {
  it('sends a magic link for a valid email and reports success', async () => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    const outcome = await controller.requestMagicLink({
      email: ' Alice@Example.com ',
      redirectTo: 'https://app.example.test/auth/callback?next=/settings/wallets',
    });

    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual([{
      method: 'sendMagicLink',
      input: {
        email: 'Alice@Example.com',
        redirectTo: 'https://app.example.test/auth/callback?next=/settings/wallets',
      },
    }]);
  });

  it('rejects an invalid email without contacting the auth provider', async () => {
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    const outcome = await controller.requestMagicLink({
      email: 'not-an-email',
      redirectTo: 'https://app.example.test/auth/callback',
    });

    expect(outcome).toEqual({ ok: false, code: 'identity_auth_email_invalid' });
    expect(calls).toEqual([]);
  });

  it('maps a provider failure to the magic-link failure code', async () => {
    const controller = createIdentityAuthController(failedPort('sendMagicLink'));

    expect(await controller.requestMagicLink({
      email: 'alice@example.com',
      redirectTo: 'https://app.example.test/auth/callback',
    })).toEqual({ ok: false, code: 'identity_auth_link_failed' });
  });

  it('maps a thrown provider error to the magic-link failure code', async () => {
    const controller = createIdentityAuthController(throwingPort('sendMagicLink'));

    expect(await controller.requestMagicLink({
      email: 'alice@example.com',
      redirectTo: 'https://app.example.test/auth/callback',
    })).toEqual({ ok: false, code: 'identity_auth_link_failed' });
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

describe('identity auth single-flight gates', () => {
  it('sends one magic link when the same request is submitted twice in one tick', async () => {
    const gate = createPendingActionGate();
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);
    const input = {
      email: 'alice@example.com',
      redirectTo: 'https://app.example.test/auth/callback',
    };

    const [first, second] = await Promise.all([
      submitMagicLinkRequestOnce(gate, controller, input),
      submitMagicLinkRequestOnce(gate, controller, input),
    ]);

    expect([first, second]).toEqual([{ status: 'link_sent' }, { status: 'pending' }]);
    expect(calls).toHaveLength(1);
  });

  it('completes sign-in once when the callback effect fires twice', async () => {
    const gate = createPendingActionGate();
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    const [first, second] = await Promise.all([
      completeSignInOnce(gate, controller, params('code=pkce-code')),
      completeSignInOnce(gate, controller, params('code=pkce-code')),
    ]);

    expect([first, second]).toEqual([{ status: 'signed_in' }, { status: 'pending' }]);
    expect(calls).toHaveLength(1);
  });

  it('signs out once when the button is activated twice', async () => {
    const gate = createPendingActionGate();
    const { port, calls } = recordingPort();
    const controller = createIdentityAuthController(port);

    const [first, second] = await Promise.all([
      signOutOnce(gate, controller),
      signOutOnce(gate, controller),
    ]);

    expect([first, second]).toEqual([{ status: 'signed_out' }, { status: 'pending' }]);
    expect(calls).toHaveLength(1);
  });

  it('releases the gate so a later submission can proceed', async () => {
    const gate = createPendingActionGate();
    const controller = createIdentityAuthController(failedPort('sendMagicLink'));
    const input = {
      email: 'alice@example.com',
      redirectTo: 'https://app.example.test/auth/callback',
    };

    const first = await submitMagicLinkRequestOnce(gate, controller, input);
    const second = await submitMagicLinkRequestOnce(gate, controller, input);

    expect(first).toEqual({ status: 'failed', code: 'identity_auth_link_failed' });
    expect(second).toEqual({ status: 'failed', code: 'identity_auth_link_failed' });
  });
});

describe('identity auth surfaces', () => {
  const idle: IdentityAuthState = { status: 'idle' };

  it('asks only for an email and offers no field for a password or a wallet secret', () => {
    const rendered = html(createElement(MagicLinkForm, {
      state: idle,
      onSubmit: async () => {},
    }));

    expect(rendered).toContain('type="email"');
    expect(rendered).not.toMatch(/type="password"/i);
    expect(rendered).not.toMatch(/autocomplete="current-password"/i);
    expect(rendered).not.toMatch(/<input[^>]*name="(?:password|private|seed|mnemonic|secret|recovery)/i);
    expect((rendered.match(/<input/g) ?? []).length).toBe(1);
  });

  it('states that sign-in is magic-link only and never asks for credentials', () => {
    const rendered = html(createElement(MagicLinkForm, {
      state: idle,
      onSubmit: async () => {},
    }));

    expect(rendered).toContain('我们只会向你的邮箱发送一次性登录链接');
    expect(rendered).toContain('不会要求密码');
    expect(rendered).toContain('永远不会索取私钥、助记词、钱包密码或签名密钥');
    expect(rendered).not.toContain('/review/sign-in');
  });

  it('renders the pending link-sent state without offering a password fallback', () => {
    const rendered = html(createElement(MagicLinkForm, {
      state: { status: 'link_sent' },
      onSubmit: async () => {},
    }));

    expect(rendered).toContain('登录链接已发送');
    expect(rendered).not.toMatch(/type="password"/i);
    expect(rendered).toContain('href="/auth/sign-in"');
  });

  it('renders every auth failure with bounded copy', () => {
    const codes: readonly IdentityAuthFailureCode[] = [
      'identity_auth_email_invalid',
      'identity_auth_link_failed',
      'identity_auth_callback_invalid',
      'identity_auth_sign_out_failed',
    ];

    for (const code of codes) {
      const message = identityAuthMessage(code);
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/undefined|NaN|[A-Za-z_]{4,}_[a-z_]+/);
    }
    expect(identityAuthMessage('identity_auth_email_invalid')).toBe('邮箱格式无效，请检查后重试。');
    expect(identityAuthMessage('identity_auth_callback_invalid')).toBe('登录链接无效或已过期，请重新申请。');
  });

  it('renders the callback outcome states', () => {
    const pending = html(createElement(AuthCallbackStatus, { state: { status: 'pending' } }));
    const completed = html(createElement(AuthCallbackStatus, { state: { status: 'signed_in' } }));
    const failed = html(createElement(AuthCallbackStatus, {
      state: { status: 'failed', code: 'identity_auth_callback_invalid' },
    }));

    expect(pending).toContain('正在完成登录');
    expect(completed).toContain('登录成功');
    expect(failed).toContain('登录链接无效或已过期，请重新申请。');
    expect(failed).toContain('href="/auth/sign-in"');
    expect(`${pending}${completed}${failed}`).not.toContain('/review/sign-in');
  });

  it('offers sign out from the settings session bar and nothing else', () => {
    const rendered = html(createElement(IdentitySessionBar, {
      state: idle,
      onSignOut: async () => {},
    }));

    expect(rendered).toContain('已登录');
    expect(rendered).toContain('登出');
    expect(rendered).not.toMatch(/type="password"/i);
    expect(rendered).not.toContain('/review/sign-in');
  });

  it('keeps the sign-out failure visible on the session bar', () => {
    const rendered = html(createElement(IdentitySessionBar, {
      state: { status: 'failed', code: 'identity_auth_sign_out_failed' },
      onSignOut: async () => {},
    }));

    expect(rendered).toContain('登出失败，请重试。');
    expect(rendered).toContain('登出');
  });
});
