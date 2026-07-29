import { FRAMEWORK_DEPS, RSHONO_VERSION } from './generated/framework.js';

export { FRAMEWORK_DEPS };

/** The framework range a scaffolded app gets. The two packages are released together, so this is ours. */
export const RSHONO_RANGE = `^${RSHONO_VERSION}`;

/**
 * Versions for the optional tooling the features can add — the one place in this package where a
 * dependency range is typed out by hand, because none of these are things the framework itself
 * declares. Everything a *scaffolded app* needs to run rshono comes from {@link FRAMEWORK_DEPS},
 * which is generated from rshono's own manifest and must not be edited here.
 *
 * Ranges are caret, not exact: these are the app's own dev tools, and a scaffold made six months from
 * now should pick up their patch releases rather than pinning whatever was current the day this file
 * was last touched.
 */
export const TOOL_VERSIONS = {
  tailwindcss: '^4.3.3',
  '@tailwindcss/postcss': '^4.3.3',
  // The pass Tailwind runs in, installed with it rather than with the framework.
  postcss: '^8.5.23',
  'postcss-loader': '^8.2.1',
  prettier: '^3.9.6',
  '@biomejs/biome': '^2.5.6',
  oxlint: '^1.76.0',
  oxfmt: '^0.61.0',
  wrangler: '^4.115.0',
} as const;
