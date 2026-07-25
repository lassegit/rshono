import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { isPageRoute, type PageRoute, type Route } from '../router.js';

/**
 * Stand-in origin for a build that didn't declare {@link RSHonoConfig.siteUrl}. Deliberately
 * obviously-wrong rather than a guess: a page that bakes this into a canonical tag should be easy
 * to spot, and the build warns when static routes are prerendered without a real origin.
 */
const DEFAULT_SSG_ORIGIN = 'http://localhost';

/**
 * The two representations of a page, prerendered side by side.
 *
 * A hard load wants the HTML document; a soft navigation asks the same URL for a flight payload.
 * Writing only the HTML meant every in-app click re-rendered a page that was already built, so the
 * prerender only ever paid off for cold loads and crawlers.
 */
export type PrerenderVariant = 'html' | 'flight';

const VARIANT = {
  html: { file: 'index.html', accept: 'text/html', contentType: 'text/html' },
  flight: { file: 'index.rsc', accept: 'text/x-component', contentType: 'text/x-component' },
} as const satisfies Record<PrerenderVariant, { file: string; accept: string; contentType: string }>;

export function ssgFilePath(routePath: string, variant: PrerenderVariant = 'html'): string | null {
  if (/[:*]/.test(routePath)) return null;
  const trimmed = routePath.replace(/^\/+|\/+$/g, '');
  const file = VARIANT[variant].file;
  return trimmed === '' ? file : join(trimmed, file);
}

/**
 * Resolve {@link RSHonoConfig.siteUrl} to the origin prerendering should render against.
 *
 * A path is rejected rather than dropped: `'https://example.com/docs'` almost certainly means the
 * author expects a base path, and silently serving from the root would be a confusing way to find
 * out that isn't supported.
 */
export function resolveSiteOrigin(siteUrl: string | undefined): string {
  if (!siteUrl) return DEFAULT_SSG_ORIGIN;
  const parsed = URL.parse(siteUrl);
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    throw new Error(`[rshono] invalid siteUrl ${JSON.stringify(siteUrl)} — use a full origin, e.g. 'https://example.com'.`);
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`[rshono] siteUrl ${JSON.stringify(siteUrl)} must be a bare origin — a base path is not supported.`);
  }
  return parsed.origin;
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

/** A prerendered page, ready to serve: its body and a validator derived from those exact bytes. */
export interface PrerenderedPage {
  /** The document or the flight payload, depending on which {@link PrerenderVariant} was read. */
  body: string;
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

export async function readPrerendered(ssgDir: string, requestPath: string, variant: PrerenderVariant = 'html'): Promise<PrerenderedPage | null> {
  if (/(^|\/)\.\.?(\/|$)/.test(requestPath)) return null;
  const relPath = ssgFilePath(requestPath, variant);
  if (relPath === null) return null;
  const root = resolve(ssgDir);
  const file = resolve(root, relPath);
  if (!file.startsWith(root + sep)) return null;

  const cached = pageCache.get(file);
  if (cached) return cached;

  let body: string;
  try {
    body = await readFile(file, 'utf8');
  } catch {
    return null;
  }

  const page: PrerenderedPage = { body, etag: `W/"${createHash('sha256').update(body).digest('base64url').slice(0, 22)}"` };
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
  /** {@link RSHonoConfig.siteUrl} — the origin absolute URLs in the output are built against. */
  siteUrl?: string;
}

export interface PrerenderResult {
  written: string[];
  skipped: string[];
}

/** Renders one representation of a path, or `null` if the app didn't answer with it. */
async function renderVariant(
  fetch: PrerenderOptions['fetch'],
  url: string,
  variant: PrerenderVariant,
): Promise<{ body: string } | { status: number } | null> {
  const response = await fetch(new Request(url, { headers: { Accept: VARIANT[variant].accept } }));
  if (response.status !== 200) return { status: response.status };
  if (!(response.headers.get('Content-Type') ?? '').includes(VARIANT[variant].contentType)) return null;
  return { body: await response.text() };
}

export async function prerenderStaticRoutes(options: PrerenderOptions): Promise<PrerenderResult> {
  const { routes, fetch, ssgDir } = options;
  const staticRoutes = routes.filter((r): r is PageRoute => isPageRoute(r) && r.render === 'static');
  const origin = resolveSiteOrigin(options.siteUrl);

  if (staticRoutes.length > 0 && !options.siteUrl) {
    console.warn(
      `  ⚠ No siteUrl in rshono.config — prerendered pages are built against ${DEFAULT_SSG_ORIGIN}, so any absolute URL\n` +
        `    they derive from a page's \`url\` prop (canonical tags, og:url, absolute links) will point there.`,
    );
  }

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
      const document = await renderVariant(fetch, origin + path, 'html');
      if (document === null || !('body' in document)) {
        const rendered = document === null ? 'a non-HTML response' : `${document.status}`;
        console.warn(`  ⚠ "${path}" rendered ${rendered} at build time — skipping, will SSR per request.`);
        skipped.push(path);
        continue;
      }

      const write = (variant: PrerenderVariant, body: string) => {
        const file = join(ssgDir, ssgFilePath(path, variant)!);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, body);
      };
      write('html', document.body);

      // The soft-navigation representation of the same page. Best-effort: if it doesn't come back
      // cleanly the document is still valid on its own, and serving falls back to rendering flight
      // per request — the behaviour before this was written at all.
      const flight = await renderVariant(fetch, origin + path, 'flight');
      if (flight !== null && 'body' in flight) {
        write('flight', flight.body);
      } else {
        console.warn(`  ⚠ "${path}" produced no flight payload — soft navigations to it will render per request.`);
      }

      written.push(path);
    }
  }

  return { written, skipped };
}
