import type { Context, Hono } from 'hono';
import { createPageCache, prerenderedRelPath, toPrerenderedPage, type PrerenderedPage } from '../../server/prerendered.js';
import type { DeployRuntime } from '../contract.js';

/**
 * Where `finalize` puts the prerendered pages inside the assets directory.
 *
 * A prefix of its own, rather than the pages' real URLs, is what keeps every page URL reaching the
 * worker: one URL answers with a document or a flight payload depending on `Accept`, and a CDN keyed
 * on the path alone cannot make that choice. Assets miss, the worker runs, the worker negotiates.
 *
 * The bytes are public either way — they are a public page — but they are also reachable under this
 * path, so `finalize` writes a `_headers` rule marking the tree `noindex` rather than leaving a
 * crawler to find the same page twice.
 */
const SSG_PREFIX = '/__ssg';

/** The Workers Assets binding, as much of it as this file uses. */
interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

function assetsBinding(c: Context): AssetsBinding | null {
  const binding = (c.env as { ASSETS?: AssetsBinding } | undefined)?.ASSETS;
  return binding && typeof binding.fetch === 'function' ? binding : null;
}

/**
 * Asks the assets binding for one path, or `null` when there is no binding at all — so a caller can
 * tell "this deployment serves its assets some other way" from "that file is not there".
 *
 * `headers` is passed on only where the *client's* conditional and range requests should be answered
 * by the store: forwarding an `If-None-Match` while fetching a page to serve would come back 304 with
 * no body, which is a useless answer to "give me this page".
 */
async function assetResponse(c: Context, path: string, headers?: Headers): Promise<Response | null> {
  const binding = assetsBinding(c);
  if (!binding) return null;
  // Resolved against the request so the asset request carries this deployment's own origin; only the
  // path is ever used to look one up.
  const url = new URL(path, c.req.url);
  return binding.fetch(new Request(url, { method: 'GET', headers }));
}

/**
 * Hands an asset response back as the app's own.
 *
 * Rebuilt rather than returned as-is because a `Response` that came from `fetch` has immutable
 * headers, and the framework's outermost middleware sets its baseline security headers on the way out.
 */
function serveAsset(asset: Response): Response {
  return new Response(asset.body, asset);
}

/** Prerendered pages, keyed by the path that produced them. Per isolate rather than per process. */
const pageCache = createPageCache();

/**
 * Cloudflare Workers: the host owns the process, so there is nothing to listen on; the CDN owns the
 * assets, so there is nothing to serve from disk; and there is no filesystem, so `.env` files and a
 * streaming gzip are both out.
 *
 * What is left is the assets binding, which every read here goes through.
 */
export const runtime: DeployRuntime = {
  serveApp(app: Hono): unknown {
    // What Workers looks for on the default export. `app.fetch` already takes `(request, env, ctx)`,
    // which is why bindings arrive as `c.env` — and so why `getContext().env` sees them.
    return { fetch: app.fetch };
  },

  mountStaticAssets(app: Hono): void {
    // Normally dead: with the scaffolded config the CDN answers `/_static/*` before the worker is
    // invoked at all. It exists so the deployment is still correct — if slower — under an assets
    // configuration that routes everything to the worker first.
    app.on(['GET', 'HEAD'], '/_static/*', async (c, next) => {
      const asset = await assetResponse(c, c.req.path, c.req.raw.headers);
      return asset && asset.status !== 404 ? serveAsset(asset) : next();
    });
  },

  mountPublicFallback(app: Hono): void {
    app.on(['GET', 'HEAD'], '/*', async (c, next) => {
      // The prerender tree lives in the same store; it is reachable directly from the CDN by design,
      // but the app itself only ever serves it through `readPrerendered`, negotiated on `Accept`.
      if (c.req.path.startsWith(`${SSG_PREFIX}/`)) return next();
      const asset = await assetResponse(c, c.req.path, c.req.raw.headers);
      return asset && asset.status !== 404 ? serveAsset(asset) : next();
    });
  },

  async readPrerendered(c: Context, variant): Promise<PrerenderedPage | null> {
    const relPath = prerenderedRelPath(c.req.path, variant);
    if (relPath === null) return null;

    const key = `${variant}\0${relPath}`;
    const cached = pageCache.get(key);
    if (cached) return cached;

    const asset = await assetResponse(c, `${SSG_PREFIX}/${relPath}`);
    if (!asset || asset.status !== 200) return null;

    // The store's own validator where it has one — it already describes these exact bytes.
    const page = await toPrerenderedPage(await asset.text(), asset.headers.get('etag'));
    pageCache.set(key, page);
    return page;
  },

  // Cloudflare compresses on the way out at the edge, and `workerd` has no `node:zlib` stream to do
  // it with anyway. Doing it here would only spend CPU on bytes the edge is about to re-encode.
  compress: null,

  loadEnv(): void {
    // Nothing to load: a Worker has no filesystem and no `.env`. Secrets and bindings arrive per
    // request as `c.env`, which `getContext().env` already merges — see `runtime/context.ts`.
  },
};
