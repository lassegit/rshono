/**
 * Build Command
 *
 * Production build pipeline:
 * 1. Validate project structure & load routes (for reporting)
 * 2. Compile the client bundle via Rspack (hydration + page chunks)
 * 3. Copy public/ assets into <outDir>/client
 * 4. Pre-render `kind: "static"` routes to <outDir>/ssg (SSG)
 * 5. With --target: compile a server bundle (<outDir>/server) — and for
 *    edge, assemble <outDir>/site for the platform CDN
 */
import { rspack, type RspackOptions, type Stats } from '@rspack/core';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setAssets } from '../assets.js';
import { assetManifestFromStats, writeAssetManifest } from '../builder/assets-manifest.js';
import { generateDeployDoc, generateHeadersFile } from '../builder/deploy-doc.js';
import { precompressDir } from '../builder/precompress.js';
import { createClientRspackConfig } from '../builder/rspack-config.js';
import { createServerRspackConfig, type ServerBundleTarget } from '../builder/rspack-server-config.js';
import { generateServerEntry } from '../builder/server-entry.js';
import { resolveConfig } from './resolve-config.js';
import type { Route } from '../router.js';
import { createAppHandler } from '../server/handler.js';
import { loadRoutes } from '../server/load.js';
import { prerenderStaticRoutes } from '../server/ssg.js';

export async function buildCommand(target?: ServerBundleTarget) {
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
    const stats = await runCompiler(await createClientRspackConfig({ rootDir, outDir, isDev: false, rspackHook: config.rspack }), 'Client');
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
    // `rs-hono start` (and the node server bundle) serve them via
    // serveStatic's precompressed mode. Skipped for edge: the platform
    // CDN compresses on its own, and the siblings would pollute site/.
    if (target !== 'edge') {
        const compressed = precompressDir(join(rootDir, outDir, 'client'));
        if (compressed > 0) {
            console.log(`  ✓ ${compressed} asset(s) precompressed (.br/.gz)`);
        }
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

    // ── Server bundle (--target node|edge) ────────────────────────────
    if (target) {
        // Generated AFTER the client compile so the asset manifest
        // (hashed entry/CSS names) can be baked in as a literal.
        const generated = generateServerEntry({ rootDir, outDir, publicDir: config.publicDir ?? 'public', target });
        for (const file of generated.files) {
            writeFileSync(file.path, file.source);
        }
        try {
            await runCompiler(
                await createServerRspackConfig({ rootDir, outDir, target, entryFile: generated.entryPath, assets: assetManifest, rspackHook: config.rspack }),
                'Server',
            );
        } finally {
            for (const file of generated.files) {
                rmSync(file.path, { force: true });
            }
        }
        const bundleFile = target === 'edge' ? 'app.mjs' : 'index.mjs';
        console.log(`  ✓ Server bundle compiled → ${outDir}/server/${bundleFile}`);

        if (target === 'edge') {
            // What the platform CDN serves: the client bundle + public/
            // under _static/, and prerendered pages at their pretty
            // paths — the function only ever sees cache misses.
            const siteDir = join(rootDir, outDir, 'site');
            rmSync(siteDir, { recursive: true, force: true });
            mkdirSync(join(siteDir, '_static'), { recursive: true });
            cpSync(join(rootDir, outDir, 'client'), join(siteDir, '_static'), { recursive: true });
            const ssgDir = join(rootDir, outDir, 'ssg');
            if (existsSync(ssgDir)) {
                cpSync(ssgDir, siteDir, { recursive: true });
            }
            writeFileSync(join(siteDir, '_headers'), generateHeadersFile());
            writeFileSync(
                join(rootDir, outDir, 'server', 'DEPLOY.md'),
                generateDeployDoc({ outDir, buildDate: new Date().toISOString().slice(0, 10) }),
            );
            console.log(`  ✓ Static site assembled → ${outDir}/site (with _headers)`);
        }
    }

    console.log('');
    if (target === 'edge') {
        console.log('✅ Build complete.');
        console.log(`   Handler: ${outDir}/server/app.mjs · Static dir: ${outDir}/site — everything else in ${outDir}/ is intermediate.`);
        console.log(`   Verify locally: \`rs-hono preview\`. Platform recipes: ${outDir}/server/DEPLOY.md`);
    } else if (target === 'node') {
        console.log('✅ Build complete.');
        console.log(`   Run \`node ${outDir}/server/index.mjs\` — from any directory; keep ${outDir}/'s layout intact.`);
        console.log(`   (Ship ${outDir}/ plus node_modules for your own runtime dependencies — rs-hono itself can be a devDependency.)`);
    } else {
        console.log('✅ Build complete. Run `rs-hono start` to serve.');
    }
    console.log('');
    // The prerender step imports user code (routes, server.ts, onStart)
    // that may hold the event loop open (DB pools, timers) — exit explicitly.
    process.exit(0);
}

/** Run a compiler to completion; exits the process on compile errors. */
async function runCompiler(config: RspackOptions, label: string): Promise<Stats | undefined> {
    const compiler = rspack(config);
    const stats = await new Promise<Stats | undefined>((resolve, reject) => {
        compiler.run((err, result) => {
            compiler.close(() => (err ? reject(err) : resolve(result)));
        });
    });
    if (stats?.hasErrors()) {
        console.error(stats.toString({ preset: 'errors-warnings', colors: true }));
        console.error(`  ✗ ${label} build failed.`);
        process.exit(1);
    }
    return stats;
}
