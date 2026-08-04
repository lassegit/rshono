---
title: Requirements & limitations
description: What rshono needs, and the sharp edges worth knowing before you commit to it.
---

## Requirements

- **Node ≥ 22.18** — worker threads, `process.loadEnvFile`, `Promise.withResolvers`, `URL.parse`, and native TypeScript stripping for a `.ts` config.
- **React ≥ 19.1** — the floor `react-server-dom-rspack` itself requires.

## Alpha

The framework is covered by an end-to-end suite, but it is built on Rspack's experimental RSC support
(`rspack.experiments.rsc`) and `react-server-dom-rspack`, which is still `0.0.x`.

Those two move underneath us, so `@rspack/core` and `react-server-dom-rspack` are pinned to exact
versions, and a release of rshono is what moves them.

## Known limitations

- **No compression.** It belongs in a proxy, a load balancer or a CDN, and every hosted target already
  does it. `hono/compress` in `src/server.ts` if you need it in-process.
- **Scroll restoration is the browser's** (`history.scrollRestoration = 'auto'`). A soft navigation to a
  new page starts at the top and a traversal is restored by the browser, but a `#hash` on a link to a
  _different_ page is not chased — the target does not exist until the new payload commits — so it lands
  on the page rather than the heading. Same-page anchors jump natively and are untouched.
- **No prefetching.** A navigation fetches when it is asked for; there is no speculative warming on
  hover or focus.
- **The dev-mode proxy doesn't forward WebSocket upgrades** to a custom sub-app. Production is
  unaffected — the bundle owns the socket there.
- **Dev source maps embed the original source of `'use server'` action modules.** Dev binds to
  127.0.0.1 only, and production ships no client source maps.
- **No base path.** `siteUrl` must be a bare origin; a path is rejected rather than silently dropped.
- **Wildcard, optional and regex params cannot be prerendered** — see
  [Prerendering](/docs/prerendering#staticpaths).
- **Lambda@Edge is not a deploy target**, deliberately — see [Deployment](/docs/deployment#aws).
