import { DEPLOY_TARGETS, type DeployTargetName } from './generated/framework.js';

export type { DeployTargetName };

export type Styling = 'css' | 'tailwind';
/** Note the absence of ESLint — see {@link QUALITY_PRESETS}. */
export type Formatter = 'prettier' | 'biome' | 'oxfmt' | 'none';
export type Linter = 'oxlint' | 'biome' | 'none';
export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun';

export const PACKAGE_MANAGERS: readonly PackageManagerName[] = ['npm', 'pnpm', 'yarn', 'bun'];

/** Everything the generator needs to know. One prompt or flag per field, and every field has a default. */
export interface Answers {
  /** An npm-safe package name, written into `package.json`. */
  packageName: string;
  /** Absolute path of the directory to create the app in. */
  targetDir: string;
  deploy: DeployTargetName;
  styling: Styling;
  formatter: Formatter;
  linter: Linter;
  packageManager: PackageManagerName;
  install: boolean;
  git: boolean;
}

export const DEPLOY_TARGET_NAMES = DEPLOY_TARGETS.map((target) => target.name);

export function deployHint(name: DeployTargetName): string {
  return DEPLOY_TARGETS.find((target) => target.name === name)?.hint ?? '';
}

export function isDeployTarget(value: string): value is DeployTargetName {
  return DEPLOY_TARGET_NAMES.includes(value as DeployTargetName);
}

/**
 * The curated formatter/linter combinations the prompt offers. The two axes stay independent in
 * {@link Answers} — `--formatter` and `--linter` address them separately, and a future feature can
 * fill either slot — but presenting them as one question keeps combinations that make no sense
 * (Biome formatting next to a second linter) out of the flow.
 *
 * **Why there is no ESLint option.** Linting TypeScript with ESLint means `typescript-eslint`, whose
 * peer range is `typescript >=4.8.4 <6.1.0`. rshono is built and tested against TypeScript 7, so the
 * two cannot be installed together: `npm install` fails outright with ERESOLVE, and forcing it past
 * that would hand you a linter running against a compiler API it was never built for. The range is
 * upstream's to widen; when it does, ESLint becomes one more entry in `features/quality.ts` and one
 * more preset here.
 */
export interface QualityPreset {
  id: string;
  label: string;
  hint: string;
  formatter: Formatter;
  linter: Linter;
}

export const QUALITY_PRESETS: QualityPreset[] = [
  {
    id: 'prettier-oxlint',
    label: 'Prettier + oxlint',
    hint: 'the conventional formatter, with a fast linter',
    formatter: 'prettier',
    linter: 'oxlint',
  },
  { id: 'biome', label: 'Biome', hint: 'formatter and linter in one tool', formatter: 'biome', linter: 'biome' },
  { id: 'oxc', label: 'oxfmt + oxlint', hint: 'the oxc toolchain — fastest, newest', formatter: 'oxfmt', linter: 'oxlint' },
  { id: 'none', label: 'None', hint: 'add your own later', formatter: 'none', linter: 'none' },
];

/**
 * Turns whatever the user typed into a name npm will accept, or returns `null` when nothing usable is
 * left. Lowercasing and replacing runs of invalid characters covers the ordinary cases (`My App`,
 * `my_app`); a scoped name is kept intact, since `@scope/name` is legal.
 */
export function toPackageName(input: string): string | null {
  const trimmed = input
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
  if (!trimmed || trimmed === '.') return null;

  // A scoped name is a name, not a path: `@scope/pkg` stays whole rather than becoming `pkg`. Anything
  // else is a path, and the last segment is the one that names the project.
  const scoped = /^@[^\\/]+[\\/][^\\/]+$/.test(trimmed);
  const base = scoped ? trimmed : (trimmed.split(/[\\/]/).filter(Boolean).pop() ?? '');
  if (!base) return null;

  const name = base
    .toLowerCase()
    .replace(/[\\/]/g, '/')
    .replace(/[^a-z\d\-._~/@]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

  if (!name || name === '@' || (!scoped && name.startsWith('.'))) return null;
  return name.slice(0, 214);
}

/** npm's own rule, narrowed to what we ever generate: no uppercase, no leading dot or underscore. */
export function isValidPackageName(name: string): boolean {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(name) && name.length <= 214;
}
