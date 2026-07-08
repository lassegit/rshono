# Rs-hono: Ultra-minimalist SSR framework — Hono + Rspack

## The Idea

Next.js is ~1,500 dependencies. rs-hono is **4 runtime dependencies** (hono, @rspack/core, commander, tsx) plus your React. Only ~1,500 lines of source.

It gives you the essentials:

- **SSR** — Server-side rendering with React, streaming & Suspense
- **Hydration & code splitting** — one content-hashed chunk per page, driven by `routes.ts`
- **API Routes** — Full Hono power: middleware, cookies, WebSockets, RPC
- **A real server/client boundary** — `*.server.ts` modules are guaranteed to never reach the browser

Built on two proven foundations:

- **[Hono](https://hono.dev)** — The fastest JS web framework (Node, Deno, Bun, Cloudflare)
- **[Rspack](https://rspack.dev)** — Rust-based web bundler, drop-in webpack compatible

## Quick Start

```bash
pnpm create rs-hono@latest my-app
cd my-app
pnpm install
pnpm dev          # → rs-hono dev on http://localhost:3000
```

## Project Structure

```
my-app/
├── src/
│   ├── features/         # Page components (any structure)
│   │   ├── home/Home.tsx
│   │   └── profile/Profile.tsx
│   ├── db.server.ts      # Server-only code (DB, secrets) — *.server.* naming
│   ├── routes.ts         # Single source of truth — all page routes
│   └── server.ts         # API endpoints (Hono sub-app, optional)
├── public/               # Static assets (CSS, images, fonts)
├── rs-hono.config.ts     # Framework config
└── package.json
```

## The Server/Client Boundary

`routes.ts` is shared with the browser — it is the client's hydration
manifest, and its `import()` calls are what Rspack code-splits into
per-page chunks. That makes the boundary rule dead simple:

> **Everything in `routes.ts` is public. Everything in `*.server.ts` files
> is private — the bundler guarantees it.**

Any module named `*.server.ts` (or `.server.js` / `.server.tsx` / a
`db.server` import specifier) is replaced with a throwing stub in the
client bundle. This is a **build-time guarantee** enforced by module
replacement — not best-effort tree shaking. Your database client, secrets,
and `process.env` reads live in `*.server.ts` files; loaders in `routes.ts`
may call them inline, because loader bodies only ever *execute* on the
server. (Their source text is technically visible in the bundle — like any
public code — so don't write literal secrets inside `routes.ts` itself.)

If client code accidentally calls something from a `*.server` module, it
fails loudly in the browser console:

```
[rs-hono] "getUser" comes from a *.server file and is not available in the browser.
```

## Route Types

| Kind         | Behavior                                 | Use case                         |
| ------------ | ---------------------------------------- | -------------------------------- |
| `"static"`   | Pre-rendered HTML (SSG)¹                 | Landing pages, docs, changelogs  |
| `"dynamic"`  | Server-rendered on each request (SSR)    | Dashboards, profiles, auth pages |
| `"endpoint"` | Quick inline API handler                 | One-off JSON endpoints, webhooks |

¹ Build-time pre-rendering is not implemented yet — `static` routes are
currently server-rendered per request, same as `dynamic`.

## How It Works

**routes.ts** — The single source of truth. Every page route is declared here:

```ts
import { defineRoutes } from 'rs-hono';
import { db } from './db.server'; // server-only: stripped from the client bundle

export const routes = defineRoutes([
    // Static page
    {
        kind: 'static',
        path: '/',
        component: () => import('./features/home/Home'),
    },
    // Dynamic page — SSR with data loading
    {
        kind: 'dynamic',
        path: '/profile/:id',
        component: () => import('./features/profile/Profile'),
        loader: async (c) => {
            const user = await db.getUser(c.req.param('id')!);
            return { user }; // Profile receives: { params, url, user }
        },
    },
    // Quick inline endpoint
    {
        kind: 'endpoint',
        path: '/api/health',
        handler: (c) => c.json({ ok: true }),
    },
]);
```

**Hydration flow** — no magic, four steps:

1. The server matches a route, runs its loader, and streams the page into
   `<div id="root">`.
2. It injects `window.__RSH = { route: "/profile/:id", props }` (the
   payload is escaped so loader data can never break out of the script
   tag) plus a `<script>` tag for the client bundle.
3. The client entry imports **your** `routes.ts`, finds the route by exact
   pattern match — no client-side router needed — and `import()`s the page
   component, which Rspack served as a per-page chunk.
4. `hydrateRoot(#root, <Component {...props} />)`. Done.

**server.ts** — API endpoints as a normal Hono app (optional). This file
only runs on the server, so it can import `*.server` modules freely:

```ts
import { Hono } from 'hono';
import { db } from './db.server';

const server = new Hono();

server.get('/api/users', async (c) => {
    return c.json({ users: await db.listUsers() });
});

server.post('/api/users', async (c) => {
    const user = await db.createUser(await c.req.json());
    return c.json({ user }, 201);
});

export default server;
```

The framework auto-discovers `server.ts` and mounts it. Inline `endpoint`
routes in `routes.ts` are also supported — use whichever fits your complexity.

**Page components** — Regular React components. Use a `Layout` component directly:

```tsx
import type { PageProps } from 'rs-hono';
import { Layout } from './layout';

export default function Profile(props: Record<string, unknown>) {
    const { user, params } = props as any; // narrow types as needed
    return (
        <Layout>
            <h1>{user.name}</h1>
            <p>ID: {params.id}</p>
        </Layout>
    );
}
```

No magic `app/layout.tsx` file — pages compose layouts directly via React composition.

## Commands

| Command         | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `rs-hono dev`   | Dev server on localhost: bundle watcher + server restart on change |
| `rs-hono build` | Production client bundle (hydration + page chunks) + static assets |
| `rs-hono start` | Start the production server                                        |

In dev, the server binds to `127.0.0.1` only and restarts automatically
when any file it imports changes (`tsx watch`); the client bundle rebuilds
in parallel (Rspack watch). Refresh the browser to pick up changes.

## Configuration

```ts
// rs-hono.config.ts
import { defineConfig } from 'rs-hono/config';

export default defineConfig({
    publicDir: 'public',
    outDir: 'dist',
    dev: { port: 3000 },
    // Optional server lifecycle:
    // server: {
    //     onStart: async () => { /* connect DB, warm caches */ },
    //     middleware: async (c, next) => { /* runs before all routes */ await next(); },
    // },
});
```

## Security Defaults

- `*.server.*` modules are stripped from the client bundle at build time.
- The hydration payload is escaped (`<` becomes `\u003c`) — loader data
  containing `</script>` cannot inject markup.
- Error pages escape all interpolated values; stack traces are shown in
  dev only. Production responses say nothing about internals.
- The dev server binds to localhost only.
- `/_static` file serving decodes, then rejects path traversal (including
  the `startsWith` sibling-directory bypass).

## Design Principles

1. **Single source of truth** — `routes.ts` defines every route, for the server *and* the client. No magic conventions.
2. **Module-scoped server code** — the `*.server.ts` naming is the entire server/client story. One rule, enforced by the bundler.
3. **Explicit > implicit** — You choose `static` vs `dynamic` per route. No heuristics.
4. **No magic files** — Users compose layouts in their components. API routes are standard Hono apps.
5. **Hono underneath** — Every endpoint is a real Hono handler. Full Hono ecosystem available.
6. **Rspack is an implementation detail** — You write `import()`, Rspack handles code splitting.
7. **Reserved prefixes** — `/_static` and `/_rs-hono` are framework-internal. User routes at these paths trigger a warning.

## Status (proof of concept)

Honest notes on what is and isn't there yet:

- ✅ SSR streaming, hydration, per-page code splitting, `*.server` stripping
- ⏳ SSG pre-rendering at build time (`static` routes render per request for now)
- ⏳ HMR (currently: server restart + manual browser refresh)
- ⏳ Loader→props type inference (loaders are typed, but their return types
  don't flow into component props yet — a per-route `route()` helper is planned)

## Comparison

|               | rs-hono               | Next.js           | Remix            |
| ------------- | --------------------- | ----------------- | ---------------- |
| Source lines  | ~1,500                | ~250,000+         | ~70,000+         |
| Dependencies  | 4 (+ React)           | ~1,500            | ~700             |
| Routing       | Explicit manifest     | File-based        | File-based       |
| Server/client | `*.server.ts` modules | `"use server"`    | `.server.ts`     |
| API Routes    | Hono (full power)     | Limited           | Limited          |
| Layout system | Component composition | Magic files       | Nested files     |
| Bundler       | Rspack (Rust)         | Turbopack/webpack | esbuild/Vite     |
| SSG           | Per-route opt-in¹     | Default           | Per-route opt-in |

¹ Planned — see Status.

## License

MIT
