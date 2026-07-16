'use strict';
/**
 * Prepends the 'use server-entry' directive to route component modules
 * (selected by the page-files scan in rspack-config.ts). Runs with
 * enforce: 'pre', so builtin:swc-loader — where the RSC directive
 * transform lives — sees the directive as if the author had written it.
 *
 * A module that already opens with a directive ('use server-entry',
 * 'use client', 'use server') is left untouched: manual directives are
 * respected, and a 'use client' page keeps failing loudly at the
 * framework's "page must be a server component" check instead of being
 * silently rewritten into something contradictory.
 *
 * The directive is prepended WITHOUT a newline so every original line
 * keeps its number (stack traces, source maps).
 */
const OPENS_WITH_DIRECTIVE = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(['"])use (?:client|server|server-entry)\1\s*(?:;|\n|$)/;

module.exports = function pageEntryLoader(source) {
    if (OPENS_WITH_DIRECTIVE.test(source)) return source;
    return "'use server-entry';" + source;
};
