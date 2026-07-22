# Bugs & correctness gaps in `packages/rshono`

Ordered by severity. Each entry: what's wrong, why, evidence, and a fix direction.
"Verified" means reproduced locally; "By inspection" means read from source with high confidence.

---

## 🟢 #1 — Failed endpoint module import is permanently memoized as a rejected promise (By inspection)

**Severity: Low (robustness).**

In `buildApp`'s endpoint handler (`src/runtime/entry.rsc.tsx`):

```ts
let modPromise;
const handler = async (c, next) => {
  modPromise ??= endpoint.server();
  const { handler: endpointHandler } = await modPromise;
  return endpointHandler(c, next);
};
```

If `endpoint.server()` rejects once, the rejected promise is cached and **every** subsequent request
to that endpoint awaits the same rejection. Low real-world impact (module specifiers resolve at build
time), but a transient failure shouldn't poison the route for the process lifetime.

### Fix direction

Reset on failure: `try { modPromise ??= endpoint.server(); ... } catch (e) { modPromise = undefined; throw e; }`.
(Tracked as IMPROVEMENTS.md 4.2.)

---

## Fixed since the last revision

All previously-listed bugs have been resolved and are covered by the e2e suite (`test/prod.test.mjs`):

- **Secrets leaking into SSR HTML from non-`'use client'` helpers** — the env shadow is now
  **layer-based** (`env-shadow-loader.cjs` gates on the SSR module layer, applied to all of `src/`)
  instead of source-sniffing `'use client'`, so transitive helpers are covered. Regression test:
  _"secrets never render into SSR HTML — even from a no-directive helper."_
- **Root-level conventional files (`/favicon.ico`, `/robots.txt`, …) never served** — `createPublicFallback`
  serves `public/` (copied to `dist/public`) at the web root for GET/HEAD, while hashed build output stays
  under `/_static`. Tests: _"conventional root files in public/ are served at the web root"_ and siblings.
- **No-JS (progressive-enhancement) action errors returned plain-text 500** — the PE branch no longer
  swallows the error; it propagates to `app.onError`, which renders the `error` page.
- **Soft-navigation / flight errors returned plain-text 500 (client hard-reloaded)** — `onError` now
  renders the `error` page as an **RSC payload** for `text/x-component` requests too. Test:
  _"flight (soft-navigation) errors render the error page as an RSC payload, not plain text."_
- **Server-action POSTs with no `Origin` bypassed CSRF** — `isSameOriginAction` now also consults
  `Sec-Fetch-Site` and rejects cross-site requests even when `Origin` is absent. Test:
  _"action POSTs with no Origin but a cross-site Sec-Fetch-Site are rejected (CSRF)."_

---

## Notes on things that are _not_ bugs (checked)

- **`process.env` in the client JS bundle** — correctly stripped; `PUBLIC_` vars correctly inlined. ✅
- **`process.env` in SSR** — now shadowed layer-wide; secrets never reach HTML or the flight payload. ✅
- **`server.ts` middleware wrapping pages** — works; a mounted Hono `use('*')` runs for the
  later-registered page routes (verified with a standalone Hono 4.12 test). ✅
- **SSG path traversal** — `readPrerendered` rejects `..` and enforces the resolved path stays under
  the ssg root. ✅
- **CSRF for the normal cross-origin cases** — cross-origin `Origin` (form post _and_ JSON client) is
  rejected with 403; covered by tests. ✅
