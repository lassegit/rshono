import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { onServerError } from 'rshono/server';

/**
 * What this app's middleware puts on the Hono context. Pass it to `PageProps<path, AppEnv>` (or
 * `getContext<AppEnv>()`) and `ctx.var` is typed key by key instead of an open record — see
 * `components/home.tsx`.
 */
export type AppEnv = { Variables: { requestId: string } };

const server = new Hono<AppEnv>();
const startedAt = Date.now();

/**
 * Where an error tracker goes. Registered at module load — this file is imported as the server starts —
 * so every error the framework catches reaches one place: a thrown action, a failed render, SSR falling
 * over. Swap the log for `Sentry.captureException(error)` or whatever you use.
 */
onServerError((error, { source, request }) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] ${source} ${new URL(request.url).pathname}: ${message}`);
});

/** `/about/` and `/about` should not be two pages. */
server.use(trimTrailingSlash({ alwaysRedirect: true }));

/**
 * This sub-app is mounted at `/` *ahead of* the page routes, so middleware registered here wraps page
 * requests too — auth, logging, headers. The flip side: a terminal handler at the same path as a page
 * route shadows the page.
 */
server.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  const start = performance.now();
  await next();
  c.res.headers.set('X-Response-Time', `${(performance.now() - start).toFixed(1)} ms`);
});

/** Old paths that should keep working. One place to add to, rather than a handler each. */
const REDIRECTS: Record<string, string> = {
  '/home': '/',
};

for (const [from, to] of Object.entries(REDIRECTS)) {
  server.get(from, (c) => c.redirect(to, 301));
}

server.get('/api/health', (c) => {
  return c.json({ status: 'ok', uptime: (Date.now() - startedAt) / 1000, requestId: c.var.requestId });
});

export default server;

/**
 * End-to-end types for a client that calls this app: `hc<AppType>('/')` from `hono/client` gives typed
 * paths, params and responses, checked against the handlers above.
 */
export type AppType = typeof server;
