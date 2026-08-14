'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface NavItem {
  readonly label: string;
  readonly href: string | null;
}

const primaryNav: readonly NavItem[] = [
  { label: 'Overview', href: '/' },
  { label: 'Opportunities', href: '/opportunities' },
  { label: 'Projects', href: null },
  { label: 'Intelligence', href: null },
  { label: 'Tasks', href: null },
  { label: 'Watchlist', href: null },
];

export function AppShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-mark">AI</span>
          <span className="sidebar-logo-name">Airdrop Intelligence</span>
        </div>
        <div className="sidebar-section-label">Workspace</div>
        <nav className="sidebar-nav">
          {primaryNav.map((item) =>
            item.href === null ? (
              <span key={item.label} className="sidebar-link disabled">
                {item.label}
                <span className="sidebar-soon">soon</span>
              </span>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className={`sidebar-link${isActive(pathname, item.href) ? ' active' : ''}`}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="sidebar-footer">Evidence-oriented intelligence · MVP</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-search">Search projects, chains, tokens…</div>
          <div className="topbar-status">
            <span>
              <span className="topbar-dot" />
              Synced via remote
            </span>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
