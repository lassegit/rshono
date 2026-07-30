import { onServerError } from '@rshono/core/server';
import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash';

const server = new Hono();

/**
 * Registered at module load — this file is imported as the server starts — so every error the
 * framework catches reaches one place: a failed render, SSR falling over, a throw in an endpoint.
 * Swap the log for `Sentry.captureException(error)` or whatever this ends up deployed with.
 */
onServerError((error, { source, request }) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] ${source} ${new URL(request.url).pathname}: ${message}`);
});

/**
 * `/docs/routing/` and `/docs/routing` should not be two pages — which matters more here than usual,
 * since every page carries a canonical tag and a duplicate would contradict it.
 */
server.use(trimTrailingSlash({ alwaysRedirect: true }));

export default server;
