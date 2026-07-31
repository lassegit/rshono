# AGENTS.md

- [Hono](https://hono.dev)
- [Rspack](https://rspack.dev)
- [React](https://react.dev/)

## This Repository

| Path                  | What it is                                                  |
| --------------------- | ----------------------------------------------------------- |
| `apps/testbed`        | Test app using `packages/core`                              |
| `apps/website`        | Landing page + docs, built with `packages/core`             |
| `packages/core`       | Minimalist RSC framework                                    |
| `packages/create`     | `npx @rshono/create` — scaffolds an app from `templates/`   |
| `packages/benchmarks` | One app built three ways — rshono vs Next vs TanStack Start |

`packages/create` generates the dependency pins and deploy-target list from `packages/core`, so
build the framework before it: `pnpm --filter @rshono/core build`. Its `templates/` are real source files, not a
template language — an option is a `Feature` plus a directory copied over the base.

`packages/benchmarks` measures what the framework costs — payload bytes, build and dev-start time,
cold start, install size — not who renders React faster; all three render through the same React, so
throughput is a floor check and nothing more. Its three apps under `apps/` are **not** pnpm workspace
members (the root `overrides` would force our React pins onto Next and TanStack Start), so they are
installed with plain `npm` by `pnpm --filter @rshono/benchmarks setup:apps`. `spec/APP_SPEC.md` is the
authority on what the apps must do, and `payload.mjs` asserts it — a failing spec check means the apps
diverged, so fix that before reading any number. Its results are published to `apps/website` at
`/benchmarks`: `results/latest.md` is gitignored, so `pnpm --filter @rshono/benchmarks site:publish`
writes a committed copy to `apps/website/content/benchmarks.md`. Re-running `bench` does not update the
website on its own.

`apps/website` documents the framework, so a change to `packages/core`'s behaviour usually means a
change to `apps/website/content/docs/`. Pages are markdown listed explicitly in
`src/content/docs.ts`; everything (parse, Shiki highlight, table of contents) runs at build time,
because every route is `render: 'static'`. Write install commands **once, in npm form** — a shell block
that is nothing but `npx …`/`npm i …` lines becomes a four-way package manager selector at build time
(`src/content/package-managers.ts`), and anything it cannot translate exactly is left as a plain block.
