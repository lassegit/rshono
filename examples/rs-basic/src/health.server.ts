import type { Handler } from 'rshono';

const startedAt = Date.now();

export const handler: Handler = (c) => c.json({ ok: true, uptime: (Date.now() - startedAt) / 1000 });
