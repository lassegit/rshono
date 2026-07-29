# **PROJECT_NAME**

A [rshono](https://github.com/lassegit/rshono) app — [Hono](https://hono.dev) + [Rspack](https://rspack.rs) + [React Server Components](https://react.dev/reference/rsc/server-components).

```bash
__PM_RUN__ dev        # dev server with HMR, http://localhost:3000
__PM_RUN__ build      # production build for __DEPLOY_TARGET__
__PM_RUN__ typecheck  # tsc --noEmit
```

`package.json` has the rest, including whatever your formatter and linter added.

## Layout

```
rshono.config.ts   deploy target, security and build settings
public/            served verbatim at the web root (favicon.svg → /favicon.svg)
src/
  routes.ts        the route table — the one file rshono requires
  server.ts        a Hono app: middleware, API routes, redirects, error reporting
  actions.ts       'use server' functions the browser can call
  components/      pages and components
  lib/             everything else
  styles.css       imported by the layout, so it loads with the page
```

Pages are **server components**: they render the whole document, may be `async`, and await data directly.
Interactive parts are `'use client'` components a page imports — only those ship JavaScript.

## Environment

`.env` holds committed defaults; `.env.local` overrides it and is gitignored. Only `PUBLIC_`-prefixed
variables reach the browser — everything else is server-only, and a stray read of it in client code
compiles to `undefined` rather than shipping. `src/lib/env.ts` is where both sides are read.

## Deploying

This app is built for `__DEPLOY_TARGET__`: after `__PM_RUN__ build`, **DEPLOY_HINT**.

Change `deploy` in `rshono.config.ts` to target somewhere else, or build for one place without editing the
file: `rshono build --deploy vercel`, or `RSHONO_DEPLOY=vercel` in CI. `dev` always runs the Node dev
server, whatever the target — it is a property of the build, not of developing.
