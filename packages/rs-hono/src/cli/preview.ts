/**
 * Preview Server — runs the edge artifact under Node, playing the
 * platform's role: <outDir>/site is served first (statics, prerendered
 * pages, directory indexes — the CDN's job), and misses fall through to
 * app.mjs's fetch handler (the function's job).
 *
 * This verifies a `build --target edge` before any platform tooling is
 * involved. It is NOT a production server — deploy the artifact to a
 * platform, or use `build --target node` for Node deployments.
 */
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from '../server/node-server.js';
import { resolveConfig } from './resolve-config.js';

export async function previewCommand(portArg?: number) {
    const config = await resolveConfig();
    const rootDir = process.cwd();
    const outDir = config.outDir ?? 'dist';
    const port = portArg ?? envPort() ?? config.dev?.port ?? 3000;

    console.log('🔍 rs-hono preview (edge-build platform simulation)');
    console.log('');

    const appPath = join(rootDir, outDir, 'server', 'app.mjs');
    const siteDir = join(rootDir, outDir, 'site');
    if (!existsSync(appPath) || !existsSync(siteDir)) {
        console.error(`  ✗ No edge build found (${outDir}/server/app.mjs + ${outDir}/site).`);
        console.error('    Run `rs-hono build --target edge` first.');
        process.exit(1);
    }

    const mod = await import(pathToFileURL(appPath).href);
    const app = mod.default;
    if (typeof app?.fetch !== 'function') {
        console.error(`  ✗ ${outDir}/server/app.mjs does not default-export a fetch handler. Re-run \`rs-hono build --target edge\`.`);
        process.exit(1);
    }

    // The platform contract: statics win, the function sees the misses.
    // Fallthrough goes through app.fetch (not .route()) so the bundled
    // Hono copy inside app.mjs never mixes with the CLI's own.
    const platform = new Hono();
    platform.on(['GET', 'HEAD'], '/*', serveStatic({ root: siteDir }), (c) => app.fetch(c.req.raw));
    platform.all('*', (c) => app.fetch(c.req.raw));

    await serve({ fetch: platform.fetch, port });

    console.log(`  • Serving ${outDir}/site first, ${outDir}/server/app.mjs on miss`);
    console.log(`  ➜  Preview: http://localhost:${port}`);
    console.log('');
}

function envPort(): number | undefined {
    const raw = process.env.PORT;
    if (!raw) return undefined;
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        console.error(`  ✗ Invalid PORT environment variable: "${raw}"`);
        process.exit(1);
    }
    return port;
}
