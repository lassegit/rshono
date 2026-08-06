import { onServerError } from '@rshono/core/server';
import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { fakeDB } from './db';

/**
 * What this app's middleware puts on the Hono context. Pass it to `PageProps<path, AppEnv>` (or
 * `getRequestContext<AppEnv>()`) and `ctx.var` is typed key-by-key instead of an open record — see
 * `components/dashboard.tsx`.
 */
export type AppEnv = { Variables: { requestId: string }; Bindings: { DATABASE_URL: string } };

const server = new Hono<AppEnv>();
const startedAt = Date.now();

// Where an error tracker goes. Registered at module load — src/server.ts is imported as the server
// starts — so every error the framework catches (a thrown action, a failed render, SSR falling
// over) reaches one place. A real app would call Sentry.captureException here instead of logging.
onServerError((error, { source, request }) => {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`[error-reporter] ${source} ${new URL(request.url).pathname}: ${message}`);
});

server.use(trimTrailingSlash({ alwaysRedirect: true }));

server.use('*', async (c, next) => {
  // The sub-app is mounted ahead of the page routes, so a variable set here is readable from a page
  // as `ctx.var.requestId` — this is what typing `PageProps` with `AppEnv` buys.
  c.set('requestId', crypto.randomUUID());
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
