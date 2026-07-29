import { DEPLOY_TARGETS, type DeployTargetName } from './generated/framework.js';

export type { DeployTargetName };

export type Styling = 'css' | 'tailwind';
export type Formatter = 'prettier' | 'biome' | 'oxfmt' | 'none';
/** ESLint comes with a TypeScript pin the others do not — see {@link QUALITY_PRESETS}. */
export type Linter = 'oxlint' | 'eslint' | 'biome' | 'none';
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
 * **What the ESLint preset costs.** Linting TypeScript with ESLint means `typescript-eslint`, which
 * reads the compiler API directly and so accepts `typescript >=4.8.4 <6.1.0` — below the version rshono
 * itself is built and tested against. An app that picks ESLint therefore pins TypeScript 6 (the newest
 * that range allows), which is why it is a preset a user chooses rather than the default: the framework's
 * declarations compile identically under either, but the compiler is a major version behind and, being
 * the JavaScript implementation rather than the native one, several times slower on a large app. Every
 * other preset leaves TypeScript where the framework put it. When upstream widens the range, the pin in
 * `features/quality.ts` is the only thing to remove.
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
  {
    id: 'prettier-eslint',
    label: 'Prettier + ESLint',
    hint: 'type-aware rules — pins TypeScript 6, which is all typescript-eslint accepts',
    formatter: 'prettier',
    linter: 'eslint',
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
