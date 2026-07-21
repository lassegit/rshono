# rshono

Minimalist framework — [Hono](https://hono.dev) + [Rspack](https://rspack.rs) + [React Server Components](https://react.dev/reference/rsc/server-components).

One required file (`src/routes.ts`), one optional file (`src/index.server.ts`), and you get a dev server with HMR, streaming SSR with RSC hydration, server actions with progressive enhancement, soft navigation, build-time prerendering, and hard env/secret safety.

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
      kind: 'static',
      component: () => import('./components/documentation'),
      staticPaths: async () => [{ slug: 'getting-started' }, { slug: 'deployment' }],
    },
    { kind: 'endpoint', path: '/api/health', server: () => import('./health.server') },
  ],
  notFound: { component: () => import('./components/404') },
  error: { component: () => import('./components/500') },
});
```

`routes.ts` only ever runs on the server — importing `*.server` modules from it (e.g. inside `staticPaths`) is safe. A plain array (no special pages) is accepted as shorthand.

## Pages are server components

Every page module **default-exports a server component** — nothing else. Under the hood each page carries Rspack's `'use server-entry'` directive (it attaches the page's client JS/CSS assets to the component — per-page code splitting with no asset manifest), but the framework **injects it automatically** for every component referenced with the inline `component: () => import('…')` thunk form in routes.ts. This also works for routes added while the dev server is running.

If a component is wired up some other way (variable indirection, barrel re-exports, computed specifiers), write `'use server-entry'` as the first line of the page module yourself — a manually written directive is always respected. The framework throws a descriptive error when neither happened.

```tsx
import type { PageProps } from 'rshono';
import { db } from '../db.server';

export default async function Profile({ params, url }: PageProps<'/profile/:id'>) {
  const user = await db.getUser(params.id);
  return <Layout>…</Layout>;
}
```

- Pages receive `{ params, url }` (`PageProps<'/profile/:id'>` types `params.id`).
- Pages render the **entire document** (`<html>…</html>`), usually via a shared layout component.
- Interactive parts are `'use client'` components imported by the page; only those ship JavaScript.
- A fully interactive page is a thin server component wrapping a `'use client'` component.

## Server actions

`'use server'` modules export functions callable from client components:

```ts
'use server';
export async function createUser(data: { name: string; email: string }) { … }
```

Call them directly from client code (typed args and result), or wire them to `<form action>` / `useActionState` — forms keep working before hydration and with JavaScript disabled (progressive enhancement). Every action response carries a fresh page payload, so server-rendered UI updates automatically after mutations.

## Full Hono underneath

- `{ kind: 'endpoint' }` routes export a Hono `handler` from a `*.server` module.
- `src/index.server.ts` may default-export a whole Hono sub-app, mounted at `/` (behind pages): any method, streaming, cookies, middleware. `export type AppType = typeof server` gives end-to-end type safety with `hono/client`.

## Env & secret safety

- **Client bundle**: `process.env` is _replaced at build time_ with a literal containing only `NODE_ENV` and `PUBLIC_`-prefixed variables. A stray `process.env.DATABASE_URL` in client code compiles to `undefined` — the value cannot ship.
- **`*.server.*` modules** (matching `.server.ts`, `.server.mjs`, …): importing one from client code **fails the build** with the offending module named — a build guarantee, not tree-shaking. Server components may import them freely (they never enter the client graph), and a `*.server` module that opens with `'use server'` is recognized as a server-actions module and compiles to server references as usual. The React `server-only` marker package also works if you prefer that convention (the RSC layer resolves the `react-server` condition), though it only fails at runtime rather than at build time.
- **Real `process.env` is confined to `*.server.*` modules and `'use server'` action modules.** Everything else — pages, shared components, and especially client components being SSR'd — sees the same PUBLIC_-filtered view as the browser, so SSR HTML and hydration always agree and a `process.env.SECRET` in component code renders empty instead of leaking into the HTML stream. Read secrets in `*.server` modules (or actions) and pass derived data down.
- `.env.local` and `.env` are loaded automatically (real environment wins).
- Mind that anything a server component _renders_ is public by definition.

## Security & hardening

- **CSRF**: server-action POSTs are origin-checked automatically — a cross-origin `Origin` header (against `Host`/`x-forwarded-host`) is rejected with 403. Applies to both client-initiated calls and no-JS form posts.
- **Render deadline**: every page render (flight + SSR) races a timeout (`RSC_HONO_RENDER_TIMEOUT_MS`, default 10000) and the client-disconnect signal, so hung data fetches can't pin sockets open.
- **CSP (opt-in)**: set `RSC_HONO_CSP=1` to send a strict per-request-nonce `Content-Security-Policy` with every HTML document (nonce stamped on bootstrap scripts, inlined flight payload, and dynamically loaded chunks). While enabled, `kind: 'static'` routes render per request — prerendered files can't carry a per-request nonce.
- **Error responses**: thrown server-action errors are redacted in production payloads (React digest behavior) — return values, not throws, for user-facing errors. Custom 404/500 pages are real server components declared in routes.ts (`notFound` / `error`); the error page's `error` prop is message-only in production, message + stack in dev.

## Testing

`pnpm --filter rshono test` — a node:test e2e suite that builds `examples/rs-basic`, boots the real production server (and a second instance with CSP on) plus a dev-server smoke, and asserts pages, flight protocol, actions (client + progressive enhancement), CSRF rejection, secret stripping in bundles _and_ rendered HTML, SSG output, and cache headers.

## How it works

Two coordinated Rspack compilers (native RSC support, `rspack.experiments.rsc`):

- **client** (`target: web`) → `dist/static`: hydration runtime, `'use client'` chunks, CSS.
- **server** (`target: node`) → `dist/server/main.mjs`: the app server itself — a Hono app assembled from your routes, rendered through two layers (RSC layer with the `react-server` condition → flight payload; SSR layer → HTML stream with the payload inlined for hydration).

In dev, the CLI watches both bundles, runs the server bundle in a worker thread (restarted per rebuild; requests gate on readiness — no dropped connections), and fronts everything on one port with static serving and an SSE channel: client edits hot-apply via react-refresh, server component edits re-fetch the payload in place — browser state survives both.

In production, `dist/server/main.mjs` is self-contained (React, Hono and the framework are bundled in; your other npm dependencies resolve from `node_modules`): `rshono start` or any process manager running `node dist/server/main.mjs`.

## Requirements & limitations

- Node ≥ 20.19 (worker threads, `process.loadEnvFile`), React ≥ 19.1.
- Dev-mode proxy doesn't forward WebSocket upgrades to a custom sub-app (prod is unaffected — the bundle owns the socket there).
- Dev source maps embed the original source of `'use server'` action modules (dev binds to 127.0.0.1 only; production ships no client source maps).
- `props.url` seen by pages in dev is the internal worker URL, not the browser-facing one.
