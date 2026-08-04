import type { Handler } from 'hono';

/** APP_SPEC.md: no React on this path at all — router and response construction only. */
export const handler: Handler = (c) => c.json({ ok: true, route: 'health' });
