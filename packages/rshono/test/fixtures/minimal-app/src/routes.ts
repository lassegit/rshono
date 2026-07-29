import { defineRoutes } from '@rshono/core';

// Deliberately *not* an inline `component: () => import('…')` thunk: routed through a variable so
// the build cannot detect it and inject 'use server-entry'. The page writes the directive itself,
// which is the documented escape hatch — this route is what proves it still works.
const manualPage = () => import('./pages/manual');

// The array shorthand, with no `notFound` and no `error` page: everything optional left out.
export const routes = defineRoutes([
  { path: '/', component: () => import('./pages/home') },
  { path: '/manual', component: manualPage },
  { path: '/files/*', component: () => import('./pages/wildcard') },
  { path: '/boom', component: () => import('./pages/boom') },
]);
