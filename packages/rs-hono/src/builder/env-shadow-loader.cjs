/**
 * Server-bundle counterpart of env-hooks.mjs.
 *
 * Prepends a module-scoped `const process` shadow (holding the
 * PUBLIC_-filtered env) to shared modules, so a stray
 * `process.env.SECRET` in a component cannot reach SSR HTML — and so
 * server and client render the same values (the client bundle inlines
 * the same object via DefinePlugin). Applied by rspack-server-config.ts
 * with the same include/exclude rules env-hooks.mjs uses: src/, minus
 * *.server.* modules (which include the index.server.ts / app.server.ts
 * sub-app).
 *
 * The prelude carries no newline, so stack-trace line numbers stay put.
 * Plain .cjs: rspack loads loaders by file path, outside the TS graph.
 */
"use strict";
module.exports = function envShadowLoader(source) {
  if (typeof source !== "string" || !source.includes("process.env")) {
    return source;
  }
  return this.getOptions().prelude + source;
};
