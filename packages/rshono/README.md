# rshono

Minimalist framework — [Hono](https://hono.dev) + [Rspack](https://rspack.rs) + [React Server Components](https://react.dev/reference/rsc/server-components).

> **Alpha.** The framework itself is covered by an end-to-end suite (see [Testing](#testing)), but it
> is built on Rspack's experimental RSC support (`rspack.experiments.rsc`) and `react-server-dom-rspack`,
> which is still `0.0.x`. Those two move underneath us, so `@rspack/core` and `react-server-dom-rspack`
> are pinned to exact versions and a release of rshono is what moves them.

One required file (`src/routes.ts`), one optional file (`src/server.ts`), and you get a dev server with HMR, streaming SSR with RSC hydration, server actions with progressive enhancement, soft navigation, build-time prerendering, and hard env/secret safety.

```bash
rshono dev     # dev server with HMR (default port 3000)
rshono build   # production build: client + server bundles + SSG
rshono start   # run the production build
```

## The one required file: src/routes.ts

```ts
import { defineRoutes } from 'rshono';

export const routes = defineRoutes({
  routes: [
    { path: '/', component: () => import('./components/home') },
    { path: '/profile/:id', component: () => import('./components/profile') },
    {
      path: '/docs/:slug',
      render: 'static',
      component: () => import('./components/documentation'),
      staticPaths: async () => [{ slug: 'getting-started' }, { slug: 'deployment' }],
    },
    { type: 'endpoint', path: '/api/health', server: () => import('./health') },
  ],
  notFound: { component: () => import('./components/404') },
  error: { component: () => import('./components/500') },
});
```

`routes.ts` only ever runs on the server — importing server-only modules from it (e.g. inside `staticPaths`) is safe. A plain array (no special pages) is accepted as shorthand.

## Pages are server components

Every page module **default-exports a server component** — nothing else. Under the hood each page carries Rspack's `'use server-entry'` directive (it attaches the page's client JS/CSS assets to the component — per-page code splitting with no asset manifest), but the framework **injects it automatically** for every component referenced with the inline `component: () => import('…')` thunk form in routes.ts. This also works for routes added while the dev server is running.

If a component is wired up some other way (variable indirection, barrel re-exports, computed specifiers), write `'use server-entry'` as the first line of the page module yourself — a manually written directive is always respected. The framework throws a descriptive error when neither happened.

```tsx
import type { PageProps } from 'rshono';
import { db } from '../db';

export default async function Profile({ params, ctx }: PageProps<'/profile/:id'>) {
  const user = await db.getUser(params.id);
  const theme = ctx.cookies.get('theme') ?? 'light';
  return <Layout>…</Layout>;
}
```

- Pages receive `{ params, url, ctx }` (`PageProps<'/profile/:id'>` types `params.id`).
- **`ctx` is the request context** — cookies, headers, env, middleware variables, the proxy-aware URL. It is the same object `getContext()` returns from `rshono/server`, handed over so a page needs no import; reach for `getContext()` in the places that get no props (a nested server component, a `'use server'` action). Type `ctx.var` / `ctx.env` for your app by passing its Hono `Env`: `PageProps<'/profile/:id', MyEnv>`.
- Reading `ctx` on a **`render: 'static'`** page throws — a page rendered once at build time has no request to read. Use `params` and `url`, which are available either way, or make the route `render: 'dynamic'`.
- Pages render the **entire document** (`<html>…</html>`), usually via a shared layout component.
- Interactive parts are `'use client'` components imported by the page; only those ship JavaScript.
- A fully interactive page is a thin server component wrapping a `'use client'` component.
- Page props are **server-only and never serialized** — React puts a server component's output on the wire, not its props. `ctx` is additionally non-enumerable, which keeps it out of React's dev-only debug payload (an enumerable one would ship the whole Hono context, bindings included, to the browser in dev).
- **`ctx` cannot cross into a `'use client'` component**; it wraps the live request and response, which don't exist in the browser. Passing it explicitly (`<Counter ctx={ctx} />`) fails the render with React's _"Only plain objects … can be passed to Client Components"_, naming the prop. Spreading page props instead (`<Counter {...props} />`) drops it silently, since a spread copies enumerables only. Either way: read what you need on the server and pass plain values down.

## Server actions

`'use server'` modules export functions callable from client components:

```ts
'use server';
export async function createUser(data: { name: string; email: string }) { … }
```

Call them directly from client code (typed args and result), or wire them to `<form action>` / `useActionState` — forms keep working before hydration and with JavaScript disabled (progressive enhancement). Every action response carries a fresh page payload, so server-rendered UI updates automatically after mutations.

## Full Hono underneath

- `{ type: 'endpoint' }` routes export a Hono `handler` from a server module (it only ever runs on the server).
- `src/server.ts` may default-export a whole Hono sub-app: any method, streaming, cookies, middleware. `export type AppType = typeof server` gives end-to-end type safety with `hono/client`.
- The sub-app is mounted at `/` **ahead of the page routes**, so its middleware (auth, logging, trailing-slash) wraps page requests too. The flip side: a _terminal_ handler in `src/server.ts` at the same path as a page route shadows the page.

## Static files

- Drop anything you want served verbatim into `public/` — it's mounted at the **web root**, so `public/favicon.ico` → `/favicon.ico`, `public/robots.txt` → `/robots.txt`, `public/.well-known/…` resolves too. This is the home for the conventional files browsers and crawlers request by path.
- It's a **fallback**: your routes always win, and unmatched paths still fall through to the `notFound` page — so a `public/` file never shadows a real route. `build` copies `public/` into `dist/` so a deployed build is self-contained.
- Hashed bundle output is served separately under `/_static/` with long-lived immutable caching; `public/` files get a short `max-age` (and `no-cache` in dev).

## Prerendering (`render: 'static'`)

A static route is built once and served from disk in **both** representations — `index.html` for a hard load, `index.rsc` for the flight payload a soft navigation asks for. Serving only the document would mean every in-app click re-rendered a page the build had already produced, so the prerender would pay off for crawlers and nobody else. Both carry a weak `ETag`, so a revalidation costs a 304.

Set **`siteUrl`** if your static pages build absolute URLs — a canonical tag, an `og:url`, an absolute link. A prerendered file is one set of bytes handed to everyone, so there is no request to read a `Host` from and the origin has to be decided at build time; without `siteUrl` it is `http://localhost`, and the build warns. Dynamic routes are unaffected — they resolve the URL per request, `siteUrl` or not.

If a page can't be prerendered (its `staticPaths` is missing, or it didn't render cleanly at build time) the build says so and that route falls back to rendering per request.

## Env & secret safety

The client/server boundary is the RSC directives — `'use client'` and `'use server'` — not filenames, and `process.env` access follows it. There is no `*.server` naming convention.

- **Client bundle**: `process.env` is _replaced at build time_ with a literal containing only `NODE_ENV` and `PUBLIC_`-prefixed variables. A stray `process.env.DATABASE_URL` in client code compiles to `undefined` — the value cannot ship. This is a hard guarantee, not tree-shaking, and it covers your `node_modules` too.
- **`'use client'` modules are also SSR'd on the server**, and there they see the same `PUBLIC_`-only view. A `process.env.SECRET` in a client component renders empty instead of leaking into the HTML stream, and SSR output always agrees with hydration. This SSR-side shadowing is scoped to your own `src/` — a _third-party_ client component that reads `process.env` during SSR sees the real environment, so treat a dependency that does that as you would any other dependency handling secrets.
- **Server components and `'use server'` actions read the real `process.env`.** They run only on the server — server components stay in the server graph, actions compile to server references — so a secret read there never reaches the browser. Read secrets in server code and pass derived data down.
- `.env.local` and `.env` are loaded automatically (real environment wins).
- Anything a server component _renders_ is public by definition — whatever you put in the tree ships in the flight payload.
- Keeping a server-only module out of the client bundle is the module graph's job: import it only from server code. For a hard failure if that ever slips, add React's `server-only` package — the RSC layer resolves its `react-server` condition, so importing it from client code throws.

## Configuration: rshono.config.ts

An optional `rshono.config.ts` (`.js` / `.mjs` also work) at the project root tunes the framework. Every field is optional; delete the file to accept all defaults.

```ts
import { defineConfig } from 'rshono';

export default defineConfig({
  deploy: 'node', // hosting platform to build for — see Deployment (--deploy or RSHONO_DEPLOY override)
  siteUrl: 'https://example.com', // public origin, baked into prerendered pages' absolute URLs
  port: 3000, // default port for dev/start (--port or PORT env override)
  host: '0.0.0.0', // bind address for start (HOST env overrides)
  trustProxy: false, // honour X-Forwarded-Host/-Proto — only behind a proxy you control
  checkOrigin: true, // CSRF origin check on server-action POSTs
  allowedOrigins: [], // extra origins allowed to post actions, e.g. ['https://admin.example.com']
  csp: false, // strict per-request-nonce Content-Security-Policy
  cspDirectives: {}, // widen the built-in CSP, e.g. { 'img-src': "'self' https://cdn.example.com" }
  bodySizeLimit: '1mb', // request body cap: '512kb' | 4_000_000 | false to disable
  renderTimeout: 10_000, // ms deadline for a request (action + flight + SSR)
  compress: true, // gzip compressible responses (streaming-safe)
  rspack(config, { isServer, isDev }) {
    return config; // escape hatch: mutate the generated Rspack config
  },
});
```

`defineConfig` is an identity helper for editor autocomplete; `export default { … } satisfies RSHonoConfig` works too. `deploy`/`port`/`host`/`rspack` are consumed by the CLI; the framework settings (`trustProxy`, `checkOrigin`, `allowedOrigins`, `csp`, `cspDirectives`, `bodySizeLimit`, `renderTimeout`, `compress`) are resolved from this file at build time and **compiled into the server bundle** — there is no parallel env-var interface for them (environment variables are for secrets). Changing one of these settings means a rebuild. The two deployment-conventional exceptions stay env-overridable: `--port`/`PORT` and `HOST` win over the file, which wins over the built-in default. Point `rshono build` at a different config with `--config <path>`.

## Security & hardening

- **Every `'use server'` export is a public HTTP endpoint.** That's the RSC model, not an rshono choice: the client is handed an id for each action and can call it with whatever arguments it likes. The CSRF check below proves a request came from your own site — it says nothing about _who_ sent it. Authenticate and authorize inside the action (and validate its arguments) exactly as you would in a route handler.
- **CSRF**: server-action POSTs are origin-checked automatically — a cross-origin `Origin` (compared against your own host) is rejected with 403, as is anything the browser labels `Sec-Fetch-Site: cross-site`/`same-site`. A browser-asserted `Sec-Fetch-Site: same-origin` is accepted directly, which is what keeps the check from misfiring behind a proxy that rewrites `Host`. Applies to both client-initiated calls and no-JS form posts. Turn it off with `checkOrigin: false` behind a gateway that already enforces it, or list trusted cross-origins in `allowedOrigins` (full origins or bare hosts; a malformed entry fails the build).
- **Proxy headers are not trusted by default.** `X-Forwarded-Host` / `-Proto` are client-supplied, so honouring them blindly lets anyone who can reach the server dictate the origin of every absolute URL the app builds (`getContext().url`, a page's `url` prop) — poisoning canonical tags, emails and redirects, and any shared cache in front. Set `trustProxy: true` only when a proxy you control sets those headers; `rshono dev` forces it on for its own localhost-bound proxy.
- **Request deadline**: every request races a timeout (`renderTimeout`, default 10000) and the client-disconnect signal — covering the server action as well as flight + SSR — so neither a hung data fetch nor a hung mutation can pin sockets open.
- **Request-body limit**: request bodies are capped (`bodySizeLimit`, default 1048576 = 1 MiB) before they're buffered into memory — oversized bodies are rejected with `413 Payload Too Large`. This covers **every** route, not just server actions: `{ type: 'endpoint' }` routes and the `src/server.ts` sub-app are equally exposed the moment they call `.json()` or `.formData()`. An over-cap `Content-Length` is refused up front; bodies that omit it (chunked) are cut off mid-stream. Set to `false`/`0` to disable (e.g. behind a proxy that already enforces a limit, or to stream a large upload yourself). Raise it for large multipart uploads.
- **Baseline response headers**: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `X-Frame-Options: SAMEORIGIN` on every response, unconditionally. The framing header is the floor for everyone who hasn't opted into `csp` — that policy's `frame-ancestors 'none'` is stricter and takes precedence where both apply. Set any of them in your own middleware to override.
- **Caching defaults**: a dynamic page is answered with `Cache-Control: private, no-cache` — a page is request-specific by default (cookies, session, headers), and with no directives at all a shared cache is free to store one user's page and serve it to the next. `private` forbids exactly that, and `no-cache` makes the browser revalidate rather than re-show a stale personalised page; neither disables bfcache the way `no-store` would. Set your own value (from middleware, or `getContext().header(…)`) and it is left alone. Prerendered pages keep `public, max-age=300` and carry a weak `ETag`, so a revalidation costs a 304 instead of the page.
- **`Vary: Accept` on page responses.** One URL answers with an HTML document or a flight payload depending on `Accept`. Without `Vary` a cache keyed on the URL alone will eventually hand a document to a soft navigation that asked for flight — a hard reload at best. Compression appends `Accept-Encoding` to the same header rather than replacing it.
- **CSP (opt-in)**: set `csp: true` to send a strict per-request-nonce `Content-Security-Policy` with every HTML document (nonce stamped on bootstrap scripts, inlined flight payload, and dynamically loaded chunks). Beyond `default-src 'self'` it also closes the gaps `default-src` doesn't cover — `base-uri`, `object-src`, `frame-ancestors`, `form-action` — so it blocks framing and third-party assets until you widen it with `cspDirectives` (the nonce is always re-appended to `script-src`, and `''` drops a directive). While enabled, the **document** for a `render: 'static'` route is rendered per request — a prerendered file can't carry a per-request nonce. Its flight payload never carries one, so soft navigations are still served from the prerender.
- **Error reporting**: every error the framework catches — a thrown action, a failed render, SSR falling over, anything reaching the top-level handler — goes through one funnel. Register a handler at the top level of `src/server.ts` to send them somewhere real; they keep going to `stderr` either way, and a handler that throws is caught rather than failing the request.

  ```ts
  // src/server.ts
  import { onServerError } from 'rshono/server';

  onServerError((error, { source, request }) => {
    Sentry.captureException(error, { tags: { source }, extra: { url: request.url } });
  });
  ```

- **Error responses**: thrown server-action errors are logged server-side and redacted in the production payload (React sends no message or digest for them) — so return values, not throws, for anything the user should see. Custom 404/500 pages are real server components declared in routes.ts (`notFound` / `error`); the error page's `error` prop is message-only in production, message + stack in dev.
- **No blank screens.** Three fallbacks behind the `error` page, so a failure is always something you can read:
  - An **uncaught client-side render error** makes React tear down its root — which here is the whole `document`, so the page would go genuinely white with the reason only in the console. The runtime paints a fatal overlay over it instead: full stack and component stack in dev, a generic notice plus a reload button in production (the dev detail is compiled out of the production bundle).
  - If **SSR fails before the shell is sent**, the `error` page can't be reached either, so the framework answers with its own visible 500 document — the real message and stack in dev, generic in production. It deliberately attaches no client runtime: the flight payload came from the same failed render, so hydrating it would tear the document down and blank the message.
  - A **client bootstrap failure** (a truncated or malformed initial payload) is reported and surfaced rather than becoming a silent unhandled rejection.

## Testing

`pnpm --filter rshono test` builds the package and runs everything that doesn't need a browser:

- **unit** — the parsers and path maths (`bodySizeLimit`, `allowedOrigins`, SSG paths and traversal, control-signal digests, page-file scanning, `Vary`/`ETag` helpers). Imports the built `dist/`, so it also proves the published output loads in plain Node.
- **compression** — that gzip does not swallow a streamed response: a chunk the renderer flushes has to reach the client while the response is still open, which is the one property the platform `CompressionStream` would quietly break.
- **production e2e** — builds `examples/rs-basic`, boots the real production server, and asserts pages, flight protocol, actions (client + progressive enhancement), CSRF rejection, secret stripping in bundles _and_ rendered HTML, SSG output with `ETag`/304, cache and security headers, and error reporting. Settings baked into the bundle (CSP, CSRF allowlist/origin-check, body-size cap) each get their own build from a fixture config (`test/fixtures/`, via `rshono build --config`).
- **minimal app** — a fixture with `src/routes.ts` and nothing else: no `server.ts`, no `public/`, no config, no `notFound`/`error` pages. Everything the docs call optional, actually left out.
- **dev** — a smoke test through the dev server's worker + proxy.

`pnpm --filter rshono test:browser` runs the Playwright suite against a production build: hydration, soft navigation, prefetch-on-hover, `useNavigation`, client-initiated actions, boundary fallbacks, scroll restoration and the fatal overlay — the client runtime, which no amount of asserting on HTML can reach.

## How it works

Two coordinated Rspack compilers (native RSC support, `rspack.experiments.rsc`):

- **client** (`target: web`) → `dist/static`: hydration runtime, `'use client'` chunks, CSS.
- **server** (`target: node`) → `dist/server/main.mjs`: the app server itself — a Hono app assembled from your routes, rendered through two layers (RSC layer with the `react-server` condition → flight payload; SSR layer → HTML stream with the payload inlined for hydration).

In dev, the CLI watches both bundles, runs the server bundle in a worker thread (restarted per rebuild; requests gate on readiness — no dropped connections), and fronts everything on one port with static serving and an SSE channel: client edits hot-apply via react-refresh, server component edits re-fetch the payload in place — browser state survives both.

In production, `dist/server/main.mjs` is self-contained (React, Hono and the framework are bundled in; your other npm dependencies resolve from `node_modules`): `rshono start` or any process manager running `node dist/server/main.mjs`.

Everything in that bundle that depends on _where_ it runs — binding a port, serving `/_static` and `public/`, reading a prerendered page, gzipping, loading `.env` — sits behind a single interface (`DeployRuntime`) that the build resolves per `deploy` target, so the request-handling code has no platform in it. The entry's default export is whatever the platform expects: nothing where rshono owns the process, a `fetch` handler where the host does.

## Deployment

`rshono build` targets one platform. Pick it with `deploy` in the config, `--deploy <name>`, or `RSHONO_DEPLOY` (in that precedence order); the default is `node`. `rshono dev` always runs the Node dev server whatever you choose — the target is a property of the build, not of developing.

| `deploy`     | Handoff                          | Assets & prerendered pages                                      | After `build`                                         |
| ------------ | -------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| `node`       | binds a port                     | from `dist/` on disk                                            | `rshono start`                                        |
| `bun`        | `{ fetch, port }` default export | from `dist/` on disk                                            | `bun dist/server/main.mjs`                            |
| `deno`       | `{ fetch }` default export       | from `dist/` on disk                                            | `deno serve -A dist/server/main.mjs`                  |
| `cloudflare` | `{ fetch }` default export       | Workers Assets; prerendered pages read via the `ASSETS` binding | `wrangler deploy`                                     |
| `vercel`     | web handler in a Node function   | CDN for assets; prerendered pages inside the function           | `vercel deploy --prebuilt`                            |
| `netlify`    | web handler, Functions v2        | CDN for assets; prerendered pages inside the function           | `netlify deploy --build=false --dir=.netlify/publish` |
| `aws-lambda` | streaming handler (Function URL) | from the deployment package                                     | zip `dist/`, handler `dist/server/main.mjs`           |

Every target streams: a page's HTML reaches the browser as it renders, which is the whole reason the SSR shell is worth having. That is the bar a new target has to clear.

Notes worth knowing before choosing one:

- **Cloudflare** bundles all your dependencies (a Worker resolves no `node_modules` at runtime), so a dependency that needs a real `node:` API beyond `nodejs_compat` will not work. The build scaffolds a `wrangler.jsonc` if the project has none — including `nodejs_compat`, which the request context needs for `AsyncLocalStorage` — and never touches it again. Bindings (D1, KV, R2) arrive as `getContext().env`; they are not available under `rshono dev`, which is plain Node.
- **Prerendered pages are never CDN-served.** One URL answers with an HTML document or a flight payload depending on `Accept`, and a path-keyed CDN cannot choose, so the app always handles page URLs. Assets under `/_static` and `public/` do go straight to the CDN where there is one.
- **Compression** is left to the platform on `cloudflare`, `vercel` and `netlify`; the framework's streaming gzip is used on `node`, `bun`, `deno` and `aws-lambda`. Your `compress` setting only decides whether an available compressor is used.
- **AWS** means a Lambda Function URL with the invoke mode set to `RESPONSE_STREAM`, usually with CloudFront in front for `/_static` and `public/`. **Lambda@Edge is deliberately not a target**: CloudFront returns the response as a value rather than a stream, caps a generated origin-request response near 1 MB, and supports no environment variables at all — so `getContext().env` would be empty there, which is a documented feature quietly doing nothing.
- `rshono start` refuses a build made for another platform rather than starting a bundle with no listener in it.

## Requirements & limitations

- Node ≥ 22.1 (worker threads, `process.loadEnvFile`, `Promise.withResolvers`, `URL.parse`), React ≥ 19.1 (the floor `react-server-dom-rspack` itself requires).
- Responses are gzipped, not brotli — one encoding every client accepts, chosen per chunk so streaming survives. Set `compress: false` behind a proxy that does better.
- Dev-mode proxy doesn't forward WebSocket upgrades to a custom sub-app (prod is unaffected — the bundle owns the socket there).
- Dev source maps embed the original source of `'use server'` action modules (dev binds to 127.0.0.1 only; production ships no client source maps).
