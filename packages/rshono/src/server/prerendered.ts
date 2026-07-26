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

export const VARIANT = {
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
  const file = VARIANT[variant].file;
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

/** A prerendered page, ready to serve: its body and a validator derived from those exact bytes. */
export interface PrerenderedPage {
  /** The document or the flight payload, depending on which {@link PrerenderVariant} was read. */
  body: string;
  /**
   * `Content-Length` for {@link body}, in bytes rather than characters.
   *
   * Served with the response because Hono sets no length for an in-memory body, and without one the
   * compressor cannot tell a 300-byte page from a 300 KB one — so it gzips both, including the ones
   * where the framing costs more than it saves.
   */
  contentLength: string;
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
