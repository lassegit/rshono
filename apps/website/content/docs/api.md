---
title: API reference
description: Every export of @rshono/core, @rshono/core/server and @rshono/core/client, in one place.
---

Three entry points, and which one an import comes from tells you where the code runs. That is most of
what there is to know about the surface.

| Import                | Runs                                 | Holds                                                                 |
| --------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `@rshono/core`        | build time, server                   | route and config declaration, and the types pages are written against |
| `@rshono/core/server` | per request, server only             | the request context, `redirect` / `notFound`, error reporting         |
| `@rshono/core/client` | browser, from `'use client'` modules | the navigation hook and the boundaries                                |

`@rshono/core` pulls in no runtime machinery — importing it from server code is free. `@rshono/core/server`
from a `'use client'` module is a mistake: those run in the browser, where no request is bound. Read what
you need on the server and pass it down as props.

These three are the whole public surface — the package's `exports` map lists only them, so there is no
deeper path to import. Everything else is framework plumbing.

## `@rshono/core`

### Functions

| Signature                            | What it does                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `defineRoutes(config): RouteConfig`  | Declares the app's route table in `src/routes.ts`. Also accepts a bare `Route[]` as shorthand. Cross-checks every page's props against its own `path`. |
| `defineConfig(config): RshonoConfig` | Types `rshono.config.ts`. Identity function — it exists for the autocomplete.                                                                          |

See [Routing](/docs/routing) and [Configuration](/docs/configuration).

### Types

| Type                   | What it describes                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PageProps<Path, E>`   | What every page receives: `url`, `params`, `ctx`. Pass the route's path to type `params` key-by-key.            |
| `PageComponent<P>`     | A page: a server component returning `ReactNode` or `Promise<ReactNode>`.                                       |
| `PathParams<P>`        | The `params` record a path pattern implies — `'/users/:id'` → `{ id: string }`. `PageProps` applies it for you. |
| `PageRoute`            | A path rendered by a server component: `path`, `component`, and optional `render` / `staticPaths`.              |
| `EndpointRoute`        | A path served by a Hono handler: `type: 'endpoint'`, `path`, `server`, optional `method`.                       |
| `EndpointServerModule` | What an endpoint's module must export — a single named `handler`.                                               |
| `Route`                | `PageRoute \| EndpointRoute`.                                                                                   |
| `RouteConfig<TRoutes>` | The object `defineRoutes` takes: `routes`, plus optional `notFound` and `error`.                                |
| `FallbackPage`         | The `notFound` / `error` page shape — a `component` with no path of its own.                                    |
| `ErrorPageProps<E>`    | `PageProps` plus `error`, for the page declared as `error`.                                                     |
| `ErrorPageInfo`        | `{ message, stack? }`. Redacted in production: a generic message, no stack.                                     |
| `HTTPMethod`           | `'get'` \| `'post'` \| `'put'` \| `'patch'` \| `'delete'` \| `'head'` \| `'options'` \| `'all'`.                |
| `RshonoConfig`         | Every field of `rshono.config.ts`. All optional.                                                                |
| `RspackHookContext`    | `{ isServer, isDev }`, handed to the `rspack` config hook.                                                      |
| `DeployTarget`         | `'node'` \| `'cloudflare'` \| `'vercel'` \| `'aws-lambda'`.                                                     |

## `@rshono/core/server`

Server-only, and request-scoped. See [Pages](/docs/pages) and [Server actions](/docs/server-actions).

### Functions

| Signature                                   | What it does                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `getRequestContext<E>(): RequestContext<E>` | The current request's context. Memoised per request. Throws at module load, and while prerendering a `render: 'static'` route. |
| `redirect(location, status?): never`        | Throws a control signal the framework turns into a redirect. `status` defaults to `303`.                                       |
| `notFound(): never`                         | Aborts the render with a 404 and the app's not-found page.                                                                     |
| `onServerError(handler): void`              | Registers one handler for every error the framework catches. Call it once, at the top level of `src/server.ts`.                |

`redirect` and `notFound` never return, so TypeScript narrows away the code after them and you don't
need to `return` the call. Don't wrap either in a `try/catch` that swallows the signal.

```tsx
import { getRequestContext, redirect } from '@rshono/core/server';

