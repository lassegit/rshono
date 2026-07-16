# AGENTS.md

- [Hono](https://hono.dev)
- [Rspack](https://rspack.dev)
- [React](https://react.dev/)

## This Repository

| Path                      | What it is                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `packages/rs-hono`        | The framework: CLI (`dev`/`build`/`start`), SSR + hydration runtime, Rspack integration, `*.server` boundary                   |
| `packages/create-rs-hono` | The scaffolder behind `pnpm create rs-hono` — copies the starter template into a new project                                   |
| `examples/basic`          | Test app exercising every feature: static/dynamic pages, loaders in `*.server` route modules, endpoints, a `server.ts` sub-app |
| `examples/rsc-basic`      | Test app using `packages/rsc-hono`                                                                                             |
| `packages/rsc-hono`       | Minimalist RSC framework                                                                                                       |
