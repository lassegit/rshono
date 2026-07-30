---
title: Routing
description: src/routes.ts — the one file rshono requires, and the only place routes are declared.
---

Routes are an explicit table, not a directory scan. One file lists every page and endpoint in the app,
matched in order.

```ts
import { defineRoutes } from '@rshono/core';

export const routes = defineRoutes({
  routes: [
    { path: '/', component: () => import('./components/home') },
    { path: '/profile/:id', component: () => import('./components/profile') },
    {
      path: '/docs/:slug',
      render: 'static',
      component: () => import('./components/documentation'),
      staticPaths: async () => [{ slug: 'getting-started' }, { slug: 'deployment' }],
    },
    { type: 'endpoint', path: '/api/health', server: () => import('./health') },
  ],
  notFound: { component: () => import('./components/404') },
  error: { component: () => import('./components/500') },
});
```

`routes.ts` only ever runs on the server — importing server-only modules from it, for example inside
`staticPaths`, is safe. A plain array is accepted as shorthand when there are no `notFound` / `error`
pages:

```ts
export const routes = defineRoutes([{ path: '/', component: () => import('./components/home') }]);
```

## Paths

Paths use Hono's syntax, so `:id`, `:id{[0-9]+}` and `*` all work.

`PageProps<'/users/:id/posts/:postId'>` turns that literal into `{ id: string; postId: string }`, and
`defineRoutes` checks each page's props against the path it is mounted at. Get them out of step and the
`component` field errors with `component props are not satisfied by PageProps<'/…'>` — at the route
definition, not at runtime.

## Page routes

A page route renders a path with a React server component. `type` can be omitted, because `'page'` is
the default.

| Field         | Meaning                                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| `path`        | Hono-style pattern, e.g. `/`, `/profile/:id`, `/files/*`.                           |
| `component`   | Dynamic import of the page module; its default export is the page.                  |
| `render`      | `'static'` prerenders at build time; `'dynamic'` (the default) renders per request. |
| `staticPaths` | For a parameterised static route: the param sets to prerender, one HTML file each.  |

Write `component` inline as `() => import('…')`. The framework detects that exact form and injects
Rspack's `'use server-entry'` directive for you — see [Pages](/docs/pages) for what that does and when
you have to write it yourself.

## Endpoint routes

An endpoint route is served by a raw Hono handler instead of a component. Use it for JSON APIs,
webhooks, redirects and feeds.

```ts
// src/health.ts
import type { Handler } from '@rshono/core';

export const handler: Handler = (c) => c.json({ ok: true });
```

```ts
{ type: 'endpoint', path: '/api/health', method: 'get', server: () => import('./health') }
```

The module only ever loads on the server, so reading secrets or importing a database client from it is
safe. `method` defaults to `'all'`.

## The two framework-owned pages

`notFound` and `error` are real server components with the same contract as a page, minus a path of
their own.

- **`notFound`** is rendered with a 404 status for unmatched paths and for `notFound()` calls.
- **`error`** is rendered with a 500 status when a request throws, and additionally receives an `error`
  prop — message-only in production, message plus stack in dev.

Both are optional. See [Security](/docs/security) for what happens when a failure is bad enough that the
`error` page itself can't be reached.
