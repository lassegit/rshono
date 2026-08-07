import { onServerError, publicUrl } from '@rshono/core/server';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { csrf } from 'hono/csrf';
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
 * Nothing here takes a request body, so this is a floor rather than a tuned limit: it just means an
 * unbounded POST is refused before anything downstream can buffer it. The framework runs no cap of
 * its own — see `docs/configuration#security-middleware`.
 */
server.use(bodyLimit({ maxSize: 1024 * 1024 }));

/**
 * There are no server actions on this site, so this guards nothing today — it is here so the setup
 * the docs recommend is the setup the docs site runs. `publicUrl(c)` rather than Hono's default,
 * which would compare against the address the Worker was reached on.
 */
server.use(csrf({ origin: (origin, c) => origin === publicUrl(c).origin }));

/**
 * `/docs/routing/` and `/docs/routing` should not be two pages — which matters more here than usual,
 * since every page carries a canonical tag and a duplicate would contradict it.
 */
server.use(trimTrailingSlash({ alwaysRedirect: true }));

export default server;
