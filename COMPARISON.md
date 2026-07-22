# Comparison of `packages/rshono` and Next.js

Scope: how `packages/rshono` (Hono + Rspack + React Server Components) stacks up against
Next.js (App Router) on the **critical, widely-used** features that determine whether a
real app can be built safely and pleasantly.

> **Framing.** rshono's stated goal is to be an RSC framework with **utmost stability and
> the best possible developer experience — not to compete on feature count.** This comparison
> is therefore weighted toward _primitives every non-trivial app needs_ (auth/session access,
> navigation, error handling) rather than Next's long tail (image/font optimization, i18n,
> parallel routes, etc.). Those are noted but treated as out-of-scope for the thesis.

## Legend

| Symbol | Meaning                                       |
| ------ | --------------------------------------------- |
| ✅     | First-class, comparable to Next.js            |
| 🟡     | Present but partial / less ergonomic          |
| ⚠️     | Only via a manual workaround; no official API |
| ❌     | Not available                                 |

## Comparison Table

### Routing & structure

| Feature                        | Next.js                       | rshono                            | Notes                                                                                                                |
| ------------------------------ | ----------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Route definition               | ✅ file-based (`app/`)        | ✅ explicit `defineRoutes` config | rshono trades convention for one typed, greppable manifest — a deliberate, defensible DX choice.                     |
| Dynamic segments               | ✅ `[id]`                     | ✅ `:id` (Hono patterns)          | `PageProps<'/profile/:id'>` types `params`.                                                                          |
| Catch-all / optional           | ✅ `[...slug]`, `[[...slug]]` | 🟡 `*`, `:id?` work at runtime    | `PathParams` typing doesn't model wildcard/optional; SSG rejects them.                                               |
| Route groups / private folders | ✅                            | n/a                               | Not needed with explicit routing.                                                                                    |
| Nested **persistent** layouts  | ✅ `layout.tsx` tree          | ❌                                | Each page renders the whole `<html>`; no segment tree, no shared-layout preservation guarantee. See "Layouts" below. |
| Typed links / routes           | ✅ (typedRoutes)              | ❌                                | No `<Link href>` type-checking against known routes.                                                                 |

### Rendering & data

| Feature                                               | Next.js       | rshono | Notes                                                                                                                                                                               |
| ----------------------------------------------------- | ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Async server components                               | ✅            | ✅     | `async` pages fetch directly; clean.                                                                                                                                                |
| Streaming SSR + RSC hydration                         | ✅            | ✅     | `renderToReadableStream` + `rsc-html-stream`. Solid.                                                                                                                                |
| Suspense streaming                                    | ✅            | 🟡     | React Suspense works, but no route-level `loading.tsx` convention.                                                                                                                  |
| **Request context in RSC** (`cookies()`, `headers()`) | ✅            | ❌     | **Biggest gap.** Pages get only `{ params, url }`; no way to read cookies/headers in a server component or action. Blocks per-user rendering & session auth. See "Request context". |
| `draftMode()` / preview                               | ✅            | ❌     | —                                                                                                                                                                                   |
| Partial prerendering / segment cache                  | ✅ (evolving) | ❌     | Whole-document render per request.                                                                                                                                                  |

### Navigation

| Feature                                         | Next.js                        | rshono | Notes                                                                     |
| ----------------------------------------------- | ------------------------------ | ------ | ------------------------------------------------------------------------- |
| Soft (client) navigation                        | ✅                             | ✅     | Elegant: intercepts `<a>` clicks globally — no `<Link>` import required.  |
| Prefetching                                     | ✅ (aggressive)                | ❌     | No hover/viewport prefetch → first click always round-trips.              |
| Programmatic nav / router hook                  | ✅ `useRouter()`               | ⚠️     | Only `history.pushState` (patched to trigger nav); undocumented, untyped. |
| `usePathname` / `useSearchParams` / `useParams` | ✅                             | ❌     | Client islands can't reactively read the current URL.                     |
| `router.refresh()`                              | ✅                             | ⚠️     | The machinery exists (`fetchRscPayload`) but isn't exposed.               |
| Pending navigation UI                           | ✅ `useLinkStatus`/loading.tsx | ❌     | `startTransition` holds old UI, but nothing surfaces "navigating…".       |
| Scroll restoration                              | ✅                             | 🟡     | Scroll-to-top on push only; back/forward position not restored.           |

### Mutations & control flow

