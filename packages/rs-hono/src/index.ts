/**
 * rs-hono — Ultra-minimalist SSR framework
 *
 * This entry point is ISOMORPHIC: it is imported by routes.ts, which is
 * bundled for the browser. Nothing here (or in anything it imports at
 * runtime) may touch Node APIs or server-only code. Server internals
 * live in "rs-hono/server".
 *
 * Usage:
 *   import { defineRoutes } from "rs-hono"
 *   import type { StaticRoute, DynamicRoute, EndpointRoute, PageProps } from "rs-hono"
 *   import { defineConfig } from "rs-hono/config"
 */

export {
  defineRoutes,
  type Route,
  type StaticRoute,
  type DynamicRoute,
  type EndpointRoute,
  type PageProps,
  type HTTPMethod,
} from "./router.js";

export type { RsHonoConfig } from "./config.js";

export type {
  Context,
  MiddlewareHandler,
  Env,
  Input,
} from "./router.js";
