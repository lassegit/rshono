import { defineRoutes } from '@rshono/core';

export const routes = defineRoutes({
  routes: [
    // APP_SPEC.md: prerendered at build time, served from disk.
    { path: '/', render: 'static', component: () => import('./components/home') },
    // Dynamic by default — re-rendered per request.
    { path: '/ssr', component: () => import('./components/ssr') },
    { path: '/interactive', component: () => import('./components/interactive') },
    { type: 'endpoint', path: '/api/health', server: () => import('./health') },
  ],
});
