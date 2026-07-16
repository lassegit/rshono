/**
 * Rspack Configuration Builder — the two coordinated RSC bundles.
 *
 * Rspack's native RSC support (rspack.experiments.rsc) needs two
 * compilers with matching entry names:
 *
 *   client (target web)  — hydration runtime, 'use client' components,
 *                          CSS, per-page chunks. Entry: entry.client.tsx.
 *   server (target node) — the app server itself. Entry: entry.rsc.tsx
 *                          in the RSC layer (react-server condition);
 *                          entry.ssr.tsx is split into the SSR layer so
 *                          it can render flight payloads to HTML with
 *                          the classic react-dom.
 *
 * The user's routes.ts is aliased into the server entry
 * ('@rsc-hono/routes'), so its `import()` thunks are the code-split
 * points; each page module carries 'use server-entry', which makes
 * Rspack attach that page's client JS/CSS assets to the component
 * (per-page code splitting without an asset manifest).
 *
 * Env safety, enforced here:
 *   - client bundle: `process.env` is REPLACED with the PUBLIC_-filtered
 *     literal (DefinePlugin) — a stray `process.env.SECRET` in client
 *     code compiles to undefined, never to a value.
 *   - client bundle: every *.server.* module is swapped for a throwing
 *     stub (NormalModuleReplacementPlugin) — a build guarantee, not
 *     tree-shaking best-effort.
 *   - server bundle keeps the real process.env: server components run
 *     only on the server; only their rendered output ships.
 */
import { rspack, type RspackOptions, type RuleSetRule } from '@rspack/core';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicEnv } from './public-env.js';

const FRAMEWORK_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRAMEWORK_ROOT = join(FRAMEWORK_SRC, '..');

/** Matches ./db.server, ./db.server.ts, secrets.server.mjs, ... */
export const SERVER_MODULE_PATTERN = /\.server(\.[cm]?[tj]sx?)?$/;

/**
 * Packages bundled INTO the server bundle (everything else npm stays
 * external, so native modules — DB drivers, sharp — survive). The React
 * family MUST be bundled: the react-server export condition is resolved
 * per layer at build time, which an external import can't express. hono
 * and @hono/node-server are bundled so the runtime needs no rsc-hono
 * install; rsc-hono itself ships TypeScript source.
 */
const BUNDLED_PACKAGES = /^(rsc-hono|react|react-dom|react-server-dom-rspack|rsc-html-stream|hono|@hono\/node-server)(\/|$)/;

const BROWSER_TARGETS = ['last 2 versions', '> 0.2%', 'not dead', 'Firefox ESR'];
const NODE_TARGETS = ['node >= 20.19'];

export interface ConfigOptions {
    rootDir: string;
    isDev: boolean;
    /** Fired by Rspack when a server component's code changed (dev). */
    onServerComponentChanges?: () => void;
}

/**
 * Build both configs. Order matters downstream: [0] = client, [1] = server.
 */
