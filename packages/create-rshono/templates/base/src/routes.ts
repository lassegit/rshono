import { defineRoutes } from 'rshono';

/**
 * The one file rshono requires. It only ever runs on the server, so importing server-only modules from
 * it — inside `staticPaths`, say — is safe.
 *
 * Write each page as the inline `component: () => import('…')` thunk you see below: the build detects
 * that exact form and attaches the page's own JS and CSS to it, which is what makes assets code-split
 * per route.
 */
export const routes = defineRoutes({
  routes: [
    { path: '/', component: () => import('./components/home') },

    // A page with params. `PageProps<'/posts/:slug'>` types `params.slug` for the component.
    // { path: '/posts/:slug', component: () => import('./components/post') },

    // Prerendered at build time, one file per param set, served from disk.
    // {
    //   path: '/docs/:slug',
    //   render: 'static',
    //   component: () => import('./components/doc'),
    //   staticPaths: async () => [{ slug: 'getting-started' }],
    // },

    // A raw Hono handler instead of a page — for anything that isn't HTML. The other place for these
    // is src/server.ts, which is the better home for a group of them.
    // { type: 'endpoint', path: '/api/posts', server: () => import('./api/posts') },
  ],
  notFound: { component: () => import('./components/404') },
  error: { component: () => import('./components/500') },
});
