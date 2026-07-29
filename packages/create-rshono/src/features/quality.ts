import type { Formatter, Linter } from '../options.js';
import { TOOL_VERSIONS } from '../versions.js';
import type { Feature } from './types.js';

/**
 * The formatter and linter features. Biome answers to both slots and appears once — `selectFeatures`
 * deduplicates by `id`, so `formatter: 'biome', linter: 'biome'` contributes one set of files, one
 * dependency and one pair of scripts.
 *
 * Each tool brings its own `check` script alongside `format`/`lint`, because the writing half and the
 * CI half want different exit-code behaviour: `format` rewrites files, `check` fails instead.
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
  biome: BIOME,
  none: null,
};

export function formatterFeature(formatter: Formatter): Feature | null {
  return FORMATTERS[formatter];
}

export function linterFeature(linter: Linter): Feature | null {
  return LINTERS[linter];
}
