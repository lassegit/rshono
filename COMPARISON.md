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

| Feature                        | Next.js                       | rshono                            | Notes                                                                                            |
| ------------------------------ | ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Route definition               | ✅ file-based (`app/`)        | ✅ explicit `defineRoutes` config | rshono trades convention for one typed, greppable manifest — a deliberate, defensible DX choice. |
| Dynamic segments               | ✅ `[id]`                     | ✅ `:id` (Hono patterns)          | `PageProps<'/profile/:id'>` types `params`.                                                      |
| Catch-all / optional           | ✅ `[...slug]`, `[[...slug]]` | 🟡 `*`, `:id?` work at runtime    | `PathParams` typing doesn't model wildcard/optional; SSG rejects them.                           |
| Route groups / private folders | ✅                            | n/a                               | Not needed with explicit routing.                                                                |
| Nested **persistent** layouts  | ✅ `layout.tsx` tree          | ❌                                | Each page renders the whole `<html>`; no segment tree, no shared-layout preservation guarantee.  |
| Typed links / routes           | ✅ (typedRoutes)              | ❌                                | No `<Link href>` type-checking against known routes.                                             |

### Rendering & data

| Feature                                               | Next.js       | rshono | Notes                                                                                                                  |
| ----------------------------------------------------- | ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Async server components                               | ✅            | ✅     | `async` pages fetch directly; clean.                                                                                   |
| Streaming SSR + RSC hydration                         | ✅            | ✅     | `renderToReadableStream` + `rsc-html-stream`. Solid.                                                                    |
| Suspense streaming                                    | ✅            | 🟡     | React Suspense works and `<Boundary loading>` composes loading UI; no route-level `loading.tsx` convention (by design). |
| **Request context in RSC** (`cookies()`, `headers()`) | ✅            | ✅     | `getContext()` (`rshono/server`) exposes a curated `Ctx` (url/cookies/headers/env/var/raw) via `AsyncLocalStorage`.     |
| `draftMode()` / preview                               | ✅            | ❌     | —                                                                                                                      |
| Partial prerendering / segment cache                  | ✅ (evolving) | ❌     | Whole-document render per request.                                                                                     |

### Navigation

| Feature                                         | Next.js                        | rshono | Notes                                                                                                    |
| ----------------------------------------------- | ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------- |
| Soft (client) navigation                        | ✅                             | ✅     | Elegant: intercepts `<a>` clicks globally — no `<Link>` import required.                                  |
| Prefetching                                     | ✅ (aggressive)                | 🟡     | Opt-in `data-prefetch` warms the flight cache on hover/focus; not automatic/viewport-based.               |
| Programmatic nav / router hook                  | ✅ `useRouter()`               | ✅     | `useNavigation().router` (`push`/`replace`/`back`/`forward`/`refresh`) from `rshono/client`.              |
| `usePathname` / `useSearchParams` / `useParams` | ✅                             | ✅     | Single reactive `useNavigation()` returns `url`/`pathname`/`searchParams`/`params`; data rides the flight. |
| `router.refresh()`                              | ✅                             | ✅     | Exposed as `useNavigation().router.refresh`.                                                             |
| Pending navigation UI                           | ✅ `useLinkStatus`/loading.tsx | ✅     | `useNavigation().router.pending` + opt-in `<NavigationProgress>` top bar.                                |
| Scroll restoration                              | ✅                             | ✅     | Manual `scrollRestoration`: top on push, restore on back/forward, stay on replace.                        |

### Mutations & control flow

| Feature                               | Next.js | rshono | Notes                                                                    |
| ------------------------------------- | ------- | ------ | ------------------------------------------------------------------------ |
| Server Actions (`'use server'`)       | ✅      | ✅     | Direct calls + `<form action>` + `useActionState`.                       |
| Progressive enhancement (no-JS forms) | ✅      | ✅     | Works and is tested. Strong.                                             |
| Fresh UI after mutation               | ✅      | ✅     | Every action response carries a fresh page payload.                      |
| `redirect()`                          | ✅      | ✅     | `redirect(location, status=303)` from `rshono/server`; POST-redirect-GET, cookies survive. |
| `notFound()`                          | ✅      | ✅     | `notFound()` from `rshono/server` renders the real 404 page at status 404.               |
| `revalidatePath` / `revalidateTag`    | ✅      | ❌     | No cache invalidation model (pages are dynamic by default).              |

### Error handling

