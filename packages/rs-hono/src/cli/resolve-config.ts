/**
 * Loads rs-hono.config.ts from disk and merges it with the defaults.
 *
 * Lives in cli/ (not config.ts) on purpose: config.ts is imported by
 * the user's rs-hono.config.ts and therefore ends up inside edge server
 * bundles, where the node:fs imports below would crash at load time.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RsHonoConfig } from '../config.js';

const DEFAULT_CONFIG = {
    outDir: 'dist',
    publicDir: 'public',
    dev: {
        port: 3000,
    },
} satisfies RsHonoConfig;

export async function resolveConfig(): Promise<RsHonoConfig> {
    const rootDir = process.cwd();

    const configPath = join(rootDir, 'rs-hono.config.ts');
    let userConfig: RsHonoConfig = {};

    if (existsSync(configPath)) {
        try {
            const mod = await import(pathToFileURL(configPath).href);
            userConfig = mod.default ?? mod;
        } catch (err) {
            // Fail fast: silently falling back to defaults would ignore the
            // user's settings (port, outDir, hooks) without them noticing.
            console.error('  ✗ Failed to load rs-hono.config.ts:');
            console.error(err);
            process.exit(1);
        }
    }

    return {
        ...DEFAULT_CONFIG,
        ...userConfig,
        dev: { ...DEFAULT_CONFIG.dev, ...userConfig.dev },
    };
}
