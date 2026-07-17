import { Hono } from 'hono';
import type { NotFoundHandler } from 'rsc-hono';
import { fakeDB } from './db.server';

const server = new Hono();
const startedAt = Date.now();

// Optional named export: replaces the framework's plain-text 404.
// (An `onError` export works the same way for the 500 page.)
export const notFound: NotFoundHandler = (c) =>
    c.html(
        `<!doctype html><html lang="en"><body style="font-family:sans-serif;text-align:center;padding:4rem">
            <h1>404 — nothing here</h1><p><a href="/">Back to rsc-basic</a></p>
        </body></html>`,
        404,
    );

server.get('/api/health', (c) => {
    return c.json({ status: 'ok', uptime: (Date.now() - startedAt) / 1000, timestamp: Date.now() });
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
    if (!user) {
        return c.json({ error: 'Not found' }, 404);
    }

    return c.json({ user });
});

export default server;
export type AppType = typeof server; // For end to end type safety
