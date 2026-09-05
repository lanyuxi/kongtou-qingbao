'use client';

import { useRef, useState } from 'react';

import {
  signOutOnce,
  type IdentityAuthState,
} from './identity-auth-elements.js';
import type { IdentityBrowserRuntime } from '../../lib/identity-browser-runtime.js';
import { createPendingActionGate } from '../../lib/review-pending-action.js';

export interface IdentitySignOutControl {
  readonly authState: IdentityAuthState;
  readonly signOut: () => Promise<void>;
}

/**
 * Sign-out is shared by every private settings surface. It returns to a public
 * page only after the session is actually cleared, so a failed sign-out never
 * looks like a completed one.
 */
export function useIdentitySignOut(input: {
  readonly runtime: IdentityBrowserRuntime | null;
  readonly onSignedOut: () => void;
}): IdentitySignOutControl {
  const [authState, setAuthState] = useState<IdentityAuthState>({ status: 'idle' });
  const gate = useRef(createPendingActionGate());

  return {
    authState,
    async signOut() {
      if (input.runtime === null) {
        setAuthState({ status: 'failed', code: 'identity_auth_sign_out_failed' });
        return;
      }
      setAuthState({ status: 'pending' });
      const result = await signOutOnce(gate.current, input.runtime.auth);
      setAuthState(result);
      if (result.status === 'signed_out') input.onSignedOut();
    },
  };
}
