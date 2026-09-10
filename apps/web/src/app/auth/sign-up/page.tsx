import { Suspense } from 'react';

import { SignUpScreen } from '../../../components/identity/sign-up-screen.js';

export default function IdentitySignUpPage() {
  return (
    <Suspense
      fallback={
        <main className="settings-page identity-auth-page">
          <p className="identity-message">正在准备注册…</p>
        </main>
      }
    >
      <SignUpScreen />
    </Suspense>
  );
}
