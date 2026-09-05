'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { IdentitySessionBar } from '../../../components/identity/identity-auth-elements.js';
import { useIdentitySignOut } from '../../../components/identity/identity-sign-out.js';
import {
  WalletSettings,
  type WalletSettingsState,
} from '../../../components/identity/wallet-settings.js';
import { buildSignInPath } from '../../../lib/identity-auth-session.js';
import { useIdentityBrowserRuntime } from '../../../lib/identity-browser-runtime.js';

const returnPath = '/settings/wallets';

export default function WalletSettingsPage() {
  const runtime = useIdentityBrowserRuntime();
  const router = useRouter();
  const [state, setState] = useState<WalletSettingsState>({ status: 'loading' });
  const { authState, signOut } = useIdentitySignOut({
    runtime,
    onSignedOut: () => router.replace('/'),
  });

  const reload = useCallback(async () => {
    if (runtime === null) return;
    setState({ status: 'loading' });
    const profileResult = await runtime.api.getProfile();
    if (!profileResult.ok) {
      if (profileResult.code === 'identity_session_required') {
        setState({ status: 'sign_in_required' });
        router.replace(buildSignInPath(returnPath));
        return;
      }
      setState({
        status: 'failed',
        code: profileResult.code === 'identity_profile_not_found'
          ? 'identity_profile_not_found'
          : 'identity_query_failed',
      });
      return;
    }
    const walletsResult = await runtime.api.listWalletAddresses();
    if (walletsResult.ok) {
      setState({ status: 'ready', profile: profileResult.data, wallets: walletsResult.data });
    } else if (walletsResult.code === 'identity_session_required') {
      setState({ status: 'sign_in_required' });
      router.replace(buildSignInPath(returnPath));
    } else {
      setState({ status: 'failed', code: 'identity_query_failed' });
    }
  }, [runtime, router]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <>
      {state.status === 'ready' ? (
        <IdentitySessionBar state={authState} onSignOut={signOut} />
      ) : null}
      <WalletSettings
        state={state}
        api={runtime?.api ?? unavailableClient}
        onReload={reload}
      />
    </>
  );
}

const unavailableClient = {
  getProfile: async () => ({ ok: false as const, code: 'identity_session_required' as const }),
  listWalletAddresses: async () => ({ ok: false as const, code: 'identity_session_required' as const }),
  updateProfile: async () => ({ ok: false as const, code: 'identity_session_required' as const }),
  addWalletAddress: async () => ({ ok: false as const, code: 'identity_session_required' as const }),
  setWalletAddressVisibility: async () => ({ ok: false as const, code: 'identity_session_required' as const }),
  removeWalletAddress: async () => ({ ok: false as const, code: 'identity_session_required' as const }),
};
