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
- **Robustness (was 4.2)** — a shared `memoizeModuleLoad` helper backs the endpoint handler and the
  notFound/error page loads; it clears the memo when a module _load_ rejects, so a transient import
  failure no longer poisons the route (a resolved module stays cached). See `BUGS.md`.
- **Static-prerender guard for `getContext()`** — reading request context while prerendering a
  `kind: 'static'` route now throws a clear, actionable error ("mark this route `dynamic`") instead of
  silently baking synthetic build-time values (localhost URL, no cookies, build env) into the snapshot.
  Detection rides the shared `RSC_HONO_PRERENDER` process signal, which crosses the framework↔app-bundle
  boundary that a module-level flag could not (the app inlines its own copy of the runtime). The route
  degrades gracefully to per-request SSR.
- **No-JS action-throw regression test** — an explicit e2e test now asserts that a progressive-enhancement
  form action that _throws_ renders the `error` page (500, redacted in prod), closing the coverage gap
  noted in `BUGS.md` (the fix had landed; the PE-throw test had not).

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

---

## Deliberately out of scope (kept off the roadmap on purpose)

Consistent with "stability + DX, not features": image/font optimization, i18n routing, parallel/
intercepting routes, edge-runtime adapters, and an implicit fetch-cache. Runtime portability and
`create-rshono` scaffolding belong to the future CLI/deployment package, per the project's own plan.

Two larger DX items are noted in `COMPARISON.md` as the biggest remaining gaps but are not yet scheduled:
**nested persistent layouts** (a segment tree with shared-layout preservation) and a **dev error
overlay**. Both are worth a design pass when the smaller wins above are done.
