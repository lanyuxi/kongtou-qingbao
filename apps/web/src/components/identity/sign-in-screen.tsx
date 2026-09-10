'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  PasswordSignInForm,
  submitSignInOnce,
  type IdentityAuthState,
} from '../../components/identity/identity-auth-elements.js';
import { useIdentityBrowserRuntime } from '../../lib/identity-browser-runtime.js';
import { sanitizeIdentityReturnPath } from '../../lib/identity-auth-session.js';
import { createPendingActionGate } from '../../lib/review-pending-action.js';

export function SignInScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const runtime = useIdentityBrowserRuntime();
  const [state, setState] = useState<IdentityAuthState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const returnPath = sanitizeIdentityReturnPath(searchParams.get('next'));

  // Password sign-in completes in place, so the screen is responsible for
  // moving the visitor on; the magic-link flow used to be redirected by the
  // provider callback instead.
  useEffect(() => {
    if (state.status !== 'signed_in') return;
    router.replace(returnPath);
  }, [state.status, returnPath, router]);

  async function submit(phone: string, password: string): Promise<void> {
    if (runtime === null) {
      setState({ status: 'failed', code: 'identity_auth_lookup_failed' });
      return;
    }
    setState({ status: 'pending' });
    setState(await submitSignInOnce(gate.current, runtime.auth, { phone, password }));
  }

  return <PasswordSignInForm state={state} onSubmit={submit} />;
}
