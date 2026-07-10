import { defineRoutes } from "rs-hono";

/**
 * Single source of truth — all routes for the application.
 *
 * - kind: 'static'    → Pre-rendered at build time (SSG).
 * - kind: 'dynamic'   → Server-rendered on each request (SSR).
 * - kind: 'endpoint'  → Quick API handler. For complex APIs, create
 *                        src/server.ts with a Hono app instead.
 *
 * This file is shared with the browser (it drives hydration and code
 * splitting), so it contains NO server code — only route data:
 *
 * - `component:` → the page module (shipped to the browser)
 * - `server:`    → the route's *.server.ts module: a `loader` that runs
 *   before rendering (its data becomes the component's props, inferred
 *   via `LoaderProps<typeof loader>`), an optional `staticPaths`, or an
 *   endpoint `handler`. *.server modules are stripped from the client
 *   bundle, so server code and secrets never ship.
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
    server: () => import("./hello.server"),
  },
]);
