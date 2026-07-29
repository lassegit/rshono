import { rspack, type Compiler, type RspackOptions, type RuleSetRule } from '@rspack/core';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';
import { existsSync } from 'node:fs';
import { join, win32 } from 'node:path';
import type { RSHonoConfig } from '../config.js';
import type { DeployPreset } from '../deploy/presets.js';
import { resolveServerConfig } from '../server/server-config.js';
import { scanPageFiles } from './page-files.js';
import { publicEnv } from './public-env.js';

// The framework's own compiled output (this file lives in `dist/builder/`), which is what the two
// compilers consume: the entries and loaders below are the *built* framework, not its TypeScript.
const FRAMEWORK_DIST = join(import.meta.dirname, '..');
const FRAMEWORK_ROOT = join(FRAMEWORK_DIST, '..');

const BUNDLED_PACKAGES = /^(rshono|react|react-dom|react-server-dom-rspack|rsc-html-stream|hono|@hono\/node-server)(\/|$)/;

/**
 * Whether a request names a file rather than a package, and so belongs in the bundle.
 *
 * Rspack's RSC plugins ask for their client and server-entry proxies by *absolute path*, which on
 * Windows means a drive letter (`D:\app\src\home.tsx`) instead of a leading slash. Externalizing one
 * of those emits `import("D:\\app\\src\\home.tsx")`, and Node rejects that with
 * `ERR_UNSUPPORTED_ESM_URL_SCHEME` ("Received protocol 'd:'") — a build that works everywhere else
 * fails on Windows only. `win32.isAbsolute` also accepts the POSIX form, so it is used on every
 * platform: one code path, and the Windows shapes stay testable off Windows.
 */
function isPathRequest(request: string): boolean {
  return request.startsWith('.') || win32.isAbsolute(request);
}

const BROWSER_TARGETS = ['last 2 versions', '> 0.2%', 'not dead', 'Firefox ESR'];
const NODE_TARGETS = ['node >= 22'];

/**
 * Rspack's native CSS pipeline, which both compilers get.
 *
 * It parses *finished* CSS, so a stylesheet needing a PostCSS plugin — Tailwind, most obviously — adds
 * the loader through the {@link RSHonoConfig.rspack} hook, along with the two packages a PostCSS pass
 * takes. The framework stays out of it: `postcss` is a dependency an app that wants one can have, rather
 * than one every app pays for. The Styling section of the README has the four lines involved.
 *
 * A fresh object per compiler, not one shared between them — the hook is handed each config in turn, and
 * an app that reaches in to change this rule should not find it has changed the other bundle's too.
 */
function cssRule(): RuleSetRule {
  return { test: /\.css$/i, type: 'css/auto' };
}

export interface RspackConfigOptions {
  rootDir: string;
  isDev: boolean;
  /** The project's resolved config — supplies the {@link RSHonoConfig.rspack} hook and the runtime settings baked into the server bundle. */
  config: RSHonoConfig;
  /** The platform being built for: decides the `@rshono/deploy` runtime and any server-compiler overrides. */
  preset: DeployPreset;
  onServerComponentChanges?: () => void;
}

