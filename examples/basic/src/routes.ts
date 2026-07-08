import { defineRoutes } from 'rs-hono';
import { fakeDB } from './db.server';

// ─── Route Definitions ────────────────────────────────────────────────────
//
// This is the SINGLE source of truth for your application routing, and it
// is shared with the browser: the client bundle imports this file to know
// which component to hydrate, and the `import()` calls below are what the
// bundler code-splits into per-page chunks.
//
// The rule that keeps this safe:
//   • everything in routes.ts is PUBLIC (shipped to the browser as code)
//   • everything in *.server.ts files is PRIVATE — the bundler replaces
//     those modules with a stub in the client bundle
//
// So loaders may live inline here, as long as the data they touch comes
// from a *.server.ts import (like ./db.server below).

export const routes = defineRoutes([
    // ═══════════════════════════════════════════════════════════════════════
    // STATIC PAGES — pre-rendered to HTML at build time (SSG)
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'static',
        path: '/',
        component: () => import('./features/home/Home'),
    },

    {
        kind: 'static',
        path: '/signup',
        component: () => import('./features/signup/Signup'),
    },

    // ═══════════════════════════════════════════════════════════════════════
    // DYNAMIC PAGES — server-rendered on each request (SSR)
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'dynamic',
        path: '/profile/:id',
        component: () => import('./features/profile/Profile'),
        loader: async (c) => {
            const id = c.req.param('id')!;
            const user = await fakeDB.getUser(id);
            // A loader may return a Response to short-circuit rendering —
            // a proper 404 instead of a 500 error page (redirects work too).
            if (!user) return c.text(`User ${id} not found`, 404);
            const posts = await fakeDB.getUserPosts(id);
            return { user, posts };
        },
    },

    {
        kind: 'dynamic',
        path: '/users',
        component: () => import('./features/users/UserList'),
        loader: async () => {
            const users = await fakeDB.listUsers();
            return { users };
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // API ENDPOINTS
    //
    // For more complex APIs, create src/server.ts and export a Hono app.
    // These inline endpoints are for quick one-offs.
    // ═══════════════════════════════════════════════════════════════════════

    {
        kind: 'endpoint',
        path: '/api/quick-health',
        handler: (c) => c.json({ inline: true, uptime: process.uptime() }),
    },
]);
