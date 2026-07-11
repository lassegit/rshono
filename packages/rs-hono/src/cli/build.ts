/**
 * Build Command
 *
 * Production build pipeline:
 * 1. Validate project structure & load routes (for reporting)
 * 2. Compile the client bundle via Rspack (hydration + page chunks)
 * 3. Copy public/ assets into <outDir>/client
 * 4. Pre-render `kind: "static"` routes to <outDir>/ssg (SSG)
 */
import { rspack, type Stats } from '@rspack/core';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setAssets } from '../assets.js';
import { assetManifestFromStats, writeAssetManifest } from '../builder/assets-manifest.js';
import { precompressDir } from '../builder/precompress.js';
import { createClientRspackConfig } from '../builder/rspack-config.js';
import { resolveConfig } from '../config.js';
import type { Route } from '../router.js';
import { createAppHandler } from '../server/handler.js';
import { loadRoutes } from '../server/load.js';
import { prerenderStaticRoutes } from '../server/ssg.js';

export async function buildCommand() {
    const config = await resolveConfig();
    const rootDir = process.cwd();
    const outDir = config.outDir ?? 'dist';

    console.log('📦 rs-hono build');
    console.log('');

    // ── Validate & report ─────────────────────────────────────────────
    let routes: Route[] | null = null;
    try {
        routes = await loadRoutes(rootDir);
    } catch (err) {
        console.error('  ✗ Failed to load src/routes.ts:');
        console.error(err);
        process.exit(1);
    }
    if (routes === null) {
        console.error('  ✗ src/routes.ts not found.');
        console.error('    Create it with defineRoutes() to define your pages.');
        process.exit(1);
    }

    const counts = {
        static: routes.filter((r) => r.kind === 'static').length,
        dynamic: routes.filter((r) => r.kind === 'dynamic').length,
        endpoint: routes.filter((r) => r.kind === 'endpoint').length,
    };
    console.log(`  • ${counts.static} static, ${counts.dynamic} dynamic, ${counts.endpoint} endpoints`);

    // ── Client bundle ─────────────────────────────────────────────────
    const compiler = rspack(await createClientRspackConfig({ rootDir, outDir, isDev: false, rspackHook: config.rspack }));
    const stats = await new Promise<Stats | undefined>((resolve, reject) => {
        compiler.run((err, result) => {
            compiler.close(() => (err ? reject(err) : resolve(result)));
        });
    });

    if (stats?.hasErrors()) {
        console.error(stats.toString({ preset: 'errors-warnings', colors: true }));
        console.error('  ✗ Client build failed.');
        process.exit(1);
    }
    console.log('  ✓ Client bundle compiled');

    // Record the emitted CSS: assets.json for `start`, and the live
    // registry so the SSG prerender below links it too.
    const assetManifest = stats ? assetManifestFromStats(stats) : { css: [], js: [] };
    writeAssetManifest(rootDir, outDir, assetManifest);
    setAssets(assetManifest);

    // ── Static assets ─────────────────────────────────────────────────
    const publicDir = join(rootDir, config.publicDir ?? 'public');
    if (existsSync(publicDir)) {
        cpSync(publicDir, join(rootDir, outDir, 'client'), { recursive: true });
        console.log('  ✓ Static assets copied');
    } else {
        console.log('  ○ No public/ directory');
    }

    // ── Precompression ────────────────────────────────────────────────
    // After the public/ copy so user assets get .br/.gz siblings too;
    // `rs-hono start` serves them via serveStatic's precompressed mode.
    const compressed = precompressDir(join(rootDir, outDir, 'client'));
    if (compressed > 0) {
        console.log(`  ✓ ${compressed} asset(s) precompressed (.br/.gz)`);
    }

    // ── SSG pre-rendering ─────────────────────────────────────────────
    if (counts.static > 0) {
        const ssgDir = join(rootDir, outDir, 'ssg');
        // Clear BEFORE creating the handler: the prod app snapshots
        // prerendered HTML at startup, and a stale ssg dir from a
        // previous build would get served back to the prerenderer.
        rmSync(ssgDir, { recursive: true, force: true });

        // Render through the real app so loaders, middleware and the
        // hydration payload behave exactly as they would at runtime.
        const handler = await createAppHandler({ config, rootDir, isDev: false });
        try {
            const { written } = await prerenderStaticRoutes({
                routes,
                fetch: handler,
                ssgDir,
            });
            console.log(`  ✓ ${written.length} static page(s) pre-rendered from ${counts.static} static route(s)`);
        } catch (err) {
            console.error('  ✗ SSG pre-rendering failed:');
            console.error(err);
            process.exit(1);
        }
    }

    console.log('');
    console.log('✅ Build complete. Run `rs-hono start` to serve.');
    console.log('');
    // The prerender step imports user code (routes, server.ts, onStart)
    // that may hold the event loop open (DB pools, timers) — exit explicitly.
    process.exit(0);
}
