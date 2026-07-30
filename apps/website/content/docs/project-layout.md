---
title: Project layout
description: The two files the framework knows about, and the conventions it deliberately does not have.
---

```
rshono.config.ts   optional — every field has a default
public/            optional — served verbatim at the web root
src/
  routes.ts        required — the route table
  server.ts        optional — a Hono sub-app mounted ahead of the page routes
  …                everything else is yours to arrange
```

Only the two files under `src/` mean anything to the framework. There is no convention attached to any
other name or directory: no `pages/`, no `app/`, no `*.server.ts`. Components, libraries and content go
wherever you decide to put them.

## Path aliases

`@/…` resolves to `src/…` in both compilers. TypeScript needs to be told the same thing, so add the
matching `paths` to your `tsconfig.json` if you use it — relative, and with no `baseUrl`, which
TypeScript 7 removed:

```json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

## What the build produces

`rshono build` writes two bundles plus your static output:

- `dist/static` — the hydration runtime, `'use client'` chunks and CSS, served under `/_static` with
  long-lived immutable caching.
- `dist/server/main.mjs` — the app server itself, self-contained.
- Prerendered pages for every [`render: 'static'`](/docs/prerendering) route.
- A copy of `public/`, so a deployed build is self-contained.

Where those land, and what the entry's default export looks like, depends on the
[deploy target](/docs/deployment).
