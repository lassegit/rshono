/**
 * Shared pieces of the two `llms.txt` endpoints. Not an endpoint itself — an
 * `{ type: 'endpoint' }` module must export exactly one `handler`, so the index and the full corpus
 * are a file each and this is what they have in common.
 */

export const SUMMARY =
  'rshono is a minimalist web framework built on Hono, Rspack and React Server Components. ' +
  'One required file (src/routes.ts), one optional file (src/server.ts), and you get a dev server with HMR, ' +
  'streaming SSR with RSC hydration, server actions with progressive enhancement, soft navigation, ' +
  'build-time prerendering, and hard env/secret safety.';

/**
 * The origin to build absolute links against.
 *
 * Read off the request rather than from `siteUrl`, because these are dynamic endpoints and there is a
 * real request to read — which also means the file is correct under `rshono dev`, where a baked-in
 * `siteUrl` would send a reader to production.
 */
export function origin(requestUrl: string): string {
  return new URL(requestUrl).origin;
}

/** Both endpoints serve plain markdown, cached like the prerendered pages they mirror. */
export const MARKDOWN_HEADERS = {
  'Content-Type': 'text/markdown; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
} as const;
