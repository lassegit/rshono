import type { RspackOptions } from '@rspack/core';
import { finalizeCloudflareBuild } from './cloudflare/build.js';
import type { DeployTarget } from './contract.js';
import { finalizeNetlifyBuild } from './netlify/build.js';
import { finalizeVercelBuild } from './vercel/build.js';

/** What a preset's {@link DeployPreset.finalize} is told about the build it is arranging. */
export interface DeployBuildContext {
  /** The project root — where `rshono build` ran, and what a platform config file is written next to. */
  rootDir: string;
  /** `<root>/dist`. */
  distDir: string;
  /** The server bundle, `<root>/dist/server/main.mjs`. */
  serverBundle: string;
  /** The hashed client bundle, `<root>/dist/static` — served at `/_static`. */
  staticDir: string;
  /** The copy of the app's `public/`, or `null` when it has none. Served at the web root. */
  publicDir: string | null;
  /** Prerendered pages, `<root>/dist/ssg` — empty when the app has no `render: 'static'` routes. */
  ssgDir: string;
}

/**
 * The build-time half of a deploy target: which runtime module the bundle gets, how the server
 * compiler has to change to produce something the platform can run, and how the output is arranged
 * once it exists.
 *
 * The runtime half is {@link DeployRuntime}, in its own file because it is compiled *into* the app
 * bundle — this side only ever runs in the CLI.
 */
export interface DeployPreset {
  readonly name: DeployTarget;
  /**
   * The module `@rshono/deploy` resolves to, as a path relative to the framework's own `dist/`.
   * Slash-separated and split on use, so it stays a valid path on Windows too.
   */
  readonly runtimeModule: string;
  /** How to run what was just built, completing the "build complete —" line. */
  readonly deployHint: string;
  /**
   * Extra resolve conditions for the server bundle, most specific first.
   *
   * This is what picks the right build of React and the RSC runtime: both ship one per runtime behind
   * `workerd` / `deno` / `edge-light` / `node` conditions. Omit it to accept whatever the Rspack
   * target implies, which is correct for Node.
   */
  readonly resolveConditions?: readonly string[];
  /** browserslist-style targets for the server bundle's swc pass. Defaults to Node. */
  readonly syntaxTargets?: readonly string[];
  /**
   * Adjusts the generated server Rspack config for this platform — target, externals policy, output
   * shape. Mutates in place, and runs *before* the user's `rspack` hook so that hook keeps the last
   * word.
   */
  configureServer?(config: RspackOptions): void;
  /**
   * Arranges the finished build for the platform: assembles whatever directory layout it expects,
   * emits its config file, and prints how to deploy.
   *
   * Runs last — after both bundles, the `public/` copy and the prerender pass — so everything it
   * needs to move is already on disk.
   */
  finalize?(ctx: DeployBuildContext): Promise<void> | void;
}

/**
 * Node: a long-lived server process. The generated config is already this shape, so the preset has
 * nothing to contribute — the platform-specific settings still living in `builder/rspack-config.ts`
 * (`target: 'node'`, the externals policy, ESM chunk output) are the Node ones by default.
 */
export const NODE_PRESET: DeployPreset = {
  name: 'node',
  runtimeModule: 'deploy/node/runtime.js',
  deployHint: 'run `rshono start`',
};

/**
 * Cloudflare Workers: the host owns the process, the CDN owns the assets, and there is no filesystem.
 *
 * Every compiler setting here follows from `workerd` not being Node. Dependencies are bundled because
 * nothing resolves `node_modules` at runtime; `node:` and `cloudflare:` imports stay external because
 * the runtime provides them (`nodejs_compat`, which the scaffolded config enables for
 * `AsyncLocalStorage`); and async chunks are inlined because Wrangler's bundler cannot follow the
 * computed specifier Rspack's ESM chunk loader emits — a split bundle would deploy and then fail on
 * the first page render.
 */
