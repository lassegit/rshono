# Code analysis and improvement suggestions for `packages/rshono`

Prioritized for the project's stated goal — **utmost stability and best DX, not feature count** —
and its constraints (DX first, minimal deps, RSC-native idioms, e2e suite stays green). Scaffolding
and deployment adapters are intentionally deferred to the future CLI package and are out of scope here.

Each item lists **why it's on-thesis**, a **sketch of the implementation**, and the **files** it touches.
Tiers are ordered by how much they unblock real apps.

---

## Tier 1 — Primitives every real app needs on day one (1.0 blockers)

These are not "more features" in the Next-competitor sense; they are the minimum control surface of
an RSC app. All three are small, RSC-native, and squarely on-thesis.

### 1.1 Request context in server components & actions — `getContext()` ✅ DONE

**Why:** A page used to receive only `{ params, url }` and an action only its args, so you could not
read the session cookie to render per-user UI or read/set cookies in a mutation. This was the #1
adoption blocker (see COMPARISON.md).

**Shipped — a curated `Ctx`, not the raw Hono `Context`.** `getContext<E>()` returns a single
rshono object with the useful parts surfaced first-class, so app code needs no `hono/cookie` import
and no runtime branching:

- `src/runtime/context.ts` seeds an `AsyncLocalStorage<Context>` (Node built-in, zero new deps) via
  `runWithContext(c, fn)` and exposes `getContext<E extends Env = Env>(): Ctx<E>`.
- `Ctx` surfaces: `url` (WHATWG `URL`, proxy-aware), `pathname`, `searchParams`, `params`, `method`,
  `req`; `header()` and `cookies.{get,all,set,delete}`; `var` (typed middleware data); `env`
  (portable — `process.env` on Node, `c.env` bindings on Workers/Deno adapters, since serverless
  bindings are per-request); and `raw` — the full Hono `Context` escape hatch.
- `entry.rsc.tsx` wraps the page handler and the `notFound`/`onError` render paths in
  `runWithContext(c, …)`, so both server-component rendering _and_ action dispatch run inside the
  store. Verified to propagate across `await` boundaries.
- `renderComponent` builds responses via `c.body(...)` (not `new Response(...)`), so cookies/headers
  set through the context (`ctx.cookies.set(...)`, `ctx.header(...)`) are merged into the response.
- Public entry `rshono/server` (in `package.json#exports`) re-exports `getContext`; `publicUrl` is
  the single source of truth for both `Ctx.url` and the page's `url` prop.

**Tests (`test/prod.test.mjs`):** an async server component reads `pathname`, an `x-test` header, a
cookie and an `env` var _after_ an `await` (proves ALS propagation + the curated surface); the
`signup` action sets a cookie via `ctx.cookies.set` and the PE test asserts it reaches the response.

**Still open here:** `getContext()` throws outside a request (module load / SSG prerender) by design;
a route that reads request context is therefore dynamic. A future guard could detect this during
`kind: 'static'` prerender and fail with a clear message instead of the generic throw.

### 1.2 Control-flow primitives — `redirect()` and `notFound()` ✅ DONE

**Why:** Post-mutation redirect (POST-redirect-GET) and real 404s from inside a page are table stakes.
`profile.tsx` used to hand-render "user not found" at HTTP 200; it now calls `notFound()`.

**Shipped.** `redirect(location, status = 303)` and `notFound()` are **standalone functions** exported
from `rshono/server` (not `Ctx` methods): TypeScript only narrows control flow after a
`never`-returning _function_ call — not a method call — so `if (!user) notFound()` correctly narrows
`user`. This matches Next/Remix, and keeps the "no Hono import" property (same `rshono/server` import).

- `src/runtime/control.ts` (dependency-free, bundled to client too) defines `RedirectSignal` /
  `NotFoundSignal` and the digest encode/parse (`RSHONO_REDIRECT;<status>;<loc>`, `RSHONO_NOT_FOUND`).
