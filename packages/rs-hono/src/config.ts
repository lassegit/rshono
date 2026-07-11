import type { rspack, RspackOptions } from '@rspack/core';
import type { MiddlewareHandler } from 'hono';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The generated client-bundle config as handed to the `rspack` hook:
 * plain RspackOptions, but with the arrays hooks typically push into
 * guaranteed present — `config.plugins.push(...)` and
 * `config.module.rules.push(...)` compile without `!` or `??=`.
 */
export type ClientRspackOptions = RspackOptions & {
    plugins: NonNullable<RspackOptions['plugins']>;
    module: NonNullable<RspackOptions['module']> & {
        rules: NonNullable<NonNullable<RspackOptions['module']>['rules']>;
    };
};

/** Passed to the `rspack` config hook alongside the generated config. */
export interface RspackHookEnv {
    /** true under `rs-hono dev`, false under `rs-hono build`. */
    dev: boolean;
    /** Absolute project root (the directory containing rs-hono.config.ts). */
    rootDir: string;
    /**
     * The framework's own @rspack/core instance. Use it for builtin
     * plugins (`new env.rspack.DefinePlugin(...)`) instead of installing
     * your own copy, whose native binding may not match the framework's.
     */
    rspack: typeof rspack;
}

export interface RsHonoConfig {
    /** Output directory (default: "dist") */
    outDir?: string;

    /** Public/static assets directory (default: "public") */
    publicDir?: string;

    /** Dev server options */
    dev?: {
        port?: number;
    };

    /**
     * Escape hatch: customize the CLIENT bundle's Rspack config — extra
     * loaders, plugins, aliases, the entire webpack-compatible ecosystem.
     * Mutate `config` in place or return a replacement; async is fine.
     * `config.plugins` and `config.module.rules` are always present, so
     * plain `.push(...)` works. Runs for both dev and build (branch on
     * `env.dev`).
     *
     * Client bundle only: the server renders your TypeScript source
     * directly via tsx, so loaders that change what an import *means*
     * (e.g. SVGR's .svg → React component) will not apply during SSR.
     * CSS-level tooling (Tailwind, PostCSS plugins) is unaffected — CSS
     * imports are already inert on the server.
     */
    rspack?: (config: ClientRspackOptions, env: RspackHookEnv) => RspackOptions | void | Promise<RspackOptions | void>;

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
