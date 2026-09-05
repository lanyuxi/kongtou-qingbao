'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  AuthCallbackStatus,
  completeSignInOnce,
  type IdentityAuthState,
} from '../../components/identity/identity-auth-elements.js';
import { useIdentityBrowserRuntime } from '../../lib/identity-browser-runtime.js';
import { sanitizeIdentityReturnPath } from '../../lib/identity-auth-session.js';
import { createPendingActionGate } from '../../lib/review-pending-action.js';

export function AuthCallbackScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const runtime = useIdentityBrowserRuntime();
  const [state, setState] = useState<IdentityAuthState>({ status: 'pending' });
  const gate = useRef(createPendingActionGate());
  const returnPath = sanitizeIdentityReturnPath(searchParams.get('next'));
  const query = searchParams.toString();

  useEffect(() => {
    if (runtime === null) return;
    let active = true;
    void completeSignInOnce(gate.current, runtime.auth, new URLSearchParams(query))
      .then((result) => {
        if (!active) return;
        setState(result);
        if (result.status === 'signed_in') router.replace(returnPath);
      });
    return () => { active = false; };
  }, [runtime, router, returnPath, query]);

  return <AuthCallbackStatus state={state} />;
}
