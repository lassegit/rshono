'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface Router {
  push(href: string): void;
  replace(href: string): void;
  back(): void;
  forward(): void;
  refresh(): void;
  pending: boolean;
}

export interface Navigation {
  url: URL;
  pathname: string;
  searchParams: URLSearchParams;
  params: Record<string, string>;
  router: Router;
}

const noop = () => {};

const defaultRouter: Router = { push: noop, replace: noop, back: noop, forward: noop, refresh: noop, pending: false };

export const NavRuntimeContext = createContext<Router>(defaultRouter);

const NavigationContext = createContext<Navigation | null>(null);

export function RouterProvider({ href, params, children }: { href: string; params: Record<string, string>; children: ReactNode }) {
  const router = useContext(NavRuntimeContext);
  const value = useMemo<Navigation>(() => {
    const url = new URL(href);
    return { url, pathname: url.pathname, searchParams: url.searchParams, params, router };
  }, [href, params, router]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

/**
 * Reactive access to the current URL and programmatic navigation, in one hook.
 *
 * Call it from a `'use client'` component. The location fields (`url`,
 * `pathname`, `searchParams`, `params`) are computed on the server and travel
 * in the flight payload, so they are correct during SSR — no hydration flicker
 * — and update automatically on every navigation. The `router` sub-object holds
 * the imperative actions plus a `pending` flag that is `true` while a client
 * navigation is in flight.
 *
 * Hooks can't run in a server component; read the same URL data there from
 * `getContext()` (`rshono/server`) instead.
 *
 * @example
 * ```tsx
 * 'use client';
 * import { useNavigation } from 'rshono/client';
 *
 * export function NextPage() {
 *   const nav = useNavigation();
 *   const page = Number(nav.searchParams.get('page') ?? '1');
 *   return (
 *     <button disabled={nav.router.pending} onClick={() => nav.router.push(`${nav.pathname}?page=${page + 1}`)}>
 *       Next {nav.router.pending ? '…' : ''}
 *     </button>
 *   );
 * }
 * ```
 *
 * @returns The current {@link Navigation}: `url` / `pathname` / `searchParams` /
 * `params`, plus `router` ({@link Router}) with `push` / `replace` / `back` /
 * `forward` / `refresh` / `pending`.
 *  (@keep)
 */
export function useNavigation(): Navigation {
  const value = useContext(NavigationContext);
  if (!value) {
    throw new Error(
      "[rshono] useNavigation() must be called inside a 'use client' component rendered by a page. In a server component, read the URL from getContext() instead.",
    );
  }
  return value;
}
