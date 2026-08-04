/**
 * Everything about a prerendered page that doesn't need a filesystem: where the build puts it, and
 * what it looks like once read back.
 *
 * Split out of `ssg.ts` — which owns the writing and the reading, both through `node:fs` — because a
 * deploy target without a filesystem reads the very same layout out of an asset store, and importing
 * it from the fs module would drag `node:fs` and `node:crypto` into a bundle that has neither.
 */

/**
 * The two representations of a page, prerendered side by side.
 *
 * A hard load wants the HTML document; a soft navigation asks the same URL for a flight payload.
 * Writing only the HTML meant every in-app click re-rendered a page that was already built, so the
 * prerender only ever paid off for cold loads and crawlers.
 */
export type PrerenderVariant = 'html' | 'flight';

export const VARIANTS = {
  html: { file: 'index.html', accept: 'text/html', contentType: 'text/html' },
  flight: { file: 'index.rsc', accept: 'text/x-component', contentType: 'text/x-component' },
} as const satisfies Record<PrerenderVariant, { file: string; accept: string; contentType: string }>;

/**
 * Where a route's prerendered output lives, relative to the output root — or `null` for a path that
 * cannot be prerendered at all (one with a param or a wildcard left in it).
 *
 * Always `/`-separated, never the host's separator: the same string addresses a file on a filesystem
 * (`resolve()` and `join()` both accept forward slashes on Windows) and a key in an asset store,
 * where a backslash would simply be the wrong character.
 */
export function ssgFilePath(routePath: string, variant: PrerenderVariant = 'html'): string | null {
  if (/[:*]/.test(routePath)) return null;
  const trimmed = routePath.replace(/^\/+|\/+$/g, '');
  const file = VARIANTS[variant].file;
  return trimmed === '' ? file : `${trimmed}/${file}`;
}

/**
 * {@link ssgFilePath} for a path that came off a request, so traversal is a miss rather than a lookup.
 *
 * The first line of defence for every deploy target: a store addressed by key has no `resolve()` to
 * fall back on, so `..` has to be refused here or not at all.
 */
export function prerenderedRelPath(requestPath: string, variant: PrerenderVariant): string | null {
  if (/(^|\/)\.\.?(\/|$)/.test(requestPath)) return null;
  return ssgFilePath(requestPath, variant);
}

/**
 * A bounded, insertion-ordered cache of prerendered pages.
 *
 * Bounded so a site with thousands of prerendered pages keeps a working set rather than the whole build
 * in memory. Only *hits* are ever stored: caching misses would let anyone mint entries by requesting
 * paths that don't exist. The files are written at build time and never change while the server is up,
 * so an entry never needs invalidating.
 *
 * Shared because both targets need exactly this and had a hand-rolled copy of it, down to the same
 * eviction line.
 */
export function createPageCache(max = 128): { get(key: string): PrerenderedPage | undefined; set(key: string, page: PrerenderedPage): void } {
  const pages = new Map<string, PrerenderedPage>();
  return {
    get: (key) => pages.get(key),
    set(key, page) {
      pages.set(key, page);
      // Insertion-ordered, so the first key is the oldest. One entry in means at most one out.
      if (pages.size > max) pages.delete(pages.keys().next().value!);
    },
  };
}

/**
 * A weak `ETag` for a page body.
 *
 * Web Crypto rather than `node:crypto`, so the one implementation serves both a Node server and
 * `workerd` — the Cloudflare runtime used to carry its own copy of this, with its own base64url
 * conversion, purely because the other one reached for a Node builtin.
 *
 * Deliberately **weak**: the bytes on the wire depend on whether the client took gzip, and a strong
 * validator would have to differ between those two — so the 200 and the 304 that revalidates it would
 * disagree, and a cache would treat them as different pages. A weak tag says "the same
 * representation", which is exactly what is true across content codings.
 */
export async function weakEtag(body: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', body);
  const base64url = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `W/"${base64url.slice(0, 22)}"`;
}

/**
 * Assembles a {@link PrerenderedPage} from a body just read out of the build.
 *
 * `storeEtag` is the validator the store supplied, where it has one — it already describes these exact
 * bytes, so it is preferred over hashing them again, and only weakened. Both call sites went through
 * their own copy of this before, with two different digest implementations.
 */
export async function toPrerenderedPage(body: Uint8Array<ArrayBuffer>, storeEtag?: string | null): Promise<PrerenderedPage> {
  return {
    body,
    contentLength: String(body.byteLength),
    etag: storeEtag ? storeEtag.replace(/^(?!W\/)/, 'W/') : await weakEtag(body),
  };
}

/** A prerendered page, ready to serve: its body and a validator derived from those exact bytes. */
export interface PrerenderedPage {
  /**
   * The document or the flight payload, depending on which {@link PrerenderVariant} was read.
   *
   * Bytes rather than a string, because this is a *cache* entry served verbatim to every request that
   * hits it. Held as a string, each of those requests pays a fresh UTF-8 encode of the whole page on the
   * way out — the one route where the framework does no rendering at all was spending its time
   * re-encoding bytes it had already encoded once to measure them. Read once, encoded never.
   */
  body: Uint8Array<ArrayBuffer>;
  /**
   * `Content-Length` for {@link body}, in bytes rather than characters.
   *
   * Served with the response because Hono sets no length for an in-memory body, and a proxy or CDN in
   * front is entitled to make decisions with it — whether gzipping this response is worth the framing,
   * most obviously.
   */
  contentLength: string;
  /**
   * `ETag` for the page, so a revalidating client can be answered with a 304 instead of the body.
   *
   * Deliberately **weak**. The bytes on the wire depend on whether something in front re-encoded them,
   * and a strong validator would have to differ per coding — so the 200 and the 304 that revalidates it
   * could disagree, and a cache would treat them as different pages. A weak tag says "the same
   * representation", which is exactly what stays true across content codings.
   */
  etag: string;
}
