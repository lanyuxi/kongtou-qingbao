import { Suspense } from 'react';

import { ForgotPasswordScreen } from '../../../components/identity/forgot-password-screen.js';

export default function IdentityForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="settings-page identity-auth-page">
          <p className="identity-message">正在准备找回密码…</p>
        </main>
      }
    >
      <ForgotPasswordScreen />
    </Suspense>
  );
}
