/**
 * Rspack Configuration Builder — CLIENT bundle only.
 *
 * The user's routes.ts is the client manifest: it is aliased into the
 * framework-owned client entry ("rs-hono:routes"), so its `import()`
 * calls become Rspack's code-split points — one chunk per page.
 *
 * The server/client boundary is enforced here, not by tree shaking:
 * every module whose request matches *.server.* is replaced with a
 * throwing stub in the client bundle (NormalModuleReplacementPlugin).
 * That makes "server code never reaches the browser" a build guarantee
 * instead of an optimizer best-effort.
 *
 * There is no server bundle: the server runs the TypeScript source
 * directly via tsx (dev and prod alike).
 *
 * The generated config is not sealed: the `rspack` hook in
 * rs-hono.config.ts may adjust anything before compilation. Only the
 * *.server.* replacement is re-checked afterwards — it is the one part
 * of this file that is a guarantee rather than a default.
 */
import { rspack, type RspackOptions } from '@rspack/core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientRspackOptions, RsHonoConfig } from '../config.js';

const FRAMEWORK_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Matches ./db.server, ./db.server.ts, secrets.server.mjs, ... */
export const SERVER_MODULE_PATTERN = /\.server(\.[cm]?[tj]sx?)?$/;

interface ClientConfigOptions {
    rootDir: string;
    outDir: string;
    isDev: boolean;
    /** The user's `rspack` hook from rs-hono.config.ts, if any. */
    rspackHook?: RsHonoConfig['rspack'];
}

export async function createClientRspackConfig(options: ClientConfigOptions): Promise<RspackOptions> {
    const { rootDir, outDir, isDev, rspackHook } = options;
    const srcDir = join(rootDir, 'src');

    // Typed ClientRspackOptions: the hook's contract that `plugins` and
    // `module.rules` exist is enforced here, on the literal itself.
    const base: ClientRspackOptions = {
        mode: isDev ? 'development' : 'production',
        devtool: isDev ? 'cheap-module-source-map' : false,
        entry: {
            main: join(FRAMEWORK_SRC, 'client-entry.tsx'),
        },
        output: {
            path: join(rootDir, outDir, 'client'),
            // Wipe stale hashed chunks from previous builds. Safe: the build
            // command copies public/ assets in AFTER the compiler has run.
            clean: true,
            publicPath: '/_static/',
            // Stable entry name so the SSR shell can always reference
            // /_static/chunks/main.js; async page chunks are content-hashed.
            filename: 'chunks/main.js',
            chunkFilename: 'chunks/[name].[contenthash].js',
            assetModuleFilename: 'assets/[name].[hash][ext]',
            // Emitted CSS (see the "styles" cache group below). Hashed in
            // prod for immutable caching; stable in dev for simple reloads.
            cssFilename: isDev ? 'chunks/[name].css' : 'chunks/[name].[contenthash].css',
            cssChunkFilename: isDev ? 'chunks/[name].css' : 'chunks/[name].[contenthash].css',
        },
        optimization: {
            splitChunks: {
                cacheGroups: {
                    // Merge ALL imported CSS into one "styles" chunk. Without
                    // this, CSS imported by a shared layout is duplicated
                    // into every async page chunk and never appears in a
                    // form the SSR document can link — one merged file is
                    // what <Assets/> puts in <head>, so styles are present
                    // before hydration (no flash of unstyled content).
                    styles: {
                        name: 'styles',
                        test: /\.css$/,
                        chunks: 'all',
                        enforce: true,
                    },
                },
            },
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
            // Framework source uses ESM-style ".js" specifiers for .ts/.tsx files.
            extensionAlias: {
                '.js': ['.ts', '.tsx', '.js'],
            },
            alias: {
                // The user's route manifest, imported by the framework client entry.
                // (No colon in the name — Rspack would parse it as a URI scheme.)
                '@rs-hono/routes$': join(srcDir, 'routes.ts'),
                '@': srcDir,
            },
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: {
                        loader: 'builtin:swc-loader',
                        options: {
                            jsc: {
                                parser: { syntax: 'typescript', tsx: true },
                                transform: {
                                    react: { runtime: 'automatic', development: isDev },
                                },
                            },
                        },
                    },
                    type: 'javascript/auto',
                },
                {
                    test: /\.css$/,
                    use: [{ loader: 'builtin:lightningcss-loader' }],
                    type: 'css/auto',
                },
                // Images & fonts imported from components — emitted to assets/
                // (small files are inlined as data: URIs).
                {
                    test: /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf)$/i,
                    type: 'asset',
                },
            ],
            generator: {
                // Deterministic CSS-module class names, derived from the
                // filename alone ("Button.module.css" + ".hero" →
                // "Button.module__hero"). The server-side CSS hook
                // (builder/css-hooks.mjs) generates the SAME names, so
                // SSR markup matches hydration without sharing state.
                'css/auto': {
                    localIdentName: '[name]__[local]',
                },
            },
        },
        plugins: [
            // NODE_ENV is defined automatically from `mode` (optimization.nodeEnv).
            // The server/client boundary: *.server.* never reaches the browser.
            new rspack.NormalModuleReplacementPlugin(SERVER_MODULE_PATTERN, join(FRAMEWORK_SRC, 'builder', 'server-stub.cjs')),
        ],
        experiments: { css: true },
    };

    // User escape hatch, applied here (not at the call sites) so every
    // consumer of this config gets it. Mutate-or-return: a hook that only
    // pushes a plugin needs no `return config`.
    let config: RspackOptions = base;
    if (rspackHook) {
        try {
            config = (await rspackHook(base, { dev: isDev, rootDir, rspack })) ?? base;
        } catch (err) {
            // Same fail-fast rationale as resolveConfig: building without
            // the user's customizations would silently ship a wrong bundle.
            console.error('  ✗ The rspack() hook in rs-hono.config.ts threw:');
            console.error(err);
            process.exit(1);
        }

        // The *.server.* replacement is a security guarantee, not a build
        // preference — re-check it survived, whether the hook filtered the
        // plugin array or returned a fresh config. A replacement plugin the
        // user re-created with the same pattern passes.
        const boundaryIntact = config.plugins?.some(
            (p) => p instanceof rspack.NormalModuleReplacementPlugin && String(p._args[0]) === String(SERVER_MODULE_PATTERN),
        );
        if (!boundaryIntact) {
            console.warn('  ⚠ The rspack() hook removed the *.server.* module replacement — server code may reach the browser bundle.');
        }
    }

    return config;
}
