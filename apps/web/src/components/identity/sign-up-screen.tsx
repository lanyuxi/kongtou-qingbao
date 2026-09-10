'use client';

import { useRef, useState } from 'react';

import {
  PasswordSignUpForm,
  submitSignUpOnce,
  type IdentityAuthState,
} from '../../components/identity/identity-auth-elements.js';
import { useIdentityBrowserRuntime } from '../../lib/identity-browser-runtime.js';
import { createPendingActionGate } from '../../lib/review-pending-action.js';

export function SignUpScreen() {
  const runtime = useIdentityBrowserRuntime();
  const [state, setState] = useState<IdentityAuthState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());

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
    setState(await submitSignUpOnce(gate.current, runtime.auth, input));
  }

  return <PasswordSignUpForm state={state} onSubmit={submit} />;
}