- Both signals carry a `digest`. Translation points in `entry.rsc.tsx`:
  - **Server actions** (client + PE) rethrow the signal out of `renderPage`; the page handler catches
    it via `resolveControl`.
  - **Hard-navigation renders**: the RSC `onError` captures the signal (and returns its digest);
    after `renderHTML`, `renderComponent` re-throws it to the handler.
  - `resolveControl`: PE/hard-nav → `c.redirect(location, status)` (cookies set beforehand survive) or
    the `notFound` page at 404; client-action (flight) → a payload with `redirect`/`notFound` fields.
  - **Soft-navigation component renders** can't be caught server-side mid-stream, so the digest rides
    out on the errored flight; `entry.client.tsx` parses it (redirect → `navigateTo`; notFound →
    reload so the server renders the 404 page for that URL).
- `entry.ssr.tsx` lets control-flow digests bubble instead of becoming a 500 shell.

**Tests (`test/prod.test.mjs`):** component redirect on hard nav (303 + `Location`), component redirect
on soft nav (digest present in flight), cookie-gated component happy path, component `notFound()` → 404
page, and a PE **server-action redirect** that also sets a cookie (303 + `Location` + `Set-Cookie`).

**Known limit:** a redirect/notFound thrown _after_ a Suspense boundary has already streamed on a hard
navigation can't change the response (bytes are committed) — same constraint as Next. Call them during
the initial render (the normal case). Browser-driven soft-nav behaviors are implemented but verified by
build/HTTP assertions, not a headless browser.

### 1.3 A small client router — `useNavigation()` ✅ DONE

**Why:** Interactive client islands need reactive URL access and programmatic navigation. The
machinery already existed — `fetchRscPayload` and the patched `history.pushState` in `entry.client.tsx`
— it just wasn't exposed or made reactive.

**Shipped — one hook, not a family.** Next splits this across `usePathname`/`useSearchParams`/
`useParams`/`useRouter`, each backed by a client-side store it has to keep in sync (and that store is
exactly what can lag and flicker). rshono exposes a **single** `useNavigation()` from `rshono/client`
that returns everything navigation-related in one object:

- location data (flat): `url` (WHATWG `URL`, proxy-aware — mirrors `getContext().url`), `pathname`,
  `searchParams` (`URLSearchParams`), `params`;
- `router` sub-object (`Router` type): `push`, `replace`, `back`, `forward`, `refresh`, and `pending`
  (`true` while a client navigation is in flight) — "where am I" (flat) vs "how do I move" (`.router`).

**The key idea: URL data rides the flight payload, not a parallel store.** This is what keeps it
RSC-native and flicker-free, and it drops out of the existing architecture rather than adding a
store to sync:

- `src/runtime/navigation.tsx` (`'use client'`) defines `useNavigation()`, a `RouterProvider`, and two
  contexts. `RouterProvider` is a client component the **server** render wraps around every page, so
  `href`/`params` cross the flight boundary as plain data.
- `entry.rsc.tsx` `renderComponent` wraps `<Page>` in `<RouterProvider href={props.url} params={params}>`.
  Because the data is server-computed: (a) client islands **SSR with the correct URL** and hydrate against
  identical values → **no flicker**; (b) `params` work client-side **without shipping route patterns** —
  Hono's matcher already resolved them; (c) every soft nav re-fetches the payload, so the new
  `RouterProvider` props flow through context and islands re-render — **no manual sync**.
- `entry.client.tsx` `BrowserRoot` provides the imperative half via `NavRuntimeContext`
  (`push`/`replace`/`back`/`forward`/`refresh` + a `useTransition`-backed `pending`); during SSR that
  provider is absent, so `RouterProvider` falls back to no-op methods and `pending: false`.
- `package.json#exports` adds `rshono/client` (barrel `src/runtime/client.ts` → `useNavigation`, `Navigation`).