| Feature                               | Next.js | rshono | Notes                                                                                     |
| ------------------------------------- | ------- | ------ | ----------------------------------------------------------------------------------------- |
| Server Actions (`'use server'`)       | ✅      | ✅     | Direct calls + `<form action>` + `useActionState`.                                        |
| Progressive enhancement (no-JS forms) | ✅      | ✅     | Works and is tested. Strong.                                                              |
| Fresh UI after mutation               | ✅      | ✅     | Every action response carries a fresh page payload.                                       |
| `redirect()`                          | ✅      | ❌     | Cannot redirect from a server component or after an action (no POST-redirect-GET).        |
| `notFound()`                          | ✅      | ❌     | Can't programmatically return a real 404 from within a page (must hand-render UI at 200). |
| `revalidatePath` / `revalidateTag`    | ✅      | ❌     | No cache invalidation model.                                                              |

### Error handling

| Feature                                  | Next.js | rshono | Notes                                                                                  |
| ---------------------------------------- | ------- | ------ | -------------------------------------------------------------------------------------- |
| Global error page                        | ✅      | ✅     | `error` special page; message-only in prod, message+stack in dev.                      |
| Per-route error boundaries (`error.tsx`) | ✅      | ❌     | Single global handler; a mid-stream server error is all-or-nothing.                    |
| Custom 404                               | ✅      | ✅     | `notFound` special page, hydrates like any page.                                       |
| Error page on soft-nav / no-JS action    | ✅      | 🟡     | Flight requests and thrown PE actions fall back to plain-text 500. See BUGS.md #3, #4. |
| Dev error overlay                        | ✅      | ❌     | Errors surface via the error page / terminal; no in-browser overlay.                   |

### Security & env

| Feature                            | Next.js             | rshono | Notes                                                                                                                                                           |
| ---------------------------------- | ------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client/server secret boundary      | ✅ (`NEXT_PUBLIC_`) | 🟡     | `PUBLIC_`-prefix + build-time `process.env` replacement is a genuinely strong model for the **client JS bundle**…                                               |
| …but SSR-side leak-proofing        | ✅                  | ⚠️     | …the SSR shadow only covers files that _literally open_ with `'use client'`. A secret read in a plain helper leaks into SSR HTML. **Verified.** See BUGS.md #1. |
| CSRF protection for actions        | ✅                  | ✅     | Automatic `Origin` check (client calls + no-JS posts).                                                                                                          |
| CSP with per-request nonce         | 🟡 (manual)         | ✅     | Opt-in `RSC_HONO_CSP=1`; nonce on scripts, flight, chunks. Nicely done.                                                                                         |
| Render deadline / disconnect abort | 🟡                  | ✅     | `RSC_HONO_RENDER_TIMEOUT_MS` + client-disconnect signal.                                                                                                        |
| Prod source-map stripping          | ✅                  | ✅     | No client maps in prod.                                                                                                                                         |

### Platform, styling, assets

| Feature                                           | Next.js             | rshono         | Notes                                                                                                                  |
| ------------------------------------------------- | ------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Middleware                                        | ✅ (edge)           | ✅ (Hono)      | `src/server.ts` middleware **does** wrap page rendering (verified). Auth-redirect gating works today. A real strength. |
| Full HTTP escape hatch                            | 🟡 (route handlers) | ✅             | Mount a whole Hono app: any method, streaming, cookies, `hono/client` end-to-end types. Excellent.                     |
| Global CSS / CSS Modules                          | ✅                  | ✅             | `css/auto` supports both.                                                                                              |
| Tailwind / Sass                                   | ✅ (zero-config)    | ⚠️             | No PostCSS/Sass wiring; must be added manually.                                                                        |
| Root static files (`/favicon.ico`, `/robots.txt`) | ✅ (`public/`)      | ❌             | `public/` is served under `/_static/…`, not `/`. See BUGS.md #2.                                                       |
| Image / font optimization                         | ✅                  | ❌             | Out of thesis scope, but widely used.                                                                                  |
| Static generation (SSG)                           | ✅                  | ✅             | `kind: 'static'` + `staticPaths` ≈ `generateStaticParams`.                                                             |
| ISR / on-demand revalidation                      | ✅                  | ❌             | Static = build-time only.                                                                                              |
| Runtime targets                                   | ✅ (Node/edge)      | 🟡 (Node only) | Despite Hono's portability, rshono hard-depends on `@hono/node-server`, worker threads, `process.loadEnvFile`.         |
| Deployment adapters                               | ✅                  | ❌             | (Explicitly a later CLI concern.)                                                                                      |

### Developer experience & types