| Feature                                  | Next.js | rshono | Notes                                                                                            |
| ---------------------------------------- | ------- | ------ | ------------------------------------------------------------------------------------------------ |
| Global error page                        | ✅      | ✅     | `error` special page; message-only in prod, message+stack in dev.                                |
| Per-route error boundaries (`error.tsx`) | ✅      | ✅     | Component-based `<ErrorBoundary>` / `<Boundary loading error>` (from `rshono/client`), not a file convention. |
| Custom 404                               | ✅      | ✅     | `notFound` special page, hydrates like any page.                                                 |
| Error page on soft-nav / no-JS action    | ✅      | ✅     | Both HTML and flight (`text/x-component`) errors route through the `error` page / RSC error payload. |
| Dev error overlay                        | ✅      | ❌     | Errors surface via the error page / terminal; no in-browser overlay.                             |

### Security & env

| Feature                            | Next.js             | rshono | Notes                                                                                                         |
| ---------------------------------- | ------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| Client/server secret boundary      | ✅ (`NEXT_PUBLIC_`) | ✅     | `PUBLIC_`-prefix + build-time `process.env` replacement in the client bundle — a hard guarantee, not tree-shaking. |
| SSR-side leak-proofing             | ✅                  | ✅     | Env shadow is now **layer-based** (whole SSR layer), so transitive non-`'use client'` helpers are covered too. Regression-tested. |
| CSRF protection for actions        | ✅                  | ✅     | `Origin` check **and** `Sec-Fetch-Site` (rejects cross-site even with no `Origin`); covers client calls + no-JS posts. |
| CSP with per-request nonce         | 🟡 (manual)         | ✅     | Opt-in `RSC_HONO_CSP=1`; nonce on scripts, flight, chunks. Nicely done.                                       |
| Render deadline / disconnect abort | 🟡                  | ✅     | `RSC_HONO_RENDER_TIMEOUT_MS` + client-disconnect signal.                                                     |
| Prod source-map stripping          | ✅                  | ✅     | No client maps in prod.                                                                                       |

### Platform, styling, assets

| Feature                                           | Next.js             | rshono         | Notes                                                                                                            |
| ------------------------------------------------- | ------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Middleware                                        | ✅ (edge)           | ✅ (Hono)      | `src/server.ts` middleware **does** wrap page rendering (verified). Auth-redirect gating works today. A real strength. |
| Full HTTP escape hatch                            | 🟡 (route handlers) | ✅             | Mount a whole Hono app: any method, streaming, cookies, `hono/client` end-to-end types. Excellent.               |
| Global CSS / CSS Modules                          | ✅                  | ✅             | `css/auto` supports both.                                                                                        |
| Tailwind / Sass                                   | ✅ (zero-config)    | ⚠️             | No PostCSS/Sass wiring; must be added manually.                                                                  |
| Root static files (`/favicon.ico`, `/robots.txt`) | ✅ (`public/`)      | ✅             | `public/` is served at the web root (and copied to `dist/public`); hashed assets stay under `/_static`.          |
| Image / font optimization                         | ✅                  | ❌             | Out of thesis scope, but widely used.                                                                            |
| Static generation (SSG)                           | ✅                  | ✅             | `kind: 'static'` + `staticPaths` ≈ `generateStaticParams`.                                                       |
| ISR / on-demand revalidation                      | ✅                  | ❌             | Static = build-time only.                                                                                        |
| Runtime targets                                   | ✅ (Node/edge)      | 🟡 (Node only) | Despite Hono's portability, rshono hard-depends on `@hono/node-server`, worker threads, `process.loadEnvFile`.   |
| Deployment adapters                               | ✅                  | ❌             | (Explicitly a later CLI concern.)                                                                                |

### Developer experience & types

| Feature                | Next.js              | rshono | Notes                                                                                                                       |
| ---------------------- | -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| HMR / Fast Refresh     | ✅                   | ✅     | Client edits hot-apply; server-component edits re-fetch flight in place; state survives. Very good.                         |
| Single-port dev proxy  | ✅                   | ✅     | Worker-thread server, request gating on rebuild — no dropped connections.                                                   |
| End-to-end type safety | ✅                   | ✅     | `defineRoutes` validates page props against `PageProps<path>`; `AppType` for `hono/client`. Sharp.                          |
| First-run scaffolding  | ✅ `create-next-app` | ❌     | Explicitly planned as a later CLI package.                                                                                  |
| Test story             | 🟡                   | ✅     | Real e2e suite (prod + CSP + dev) covering flight, actions, CSRF, secret-stripping, context, redirect/notFound, boundaries, SSG. Strong for a framework this small. |

