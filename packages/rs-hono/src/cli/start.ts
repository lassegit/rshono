/**
 * Production Server
 *
 * Serves the app built by `rs-hono build`. SSR runs from the TypeScript
 * source via tsx; the client bundle is served from <outDir>/client.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setAssets } from '../assets.js';
import { loadAssetManifest } from '../builder/assets-manifest.js';
import { resolveConfig } from './resolve-config.js';
import { createAppHandler } from '../server/handler.js';
import { serve } from '../server/node-server.js';

export async function startCommand(portArg?: number) {
    const config = await resolveConfig();
    const rootDir = process.cwd();
    // Precedence: --port flag > PORT env (12-factor) > config > 3000.
    const port = portArg ?? envPort() ?? config.dev?.port ?? 3000;
    const outDir = config.outDir ?? 'dist';

    console.log('🚀 rs-hono production server');
    console.log('');

    // The manifest names the content-hashed bundle files — without it the
    // SSR document cannot link its entry script, so it is required.
    const assetManifest = loadAssetManifest(rootDir, outDir);
    if (!assetManifest) {
        console.error(`  ✗ No usable ${outDir}/assets.json found.`);
        console.error('    Run `rs-hono build` first.');
        process.exit(1);
    }
    const missing = [...assetManifest.js, ...assetManifest.css]
        .map((href) => href.replace(/^\/_static\//, ''))
        .filter((rel) => !existsSync(join(rootDir, outDir, 'client', rel)));
    if (missing.length > 0) {
        console.error(`  ✗ Build output is incomplete — missing from ${outDir}/client: ${missing.join(', ')}`);
        console.error('    Re-run `rs-hono build`.');
        process.exit(1);
    }
    setAssets(assetManifest);

    const handler = await createAppHandler({ config, rootDir, isDev: false });

    await serve({ fetch: handler, port });

    console.log(`  ➜  Serving at: http://localhost:${port}`);
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
