import type { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { compress } from '../server/compress.js';
import { loadEnvFiles } from '../server/load-env.js';
import { readPrerendered } from '../server/ssg.js';
import { createPublicFallback, createStaticMiddleware } from '../server/static.js';
import type { DeployRuntime } from './contract.js';

const isDev = __RSHONO_CONFIG__.isDev;

/**
 * The project root, derived from where the bundle itself ended up: `rshono build` writes the server
 * bundle to `<root>/dist/server/main.mjs`, and this module is bundled into it, which makes
 * `import.meta.dirname` `<root>/dist/server` at runtime.
 *
 * Derived rather than baked in at build time on purpose: an absolute build-time path would tie the
 * output to the machine that produced it, and building in CI to run somewhere else is the normal case.
 * A preset that relocates the bundle keeps `dist/server/main.mjs` intact inside its own layout for
 * exactly this reason.
 */
export const rootDir = join(import.meta.dirname, '..', '..');

const staticDir = join(rootDir, 'dist', 'static');
const ssgDir = join(rootDir, 'dist', 'ssg');
/** `public/` is copied into `dist/` by the build, so a deployed build is self-contained; dev reads the source. */
const publicDir = isDev ? join(rootDir, 'public') : join(rootDir, 'dist', 'public');

/**
 * Everything a deploy target with a real filesystem does the same way.
 *
 * Node, Bun, Deno and the serverless runtimes that unpack a bundle onto disk (Vercel, Netlify, Lambda)
 * differ only in how the finished app is handed over — so each of those presets is this object plus
 * its own {@link DeployRuntime.serveApp}, and the implementations live once, in `server/`.
 */
export const fileSystemRuntime: Omit<DeployRuntime, 'serveApp'> = {
  mountStaticAssets(app: Hono): void {
    app.route('/_static', createStaticMiddleware({ root: staticDir, isDev }));
  },

  mountPublicFallback(app: Hono): void {
    if (!existsSync(publicDir)) return;
    app.on(['GET', 'HEAD'], '/*', createPublicFallback(publicDir, isDev));
  },

  readPrerendered(c, variant) {
    return readPrerendered(ssgDir, c.req.path, variant);
  },

  compress: compress(),

  loadEnv(): void {
    loadEnvFiles(rootDir);
  },
};
