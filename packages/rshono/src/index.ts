/**
 * `rshono` — the build-time surface: route and config declaration plus the types
 * your pages and endpoints are written against. Everything here is safe to
 * import from server code; none of it pulls in runtime machinery.
 *
 * The two companion entry points are runtime-only:
 * - `rshono/server` — {@link https://hono.dev | Hono} request context inside
 *   server components and actions (`getContext`, `redirect`, `notFound`), plus
 *   `onServerError` for reporting the errors the framework catches.
 * - `rshono/client` — hooks and components for `'use client'` modules
 *   (`useNavigation`, `Boundary`, `ErrorBoundary`, `NavigationProgress`).
 *
 * @packageDocumentation
 */

export {
  defineRoutes,
  isPageRoute,
  type EndpointRoute,
  type EndpointServerModule,
  type ErrorInfo,
  type ErrorPageProps,
  type FallbackPage,
  type HTTPMethod,
  type PageComponent,
  type PageProps,
  type PageRoute,
  type PathParams,
  type Route,
  type RouteConfig,
} from './router.js';

export { defineConfig, type RSHonoConfig, type RspackHookContext } from './config.js';

export type { DeployTarget } from './deploy/contract.js';

/**
 * Re-exported from Hono for convenience, so an endpoint module can type its
 * `handler` without depending on `hono` directly.
 */
export type { Context, Handler } from 'hono';