**Server/client parity:** server components keep reading the same shape from `getContext()`
(`url`/`pathname`/`searchParams`/`params`) — hooks can't run there — so there's one URL surface with two
entry points and nothing new to learn on the server.

**Tests (`test/prod.test.mjs`):** a client island (`NavInfo` on `/profile/:id`) reads `useNavigation()`;
asserts the **SSR HTML** carries server-computed `pathname`/`params`/`searchParams` and `pending: false`
(proves no-flicker hydration), the **flight payload** carries the URL for soft-nav sync, and the
framework-owned provider reaches the **client bundle** (proves the first rshono-owned `'use client'`
module is discovered by the RSC/Client plugins).

**Known limit:** the imperative methods and `pending` are exercised by build + SSR assertions, not a
headless browser — same constraint as 1.2. `url.hash` is always empty server-side (fragments aren't
sent to the server), so it's derived from the server href for consistency rather than `window.location`.

---

## Tier 2 — Core DX parity (the loved parts of the App Router)

### 2.1 Loading / pending UI during navigation

**Why:** `startTransition` keeps the old page until the new payload arrives, but nothing tells the
user "navigating…". This is one of Next's most-appreciated behaviors.

**Sketch:** expose the transition's `isPending` via `useRouter().pending`, and/or ship a tiny
top-progress indicator opt-in. Optionally support a route-level `loading` component rendered inside a
Suspense boundary around the page.

**Files:** `entry.client.tsx` (surface `isPending` from the existing `startTransition`), router client.

### 2.2 Per-route error boundaries + in-place error rendering (pairs with BUGS #4)

**Why:** A single global `error` page means any server error is all-or-nothing and soft-nav errors
hard-reload. Per-route `error` boundaries and RSC error payloads make failures local and stateful.

