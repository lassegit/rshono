---
title: Full Hono underneath
description: Endpoint routes, the src/server.ts sub-app, and end-to-end type safety.
---

There is a whole Hono app under the pages, and it is yours.

## Endpoint routes

`{ type: 'endpoint' }` routes export a Hono `handler` from a server module. It only ever runs on the
server.

```ts
// src/health.ts
import type { Handler } from 'hono';

export const handler: Handler = (c) => c.json({ ok: true });
```

## The `src/server.ts` sub-app

`src/server.ts` may default-export a whole Hono sub-app: any method, streaming, cookies, middleware.

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

The flip side: a _terminal_ handler in `src/server.ts` at the same path as a page route **shadows the
page**. Middleware that calls `next()` is fine; a handler that returns a response is not.

## Typing the context

The `Env` you give the Hono app is the same one that types `ctx` on a page. Pass it to `PageProps` and
`ctx.var` is typed key by key instead of being an open record:

```tsx
import type { PageProps } from '@rshono/core';
import type { AppEnv } from '../server';

export default function Home({ ctx }: PageProps<'/', AppEnv>) {
  return <p>Request {ctx.var.requestId}</p>; // typed
}
```

## End-to-end types for a client

`export type AppType = typeof server` gives full type safety with `hono/client` — typed paths, params
and responses, checked against the handlers themselves:

```ts
import { hc } from 'hono/client';
import type { AppType } from './server';

const client = hc<AppType>('/');
const res = await client.api.health.$get();
```

## Error reporting

Register a handler at the top level of `src/server.ts` and every error the framework catches reaches one
place — a thrown action, a failed render, SSR falling over:

```ts
import { onServerError } from '@rshono/core/server';

onServerError((error, { source, request }) => {
  Sentry.captureException(error, { tags: { source }, extra: { url: request.url } });
});
```

Errors keep going to `stderr` either way, and a handler that throws is caught rather than failing the
request.
