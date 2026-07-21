import { serveStatic } from '@hono/node-server/serve-static';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';

const CONTENT_HASHED = /\.[0-9a-f]{8,}\./;

interface StaticOptions {
  roots: string[];
  isDev: boolean;
}

export function createStaticMiddleware(options: StaticOptions): Hono {
  const { roots, isDev } = options;
  const app = new Hono();

  const withCacheControl: MiddlewareHandler = async (c, next) => {
    await next();
    if (c.res.status !== 200 && c.res.status !== 206) return;
    c.res.headers.set(
      'Cache-Control',
      isDev ? 'no-cache' : CONTENT_HASHED.test(c.req.path) ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    );
  };

  app.on(
    ['GET', 'HEAD'],
    '/*',
    withCacheControl,
    ...roots.map((root) =>
      serveStatic({
        root,
        rewriteRequestPath: (path) => path.replace(/^\/_static/, ''),
      }),
    ),
    (c) => c.text('Not Found', 404),
  );

  return app;
}
