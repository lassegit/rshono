import type { Handler } from 'hono';
import type { ParamKeys, ParamKeyToRecord } from 'hono/types';
import type { ReactNode } from 'react';

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

/**
 * The `params` record implied by a route path pattern — one required `string` key
 * per `:param` segment, `Record<string, never>` for a path with no params.
 *
 * Paths use Hono's syntax, so `:id`, `:id{[0-9]+}` and `*` all work. You rarely
 * name this type directly; {@link PageProps} applies it for you.
 *
 * @typeParam P - The literal route path, e.g. `'/users/:id/posts/:postId'`.
 *
 * @example
 * ```ts
 * type P = PathParams<'/users/:id/posts/:postId'>; // { id: string; postId: string }
 * ```
 */
export type PathParams<P extends string> =
  ParamKeys<P> extends never ? Record<string, never> : Simplify<UnionToIntersection<ParamKeyToRecord<ParamKeys<P>>>>;

/**
 * Props every page component receives. Pass the route's path as the type
 * argument to get `params` typed key-by-key; without it `params` falls back to
 * an open `Record<string, string>`.
 *
 * `defineRoutes` checks each page's props against `PageProps<path>` at compile
 * time, so a mismatched path literal is a type error at the route definition.
 *
 * @typeParam Path - The literal path this page is mounted at, e.g. `'/profile/:id'`.
 *
 * @example
 * ```tsx
 * import type { PageProps } from 'rshono';
 *
 * export default async function Profile({ params, url }: PageProps<'/profile/:id'>) {
 *   const user = await db.getUser(params.id); // params.id is string
 *   return <Layout>{user.name} — {new URL(url).search}</Layout>;
 * }
 * ```
 */
export interface PageProps<Path extends string = string> {
  /** Matched route params for this request, e.g. `{ id: '42' }` for `/profile/:id`. */
  params: string extends Path ? Record<string, string> : PathParams<Path>;
  /**
   * The absolute browser-facing request URL as a string, proxy-header aware
   * (`X-Forwarded-Host` / `-Proto`). Wrap it in `new URL(url)` to read
   * `searchParams` or `pathname`.
   */
  url: string;
}

/**
 * A page: a React **server component** that renders the entire document
 * (`<html>…</html>`), usually via a shared layout. It may be `async` and await
 * data directly.
 *
 * Each page module must default-export exactly one of these. Interactive parts
 * belong in `'use client'` components the page imports — only those ship JS.
 *
 * @typeParam P - The component's props; for a page these are {@link PageProps}.
 */
export type PageComponent<P = any> = (props: P) => ReactNode | Promise<ReactNode>;

/**
 * The shape an `{ type: 'endpoint' }` route's server module must have: a single
 * named `handler` export. The module only ever loads on the server, so it is
 * safe to import a database client or read secrets from it.
 *
 * @example
 * ```ts
 * // src/health.ts
 * import type { Handler } from 'rshono';
 *
 * export const handler: Handler = (c) => c.json({ ok: true });
 * ```
 */
export interface EndpointServerModule {
  /** A Hono {@link Handler} handling every request matched by the route. */
  handler: Handler;
}

/**
 * A page route — a path rendered by a server component. This is the default
 * route kind, so `type` can be omitted.
 *
 * @example
 * ```ts
 * { path: '/profile/:id', component: () => import('./components/profile') }
 * ```
 */
export interface PageRoute {
  /** Discriminates a page from an endpoint; optional because `'page'` is the default. */
  type?: 'page';
  /** Hono-style path pattern, e.g. `/`, `/profile/:id`, `/files/*`. */
  path: string;
  /**
   * Dynamic import of the page module, whose default export is the
   * {@link PageComponent}.
   *
   * Write it inline as shown — the framework detects that exact
   * `() => import('…')` form and injects Rspack's `'use server-entry'`
   * directive into the module for you (that directive is what attaches the
   * page's client JS/CSS, giving per-page code splitting). If you wire the
   * component up any other way — a variable, a barrel re-export, a computed
   * specifier — add `'use server-entry'` as the first line of the page module
   * yourself; the framework throws a descriptive error when neither happened.
   */
  component: () => Promise<{ default: PageComponent }>;
  /** `'static'` prerenders the route at build time; `'dynamic'` (the default) renders per request. */
  render?: 'static' | 'dynamic';
  /**
   * For a `render: 'static'` route with params: the param sets to prerender, one
   * HTML file each. Runs at build time only, on the server, so it may hit a
   * database or read the filesystem.
   *
   * A parameterised static route without `staticPaths` falls back to rendering
   * per request (with a build warning). Wildcard (`*`), optional and regex
   * params can't be prerendered.
   *
   * @example
   * ```ts
   * {
   *   path: '/docs/:slug',
   *   render: 'static',
   *   component: () => import('./components/documentation'),
   *   staticPaths: async () => (await db.docs.all()).map((d) => ({ slug: d.slug })),
   * }
   * ```
   */
  staticPaths?: () => Array<Record<string, string>> | Promise<Array<Record<string, string>>>;
}

/**
 * An endpoint route — a path served by a raw Hono handler instead of a React
 * component. Use it for JSON APIs, webhooks, redirects, feeds, or anything that
 * isn't an HTML page.
 *
 * @example
 * ```ts
 * { type: 'endpoint', path: '/api/health', server: () => import('./health') }
 * ```
 */
