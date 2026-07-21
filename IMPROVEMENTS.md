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

### 1.1 Request context in server components & actions — `cookies()` / `headers()`

**Why:** Today a page receives only `{ params, url }` and an action receives only its args
(`entry.rsc.tsx`). You **cannot read the session cookie to render per-user UI**, nor read/set cookies
in a mutation. This is the #1 adoption blocker (see COMPARISON.md).

**Implementation sketch (minimal deps, RSC-native):**
- Add a module using Node's `AsyncLocalStorage` (built-in, no dep), e.g. `src/runtime/context.ts`
  exporting `runWithRequest(ctx, fn)` and the public `cookies()` / `headers()` readers.
- In `renderComponent` and in both action branches of `renderPage`, wrap the render/dispatch in
  `als.run({ req: c.req, resHeaders }, () => …)`. Because React invokes server components
  synchronously within `renderToReadableStream` — which runs inside the Hono handler — ALS context
  propagates correctly. (This is exactly how Next implements `cookies()`.)
- Expose a read API from a new `rshono/server` entry (server-only; guard with `server-only`).
- For **setting** cookies from an action, collect `Set-Cookie` on the shared context and apply them
  to the outgoing `Response` in `renderComponent`.

**Files:** `src/runtime/entry.rsc.tsx`, new `src/runtime/context.ts`, `src/index.ts` (or a new
`server` export in `package.json#exports`).

**Test:** action sets a cookie → server component on the next render reads it.

### 1.2 Control-flow primitives — `redirect()` and `notFound()`

**Why:** Post-mutation redirect (POST-redirect-GET) and real 404s from inside a page are table stakes.
`profile.tsx` currently hand-renders "user not found" at HTTP 200 because there's no `notFound()`.

**Implementation sketch:**
- `redirect(path, status = 303)` and `notFound()` throw tagged sentinel errors.
- Catch them in `renderPage`/`renderComponent`:
  - HTML/hard nav → `redirect` becomes a real 3xx `Location`; `notFound` renders the `notFound` page at 404.
  - Flight/soft nav → return a small RSC payload the client understands: on `redirect`, the client
    does `history.pushState(path)` + refetch; on `notFound`, render the notFound page payload at 404.
- Make the client's `setServerCallback`/`fetchRscPayload` recognize the redirect signal
  (`entry.client.tsx`).

**Files:** `src/runtime/entry.rsc.tsx`, `src/runtime/entry.client.tsx`, `src/router.ts` (types),
`src/index.ts`. Depends on 1.4's flight-payload envelope being a good place to carry signals.

**Test:** action returns `redirect('/users')` → client lands on `/users`; `notFound()` in a page → 404 + notFound page.

### 1.3 A small client router — `useRouter`, `usePathname`, `useSearchParams`, `useParams`

**Why:** Interactive client islands need reactive URL access and programmatic navigation. The
machinery already exists — `fetchRscPayload` and the patched `history.pushState` in `entry.client.tsx`
— it just isn't exposed or made reactive.

**Implementation sketch:**
- A `rshono/client` entry exporting hooks backed by a small context/store updated on every navigation
  (the nav listener already fires on push/replace/pop).
- `useRouter()` → `{ push, replace, back, refresh }`. `refresh()` = existing `fetchRscPayload()` for
  the current URL. `push/replace` = `history.pushState/replaceState` (already wired to trigger nav).
- `usePathname()/useSearchParams()/useParams()` read from the store so islands re-render on nav.

**Files:** new `src/runtime/router-client.tsx` (or fold into `entry.client.tsx`), `package.json#exports`.

**Test:** a client button calling `router.push('/users')` navigates; `usePathname()` updates after nav.

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
2. **Tier 1.1 → 1.2 → 1.3** — the request-context / control-flow / router trio that makes real apps
   buildable. Land the flight-payload envelope (used by 1.2/1.3) once, cleanly.
3. **Tier 2** — loading/error/prefetch polish on top of the router.
4. **Tier 4** cleanups fold in alongside the above; add the regression tests as each lands so the
   e2e suite stays green and the safety guarantees become executable.
