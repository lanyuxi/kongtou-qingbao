import { Suspense } from 'react';

import { SignInScreen } from '../../../components/identity/sign-in-screen.js';

export default function IdentitySignInPage() {
  return (
    <Suspense
      fallback={(
        <main className="settings-page identity-auth-page">
          <p className="identity-message">正在准备邮箱登录…</p>
        </main>
      )}
    >
      <SignInScreen />
    </Suspense>
  );
}
