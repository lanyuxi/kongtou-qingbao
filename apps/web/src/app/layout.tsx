import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '../components/app-shell.js';

import './globals.css';

export const metadata: Metadata = {
  title: '空投情报站',
  description: '证据导向的公开参与机会情报平台。',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
