/**
 * Config types + defineConfig.
 *
 * This module is imported by the user's rs-hono.config.ts, which is
 * BUNDLED into `--target edge` server bundles — so it must stay free of
 * Node APIs (all @rspack/core / hono imports below are type-only and
 * erased). Loading the config from disk lives in cli/resolve-config.ts.
 */
import type { rspack, RspackOptions } from '@rspack/core';
import type { MiddlewareHandler } from 'hono';

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
    /**
     * Which bundle this config builds: 'client' (the browser bundle —
     * every dev/build) or 'server' (the `build --target` server bundle).
     * Hooks written before server bundles existed ran only for 'client';
     * branch on this when a customization is client-only.
     */
    environment: 'client' | 'server';
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
