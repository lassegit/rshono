---
title: Configuration
description: rshono.config.ts — every field, every default, and what is env-overridable.
---

An optional `rshono.config.ts` (`.js` / `.mjs` also work) at the project root tunes the framework. Every
field is optional; delete the file to accept all defaults.

```ts
import { defineConfig } from '@rshono/core';

export default defineConfig({
  deploy: 'node', // hosting platform to build for (--deploy or RSHONO_DEPLOY override)
  siteUrl: 'https://example.com', // public origin, baked into prerendered pages' absolute URLs
  trustProxy: false, // honour X-Forwarded-Host/-Proto — only behind a proxy you control
  checkOrigin: true, // CSRF origin check on server-action POSTs
  allowedOrigins: [], // extra origins allowed to post actions, e.g. ['https://admin.example.com']
  csp: false, // strict per-request-nonce Content-Security-Policy
  cspDirectives: {}, // widen the built-in CSP, e.g. { 'img-src': "'self' https://cdn.example.com" }
  bodySizeLimit: '1mb', // request body cap: '512kb' | 4_000_000 | false to disable
  rspack(config, { isServer, isDev }) {
    return config; // escape hatch: mutate the generated Rspack config
  },
});
```

`defineConfig` is an identity helper for editor autocomplete; `export default { … } satisfies
RSHonoConfig` works too.

## What is compiled in, and what is not

`deploy`, `port`, `host` and `rspack` are consumed by the CLI.

The framework settings — `trustProxy`, `checkOrigin`, `allowedOrigins`, `csp`, `cspDirectives`,
`bodySizeLimit` — are resolved from this file at build time and **compiled
into the server bundle**. There is no parallel env-var interface for them; environment variables are for
secrets. Changing one of these settings means a rebuild.

Two deployment-conventional exceptions stay env-overridable:

```
--port / PORT   →  wins over the file, which wins over the default
HOST            →  same
```

Point `rshono build` at a different config with `--config <path>`.

## `siteUrl`

The public origin the site is served from. Only used when prerendering
[`render: 'static'`](/docs/prerendering) routes, where there is no request to read a `Host` from.

The origin is what's used; a path is **rejected** rather than silently dropped, because
`'https://example.com/docs'` almost certainly means the author expects a base path — and a base path is
not supported.

## The `rspack` hook

The escape hatch: mutate the generated Rspack config just before it is compiled.

```ts
rspack(config, { isServer, isDev }) {
  config.module!.rules!.push({ test: /\.md$/i, type: 'asset/source' });
}
```

Called **once per compiler** — inspect `isServer` to tell the `target: node` bundle from the
`target: web` one, and `isDev` to tell `rshono dev` from `rshono build`. Mutate `config` in place and
return nothing, or return a replacement.

This is how [Tailwind](/docs/styling) is wired up, and how this documentation site bundles its markdown.
