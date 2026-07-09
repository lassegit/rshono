/**
 * Static File Serving
 *
 * Mounted under the reserved /_static prefix. Serves from a list of
 * roots (first hit wins):
 *   dev:  [public/, <outDir>/client]   — user assets + watch-built bundle
 *   prod: [<outDir>/client]            — build copies public/ in here
 *
 * Built on @hono/node-server's serveStatic: streaming reads, MIME
 * detection, Range/HEAD support, and path-traversal protection
 * (".." segments, backslashes and double slashes are rejected before
 * the path ever reaches the filesystem).
 */
import { serveStatic } from '@hono/node-server/serve-static';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';

/** Content-hashed filenames (e.g. chunk.abc123de.js) may cache forever. */
const CONTENT_HASHED = /\.[0-9a-f]{8,}\./;

interface StaticOptions {
    roots: string[];
    isDev: boolean;
}

export function createStaticMiddleware(options: StaticOptions): Hono {
    const { roots, isDev } = options;
    const app = new Hono();

    // Cache policy is applied after the fact: serveStatic's own onFound
    // hook runs too late to add headers (the response is already built).
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
                // Mounted at /_static, but serveStatic sees the full request path.
                rewriteRequestPath: (path) => path.replace(/^\/_static/, ''),
            }),
        ),
        // All roots missed — terminate with a plain 404 instead of falling
        // through to the HTML 404 page.
        (c) => c.text('Not Found', 404),
    );

    return app;
}
