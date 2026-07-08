import { defineRoutes } from "rs-hono";

/**
 * Single source of truth — all routes for the application.
 *
 * - kind: 'static'    → Pre-rendered at build time (SSG).
 * - kind: 'dynamic'   → Server-rendered on each request (SSR).
 * - kind: 'endpoint'  → Quick API handler (inline). For complex APIs,
 *                        create src/server.ts with a Hono app instead.
 *
 * Each page route can have an optional `loader` that runs on the server
 * before rendering. Data returned from the loader is passed as props.
 */
export const routes = defineRoutes([
  {
    kind: "static",
    path: "/",
    component: () => import("./app/page"),
  },
  {
    kind: "static",
    path: "/about",
    component: () => import("./app/about/page"),
  },
  {
    kind: "endpoint",
    path: "/api/hello",
    handler: (c) => {
      return c.json({
        message: "Hello from rs-hono!",
        timestamp: Date.now(),
      });
    },
  },
]);
