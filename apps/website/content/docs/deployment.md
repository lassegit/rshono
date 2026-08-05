---
title: Deployment
description: Seven targets, one build command, and the notes worth reading before choosing one.
---

`rshono build` targets one platform. Pick it with `deploy` in the config, `--deploy <name>`, or
`RSHONO_DEPLOY` — in that precedence order. The default is `node`.

`rshono dev` always runs the Node dev server whatever you choose. The target is a property of the build,
not of developing.

## The targets

| `deploy`     | Handoff                          | Assets & prerendered pages                                      | After `build`                                         |
| ------------ | -------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| `node`       | binds a port                     | from `dist/` on disk                                            | `rshono start`                                        |
| `bun`        | `{ fetch, port }` default export | from `dist/` on disk                                            | `bun dist/server/main.mjs`                            |
| `deno`       | `{ fetch }` default export       | from `dist/` on disk                                            | `deno serve -A dist/server/main.mjs`                  |
| `cloudflare` | `{ fetch }` default export       | Workers Assets; prerendered pages read via the `ASSETS` binding | `wrangler deploy`                                     |
| `vercel`     | web handler in a Node function   | CDN for assets; prerendered pages inside the function           | `vercel deploy --prebuilt`                            |
| `netlify`    | web handler, Functions v2        | CDN for assets; prerendered pages inside the function           | `netlify deploy --build=false --dir=.netlify/publish` |
| `aws-lambda` | streaming handler (Function URL) | from the deployment package                                     | zip `dist/`, handler `dist/server/main.mjs`           |

**Every target streams.** A page's HTML reaches the browser as it renders, which is the whole reason the
SSR shell is worth having. That is the bar a new target has to clear.

## Cloudflare

A Worker resolves no `node_modules` at runtime, so the build bundles **all** your dependencies. A
dependency that needs a real `node:` API beyond `nodejs_compat` will not work.

The build scaffolds a `wrangler.jsonc` if the project has none — including `nodejs_compat`, which the
request context needs for `AsyncLocalStorage` — and never touches it again.

Bindings (D1, KV, R2) arrive as `getRequestContext().env`. They are **not** available under `rshono dev`, which
is plain Node.

## Prerendered pages are never CDN-served

One URL answers with an HTML document or a flight payload depending on `Accept`, and a path-keyed CDN
cannot choose. So the app always handles page URLs.

Assets under `/_static` and `public/` _do_ go straight to the CDN where there is one.

## Compression

The framework ships no compressor. `cloudflare` and `vercel` compress at the edge regardless, and a
`node` or `aws-lambda` deploy is almost always behind something that does — a reverse proxy, a load
balancer, CloudFront.

rshono did ship a streaming-safe gzip, for the targets that might not be behind one. It was one
target's feature by the end, and a proxy does it better. If you serve a bare Node process straight to
the internet and want it back, `hono/compress` is one `app.use` in `src/server.ts` — read its docs on
streaming first, because a buffering compressor undoes streamed SSR.

## AWS

A Lambda Function URL with the invoke mode set to `RESPONSE_STREAM`, usually with CloudFront in front
for `/_static` and `public/`.

**Lambda@Edge is deliberately not a target.** CloudFront returns the response as a value rather than a
stream, caps a generated origin-request response near 1 MB, and supports no environment variables at all
— so `getRequestContext().env` would be empty there, which is a documented feature quietly doing nothing.

## A build knows what it is for

`rshono start` refuses a build made for another platform rather than starting a bundle with no listener
in it.
