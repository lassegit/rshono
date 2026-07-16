/**
 * SSG Pre-rendering
 *
 * At build time, every `kind: "static"` route is rendered by making a
 * real request against the assembled app (`app.fetch`) — so the flight
 * payload, streaming SSR and per-page assets are reused unchanged — and
 * the resulting HTML is written to dist/ssg/. Routes with params
 * (`/docs/:slug`) declare the pages to render via `staticPaths` on the
 * route definition.
 *
 * In production the page handler calls `readPrerendered()` per request
 * and serves the file when it exists; anything not prerendered (params
 * without staticPaths, build-time skips, soft-navigation flight
 * requests) falls back to per-request rendering.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { isPageRoute, type PageRoute, type Route } from '../router.js';

/**
 * Origin used for build-time render requests. Static HTML cannot know
 * the real host, so this is what `props.url` is baked as.
 */
const SSG_ORIGIN = 'http://localhost';

/**
 * Map a route path to its file under the ssg dir, using directory-index
 * style so `/signup` becomes `signup/index.html`. Returns null for
 * paths that contain params or wildcards — those cannot be prerendered.
 */
export function ssgFilePath(routePath: string): string | null {
    if (/[:*]/.test(routePath)) return null;
    const trimmed = routePath.replace(/^\/+|\/+$/g, '');
    return trimmed === '' ? 'index.html' : join(trimmed, 'index.html');
}

/**
 * Interpolate a staticPaths param set into a route pattern:
 * "/docs/:slug" + {slug: "intro"} → "/docs/intro". Values are
 * URI-encoded, so the result never contains `:` or `*`.
 */
function interpolatePath(pattern: string, params: Record<string, string>): string {
    return pattern
        .split('/')
        .map((segment) => {
            if (!segment.startsWith(':')) {
                if (segment.includes('*')) {
                    throw new Error(`Cannot prerender "${pattern}": wildcard segments are not supported by staticPaths.`);
                }
                return segment;
            }
            const name = segment.slice(1);
            if (!/^\w+$/.test(name)) {
                throw new Error(`Cannot prerender "${pattern}": optional/regex params are not supported by staticPaths.`);
            }
            const value = params[name];
            if (value === undefined) {
                throw new Error(`staticPaths for "${pattern}" returned a param set without "${name}".`);
            }
            return encodeURIComponent(value);
        })
        .join('/');
}

/**
 * Look up the prerendered HTML for a request path. Returns null when
 * the page was not prerendered — the caller falls back to SSR.
 */
export async function readPrerendered(ssgDir: string, requestPath: string): Promise<string | null> {
    // Dot segments would alias other pages once join() collapses them.
    if (/(^|\/)\.\.?(\/|$)/.test(requestPath)) return null;
    const relPath = ssgFilePath(requestPath);
    if (relPath === null) return null;
    // The request path reaches the filesystem here — confine the
    // resolved file to the ssg dir so it can never escape it.
    const root = resolve(ssgDir);
    const file = resolve(root, relPath);
    if (!file.startsWith(root + sep)) return null;
    try {
        return await readFile(file, 'utf8');
    } catch {
        return null;
    }
}

interface PrerenderOptions {
    routes: readonly Route[];
    /**
     * The app's fetch handler. Must come from a bundle imported with
     * RSC_HONO_PRERENDER=1 so it renders instead of serving the previous
     * build's prerendered HTML back to us.
     */
    fetch: (request: Request) => Response | Promise<Response>;
    /** Absolute path to the ssg output dir (dist/ssg). */
    ssgDir: string;
}

export interface PrerenderResult {
    written: string[];
    skipped: string[];
}

export async function prerenderStaticRoutes(options: PrerenderOptions): Promise<PrerenderResult> {
    const { routes, fetch, ssgDir } = options;
    const staticRoutes = routes.filter((r): r is PageRoute => isPageRoute(r) && r.kind === 'static');

    const written: string[] = [];
    const skipped: string[] = [];

    for (const route of staticRoutes) {
        let paths: string[];
        if (!/[:*]/.test(route.path)) {
            paths = [route.path];
        } else {
            if (!route.staticPaths) {
                console.warn(`  ⚠ Static route "${route.path}" has params but no staticPaths — will SSR per request.`);
                skipped.push(route.path);
                continue;
            }
            paths = (await route.staticPaths()).map((params) => interpolatePath(route.path, params));
        }

        for (const path of paths) {
            const response = await fetch(new Request(SSG_ORIGIN + path));
            if (response.status !== 200 || !(response.headers.get('Content-Type') ?? '').includes('text/html')) {
                console.warn(`  ⚠ "${path}" rendered ${response.status} at build time — skipping, will SSR per request.`);
                skipped.push(path);
                continue;
            }

            // text() buffers the streaming render to completion, so the file
            // contains the fully-resolved page (all Suspense boundaries).
            const html = await response.text();
            // Never null: interpolatePath URI-encodes values, so concrete
            // paths cannot contain ':' or '*'.
            const file = join(ssgDir, ssgFilePath(path)!);
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, html);
            written.push(path);
        }
    }

    return { written, skipped };
}
