---
title: Security & hardening
description: What is on by default, what is opt-in, and the reasoning behind each default.
---

## Server actions are public endpoints

**Every `'use server'` export is a public HTTP endpoint.** That's the RSC model, not an rshono choice:
the client is handed an id for each action and can call it with whatever arguments it likes.

The CSRF check below proves a request came from your own site. It says nothing about _who_ sent it.
Authenticate and authorize inside the action, and validate its arguments, exactly as you would in a
route handler.

## CSRF

Server-action POSTs are origin-checked automatically. A cross-origin `Origin`, compared against your own
host, is rejected with 403 — as is anything the browser labels `Sec-Fetch-Site: cross-site` or
`same-site`.

A browser-asserted `Sec-Fetch-Site: same-origin` is accepted directly, which is what keeps the check
from misfiring behind a proxy that rewrites `Host`.

Applies to both client-initiated calls and no-JS form posts. Turn it off with `checkOrigin: false`
behind a gateway that already enforces it, or list trusted cross-origins in `allowedOrigins` — full
origins or bare hosts; a malformed entry fails the build.

## Proxy headers are not trusted by default

`X-Forwarded-Host` and `X-Forwarded-Proto` are client-supplied. Honouring them blindly lets anyone who
can reach the server dictate the origin of every absolute URL the app builds — `getContext().url`, a
page's `url` prop — poisoning canonical tags, emails and redirects, and any shared cache in front.

Set `trustProxy: true` only when a proxy you control sets those headers. `rshono dev` forces it on for
its own localhost-bound proxy.

## Request deadline

Every request races a timeout (`renderTimeout`, default 10000 ms) and the client-disconnect signal —
covering the server action as well as flight and SSR. Neither a hung data fetch nor a hung mutation can
pin sockets open.

## Request-body limit

Request bodies are capped (`bodySizeLimit`, default 1048576 = 1 MiB) **before** they are buffered into
memory. Oversized bodies are rejected with `413 Payload Too Large`.

This covers **every** route, not just server actions: `{ type: 'endpoint' }` routes and the
`src/server.ts` sub-app are equally exposed the moment they call `.json()` or `.formData()`.

An over-cap `Content-Length` is refused up front; bodies that omit it (chunked) are cut off mid-stream.
Set to `false` / `0` to disable — behind a proxy that already enforces a limit, or to stream a large
upload yourself. Raise it for large multipart uploads.

## Baseline response headers

On every response, unconditionally:

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: SAMEORIGIN
```

The framing header is the floor for everyone who hasn't opted into `csp` — that policy's
`frame-ancestors 'none'` is stricter and takes precedence where both apply. Set any of them in your own
middleware to override.

## Caching defaults

A **dynamic page** is answered with `Cache-Control: private, no-cache`. A page is request-specific by
default — cookies, session, headers — and with no directives at all a shared cache is free to store one
user's page and serve it to the next. `private` forbids exactly that, and `no-cache` makes the browser
revalidate rather than re-show a stale personalised page. Neither disables bfcache the way `no-store`
would.

Set your own value, from middleware or `getContext().header(…)`, and it is left alone.

**Prerendered pages** keep `public, max-age=300` and carry a weak `ETag`, so a revalidation costs a 304
instead of the page.

## `Vary: Accept`

One URL answers with an HTML document or a flight payload depending on `Accept`. Without `Vary` a cache
keyed on the URL alone will eventually hand a document to a soft navigation that asked for flight — a
hard reload at best.

Compression appends `Accept-Encoding` to the same header rather than replacing it.

## CSP (opt-in)

Set `csp: true` to send a strict per-request-nonce `Content-Security-Policy` with every HTML document —
the nonce is stamped on bootstrap scripts, the inlined flight payload, and dynamically loaded chunks.

Beyond `default-src 'self'` it also closes the gaps `default-src` doesn't cover: `base-uri`,
`object-src`, `frame-ancestors`, `form-action`. So it blocks framing and third-party assets until you
widen it with `cspDirectives` — the nonce is always re-appended to `script-src`, and `''` drops a
directive.

While enabled, the document for a `render: 'static'` route is rendered per request. See
[Prerendering](/docs/prerendering#the-csp-interaction).

## Error reporting and redaction

Every error the framework catches — a thrown action, a failed render, SSR falling over, anything
reaching the top-level handler — goes through one funnel:

```ts
// src/server.ts
import { onServerError } from '@rshono/core/server';

onServerError((error, { source, request }) => {
  Sentry.captureException(error, { tags: { source }, extra: { url: request.url } });
});
```

Errors keep going to `stderr` either way, and a handler that throws is caught rather than failing the
request.

Thrown server-action errors are redacted in the production payload — React sends no message or digest
for them. Return values, not throws, for anything the user should see. Custom 404/500 pages are real
server components declared in `routes.ts`; the error page's `error` prop is message-only in production,
message plus stack in dev.

## No blank screens

Three fallbacks behind the `error` page, so a failure is always something you can read:

- An **uncaught client-side render error** makes React tear down its root — which here is the whole
  `document`, so the page would go genuinely white with the reason only in the console. The runtime
  paints a fatal overlay over it instead: full stack and component stack in dev, a generic notice plus a
  reload button in production, with the dev detail compiled out of the production bundle.
- If **SSR fails before the shell is sent**, the `error` page can't be reached either, so the framework
  answers with its own visible 500 document. It deliberately attaches no client runtime: the flight
  payload came from the same failed render, so hydrating it would tear the document down and blank the
  message.
- A **client bootstrap failure** — a truncated or malformed initial payload — is reported and surfaced
  rather than becoming a silent unhandled rejection.
