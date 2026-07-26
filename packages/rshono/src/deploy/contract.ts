import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { PrerenderVariant, PrerenderedPage } from '../server/prerendered.js';

/**
 * A hosting platform rshono can build for. Selected with {@link RSHonoConfig.deploy}, the
 * `--deploy` flag or the `RSHONO_DEPLOY` env var, and resolved to a preset by `deploy/presets.ts`.
 *
 * `rshono dev` always runs the `node` server whatever this says — the dev server owns the process,
 * watches both compilers and fronts them on one port, none of which a hosting platform provides.
 */
export type DeployTarget = 'node' | 'cloudflare' | 'bun' | 'deno' | 'vercel' | 'netlify' | 'aws-lambda';

/**
 * Everything the app server needs from the platform it is running on.
 *
 * One preset implements this per target, and the `@rshono/deploy` alias resolves to exactly that
 * module at build time (see `builder/rspack-config.ts`), so only the selected platform's code is
 * ever in the bundle. `runtime/entry.rsc.tsx` is written against this interface and nothing else —
 * it is the whole of what "which platform is this" means at request time.
 *
 * The split is deliberately by *capability*, not by runtime: a platform with a filesystem reuses the
 * implementations in `server/` (`static.ts`, `compress.ts`, `ssg.ts`) and only differs in how the
 * finished app is handed over.
 */
export interface DeployRuntime {
  /**
   * Hands the assembled app to the platform, and returns whatever the entry module should
   * `export default` there.
   *
   * The two shapes hosting takes, in one call: where rshono owns the process (node, bun, deno) this
   * binds a port and returns nothing; where the host owns it, it returns the export the platform
   * looks for — `{ fetch }` on Workers, a handler function on Vercel/Netlify/Lambda.
   */
  serveApp(app: Hono): unknown;
  /**
   * Mounts the hashed client bundle at `/_static`. A no-op where the platform's own CDN serves it
   * before a request ever reaches the app.
   *
   * Called *before* the app's routes, so the bundle is never shadowed by one.
   */
  mountStaticAssets(app: Hono): void;
  /**
   * Mounts the `public/` fallback at the web root — files served verbatim, and only for paths no
   * route claimed. Called *after* every route for exactly that reason.
   */
  mountPublicFallback(app: Hono): void;
  /**
   * Reads the page prerendered for `c.req.path` by `rshono build`, or `null` when there is none (in
   * which case the route renders per request, which is always a valid answer).
   *
   * Takes the whole {@link Context} rather than just the path because on a platform with no
   * filesystem the store *is* a request-scoped binding — `c.env.ASSETS` on Workers. The path is
   * untrusted either way, so an implementation has to treat traversal as a miss, not a lookup
   * (see `prerenderedRelPath`).
   */
  readPrerendered(c: Context, variant: PrerenderVariant): Promise<PrerenderedPage | null>;
  /**
   * Response compression, or `null` where the platform already compresses on the way out (and
   * doing it twice would only cost CPU) or cannot stream a compressor at all.
   *
   * Whether it is *used* is still the app's `compress` setting; this is only whether it is available.
   */
  compress: MiddlewareHandler | null;
  /** Loads `.env` files, where the platform has a filesystem to read them from. Env is bindings elsewhere. */
  loadEnv(): void;
}
