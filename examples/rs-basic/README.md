# RSC-Basic

Test app for `packages/rshono` — exercises every framework feature:

| Route               | Demonstrates                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| `/`                 | Server component page + `'use client'` counter island, PUBLIC\_ env inlining    |
| `/users`            | Async server component reading `db.server` directly + direct server action call |
| `/signup`           | `useActionState` form action with progressive enhancement (works without JS)    |
| `/profile/:id`      | Typed route params (`PageProps<'/profile/:id'>`)                                |
| `/docs/:slug`       | `kind: 'static'` — prerendered at build time via `staticPaths`                  |
| `/api/quick-health` | `kind: 'endpoint'` route with a Hono handler in a `*.server` module             |
| `/api/*`            | Hono sub-app (`src/index.server.ts`) mounted at `/`                             |

```bash
pnpm dev     # http://localhost:3000
pnpm build
pnpm start
```

`.env` holds `DATABASE_URL` (secret — never reaches the browser) and `PUBLIC_API_ENDPOINT` (inlined into the client bundle).
