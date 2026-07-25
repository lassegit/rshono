import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { isPageRoute, type PageRoute, type Route } from '../router.js';

const SSG_ORIGIN = 'http://localhost';

export function ssgFilePath(routePath: string): string | null {
  if (/[:*]/.test(routePath)) return null;
  const trimmed = routePath.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? 'index.html' : join(trimmed, 'index.html');
}

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

/** A prerendered page, ready to serve: its HTML and a validator derived from that exact HTML. */
export interface PrerenderedPage {
  html: string;
  /**
   * `ETag` for the page, so a revalidating client can be answered with a 304 instead of the body.
   *
   * Deliberately **weak**. The bytes on the wire depend on whether the client took gzip, and a
   * strong validator would have to differ between those two — so the 200 and the 304 that
   * revalidates it would disagree, and a cache would treat them as different pages. A weak tag
   * says "the same representation", which is exactly what is true across content codings.
   */
  etag: string;
}

/**
 * Prerendered pages, keyed by resolved file path.
 *
 * Bounded so a site with thousands of prerendered pages keeps a working set rather than the whole
 * build in memory. Only *hits* are cached: caching misses would let anyone mint entries by
 * requesting paths that don't exist. The files are written at build time and never change while
 * the server is up, so an entry never needs invalidating.
 */
const pageCache = new Map<string, PrerenderedPage>();
const MAX_CACHED_PAGES = 128;

export async function readPrerendered(ssgDir: string, requestPath: string): Promise<PrerenderedPage | null> {
  if (/(^|\/)\.\.?(\/|$)/.test(requestPath)) return null;
  const relPath = ssgFilePath(requestPath);
  if (relPath === null) return null;
  const root = resolve(ssgDir);
  const file = resolve(root, relPath);
  if (!file.startsWith(root + sep)) return null;

  const cached = pageCache.get(file);
  if (cached) return cached;

  let html: string;
  try {
    html = await readFile(file, 'utf8');
  } catch {
    return null;
  }

  const page: PrerenderedPage = { html, etag: `W/"${createHash('sha256').update(html).digest('base64url').slice(0, 22)}"` };
  pageCache.set(file, page);
  for (const oldest of pageCache.keys()) {
    if (pageCache.size <= MAX_CACHED_PAGES) break;
    pageCache.delete(oldest);
  }
  return page;
}

interface PrerenderOptions {
  routes: readonly Route[];
  fetch: (request: Request) => Response | Promise<Response>;
  ssgDir: string;
}

export interface PrerenderResult {
  written: string[];
  skipped: string[];
}

export async function prerenderStaticRoutes(options: PrerenderOptions): Promise<PrerenderResult> {
  const { routes, fetch, ssgDir } = options;
  const staticRoutes = routes.filter((r): r is PageRoute => isPageRoute(r) && r.render === 'static');

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

      const html = await response.text();
      const file = join(ssgDir, ssgFilePath(path)!);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, html);
      written.push(path);
    }
  }

  return { written, skipped };
}
