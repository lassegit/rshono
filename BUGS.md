# Bugs & correctness gaps in `packages/rshono`

Ordered by severity. Each entry: what's wrong, why, evidence, and a fix direction.
"Verified" means reproduced locally; "By inspection" means read from source with high confidence.

---

## 🔴 #1 — Secrets leak into SSR HTML from non-`'use client'` helper modules (Verified)

**Severity: High (security). Contradicts the flagship env-safety guarantee.**

The client-JS guarantee is real: `DefinePlugin` replaces `process.env` in the **client** bundle,
so a secret never reaches browser JavaScript. But the **SSR side** relies on a _different_
mechanism — `src/builder/env-shadow-loader.cjs` — which only rewrites a module when its source
**literally opens with `'use client'`**:

```js
if (!OPENS_WITH_USE_CLIENT.test(source)) return source;
```

The server bundle (`serverConfig`) has **no `DefinePlugin`**. So any module _without_ the directive
— a shared helper, util, or barrel — that reads `process.env.SECRET` and is reachable from a client
component's render will read the **real** value during SSR and stream it into the HTML.

### Reproduction (confirmed)

A no-directive helper:

```ts
export function readSecretFromHelper() {
  return process.env.DATABASE_URL ?? '(no secret)';
}
```

…imported and rendered by a `'use client'` component (`counter.tsx`), then `rshono build && rshono start`:

- `dist/static/chunks/*.js` → secret **absent** ✅ (DefinePlugin holds)
- `GET /` SSR HTML → `HELPER_LEAK: <code>my private database url</code>` ❌ **leaked to the browser**

This also produces a **hydration mismatch**: the client renders `(no secret)` (stripped), the server
renders the real secret.

### Why it matters

The README presents env safety as _"a hard guarantee, not tree-shaking"_ and _"SSR output always
agrees with hydration."_ Both statements are false for the (very common) case of a client component
importing a plain helper that touches `process.env`.

### Fix direction

Make the SSR shadow **layer-based, not source-sniffed** — the loader can't know a module's role from
its own first line. Options, best first:

1. Apply the public-env `process.env` replacement to **everything compiled into the SSR/client layer**
   of the server bundle (e.g. gate the shadow on `issuerLayer`/module layer rather than on the
   `'use client'` regex), so transitive helpers are covered too.
2. Or run a `DefinePlugin`-equivalent (`process.env` → public env literal) scoped to the SSR layer of
   the server compiler, mirroring what the client compiler already does.
3. At minimum (stopgap): document that the boundary is _per-file directive_ and add a regression test
   (the repro above) so the hole can't silently widen.

---

## 🟠 #2 — Root-level conventional files are never served (`/favicon.ico`, `/robots.txt`, …) (Verified by inspection)

**Severity: Medium (DX / web conventions).**

Static assets are mounted **only** at `/_static`:

```ts
app.route('/_static', createStaticMiddleware({ roots: [.../dist/static, publicDir], ... }));
```

and `public/` is copied into `dist/static`, i.e. served at `/_static/<file>`. Nothing serves the web
root. Consequences:

- Browsers auto-request `GET /favicon.ico` → **404**.
- Crawlers request `GET /robots.txt`, `GET /sitemap.xml` → **404**.
- `/.well-known/…` (ACME, Apple/Google association files), `apple-touch-icon.png` → **404**.

The example sidesteps this with a `data:` URI favicon in `layout.tsx`, which hides the problem from
the demo but not from real apps.

### Fix direction

Serve a small set of conventional root paths from `public/` at `/` (either a root static fallback
scoped to known filenames, or copy top-level `public/` files so they resolve at `/`). Keep hashed
build output under `/_static` as-is.

---

## 🟡 #3 — Thrown errors in no-JS (progressive-enhancement) form actions return plain-text 500, bypassing the custom `error` page (By inspection)

**Severity: Low–Medium (DX / consistency).**

In `renderPage` (`src/runtime/entry.rsc.tsx`), the progressive-enhancement branch swallows the error
into a bare text response:

```ts
} catch (error) {
  console.error('[rshono] progressive-enhancement action failed:', error);
  return c.text('Internal Server Error: server action failed', 500);
}
```

A no-JS user who submits a form whose action _throws_ gets raw text — even though this is an HTML
navigation (`Accept: text/html`) that should render the `error` special page like every other
server error does. Client-initiated actions and page-render errors both route through the nice error
page; the no-JS path is the odd one out.

### Fix direction

Re-throw (let `app.onError` render the `error` page), or render the error page directly here with
`status: 500`. Preserve the redaction behavior already in `onError`.

---

## 🟡 #4 — Soft-navigation / flight requests that error return plain-text 500; client hard-reloads (By inspection)

**Severity: Low–Medium (DX).**

`app.onError` only renders the custom `error` page when the client wants HTML:

```ts
const wantsHtml = c.req.header('accept')?.includes('text/html') ?? false;
if (loadErrorPage && wantsHtml) { ... }
```

An in-app navigation sends `Accept: text/x-component`, so a server error during soft navigation
returns plain text; on the client, `createFromFetch` rejects and the handler falls back to
`window.location.reload()` (`entry.client.tsx`). Net effect: the custom error page never appears for
in-app navigations, and SPA state is lost on every navigation error.

### Fix direction

For flight (`isRsc`) errors, render the `error` page **as an RSC payload** (status 500) so the client
can swap it in place, matching the HTML path. Pairs naturally with per-route error boundaries
(see IMPROVEMENTS.md).

---

## 🟢 #5 — Failed endpoint module import is permanently memoized as a rejected promise (By inspection)

**Severity: Low (robustness).**

In `buildApp`'s endpoint handler:

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

---

## 🟢 #6 — Server-action POSTs with no `Origin` header bypass the CSRF check (By inspection — hardening)

**Severity: Low (hardening; matches common practice).**

```ts
function isSameOriginAction(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;   // no Origin → allowed
  ...
}
```

Returning `true` on a missing `Origin` is the conventional tradeoff (browsers reliably send `Origin`
on cross-origin POSTs), so this is not a live exploit for browser clients. Noting it for completeness:
defense-in-depth could also consult `Sec-Fetch-Site: same-origin` and/or require the custom
`x-rsc-action` header to be present for the JSON client path (it already is), rejecting requests that
have neither a same-origin `Origin` nor `Sec-Fetch-Site`.

### Fix direction

Optional: add a `Sec-Fetch-Site` check as a secondary signal; leave the `Origin` behavior as the
primary gate.

---

## Notes on things that are _not_ bugs (checked)

- **`process.env` in the client JS bundle** — correctly stripped; `PUBLIC_` vars correctly inlined. ✅
- **`server.ts` middleware wrapping pages** — works; a mounted Hono `use('*')` runs for the
  later-registered page routes (verified with a standalone Hono 4.12 test). ✅
- **SSG path traversal** — `readPrerendered` rejects `..` and enforces the resolved path stays under
  the ssg root. ✅
- **CSRF for the normal cross-origin cases** — cross-origin `Origin` (form post _and_ JSON client) is
  rejected with 403; covered by tests. ✅
