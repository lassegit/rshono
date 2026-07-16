/**
 * Route Definition
 *
 * `defineRoutes` is the single source of truth for all application routes.
 *
 * Unlike a classic SSR framework there are no loaders: pages are React
 * Server Components, so they fetch their own data with plain async/await
 * and can import server-only modules directly. routes.ts itself is only
 * ever evaluated on the server (the browser receives pages as serialized
 * RSC payloads), so referencing `*.server.*` modules from here is safe.
 *
 * Every page module default-exports a server component taking
 * `PageProps`. Under the hood each page carries the `'use server-entry'`
 * directive (Rspack attaches the page's client JS/CSS assets to the
 * component, enabling per-page code splitting) — the framework injects
 * it automatically for components referenced with the inline
 * `component: () => import('…')` thunk form; only pages wired up some
 * other way need to write the directive themselves.
 *
 * Fully interactive pages are a thin server component wrapping a
 * `'use client'` component.
 */
import type { Handler } from 'hono';
import type { ParamKeys, ParamKeyToRecord } from 'hono/types';
import type { ReactNode } from 'react';

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

// ─── Path params ──────────────────────────────────────────────────────────

/**
 * The params object for a route pattern, derived with Hono's own
 * template-literal machinery so `:id`, `:id?` and `:id{[0-9]+}` behave
 * exactly like `c.req.param()`.
 */
export type PathParams<P extends string> = ParamKeys<P> extends never
    ? Record<string, never>
    : Simplify<UnionToIntersection<ParamKeyToRecord<ParamKeys<P>>>>;

// ─── Page Props ───────────────────────────────────────────────────────────

/**
 * Props every page component receives. Generic over the route pattern:
 * `PageProps<'/profile/:id'>` types `params` as `{ id: string }`. Bare
 * `PageProps` keeps the untyped `Record<string, string>` params.
 */
export interface PageProps<Path extends string = string> {
    params: string extends Path ? Record<string, string> : PathParams<Path>;
    /** Full request URL. */
    url: string;
}

/** A page component: a (possibly async) React Server Component. */
export type PageComponent<P = any> = (props: P) => ReactNode | Promise<ReactNode>;

// ─── Route Types ──────────────────────────────────────────────────────────

/** What an endpoint route's `*.server.*` module must export. */
export interface EndpointServerModule {
    handler: Handler;
}

export interface PageRoute {
    /** Hono path pattern, e.g. '/docs/:slug'. */
    path: string;
    /**
     * Lazy page import — write it as an inline `() => import('…')` thunk
     * so the framework can inject 'use server-entry' automatically. The
     * module must default-export a server component.
     */
    component: () => Promise<{ default: PageComponent }>;
    /**
     * 'static' pages are pre-rendered to HTML at build time (SSG) and
     * served from disk in production. Default: 'dynamic' (SSR per request).
     */
    kind?: 'static' | 'dynamic';
    /**
     * For `kind: 'static'` routes with params (e.g. '/docs/:slug'): the
     * param sets to prerender at build time. Requests for paths not
     * returned here fall back to per-request SSR.
     */
    staticPaths?: () => Array<Record<string, string>> | Promise<Array<Record<string, string>>>;
}

/**
 * An API endpoint. The handler lives in a `*.server.*` module (exported
 * as `handler`). For more than a couple of endpoints, use the
 * src/index.server.ts Hono sub-app instead.
 */
export interface EndpointRoute {
    kind: 'endpoint';
    path: string;
    method?: HTTPMethod;
    server: () => Promise<EndpointServerModule>;
}

export type HTTPMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'all';

export type Route = PageRoute | EndpointRoute;

export function isPageRoute(route: Route): route is PageRoute {
    return route.kind !== 'endpoint';
}

// ─── defineRoutes ─────────────────────────────────────────────────────────

/**
 * Compile-time validation of one route entry: the page component's props
 * must be satisfied by `PageProps<path>`. On failure the offending
 * property's type becomes an error-message string literal.
 */
type ValidateRoute<R> = R extends {
    path: infer P extends string;
    component: () => Promise<{ default: PageComponent<infer CP> }>;
}
    ? [PageProps<P>] extends [CP]
        ? R
        : R & { component: `component props are not satisfied by PageProps<'${P}'>` }
    : R;

/**
 * Define all application routes — the single source of truth.
 *
 * @example
 * export const routes = defineRoutes([
 *   { path: '/', component: () => import('./components/home') },
 *   { path: '/docs/:slug', kind: 'static', component: () => import('./components/documentation') },
 *   { kind: 'endpoint', path: '/api/health', server: () => import('./health.server') },
 * ]);
 */
export function defineRoutes<const TRoutes extends readonly Route[]>(userRoutes: TRoutes & { [K in keyof TRoutes]: ValidateRoute<TRoutes[K]> }): TRoutes {
    return userRoutes;
}
