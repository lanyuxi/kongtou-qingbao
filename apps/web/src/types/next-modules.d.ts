// Minimal type shims for Next.js client entry points whose package exports
// are not resolvable under TypeScript NodeNext module resolution. Runtime
// resolution is handled by Next.js/Turbopack itself; these declarations only
// satisfy `tsc --noEmit`. If the project later moves to moduleResolution
// "bundler", delete this file.

declare module 'next/link' {
  import type { AnchorHTMLAttributes, ReactNode } from 'react';

  export interface LinkProps
    extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
    href: string;
    children?: ReactNode;
  }

  const Link: (props: LinkProps) => ReactNode;
  export default Link;
}

declare module 'next/navigation' {
  export interface AppRouterInstance {
    replace(href: string): void;
  }

  export interface ReadonlyURLSearchParams {
    get(name: string): string | null;
    toString(): string;
  }

  export function usePathname(): string;
  export function useRouter(): AppRouterInstance;
  export function useSearchParams(): ReadonlyURLSearchParams;
  export function notFound(): never;
}
