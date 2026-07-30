import type { Feature } from './features/index.js';
import type { Answers } from './options.js';
import type { PackageManager } from './pm.js';
import { FRAMEWORK_DEPS, NODE_ENGINE, RSHONO_RANGE } from './versions.js';

/**
 * The scripts every app gets. `start` is not among them, because it means something different per
 * platform: the three targets that run the build themselves — node, bun, deno — each contribute their
 * own, and a platform target contributes a `deploy` instead, where its platform has one command to give.
 */
const BASE_SCRIPTS: Record<string, string> = {
  dev: 'rshono dev',
  build: 'rshono build',
  typecheck: 'tsc --noEmit',
};

/** Field order in the emitted file — the conventional reading order, and stable so snapshots are too. */
const FIELD_ORDER = ['name', 'version', 'private', 'type', 'engines', 'packageManager', 'scripts', 'dependencies', 'devDependencies'];

function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * The install script every app inherits, from the framework rather than from anything it chose. tsx
 * reads `rshono.config.ts` through esbuild, and esbuild's script only picks the platform binary out of
 * the optional dependency that already carries it — rshono's own repo denies it for the same reason.
 */
const BASE_ALLOW_BUILDS: Record<string, boolean> = { esbuild: false };

/**
 * pnpm's settings for the new app — written for pnpm and for nobody else.
 *
 * It exists for one field. A dependency with an install script is a question pnpm will not answer on its
 * own: it fails the install, and fails every `pnpm dev` after it, until the project has said whether the
 * script should run. None of the ones an rshono app inherits need to (each is a native package whose
 * binary arrives as an optional dependency), so a fresh app carries the answer rather than meeting
 * `pnpm approve-builds` before it has rendered a page once.
 *
 * In this file rather than under a `pnpm` key in `package.json`, which pnpm 11 no longer reads, single-
 * package projects included. What lands here is a decision about *this* app: a scaffolded file the app
 * owns from then on, not something the framework reaches back into.
 */
export function buildPnpmSettings(features: Feature[]): string {
  const allowBuilds = { ...BASE_ALLOW_BUILDS };
  for (const feature of features) Object.assign(allowBuilds, feature.allowBuilds);

  return [
    '# Which dependencies may run an install script. pnpm runs none it has not been told about, and',
    '# fails the install rather than skip one quietly — so anything added later belongs here too.',
    '# `false` means the script was looked at: these ship their real binary as an optional dependency.',
    'allowBuilds:',
    ...Object.entries(sorted(allowBuilds)).map(([name, allowed]) => `  ${name}: ${allowed}`),
    '',
  ].join('\n');
}

/**
 * Assembles `package.json` from the answers and whatever the selected features contribute.
 *
 * Dependencies are sorted by name and scripts are left in contribution order (the base ones, then each
 * feature's, in the order features were selected) — so two runs with the same answers produce byte-
 * identical output, which is what makes the generated manifest snapshot-testable.
 */
export function buildPackageJson(answers: Answers, features: Feature[], pm: PackageManager): string {
  const scripts: Record<string, string> = { ...BASE_SCRIPTS };
  const dependencies: Record<string, string> = {
    '@rshono/core': RSHONO_RANGE,
    hono: FRAMEWORK_DEPS.hono,
    react: FRAMEWORK_DEPS.react,
    'react-dom': FRAMEWORK_DEPS['react-dom'],
  };
  const devDependencies: Record<string, string> = {
    '@types/node': FRAMEWORK_DEPS['@types/node'],
    '@types/react': FRAMEWORK_DEPS['@types/react'],
    typescript: FRAMEWORK_DEPS.typescript,
  };

  for (const feature of features) {
    Object.assign(scripts, feature.scripts);
    Object.assign(dependencies, feature.dependencies);
    Object.assign(devDependencies, feature.devDependencies);
  }

  const manifest: Record<string, unknown> = {
    name: answers.packageName,
    version: '0.1.0',
    private: true,
    type: 'module',
    // Generated from the framework's own manifest, so the app's floor cannot drift below rshono's.
    engines: { node: NODE_ENGINE },
    scripts,
    dependencies: sorted(dependencies),
    devDependencies: sorted(devDependencies),
  };

  // Only when the environment told us the exact version: `packageManager` pins the tool for Corepack,
  // and a guess at the version is worse than leaving the field out.
  if (pm.version) manifest.packageManager = `${pm.name}@${pm.version}`;

  const ordered = Object.fromEntries(FIELD_ORDER.filter((field) => field in manifest).map((field) => [field, manifest[field]]));
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
