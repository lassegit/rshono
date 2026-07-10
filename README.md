# Rs-hono: Ultra-minimalist SSR framework — Hono + Rspack

## The Idea

Next.js is ~1,500 dependencies. rs-hono is **4 runtime dependencies** (hono, @hono/node-server, @rspack/core, tsx) plus your React. Only ~1,500 lines of source.

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

## This Repository

| Path                      | What it is                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/rs-hono`        | The framework: CLI (`dev`/`build`/`start`), SSR + hydration runtime, Rspack integration, `*.server` boundary |
| `packages/create-rs-hono` | The scaffolder behind `pnpm create rs-hono` — copies the starter template into a new project             |
| `examples/basic`          | Test app exercising every feature: static/dynamic pages, loaders in `*.server` modules, endpoints, a `server.ts` sub-app      |

Try the example app:

```bash
pnpm install
pnpm --filter rs-hono-example dev   # → http://localhost:3000
```

## Project Structure

```
my-app/
├── src/
│   ├── features/         # Page components (any structure)
│   │   ├── home/Home.tsx
│   │   ├── profile/Profile.tsx
│   │   └── profile/Profile.server.ts  # The page's loader — server-only
│   ├── db.server.ts      # Server-only code (DB, secrets) — *.server.* naming
│   ├── routes.ts         # Single source of truth — all routes, pure data
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
`process.env` reads — and all route server code (loaders, `staticPaths`,
endpoint handlers) — live in `*.server.ts` files. `routes.ts` itself is
pure data: it references each route's server module through a lazy
`server: () => import('./Profile.server')` thunk, which resolves to the
stub in the browser. Server code is physically absent from the bundle,
not just unexecuted.

If client code accidentally calls something from a `*.server` module, it
fails loudly in the browser console:

```
[rs-hono] "getUser" comes from a *.server file and is not available in the browser.
```

## Route Types

| Kind         | Behavior                                 | Use case                         |
| ------------ | ---------------------------------------- | -------------------------------- |
| `"static"`   | Pre-rendered HTML at build time (SSG)¹   | Landing pages, docs, changelogs  |
| `"dynamic"`  | Server-rendered on each request (SSR)    | Dashboards, profiles, auth pages |
| `"endpoint"` | API handler from a `*.server` module     | One-off JSON endpoints, webhooks |

¹ `rs-hono build` renders each `static` route once and writes the HTML to
`<outDir>/ssg/`. Static routes with path params (`/docs/:slug`) declare the
pages to prerender via a `staticPaths()` export in their server module;
params not returned there fall back to per-request SSR. In dev, static
routes are always rendered live so edits show up immediately.

## How It Works

**routes.ts** — The single source of truth. Every route is declared here,
as pure data:

```ts
import { defineRoutes } from 'rs-hono';

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
        server: () => import('./features/profile/Profile.server'),
    },
    // Quick endpoint — handler lives in a *.server module too
    {
        kind: 'endpoint',
        path: '/api/health',
        server: () => import('./health.server'),
    },
]);
```

**Profile.server.ts** — The route's server code. `defineLoader` takes the
route pattern, which types `c` (`c.req.param('id')` is a plain `string`)
and is checked against the route's `path` at compile time:

```ts
import { defineLoader } from 'rs-hono';
import { db } from './db.server';

export const loader = defineLoader('/profile/:id', async (c) => {
    const user = await db.getUser(c.req.param('id'));
    // Loaders may return a Response to short-circuit rendering:
    if (!user) return c.text('Not found', 404); // or c.redirect(...)
    return { user }; // Profile receives: { params, url, user }
});
```

**Profile.tsx** — The page component. Props are inferred from the loader
(the type-only import is erased at compile time — the client bundle never
references the server module):

```tsx
import type { LoaderProps } from 'rs-hono';
import type { loader } from './Profile.server';

export default function Profile({ user, params }: LoaderProps<typeof loader>) {
    return <h1>{user.name} (id: {params.id})</h1>;
}
```

**Hydration flow** — no magic, four steps:

