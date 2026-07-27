/**
 * The framework config resolved from `rshono.config.ts` and inlined into the server bundle by
 * DefinePlugin (see `builder/rspack-config.ts`).
 *
 * Declared in its own file, separate from the bundler-internal globals, because `runtime/context.ts`
 * — reached from the public `rshono/server` entry — reads it, and so references this file directly. That keeps
 * `tsc` working in an app that imports `rshono/server` without dragging webpack's globals into the
 * app's global scope.
 */
declare const __RSHONO_CONFIG__: import('../server/server-config.js').ServerConfig;
