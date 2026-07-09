/**
 * Client-side replacement for *.server.* modules.
 *
 * The framework's Rspack config swaps every module whose request matches
 * /\.server(\.[cm]?[tj]sx?)?$/ with this file in the CLIENT bundle. Any
 * attempt to actually USE a server-only export in the browser throws a
 * descriptive error; merely importing it (as routes.ts does) is harmless.
 *
 * `__esModule`, `default` and well-known symbols return undefined so that
 * ESM/CJS interop checks don't trip the trap at import time.
 */
module.exports = new Proxy(
    {},
    {
        get(_target, prop) {
            if (prop === '__esModule' || prop === 'default' || typeof prop === 'symbol') {
                return undefined;
            }
            throw new Error(
                `[rs-hono] "${String(prop)}" comes from a *.server file and is not available in the browser. ` +
                    'Server-only modules are stripped from the client bundle.',
            );
        },
    },
);
