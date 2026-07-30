---
title: Environment & secrets
description: The client/server boundary is the RSC directives, and process.env follows it.
---

The client/server boundary is the RSC directives — `'use client'` and `'use server'` — not filenames,
and `process.env` access follows it. There is no `*.server` naming convention.

## The client bundle

In client code, `process.env` is **replaced at build time** with a literal containing only `NODE_ENV`
and `PUBLIC_`-prefixed variables.

A stray `process.env.DATABASE_URL` in client code compiles to `undefined`. The value cannot ship. This
is a hard guarantee, not tree-shaking, and it covers your `node_modules` too.

## `'use client'` modules during SSR

`'use client'` modules are also rendered on the server, and there they see the **same `PUBLIC_`-only
view**. A `process.env.SECRET` in a client component renders empty instead of leaking into the HTML
stream, and SSR output always agrees with hydration.

One boundary on that guarantee: this SSR-side shadowing is scoped to your own `src/`. A **third-party**
client component that reads `process.env` during SSR sees the real environment — so treat a dependency
that does that as you would any other dependency handling secrets.

## Server components and actions

Server components and `'use server'` actions read the **real** `process.env`. They run only on the
server — server components stay in the server graph, actions compile to server references — so a secret
read there never reaches the browser.

Read secrets in server code and pass derived data down.

```ts
/** Safe anywhere: `PUBLIC_` variables are the ones compiled into the browser bundle. */
export const publicEnv = {
  appName: process.env.PUBLIC_APP_NAME ?? 'website',
};

/** Server-only. Throws rather than handing back `undefined`. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} — add it to .env.local`);
  return value;
}
```

## Loading

`.env.local` and `.env` are loaded automatically. The real environment wins over both.

The convention that follows: commit `.env` with safe defaults, keep `.env.local` gitignored for the
secrets.

## Two things worth remembering

- **Anything a server component _renders_ is public by definition.** Whatever you put in the tree ships
  in the flight payload. The boundary protects `process.env`, not your JSX.
- **Keeping a server-only module out of the client bundle is the module graph's job** — import it only
  from server code. For a hard failure if that ever slips, add React's `server-only` package: the RSC
  layer resolves its `react-server` condition, so importing it from client code throws.
