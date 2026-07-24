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
- 🟢 **Root `build` script — FIXED.** It ran `pnpm --filter "./packages/*" build`, but the framework
  has no `build` script by design (it ships TS source), so `pnpm build` failed with
  `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`. Repointed it at the workspace members that actually produce
  artifacts: `pnpm --filter "./examples/*" build`. Also fixed `example:dev`, which filtered a
  non-existent `rshono-example` (the example package is `rs-basic`). `pnpm build` now builds the example
  (client + server + SSG) green.
- 🟢 **Ships-TypeScript-source model — CONFIRMED.** `rshono`, `rshono/server`, and `rshono/client`
  resolve to `.ts`, compiled by the *consumer's* rspack/swc; `tsx` + `@rspack/core` are runtime
  `dependencies` (deliberate for a source-shipped build tool). Verified three ways: (1) the packed
  tarball ships all of `src/**` — including the `.cjs` loaders — plus `bin/cli.cjs` (`files: ["src",
  "bin"]` is sufficient, 29 files); (2) every runtime import maps to a `dependency` or
  `peerDependency`, none to a devDependency-only path; (3) a fresh app installing **only the packed
  tarball** + peers (react/react-dom/hono), outside the workspace, both **builds** (client+server+SSG,
  even against a newer Rspack 2.1.5 within the allowed `^2.1.3` range) and **serves** (`/`, `/users`,
  `/robots.txt`, `/docs/*` all 200). _Follow-up:_ wire this `npm pack` → isolated install → build
  smoke test into CI so tarball-completeness can't silently regress.
- 🔴 **Versioning & changelog.** Decide semver policy and move off `0.1.0` intentionally; add a
  `CHANGELOG.md`. RSC internals (`react-server-dom-rspack@0.0.2`) are pre-1.0 — pin deliberately and
  document the supported React/Rspack range.

## 2. Runtime hardening — real exposure on a live deployment

- 🟢 **Unbounded request bodies — FIXED.** `renderPage` (`src/runtime/entry.rsc.tsx`) buffered action POST
  bodies via `request.formData()` / `request.text()` with no size cap — a memory-exhaustion vector. Now
  capped by `RSC_HONO_MAX_BODY_BYTES` (default 1 MiB, matching Next.js; `0` disables). An over-cap
  `Content-Length` is rejected up front with `413`; bodies that omit it (chunked) or under-report it are
  cut off mid-stream by a byte-counting `TransformStream` whose error surfaces as `413`. Covered by an e2e
  test (Content-Length path, chunked path, and under-cap pass-through). Full suite green.
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
- 🟢 Oversized request body is rejected with `413` — DONE (Content-Length, chunked, and under-cap cases).
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
