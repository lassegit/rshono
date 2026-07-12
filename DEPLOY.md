# Deploying rs-hono

There are only **two build artifacts**, and every platform below is one of them plus a few platform steps:

| Build | Command | Produces | Shape |
| --- | --- | --- | --- |
| **Node** | `rs-hono build --target node` | `dist/server/index.mjs` | A self-contained Node server. `node dist/server/index.mjs` and it listens — no tsx, no TypeScript, no rs-hono at runtime. |
| **Edge** | `rs-hono build --target edge` | `dist/server/app.mjs` + `dist/site/` | A portable fetch handler (`app.fetch: (Request) => Response`) plus the static files a CDN serves. |

Everything the plain `rs-hono build` produces (`dist/client`, `dist/ssg`, `assets.json`) is intermediate — the deploy only ever needs the artifacts above.

## Which target for which platform

| Platform | Target | Runs the app as | Wrapper needed |
| --- | --- | --- | --- |
| **Node.js** (VPS, Docker, PaaS) | `node` | a long-lived Node process | — |
| **Google Cloud** (Cloud Run) | `node` | a container | — |
| **Azure** (Container Apps / App Service) | `node` | a container | — |
| **Cloudflare** (Workers) | `edge` | the platform's fetch runtime | — (native) |
| **Vercel** | `edge` | a function | 3-line `hono/vercel` |
| **Netlify** | `edge` | an edge function | 3-line `hono/netlify` |
| **AWS Lambda** | `edge` | a function | 3-line `hono/aws-lambda` |

The split is simply *who owns the socket*. Node/Cloud Run/Azure run a **process** (the node bundle listens on `PORT`). Cloudflare/Vercel/Netlify/Lambda invoke a **handler**; Cloudflare speaks the raw fetch shape the bundle already exports, and the other three arrive in a proprietary event format that a one-import Hono adapter translates to a `Request`.

> Verify any edge build locally before deploying: **`rs-hono preview`** serves `dist/site` and falls through to `app.mjs` exactly the way a platform does.

---

## Node.js

The simplest deployment of all — one self-contained file.

```sh
rs-hono build --target node
node dist/server/index.mjs          # honors PORT; run it from any directory
```

Ship `dist/` and (if your loaders import runtime dependencies like a DB driver) `node_modules`. `react`, `react-dom`, `hono` and the framework are bundled in, so a dependency-free app needs no `node_modules` at all. Put it behind a process manager (`systemd`, `pm2`) or a container (below), and a reverse proxy for TLS.

---

## Docker (Node.js, Google Cloud, Azure — one image, three homes)

The container platforms differ only in how you hand them the image. The image is the same, and the node bundle already does the two things a container host expects: it listens on `process.env.PORT` and binds all interfaces.

```dockerfile
# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:node

# ---- run ----
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
CMD ["node", "dist/server/index.mjs"]
```

> Leaner image: because the node bundle inlines the framework, `rs-hono` (and `typescript`) only need to exist for the build. Move them to `devDependencies` and the `--omit=dev` runtime stage won't carry Rspack.

### Google Cloud — Cloud Run

```sh
gcloud run deploy my-app --source .
```

Cloud Run builds the `Dockerfile`, injects `PORT=8080`, and gives you an autoscaling HTTPS URL. Nothing rs-hono-specific.

### Azure — Container Apps / App Service

Push the image to a registry and deploy it:

```sh
az containerapp up --name my-app --source .
```

App Service for Containers works too; both set `PORT` for the container, which the bundle reads.

---

## Cloudflare Workers

The cleanest edge target — the artifact is already a Workers module, so there is **no wrapper**.

```sh
rs-hono build --target edge
```

```jsonc
// wrangler.jsonc
{
  "name": "my-app",
  "main": "dist/server/app.mjs",
  "compatibility_date": "2026-07-12",
  "assets": { "directory": "dist/site" },
  "upload_source_maps": true
}
```

```sh
wrangler deploy               # or `wrangler dev` to test
```

`dist/site/_headers` (emitted by the build) gives the hashed assets immutable caching automatically. Every edge build also writes a focused `dist/server/DEPLOY.md` with this exact config filled in.

---

## Vercel

```sh
rs-hono build --target edge
```

Add a function that wraps the handler:

```ts
// api/index.ts
import { handle } from 'hono/vercel';
import app from '../dist/server/app.mjs';

export default handle(app);
```

Point Vercel's static output at `dist/site` and route everything else to the function:

```json
// vercel.json
{
  "outputDirectory": "dist/site",
  "rewrites": [{ "source": "/(.*)", "destination": "/api" }]
}
```

Static files and prerendered pages are served from `dist/site` first; misses fall through to the function. (Vercel's function-runtime options move quickly — see Hono's Vercel guide for the current `runtime` setting.)

---

## Netlify

```sh
rs-hono build --target edge
```

```ts
// netlify/edge-functions/server.ts
import { handle } from 'hono/netlify';
import app from '../../dist/server/app.mjs';

export default handle(app);
export const config = { path: '/*' };
```

```toml
# netlify.toml
[build]
  publish = "dist/site"
```

The publish directory is served first; the edge function catches the rest. `dist/site/_headers` is honored by Netlify natively.

---

## AWS Lambda

```sh
rs-hono build --target edge
```

```ts
// lambda.ts
import { handle } from 'hono/aws-lambda';
import app from './dist/server/app.mjs';

export const handler = handle(app);
```

Deploy `lambda.ts` + `dist/server/app.mjs` as a zip or container image, fronted by a Lambda Function URL or API Gateway. Serve `dist/site` from S3 behind CloudFront.

**CloudFront caveat:** it does not rewrite `/signup` → `/signup/index.html` for subdirectories, so prerendered sub-pages won't be found as static objects. Either add a CloudFront Function for directory-index rewrites, or let those paths fall through to the Lambda — they render server-side, which is the designed fallback. (For CloudFront-only compute, `hono/lambda-edge` targets Lambda@Edge, with its tighter size limits.)

---

## Edge runtime rules

The node target is plain Node — no constraints. The **edge** target runs where there is no `process` and no `node:*`:

- Read request-scoped environment with `env(c)` from `hono/adapter`, not `process.env`. `PUBLIC_`-prefixed values are baked in at build time (identical to the client bundle).
- `config.server.onStart` runs at module evaluation — keep it light; it counts against cold-start CPU budget.
- A loader or endpoint that imports `node:*` will fail on non-Node runtimes. `rs-hono preview` runs the edge bundle under Node, so it won't catch a `node:*` import — a real `wrangler dev` (or the target platform's local runner) will.

---

## The `--target` convention

Today `--target` takes `node` or `edge` — the two artifacts above — and the per-platform steps are manual (a wrapper file and a config file for the four handler platforms). The natural next step is per-platform presets that emit those for you:

| Command | Would emit |
| --- | --- |
| `--target cloudflare` | edge build + `wrangler.jsonc` |
| `--target vercel` | edge build + `api/index.ts` + `vercel.json` |
| `--target netlify` | edge build + `netlify/edge-functions/server.ts` + `netlify.toml` |
| `--target lambda` | edge build + `lambda.ts` handler |
| `--target gcloud` / `azure` / `node` | node build + `Dockerfile` |

Each preset is a thin mapping onto the existing `node`/`edge` build plus one or two generated files — no new build machinery. Until those land, this document is the manual version of exactly what they would generate.