export const CLOUDFLARE_PRESET: DeployPreset = {
  name: 'cloudflare',
  runtimeModule: 'deploy/cloudflare/runtime.js',
  deployHint: 'deploy with `wrangler deploy`',
  resolveConditions: ['workerd'],
  syntaxTargets: ['chrome 120'],
  configureServer(config) {
    config.target = 'webworker';
    config.externalsType = 'module-import';
    config.externals = [/^(?:node|cloudflare):/];
    config.output = { ...config.output, asyncChunks: false };
  },
  finalize: finalizeCloudflareBuild,
};

/**
 * Bun and Deno: like Node, but the runtime opens the socket from the module's default export. Their
 * `node:` compatibility covers everything `server/` uses, so the bundle is Node's — only the handoff
 * differs, which is precisely the thing an app cannot do for itself.
 */
export const BUN_PRESET: DeployPreset = {
  name: 'bun',
  runtimeModule: 'deploy/bun/runtime.js',
  deployHint: 'run `bun dist/server/main.mjs`',
};

export const DENO_PRESET: DeployPreset = {
  name: 'deno',
  runtimeModule: 'deploy/deno/runtime.js',
  deployHint: 'run `deno serve -A dist/server/main.mjs`',
};

/**
 * Vercel and Netlify: one Node function behind the platform's CDN, which serves the assets and reaches
 * the function only for a page. Both `finalize` hooks assemble the layout the platform uploads.
 */
export const VERCEL_PRESET: DeployPreset = {
  name: 'vercel',
  runtimeModule: 'deploy/vercel/runtime.js',
  deployHint: 'deploy with `vercel deploy --prebuilt`',
  finalize: finalizeVercelBuild,
};

export const NETLIFY_PRESET: DeployPreset = {
  name: 'netlify',
  runtimeModule: 'deploy/netlify/runtime.js',
  deployHint: 'deploy with `netlify deploy --build=false --dir=.netlify/publish`',
  finalize: finalizeNetlifyBuild,
};

/** AWS Lambda behind a Function URL in `RESPONSE_STREAM` mode — the AWS shape that keeps streaming. */
export const AWS_LAMBDA_PRESET: DeployPreset = {
  name: 'aws-lambda',
  runtimeModule: 'deploy/aws-lambda/runtime.js',
  deployHint: 'zip dist/ with the handler at dist/server/main.mjs',
};

const PRESETS: Record<DeployTarget, DeployPreset> = {
  node: NODE_PRESET,
  cloudflare: CLOUDFLARE_PRESET,
  bun: BUN_PRESET,
  deno: DENO_PRESET,
  vercel: VERCEL_PRESET,
  netlify: NETLIFY_PRESET,
  'aws-lambda': AWS_LAMBDA_PRESET,
};

/** Every target `deploy` accepts, for error messages and docs. */
export const DEPLOY_TARGETS = Object.keys(PRESETS) as DeployTarget[];

/**
 * How to deploy what a given target built, or `null` for a name this rshono does not know — which a
 * `dist/` produced by a newer version can legitimately carry.
 */
export function deployHintFor(target: string): string | null {
  return (PRESETS as Record<string, DeployPreset | undefined>)[target]?.deployHint ?? null;
}

/** Where a deploy target can be named, in precedence order. */
export interface DeploySources {
  /** The `--deploy` flag. */
  flag?: string;
  /** The `RSHONO_DEPLOY` env var — for a CI job that deploys the same app to more than one place. */
  env?: string;
  /** {@link RSHonoConfig.deploy} from `rshono.config.ts`. */
  config?: string;
}

/**
 * Resolves the preset to build with: the flag wins over the environment, which wins over the config
 * file, which wins over the `node` default.
 *
 * Blank values are ignored at every level, so an unset-but-present `RSHONO_DEPLOY=` in a CI
 * environment falls through to the config file instead of failing the build.
 */
export function resolveDeployPreset(sources: DeploySources = {}): DeployPreset {
  const target = sources.flag?.trim() || sources.env?.trim() || sources.config?.trim();
  if (!target) return NODE_PRESET;

  const preset = (PRESETS as Record<string, DeployPreset | undefined>)[target];
  if (!preset) {
    throw new Error(`[rshono] unknown deploy target ${JSON.stringify(target)} — expected one of: ${DEPLOY_TARGETS.join(', ')}.`);
  }
  return preset;
}
