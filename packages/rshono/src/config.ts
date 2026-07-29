import type { RspackOptions } from '@rspack/core';
import type { DeployTarget } from './deploy/contract.js';

/** Which of the two Rspack compilers the {@link RSHonoConfig.rspack} hook is being called for. */
export interface RspackHookContext {
  /** `true` for the server (`target: node`) bundle, `false` for the client (`target: web`) bundle. */
  isServer: boolean;
  /** `true` under `rshono dev`, `false` under `rshono build`. */
  isDev: boolean;
}

/**
 * Project configuration for rshono, default-exported from `rshono.config.ts` at the project root
 * (`.js` / `.mjs` also work). Every field is optional; omit the file entirely to accept all defaults.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@rshono/core';
 *
 * export default defineConfig({
 *   csp: true,
 *   bodySizeLimit: '4mb',
 *   allowedOrigins: ['https://admin.example.com'],
 * });
 * ```
 */
export interface RSHonoConfig {
  /**
   * The hosting platform `rshono build` targets. Default `'node'` — a long-lived server process, for
   * a VPS, a container or anywhere else you run `rshono start`.
   *
   * Overridden by the `--deploy` flag or the `RSHONO_DEPLOY` env var, so one config can still be
   * built for more than one place. `rshono dev` ignores it entirely and always runs the Node dev
   * server.
   */
  deploy?: DeployTarget;
  /**
   * The public origin the site is served from, e.g. `'https://example.com'`.
   *
   * Only used when prerendering `render: 'static'` routes. A prerendered page is one fixed file
   * handed to everyone, so any absolute URL inside it has to be decided at build time — there is no
   * request to read a `Host` from. That is what a page's `url` prop is, so without this a static
   * page bakes in `http://localhost` wherever it builds a canonical tag, an absolute link or an
   * `og:url`. Dynamic routes are unaffected: they resolve the URL per request.
   *
   * The origin is what's used; a path is rejected rather than silently dropped.
   */
  siteUrl?: string;
  /** Default port for `dev` / `start`. Overridden by the `--port` flag or the `PORT` env var. Default `3000`. */
  port?: number;
  /** Bind address for `start`. Overridden by the `HOST` env var. Default `'0.0.0.0'`. */
  host?: string;
  /**
   * Honour `X-Forwarded-Host` / `X-Forwarded-Proto` when resolving the browser-facing request
   * URL (`getContext().url`, a page's `url` prop, and the origin the CSRF check compares against).
   *
   * **Off by default, and leave it off unless a proxy you control sets those headers**, because
   * any client can send them: with it on and nothing stripping them at the edge, one request can
   * point every absolute URL your app builds at an attacker's host (and poison a shared cache).
   * Turn it on when you terminate TLS or rewrite `Host` at a reverse proxy / load balancer.
   * Always `true` under `rshono dev`, where the framework's own proxy sets them and binds to
   * localhost. Default `false`.
   */
  trustProxy?: boolean;
  /**
   * CSRF origin check on server-action POSTs — rejects a cross-origin request with 403.
   * Turn off only behind a gateway that already enforces it. Default `true`.
   */
  checkOrigin?: boolean;
  /**
   * Extra origins allowed to post server actions, in addition to the app's own origin.
   * Accepts full origins or bare hosts, e.g. `['https://admin.example.com', 'localhost:4000']`.
   */
  allowedOrigins?: string[];
  /**
   * Send a strict per-request-nonce `Content-Security-Policy` with every HTML document.
   * While enabled, `render: 'static'` routes render per request (a prerendered file can't carry a
   * per-request nonce). Default `false`.
   */
  csp?: boolean;
  /**
   * Directives merged over the built-in {@link csp} policy, which is deliberately strict
   * (`default-src 'self'`, no framing, no plugins) and so blocks third-party images, fonts and
   * API hosts until you widen it here. Set a directive to `''` to drop it entirely.
   *
   * The per-request nonce is always appended to `script-src`, whatever you put there.
   * Ignored unless `csp` is `true`.
   *
   * @example
   * ```ts
   * cspDirectives: {
   *   'img-src': "'self' data: https://images.example.com",
   *   'font-src': "'self' https://fonts.gstatic.com",
   *   'frame-ancestors': "'self'",
   * }
   * ```
   */
  cspDirectives?: Record<string, string>;
  /**
   * Max server-action request body before it's rejected with 413 — a memory-exhaustion guard.
   * A number is bytes; a string carries a unit (`'512kb'`, `'4mb'`); `false` (or `0`) disables the cap.
   * Default `'1mb'`.
   */
  bodySizeLimit?: string | number | false;
  /** Deadline in milliseconds for a single page render (flight + SSR). Default `10000`. */
  renderTimeout?: number;
  /**
   * Gzip compressible responses (HTML, flight payloads, JSON, CSS, JS). Streaming-safe — each
   * chunk the renderer flushes is flushed on the wire too. Default `true`.
   *
   * Set `false` behind a proxy or CDN that already compresses, to avoid doing the work twice.
   */
  compress?: boolean;
  /**
   * Escape hatch: mutate the generated Rspack config just before it's compiled. Called once per
   * compiler — inspect {@link RspackHookContext.isServer} to tell them apart. Mutate `config` in
   * place and return nothing, or return a replacement.
   */
  rspack?: (config: RspackOptions, ctx: RspackHookContext) => RspackOptions | void;
}

/** Identity helper that types a config object — gives editor autocomplete without an explicit annotation. */
export function defineConfig(config: RSHonoConfig): RSHonoConfig {
  return config;
}
