# rs-hono app

Server-rendered React on [Hono](https://hono.dev) + [Rspack](https://rspack.dev) — streaming SSR, build-time SSG, and a hard server/client boundary, in a framework small enough to read.

```sh
npm run dev        # http://localhost:3000, live-reloads on save
```

## Project structure

| Path | What it is |
| --- | --- |
| `src/routes.ts` | **The** routing manifest — every page and endpoint, plain data. |
| `src/app/` | Page components. Pages own the full document (`<html>` included) via the layout. |
| `src/*.server.ts` | Server-only code: loaders, endpoint handlers, secrets. Physically stripped from the browser bundle — a leak throws in the console instead of shipping. |
| `public/` | Static files, served under `/_static/`. |
| `rs-hono.config.ts` | Port, directories, optional server middleware/hooks, Rspack escape hatch. |

Data loading: co-locate a `Page.server.ts` with a `loader` next to your page — its resolved data becomes the component's props, fully typed via `LoaderProps<typeof loader>`. Environment: `.env` / `.env.local` are loaded automatically; only `PUBLIC_`-prefixed variables ever reach the browser (and shared components) — everything else stays server-only.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with auto live-reload. |
| `npm run build` | Production build: client bundle + pre-rendered static routes. |
| `npm start` | Production server on the TypeScript source (needs `node_modules`). |
| `npm run build:node` | Build + a self-contained Node server bundle. |
| `npm run build:edge` | Build + a portable fetch-handler bundle for edge platforms. |
| `npm run preview` | Serve an edge build locally, exactly like a platform would. |

## Deployment

**Node server (simplest):**

```sh
npm run build:node
node dist/server/index.mjs      # from any directory; PORT env respected
```

No tsx, no TypeScript, no rs-hono needed at runtime — ship `dist/` plus `node_modules` for your own runtime dependencies.

**Edge platforms (Cloudflare Workers, Deno, Bun, Vercel, Netlify, AWS Lambda):**

```sh
npm run build:edge
npm run preview                 # verify locally before deploying
```

This emits `dist/server/app.mjs` (the whole app as one fetch-handler module) and `dist/site/` (everything the platform CDN serves). Copy-paste recipes for each platform — including a ready `wrangler.jsonc` — are generated into **`dist/server/DEPLOY.md`** with every edge build.

One rule for edge: server code there has no `process.env` and no `node:*` APIs — read request-scoped env with `env(c)` from `hono/adapter`.
