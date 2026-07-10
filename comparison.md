# rs-hono vs Next.js, TanStack Start, and HonoX

A comparison of [`packages/rs-hono`](packages/rs-hono) — an ultra-minimalist SSR/SSG framework built on Hono + Rspack (~2,000 lines of source, 3 runtime dependencies) — against the three frameworks it most naturally competes with. Facts are as of **July 2026**: Next.js 16.2, TanStack Start 1.0 RC, HonoX 0.1.58. Install sizes were measured locally (npm, macOS arm64; native binaries vary by platform).

## Comparison table

| | **rs-hono** | **Next.js 16** | **TanStack Start** | **HonoX** |
|---|---|---|---|---|
| **Maturity** | Proof of concept | Stable — 16.2 (major since Oct 2025), 140k★ | v1.0 **RC** since Sept 2025, stable still not cut | **Alpha** — 0.1.58, on 0.x for 2.5 years, breaking changes allowed |
| **Framework source** | ~2,000 lines | ~72 MB of source in the monorepo (order of ~2M lines incl. tests) | ~400–450k lines monorepo (Router + Start) | Small (85 kB package) |
| **Direct runtime deps** | 3 (`@hono/node-server`, `@rspack/core`, `tsx`) + `hono`/React as peers | 6 (+9 optional native binaries) | 9 | 7 (incl. four `@babel/*` packages) |
| **Bare install (measured)** | **11 packages / 64 MB** (40 MB is Rspack's binary) | 22 packages / **329 MB** (SWC binary 129 MB) | 109 packages / 94 MB | 94 packages / 89 MB (with Vite) |
| **Default scaffold install** | — (minimal template) | 363 packages / 464 MB | ~260 packages / 234 MB | — |
| **Routing** | **Explicit manifest** (`routes.ts`, single source of truth) | File conventions (`app/` dir, magic filenames) | File-based + generated route tree (code-based possible) | File-based (`app/routes/`, `_renderer.tsx`, `_middleware.ts`) |
| **Rendering** | Streaming SSR + Suspense | RSC-first, streaming, Cache Components (`"use cache"`) | Streaming SSR, per-route selective SSR, RSC experimental (Apr 2026) | Per-request SSR (hono/jsx default; React opt-in), streaming via `jsxRenderer` |
| **SSG** | **Build-time prerender** (`kind: 'static'`; param routes enumerate pages via `staticPaths()`), per-request SSR fallback for anything not prerendered | Mature, default for static pages | Prerender + link crawling, SPA mode | Via `@hono/vite-ssg` plugin (two-pass build) |
| **Data loading** | Per-route `loader` in a co-located `*.server` module, may return a `Response` | RSC async components + Server Actions + fetch cache | Isomorphic loaders + `createServerFn` RPC + first-class TanStack Query | None — write Hono handler code inline |
| **Loader → props typing** | **Full inference** — `LoaderProps<typeof loader>`, typed path params from the pattern, compile-time route validation | Manual (you type your own boundaries) | **Full end-to-end inference** (headline feature) | n/a (no loader concept) |
| **Server/client boundary** | `*.server.*` module replacement — **build-time guarantee**, fails loudly in browser | `"use client"` / `"use server"` directives + `server-only` package | Compiler extracts server functions from shared files | Islands convention (`app/islands/`, `$` prefix); islands can't access Hono context |
| **Client-side navigation** | None (MPA — full page loads) | Yes | Yes — typed `<Link>`, prefetching | None (MPA) |
| **Dev feedback loop** | Server restart + **auto live-reload** (SSE; full reload, no HMR state preservation) | Fast Refresh (incl. Server Fast Refresh in 16.2) | Vite HMR | Vite HMR |
| **API routes** | **Full Hono** (middleware, RPC, WebSockets, sub-apps) | Route handlers + `proxy.ts` (renamed from middleware in 16) | Server routes + server functions | **Full Hono** (mount `Hono` instances per route file) |
| **Bundler** | Rspack (Rust, webpack-compatible) | Turbopack (Rust, default since 16.0) | Vite 8 (Rolldown) or Rsbuild | Vite |
| **Deploy targets** | **Node only** (`node:*` APIs, tsx at runtime) | Node, Vercel (Build Adapters API new in 16) | Node, Cloudflare Workers, Netlify, Railway, Vercel, Bun — via Nitro | Any Hono target; **Cloudflare Workers first-class**; Deno broken in practice |
| **Ecosystem & docs** | None — the source *is* the docs | Massive; biggest hiring pool | Growing fast; good docs; won "Breakthrough of the Year" 2026 | Sparse — README is the documentation |
| **Security surface** | Tiny, fully auditable; sound defaults (escaped hydration payload, path-traversal-safe statics, localhost-only dev) | [CVE-2025-29927](https://nvd.nist.gov/vuln/detail/CVE-2025-29927) (9.1 — middleware auth bypass), plus cache-poisoning and SSRF CVEs in 2024–25 | No notable CVEs; 109-package supply chain | No notable CVEs; alpha status is itself the risk |

## Where rs-hono wins

- **Comprehensibility.** At ~2,000 lines a single developer can read the entire framework in an afternoon. When something breaks, you debug real stack traces through code you can read — the exact opposite of the Next.js experience, where "because of all of the abstraction required to function, debugging is a nightmare" ([Kyle Gill](https://www.kylegill.com/essays/next-vs-tanstack/)). There is no cache hierarchy, no compiler transform, no RSC serialization layer between you and the bug.
- **Supply chain and upgrade surface.** 11 packages / 64 MB installed vs 363 packages for a default Next.js scaffold. Fewer packages means fewer CVE exposures, faster CI installs, and near-zero upgrade churn. Next.js's worst recent bug (CVE-2025-29927, CVSS 9.1) lived precisely in framework magic — an internal header nobody knew existed bypassed middleware auth entirely. rs-hono has no hidden internal protocol to spoof.
- **Explicit routing beats convention magic.** `routes.ts` is greppable, refactorable, and type-checked. There are no magic filenames to memorize and no "can't ⌘-search a file convention" discoverability problem. Next.js and HonoX both encode behavior in filesystem conventions; TanStack Start generates a route tree; rs-hono routes are just data.
- **The strongest server/client boundary of the four.** `*.server.*` modules are physically replaced with a throwing stub in the client bundle — a build-time guarantee enforced by module replacement, not a lint rule (`server-only`), directive discipline (`"use server"`), or tree-shaking best effort. Accidental leaks fail loudly in the browser console instead of silently shipping secrets.
- **Full Hono for APIs.** Next.js route handlers and TanStack server routes are constrained subsets; rs-hono (like HonoX) gives you the entire Hono ecosystem — middleware, validators, RPC clients, WebSockets — because your `server.ts` *is* a Hono app.
- **No lock-in of any kind.** No vendor platform (Vercel), no perpetual-RC treadmill (TanStack), no alpha breaking-change policy (HonoX). If rs-hono stops fitting, its concepts (Hono handlers, plain React components, a route array) port almost anywhere.

## Where rs-hono loses

- **No ecosystem, no community, no battle-testing.** Next.js has ~2M lines solving problems you haven't hit yet: image optimization, i18n, ISR, partial prerendering, font optimization. rs-hono solves none of them, and every one you need becomes your code.
- **Dev feedback loop — gap narrowed, not closed.** The browser now auto-reloads once the rebuilt bundle is ready (see improvement 3), so the manual-refresh era is over. What remains vs HMR/Fast Refresh: every edit is a full `tsx watch` server restart plus a page reload, so component state is lost and the loop takes seconds rather than milliseconds. Both Vite-based competitors and Next.js keep component state across edits.
- **No client-side navigation.** Every link is a full page load. Fine for content sites and dashboards with few transitions; wrong for app-like UIs. TanStack Start's typed `<Link>` + prefetch + client cache is a different league here. (HonoX shares this MPA limitation.)
- **Type-safety gap — mostly closed.** Loader data and path params now infer end-to-end (`LoaderProps<typeof loader>`, pattern-typed `c.req.param()`, compile-time route validation). What remains vs TanStack Start is typed *navigation*: search-param schemas and typed `<Link>`s don't exist because there is no client router at all.
- **Head/meta management and SSG** — both formerly listed as gaps here — have since shipped: pages now own the full `<html>` document, so titles and OG tags are ordinary props/JSX (see improvement 2), and `kind: 'static'` routes prerender at build time (see the table).
- **Node-only.** `node:fs`, `node:stream`, `@hono/node-server`, and running TS via tsx bind rs-hono to Node servers. HonoX deploys to Cloudflare Workers first-class; TanStack Start reaches most hosts via Nitro. rs-hono also ships TypeScript source to production and needs `tsx` + Rspack in the production image.
- **Bus factor of one.** HonoX at least has the Hono org behind it; Next.js and TanStack have full-time teams. rs-hono is maintained by its author.

**Bottom line:** rs-hono is a compelling alternative when the app is a server-rendered site with real API needs, the team values auditability and a minimal supply chain, and MPA navigation is acceptable. Choose Next.js for ecosystem breadth and RSC, TanStack Start for end-to-end type safety and client-side UX, HonoX for edge deployment with islands. rs-hono's honest niche is closest to HonoX's — but with React, streaming, and a stronger server/client boundary, at the cost of edge portability.

---

## Improvement analysis

Improvements that would close the gaps above, ordered within each theme by value-for-effort. Line references are to `packages/rs-hono/src/`.

### Developer experience

**1. ~~Loader → props type inference~~ — ✅ shipped, together with hard server-code stripping.**
Shipped as a different (and stronger) design than the `page()` helper sketched here: loaders moved into co-located `*.server` modules referenced from routes.ts via a lazy `server:` thunk, so loader/handler code is now *physically absent* from the client bundle (the existing module-replacement guarantee), not just inert. `defineLoader(path, fn)` types `c` from the route pattern; components derive props with `LoaderProps<typeof loader>` through an erased type-only import — zero hand-written prop types, no casts; `defineRoutes` validates path↔loader drift and component-props compatibility at compile time. (The sketched same-object inference turns out to be unimplementable: a `NoInfer` on a sibling property fixes the type parameter to its default before TypeScript processes the context-sensitive loader.)

**2. ~~Per-page `<head>` control~~ — ✅ shipped, as full document ownership.**
Shipped as a stronger design than the data-only `head` field sketched here: the framework no longer renders any HTML shell at all. The page's own component tree renders `<html>`/`<head>`/`<body>` — usually via a plain imported layout component — and the client hydrates the entire document (`hydrateRoot(document)`; requires React 19, whose hydration skips extension-injected nodes). Titles, meta and OG tags are ordinary props and JSX (`<Layout title={user.name} description={user.bio}>`), and one-off tags rendered deeper in the tree are hoisted into `<head>` by React 19 — no head-manager API to learn. The hardcoded stylesheet link died with the shell: imported CSS (global or `*.module.css`) is bundled by Rspack into one content-hashed file and linked by an `<Assets/>` component in the layout's head, with a Node loader hook keeping CSS imports inert during SSR and CSS-module class names deterministic across server and client. A dev guardrail warns when a page's output doesn't start with `<!DOCTYPE`. (The sketched `head:` route field was dropped on purpose: it would have grown into a second, data-only templating system with its own escaping rules, when React already is the templating layer — and per-page head data flows naturally once the layout is ordinary JSX.)

**3. ~~Auto-reload in dev~~ — ✅ shipped, as version-stamped live reload.**
Shipped close to the sketch — a dev-only SSE endpoint under the reserved prefix (`/_rs-hono/reload`, `server/dev-reload.ts`), pinged from the Rspack watch callback — but with two corrections the sketch didn't survive. First, there is no HTML shell to inject into anymore (improvement 2 removed it), so the one-line `EventSource` snippet rides in with React's `bootstrapScriptContent` on every page, and as a plain `<script>` tag on dev error and 404 pages. Second, reload-on-socket-drop was replaced by a version comparison: reloading the moment the connection drops races the multi-second restart + compile and lands on a dead server or a half-built bundle. Instead each page is stamped at render time with the build version it was rendered from (`pid:compilationHash` — pid catches restarts whose bundle is byte-identical, hash catches rebuilds), and the browser reloads only when the server announces a *different* version. A restarting server announces nothing until its first compile succeeds, so reloads always land on a ready bundle. The one comparison buys several behaviors for free: pages served before the first compile (stamped `pending`) heal their missing-CSS render automatically, an error page recovers the moment the broken loader is fixed, a 404 flips to the real page when its route is added, and idle reconnects (laptop sleep) never spuriously reload. ~70 lines, no new dependencies (`streamSSE` ships with Hono), nothing injected outside dev. React Fast Refresh remains future work on purpose: page components are in the server's import graph, so every component edit restarts the process anyway — keeping hot component state would mean exempting them from `tsx watch` and solving Node ESM cache invalidation, a different framework's worth of complexity.

**4. An Rspack escape hatch in config.**
`rs-hono.config.ts` currently exposes no way to touch the bundler, so adding Tailwind, SVGR, or a resolve alias means forking `builder/rspack-config.ts`. One optional hook preserves the minimalist default while unlocking the entire webpack-compatible ecosystem:

```ts
export default defineConfig({
    rspack: (config) => { config.plugins.push(...); return config; },
});
```

~10 lines: thread `config.rspack` through the two `createClientRspackConfig` call sites (`cli/dev.ts:28`, `cli/build.ts:51`).

**5. Small papercuts.** `loadRoutes` only looks for `src/routes.ts` (`server/load.ts:18`) — also accept `.tsx`/`.js`/`.jsx`. Allow `method: HTTPMethod[]` on endpoint routes. Warn at startup when a page module has no default export instead of failing at request time.

### Simpler and smaller code

**6. Replace the hand-rolled stream bridge.**
`server/ssr.ts:44-74` manually adapts React's Node `Writable` to a web `ReadableStream` (~30 lines including error/close handling). Node's built-in converter does the same with backpressure handled for free:

```ts
const pass = new PassThrough();
pass.on('close', () => { clearTimeout(timer); abort(new Error('cancelled')); });
pipe(pass);
resolve(Readable.toWeb(pass) as ReadableStream<Uint8Array>);
```

~8 lines, one less custom moving part, and behavior (cancel → abort render) is preserved via the `close` event. A larger step — switching to `renderToReadableStream` from `react-dom/server.edge` — would delete the bridge concept entirely *and* open the door to non-Node runtimes, but React still recommends the pipeable API on Node for throughput, so treat that as a future portability decision rather than a cleanup.

**7. Merge the middleware wrapper into `buildApp`.**
`server/handler.ts:49-54` builds a second outer `Hono` app solely because middleware must be registered before routes. Passing `config.server?.middleware` into `buildApp` and calling `app.use('*', mw)` right after the dev logger (`app.tsx:128`) removes the wrapper app and the subtle ordering comment. Net −10 lines and one less indirection.

### Faster

**8. Set `NODE_ENV=production` in `rs-hono start`.**
Nothing sets `NODE_ENV` for the production server (`cli/start.ts`, `bin/cli.cjs`), so unless the user exports it themselves, **react-dom/server runs in development mode during SSR** — dev-only checks typically cost 2–5× render throughput. Three lines in `bin/cli.cjs` (set it in the child env for `start`, before Node loads React) is likely the single largest cheap performance win in the codebase.

**9. ~~Cache `'static'` routes at runtime (then real SSG)~~ — ✅ shipped as build-time SSG.**
`rs-hono build` now prerenders every `kind: 'static'` route to `<outDir>/ssg` (`server/ssg.ts`) by issuing real requests against the assembled app, so loaders, the hydration payload, and streaming SSR are reused unchanged. Param routes enumerate their pages via `staticPaths()`; in production, prerendered HTML is served straight from disk with per-request SSR as the fallback (params without `staticPaths()`, build-time skips, paths added since the build). The interim runtime render-cache proposed here was skipped in favor of going straight to build-time prerendering.

**10. Parallelize and pre-warm page modules.**
`createPageApp` awaits the loader, *then* awaits `route.component()` (`app.tsx:180-205`), though the two are independent — `Promise.all` them. And in production, fire-and-forget `pageRoutes.map(r => r.component())` at startup so the ESM module cache is warm before the first request instead of during it. Both are a few lines; they mainly cut first-hit latency.

**11. Compress and cache-immortalize assets.**
The client bundle is served uncompressed, and the entry chunk `main.js` deliberately has a stable, un-hashed name (`builder/rspack-config.ts:50`) so it only gets `max-age=300` (`server/static.ts:37`). Two compounding fixes: (a) emit `.br`/`.gz` at build time and flip on `precompressed: true` in `serveStatic` (`static.ts:46-51`) — the installed `@hono/node-server` v2 already supports it, and JS typically shrinks 65–75%; (b) content-hash the entry `main.js` and serve it through the asset manifest that the CSS pipeline already introduced (`assets.json` + `<Assets/>` — emitted CSS is hashed and `immutable` today), which upgrades the JS entry to `immutable` caching too. (a) is trivial; (b) is now a small extension of an existing mechanism rather than new plumbing.

### Suggested order

| # | Improvement | Impact | Effort |
|---|---|---|---|
| 8 | `NODE_ENV=production` in start | High (SSR throughput) | Trivial |
| ~~1~~ | ~~Loader → props inference~~ ✅ shipped (`defineLoader` + `LoaderProps`, `*.server` route modules) | High (DX, headline gap) | Done |
| ~~3~~ | ~~Dev auto-reload (SSE)~~ ✅ shipped (version-stamped live reload, `server/dev-reload.ts`) | High (daily DX) | Done |
| ~~2~~ | ~~Per-page `<head>`~~ ✅ shipped (pages own the document; layouts render `<html>`/`<head>`, CSS via `<Assets/>`) | High (unblocks real sites) | Done |
| ~~9~~ | ~~Static-route caching → SSG~~ ✅ shipped (`server/ssg.ts`) | High (perf, honesty of `static`) | Done |
| 4 | Rspack config hook | Medium (prevents forks) | Trivial |
| 11 | Precompression + hashed entry | Medium (page weight) | Small → Medium |
| 6, 7 | Stream bridge + middleware wrapper cleanup | Code size/clarity | Small |
| 10 | Parallel loader/import + pre-warm | Low–Medium (latency) | Trivial |
| 5 | Papercuts (routes.tsx, method arrays) | Low | Trivial |

Notably absent: client-side navigation, RSC, and edge-runtime support. Each would multiply the framework's size and complexity — the moment rs-hono grows a client router and a serialization protocol, its comparison column starts looking like TanStack Start's, without the team to maintain it. The remaining improvements all fit the existing ~2,000-line budget (a few dozen lines net, some of it offset by items 6–7) while removing the biggest disadvantage users still hit: slow production SSR (manual refresh, missing titles and prop casting are gone — see items 1, 2, 3 and 9).
