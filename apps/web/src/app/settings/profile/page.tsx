'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  ProfileSettings,
  type ProfileSettingsState,
} from '../../../components/identity/profile-settings.js';
import { useIdentityBrowserRuntime } from '../../../lib/identity-browser-runtime.js';

export default function ProfileSettingsPage() {
  const runtime = useIdentityBrowserRuntime();
  const [state, setState] = useState<ProfileSettingsState>({ status: 'loading' });

  const reload = useCallback(async () => {
    if (runtime === null) return;
    setState({ status: 'loading' });
    const result = await runtime.api.getProfile();
    if (result.ok) {
      setState({ status: 'ready', profile: result.data });
    } else if (result.code === 'identity_session_required') {
      setState({ status: 'sign_in_required' });
    } else {
      setState({
        status: 'failed',
        code: result.code === 'identity_profile_not_found'
          ? 'identity_profile_not_found'
          : 'identity_query_failed',
      });
    }
  }, [runtime]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <ProfileSettings
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
