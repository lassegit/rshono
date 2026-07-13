/**
 * Route Definition
 *
 * `defineRoutes` is the single source of truth for all application routes.
 *
 * routes.ts is shared with the browser (it is the hydration manifest and
 * its `import()` calls are the code-split points), so it must contain NO
 * server code. Loaders, staticPaths and endpoint handlers live in
 * co-located `*.server.*` modules referenced via a lazy `server:` thunk —
 * the bundler physically replaces those modules with a throwing stub in
 * the client bundle, so server code never ships.
 *
 * Loader → component props inference: declare the loader with
 * `defineLoader(path, fn)` in the server module, then type the component
 * with `LoaderProps<typeof loader>` via a type-only import. `defineRoutes`
 * validates (at compile time) that the route's path matches the loader's
 * declared pattern and that the component's props are satisfied by
 * `PageProps` + the loader's data.
 */
import type { Context, Env, Handler } from 'hono';
import type { ParamKeys, ParamKeyToRecord } from 'hono/types';
import type { ComponentType } from 'react';

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
    url: string;
}

// ─── Loaders (defined in *.server modules) ────────────────────────────────

/**
 * A loader declared with `defineLoader`. The path pattern is carried in
 * the type so `defineRoutes` can detect drift between the route's `path`
 * and the pattern the loader was written against.
 */
export type Loader<Path extends string, TData> = ((c: Context<Env, Path>) => Promise<TData>) & { readonly path: Path };

/**
 * Declare a page loader inside a `*.server.*` module. The path pattern
 * types `c` — `c.req.param('id')` is `string`, not `string | undefined` —
 * and is validated against the route's `path` by `defineRoutes`.
 *
 * Runs on the server before rendering; the resolved object is passed to
 * the component as props. Return a `Response` instead to short-circuit
 * rendering entirely (404, redirect, ...).
 *
 * @example
 * // features/Profile.server.ts
 * export const loader = defineLoader('/profile/:id', async (c) => {
 *   const user = await db.getUser(c.req.param('id'));
 *   if (!user) return c.notFound();
 *   return { user };
 * });
 */
export function defineLoader<const Path extends string, TData>(path: Path, fn: (c: Context<Env, Path>) => Promise<TData>): Loader<Path, TData> {
    return Object.assign(fn, { path } as const);
}

/** The data a loader resolves to, with `Response` short-circuits excluded. */
export type LoaderData<L> = L extends (c: never) => Promise<infer D> ? Simplify<Exclude<D, Response>> : Record<string, never>;

/**
 * Full props for a page component, derived from its co-located loader.
 * Import the loader TYPE-ONLY so the reference is erased from the client
 * bundle:
 *
 * @example
 * // features/Profile.tsx
 * import type { loader } from './Profile.server';
 * export default function Profile({ user, params }: LoaderProps<typeof loader>) { ... }
 */
export type LoaderProps<L extends { path: string }> = L extends { path: infer P extends string } ? PageProps<P> & LoaderData<L> : never;

// ─── Server modules ───────────────────────────────────────────────────────

/**
 * What a page route's `*.server.*` module may export. Types are loose on
 * purpose — real checking happens in `defineLoader`/`defineRoutes`; this
 * only describes what the server runtime consumes.
 */
export interface PageServerModule {
    /** A loader declared with `defineLoader(path, fn)`. */
    loader?: ((c: any) => Promise<unknown>) & { path?: string };
    /**
     * For `kind: 'static'` routes with params (e.g. "/docs/:slug"): the
     * param sets to prerender at build time. Requests for paths not
     * returned here fall back to per-request SSR.
     */
    staticPaths?: () => Promise<Array<Record<string, string>>>;
}

/** What an endpoint route's `*.server.*` module must export. */
export interface EndpointServerModule {
    handler: Handler;
}

// ─── Route Types ──────────────────────────────────────────────────────────

interface PageRouteBase {
    path: string;
    /** Lazy component import — Rspack code-splits one chunk per page. */
    component: () => Promise<{ default: ComponentType<any> }>;
    /**
     * Lazy reference to the route's co-located `*.server.*` module
     * (loader and/or staticPaths). Stubbed out of the client bundle.
     */
    server?: () => Promise<PageServerModule>;
}

/**
 * A static page — pre-rendered at build time (SSG).
 */
export interface StaticRoute extends PageRouteBase {
    kind: 'static';
}

/**
 * A dynamic page — server-rendered on each request (SSR).
 */
export interface DynamicRoute extends PageRouteBase {
    kind: 'dynamic';
}

/**
 * An API endpoint. The handler lives in a `*.server.*` module (exported
 * as `handler`) so no server code ships to the browser. For more than a
 * couple of endpoints, use a `*.server.ts` Hono sub-app (e.g.
 * src/index.server.ts) instead.
 */
export interface EndpointRoute {
    kind: 'endpoint';
    path: string;
    method?: HTTPMethod;
    server: () => Promise<EndpointServerModule>;
}

export type HTTPMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'all';

export type PageRoute = StaticRoute | DynamicRoute;
export type Route = PageRoute | EndpointRoute;

export function isPageRoute(route: Route): route is PageRoute {
    return route.kind === 'static' || route.kind === 'dynamic';
}

// ─── defineRoutes ─────────────────────────────────────────────────────────

/**
 * Compile-time validation of one route entry, derived entirely from the
 * manifest: (1) the server module's loader must have been declared with
 * this route's path pattern; (2) the component's props must be satisfied
 * by `PageProps<path>` + the loader's data. On failure the offending
 * property's type becomes an error-message string literal.
 */
type ValidateRoute<R> = R extends {
    path: infer P extends string;
    component: () => Promise<{ default: ComponentType<infer CP> }>;
    server: () => Promise<infer M>;
}
    ? M extends { loader: infer L extends { path: string } }
        ? L['path'] extends P
            ? [PageProps<P> & LoaderData<L>] extends [CP]
                ? R
                : R & { component: `component props are not satisfied by PageProps & loader data for '${P}'` }
            : R & { server: `loader was declared with path '${L['path']}' but the route is '${P}'` }
        : R
    : R;

/**
 * Define all application routes — the single source of truth.
 *
 * @example
 * export const routes = defineRoutes([
 *   {
 *     kind: 'dynamic',
 *     path: '/profile/:id',
 *     component: () => import('./features/Profile'),
 *     server: () => import('./features/Profile.server'),
 *   },
 *   {
 *     kind: 'endpoint',
 *     path: '/api/health',
 *     server: () => import('./health.server'),
 *   },
 * ]);
 */
export function defineRoutes<const TRoutes extends readonly Route[]>(userRoutes: TRoutes & { [K in keyof TRoutes]: ValidateRoute<TRoutes[K]> }): TRoutes {
    return userRoutes;
}
