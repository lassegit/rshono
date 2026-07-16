# rsc-hono

Minimalist multipage framework — [Hono](https://hono.dev) + [Rspack](https://rspack.rs) + [React Server Components](https://react.dev/reference/rsc/server-components).

One required file (`src/routes.ts`), one optional file (`src/index.server.ts`), and you get a dev server with HMR, streaming SSR with RSC hydration, server actions with progressive enhancement, soft navigation, build-time prerendering, and hard env/secret safety.

```bash
rsc-hono dev     # dev server with HMR (default port 3000)
rsc-hono build   # production build: client + server bundles + SSG
rsc-hono start   # run the production build
```

## The one required file: src/routes.ts

```ts
import { defineRoutes } from 'rsc-hono';

export const routes = defineRoutes([
    { path: '/', component: () => import('./components/home') },
    { path: '/profile/:id', component: () => import('./components/profile') },
    {
        path: '/docs/:slug',
        kind: 'static', // prerendered at build time
        component: () => import('./components/documentation'),
        staticPaths: async () => [{ slug: 'getting-started' }, { slug: 'deployment' }],
    },
    { kind: 'endpoint', path: '/api/health', server: () => import('./health.server') },
]);
```

routes.ts only ever runs on the server — importing `*.server` modules from it (e.g. inside `staticPaths`) is safe.

## Pages are server components

Every page module must **start with the `'use server-entry'` directive** and **default-export a server component**. The directive is what makes Rspack attach the page's client JS/CSS assets to the component — per-page code splitting with no asset manifest. The framework throws a descriptive error when it's missing.

```tsx
'use server-entry';

import type { PageProps } from 'rsc-hono';
import { db } from '../db.server';

export default async function Profile({ params, url }: PageProps<'/profile/:id'>) {
    const user = await db.getUser(params.id); // no loaders — just await
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

- **Client bundle**: `process.env` is *replaced at build time* with a literal containing only `NODE_ENV` and `PUBLIC_`-prefixed variables. A stray `process.env.DATABASE_URL` in client code compiles to `undefined` — the value cannot ship.
- **`*.server.*` modules** (matching `.server.ts`, `.server.mjs`, …) are physically replaced with a throwing stub in the client bundle — a build guarantee, not tree-shaking. Server components may import them freely.
- **Server code** keeps the real `process.env`. `.env.local` and `.env` are loaded automatically (real environment wins).
- Mind that anything a server component *renders* is public by definition.

## How it works

Two coordinated Rspack compilers (native RSC support, `rspack.experiments.rsc`):

- **client** (`target: web`) → `dist/static`: hydration runtime, `'use client'` chunks, CSS.
- **server** (`target: node`) → `dist/server/main.mjs`: the app server itself — a Hono app assembled from your routes, rendered through two layers (RSC layer with the `react-server` condition → flight payload; SSR layer → HTML stream with the payload inlined for hydration).

In dev, the CLI watches both bundles, runs the server bundle in a worker thread (restarted per rebuild; requests gate on readiness — no dropped connections), and fronts everything on one port with static serving and an SSE channel: client edits hot-apply via react-refresh, server component edits re-fetch the payload in place — browser state survives both.

In production, `dist/server/main.mjs` is self-contained (React, Hono and the framework are bundled in; your other npm dependencies resolve from `node_modules`): `rsc-hono start` or any process manager running `node dist/server/main.mjs`.

## Requirements & limitations

- Node ≥ 20.19 (worker threads, `process.loadEnvFile`), React ≥ 19.1.
- Dev-mode proxy doesn't forward WebSocket upgrades to a custom sub-app (prod is unaffected — the bundle owns the socket there).
- Dev source maps embed the original source of `'use server'` action modules (dev binds to 127.0.0.1 only; production ships no client source maps).
- `props.url` seen by pages in dev is the internal worker URL, not the browser-facing one.
