import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { isPageRoute, type PageRoute, type Route } from '../router.js';
import {
  createPageCache,
  prerenderedRelPath,
  ssgFilePath,
  toPrerenderedPage,
  VARIANTS,
  type PrerenderedPage,
  type PrerenderVariant,
} from './prerendered.js';

/**
 * Stand-in origin for a build that didn't declare {@link RshonoConfig.siteUrl}. Deliberately
 * obviously-wrong rather than a guess: a page that bakes this into a canonical tag should be easy
 * to spot, and the build warns when static routes are prerendered without a real origin.
 */
const DEFAULT_SSG_ORIGIN = 'http://localhost';

/**
 * Resolve {@link RshonoConfig.siteUrl} to the origin prerendering should render against.
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

/** Prerendered pages, keyed by the request that produced them (see {@link readPrerendered}). */
const pageCache = createPageCache();

export async function readPrerendered(ssgDir: string, requestPath: string, variant: PrerenderVariant = 'html'): Promise<PrerenderedPage | null> {
  // Keyed by what the request carried, not by the resolved filename, so a hit costs one Map lookup
  // instead of re-deriving the path every time. Safe because only *hits* are cached: an entry
  // exists only if this exact key already passed the checks below.
  const key = `${ssgDir}\0${variant}\0${requestPath}`;
  const cached = pageCache.get(key);
  if (cached) return cached;

  const relPath = prerenderedRelPath(requestPath, variant);
  if (relPath === null) return null;
  // Belt and braces: the shared guard already refused a traversal, and this proves the resolved file
  // is under the root whatever else the path contained.
  const root = resolve(ssgDir);
  const file = resolve(root, relPath);
  if (!file.startsWith(root + sep)) return null;

  // No encoding argument: the bytes are what gets served, and decoding them to a string here would
  // only mean re-encoding them on every request that hits the cache. Copied out of the Buffer rather
  // than kept as one, because `readFile` can hand back a view into Node's shared allocation pool and
  // this is retained for the life of the process.
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = new Uint8Array(await readFile(file));
  } catch {
    return null;
  }

  const page = await toPrerenderedPage(body);
  pageCache.set(key, page);
  return page;
}

interface PrerenderOptions {
  routes: readonly Route[];
  fetch: (request: Request) => Response | Promise<Response>;
  ssgDir: string;
  /** {@link RshonoConfig.siteUrl} — the origin absolute URLs in the output are built against. */
  siteUrl?: string;
}

export interface PrerenderResult {
  written: string[];
  skipped: string[];
}

/**
 * One representation of a path, as the app answered for it at build time.
 *
 * Discriminated on `ok` rather than returned as a body-or-status-or-null union: both callers have to
 * tell "the app rendered this" from "it did not", and only one of them cares *why* — which as three
 * shapes made every read a `'body' in result` check against a value that could also be null.
 */
type RenderedVariant = { ok: true; body: string } | { ok: false; reason: string };

async function renderVariant(fetch: PrerenderOptions['fetch'], url: string, variant: PrerenderVariant): Promise<RenderedVariant> {
  const response = await fetch(new Request(url, { headers: { Accept: VARIANTS[variant].accept } }));
  if (response.status !== 200) return { ok: false, reason: `${response.status}` };
  if (!(response.headers.get('Content-Type') ?? '').includes(VARIANTS[variant].contentType)) {
    return { ok: false, reason: `a non-${VARIANTS[variant].contentType} response` };
  }
  return { ok: true, body: await response.text() };
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
      if (!document.ok) {
        console.warn(`  ⚠ "${path}" rendered ${document.reason} at build time — skipping, will SSR per request.`);
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
      if (flight.ok) {
        write('flight', flight.body);
      } else {
        console.warn(`  ⚠ "${path}" produced no flight payload — soft navigations to it will render per request.`);
      }

      written.push(path);
    }
  }

  return { written, skipped };
}
