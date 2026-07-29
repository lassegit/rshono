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
  eslint: '^10.8.0',
  // ESLint's own recommended JavaScript rules, which typescript-eslint layers on top of rather than
  // replaces, and the rules of hooks — the one class of React mistake no type checker sees.
  '@eslint/js': '^10.0.1',
  'typescript-eslint': '^8.65.0',
  'eslint-plugin-react-hooks': '^7.1.1',
  wrangler: '^4.115.0',
} as const;

/**
 * The TypeScript an ESLint app pins, in place of the framework's own — the one deliberate exception to
 * {@link FRAMEWORK_DEPS}, and the reason it is spelled out here.
 *
 * typescript-eslint reads TypeScript's compiler API directly rather than through a stable interface, so
 * it accepts `typescript >=4.8.4 <6.1.0` and nothing above. `~6.0.3` is the newest that satisfies it:
 * patch releases of 6.0, no minor. The framework itself stays on the TypeScript it is tested against —
 * rshono's declarations compile the same under either, which is what makes this pin an app's business
 * and not the framework's.
 *
 * When upstream widens the range, this constant and the ESLint feature's use of it are what to delete.
 */
export const ESLINT_TYPESCRIPT = '~6.0.3';
