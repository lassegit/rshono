'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Imperative navigation actions, reached as `useNavigation().router`.
 *
 * `push` / `replace` / `refresh` are **soft** navigations: the new page's flight
 * payload is fetched and applied in place, so client component state outside the
 * changed subtree survives. Off-site or non-HTTP hrefs fall back to a full load.
 */
export interface Router {
  /** Navigates to `href` and pushes a new history entry. */
  push(href: string): void;
  /** Navigates to `href`, replacing the current history entry instead of adding one. */
  replace(href: string): void;
  /** Goes back one history entry — `history.back()`. */
  back(): void;
  /** Goes forward one history entry — `history.forward()`. */
  forward(): void;
  /** Re-fetches the current route from the server, re-running its server components. */
  refresh(): void;
  /** `true` while a soft navigation is in flight — use it to disable controls or show a spinner. */
  pending: boolean;
}

/** The current location plus the {@link Router}, as returned by {@link useNavigation}. */
export interface Navigation {
  /**
   * The full current {@link URL} — read `url.pathname`, `url.searchParams` and the
   * rest off it. A fresh instance per navigation, so mutating it affects nothing
   * else; it is not written back to the address bar either.
   */
  url: URL;
  /** Matched route params for the current page, e.g. `{ id: '42' }` for `/profile/:id`. */
  params: Record<string, string>;
  /** Imperative navigation actions and the `pending` flag. */
  router: Router;
}

const noop = () => {};

const defaultRouter: Router = { push: noop, replace: noop, back: noop, forward: noop, refresh: noop, pending: false };

/**
 * Carries the live {@link Router} implementation from the hydration runtime down
 * to {@link RouterProvider}. Framework internal — read the router through
 * {@link useNavigation} instead.
 *
 * @internal
 */
export const RouterContext = createContext<Router>(defaultRouter);

const NavigationContext = createContext<Navigation | null>(null);

/**
 * Publishes the per-render location and params so {@link useNavigation} can read
 * them. Framework internal — the RSC entry wraps every page in one.
 *
 * @internal
 */
export function RouterProvider({ href, params, children }: { href: string; params: Record<string, string>; children: ReactNode }) {
  const router = useContext(RouterContext);
  const value = useMemo<Navigation>(() => ({ url: new URL(href), params, router }), [href, params, router]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

/**
 * Reactive access to the current URL and programmatic navigation, in one hook.
 *
 * Call it from a `'use client'` component. The location fields (`url` and
 * `params`) are computed on the server and travel in the flight payload, so they
 * are correct during SSR — no hydration flicker — and update automatically on
 * every navigation. The `router` sub-object holds the imperative actions plus a
 * `pending` flag that is `true` while a client navigation is in flight.
 *
 * Hooks can't run in a server component; read the same URL data there from
 * `getContext()` (`@rshono/core/server`) instead.
 *
 * @example
 * ```tsx
 * 'use client';
 * import { useNavigation } from '@rshono/core/client';
 *
 * export function NextPage() {
 *   const { url, router } = useNavigation();
 *   const page = Number(url.searchParams.get('page') ?? '1');
 *   return (
 *     <button disabled={router.pending} onClick={() => router.push(`${url.pathname}?page=${page + 1}`)}>
 *       Next {router.pending ? '…' : ''}
 *     </button>
 *   );
 * }
 * ```
 *
 * @returns The current {@link Navigation}: `url` and `params`, plus `router`
 * ({@link Router}) with `push` / `replace` / `back` / `forward` / `refresh` /
 * `pending`.
 * @throws If called outside a page's React tree, where there is no navigation
 *   context to read.
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
 * import { NavigationProgress } from '@rshono/core/client';
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