| Feature                | Next.js              | rshono | Notes                                                                                                                       |
| ---------------------- | -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| HMR / Fast Refresh     | ✅                   | ✅     | Client edits hot-apply; server-component edits re-fetch flight in place; state survives. Very good.                         |
| Single-port dev proxy  | ✅                   | ✅     | Worker-thread server, request gating on rebuild — no dropped connections.                                                   |
| End-to-end type safety | ✅                   | ✅     | `defineRoutes` validates page props against `PageProps<path>`; `AppType` for `hono/client`. Sharp.                          |
| First-run scaffolding  | ✅ `create-next-app` | ❌     | Explicitly planned as a later CLI package.                                                                                  |
| Test story             | 🟡                   | ✅     | Real e2e suite (prod + CSP + dev) covering flight, actions, CSRF, secret-stripping, SSG. Strong for a framework this small. |

## Where rshono already wins

- **Radically smaller surface & mental model.** One required file, explicit routes, no hidden
  filesystem magic. Easy to hold in your head — directly serves the "stability + DX" thesis.
- **Hono as the substrate.** A full, well-typed HTTP framework underneath (middleware, endpoints,
  streaming, `hono/client`) that Next simply doesn't offer at that quality.
- **Env/secret model for the client bundle.** Build-time replacement is a _harder_ guarantee than
  tree-shaking — stronger than what many teams achieve on Next (modulo the SSR hole in BUGS.md #1).
- **Opt-in strict CSP with per-request nonce**, render deadlines, and disconnect-aware aborts —
  security posture that Next leaves largely to the developer.
- **HMR quality.** Server-component edits re-fetch the flight payload with browser state intact.

## Where the gaps actually hurt (ranked by real-world impact)

1. **No request context (`cookies()`/`headers()`) in server components or actions.** This is the
   single biggest blocker: you cannot render per-user content or implement session auth _inside_ the
   React tree today. (Redirect-style gating is possible via `server.ts` middleware — see below —
   but reading the session to render is not.)
2. **No `redirect()` / `notFound()`.** Post-mutation redirects and real 404s from within a page are
   table stakes for app code.
3. **No client router API** (`useRouter`, `usePathname`, `useSearchParams`, `refresh`). Interactive
   apps need reactive URL access and programmatic navigation.
4. **Secret leak into SSR HTML** via non-`'use client'` helpers (BUGS.md #1) — undermines the flagship
   safety guarantee and must be closed for the "safe by default" promise to hold.
5. **Error/loading UX for soft navigation** (per-route boundaries, pending indicator) — Next's
   `loading.tsx`/`error.tsx` are among its most-loved DX features.

## Nuances worth recording

- **Middleware wraps pages.** `app.route('/', serverApp)` is registered before the page routes, and
  Hono runs a mounted `use('*')` for the later page paths (verified with a standalone Hono 4.12 test).
  So global middleware in `src/server.ts` _does_ observe and can short-circuit page rendering — auth
  redirects and response-header injection work today. This is under-advertised.
- **"Static" is only static on hard load.** A soft navigation to a `kind: 'static'` route sends
  `Accept: text/x-component`, which skips the prerendered-file shortcut and renders fresh. Fine, but
  worth documenting so users don't assume SSG semantics on in-app nav.
- **`process.env` client guarantee is real** — the DATABASE_URL secret never appears in `dist/static`
  JS (verified). The hole is strictly the SSR HTML path.

## Conclusion

Measured against its own thesis — _stability and DX, not feature count_ — rshono is already a
remarkably clean, well-architected RSC framework. The rendering pipeline, HMR, action model,
progressive enhancement, CSRF/CSP hardening, type-safe routing, and the Hono escape hatch are all
genuinely good, and the e2e suite gives real confidence.

But "best DX and safe by default" is not yet true for the **primitives every real app reaches for on
day one**: reading the session/cookies to render, redirecting after a mutation, returning a real 404,
navigating programmatically, and showing loading/error states during navigation. These are not
"more features" in the Next-competitor sense — they are the minimum control surface of an RSC app,
and their absence is what would stop a team from shipping. Closing the SSR secret-leak (BUGS.md #1)
is likewise non-negotiable for the safety claim.

**Recommendation:** treat the Tier-1 items in `IMPROVEMENTS.md` (request context, `redirect`/`notFound`,
a small client router) plus BUGS.md #1–#2 as the definition of "1.0-ready." They are small in surface
area, RSC-native, and squarely on-thesis — and they convert rshono from "impressive demo" to
"shippable." Everything else (ISR, image optimization, i18n, adapters) can stay deliberately out of scope.
