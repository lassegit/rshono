import { rspack, type Compiler, type RspackOptions, type RuleSetRule } from '@rspack/core';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPageFiles } from './page-files.js';
import { publicEnv } from './public-env.js';

const FRAMEWORK_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRAMEWORK_ROOT = join(FRAMEWORK_SRC, '..');

const BUNDLED_PACKAGES = /^(rshono|react|react-dom|react-server-dom-rspack|rsc-html-stream|hono|@hono\/node-server)(\/|$)/;

const BROWSER_TARGETS = ['last 2 versions', '> 0.2%', 'not dead', 'Firefox ESR'];
const NODE_TARGETS = ['node >= 20.19'];

export interface ConfigOptions {
  rootDir: string;
  isDev: boolean;
  onServerComponentChanges?: () => void;
}

export function createConfigs(options: ConfigOptions): [RspackOptions, RspackOptions] {
  const { rootDir, isDev, onServerComponentChanges } = options;
  const srcDir = join(rootDir, 'src');
  const mode = isDev ? 'development' : 'production';

  const routesFile = ['routes.ts', 'routes.tsx'].map((f) => join(srcDir, f)).find(existsSync);
  if (!routesFile) {
    throw new Error(`[rshono] src/routes.ts not found in ${rootDir} — it is the one required file.`);
  }
  const serverAppFile = ['server.ts', 'server.tsx'].map((f) => join(srcDir, f)).find(existsSync);
  const serverAppAlias = serverAppFile ?? join(FRAMEWORK_SRC, 'runtime', 'empty-server-app.ts');

  const rscEntry = join(FRAMEWORK_SRC, 'runtime', 'entry.rsc.tsx');
  const ssrEntry = join(FRAMEWORK_SRC, 'runtime', 'entry.ssr.tsx');
  const clientEntry = join(FRAMEWORK_SRC, 'runtime', 'entry.client.tsx');

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

  const { ServerPlugin, ClientPlugin } = rspack.experiments.rsc.createPlugins();
  const { Layers } = rspack.experiments.rsc;

  const pageFiles = new Set<string>();
  scanPageFiles(routesFile, srcDir, pageFiles);
  const pageScanPlugin = {
    apply(compiler: Compiler) {
      const refresh = () => scanPageFiles(routesFile, srcDir, pageFiles);
      compiler.hooks.beforeRun.tap('RscHonoPageScan', refresh);
      compiler.hooks.watchRun.tap('RscHonoPageScan', refresh);
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
      rules: [
        swcRule(BROWSER_TARGETS),
        { test: /\.css$/i, type: 'css/auto' },
        { test: /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf)$/i, type: 'asset' },
      ],
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
          /^[./]/.test(request) ||
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
      ...resolveBase,
      alias: {
        '@rshono/routes$': routesFile,
        '@rshono/server-app$': serverAppAlias,
        '@': srcDir,
      },
    },
    module: {
      rules: [
        {
          test: (resource: string) => pageFiles.has(resource),
          enforce: 'pre',
          use: [{ loader: join(FRAMEWORK_SRC, 'builder', 'page-entry-loader.cjs') }],
        },
        {
          test: /\.[cm]?[tj]sx?$/,
          include: srcDir,
          enforce: 'pre',
          use: [
            {
              loader: join(FRAMEWORK_SRC, 'builder', 'env-shadow-loader.cjs'),
              options: { prelude: `const process = { env: ${JSON.stringify(publicEnv(isDev))} }; `, layer: Layers.ssr },
            },
          ],
        },
        swcRule(NODE_TARGETS),
        { test: /\.css$/i, type: 'css/auto' },
        {
          test: /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf)$/i,
          type: 'asset',
          generator: { emit: false },
        },
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
    plugins: [pageScanPlugin, new ServerPlugin({ onServerComponentChanges })],
    performance: false,
  };

  return [clientConfig, serverConfig];
}
