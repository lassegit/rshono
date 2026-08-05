---
title: Hono & middleware
description: src/server.ts is a Hono sub-app — middleware, endpoints, end-to-end types, error reporting.
---

There is a whole Hono app under the pages, and it is yours. `src/server.ts` may default-export a sub-app:
any method, streaming, cookies, middleware.

```ts
import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash';

export type AppEnv = { Variables: { requestId: string } };

const server = new Hono<AppEnv>();

server.use(trimTrailingSlash({ alwaysRedirect: true }));

server.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
});

server.get('/api/health', (c) => c.json({ status: 'ok', requestId: c.var.requestId }));

export default server;
export type AppType = typeof server;
```

The sub-app is mounted at `/` **ahead of the page routes**, so its middleware — auth, logging,
trailing-slash — wraps page requests too.

The flip side: a _terminal_ handler at the same path as a page route **shadows the page**. Middleware
that calls `next()` is fine; a handler that returns a response is not.

## Typing the context

The `Env` given to the Hono app is the same one that types `ctx` on a page. Pass it to `PageProps` and
`ctx.var` is typed key by key instead of being an open record:

```tsx
import type { PageProps } from '@rshono/core';
import type { AppEnv } from '../server';

export default function Home({ ctx }: PageProps<'/', AppEnv>) {
  return <p>Request {ctx.var.requestId}</p>; // typed
}
```

## End-to-end types for a client

`export type AppType = typeof server` gives typed paths, params and responses with `hono/client`,
checked against the handlers themselves:

```ts
import { hc } from 'hono/client';
import type { AppType } from './server';

const client = hc<AppType>('/');
const res = await client.api.health.$get();
```

## Error reporting

One handler, registered at the top level of `src/server.ts`, catches every error the framework sees — a
thrown action, a failed render, SSR falling over, anything reaching the top-level handler:

```ts
import { onServerError } from '@rshono/core/server';

onServerError((error, { source, request }) => {
  Sentry.captureException(error, { tags: { source }, extra: { url: request.url } });
});
```

`source` is `'action' | 'render' | 'ssr' | 'request'`. Errors keep going to `stderr` either way, and a
handler that throws is caught rather than failing the request.
