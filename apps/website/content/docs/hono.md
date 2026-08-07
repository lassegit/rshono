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

## Security middleware

Because the sub-app wraps page requests, this is also where the app's security controls go. The
framework ships none of its own — Hono's are better tested than anything rshono would write, and a
config field would only be a worse way to spell the same call:

```ts
import { publicUrl } from '@rshono/core/server';
import { bodyLimit } from 'hono/body-limit';
import { csrf } from 'hono/csrf';
import { NONCE, secureHeaders } from 'hono/secure-headers';

server.use(bodyLimit({ maxSize: 1024 * 1024 }));
server.use(csrf({ origin: (origin, c) => origin === publicUrl(c).origin }));
server.use(secureHeaders({ contentSecurityPolicy: { scriptSrc: ["'self'", NONCE] } }));
```

`create-rshono` scaffolds `bodyLimit` and `csrf` into every new app. Three things worth knowing:

- **`publicUrl(c)`, not `c.req.url`.** Every Hono middleware resolves the origin from `c.req.url`, which
  is the address this server was _reached_ on — the internal one behind any proxy, `rshono dev`
  included. `publicUrl` honours [`trustProxy`](/docs/configuration#proxy-headers).
- **`NONCE` makes a CSP per-request.** Hono mints the nonce; rshono stamps it onto the bootstrap
  scripts and the inlined flight payload, and widens `script-src` with `'unsafe-eval'` under
  `rshono dev` only. See [CSP](/docs/configuration#csp).
- **An `HTTPException` keeps its status.** Middleware that rejects by throwing one — `csrf()` with a
  403, `bodyLimit()` with a 413, your own `throw new HTTPException(401)` — is handed straight back
  rather than rendered as the 500 page.

One gap: `/_static` assets are served before the sub-app is reached, so middleware never sees them. The
framework sets `nosniff`, `Referrer-Policy` and `X-Frame-Options` on
[every response](/docs/configuration#response-headers-and-caching) to cover them, and stands aside
wherever your own `secureHeaders()` set the same header.

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

## Response headers and cookies

Middleware is where a page's response headers belong. A page renders too late to set one — its response
head is committed before the component runs, so [`ctx.setHeader()` throws
there](/docs/api#writes-happen-before-the-render). Middleware runs first, and gets Hono's `c` directly:

```ts
import { setCookie } from 'hono/cookie';

server.use('/blog/*', async (c, next) => {
  await next();
  c.header('cache-control', 'public, max-age=600, s-maxage=3600');
});

server.use('*', async (c, next) => {
  if (!c.req.header('cookie')?.includes('visitor=')) setCookie(c, 'visitor', crypto.randomUUID(), { path: '/' });
  await next();
});
```

Matching on a path pattern is deliberate: one middleware covers a group of routes, so caching policy
lives in one place rather than being repeated on every route that shares it.

`getRequestContext()` is **not** available in middleware or in `{ type: 'endpoint' }` routes — the
request context is bound around the render and the actions it runs, not around the whole Hono stack.
Neither needs it: both are handed `c`, which is a superset.

For a header that depends on a mutation rather than on the route — a session cookie after login — use a
[server action](/docs/server-actions#cookies-and-headers) instead.

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
