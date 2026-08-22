'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface NavItem {
  readonly label: string;
  readonly href: string | null;
}

const primaryNav: readonly NavItem[] = [
  { label: '总览', href: '/' },
  { label: '机会列表', href: '/opportunities' },
  { label: '项目库', href: null },
  { label: '情报', href: null },
  { label: '任务', href: null },
  { label: '关注列表', href: null },
];

export function AppShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();

  return <PublicShellBoundary pathname={pathname}>{children}</PublicShellBoundary>;
}

export function PublicShellBoundary({
  pathname,
  children,
}: {
  readonly pathname: string;
  readonly children: ReactNode;
}) {
  if (pathname === '/review' || pathname.startsWith('/review/')) return children;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-mark">AI</span>
          <span className="sidebar-logo-name">空投情报站</span>
        </div>
        <div className="sidebar-section-label">工作台</div>
        <nav className="sidebar-nav">
          {primaryNav.map((item) =>
            item.href === null ? (
              <span key={item.label} className="sidebar-link disabled">
                {item.label}
                <span className="sidebar-soon">即将上线</span>
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
        <div className="sidebar-footer">证据导向情报 · MVP</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-search">搜索项目、公链、代币…</div>
          <div className="topbar-status">
            <span>
              <span className="topbar-dot" />
              已连接远程数据源
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
