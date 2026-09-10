'use client';

import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

import {
  PasswordSignUpForm,
  submitSignUpOnce,
  type IdentityAuthState,
} from '../../components/identity/identity-auth-elements.js';
import { useIdentityBrowserRuntime } from '../../lib/identity-browser-runtime.js';
import { buildSignUpRedirect, sanitizeIdentityReturnPath } from '../../lib/identity-auth-session.js';
import { createPendingActionGate } from '../../lib/review-pending-action.js';

export function SignUpScreen() {
  const searchParams = useSearchParams();
  const runtime = useIdentityBrowserRuntime();
  const [state, setState] = useState<IdentityAuthState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const returnPath = sanitizeIdentityReturnPath(searchParams.get('next'));

  async function submit(input: {
    phone: string;
    email: string;
    password: string;
  }): Promise<void> {
    if (runtime === null) {
      setState({ status: 'failed', code: 'identity_auth_registration_failed' });
      return;
    }
    setState({ status: 'pending' });
    setState(
      await submitSignUpOnce(gate.current, runtime.auth, {
        ...input,
        redirectTo: buildSignUpRedirect(window.location.origin, returnPath),
      }),
    );
  }

  return <PasswordSignUpForm state={state} onSubmit={submit} />;
}
