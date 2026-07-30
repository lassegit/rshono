# AGENTS.md

- [Hono](https://hono.dev)
- [Rspack](https://rspack.dev)
- [React](https://react.dev/)

## This Repository

| Path              | What it is                                                |
| ----------------- | --------------------------------------------------------- |
| `apps/testbed`    | Test app using `packages/core`                            |
| `apps/website`    | Landing page + docs, built with `packages/core`           |
| `packages/core`   | Minimalist RSC framework                                  |
| `packages/create` | `npx @rshono/create` — scaffolds an app from `templates/` |

`packages/create` generates the dependency pins and deploy-target list from `packages/core`, so
build the framework before it: `pnpm --filter @rshono/core build`. Its `templates/` are real source files, not a
template language — an option is a `Feature` plus a directory copied over the base.

`apps/website` documents the framework, so a change to `packages/core`'s behaviour usually means a
change to `apps/website/content/docs/`. Pages are markdown listed explicitly in
`src/content/docs.ts`; everything (parse, Shiki highlight, table of contents) runs at build time,
because every route is `render: 'static'`.
