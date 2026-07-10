/**
 * Handler for the /api/quick-health endpoint — PRIVATE, never shipped.
 *
 * Inline endpoints in routes.ts reference a *.server module exporting
 * `handler`, so endpoint code (like this process.uptime() read) stays
 * out of the client bundle. For more complex APIs, use src/server.ts.
 */
import type { Handler } from 'rs-hono';

export const handler: Handler = (c) => c.json({ ok: true, uptime: process.uptime() });
