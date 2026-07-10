# rs-hono vs Next.js, TanStack Start, and HonoX

A comparison of [`packages/rs-hono`](packages/rs-hono) — an ultra-minimalist SSR/SSG framework built on Hono + Rspack (~1,550 lines of source, 3 runtime dependencies) — against the three frameworks it most naturally competes with. Facts are as of **July 2026**: Next.js 16.2, TanStack Start 1.0 RC, HonoX 0.1.58. Install sizes were measured locally (npm, macOS arm64; native binaries vary by platform).

## Comparison table

| | **rs-hono** | **Next.js 16** | **TanStack Start** | **HonoX** |
|---|---|---|---|---|
| **Maturity** | Proof of concept | Stable — 16.2 (major since Oct 2025), 140k★ | v1.0 **RC** since Sept 2025, stable still not cut | **Alpha** — 0.1.58, on 0.x for 2.5 years, breaking changes allowed |
| **Framework source** | ~1,550 lines | ~72 MB of source in the monorepo (order of ~2M lines incl. tests) | ~400–450k lines monorepo (Router + Start) | Small (85 kB package) |
| **Direct runtime deps** | 3 (`@hono/node-server`, `@rspack/core`, `tsx`) + `hono`/React as peers | 6 (+9 optional native binaries) | 9 | 7 (incl. four `@babel/*` packages) |
| **Bare install (measured)** | **11 packages / 64 MB** (40 MB is Rspack's binary) | 22 packages / **329 MB** (SWC binary 129 MB) | 109 packages / 94 MB | 94 packages / 89 MB (with Vite) |
| **Default scaffold install** | — (minimal template) | 363 packages / 464 MB | ~260 packages / 234 MB | — |
| **Routing** | **Explicit manifest** (`routes.ts`, single source of truth) | File conventions (`app/` dir, magic filenames) | File-based + generated route tree (code-based possible) | File-based (`app/routes/`, `_renderer.tsx`, `_middleware.ts`) |
| **Rendering** | Streaming SSR + Suspense | RSC-first, streaming, Cache Components (`"use cache"`) | Streaming SSR, per-route selective SSR, RSC experimental (Apr 2026) | Per-request SSR (hono/jsx default; React opt-in), streaming via `jsxRenderer` |
| **SSG** | **Build-time prerender** (`kind: 'static'`; param routes enumerate pages via `staticPaths()`), per-request SSR fallback for anything not prerendered | Mature, default for static pages | Prerender + link crawling, SPA mode | Via `@hono/vite-ssg` plugin (two-pass build) |
| **Data loading** | Per-route server `loader`, may return a `Response` | RSC async components + Server Actions + fetch cache | Isomorphic loaders + `createServerFn` RPC + first-class TanStack Query | None — write Hono handler code inline |
| **Loader → props typing** | **Not yet** — components cast props manually | Manual (you type your own boundaries) | **Full end-to-end inference** (headline feature) | n/a (no loader concept) |
| **Server/client boundary** | `*.server.*` module replacement — **build-time guarantee**, fails loudly in browser | `"use client"` / `"use server"` directives + `server-only` package | Compiler extracts server functions from shared files | Islands convention (`app/islands/`, `$` prefix); islands can't access Hono context |
| **Client-side navigation** | None (MPA — full page loads) | Yes | Yes — typed `<Link>`, prefetching | None (MPA) |
| **Dev feedback loop** | Server restart + **manual browser refresh** | Fast Refresh (incl. Server Fast Refresh in 16.2) | Vite HMR | Vite HMR |
| **API routes** | **Full Hono** (middleware, RPC, WebSockets, sub-apps) | Route handlers + `proxy.ts` (renamed from middleware in 16) | Server routes + server functions | **Full Hono** (mount `Hono` instances per route file) |
| **Bundler** | Rspack (Rust, webpack-compatible) | Turbopack (Rust, default since 16.0) | Vite 8 (Rolldown) or Rsbuild | Vite |
| **Deploy targets** | **Node only** (`node:*` APIs, tsx at runtime) | Node, Vercel (Build Adapters API new in 16) | Node, Cloudflare Workers, Netlify, Railway, Vercel, Bun — via Nitro | Any Hono target; **Cloudflare Workers first-class**; Deno broken in practice |
| **Ecosystem & docs** | None — the source *is* the docs | Massive; biggest hiring pool | Growing fast; good docs; won "Breakthrough of the Year" 2026 | Sparse — README is the documentation |
| **Security surface** | Tiny, fully auditable; sound defaults (escaped hydration payload, path-traversal-safe statics, localhost-only dev) | [CVE-2025-29927](https://nvd.nist.gov/vuln/detail/CVE-2025-29927) (9.1 — middleware auth bypass), plus cache-poisoning and SSRF CVEs in 2024–25 | No notable CVEs; 109-package supply chain | No notable CVEs; alpha status is itself the risk |

## Where rs-hono wins

- **Comprehensibility.** At ~1,550 lines a single developer can read the entire framework in an afternoon. When something breaks, you debug real stack traces through code you can read — the exact opposite of the Next.js experience, where "because of all of the abstraction required to function, debugging is a nightmare" ([Kyle Gill](https://www.kylegill.com/essays/next-vs-tanstack/)). There is no cache hierarchy, no compiler transform, no RSC serialization layer between you and the bug.
- **Supply chain and upgrade surface.** 11 packages / 64 MB installed vs 363 packages for a default Next.js scaffold. Fewer packages means fewer CVE exposures, faster CI installs, and near-zero upgrade churn. Next.js's worst recent bug (CVE-2025-29927, CVSS 9.1) lived precisely in framework magic — an internal header nobody knew existed bypassed middleware auth entirely. rs-hono has no hidden internal protocol to spoof.
- **Explicit routing beats convention magic.** `routes.ts` is greppable, refactorable, and type-checked. There are no magic filenames to memorize and no "can't ⌘-search a file convention" discoverability problem. Next.js and HonoX both encode behavior in filesystem conventions; TanStack Start generates a route tree; rs-hono routes are just data.
- **The strongest server/client boundary of the four.** `*.server.*` modules are physically replaced with a throwing stub in the client bundle — a build-time guarantee enforced by module replacement, not a lint rule (`server-only`), directive discipline (`"use server"`), or tree-shaking best effort. Accidental leaks fail loudly in the browser console instead of silently shipping secrets.
- **Full Hono for APIs.** Next.js route handlers and TanStack server routes are constrained subsets; rs-hono (like HonoX) gives you the entire Hono ecosystem — middleware, validators, RPC clients, WebSockets — because your `server.ts` *is* a Hono app.
- **No lock-in of any kind.** No vendor platform (Vercel), no perpetual-RC treadmill (TanStack), no alpha breaking-change policy (HonoX). If rs-hono stops fitting, its concepts (Hono handlers, plain React components, a route array) port almost anywhere.

## Where rs-hono loses

- **No ecosystem, no community, no battle-testing.** Next.js has ~2M lines solving problems you haven't hit yet: image optimization, i18n, ISR, partial prerendering, font optimization. rs-hono solves none of them, and every one you need becomes your code.
- **Dev feedback loop is the worst of the four.** Rspack rebuilds fast, but the server does a full `tsx watch` restart and you refresh the browser by hand. Both Vite-based competitors and Next.js keep component state across edits with HMR/Fast Refresh. This is the gap you feel hundreds of times a day.
- **No client-side navigation.** Every link is a full page load. Fine for content sites and dashboards with few transitions; wrong for app-like UIs. TanStack Start's typed `<Link>` + prefetch + client cache is a different league here. (HonoX shares this MPA limitation.)
- **Type-safety gap.** TanStack Start infers loader data, path params, and search params end-to-end. rs-hono loaders are typed, but their return types don't reach component props — pages cast `props as unknown as {...}` (see `examples/basic/src/features/profile/Profile.tsx`). For a TypeScript-first audience this is the most visible daily papercut.
- **No head/meta management.** The HTML shell (with its hardcoded stylesheet link and no `<title>` API) lives inside the framework, so titles and OG tags currently require forking it. (SSG, the other gap formerly listed here, has since shipped — see the table.)
- **Node-only.** `node:fs`, `node:stream`, `@hono/node-server`, and running TS via tsx bind rs-hono to Node servers. HonoX deploys to Cloudflare Workers first-class; TanStack Start reaches most hosts via Nitro. rs-hono also ships TypeScript source to production and needs `tsx` + Rspack in the production image.
- **Bus factor of one.** HonoX at least has the Hono org behind it; Next.js and TanStack have full-time teams. rs-hono is maintained by its author.

**Bottom line:** rs-hono is a compelling alternative when the app is a server-rendered site with real API needs, the team values auditability and a minimal supply chain, and MPA navigation is acceptable. Choose Next.js for ecosystem breadth and RSC, TanStack Start for end-to-end type safety and client-side UX, HonoX for edge deployment with islands. rs-hono's honest niche is closest to HonoX's — but with React, streaming, and a stronger server/client boundary, at the cost of edge portability.

---

## Improvement analysis

Improvements that would close the gaps above, ordered within each theme by value-for-effort. Line references are to `packages/rs-hono/src/`.

### Developer experience

**1. Loader → props type inference (the single highest-value change).**
The README already plans a per-route `route()` helper. The reason inference fails today is that `component` and `loader` sit in one object literal inside `defineRoutes([...])`, so TypeScript can't tie one property's type to another across the array. A tiny generic factory fixes it with zero runtime cost:

```ts
export function page<TData>(r: {
    kind: 'static' | 'dynamic';
    path: string;
    loader?: (c: Context) => Promise<TData | Response>;
    component: () => Promise<{ default: ComponentType<PageProps & Awaited<TData>> }>;
}) { return r; }
```

Now `component: () => import('./Profile')` type-errors unless `Profile`'s props match the loader's return type, and page components can declare `PageProps & { user: User }` instead of `Record<string, unknown>` + cast. ~20 lines of types in `router.ts`; removes the ugliest code in every consuming app. This also directly answers TanStack Start's headline feature.

**2. Per-page `<head>` control.**
The document shell is hardcoded in `server/app.tsx:222-239` — no `<title>`, a hardcoded `/_static/styles.css` link, no meta tags. Any real site needs titles and OG tags, so today every user forks the framework. Cheapest design consistent with "no magic": an optional `head` on page routes plus a loader override:

```ts
{ kind: 'dynamic', path: '/profile/:id', head: { title: 'Profile' },
  loader: async (c) => ({ user, head: { title: user.name } }) }
```

Render escaped `<title>`/`<meta>` into the shell (the `escapeHtml` helper already exists at `app.tsx:42`). ~30 lines. A config-level `document` component is the fuller alternative but adds an isomorphism trap; the data-only `head` field avoids it.

**3. Auto-reload in dev.**
Full HMR contradicts the restart-based server model, but *live reload* doesn't: add a dev-only SSE endpoint under the already-reserved `/_rs-hono` prefix, ping it from the Rspack watch callback (`cli/dev.ts:29-39`) and on server boot, and inject a ~10-line `EventSource` snippet into the shell in dev. When the socket drops (server restart) or a rebuild event arrives, `location.reload()`. ~40 lines total and it removes the single worst daily friction — manual browser refreshing. React Fast Refresh via `@rspack/plugin-react-refresh` can come later; this delivers most of the value at a fraction of the complexity.

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
The client bundle is served uncompressed, and the entry chunk `main.js` deliberately has a stable, un-hashed name (`builder/rspack-config.ts:50`) so it only gets `max-age=300` (`server/static.ts:37`). Two compounding fixes: (a) emit `.br`/`.gz` at build time and flip on `precompressed: true` in `serveStatic` (`static.ts:46-51`) — the installed `@hono/node-server` v2 already supports it, and JS typically shrinks 65–75%; (b) content-hash the entry by writing a tiny manifest from the compiler stats and letting the SSR shell read the hashed filename, which upgrades the entry to `immutable` caching. (a) is trivial; (b) is a small, contained change to the build/serve handshake.

### Suggested order

| # | Improvement | Impact | Effort |
|---|---|---|---|
| 8 | `NODE_ENV=production` in start | High (SSR throughput) | Trivial |
| 1 | Loader → props inference | High (DX, headline gap) | Small |
| 3 | Dev auto-reload (SSE) | High (daily DX) | Small |
| 2 | Per-page `<head>` | High (unblocks real sites) | Small |
| ~~9~~ | ~~Static-route caching → SSG~~ ✅ shipped (`server/ssg.ts`) | High (perf, honesty of `static`) | Done |
| 4 | Rspack config hook | Medium (prevents forks) | Trivial |
| 11 | Precompression + hashed entry | Medium (page weight) | Small → Medium |
| 6, 7 | Stream bridge + middleware wrapper cleanup | Code size/clarity | Small |
| 10 | Parallel loader/import + pre-warm | Low–Medium (latency) | Trivial |
| 5 | Papercuts (routes.tsx, method arrays) | Low | Trivial |

Notably absent: client-side navigation, RSC, and edge-runtime support. Each would multiply the framework's size and complexity — the moment rs-hono grows a client router and a serialization protocol, its comparison column starts looking like TanStack Start's, without the team to maintain it. The remaining improvements all fit the existing ~1,550-line budget (roughly +150 lines total, some of it offset by items 6–7) while removing the four disadvantages users hit first: prop casting, manual refresh, missing titles, and slow production SSR.