export function createConfigs(options: ConfigOptions): [RspackOptions, RspackOptions] {
    const { rootDir, isDev, onServerComponentChanges } = options;
    const srcDir = join(rootDir, 'src');
    const mode = isDev ? 'development' : 'production';

    const routesFile = ['routes.ts', 'routes.tsx'].map((f) => join(srcDir, f)).find(existsSync);
    if (!routesFile) {
        throw new Error(`[rsc-hono] src/routes.ts not found in ${rootDir} — it is the one required file.`);
    }
    const serverAppFile = join(srcDir, 'index.server.ts');
    const serverAppAlias = existsSync(serverAppFile) ? serverAppFile : join(FRAMEWORK_SRC, 'runtime', 'empty-server-app.ts');

    const rscEntry = join(FRAMEWORK_SRC, 'runtime', 'entry.rsc.tsx');
    const ssrEntry = join(FRAMEWORK_SRC, 'runtime', 'entry.ssr.tsx');
    const clientEntry = join(FRAMEWORK_SRC, 'runtime', 'entry.client.tsx');

    // One swc rule serves .ts/.tsx/.js/.jsx (detectSyntax picks the right
    // grammar per extension). It must ALSO run over node_modules — RSC
    // directives ('use client') in prebuilt npm packages have to become
    // client references — so only recompiling core-js is excluded.
    const swcRule = (targets: string[]): RuleSetRule => ({
        test: /\.[cm]?[jt]sx?$/,
        exclude: /[\\/]core-js[\\/]/,
        use: {
            loader: 'builtin:swc-loader',
            options: {
                detectSyntax: 'auto',
                jsc: {
                    transform: { react: { runtime: 'automatic', development: isDev } },
                    experimental: { keepImportAttributes: true },
                },
                env: { targets },
                rspackExperiments: { reactServerComponents: true },
            },
        },
        type: 'javascript/auto',
    });

    const resolveBase = {
        extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
        // Framework source uses ESM-style ".js" specifiers for .ts/.tsx files.
        extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
        // The RSC transform injects react-server-dom-rspack imports into
        // USER modules; that package is a dependency of rsc-hono, not of
        // the app, so under pnpm isolation it isn't reachable from the
        // app's node_modules. Falling back to the framework's own
        // node_modules keeps bare-specifier resolution (and with it the
        // react-server exports condition) intact — an alias would bypass
        // the exports map.
        modules: ['node_modules', join(FRAMEWORK_ROOT, 'node_modules')],
    };

    // The two RSC plugins share one coordinator — created exactly once
    // per config pair (Rspack requirement).
    const { ServerPlugin, ClientPlugin } = rspack.experiments.rsc.createPlugins();
    const { Layers } = rspack.experiments.rsc;

    const clientConfig: RspackOptions = {
        name: 'client',
        mode,
        target: 'web',
        context: rootDir,
        devtool: isDev ? 'source-map' : false,
        entry: { main: clientEntry },
        output: {
            path: join(rootDir, 'dist', 'static'),
            publicPath: '/_static/',
            // Dev keeps stale files so in-flight hot-update fetches never
            // 404 mid-rebuild; the CLI wipes the directory once at startup.
            clean: !isDev,
            filename: isDev ? 'chunks/main.js' : 'chunks/main.[contenthash].js',
            chunkFilename: isDev ? 'chunks/[name].js' : 'chunks/[name].[contenthash].js',
            cssFilename: isDev ? 'chunks/[name].css' : 'chunks/[name].[contenthash].css',
            cssChunkFilename: isDev ? 'chunks/[name].css' : 'chunks/[name].[contenthash].css',
            assetModuleFilename: 'assets/[name].[hash][ext]',
        },
        optimization: {
            // Content-hash module IDs in prod for steady long-term caching;
            // named in dev for readable HMR logs.
            moduleIds: isDev ? 'named' : 'hashed',
        },
        resolve: {
            ...resolveBase,
            alias: { '@': srcDir },
        },
        module: {
            rules: [
                swcRule(BROWSER_TARGETS),
                { test: /\.css$/i, type: 'css/auto' },
                { test: /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf)$/i, type: 'asset' },
            ],
        },
        plugins: [
            new ClientPlugin(),
            // Only PUBLIC_-prefixed vars reach the browser; the whole
            // `process.env` expression becomes this literal.
            new rspack.DefinePlugin({ 'process.env': JSON.stringify(publicEnv(isDev)) }),
            // The *.server.* boundary — see the file header.
            new rspack.NormalModuleReplacementPlugin(SERVER_MODULE_PATTERN, join(FRAMEWORK_SRC, 'builder', 'server-stub.cjs')),
            ...(isDev ? [new rspack.HotModuleReplacementPlugin(), new ReactRefreshRspackPlugin()] : []),
        ],
        performance: false,
    };

    const serverConfig: RspackOptions = {
        name: 'server',
        mode,
        target: 'node',
        context: rootDir,
        devtool: isDev ? 'source-map' : false,
        entry: { main: rscEntry },
        output: {
            path: join(rootDir, 'dist', 'server'),
            clean: true,
            module: true,
            chunkFormat: 'module',
            chunkLoading: 'import',
            library: { type: 'module' },
            filename: 'main.mjs',
            chunkFilename: 'chunks/[name].mjs',
            // Asset-module URLs must match the client bundle, which emits
            // the real files.
            publicPath: '/_static/',
            assetModuleFilename: 'assets/[name].[hash][ext]',
        },
        optimization: {
            // Server bundle size is irrelevant; keep it readable.
            minimize: false,
        },
        externalsType: 'module-import',
        externals: [
            ({ request }, callback) => {
                // Bundle relative/absolute imports, the '@/' and
                // '@rsc-hono/' aliases, the allowlisted packages, and the
                // RSC plugin's virtual modules (builtin: scheme / loader
                // syntax); everything else — node: builtins and the
                // user's npm deps — resolves from the runtime.
                if (
                    !request ||
                    /^[./]/.test(request) ||
                    request.startsWith('@/') ||
                    request.startsWith('@rsc-hono/') ||
                    request.startsWith('builtin:') ||
                    request.includes('!') ||
                    BUNDLED_PACKAGES.test(request)
                ) {
                    return callback();
                }
                callback(undefined, `module-import ${request}`);
            },
        ],
        resolve: {
            ...resolveBase,
            alias: {
                '@rsc-hono/routes$': routesFile,
                '@rsc-hono/server-app$': serverAppAlias,
                '@': srcDir,
            },
        },
        module: {
            rules: [
                swcRule(NODE_TARGETS),
                { test: /\.css$/i, type: 'css/auto' },
                // Same URLs as the client bundle, but nothing written —
                // the client compile emits the files.
                {
                    test: /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf)$/i,
                    type: 'asset',
                    generator: { emit: false },
                },
                // React Server Components layering: the RSC entry (and,
                // by layer propagation, everything it imports) resolves
                // with the react-server condition; the SSR entry is split
                // into its own layer with the default (client) React.
                { resource: ssrEntry, layer: Layers.ssr },
                {
                    resource: rscEntry,
                    layer: Layers.rsc,
                    resolve: { conditionNames: ['react-server', '...'] },
                },
                {
                    issuerLayer: Layers.rsc,
                    exclude: ssrEntry,
                    resolve: { conditionNames: ['react-server', '...'] },
                },
            ],
        },
        plugins: [new ServerPlugin({ onServerComponentChanges })],
        performance: false,
    };

    return [clientConfig, serverConfig];
}
