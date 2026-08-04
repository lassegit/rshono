/**
 * `@rshono/core` — the build-time surface: route and config declaration plus the types
 * your pages and endpoints are written against. Everything here is safe to
 * import from server code; none of it pulls in runtime machinery.
 *
 * The two companion entry points are runtime-only:
 * - `@rshono/core/server` — {@link https://hono.dev | Hono} request context inside
 *   server components and actions (`getContext`, `redirect`, `notFound`), plus
 *   `onServerError` for reporting the errors the framework catches.
 * - `@rshono/core/client` — hooks and components for `'use client'` modules
 *   (`useNavigation`, `Boundary`, `ErrorBoundary`).
 *
 * @packageDocumentation
 */

export {
  defineRoutes,
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

// Hono's own `Context` and `Handler` used to be re-exported from here "for convenience". They are
// Hono's types, `hono` is a peer dependency every app already has, and importing them from two places
// only raised the question of which one is right — so an endpoint module imports them from `hono`.
