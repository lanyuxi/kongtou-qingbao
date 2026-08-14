import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '../components/app-shell.js';

import './globals.css';

export const metadata: Metadata = {
  title: 'Airdrop Intelligence OS',
  description: 'Evidence-oriented public participation intelligence.'
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
