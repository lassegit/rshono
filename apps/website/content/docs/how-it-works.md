---
title: How it works
description: Two coordinated Rspack compilers, a worker-thread dev server, and one platform interface.
---

Two coordinated Rspack compilers, using native RSC support (`rspack.experiments.rsc`):

- **client** (`target: web`) → `dist/static`: hydration runtime, `'use client'` chunks, CSS.
- **server** (`target: node`) → `dist/server/main.mjs`: the app server itself — a Hono app assembled
  from your routes, rendered through two layers. The RSC layer, with the `react-server` condition,
  produces the flight payload; the SSR layer turns it into an HTML stream with the payload inlined for
  hydration.

## In development

The CLI watches both bundles and runs the server bundle **in a worker thread**, restarted per rebuild.
Requests gate on readiness, so there are no dropped connections across a restart.

Everything is fronted on one port with static serving and an SSE channel:

- Client edits hot-apply via react-refresh.
- Server component edits re-fetch the payload in place.

Browser state survives both.

## In production

`dist/server/main.mjs` is self-contained — React, Hono and the framework are bundled in; your other npm
dependencies resolve from `node_modules`. Run it with `rshono start`, or any process manager running
`node dist/server/main.mjs`.

## One interface for the platform

Everything in that bundle that depends on _where_ it runs — binding a port, serving `/_static` and
`public/`, reading a prerendered page, gzipping, loading `.env` — sits behind a single interface
(`DeployRuntime`) that the build resolves per [`deploy` target](/docs/deployment).

So the request-handling code has no platform in it. The entry's default export is whatever the platform
expects: nothing where rshono owns the process, a `fetch` handler where the host does.

## Testing

`pnpm --filter @rshono/core test` builds the package and runs everything that doesn't need a browser:

- **unit** — the parsers and path maths: `bodySizeLimit`, `allowedOrigins`, SSG paths and traversal,
  control-signal digests, page-file scanning, `Vary`/`ETag` helpers. It imports the built `dist/`, so it
  also proves the published output loads in plain Node.
- **compression** — that gzip does not swallow a streamed response. A chunk the renderer flushes has to
  reach the client while the response is still open, which is the one property the platform
  `CompressionStream` would quietly break.
- **production e2e** — builds a real app, boots the real production server, and asserts pages, flight
  protocol, actions (client and progressive enhancement), CSRF rejection, secret stripping in bundles
  _and_ rendered HTML, SSG output with `ETag`/304, cache and security headers, and error reporting.
  Settings baked into the bundle — CSP, CSRF allowlist, origin check, body-size cap — each get their own
  build from a fixture config.
- **minimal app** — a fixture with `src/routes.ts` and nothing else: no `server.ts`, no `public/`, no
  config, no `notFound`/`error` pages. Everything the docs call optional, actually left out.
- **postcss** — a Tailwind fixture wiring the loader up through the `rspack` hook, from an
  `@import "tailwindcss"` nothing could resolve through to compiled utilities in the stylesheet the
  served page links. The documented four lines, actually run.
- **dev** — a smoke test through the dev server's worker and proxy.

`pnpm --filter @rshono/core test:browser` runs the Playwright suite against a production build:
hydration, soft navigation, prefetch-on-hover, `useNavigation`, client-initiated actions, boundary
fallbacks, scroll restoration and the fatal overlay — the client runtime, which no amount of asserting
on HTML can reach.
