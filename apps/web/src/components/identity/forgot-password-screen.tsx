'use client';

import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

import {
  ForgotPasswordForm,
  submitPasswordResetOnce,
  type IdentityAuthState,
} from '../../components/identity/identity-auth-elements.js';
import { useIdentityBrowserRuntime } from '../../lib/identity-browser-runtime.js';
import {
  buildPasswordResetRedirect,
  sanitizeIdentityReturnPath,
} from '../../lib/identity-auth-session.js';
import { createPendingActionGate } from '../../lib/review-pending-action.js';

export function ForgotPasswordScreen() {
  const searchParams = useSearchParams();
  const runtime = useIdentityBrowserRuntime();
  const [state, setState] = useState<IdentityAuthState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const returnPath = sanitizeIdentityReturnPath(searchParams.get('next'));

  async function submit(phone: string): Promise<void> {
    if (runtime === null) {
      setState({ status: 'failed', code: 'identity_auth_lookup_failed' });
      return;
    }
    setState({ status: 'pending' });
    setState(
      await submitPasswordResetOnce(gate.current, runtime.auth, {
        phone,
        redirectTo: buildPasswordResetRedirect(window.location.origin, returnPath),
      }),
    );
  }

  return <ForgotPasswordForm state={state} onSubmit={submit} />;
}
