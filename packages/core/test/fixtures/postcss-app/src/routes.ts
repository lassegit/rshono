import { defineRoutes } from '@rshono/core';

export const routes = defineRoutes([{ path: '/', component: () => import('./pages/home') }]);
