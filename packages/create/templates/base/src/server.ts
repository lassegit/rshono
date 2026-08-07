import { onServerError } from '@rshono/core/server';
import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash';

/**
 * Mounted at `/` ahead of the page routes, so middleware registered here wraps page requests too — auth,
 * logging, headers. The flip side: a terminal handler at a page's path shadows the page.
 */
const server = new Hono();

/** Every error the framework catches lands here: a thrown action, a failed render, SSR falling over. */
onServerError((error, { source, request }) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] ${source} ${new URL(request.url).pathname}: ${message}`);
});

/** `/about/` and `/about` should not be two pages. */
server.use(trimTrailingSlash({ alwaysRedirect: true }));

/** Old paths that should keep working. One place to add to, rather than a handler each. */
const REDIRECTS: Record<string, string> = { '/home': '/' };

for (const [from, to] of Object.entries(REDIRECTS)) {
  server.get(from, (c) => c.redirect(to, 301));
}

/** A JSON API route, with no page involved. The layout links to it. */
server.get('/api/health', (c) => c.json({ status: 'ok' }));

export default server;

/** `hc<AppType>('/')` from `hono/client` gives paths, params and responses typed against the handlers above. */
export type AppType = typeof server;
