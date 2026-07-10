/**
 * Route Definition
 *
 * `defineRoutes` is the single source of truth for all application routes.
 * (Loader return types do not flow into component props yet — a per-route
 * `route()` helper is planned; see the README status section.)
 */
import type { Context, Handler } from 'hono';
import type { ComponentType } from 'react';

// ─── Page Props ───────────────────────────────────────────────────────────

export interface PageProps {
    params: Record<string, string>;
    url: string;
}

// ─── Route Types ──────────────────────────────────────────────────────────

interface PageRouteBase<TLoaderData> {
    path: string;
    component: () => Promise<{
        default: ComponentType<PageProps & TLoaderData>;
    }>;
    /**
     * Runs on the server before rendering; the returned object is passed
     * to the component as props. Return a `Response` instead to
     * short-circuit rendering entirely (404, redirect, ...).
     */
    loader?: (c: Context) => Promise<TLoaderData | Response>;
}

/**
 * A static page — pre-rendered at build time (SSG).
 */
export interface StaticRoute<TLoaderData = Record<string, unknown>> extends PageRouteBase<TLoaderData> {
    kind: 'static';
    /**
     * Required for paths with params (e.g. "/docs/:slug"): the param
     * sets to prerender. Each set is interpolated into `path` and the
     * resulting page rendered to HTML at build time. Requests for paths
     * not returned here fall back to per-request SSR.
     *
     * Runs on the server only — like loaders, its data must come from
     * `*.server` imports.
     */
    staticPaths?: () => Promise<Array<Record<string, string>>>;
}

/**
 * A dynamic page — server-rendered on each request (SSR).
 */
export interface DynamicRoute<TLoaderData = Record<string, unknown>> extends PageRouteBase<TLoaderData> {
    kind: 'dynamic';
}

/**
 * An API endpoint — pure Hono handler.
 */
export interface EndpointRoute {
    kind: 'endpoint';
    path: string;
    method?: HTTPMethod;
    handler: Handler;
}

export type HTTPMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'all';

export type PageRoute = StaticRoute | DynamicRoute;
export type Route = PageRoute | EndpointRoute;

export function isPageRoute(route: Route): route is PageRoute {
    return route.kind === 'static' || route.kind === 'dynamic';
}

// ─── defineRoutes ─────────────────────────────────────────────────────────

/**
 * Define all application routes — the single source of truth.
 *
 * @example
 * export const routes = defineRoutes([
 *   {
 *     kind: 'dynamic',
 *     path: '/profile/:id',
 *     component: () => import('./features/profile/Profile'),
 *     loader: async (c) => {
 *       const user = await db.getUser(c.req.param('id'));
 *       if (!user) return c.notFound();
 *       return { user };
 *     },
 *   },
 *   {
 *     kind: 'endpoint',
 *     path: '/api/health',
 *     handler: (c) => c.json({ ok: true }),
 *   },
 * ]);
 */
export function defineRoutes<const TRoutes extends Route[]>(userRoutes: TRoutes): TRoutes {
    return userRoutes;
}
