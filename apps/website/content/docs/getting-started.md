---
title: Getting started
description: Scaffold an rshono app, run the dev server, and ship a production build.
---

rshono is a minimalist web framework built on [Hono](https://hono.dev), [Rspack](https://rspack.rs) and
[React Server Components](https://react.dev/reference/rsc/server-components).

One required file (`src/routes.ts`), one optional file (`src/server.ts`), and you get a dev server with
HMR, streaming SSR with RSC hydration, server actions with progressive enhancement, soft navigation,
build-time prerendering, and hard env/secret safety.

> **Alpha.** The framework itself is covered by an end-to-end suite, but it is built on Rspack's
> experimental RSC support (`rspack.experiments.rsc`) and `react-server-dom-rspack`, which is still
> `0.0.x`. Those two move underneath us, so `@rspack/core` and `react-server-dom-rspack` are pinned to
> exact versions and a release of rshono is what moves them.

## Scaffold an app

```bash
npx @rshono/create@latest my-app
```

Which runner you use is also how the scaffolder learns which package manager you use: every one of them
sets `npm_config_user_agent`, so `pnpm dlx` writes a pnpm project — its lockfile, its `pnpm-workspace.yaml`,
and a `packageManager` field pinned to the version that ran. `--pm npm|pnpm|yarn|bun` overrides the guess,
which is what Yarn Classic users want, since `yarn dlx` needs Yarn 2 or newer. (`pnpx` and `pnx` are the
same command as `pnpm dlx`.)

The scaffolder asks for a deploy target, a styling choice and a formatter/linter preset, then writes a
working app. Every question is also a flag, and a non-interactive terminal implies `--yes` — so one
command can answer all of them:

```bash
npx @rshono/create@latest my-app -y --deploy cloudflare --tailwind --quality biome
```

## The commands

```bash
rshono dev     # dev server with HMR (default port 3000)
rshono build   # production build: client + server bundles + SSG
rshono start   # run the production build
```

`rshono dev` always runs the Node dev server, whatever deploy target you picked — the target is a
property of the build, not of developing.

## Requirements

- **Node ≥ 22.1** — for worker threads, `process.loadEnvFile`, `Promise.withResolvers` and `URL.parse`.
- **React ≥ 19.1** — the floor `react-server-dom-rspack` itself requires.

## Where to go next

- [Project layout](/docs/project-layout) — what the framework knows about, and what is yours to arrange.
- [Routing](/docs/routing) — the one required file.
- [Pages](/docs/pages) — how a server component becomes a page.
- [API reference](/docs/api) — every export, and which entry point it comes from.
