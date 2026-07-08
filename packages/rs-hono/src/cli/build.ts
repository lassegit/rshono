/**
 * Build Command
 *
 * Production build pipeline:
 * 1. Validate project structure & load routes (for reporting)
 * 2. Compile the client bundle via Rspack (hydration + page chunks)
 * 3. Copy public/ assets into <outDir>/client
 *
 * SSG pre-rendering of `kind: "static"` routes is not implemented yet —
 * static routes are currently rendered per request, like dynamic ones.
 */
import { rspack, type Stats } from '@rspack/core';
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClientRspackConfig } from '../builder/rspack-config.js';
import { resolveConfig } from '../config.js';
import type { Route } from '../router.js';
import { loadRoutes } from '../server/load.js';

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
    const compiler = rspack(createClientRspackConfig({ rootDir, outDir, isDev: false }));
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

    // ── Static assets ─────────────────────────────────────────────────
    const publicDir = join(rootDir, config.publicDir ?? 'public');
    if (existsSync(publicDir)) {
        cpSync(publicDir, join(rootDir, outDir, 'client'), { recursive: true });
        console.log('  ✓ Static assets copied');
    } else {
        console.log('  ○ No public/ directory');
    }

    if (counts.static > 0) {
        console.log(`  ○ Note: SSG pre-rendering is not implemented yet;`);
        console.log('    static routes are server-rendered per request for now.');
    }

    console.log('');
    console.log('✅ Build complete. Run `rs-hono start` to serve.');
    console.log('');
}
