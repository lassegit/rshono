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

export async function readPrerendered(ssgDir: string, requestPath: string): Promise<string | null> {
  if (/(^|\/)\.\.?(\/|$)/.test(requestPath)) return null;
  const relPath = ssgFilePath(requestPath);
  if (relPath === null) return null;
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
  fetch: (request: Request) => Response | Promise<Response>;
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

      const html = await response.text();
      const file = join(ssgDir, ssgFilePath(path)!);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, html);
      written.push(path);
    }
  }

  return { written, skipped };
}
