# CLAUDE.md

You are building Rs-hono, the ultra-minimalist and performant SSR/SSG framework with excellent developer experience. It is build on:

- [Hono](https://hono.dev)
- [Rspack](https://rspack.dev)
- React

## This Repository

| Path                      | What it is                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/rs-hono`        | The framework: CLI (`dev`/`build`/`start`), SSR + hydration runtime, Rspack integration, `*.server` boundary                  |
| `packages/create-rs-hono` | The scaffolder behind `pnpm create rs-hono` — copies the starter template into a new project                                  |
| `examples/basic`          | Test app exercising every feature: static/dynamic pages, loaders in `*.server` route modules, endpoints, a `server.ts` sub-app |

## Workflow

- ask user to test new features, don't run `pnpm` commands yourself
