import type { Feature } from './features/index.js';
import type { Answers } from './options.js';
import type { PackageManager } from './pm.js';
import { FRAMEWORK_DEPS, RSHONO_RANGE } from './versions.js';

/**
 * The scripts every app gets. `start` is not among them: it is the *Node* launcher, and the deploy
 * features each contribute the command their own platform runs what was built with.
 */
const BASE_SCRIPTS: Record<string, string> = {
  dev: 'rshono dev',
  build: 'rshono build',
  typecheck: 'tsc --noEmit',
};

/** Field order in the emitted file — the conventional reading order, and stable so snapshots are too. */
const FIELD_ORDER = ['name', 'version', 'private', 'type', 'engines', 'packageManager', 'scripts', 'dependencies', 'devDependencies'];

function sorted(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));
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
    hono: FRAMEWORK_DEPS.hono,
    react: FRAMEWORK_DEPS.react,
    'react-dom': FRAMEWORK_DEPS['react-dom'],
    rshono: RSHONO_RANGE,
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
    // The floor the framework declares. Stated here too so a CI image or a contributor on an older
    // Node finds out from their package manager rather than from a stack trace.
    engines: { node: '>=22.1.0' },
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
