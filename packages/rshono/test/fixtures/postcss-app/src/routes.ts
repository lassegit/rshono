import { defineRoutes } from 'rshono';

export const routes = defineRoutes([{ path: '/', component: () => import('./pages/home') }]);
