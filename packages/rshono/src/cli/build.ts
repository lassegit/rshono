import { rspack, type MultiStats } from '@rspack/core';
import type { Hono } from 'hono';
import { cpSync, existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createConfigs } from '../builder/rspack-config.js';
import type { Route } from '../router.js';
import { prerenderStaticRoutes } from '../server/ssg.js';

interface BuildOptions {
  rootDir: string;
}

export async function buildCommand(options: BuildOptions): Promise<void> {
  const { rootDir } = options;
  const distDir = join(rootDir, 'dist');

  console.log('  • building client + server bundles…');
  const configs = createConfigs({ rootDir, isDev: false });
  const compiler = rspack(configs);

  const stats = await new Promise<MultiStats>((resolve, reject) => {
    compiler.run((err, result) => {
      compiler.close(() => {
        if (err) reject(err);
        else resolve(result!);
      });
    });
  });

  if (stats.hasErrors()) {
    console.error(stats.toString({ preset: 'errors-warnings', colors: true }));
    process.exit(1);
  }
  console.log(stats.toString({ preset: 'summary', colors: true }));

  const publicDir = join(rootDir, 'public');
  if (existsSync(publicDir)) {
    cpSync(publicDir, join(distDir, 'static'), { recursive: true });
    console.log('  • copied public/ into dist/static');
  }

  const ssgDir = join(distDir, 'ssg');
  await rm(ssgDir, { recursive: true, force: true });
  process.env.RSC_HONO_PRERENDER = '1';
  const bundle = (await import(pathToFileURL(join(distDir, 'server', 'main.mjs')).href)) as {
    app: Hono;
    routes: readonly Route[];
  };
  const { written, skipped } = await prerenderStaticRoutes({
    routes: bundle.routes,
    fetch: (request) => bundle.app.fetch(request),
    ssgDir,
  });
  if (written.length > 0) console.log(`  • prerendered ${written.length} static page(s): ${written.join(', ')}`);
  if (skipped.length > 0) console.log(`  • skipped ${skipped.length} (will SSR per request)`);

  console.log('  ✓ build complete — run `rshono start`');
  process.exit(0);
}
