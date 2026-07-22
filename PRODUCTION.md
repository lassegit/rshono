# Getting `packages/rshono` production-ready

A grounded, prioritized checklist. Companion to `BUGS.md` (open correctness gaps),
`IMPROVEMENTS.md` (roadmap), and `COMPARISON.md` (feature parity vs Next.js).

## Verdict

The **runtime core is close to production-ready.** The render pipeline, server-action model,
env/secret safety (layer-based, regression-tested), CSRF + opt-in CSP + render-deadline hardening,
SSG, and HMR are solid and covered by a real e2e suite (44 passing tests). What's missing is mostly
**project/release hygiene, a few runtime-hardening gaps, and operational documentation** — not core
correctness. The items below are ordered by whether they block shipping.

Legend: 🔴 blocker · 🟠 hardening · 🟡 ops/docs · 🟢 done · ⚪ deferred (post-1.0)

---

## 1. Release blockers — can't publish or adopt without these

- 🔴 **CI.** There is no `.github/` at all, despite a real `test` + `typecheck` suite. A GitHub Actions
  workflow running `typecheck` + `test` + an example build on every PR is the single highest-leverage
  change — it's what keeps every other guarantee from silently regressing.
- 🔴 **LICENSE + package metadata.** `package.json` has no `license`, `repository`, `author`,
  `keywords`, `homepage`, or `bugs`, and there's no `LICENSE` file. All required before publishing
  `rshono` to npm.
- 🔴 **Root `build` script is broken.** Root `package.json` runs `pnpm --filter "./packages/*" build`,
  but `packages/rshono` has no `build` script (it ships TypeScript source). Add a `build` alias
  (typecheck, or a no-op) or fix the root script so `pnpm build` doesn't fail.
- 🔴 **Confirm the ships-TypeScript-source model.** `rshono`, `rshono/server`, and `rshono/client`
  resolve to `.ts` files, compiled by the *consumer's* rspack/swc — fine — but `tsx` and `@rspack/core`
  are runtime `dependencies`, so every production install pulls them. This is defensible for a build
  tool, but should be a deliberate, documented decision plus a smoke test that a fresh consumer app
  installs and builds cleanly against the published tarball (`npm pack` + install).
- 🔴 **Versioning & changelog.** Decide semver policy and move off `0.1.0` intentionally; add a
  `CHANGELOG.md`. RSC internals (`react-server-dom-rspack@0.0.2`) are pre-1.0 — pin deliberately and
  document the supported React/Rspack range.

## 2. Runtime hardening — real exposure on a live deployment

- 🟠 **Unbounded request bodies.** `renderPage` (`src/runtime/entry.rsc.tsx`) calls `request.formData()`
  / `request.text()` on action POSTs with no size cap — a memory-exhaustion vector. Add a configurable
  limit (e.g. `RSC_HONO_MAX_BODY_BYTES`) and reject oversized bodies with `413`.
- 🟠 **Blind trust of `x-forwarded-*`.** `publicUrl` (`src/runtime/context.ts`) and `isSameOriginAction`
  (`src/runtime/entry.rsc.tsx`) trust `x-forwarded-host` / `x-forwarded-proto` unconditionally. A
  browser can't forge `Origin` cross-site, so this isn't a browser CSRF bypass — but if the app is ever
  exposed *without* a normalizing proxy, a client can spoof the public URL (wrong absolute links /
  redirect targets, cache-poisoning-style issues). Gate forwarded-header trust behind a flag
  (e.g. `RSC_HONO_TRUST_PROXY`), or clearly document "must run behind a trusted proxy."
- 🟠 **No default security headers.** Add `X-Content-Type-Options: nosniff` and a sane `Referrer-Policy`
  to HTML responses by default (CSP is already available opt-in via `RSC_HONO_CSP=1`).
- 🟠 **Endpoint module memoized as a rejected promise (BUGS.md #1).** In `buildApp`, `modPromise ??=
  endpoint.server()` never resets on failure, so one transient import error poisons the route for the
  process lifetime. Reset `modPromise = undefined` in a `catch`.
- 🟢 **Render-timeout timer cleanup — DONE.** `renderComponent` now uses a manually-cleared
  `AbortController` + `setTimeout` (unref'd) instead of `AbortSignal.timeout()`. The timer is cleared
  when the output stream settles (via a pass-through transform's `flush`) and on client-disconnect
  abort, so fast responses no longer leave a pending timer to fire later — while the deadline stays
  armed for the whole streamed render. Typecheck + full e2e suite green.
- 🟠 **CSP posture.** Decide whether strict CSP should be on by default (or documented as strongly
  recommended) rather than purely opt-in, and add the header set to the deployment guide.

## 3. Operational readiness — mostly docs + a small surface

- 🟡 **Response compression.** No gzip/brotli today. Consistent with the "minimal deps" thesis, the
  likely answer is to **document** compressing at a reverse proxy rather than bundle a compression dep —
  but it must be stated explicitly in the deploy guide.
- 🟡 **Deployment topology docs.** Cover: running under a process manager; the fact there is no built-in
  cluster / multi-core mode (single `serve()` per process — scale with a process manager or orchestrator);
  forwarded-header expectations (ties to §2); and graceful shutdown behavior (SIGINT/SIGTERM call
  `server.close()` then hard-exit after 3s — document the drain window).
- 🟡 **Logging.** Currently `console.*` only. Acceptable given the `src/server.ts` Hono middleware escape
  hatch — but document how to add request/structured logging there, and consider a minimal built-in
  request log toggle.
- 🟡 **Health/readiness convention.** Optional: document a recommended `{ kind: 'endpoint' }` health
  route pattern (the example already ships `/api/quick-health`).

## 4. Test coverage to add (guards the above)

- 🟠 No-JS (progressive-enhancement) action that **throws** renders the `error` page (fix landed; explicit
  test still missing — see `IMPROVEMENTS.md`).
- 🟠 Oversized request body is rejected with `413` (once §2 lands).
- 🟠 Forwarded-header behavior under the trust flag (once §2 lands).
- 🟢 Endpoint-import-failure recovery (once BUGS.md #1 lands).
- 🟡 Render-deadline behavior (a route that hangs past the timeout aborts cleanly).

## 5. Deferred — not blockers (post-1.0)

Real DX wins, but none stop a real app from shipping. From `COMPARISON.md`:

- ⚪ Nested **persistent layouts** (segment tree with shared-layout preservation) — the biggest remaining
  structural gap.
- ⚪ Typed links / route-name checking; typed catch-all (`*`) and optional (`:id?`) params.
- ⚪ In-browser **dev error overlay**.
- ⚪ ISR / on-demand revalidation (`kind: 'static'` is build-time only).
- ⚪ Explicitly out of scope per the thesis: image/font optimization, i18n routing, parallel/intercepting
  routes, edge-runtime adapters, an implicit fetch-cache, and `create-rshono` scaffolding (future CLI
  package).

---

## Suggested sequence

1. **§1 release hygiene + CI** — zero runtime risk, unblocks everything else and makes the suite load-bearing.
2. **§2 hardening** — body limit, trusted-proxy gate, security headers, BUGS.md #1; add §4 tests as each lands.
3. **§3 ops docs** — the deployment guide (proxy/TLS/compression, process management, shutdown, logging).
4. **§5** — schedule after 1.0.
