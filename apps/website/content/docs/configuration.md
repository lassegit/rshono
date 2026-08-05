---
title: Configuration & security
description: rshono.config.ts — every field, the secret boundary, and what is hardened by default.
---

An optional `rshono.config.ts` (`.js` / `.mjs` also work) at the project root tunes the framework. Every
field is optional; delete the file to accept all defaults.

```ts
import { defineConfig } from '@rshono/core';

export default defineConfig({
  deploy: 'node', // hosting platform to build for (--deploy or RSHONO_DEPLOY override)
  siteUrl: 'https://example.com', // public origin, baked into prerendered pages' absolute URLs
  trustProxy: false, // honour X-Forwarded-Host/-Proto — only behind a proxy you control
  checkOrigin: true, // CSRF origin check on server-action POSTs
  allowedOrigins: [], // extra origins allowed to post actions, e.g. ['https://admin.example.com']
  csp: false, // strict per-request-nonce Content-Security-Policy
  cspDirectives: {}, // widen the built-in CSP, e.g. { 'img-src': "'self' https://cdn.example.com" }
  bodySizeLimit: '1mb', // request body cap: '512kb' | 4_000_000 | false to disable
  rspack(config, { isServer, isDev }) {
    return config; // escape hatch: mutate the generated Rspack config
  },
});
```

The framework settings — `trustProxy`, `checkOrigin`, `allowedOrigins`, `csp`, `cspDirectives`,
`bodySizeLimit` — are resolved at build time and **compiled into the server bundle**. There is no
parallel env-var interface for them, so changing one means a rebuild. Two deployment-conventional
exceptions stay env-overridable: `--port` / `PORT` and `HOST`, each winning over the file, which wins
over the default. Point a build at a different file with `--config <path>`.

## `siteUrl`

The public origin the site is served from. Used only when prerendering
[`render: 'static'`](/docs/routing#static-rendering) routes, where there is no request to read a `Host`
from. The origin is what's used; a path is **rejected** rather than silently dropped, because a base
path is not supported.

## The `rspack` hook

Mutate the generated Rspack config just before it is compiled:

```ts
rspack(config, { isServer, isDev }) {
  config.module!.rules!.push({ test: /\.md$/i, type: 'asset/source' });
}
```

Called **once per compiler** — `isServer` tells the `target: node` bundle from the `target: web` one,
`isDev` tells `rshono dev` from `rshono build`. Mutate in place and return nothing, or return a
replacement. This is how [Tailwind](/docs/styling#tailwind) is wired up.

## Environment and secrets

The client/server boundary is the RSC directives — `'use client'` and `'use server'` — not filenames,
and `process.env` follows it.

In client code `process.env` is **replaced at build time** with a literal containing only `NODE_ENV` and
`PUBLIC_`-prefixed variables. A stray `process.env.DATABASE_URL` compiles to `undefined`. That is a hard
guarantee rather than tree-shaking, and it covers `node_modules` too.

`'use client'` modules are also rendered on the server, and there they see the same `PUBLIC_`-only view,
so SSR output agrees with hydration and a secret cannot leak into the HTML stream. One boundary on that:
the SSR-side shadowing is scoped to your own `src/`, so a **third-party** client component reading
`process.env` during SSR sees the real environment.

Server components and `'use server'` actions read the **real** `process.env`. They run only on the
server, so a secret read there never reaches the browser. Read secrets in server code and pass derived
data down.

`.env.local` and `.env` are loaded automatically, and the real environment wins over both. Commit `.env`
with safe defaults; keep `.env.local` gitignored.

Two things worth remembering:

- **Anything a server component renders is public.** Whatever is in the tree ships in the flight
  payload. The boundary protects `process.env`, not your JSX.
- **Keeping a server-only module out of the client bundle is the module graph's job.** For a hard
  failure if that slips, add React's `server-only` package — the RSC layer resolves its `react-server`
  condition, so importing it from client code throws.

## CSRF

Server-action POSTs are origin-checked automatically. A cross-origin `Origin` compared against your own
host is rejected with 403, as is anything the browser labels `Sec-Fetch-Site: cross-site` or `same-site`.
A browser-asserted `same-origin` is accepted directly, which keeps the check from misfiring behind a
proxy that rewrites `Host`.

It applies to client-initiated calls and no-JS form posts alike. Turn it off with `checkOrigin: false`
behind a gateway that enforces it, or list trusted cross-origins in `allowedOrigins` — full origins or
bare hosts; a malformed entry fails the build.

The check proves a request came from your own site. It says nothing about _who_ sent it — every
[`'use server'` export is a public endpoint](/docs/server-actions#every-action-is-a-public-endpoint).

## Proxy headers

`X-Forwarded-Host` and `X-Forwarded-Proto` are client-supplied and **not trusted by default**. Honouring
them blindly lets anyone who can reach the server dictate the origin of every absolute URL the app
builds, poisoning canonical tags, emails, redirects and any shared cache in front. Set
`trustProxy: true` only when a proxy you control sets them. `rshono dev` forces it on for its own
localhost-bound proxy.

## Request-body limit

Bodies are capped (`bodySizeLimit`, default 1 MiB) **before** being buffered into memory; oversized ones
are rejected with `413`. This covers every route, not just actions — endpoint routes and the
`src/server.ts` sub-app are equally exposed the moment they call `.json()` or `.formData()`. An over-cap
`Content-Length` is refused up front; chunked bodies are cut off mid-stream. Set `false` to disable.

## Response headers and caching

Unconditionally, on every response:

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: SAMEORIGIN
```

A **dynamic page** is answered `Cache-Control: private, no-cache` — a page is request-specific by
default, and with no directives a shared cache is free to store one user's page and serve it to the
next. Set your own value from middleware and it is left alone. **Prerendered pages** keep
`public, max-age=300` and a weak `ETag`.

Every page response carries `Vary: Accept`, because one URL answers with either an HTML document or a
flight payload depending on it.

## CSP (opt-in)

`csp: true` sends a strict per-request-nonce `Content-Security-Policy` with every HTML document; the
nonce is stamped on bootstrap scripts, the inlined flight payload and dynamically loaded chunks.

Beyond `default-src 'self'` it closes the gaps `default-src` does not cover — `base-uri`, `object-src`,
`frame-ancestors`, `form-action` — so it blocks framing and third-party assets until widened with
`cspDirectives`. The nonce is always re-appended to `script-src`, and `''` drops a directive. While
enabled, the document for a static route is [rendered per request](/docs/routing#static-rendering).

## Errors and redaction

Every error the framework catches goes through [`onServerError`](/docs/hono#error-reporting) and to
`stderr`. Thrown server-action errors are redacted in the production payload — React sends no message or
digest — so return values, not throws, for anything the user should see. The `error` page's `error` prop
is message-only in production, message plus stack in dev.

## No blank screens

Three fallbacks behind the `error` page, so a failure is always readable:

- An **uncaught client-side render error** makes React tear down its root — which here is the whole
  document. The runtime paints a fatal overlay instead: full stack in dev, a generic notice plus a
  reload button in production.
- If **SSR fails before the shell is sent**, the `error` page cannot be reached either, so the framework
  answers with its own visible 500 document. It attaches no client runtime deliberately: the flight
  payload came from the same failed render, and hydrating it would blank the message.
- A **client bootstrap failure** — a truncated or malformed initial payload — is reported and surfaced
  rather than becoming a silent unhandled rejection.
