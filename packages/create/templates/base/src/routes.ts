import { defineRoutes } from '@rshono/core';

export const routes = defineRoutes({
  routes: [{ path: '/', component: () => import('./components/home') }],
  notFound: { component: () => import('./components/404') },
  error: { component: () => import('./components/500') },
});
