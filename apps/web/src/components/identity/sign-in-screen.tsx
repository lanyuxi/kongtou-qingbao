'use client';

import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

import {
  MagicLinkForm,
  submitMagicLinkRequestOnce,
  type IdentityAuthState,
} from '../../components/identity/identity-auth-elements.js';
import { useIdentityBrowserRuntime } from '../../lib/identity-browser-runtime.js';
import {
  buildMagicLinkRedirect,
  sanitizeIdentityReturnPath,
} from '../../lib/identity-auth-session.js';
import { createPendingActionGate } from '../../lib/review-pending-action.js';

export function SignInScreen() {
  const searchParams = useSearchParams();
  const runtime = useIdentityBrowserRuntime();
  const [state, setState] = useState<IdentityAuthState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());
  const returnPath = sanitizeIdentityReturnPath(searchParams.get('next'));

  async function submit(email: string): Promise<void> {
    if (runtime === null) {
      setState({ status: 'failed', code: 'identity_auth_link_failed' });
      return;
    }
    setState({ status: 'pending' });
    setState(await submitMagicLinkRequestOnce(gate.current, runtime.auth, {
      email,
      redirectTo: buildMagicLinkRedirect(window.location.origin, returnPath),
    }));
  }

  return <MagicLinkForm state={state} onSubmit={(email) => submit(email)} />;
}
