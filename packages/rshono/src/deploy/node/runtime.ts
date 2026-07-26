import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { compress } from '../../server/compress.js';
import { loadEnvFiles } from '../../server/load-env.js';
import { onShutdown } from '../../server/shutdown.js';
import { readPrerendered as readPrerenderedFile } from '../../server/ssg.js';
import { createPublicFallback, createStaticMiddleware } from '../../server/static.js';
import type { DeployRuntime } from '../contract.js';

const CONFIG = __RSHONO_CONFIG__;
const isDev = CONFIG.isDev;

/**
 * The project root, derived from where the bundle itself ended up: `rshono build` writes the server
 * bundle to `<root>/dist/server/main.mjs`, and this module is a static import of the entry so it is
 * *in* that file — which makes `import.meta.dirname` `<root>/dist/server` at runtime.
 *
 * Derived rather than baked in at build time on purpose: an absolute build-time path would tie the
 * output to the machine that produced it, and building in CI to run somewhere else is the normal case.
 */
const rootDir = join(import.meta.dirname, '..', '..');

const staticDir = join(rootDir, 'dist', 'static');
const ssgDir = join(rootDir, 'dist', 'ssg');
/** `public/` is copied into `dist/` by the build, so a deployed build is self-contained; dev reads the source. */
const publicDir = isDev ? join(rootDir, 'public') : join(rootDir, 'dist', 'public');

/**
 * The Node deploy runtime: a long-lived process that owns its own port, with a filesystem behind
 * every asset. This is the shape the framework was built against, so it is also the reference
 * implementation of {@link DeployRuntime} — the `server/` modules it delegates to are shared with
 * every other platform that has a filesystem.
 */
export const runtime: DeployRuntime = {
  serveApp(app: Hono): undefined {
    // `rshono build` imports this bundle to prerender `render: 'static'` routes. That pass renders
    // through `app.fetch` directly and must not bind a port — nothing is listening for it, and the
    // build would never exit.
    if (process.env.RSC_HONO_PRERENDER) return;

    const devWorker = workerData as { port?: number; hostname?: string } | null;
    // PORT / HOST stay env-overridable (the standard deployment convention); their defaults come
    // from rshono.config.ts, baked into CONFIG. `?? ` (not `||`) so an explicit PORT=0 is honoured.
    const envPort = process.env.PORT !== undefined ? Number(process.env.PORT) : undefined;
    const port = devWorker?.port ?? envPort ?? CONFIG.port ?? 3000;
    const hostname = devWorker?.hostname ?? process.env.HOST ?? CONFIG.host ?? '0.0.0.0';

    const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
      if (parentPort) {
        parentPort.postMessage({ type: 'ready', port: info.port });
      } else {
        console.log(`  ➜ rshono serving on http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${info.port}`);
      }
    });

    onShutdown(() => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    });
  },

  mountStaticAssets(app: Hono): void {
    app.route('/_static', createStaticMiddleware({ root: staticDir, isDev }));
  },

  mountPublicFallback(app: Hono): void {
    if (!existsSync(publicDir)) return;
    app.on(['GET', 'HEAD'], '/*', createPublicFallback(publicDir, isDev));
  },

  readPrerendered(requestPath, variant) {
    return readPrerenderedFile(ssgDir, requestPath, variant);
  },

  compress: compress(),

  loadEnv(): void {
    loadEnvFiles(rootDir);
  },
};
