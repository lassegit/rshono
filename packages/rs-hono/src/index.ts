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
    isPageRoute,
    type DynamicRoute,
    type EndpointRoute,
    type HTTPMethod,
    type PageProps,
    type PageRoute,
    type Route,
    type StaticRoute,
} from './router.js';

export type { RsHonoConfig } from './config.js';

// Hono types, re-exported so routes.ts needs no direct hono import.
export type { Context, Env, Handler, Input, MiddlewareHandler } from 'hono';