export default async function Dashboard() {
  const session = getRequestContext().cookies.get('session');
  if (!session) redirect('/login');
  return <Layout>Signed in as {session}</Layout>; // session is defined here
}
```

### `RequestContext`

What `getRequestContext()` returns, and the very same object a page gets as its `ctx` prop. Exported as a type
only — one instance exists per request and application code never constructs it.

| Member                               | What it is                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `url`                                | The browser-facing `URL`, proxy-header aware. Parsed once and cached.                          |
| `env`                                | Process env merged with runtime bindings (bindings win). See [Environment](/docs/environment). |
| `var`                                | Typed variables a middleware set with `c.set(…)`.                                              |
| `raw`                                | The underlying Hono `Context` — the escape hatch for everything not above.                     |
| `cookies.get(name)`                  | One cookie, or `undefined`.                                                                    |
| `cookies.all()`                      | Every cookie as `{ name: value }`.                                                             |
| `cookies.set(name, value, options?)` | Sets a cookie on the response.                                                                 |
| `cookies.delete(name, options?)`     | Clears one. Pass the `path`/`domain` it was set with.                                          |

That is the whole wrapper, and deliberately short: what it adds over Hono's own `Context` is a
proxy-aware cached URL, an env that merges runtime bindings over process env, and cookies without a
second import. Anything else is `ctx.raw` — `ctx.raw.req` for the parsed request, `ctx.raw.req.method`,
`ctx.raw.header(name, value)` to set a response header. Those had one-line getters on `RequestContext` once; naming
them twice bought nothing. Route params come to a page as its `params` prop.

`ctx` can't be handed to a `'use client'` component — it wraps the live request. Reading it on a
[`render: 'static'`](/docs/prerendering) page throws, because there is no request at build time.

### Types

| Type                 | What it describes                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `RequestContext<E>`  | The request context above. `E` is the app's Hono `Env`, which types `var` and `env`.      |
| `EnvVars<E>`         | What `ctx.env` resolves to: `Bindings` merged with `Record<string, string \| undefined>`. |
| `RedirectStatus`     | `301 \| 302 \| 303 \| 307 \| 308`.                                                        |
| `ServerErrorHandler` | `(error, context) => void` — what `onServerError` takes.                                  |
| `ServerErrorContext` | `{ source, request }`, the second argument to that handler.                               |
| `ServerErrorSource`  | `'action' \| 'render' \| 'ssr' \| 'request'` — which stage produced the error.            |

An `'action'` error is the one worth wiring up: React sends the client an opaque marker with no message
in production, so a handler is the only place the real error is visible.

## `@rshono/core/client`

Every export is itself a `'use client'` module, so a server component can render `Boundary` directly. The
hook needs a client component.

### Hook

| Signature                          | What it returns                                                   |
| ---------------------------------- | ----------------------------------------------------------------- |
| `useNavigation(): NavigationState` | `{ url, params, router }` — the current location, and the router. |

`url` and `params` are computed on the server and travel in the flight payload, so they are right during
SSR and update on every navigation. In a server component, read the same data from `getRequestContext()`.

```tsx
'use client';
import { useNavigation } from '@rshono/core/client';

export function NextPage() {
  const { url, router } = useNavigation();
  const page = Number(url.searchParams.get('page') ?? '1');
  return (
    <button disabled={router.pending} onClick={() => router.push(`${url.pathname}?page=${page + 1}`)}>
      Next
    </button>
  );
}
```

`router` holds `push(href)`, `replace(href)`, `refresh()` and the `pending` flag. All three are **soft**
navigations: the new page's flight payload is fetched and applied in place, so client state outside the
changed subtree survives. Off-site hrefs fall back to a full load. History traversal is `history.back()`
and `history.forward()` — the router wrapped them once and added nothing, so it no longer does.

### Components

| Component         | Props                                      | What it does                                                                                     |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `<Boundary>`      | `loading`, `error`, `onError`, `resetKeys` | A Suspense fallback and an error fallback in one wrapper — the common case for an async section. |
| `<ErrorBoundary>` | `fallback`, `onError`, `resetKeys`         | Error boundary alone. Omit `fallback` to report and re-throw to the next boundary out.           |

Both fallbacks on `Boundary` are optional: no `loading` shows nothing while loading, no `error` lets
throws propagate to the next boundary out or the global error page. A `redirect()` is never absorbed by
either boundary — it's navigation, not failure.

### Types

| Type                 | What it describes                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `NavigationState`    | `{ url, params, router }` — what `useNavigation()` returns.                                               |
| `NavigationRouter`   | The imperative actions plus `pending`.                                                                    |
| `BoundaryProps`      | Props of `<Boundary>`.                                                                                    |
| `ErrorBoundaryProps` | Props of `<ErrorBoundary>`.                                                                               |
| `ErrorFallback`      | `ReactNode`, or `(error, reset) => ReactNode`. The function form only works from a `'use client'` module. |
