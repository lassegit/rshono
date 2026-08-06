import type { Context, Hono } from 'hono';
import type { PrerenderVariant, PrerenderedPage } from '../server/prerendered.js';

/**
 * A hosting platform `rshono build` targets. Selected with `deploy` in `rshono.config.ts`, the
 * `--deploy` flag or the `RSHONO_DEPLOY` env var, and resolved to a preset by `deploy/presets.ts`.
 *
 * - `'node'` (the default) — rshono binds the port itself and you run the build with `rshono start`.
 *   Covers a VPS, a container, a PaaS, and — through `node:` compatibility — Bun and Deno.
 * - `'cloudflare'` — a Worker; the entry exports `{ fetch }`.
 * - `'vercel'` — a Vercel function, plus the on-disk layout and config file streaming needs there.
 * - `'aws-lambda'` — a streaming Lambda handler.
 *
 * One entry per *handoff* — who opens the socket, and what shape a request arrives in — because that
 * is the part an app cannot arrange for itself. There is deliberately no target whose only content
 * would be "run the Node build": Bun and Deno had one each and that is all they were, so importing
 * the bundle under those runtimes replaces them.
 *
 * `rshono dev` always runs the `node` server whatever this says — the dev server owns the process,
 * watches both compilers and fronts them on one port, none of which a hosting platform provides.
 *
 * @see {@link https://www.rshono.com/docs/deployment#the-targets | Docs — the targets}
 */
export type DeployTarget = 'node' | 'cloudflare' | 'vercel' | 'aws-lambda';

/**
 * Everything the app server needs from the platform it is running on.
 *
 * One preset implements this per target, and the `@rshono/deploy` alias resolves to exactly that
 * module at build time (see `builder/rspack-config.ts`), so only the selected platform's code is
 * ever in the bundle. `runtime/entry.rsc.tsx` is written against this interface and nothing else —
 * it is the whole of what "which platform is this" means at request time.
 *
 * The members are the capabilities that genuinely differ between a host with a disk and one without:
 * who opens the socket, who serves the assets, where a prerendered page is read from, and whether
 * there is a `.env` to load at all.
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
  /** Loads `.env` files, where the platform has a filesystem to read them from. Env is bindings elsewhere. */
  loadEnv(): void;
}
