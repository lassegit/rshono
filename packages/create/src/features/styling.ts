import type { Styling } from '../options.js';
import { TOOL_VERSIONS } from '../versions.js';
import type { Feature } from './types.js';

/**
 * Tailwind is a PostCSS plugin and nothing more, which is the whole of this feature: four packages,
 * plus an overlay carrying `postcss.config.mjs`, an `rshono.config.ts` whose `rspack` hook puts
 * postcss-loader in front of the CSS parser, a Tailwind entry stylesheet, and the two views rewritten
 * in utilities.
 *
 * `postcss` and `postcss-loader` are the app's dependencies rather than the framework's — rshono
 * compiles CSS natively, so an app that does not want a plugin chain does not install one.
 */
const TAILWIND: Feature = {
  id: 'tailwind',
  overlays: ['tailwind'],
  devDependencies: {
    tailwindcss: TOOL_VERSIONS.tailwindcss,
    '@tailwindcss/postcss': TOOL_VERSIONS['@tailwindcss/postcss'],
    postcss: TOOL_VERSIONS.postcss,
    'postcss-loader': TOOL_VERSIONS['postcss-loader'],
  },
};

export function stylingFeature(styling: Styling): Feature | null {
  return styling === 'tailwind' ? TAILWIND : null;
}