export function createConfigs(options: RspackConfigOptions): [RspackOptions, RspackOptions] {
  const { rootDir, isDev, config, preset, onServerComponentChanges } = options;
  const srcDir = join(rootDir, 'src');
  const mode = isDev ? 'development' : 'production';

  const routesFile = ['routes.ts', 'routes.tsx'].map((f) => join(srcDir, f)).find(existsSync);
  if (!routesFile) {
    throw new Error(`[rshono] src/routes.ts not found in ${rootDir} — it is the one required file.`);
  }
  const serverAppFile = ['server.ts', 'server.tsx'].map((f) => join(srcDir, f)).find(existsSync);
  const serverAppAlias = serverAppFile ?? join(FRAMEWORK_DIST, 'runtime', 'empty-server-app.js');

  const rscEntry = join(FRAMEWORK_DIST, 'runtime', 'entry.rsc.js');
  const ssrEntry = join(FRAMEWORK_DIST, 'runtime', 'entry.ssr.js');
  const clientEntry = join(FRAMEWORK_DIST, 'runtime', 'entry.client.js');

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
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
    modules: ['node_modules', join(FRAMEWORK_ROOT, 'node_modules')],
  };

  // The platform's own resolve conditions, ahead of whatever the Rspack target implies ('...'). This
  // is what hands the server bundle the right build of React and the RSC runtime, both of which ship
  // one per runtime. Left unset for Node, where the target already implies the `node` condition.
  const runtimeConditions = preset.resolveConditions ?? [];
  const serverResolveBase = runtimeConditions.length > 0 ? { ...resolveBase, conditionNames: [...runtimeConditions, '...'] } : resolveBase;
  const rscConditionNames = ['react-server', ...runtimeConditions, '...'];

  const { ServerPlugin, ClientPlugin } = rspack.experiments.rsc.createPlugins();
  const { Layers } = rspack.experiments.rsc;

  const pageFiles = new Set<string>();
  scanPageFiles(routesFile, srcDir, pageFiles);
  const pageScanPlugin = {
    apply(compiler: Compiler) {
      const refresh = () => scanPageFiles(routesFile, srcDir, pageFiles);
      compiler.hooks.beforeRun.tap('rshono/page-scan', refresh);
      compiler.hooks.watchRun.tap('rshono/page-scan', refresh);
    },
  };

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
      clean: !isDev,
      filename: isDev ? 'chunks/main.js' : 'chunks/main.[contenthash].js',
      chunkFilename: isDev ? 'chunks/[name].js' : 'chunks/[name].[contenthash].js',
      cssFilename: isDev ? 'chunks/[name].css' : 'chunks/[name].[contenthash].css',
      cssChunkFilename: isDev ? 'chunks/[name].css' : 'chunks/[name].[contenthash].css',
      assetModuleFilename: 'assets/[name].[hash][ext]',
    },
    optimization: {
      moduleIds: isDev ? 'named' : 'hashed',
    },
    resolve: {
      ...resolveBase,
      alias: { '@': srcDir },
    },
    module: {
      rules: [swcRule(BROWSER_TARGETS), cssRule(), { test: /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf)$/i, type: 'asset' }],
    },
    plugins: [
      new ClientPlugin(),
      new rspack.DefinePlugin({ 'process.env': JSON.stringify(publicEnv(isDev)) }),
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
      publicPath: '/_static/',
      assetModuleFilename: 'assets/[name].[hash][ext]',
    },
    optimization: {
      minimize: false,
    },
    externalsType: 'module-import',
    externals: [
      ({ request }, callback) => {
        if (
          !request ||
          isPathRequest(request) ||
          request.startsWith('@/') ||
          request.startsWith('@rshono/') ||
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
      ...serverResolveBase,
      alias: {
        '@rshono/routes$': routesFile,
        '@rshono/server-app$': serverAppAlias,
        // The one import that decides which platform the server bundle is for. Split on '/' so the
        // preset can declare a POSIX-looking path and still resolve on Windows.
        '@rshono/deploy$': join(FRAMEWORK_DIST, ...preset.runtimeModule.split('/')),
        '@': srcDir,
      },
    },
    module: {
      rules: [
        {
          test: (resource: string) => pageFiles.has(resource),
          enforce: 'pre',
          use: [{ loader: join(FRAMEWORK_DIST, 'builder', 'page-entry-loader.cjs') }],
        },
        {
          test: /\.[cm]?[tj]sx?$/,
          include: srcDir,
          enforce: 'pre',
          use: [
            {
              loader: join(FRAMEWORK_DIST, 'builder', 'env-shadow-loader.cjs'),
              options: { prelude: `const process = { env: ${JSON.stringify(publicEnv(isDev))} }; `, layer: Layers.ssr },
            },
          ],
        },
        swcRule([...(preset.syntaxTargets ?? NODE_TARGETS)]),
        cssRule(),
        {
          test: /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf)$/i,
          type: 'asset',
          generator: { emit: false },
        },
        { resource: ssrEntry, layer: Layers.ssr },
        {
          resource: rscEntry,
          layer: Layers.rsc,
          resolve: { conditionNames: rscConditionNames },
        },
        {
          issuerLayer: Layers.rsc,
          exclude: ssrEntry,
          resolve: { conditionNames: rscConditionNames },
        },
      ],
    },
    plugins: [
      pageScanPlugin,
      new ServerPlugin({ onServerComponentChanges }),
      // Bake the framework settings from rshono.config.ts into the bundle (read as __RSHONO_CONFIG__
      // in entry.rsc.tsx) — the server-side counterpart to the client's publicEnv injection.
      new rspack.DefinePlugin({ __RSHONO_CONFIG__: JSON.stringify(resolveServerConfig(config, { isDev })) }),
    ],
    performance: false,
  };

  // The platform's own overrides, then the user's hook — so an app can still adjust whatever a
  // preset decided.
  preset.configureServer?.(serverConfig);

  const rspackHook = config.rspack;
  if (rspackHook) {
    return [
      rspackHook(clientConfig, { isServer: false, isDev }) ?? clientConfig,
      rspackHook(serverConfig, { isServer: true, isDev }) ?? serverConfig,
    ];
  }
  return [clientConfig, serverConfig];
}
