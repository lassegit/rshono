# AGENTS.md

- [Hono](https://hono.dev)
- [Rspack](https://rspack.dev)
- [React](https://react.dev/)

## This Repository

| Path                     | What it is                                                |
| ------------------------ | --------------------------------------------------------- |
| `examples/rs-basic`      | Test app using `packages/rshono`                          |
| `packages/rshono`        | Minimalist RSC framework                                  |
| `packages/create-rshono` | `npm create @rshono` — scaffolds an app from `templates/` |

`packages/create-rshono` generates the dependency pins and deploy-target list from `packages/rshono`, so
build the framework before it: `pnpm --filter @rshono/core build`. Its `templates/` are real source files, not a
template language — an option is a `Feature` plus a directory copied over the base.
