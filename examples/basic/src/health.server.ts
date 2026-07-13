/**
 * Handler for the /api/quick-health endpoint — PRIVATE, never shipped.
 *
 * Inline endpoints in routes.ts reference a *.server module exporting
 * `handler`, so endpoint code stays out of the client bundle. For more
 * complex APIs, use src/app.server.ts.
 *
 * Uptime is a module-scope timestamp (not process.uptime()) so this
 * endpoint also runs on non-Node runtimes (`build --target edge`).
 */
import type { Handler } from 'rs-hono';

const startedAt = Date.now();

export const handler: Handler = (c) => c.json({ ok: true, uptime: (Date.now() - startedAt) / 1000 });
