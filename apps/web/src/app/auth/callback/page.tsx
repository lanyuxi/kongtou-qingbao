import { Suspense } from 'react';

import { AuthCallbackScreen } from '../../../components/identity/auth-callback-screen.js';

export default function IdentityCallbackPage() {
  return (
    <Suspense
      fallback={(
        <main className="settings-page identity-auth-page">
          <p className="identity-message">正在完成登录…</p>
        </main>
      )}
    >
      <AuthCallbackScreen />
    </Suspense>
  );
}