export interface EndpointRoute {
  /** Marks this route as an endpoint rather than a page. Required. */
  type: 'endpoint';
  /** Hono-style path pattern, e.g. `/api/health`, `/api/users/:id`. */
  path: string;
  /** HTTP method to match. Defaults to `'all'` — every method. */
  method?: HTTPMethod;
  /** Dynamic import of the {@link EndpointServerModule} exporting `handler`. */
  server: () => Promise<EndpointServerModule>;
}

/** HTTP methods an {@link EndpointRoute} can match. `'all'` matches every method. */
export type HTTPMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'all';

/** Any entry in the `routes` array: a {@link PageRoute} or an {@link EndpointRoute}. */
export type Route = PageRoute | EndpointRoute;

/**
 * Type guard narrowing a {@link Route} to a {@link PageRoute}. Because `type` is
 * optional on page routes, anything not explicitly `'endpoint'` is a page.
 *
 * @example
 * ```ts
 * for (const route of routes) {
 *   if (isPageRoute(route)) console.log(route.render ?? 'dynamic');
 * }
 * ```
 */
export function isPageRoute(route: Route): route is PageRoute {
  return route.type !== 'endpoint';
}

/**
 * A page the framework falls back to rather than routes to — `notFound` and
 * `error` in {@link RouteConfig}. Same contract as a {@link PageRoute}
 * `component`, without a path of its own.
 */
export interface FallbackPage {
  /** Dynamic import of the page module; its default export is the {@link PageComponent}. */
  component: () => Promise<{ default: PageComponent }>;
}

/**
 * The error detail handed to the `error` page. Redacted in production: the
 * message is a generic `'Internal Server Error'` and there is no `stack`. In dev
 * you get the real message plus the stack.
 */
export interface ErrorInfo {
  /** The thrown error's message in dev; `'Internal Server Error'` in production. */
  message: string;
  /** The stack trace. Present in dev only. */
  stack?: string;
}

/**
 * Props for the `error` page declared in {@link RouteConfig.error} — the usual
 * {@link PageProps} plus the redaction-aware {@link ErrorInfo}.
 *
 * @example
 * ```tsx
 * import type { ErrorPageProps } from 'rshono';
 *
 * export default function ServerError({ error }: ErrorPageProps) {
 *   return <html><body><h1>Something went wrong</h1><p>{error.message}</p></body></html>;
 * }
 * ```
 */
export type ErrorPageProps = PageProps & { error: ErrorInfo };

/**
 * The object form accepted by {@link defineRoutes}: the route table plus the two
 * optional framework-owned pages.
 *
 * @typeParam TRoutes - Inferred tuple of route literals, which is what makes the
 *   per-route `path` → props check possible.
 */
export interface RouteConfig<TRoutes extends readonly Route[] = readonly Route[]> {
  /** Every page and endpoint in the app, matched in order. */
  routes: TRoutes;
  /** Page rendered with a 404 status for unmatched paths and for `notFound()` calls. */
  notFound?: FallbackPage;
  /** Page rendered with a 500 status when a request throws. Receives {@link ErrorPageProps}. */
  error?: FallbackPage;
}

type ValidateRoute<R> = R extends {
  path: infer P extends string;
  component: () => Promise<{ default: PageComponent<infer CP> }>;
}
  ? [PageProps<P>] extends [CP]
    ? R
    : R & { component: `component props are not satisfied by PageProps<'${P}'>` }
  : R;

type ValidateRoutes<TRoutes extends readonly Route[]> = { [K in keyof TRoutes]: ValidateRoute<TRoutes[K]> };

/**
 * Declares the app's route table. Default-export the result as `routes` from
 * `src/routes.ts` — the one file rshono requires.
 *
 * `routes.ts` only ever runs on the server, so importing server-only modules
 * from it (e.g. inside `staticPaths`) is safe.
 *
 * Beyond typing the config, this cross-checks every page against its own path:
 * if a component's props aren't satisfied by `PageProps<'<its path>'>`, the
 * `component` field errors with `component props are not satisfied by
 * PageProps<'/…'>`. Fix it by matching the page's `PageProps<Path>` type
 * argument to the path it's mounted at.
 *
 * @param config - A {@link RouteConfig}, or a bare {@link Route} array as
 *   shorthand when there are no `notFound` / `error` pages.
 * @returns The config, unchanged and fully typed.
 *
 * @example
 * ```ts
 * // src/routes.ts
 * import { defineRoutes } from 'rshono';
 *
 * export const routes = defineRoutes({
 *   routes: [
 *     { path: '/', component: () => import('./components/home') },
 *     { path: '/profile/:id', component: () => import('./components/profile') },
 *     {
 *       path: '/docs/:slug',
 *       render: 'static',
 *       component: () => import('./components/documentation'),
 *       staticPaths: async () => [{ slug: 'getting-started' }, { slug: 'deployment' }],
 *     },
 *     { type: 'endpoint', path: '/api/health', server: () => import('./health') },
 *   ],
 *   notFound: { component: () => import('./components/404') },
 *   error: { component: () => import('./components/500') },
 * });
 * ```
 *
 * @example Array shorthand
 * ```ts
 * export const routes = defineRoutes([{ path: '/', component: () => import('./components/home') }]);
 * ```
 */
export function defineRoutes<const TRoutes extends readonly Route[]>(
  config: RouteConfig<TRoutes> & { routes: ValidateRoutes<TRoutes> },
): RouteConfig<TRoutes>;
export function defineRoutes<const TRoutes extends readonly Route[]>(routes: TRoutes & ValidateRoutes<TRoutes>): RouteConfig<TRoutes>;
export function defineRoutes(input: readonly Route[] | RouteConfig): RouteConfig {
  return Array.isArray(input) ? { routes: input } : (input as RouteConfig);
}
