import type { MiddlewareHandler } from 'hono';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface RsHonoConfig {
    /** Output directory (default: "dist") */
    outDir?: string;

    /** Public/static assets directory (default: "public") */
    publicDir?: string;

    /** Dev server options */
    dev?: {
        port?: number;
    };

    /** Server lifecycle hooks (set in rs-hono.config.ts) */
    server?: {
        /** Runs once before the server starts listening. */
        onStart?: () => Promise<void> | void;
        /** Global middleware, applied before all routes. */
        middleware?: MiddlewareHandler;
    };
}

export function defineConfig(config: RsHonoConfig): RsHonoConfig {
    return config;
}

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