1. The server matches a route, runs its loader, and streams the page. The
   page's own tree renders the full document — `<html>`, `<head>`,
   `<body>`, usually via a layout component — and React adds
   `<!DOCTYPE html>` automatically.
2. It injects `window.__RSH = { route: "/profile/:id", props }` (the
   payload is escaped so loader data can never break out of the script
   tag) plus a `<script>` tag for the client bundle — both appended to
   `<body>` by React's streaming renderer.
3. The client entry imports **your** `routes.ts`, finds the route by exact
   pattern match — no client-side router needed — and `import()`s the page
   component, which Rspack served as a per-page chunk.
4. `hydrateRoot(document, <Component {...props} />)`. Done. (React 19
   hydrates the whole document and skips nodes injected by browser
   extensions.)

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

**Page components** — Regular React components. The page owns the whole
document via a `Layout` component it imports directly — `<html>`, `<head>`
and `<body>` are plain JSX, so per-page titles, meta tags, stylesheets or
inline scripts are ordinary props and elements, no head-manager API:

```tsx
// layout.tsx — just a component; have as many layouts as you like
import { Assets } from 'rs-hono';
import './styles.css'; // global CSS, bundled by Rspack

export function Layout({ title, children }: { title: string; children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <title>{title}</title>
                <Assets /> {/* links the bundled, content-hashed CSS */}
            </head>
            <body>{children}</body>
        </html>
    );
}

// Profile.tsx
export default function Profile({ user, params }: LoaderProps<typeof loader>) {
    return (
        <Layout title={`${user.name} — my app`}>
            {/* React 19 hoists meta/link tags rendered anywhere into <head> */}
            <meta property="og:title" content={user.name} />
            <h1>{user.name}</h1>
            <p>ID: {params.id}</p>
        </Layout>
    );
}
```

No magic `app/layout.tsx` file — pages compose layouts directly via React
composition. The framework appends its hydration scripts to `<body>`
automatically, and warns at request time if a page forgets to render
`<html>`.

## CSS

`import './styles.css'` from any component (typically the layout) and the
client bundle takes it from there: Rspack merges **all** imported CSS into
one minified stylesheet (content-hashed in prod for immutable caching),
and `<Assets />` — rendered in your layout's `<head>` — links it. Because
the link is in the server-rendered document, styles are present before
hydration; no flash of unstyled content, in dev, prod and prerendered
SSG pages alike.

On the server (which runs your source via tsx, not the bundler), CSS
imports are made inert by a Node loader hook — they never crash SSR.

CSS modules work too, with named imports (matching Rspack's native CSS
support — there is no default export):

```tsx
import * as styles from './Button.module.css';
// styles.hero === "Button.module__hero" — identical on server and client
```

Class names are derived from the filename (`[name]__[local]`), so
server-rendered markup matches hydration exactly. Only classes that are
valid JS identifiers are exported (use `camelCase`, not `kebab-case`).

Files in `public/` are still served verbatim under `/_static/` — use that
for assets that should skip the bundler entirely.

## Commands

| Command         | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `rs-hono dev`   | Dev server on localhost: bundle watcher + server restart on change |
| `rs-hono build` | Production client bundle (hydration + page chunks) + static assets |
| `rs-hono start` | Start the production server (`--port` flag > `PORT` env > config)  |

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
- `/_static` file serving (via `@hono/node-server`'s `serveStatic`)
  rejects path traversal — `..` segments, backslashes and double slashes
  never reach the filesystem.

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
- ✅ SSG pre-rendering at build time (param routes enumerate their pages via
  a `staticPaths()` export in the route's server module)
- ✅ Loader→props type inference (`LoaderProps<typeof loader>`), typed path
  params from the route pattern, and compile-time route validation
- ✅ Server code is physically absent from the client bundle (loaders,
  staticPaths and endpoint handlers live in `*.server` modules)
- ⏳ HMR (currently: server restart + manual browser refresh)

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
| SSG           | Per-route opt-in      | Default           | Per-route opt-in |

## License

MIT
