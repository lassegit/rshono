---
title: Pages
description: A page is a React server component that renders the whole document and receives the request.
---

Every page module **default-exports a server component** — nothing else. It may be `async` and await
data directly.

```tsx
import type { PageProps } from '@rshono/core';
import { db } from '../db';

export default async function Profile({ params, ctx }: PageProps<'/profile/:id'>) {
  const user = await db.getUser(params.id);
  const theme = ctx.cookies.get('theme') ?? 'light';
  return <Layout theme={theme}>{user.name}</Layout>;
}
```

Pages render the **entire document** (`<html>…</html>`), usually through a shared layout component.
Interactive parts are `'use client'` components the page imports — only those ship JavaScript.

There is no `<Link>`, `<Image>`, `<Script>` or `<Head>`: links are `<a href>`, images are `<img>`, forms
are `<form action>`. Same-origin anchors are soft-navigated automatically; `data-native` opts one out.

## Page props

Every page receives `{ url, params, ctx }`. They are server-only and never serialized — React puts a
server component's _output_ on the wire, not its props.

| Prop     | What it is                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------- |
| `url`    | The absolute browser-facing `URL`, proxy-header aware. A fresh instance per request.                  |
| `params` | The matched route params. `PageProps<'/profile/:id'>` types `params.id` as `string`.                  |
| `ctx`    | The request context — cookies, headers, env, middleware variables. Same object `getRequestContext()` returns. |

Type `ctx.var` and `ctx.env` for your app by passing its Hono `Env`:

```tsx
export default function Dashboard({ ctx }: PageProps<'/dashboard', AppEnv>) {
  const session = ctx.cookies.get('session');
  if (!session) redirect('/login');
  return <Layout>Signed in as {session}</Layout>;
}
```

Nested server components and `'use server'` actions get no props — they call `getRequestContext()` from
`@rshono/core/server` for the same object.

### `ctx` cannot cross into the client

`ctx` wraps the live request and response, so it is non-enumerable and never reaches the browser.

- Passing it explicitly (`<Counter ctx={ctx} />`) fails the render with React's _"Only plain objects …
  can be passed to Client Components"_.
- Spreading page props (`<Counter {...props} />`) drops it silently — a spread copies enumerables only.
  That spread still fails, on `url`, which is enumerable and just as unserializable.

Read what you need on the server and pass plain values down: `url.href`, not `url`.

On a [prerendered page](/docs/routing#static-rendering) reading `ctx` throws — there is no request.

## Client components

A `'use client'` module is the interactive part, and `useNavigation()` is the whole client-side routing
API:

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

`url` and `params` are the same names and types a page gets as props, so moving a read across the
server/client line is a copy-paste. `router` holds `push`, `replace`, `refresh` and `pending`; all three
are soft navigations, so client state outside the changed subtree survives. History traversal is
`history.back()` / `history.forward()`.

`<AsyncBoundary>` pairs a Suspense fallback with an error fallback, and `<CatchBoundary>` is the error
half alone. Both are `'use client'` modules a server component can render directly. A `redirect()` is
never absorbed by either — it is navigation, not failure.

## The `'use server-entry'` directive

Each page carries Rspack's `'use server-entry'` directive, which attaches the page's client JS and CSS
to the component. That is what gives per-page code splitting with no asset manifest.

The framework injects it for every component written with the inline `component: () => import('…')` form
in `routes.ts`, including routes added while the dev server is running. If a component is wired up some
other way — variable indirection, barrel re-exports, computed specifiers — write `'use server-entry'` as
the first line of the page module yourself. The framework throws a descriptive error when neither
happened.
