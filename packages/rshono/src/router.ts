import type { Handler } from 'hono';
import type { ParamKeys, ParamKeyToRecord } from 'hono/types';
import type { ReactNode } from 'react';

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type PathParams<P extends string> =
  ParamKeys<P> extends never ? Record<string, never> : Simplify<UnionToIntersection<ParamKeyToRecord<ParamKeys<P>>>>;

export interface PageProps<Path extends string = string> {
  params: string extends Path ? Record<string, string> : PathParams<Path>;
  url: string;
}

export type PageComponent<P = any> = (props: P) => ReactNode | Promise<ReactNode>;

export interface EndpointServerModule {
  handler: Handler;
}

export interface PageRoute {
  path: string;
  component: () => Promise<{ default: PageComponent }>;
  kind?: 'static' | 'dynamic';
  staticPaths?: () => Array<Record<string, string>> | Promise<Array<Record<string, string>>>;
}

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

export interface SpecialPage {
  component: () => Promise<{ default: PageComponent }>;
}

export interface ErrorInfo {
  message: string;
  stack?: string;
}

export type ErrorPageProps = PageProps & { error: ErrorInfo };

export interface RouteConfig<TRoutes extends readonly Route[] = readonly Route[]> {
  routes: TRoutes;
  notFound?: SpecialPage;
  error?: SpecialPage;
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

export function defineRoutes<const TRoutes extends readonly Route[]>(
  config: RouteConfig<TRoutes> & { routes: ValidateRoutes<TRoutes> },
): RouteConfig<TRoutes>;
export function defineRoutes<const TRoutes extends readonly Route[]>(routes: TRoutes & ValidateRoutes<TRoutes>): RouteConfig<TRoutes>;
export function defineRoutes(input: readonly Route[] | RouteConfig): RouteConfig {
  return Array.isArray(input) ? { routes: input } : (input as RouteConfig);
}
