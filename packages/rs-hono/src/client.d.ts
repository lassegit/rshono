/**
 * Ambient module types for bundler-handled imports.
 *
 * Reference from your project (e.g. src/env.d.ts):
 *   /// <reference types="rs-hono/client" />
 */

// CSS modules: named class-name exports, matching Rspack's native CSS
// support (there is no default export). Use `import * as styles`.
declare module '*.module.css' {
    const classes: { readonly [key: string]: string };
    export = classes;
}

// Global CSS: side-effect import, no exports.
declare module '*.css';