**Sketch:** allow an optional `error`/`loading` per `PageRoute`; wrap the page element in an error
boundary + Suspense; for flight errors, emit the error page as an RSC payload (fixes BUGS.md #4).

**Files:** `router.ts` (types), `entry.rsc.tsx` (wrap + flight error payload), `entry.client.tsx`.

### 2.3 `<Link>` with prefetch (keep the `<a>` interception too)

**Why:** The global `<a>` click interception is elegant and should stay. But no prefetch means the
first click on any route always round-trips. A tiny opt-in prefetch closes the perceived-perf gap.

**Sketch:** an optional `<Link prefetch>` (or `data-prefetch` on `<a>`) that, on hover/viewport,
fetches the flight payload for the target URL into an in-memory cache keyed by URL; navigation then
resolves instantly. Keep it opt-in to preserve minimalism.

**Files:** router client, `entry.client.tsx` (payload cache in `fetchRscPayload`).

### 2.4 Scroll restoration on back/forward

**Why:** Currently only scroll-to-top on push (`entry.client.tsx`). Back/forward should restore prior
scroll position — users expect it.

**Sketch:** stash `scrollY` per history entry (in `history.state` or a Map keyed by nav id) and
restore on `pop`.

**Files:** `entry.client.tsx`.

---

## Tier 3 — Content correctness & smaller wins

### 3.1 Root static files (ties to BUGS.md #2)

Serve `/favicon.ico`, `/robots.txt`, `/sitemap.xml`, `/.well-known/*`, `apple-touch-icon.png` from
`public/` at the web root, while keeping hashed assets under `/_static`.
**Files:** `entry.rsc.tsx` (`buildApp`), `cli/dev.ts` (dev front), `server/static.ts`.

### 3.2 Metadata story

React 19 already hoists `<title>`/`<meta>` from anywhere in the tree (the example relies on this).
Document it explicitly, and consider a tiny optional `metadata` per route (merged into `<head>`) so
teams get a familiar convention without a heavy API.
**Files:** README, optionally `router.ts` + `entry.rsc.tsx`.

### 3.3 Revalidation / caching stance

Decide and **document** the caching model. Minimum viable: state clearly that pages are dynamic by
default and `kind: 'static'` is build-time only; then consider an on-demand `revalidate(path)` that
re-runs SSG for a route (write-through to `dist/ssg`). Avoid Next's implicit fetch-cache complexity —
staying explicit is on-thesis.
**Files:** `server/ssg.ts`, README.

### 3.4 Tailwind / PostCSS recipe

Not a code change necessarily — a documented, tested recipe (PostCSS loader wiring) so the most common
styling stack works without guesswork. If wiring is trivial, add zero-config detection of
`postcss.config.*`.
**Files:** `builder/rspack-config.ts` (optional), README/example.

---

## Tier 4 — Internal code quality & robustness

### 4.1 Fix the env shadow to be layer-based (BUGS.md #1) — highest-value code fix

The `'use client'` source-sniff in `env-shadow-loader.cjs` is the root cause of the SSR secret leak.
Move the public-env substitution to cover the whole SSR/client layer of the server bundle (module
layer / `issuerLayer`) or run a `DefinePlugin`-equivalent scoped to that layer.
**Files:** `builder/rspack-config.ts`, `builder/env-shadow-loader.cjs`, `builder/public-env.ts`.

### 4.2 Reset memoized endpoint module on failure (BUGS.md #5)

`modPromise ??= endpoint.server()` should clear the cache if the import rejects.
**Files:** `entry.rsc.tsx`.

### 4.3 Route all server errors through the error page (BUGS.md #3, #4)

Consolidate the no-JS action error and flight-request error paths so they render the `error` page
(HTML) or an error RSC payload (flight) instead of plain text.
**Files:** `entry.rsc.tsx`, `entry.client.tsx`.

### 4.4 Typed catch-all params + typed links

`PathParams` doesn't model `*` / optional `:id?`. Extend the type helper (or document the limitation),
and add a route-name → path type so a future `<Link href>` can be type-checked.
**Files:** `router.ts`.

### 4.5 Deterministic render-timeout cleanup

`AbortSignal.any([signal, AbortSignal.timeout(...)])` in `renderComponent` leaves the timeout pending
after a fast response. It's unref'd so it won't hold the process open, but cancelling it on completion
(or using a manually-cleared controller) avoids stray timers under load and makes intent explicit.
**Files:** `entry.rsc.tsx`.

### 4.6 Regression tests for the safety-critical paths

Add e2e coverage that would have caught the issues above and guards them going forward:

- **Secret leak via a plain helper** imported by a `'use client'` component — assert the secret is
  absent from **SSR HTML**, not just the client bundle (the current test only checks the bundle and a
  direct-in-client-component read).
- **`/favicon.ico` / `/robots.txt`** served at root once 3.1 lands.
- **No-JS action that throws** renders the error page (BUGS.md #3).
- **`cookies()` / `redirect()` / `notFound()`** once Tier 1 lands.
  **Files:** `test/prod.test.mjs`, example fixtures.

---

## Deliberately out of scope (kept off the roadmap on purpose)

Consistent with "stability + DX, not features": image/font optimization, i18n routing, parallel/
intercepting routes, edge-runtime adapters, and an implicit fetch-cache. Runtime portability and
`create-rshono` scaffolding belong to the future CLI/deployment package, per the project's own plan.

## Suggested sequencing

1. **BUGS.md #1 (4.1)** and **#2 (3.1)** — safety + conventions; small, high-trust wins.
2. **Tier 1 trio** — request-context (**1.1 done**) → control-flow `redirect`/`notFound` (**1.2 done**) →
   client router (**1.3 done**) — makes real apps buildable. The flight-payload envelope (used by
   1.2/1.3) is landed.
3. **Tier 2** — loading/error/prefetch polish on top of the router.
4. **Tier 4** cleanups fold in alongside the above; add the regression tests as each lands so the
   e2e suite stays green and the safety guarantees become executable.
