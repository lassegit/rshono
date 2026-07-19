/**
 * rsc-hono — public API.
 *
 * Everything an application imports comes from here: the route manifest
 * builder and its types. Endpoint handlers and the optional
 * src/index.server.ts sub-app use Hono's own types (`Handler` is
 * re-exported for convenience).
 */
export {
    defineRoutes,
    isPageRoute,
    type EndpointRoute,
    type EndpointServerModule,
    type ErrorInfo,
    type ErrorPageProps,
    type HTTPMethod,
    type PageComponent,
    type PageProps,
    type PageRoute,
    type PathParams,
    type Route,
    type RouteConfig,
    type SpecialPage,
} from './router.js';

export type { Context, Handler } from 'hono';
