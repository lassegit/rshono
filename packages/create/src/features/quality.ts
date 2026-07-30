import type { Formatter, Linter } from '../options.js';
import { ESLINT_TYPESCRIPT, TOOL_VERSIONS } from '../versions.js';
import type { Feature } from './types.js';

/**
 * The formatter and linter features. Biome answers to both slots and appears once — `selectFeatures`
 * deduplicates by `id`, so `formatter: 'biome', linter: 'biome'` contributes one set of files, one
 * dependency and one pair of scripts.
 *
 * A formatter brings `format:check` beside `format`, because the writing half and the CI half want
 * different exit-code behaviour: `format` rewrites files, `format:check` fails instead. A linter brings
 * `lint:fix` beside `lint`, for the same reason in the other direction — `lint` is already the failing
 * one. Biome adds a `check` of its own, which is the pair of them in a single pass.
 */
const PRETTIER: Feature = {
  id: 'prettier',
  overlays: ['prettier'],
  devDependencies: { prettier: TOOL_VERSIONS.prettier },
  scripts: { format: 'prettier --write .', 'format:check': 'prettier --check .' },
};

const OXFMT: Feature = {
  id: 'oxfmt',
  overlays: ['oxfmt'],
  devDependencies: { oxfmt: TOOL_VERSIONS.oxfmt },
  scripts: { format: 'oxfmt .', 'format:check': 'oxfmt --check .' },
};

const OXLINT: Feature = {
  id: 'oxlint',
  overlays: ['oxlint'],
  devDependencies: { oxlint: TOOL_VERSIONS.oxlint },
  scripts: { lint: 'oxlint', 'lint:fix': 'oxlint --fix' },
};

/**
 * The one feature that changes a dependency the framework otherwise decides: typescript-eslint cannot be
 * installed alongside the TypeScript rshono is tested against, so an ESLint app pins the newest one its
 * peer range accepts (see {@link ESLINT_TYPESCRIPT}). Every other preset leaves TypeScript alone.
 *
 * The rules are type-aware, which is the reason to reach for ESLint over a syntax-only linter at all —
 * so the config it ships hands the whole program to the parser rather than linting file by file.
 */
const ESLINT: Feature = {
  id: 'eslint',
  overlays: ['eslint'],
  devDependencies: {
    eslint: TOOL_VERSIONS.eslint,
    '@eslint/js': TOOL_VERSIONS['@eslint/js'],
    'typescript-eslint': TOOL_VERSIONS['typescript-eslint'],
    'eslint-plugin-react-hooks': TOOL_VERSIONS['eslint-plugin-react-hooks'],
    typescript: ESLINT_TYPESCRIPT,
  },
  scripts: { lint: 'eslint .', 'lint:fix': 'eslint . --fix' },
};

const BIOME: Feature = {
  id: 'biome',
  overlays: ['biome'],
  devDependencies: { '@biomejs/biome': TOOL_VERSIONS['@biomejs/biome'] },
  scripts: {
    format: 'biome format --write .',
    'format:check': 'biome format .',
    lint: 'biome lint .',
    'lint:fix': 'biome lint --write .',
    check: 'biome check .',
  },
};

const FORMATTERS: Record<Formatter, Feature | null> = {
  prettier: PRETTIER,
  oxfmt: OXFMT,
  biome: BIOME,
  none: null,
};

const LINTERS: Record<Linter, Feature | null> = {
  oxlint: OXLINT,
  eslint: ESLINT,
  biome: BIOME,
  none: null,
};

export function formatterFeature(formatter: Formatter): Feature | null {
  return FORMATTERS[formatter];
}

export function linterFeature(linter: Linter): Feature | null {
  return LINTERS[linter];
}
