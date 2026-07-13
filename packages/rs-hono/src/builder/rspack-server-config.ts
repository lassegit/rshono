/**
 * Rspack Configuration Builder — SERVER bundle (`rs-hono build --target`).
 *
 * Produces one self-contained ESM file per target:
 *
 *   node → <outDir>/server/index.mjs — self-starting (listens on PORT).
 *          The user's npm dependencies stay EXTERNAL (loaded from
 *          node_modules at runtime) so native modules — DB drivers,
 *          sharp — survive. What IS bundled: the user's src/, the
 *          framework (it ships TypeScript source, which would otherwise
 *          need tsx at runtime), and react/react-dom/hono/
 *          @hono/node-server — bundling React lets mode:'production'
 *          bake NODE_ENV into react-dom at compile time (an external
 *          React re-decides dev/prod from the environment at import
 *          time, before any code could set it), and bundling the Hono
 *          pair makes rs-hono installable as a devDependency.
 *   edge → <outDir>/server/app.mjs — default-exports the Hono app
 *          (`export default app` is the Workers/Bun module shape; Deno:
 *          `Deno.serve(app.fetch)`). EVERYTHING is bundled — edge
 *          runtimes cannot load node_modules — and minified (platform
 *          size limits). A user dependency that touches node:* APIs
 *          fails the deploy loudly, which is the honest outcome.
 *
 * The tsx loader hooks have bundler-native counterparts here:
 *   css-hooks.mjs → CSS `exportsOnly` (same deterministic class names,
 *                   nothing emitted — the client bundle owns the CSS)
 *   env-hooks.mjs → env-shadow-loader.cjs (same include/exclude rules)
 * And unlike the tsx runtime, the user's `rspack` hook applies here too
 * (environment: 'server'), so loaders that change what an import means
 * (SVGR et al.) can finally match the client bundle server-side.
 *
 * The *.server.* replacement plugin is deliberately ABSENT: this is the
 * bundle where server code belongs.
 */
import { rspack, type RspackOptions } from '@rspack/core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetManifest } from '../assets.js';
import type { ClientRspackOptions, RsHonoConfig } from '../config.js';
import { publicEnv } from './public-env.js';
import { SERVER_MODULE_PATTERN } from './rspack-config.js';

const FRAMEWORK_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Packages bundled INTO the node server bundle (everything else npm
 * stays external). react/react-dom for the NODE_ENV bake; hono and
 * @hono/node-server so the runtime needs no rs-hono install.
 */
const BUNDLED_PACKAGES = /^(rs-hono|react|react-dom|hono|@hono\/node-server)(\/|$)/;

export type ServerBundleTarget = 'node' | 'edge';

interface ServerConfigOptions {
    rootDir: string;
    outDir: string;
    target: ServerBundleTarget;
    /** Absolute path to the generated entry file (see server-entry.ts). */
    entryFile: string;
    /** Client-compile asset manifest — baked in as __RS_HONO_ASSETS__. */
    assets: AssetManifest;
    /** The user's `rspack` hook from rs-hono.config.ts, if any. */
    rspackHook?: RsHonoConfig['rspack'];
}

export async function createServerRspackConfig(options: ServerConfigOptions): Promise<RspackOptions> {
    const { rootDir, outDir, target, entryFile, assets, rspackHook } = options;
    const srcDir = join(rootDir, 'src');
    const isEdge = target === 'edge';

    const base: ClientRspackOptions = {
        mode: 'production',
        // The edge bundle is minified, so ship app.mjs.map beside it —
        // platforms that accept source maps (wrangler:
        // upload_source_maps) then show readable stack traces. The node
        // bundle stays unminified and needs none.
        devtool: isEdge ? 'source-map' : false,
        target: isEdge ? ['webworker', 'es2022'] : ['node', 'es2022'],
        entry: { server: entryFile },
        output: {
            path: join(rootDir, outDir, 'server'),
            clean: true,
            module: true,
            chunkFormat: 'module',
            library: { type: 'module' },
            filename: isEdge ? 'app.mjs' : 'index.mjs',
            // Asset-module URLs must match the client bundle, which
            // emits the real files.
            publicPath: '/_static/',
            assetModuleFilename: 'assets/[name].[hash][ext]',
        },
        // Rspack 2: native CSS is on by default (old `experiments.css`),
        // and ESM output is driven by `output.module` above (the old
        // `experiments.outputModule` was removed).
        externalsType: 'module-import',
        externals: isEdge
            ? []
            : [
                  ({ request }, callback) => {
                      // Bundle relative/absolute imports, the '@/' src
                      // alias, and the allowlisted packages; everything
                      // else — node: builtins and the user's npm deps —
                      // resolves from the runtime.
                      if (!request || /^[./]/.test(request) || request.startsWith('@/') || BUNDLED_PACKAGES.test(request)) {
                          return callback();
                      }
                      callback(undefined, `module-import ${request}`);
                  },
              ],
        optimization: {
            // Minify for edge (platform size limits); keep the node
            // bundle readable — its size is irrelevant server-side.
            minimize: isEdge,
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
            // Framework source uses ESM-style ".js" specifiers for .ts/.tsx files.
            extensionAlias: {
                '.js': ['.ts', '.tsx', '.js'],
            },
            alias: {
                '@': srcDir,
            },
        },
        module: {
            rules: [
                // The public-env shadow for shared modules — the bundle
                // counterpart of env-hooks.mjs, same include/exclude.
                // 'pre' so it sees the original source, before swc.
                {
                    test: /\.[cm]?[tj]sx?$/,
                    include: srcDir,
                    exclude: [SERVER_MODULE_PATTERN],
                    enforce: 'pre',
                    use: [
                        {
                            loader: join(FRAMEWORK_SRC, 'builder', 'env-shadow-loader.cjs'),
                            options: { prelude: `const process = { env: ${JSON.stringify(publicEnv(false))} }; ` },
                        },
                    ],
                },
                {
                    test: /\.tsx?$/,
                    use: {
                        loader: 'builtin:swc-loader',
                        options: {
                            jsc: {
                                parser: { syntax: 'typescript', tsx: true },
                                transform: {
                                    react: { runtime: 'automatic', development: false },
                                },
                            },
                        },
                    },
                    type: 'javascript/auto',
                },
                // CSS: class names only (same deterministic names as the
                // client bundle), no emitted stylesheets — the client
                // compile owns those. Replaces css-hooks.mjs here.
                {
                    test: /\.css$/,
                    type: 'css/auto',
                },
                // Images & fonts: same URLs as the client bundle, but
                // nothing written — the client compile emits the files.
                {
                    test: /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf)$/i,
                    type: 'asset',
                    generator: { emit: false },
                },
            ],
            generator: {
                'css/auto': {
                    exportsOnly: true,
                    localIdentName: '[name]__[local]',
                },
            },
        },
        plugins: [
            // The client-compile manifest, baked in — no assets.json
            // read at runtime (edge has no filesystem to read it from).
            new rspack.DefinePlugin({ __RS_HONO_ASSETS__: JSON.stringify(assets) }),
            // One file: the route thunks' dynamic imports are inlined
            // instead of split into chunks.
            new rspack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
        ],
    };

    let config: RspackOptions = base;
    if (rspackHook) {
        try {
            config = (await rspackHook(base, { dev: false, environment: 'server', rootDir, rspack })) ?? base;
        } catch (err) {
            console.error('  ✗ The rspack() hook in rs-hono.config.ts threw (server bundle):');
            console.error(err);
            process.exit(1);
        }
    }

    return config;
}
