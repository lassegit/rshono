---
title: Pages
description: Every page is a React server component that renders the whole document.
---

Every page module **default-exports a server component** — nothing else. It may be `async` and await
data directly.

```tsx
import type { PageProps } from '@rshono/core';
import { db } from '../db';

export default async function Profile({ params, ctx }: PageProps<'/profile/:id'>) {
  const user = await db.getUser(params.id);
  const theme = ctx.cookies.get('theme') ?? 'light';
  return <Layout>…</Layout>;
}
```

Pages render the **entire document** (`<html>…</html>`), usually via a shared layout component.
Interactive parts are `'use client'` components the page imports — only those ship JavaScript, and a
fully interactive page is a thin server component wrapping one.

## The `'use server-entry'` directive

Under the hood each page carries Rspack's `'use server-entry'` directive. It attaches the page's client
JS and CSS assets to the component, which is what gives per-page code splitting with no asset manifest.

The framework **injects it automatically** for every component referenced with the inline
`component: () => import('…')` thunk form in `routes.ts`, including routes added while the dev server is
running.

If a component is wired up some other way — variable indirection, barrel re-exports, computed
specifiers — write `'use server-entry'` as the first line of the page module yourself. A manually
written directive is always respected, and the framework throws a descriptive error when neither
happened.

## Page props

Pages receive `{ url, params, ctx }`.

### `url`

A real `URL` — read `url.pathname` and `url.searchParams` off it. It is the absolute browser-facing
request URL, proxy-header aware (see [`trustProxy`](/docs/security)), and a fresh instance per request
that nothing else holds, so mutating it is local to the page.

It pairs with what a `'use client'` component gets from `useNavigation()` — same names, same types — so
moving a read across the server/client line is a copy-paste.

### `params`

The matched route params. `PageProps<'/profile/:id'>` types `params.id` as `string`; without the type
argument `params` falls back to an open `Record<string, string>`.

### `ctx`

The request context — cookies, headers, env, middleware variables, the proxy-aware URL. It is the same
object `getRequestContext()` returns from `@rshono/core/server`, handed to the page so it needs no import.
Reach for `getRequestContext()` in the places that get no props: a nested server component, a `'use server'`
action.

Type `ctx.var` and `ctx.env` for your app by passing its Hono `Env`:

```tsx
export default function Dashboard({ ctx }: PageProps<'/dashboard', MyEnv>) {
  const session = ctx.cookies.get('session');
  if (!session) redirect('/login');
  return <Layout>Signed in as {session}</Layout>;
}
```

## What props are, and are not

Page props are **server-only and never serialized** — React puts a server component's _output_ on the
wire, not its props. `ctx` is additionally non-enumerable, which keeps it out of React's dev-only debug
payload; an enumerable one would ship the whole Hono context, bindings included, to the browser in dev.

That non-enumerability has three consequences worth knowing:

- **`ctx` cannot cross into a `'use client'` component.** It wraps the live request and response, which
  don't exist in the browser. Passing it explicitly (`<Counter ctx={ctx} />`) fails the render with
  React's _"Only plain objects … can be passed to Client Components"_, naming the prop.
- **Spreading page props drops it silently** (`<Counter {...props} />`), since a spread copies
  enumerables only. That spread still fails, mind — on `url`, which is enumerable and just as
  unserializable.
- `Object.keys(props)`, `JSON.stringify(props)` and friends don't see it.

Either way the fix is the same: read what you need on the server and pass plain values down —
`url.href`, not `url`.

## On a prerendered page

Reading `ctx` on a [`render: 'static'`](/docs/prerendering) page **throws**. A page rendered once at
build time has no request to read. Use `params` and `url`, which are available either way, or make the
route `render: 'dynamic'`.

One quiet caveat: a prerendered `url` is the build-time one — `siteUrl` plus the path, no query — and
that one file answers every request whatever its own query. So `url.searchParams` is always empty
there. Read the query with `useNavigation().url` on the client instead.
