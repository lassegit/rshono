/**
 * User module loading — src/routes.ts and the src/*.server.ts sub-app.
 *
 * Shared by the request handler (dev/start) and the build command so
 * both interpret the user's exports identically.
 */
import type { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Route } from '../router.js';

/**
 * Import src/routes.ts. Returns null when the file doesn't exist;
 * throws when it exists but fails to import.
 */
export async function loadRoutes(rootDir: string): Promise<Route[] | null> {
    const routesPath = join(rootDir, 'src', 'routes.ts');
    if (!existsSync(routesPath)) return null;

    const mod = await import(pathToFileURL(routesPath).href);
    // Support both `export const routes` and `export default routes`
    const routes = mod.routes ?? mod.default ?? [];
    if (!Array.isArray(routes)) {
        console.warn('  ⚠ routes.ts did not export an array. Expected `export const routes = defineRoutes([...])`');
        return [];
    }
    return routes;
}

/**
 * Candidate filenames for the optional Hono sub-app, in priority order.
 * They all end in `.server.ts`, so the bundler's *.server.* replacement
 * stubs them out of the client bundle automatically — the sub-app can
 * never leak into the browser, whichever name is used.
 */
export const SERVER_APP_FILENAMES = ['index.server.ts', 'app.server.ts', 'main.server.ts'] as const;

/**
 * Resolve the project's server sub-app file inside `srcDir`, or undefined
 * when there is none. If more than one candidate exists the first by
 * priority wins, and a warning names the ignored file(s).
 */
export function resolveServerAppPath(srcDir: string): string | undefined {
    const found = SERVER_APP_FILENAMES.map((name) => join(srcDir, name)).filter((p) => existsSync(p));
    if (found.length > 1) {
        const ignored = found
            .slice(1)
            .map((p) => `src/${basename(p)}`)
            .join(', ');
        console.warn(`  ⚠ Multiple server sub-apps found — using src/${basename(found[0])}, ignoring ${ignored}.`);
    }
    return found[0];
}

/**
 * Import the optional Hono sub-app (one of SERVER_APP_FILENAMES, e.g.
 * src/index.server.ts). Returns undefined when the file is missing, fails
 * to load, or doesn't export a Hono app.
 */
export async function loadServerApp(rootDir: string): Promise<Hono | undefined> {
    const serverPath = resolveServerAppPath(join(rootDir, 'src'));
    if (!serverPath) return undefined;

    try {
        const mod = await import(pathToFileURL(serverPath).href);
        const subApp = mod.default;
        if (typeof subApp?.fetch !== 'function' || typeof subApp?.route !== 'function') {
            console.warn(`  ⚠ src/${basename(serverPath)} did not default-export a Hono app. Skipping.`);
            return undefined;
        }
        return subApp as Hono;
    } catch (err) {
        console.warn(`  ⚠ Failed to load src/${basename(serverPath)}:`);
        console.warn(err);
        return undefined;
    }
}
