import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { fakeDB } from './db';

const server = new Hono();
const startedAt = Date.now();

server.use(trimTrailingSlash({ alwaysRedirect: true }));

server.use('*', async (c, next) => {
  const start = performance.now();
  await next();
  const end = performance.now();
  c.res.headers.set('X-Response-Time', `${(end - start).toFixed(2)} ms`);
});

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
export type AppType = typeof server;
