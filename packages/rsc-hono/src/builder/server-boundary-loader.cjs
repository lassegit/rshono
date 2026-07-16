'use strict';
/**
 * Client-compiler guard for *.server.* modules (see SERVER_MODULE_PATTERN
 * in rspack-config.ts).
 *
 * In an RSC app there is no legitimate reason for a server-only module
 * to be reached from the client graph — routes.ts and server components
 * only ever run on the server — so unlike rs-hono's import-tolerant
 * throwing stub, this fails the BUILD, with one directive-aware
 * exception:
 *
 *   - A module that opens with 'use server' is a server-actions module.
 *     Importing it from client code is exactly how actions are meant to
 *     be used; the swc RSC transform (which runs after this pre-loader)
 *     replaces its body with server references, so no server code ships.
 *     It passes through untouched.
 *
 *   - Anything else is server-only code leaking toward the browser:
 *     compilation fails and names the module.
 */
const OPENS_WITH_USE_SERVER = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(['"])use server\1\s*(?:;|\n|$)/;

module.exports = function serverBoundaryLoader(source) {
    if (OPENS_WITH_USE_SERVER.test(source)) return source;
    throw new Error(
        `[rsc-hono] "${this.resourcePath}" is a *.server module, but it is imported from client code ` +
            "(a 'use client' component or something it imports). Server-only modules cannot ship to the browser. " +
            "Fix: do the server work in a server component and pass the result down as props — or, if this module " +
            "is meant to define server actions, put 'use server' at the top so it compiles to server references.",
    );
};
