import type { RspackOptions } from '@rspack/core';
import type { DeployTarget } from './contract.js';

/**
 * The build-time half of a deploy target: which runtime module the bundle gets, and how the server
 * compiler has to change to produce something the platform can run.
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
  /**
   * Adjusts the generated server Rspack config for this platform — target, resolve conditions,
   * externals policy, output shape. Mutates in place, and runs *before* the user's `rspack` hook so
   * that hook keeps the last word.
   */
  configureServer?(config: RspackOptions): void;
}

/**
 * Node: a long-lived server process. The generated config is already this shape, so the preset has
 * no `configureServer` to contribute — the platform-specific settings still living in
 * `builder/rspack-config.ts` (`target: 'node'`, the externals policy, ESM chunk output) move here
 * when a second preset arrives to disagree with them.
 */
export const NODE_PRESET: DeployPreset = {
  name: 'node',
  runtimeModule: 'deploy/node/runtime.js',
};

const PRESETS: Record<DeployTarget, DeployPreset> = {
  node: NODE_PRESET,
};

/** Every target `deploy` accepts, for error messages and docs. */
export const DEPLOY_TARGETS = Object.keys(PRESETS) as DeployTarget[];

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