## Where rshono already wins

- **Radically smaller surface & mental model.** One required file, explicit routes, no hidden
  filesystem magic. Easy to hold in your head — directly serves the "stability + DX" thesis.
- **Hono as the substrate.** A full, well-typed HTTP framework underneath (middleware, endpoints,
  streaming, `hono/client`) that Next simply doesn't offer at that quality.
- **Env/secret model, client _and_ SSR.** Build-time replacement in the client bundle is a _harder_
  guarantee than tree-shaking, and the SSR side is now covered layer-wide (not per-`'use client'`-file),
  so a secret read in a plain helper no longer leaks into HTML. Regression-tested.
- **One navigation surface.** `getContext()` on the server and `useNavigation()` on the client return
  the same URL shape; the client half rides the flight payload, so islands SSR with the correct URL and
  hydrate flicker-free — no parallel client store to fall out of sync.
- **Opt-in strict CSP with per-request nonce**, render deadlines, and disconnect-aware aborts —
  security posture that Next leaves largely to the developer.
- **HMR quality.** Server-component edits re-fetch the flight payload with browser state intact.

## Where the gaps still are (ranked by real-world impact)

The day-one primitives that used to block adoption — request context, `redirect`/`notFound`, a client
router, loading/error UX, root static files, and the SSR secret leak — have all landed. What remains:

1. **No nested persistent layouts.** Every page renders the whole `<html>`; there's no segment tree,
   so a shared layout isn't guaranteed to be preserved across navigation. The biggest structural gap.
2. **No typed links.** No `<Link href>` (or equivalent) type-checked against known routes; catch-all /
   optional params also aren't modeled by `PathParams`.
3. **No dev error overlay.** Errors surface via the error page and terminal, not an in-browser overlay.
4. **No ISR / on-demand revalidation.** `kind: 'static'` is build-time only; no cache-invalidation model.
5. **Node-only runtime & manual Tailwind/Sass wiring** — friction rather than blockers.

Everything below the line (image/font optimization, i18n, parallel/intercepting routes, edge adapters,
implicit fetch-cache) stays deliberately out of scope per the thesis.

## Nuances worth recording

- **Middleware wraps pages.** `app.route('/', serverApp)` is registered before the page routes, and
  Hono runs a mounted `use('*')` for the later page paths (verified with a standalone Hono 4.12 test).
  So global middleware in `src/server.ts` _does_ observe and can short-circuit page rendering — auth
  redirects and response-header injection work today. This is under-advertised.
- **`getContext()` is request-only.** It throws outside a request (module load / SSG prerender) by
  design, so a route that reads request context is effectively dynamic. A clearer prerender-time guard
  is still a nice-to-have (see IMPROVEMENTS.md).
- **"Static" is only static on hard load.** A soft navigation to a `kind: 'static'` route sends
  `Accept: text/x-component`, which skips the prerendered-file shortcut and renders fresh. Fine, but
  worth documenting so users don't assume SSG semantics on in-app nav.
- **The env guarantee holds on both paths now.** The `DATABASE_URL` secret appears in neither
  `dist/static` JS **nor** the SSR HTML/flight — even when read through a plain (non-directive) helper.

## Conclusion

Measured against its own thesis — _stability and DX, not feature count_ — rshono has reached the bar it
set for itself. The rendering pipeline, HMR, action model, progressive enhancement, CSRF/CSP hardening,
type-safe routing, and the Hono escape hatch were already genuinely good; on top of them, the
**primitives every real app reaches for on day one now exist**: reading the session/cookies to render
(`getContext`), redirecting after a mutation and returning a real 404 (`redirect`/`notFound`), navigating
programmatically with reactive URL access (`useNavigation`), and showing loading/error states during
navigation (`<NavigationProgress>`, `<Boundary>`). The SSR secret-leak that undermined the safety claim is
closed and regression-tested, and conventional root files are served. The e2e suite exercises all of it.

**Recommendation:** the earlier "1.0-ready" definition (Tier-1 primitives + the safety/convention bug
fixes) is **met**. The remaining gaps — persistent layouts, typed links, a dev error overlay — are real
DX wins but no longer block shipping a real app. Everything else (ISR, image optimization, i18n, adapters,
runtime portability, scaffolding) can stay deliberately out of scope or belongs to the future CLI package.
