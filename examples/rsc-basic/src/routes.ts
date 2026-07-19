import { defineRoutes } from 'rsc-hono';

export const routes = defineRoutes({
    routes: [
        {
            path: '/',
            component: () => import('./components/home'),
        },
        {
            path: '/signup',
            component: () => import('./components/signup'),
        },
        {
            // Pre-rendered at build time (SSG); staticPaths supplies the
            // param sets. routes.ts only runs on the server, so importing a
            // *.server module here is safe.
            path: '/docs/:slug',
            kind: 'static',
            component: () => import('./components/documentation'),
            staticPaths: async () => {
                const { fakeDB } = await import('./db.server');
                return (await fakeDB.listDocs()).map((doc) => ({ slug: doc.slug }));
            },
        },
        {
            path: '/profile/:id',
            component: () => import('./components/profile'),
        },
        {
            path: '/users',
            component: () => import('./components/user-list'),
        },
        {
            kind: 'endpoint',
            path: '/api/quick-health',
            server: () => import('./health.server'),
        },
    ],
    // Special pages — real server components, rendered through the same
    // RSC pipeline as routes (the 404 also renders for soft navigations
    // to dead links). Non-HTML clients still get plain-text responses.
    notFound: {
        component: () => import('./components/404'),
    },
    error: {
        component: () => import('./components/500'),
    },
});
