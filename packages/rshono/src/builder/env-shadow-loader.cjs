'use strict';
/**
 * Server-bundle counterpart of the client DefinePlugin env filter.
 *
 * Client components are ALSO compiled into the server bundle (SSR
 * layer) — and there `process.env` would be the real thing, so
 * `process.env.DATABASE_URL` inside a 'use client' component would
 * render the secret straight into the HTML stream. This pre-loader
 * shadows `process.env` with the same PUBLIC_-filtered object the
 * browser sees, so SSR output and hydration agree and nothing can leak.
 *
 * Applied to app src modules only, and skipped for the modules that
 * legitimately read real env:
 *   - *.server.* files (excluded by the rule in rspack-config.ts)
 *   - 'use server' action modules (detected here)
 * Modules that never mention process.env are left untouched, so code
 * using other process APIs (process.cwd()…) keeps the real global.
 *
 * The prelude is inserted on one line, after any directive prologue
 * (directives must stay the first statement), so line numbers are
 * preserved for stack traces and source maps.
 */
const OPENS_WITH_USE_SERVER = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(['"])use server\1\s*(?:;|\n|$)/;
const DIRECTIVE_PROLOGUE = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(?:(['"])use [a-z -]+\1\s*;?)?/;

module.exports = function envShadowLoader(source) {
    if (!source.includes('process.env')) return source;
    if (OPENS_WITH_USE_SERVER.test(source)) return source;
    const { prelude } = this.getOptions();
    const prologue = source.match(DIRECTIVE_PROLOGUE)[0];
    return prologue + prelude + source.slice(prologue.length);
};
