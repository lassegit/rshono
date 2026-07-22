# Code analysis and improvement suggestions for `packages/rshono`

Prioritized for the project's stated goal — **utmost stability and best DX, not feature count** —
and its constraints (DX first, minimal deps, RSC-native idioms, e2e suite stays green). Scaffolding
and deployment adapters are intentionally deferred to the future CLI package and are out of scope here.

---

## ✅ Shipped

The former Tier-1/Tier-2 roadmap and the safety-critical bug fixes have all landed and are covered by
`test/prod.test.mjs`. In brief:

- **Request context** — `getContext<E>()` (`rshono/server`): a curated `Ctx` (url, cookies, headers,
  env, var, raw) seeded through `AsyncLocalStorage`, propagating across `await` in server components
  and actions.
- **Control flow** — `redirect()` / `notFound()` (`rshono/server`) as `never`-returning functions;
  POST-redirect-GET with cookies surviving, real 404 page, digests that ride the flight for soft nav.
- **Client router** — a single reactive `useNavigation()` (`rshono/client`): `url`/`pathname`/
  `searchParams`/`params` plus `router.{push,replace,back,forward,refresh,pending}`, with URL data
  riding the flight payload (flicker-free hydration, no parallel store).
- **Navigation UX** — opt-in `<NavigationProgress>` bar; `<ErrorBoundary>` / `<Boundary loading error>`
  for local loading + error containment; `data-prefetch` (hover/focus warm cache) and `data-native`
  (opt out of soft nav); back/forward scroll restoration.
- **Safety / conventions** — layer-based env shadow (no more SSR secret leak, regression-tested); all
  server errors (HTML, flight, and no-JS action) route through the `error` page; `Sec-Fetch-Site` CSRF
  check; conventional root files served from `public/`.

See `BUGS.md` for the exact regression tests, and `git log` for the landing commits.

---

## Remaining work

### Content correctness & smaller wins

**Metadata story.** React 19 already hoists `<title>`/`<meta>` from anywhere in the tree (the example
relies on this). Document it explicitly, and consider a tiny optional `metadata` per route (merged into
`<head>`) so teams get a familiar convention without a heavy API.
_Files:_ README, optionally `router.ts` + `entry.rsc.tsx`.

**Revalidation / caching stance.** Decide and **document** the caching model. Minimum viable: state
clearly that pages are dynamic by default and `kind: 'static'` is build-time only; then consider an
on-demand `revalidate(path)` that re-runs SSG for a route (write-through to `dist/ssg`). Avoid Next's
implicit fetch-cache complexity — staying explicit is on-thesis.
_Files:_ `server/ssg.ts`, README.

**Tailwind / PostCSS recipe.** A documented, tested recipe (PostCSS loader wiring) so the most common
styling stack works without guesswork. If wiring is trivial, add zero-config detection of
`postcss.config.*`.
_Files:_ `builder/rspack-config.ts` (optional), README/example.

### Internal code quality & robustness

**4.2 — Reset memoized endpoint module on failure (BUGS.md #1).** `modPromise ??= endpoint.server()`
should clear the cache if the import rejects, so a transient failure doesn't poison the route.
_Files:_ `entry.rsc.tsx`.

**4.4 — Typed catch-all params + typed links.** `PathParams` doesn't model `*` / optional `:id?`.
Extend the type helper (or document the limitation), and add a route-name → path type so a future
`<Link href>` can be type-checked.
_Files:_ `router.ts`.

**Static-prerender guard for `getContext()`.** `getContext()` throws outside a request, so a route that
reads request context is dynamic. A guard could detect this during `kind: 'static'` prerender and fail
with a clear message instead of the generic throw.
_Files:_ `server/ssg.ts`, `runtime/context.ts`.

**One remaining regression test.** The safety-critical paths are largely covered; still worth adding: a
**no-JS action that throws** asserts the `error` page renders (the fix landed; the explicit PE-throw test
did not).
_Files:_ `test/prod.test.mjs`, example fixtures.

---

## Deliberately out of scope (kept off the roadmap on purpose)

Consistent with "stability + DX, not features": image/font optimization, i18n routing, parallel/
intercepting routes, edge-runtime adapters, and an implicit fetch-cache. Runtime portability and
`create-rshono` scaffolding belong to the future CLI/deployment package, per the project's own plan.

Two larger DX items are noted in `COMPARISON.md` as the biggest remaining gaps but are not yet scheduled:
**nested persistent layouts** (a segment tree with shared-layout preservation) and a **dev error
overlay**. Both are worth a design pass when the smaller wins above are done.
