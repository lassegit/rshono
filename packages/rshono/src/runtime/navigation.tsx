'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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

export interface NavigationProgressProps {
  /** Bar color. Defaults to a neutral blue. */
  color?: string;
  /** Bar height in pixels. Defaults to `3`. */
  height?: number;
}

/**
 * An opt-in top progress bar that appears while a client navigation is in
 * flight (driven by {@link Router.pending}). Drop one instance in your root
 * layout; it renders nothing on the server and stays invisible until the first
 * soft navigation, so there's no hydration flicker.
 *
 * @example
 * ```tsx
 * import { NavigationProgress } from 'rshono/client';
 *
 * // in your layout, once:
 * <body>
 *   <NavigationProgress />
 *   {children}
 * </body>
 * ```
 */
export function NavigationProgress({ color = '#3b82f6', height = 3 }: NavigationProgressProps = {}): ReactNode {
  const { router } = useNavigation();
  const [bar, setBar] = useState({ width: 0, opacity: 0 });

  useEffect(() => {
    if (router.pending) {
      // Jump in, then creep toward — but never reach — the end while we wait.
      setBar({ width: 15, opacity: 1 });
      const ramp = setTimeout(() => setBar({ width: 85, opacity: 1 }), 80);
      return () => clearTimeout(ramp);
    }
    // Done: snap to full, then fade out. (No-op if it was never shown.)
    setBar((b) => (b.opacity === 0 ? b : { width: 100, opacity: 1 }));
    const hide = setTimeout(() => setBar({ width: 0, opacity: 0 }), 220);
    return () => clearTimeout(hide);
  }, [router.pending]);

  return (
    <div
      data-rshono-progress=""
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height,
        width: `${bar.width}%`,
        opacity: bar.opacity,
        background: color,
        zIndex: 2147483647,
        pointerEvents: 'none',
        transition: 'width 200ms ease-out, opacity 200ms ease-out',
      }}
    />
  );
}
