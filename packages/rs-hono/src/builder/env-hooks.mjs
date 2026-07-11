/**
 * Server-side public-env hooks.
 *
 * The client bundle only ever sees PUBLIC_-prefixed variables — DefinePlugin
 * replaces `process.env` with the filtered literal. But the server runs the
 * same component source via tsx with the REAL process.env, so a stray
 * `process.env.DATABASE_URL` in a page would stream the secret into the SSR
 * HTML (and only vanish on hydration). These hooks close that hole: every
 * shared module — under src/, not server-only — gets a module-scoped
 * `const process` shadow holding the same filtered object the client bundle
 * inlines. Same values on both sides: no leak, no hydration mismatch.
 *
 * Server-only code keeps the real environment: *.server.* modules,
 * src/server.ts, rs-hono.config.ts (outside src/), and node_modules.
 *
 * Plain .mjs on purpose: `module.register()` loads this file in Node's
 * hooks thread, where tsx's TypeScript transform is not guaranteed to
 * be active.
 */
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep in sync with SERVER_MODULE_PATTERN in builder/rspack-config.ts.
const SERVER_MODULE = /\.server(\.[cm]?[tj]sx?)?$/;
const SCRIPT_EXT = /\.[cm]?[tj]sx?$/;

/**
 * Install the shadow for ESM (projects are "type": "module"). Must run
 * before any user code (routes, pages, layouts) is imported.
 */
export function registerEnvHooks(options) {
    register(import.meta.url, { data: options });
}

let srcPrefix = '';
let serverAppUrl = '';
let prelude = '';

/** Runs once in the hooks thread with the data passed to register(). */
export function initialize({ rootDir, publicEnv }) {
    const srcUrl = pathToFileURL(join(rootDir, 'src')).href;
    srcPrefix = srcUrl + '/';
    serverAppUrl = srcUrl + '/server.ts';
    // No trailing newline: prepended to line 1 without shifting the line
    // numbers that stack traces and source maps report.
    prelude = `const process = { env: ${JSON.stringify(publicEnv)} }; `;
}

/** ESM load hook: shadow `process` in shared (client-graph) modules. */
export async function load(url, context, nextLoad) {
    const result = await nextLoad(url, context);

    // tsx watch may append ?query cache-busters to module URLs.
    const clean = url.split('?')[0].split('#')[0];
    const isShared =
        clean.startsWith(srcPrefix) && clean !== serverAppUrl && SCRIPT_EXT.test(clean) && !SERVER_MODULE.test(clean);
    if (!isShared || result.format !== 'module' || result.source == null) {
        return result;
    }

    const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
    // Only modules that mention process.env need the shadow — skipping the
    // rest avoids colliding with rare local `process` declarations.
    if (!source.includes('process.env')) return result;

    return { ...result, source: prelude + source };
}
