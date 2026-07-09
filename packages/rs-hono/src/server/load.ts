/**
 * User module loading — src/routes.ts and src/server.ts.
 *
 * Shared by the request handler (dev/start) and the build command so
 * both interpret the user's exports identically.
 */
import type { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
 * Import src/server.ts (optional Hono sub-app). Returns undefined when
 * the file is missing, fails to load, or doesn't export a Hono app.
 */
export async function loadServerApp(rootDir: string): Promise<Hono | undefined> {
    const serverPath = join(rootDir, 'src', 'server.ts');
    if (!existsSync(serverPath)) return undefined;

    try {
        const mod = await import(pathToFileURL(serverPath).href);
        const subApp = mod.default;
        if (typeof subApp?.fetch !== 'function' || typeof subApp?.route !== 'function') {
            console.warn('  ⚠ server.ts did not default-export a Hono app. Skipping.');
            return undefined;
        }
        return subApp as Hono;
    } catch (err) {
        console.warn('  ⚠ Failed to load src/server.ts:');
        console.warn(err);
        return undefined;
    }
}
