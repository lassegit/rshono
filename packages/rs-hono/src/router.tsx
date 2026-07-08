/**
 * Route Definition
 *
 * `defineRoutes` is the single source of truth for all application routes.
 * Full type inference: loaders infer return types that flow into page props.
 */
import type { Context, Handler, MiddlewareHandler, Env, Input } from "hono";
import type { ComponentType } from "react";

// ─── Base Types ───────────────────────────────────────────────────────────

interface RouteBase {
  path: string;
}

/**
 * A static page — pre-rendered at build time (SSG).
 */
export interface StaticRoute<TLoaderData = Record<string, unknown>>
  extends RouteBase {
  kind: "static";
  component: () => Promise<{
    default: ComponentType<PageProps & TLoaderData>;
  }>;
  loader?: (c: Context) => Promise<TLoaderData>;
}

/**
 * A dynamic page — server-rendered on each request (SSR).
 */
export interface DynamicRoute<TLoaderData = Record<string, unknown>>
  extends RouteBase {
  kind: "dynamic";
  component: () => Promise<{
    default: ComponentType<PageProps & TLoaderData>;
  }>;
  loader?: (c: Context) => Promise<TLoaderData>;
}

/**
 * An API endpoint — pure Hono handler.
 */
export interface EndpointRoute extends RouteBase {
  kind: "endpoint";
  method?: HTTPMethod;
  handler: Handler;
}

export type HTTPMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "head"
  | "options"
  | "all";

export type Route = StaticRoute | DynamicRoute | EndpointRoute;

// ─── Page Props ───────────────────────────────────────────────────────────

export interface PageProps {
  params: Record<string, string>;
  url: string;
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
 *     loader: async (c) => ({ user: await db.getUser(c.req.param('id')) }),
 *   },
 *   {
 *     kind: 'endpoint',
 *     path: '/api/health',
 *     handler: (c) => c.json({ ok: true }),
 *   },
 * ]);
 */
export function defineRoutes<const TRoutes extends Route[]>(
  userRoutes: TRoutes
): TRoutes {
  return userRoutes;
}

// ─── Re-exports for convenience ───────────────────────────────────────────

export type { Context, Handler, MiddlewareHandler, Env, Input } from "hono";
