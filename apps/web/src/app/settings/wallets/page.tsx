'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  WalletSettings,
  type WalletSettingsState,
} from '../../../components/identity/wallet-settings.js';
import { useIdentityBrowserRuntime } from '../../../lib/identity-browser-runtime.js';

export default function WalletSettingsPage() {
  const runtime = useIdentityBrowserRuntime();
  const [state, setState] = useState<WalletSettingsState>({ status: 'loading' });

  const reload = useCallback(async () => {
    if (runtime === null) return;
    setState({ status: 'loading' });
    const profileResult = await runtime.api.getProfile();
    if (!profileResult.ok) {
      setState(profileResult.code === 'identity_session_required'
        ? { status: 'sign_in_required' }
        : {
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
    } else {
      setState({ status: 'failed', code: 'identity_query_failed' });
    }
  }, [runtime]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <WalletSettings
      state={state}
      api={runtime?.api ?? unavailableClient}
      onReload={reload}
    />
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
