import type { Hono } from 'hono';
import { handle } from 'hono/netlify';
import type { DeployRuntime } from '../contract.js';
import { fileSystemRuntime } from '../filesystem.js';

/**
 * Netlify, as one Functions v2 handler behind the CDN.
 *
 * Same division as Vercel: the publish directory holds `/_static` and `public/`, so the CDN answers
 * those and the function is only reached for a page. Prerendered pages ship inside the function and are
 * read from disk, because serving them from the CDN would lose the `Accept` negotiation that decides
 * between a document and a flight payload.
 *
 * Functions v2 streams a `Response` body, so streamed SSR survives.
 */
export const runtime: DeployRuntime = {
  ...fileSystemRuntime,

  mountStaticAssets(): void {
    // Served from the publish directory before the function runs.
  },

  serveApp(app: Hono): unknown {
    return handle(app);
  },

  // Netlify compresses at the edge.
  compress: null,
};
