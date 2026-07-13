/**
 * Server API — Hono sub-app
 *
 * This is a standard Hono app. The framework mounts it automatically.
 * This file only ever runs on the server, so it may import *.server
 * modules freely.
 */
import { Hono } from 'hono';
import { fakeDB } from './db.server';

const server = new Hono();

// Module-scope timestamp instead of process.uptime(), so this sub-app
// also runs on non-Node runtimes (`build --target edge`).
const startedAt = Date.now();

// ─── API Routes ───────────────────────────────────────────────────────────

server.get('/api/health', (c) => {
    return c.json({
        status: 'ok',
        uptime: (Date.now() - startedAt) / 1000,˝
        timestamp: Date.now(),
    });
});

server.get('/api/users', async (c) => {
    const users = await fakeDB.listUsers();
    return c.json({ users });
});

server.post('/api/users', async (c) => {
    const body = await c.req.json<{ name: string; email: string }>();
    const user = await fakeDB.createUser(body);
    return c.json({ user }, 201);
});

server.get('/api/users/:id', async (c) => {
    const id = c.req.param('id')!;
    const user = await fakeDB.getUser(id);
    if (!user) return c.json({ error: 'Not found' }, 404);
    return c.json({ user });
});

export default server;
export type AppType = typeof server;
