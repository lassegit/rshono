/**
 * `@rshono/core` — the build-time surface: route and config declaration plus the types
 * your pages and endpoints are written against. Everything here is safe to
 * import from server code; none of it pulls in runtime machinery.
 *
 * The two companion entry points are runtime-only:
 * - `@rshono/core/server` — {@link https://hono.dev | Hono} request context inside
 *   server components and actions (`getRequestContext`, `redirect`, `notFound`), plus
 *   `onServerError` for reporting the errors the framework catches.
 * - `@rshono/core/client` — hooks and components for `'use client'` modules
 *   (`useNavigation`, `AsyncBoundary`, `CatchBoundary`).
 *
 * @see {@link https://www.rshono.com/docs/api | Docs — API reference}
 *
 * @packageDocumentation
 */

export {
  defineRoutes,
  type EndpointRoute,
  type EndpointServerModule,
  type ErrorPageInfo,
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

export { defineConfig, type RshonoConfig, type RspackHookContext } from './config.js';

export type { DeployTarget } from './deploy/contract.js';

// Hono's `Context` and `Handler` are deliberately not re-exported: `hono` is a peer dependency every
// app already has, so an endpoint module imports them from there rather than choosing between two
// spellings of the same type.
