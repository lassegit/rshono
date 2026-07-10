import { defineRoutes } from 'rs-hono';

// ─── Route Definitions ────────────────────────────────────────────────────
//
// This is the SINGLE source of truth for your application routing, and it
// is shared with the browser: the client bundle imports this file to know
// which component to hydrate, and the `component: () => import(...)` calls
// below are what the bundler code-splits into per-page chunks.
//
// That is why routes.ts contains NO server code — only route data:
//   • `component:` → the page module (PUBLIC, shipped to the browser)
//   • `server:`    → the route's *.server module (loader, staticPaths,
//     endpoint handler) — PRIVATE. The bundler replaces *.server modules
//     with a throwing stub in the client bundle, so server code and the
//     secrets it touches physically never ship.
//
// defineRoutes validates at compile time that each route's path matches
// the pattern its loader was declared with, and that the component's
// props are satisfied by PageProps + the loader's data.

export const routes = defineRoutes([
    // ═══════════════════════════════════════════════════════════════════════
    // STATIC PAGES — pre-rendered to HTML at build time (SSG)
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'static',
        path: '/',
        component: () => import('./features/Home'),
    },

    {
        kind: 'static',
        path: '/signup',
        component: () => import('./features/Signup'),
    },

    // Static + params: staticPaths() in Doc.server.ts lists the pages to
    // pre-render at build time. Slugs it doesn't return fall back to SSR
    // per request.
    {
        kind: 'static',
        path: '/docs/:slug',
        component: () => import('./features/Doc'),
        server: () => import('./features/Doc.server'),
    },

    // ═══════════════════════════════════════════════════════════════════════
    // DYNAMIC PAGES — server-rendered on each request (SSR)
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'dynamic',
        path: '/profile/:id',
        component: () => import('./features/Profile'),
        server: () => import('./features/Profile.server'),
    },

    {
        kind: 'dynamic',
        path: '/users',
        component: () => import('./features/UserList'),
        server: () => import('./features/UserList.server'),
    },

    // ═══════════════════════════════════════════════════════════════════════
    // API ENDPOINTS
    //
    // The handler lives in a *.server module (exported as `handler`).
    // For more complex APIs, create src/server.ts and export a Hono app.
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'endpoint',
        path: '/api/quick-health',
        server: () => import('./health.server'),
    },
]);
