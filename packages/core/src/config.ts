import type { RspackOptions } from '@rspack/core';
import type { DeployTarget } from './deploy/contract.js';

/** Which of the two Rspack compilers the {@link RshonoConfig.rspack} hook is being called for. */
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
 *
 * @see {@link https://www.rshono.com/docs/configuration | Docs — configuration}
 */
export interface RshonoConfig {
  /**
   * The hosting platform `rshono build` targets. Default `'node'` — a long-lived server process, for
   * a VPS, a container or anywhere else you run `rshono start`.
   *
   * Overridden by the `--deploy` flag or the `RSHONO_DEPLOY` env var, so one config can still be
   * built for more than one place. `rshono dev` ignores it entirely and always runs the Node dev
   * server.
   *
   * @see {@link https://www.rshono.com/docs/deployment | Docs — deployment}
   */
  deploy?: DeployTarget;
  /**
   * The public origin the site is served from, e.g. `'https://example.com'`.
   *
   * Only used when prerendering `render: 'static'` routes: they are rendered once at build time, with
   * no request to read a `Host` from, so a page's `url` prop falls back to `http://localhost` without
   * this — and that is what its canonical tag, absolute links and `og:url` get baked with. Dynamic
   * routes resolve the URL per request and are unaffected.
   *
   * Must be a bare origin; a path is rejected rather than silently dropped.
   *
   * @see {@link https://www.rshono.com/docs/configuration#siteurl | Docs — siteUrl}
   */
  siteUrl?: string;
  /**
   * Honour `X-Forwarded-Host` / `X-Forwarded-Proto` when resolving the browser-facing request
   * URL (`getRequestContext().url`, a page's `url` prop, and the origin the CSRF check compares against).
   *
   * **Off by default, and leave it off unless a proxy you control sets those headers**: any client
   * can send them, so with nothing stripping them at the edge one request can point every absolute
   * URL the app builds at an attacker's host (and poison a shared cache). Turn it on when you
   * terminate TLS or rewrite `Host` at a reverse proxy / load balancer. Always `true` under
   * `rshono dev`, where the framework's own proxy sets them and binds to localhost. Default `false`.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-Host | MDN — X-Forwarded-Host}
   * @see {@link https://www.rshono.com/docs/configuration#proxy-headers | Docs — proxy headers}
   */
  trustProxy?: boolean;
  /**
   * CSRF origin check on server-action POSTs — rejects a cross-origin request with 403.
   * Turn off only behind a gateway that already enforces it. Default `true`.
   *
   * @see {@link https://www.rshono.com/docs/configuration#csrf | Docs — CSRF}
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
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy | MDN — Content-Security-Policy}
   * @see {@link https://www.rshono.com/docs/configuration#csp-opt-in | Docs — CSP}
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
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy#directives | MDN — CSP directives}
   */
  cspDirectives?: Record<string, string>;
  /**
   * Max server-action request body before it's rejected with 413 — a memory-exhaustion guard.
   * A number is bytes; a string carries a unit (`'512kb'`, `'4mb'`); `false` (or `0`) disables the cap.
   * Default `'1mb'`.
   *
   * @see {@link https://www.rshono.com/docs/configuration#request-body-limit | Docs — request-body limit}
   */
  bodySizeLimit?: string | number | false;
  /**
   * Escape hatch: mutate the generated Rspack config just before it's compiled. Called once per
   * compiler — inspect {@link RspackHookContext.isServer} to tell them apart. Mutate `config` in
   * place and return nothing, or return a replacement.
   *
   * @example
   * ```ts
   * rspack(config, { isServer }) {
   *   config.module?.rules?.push({ test: /\.svg$/, type: 'asset/source' });
   * }
   * ```
   *
   * @see {@link https://rspack.rs/config/ | Rspack — configuration reference}
   * @see {@link https://www.rshono.com/docs/configuration#the-rspack-hook | Docs — the rspack hook}
   */
  rspack?: (config: RspackOptions, ctx: RspackHookContext) => RspackOptions | void;
}

/**
 * Identity helper that types a config object — gives editor autocomplete without an explicit
 * annotation. Default-export the result from `rshono.config.ts`.
 *
 * @param config - The project's {@link RshonoConfig}; every field is optional.
 * @returns The config, unchanged and fully typed.
 *
 * @example
 * ```ts
 * // rshono.config.ts
 * import { defineConfig } from '@rshono/core';
 *
 * export default defineConfig({ deploy: 'cloudflare', siteUrl: 'https://example.com' });
 * ```
 *
 * @see {@link https://www.rshono.com/docs/configuration | Docs — configuration}
 */
export function defineConfig(config: RshonoConfig): RshonoConfig {
  return config;
}
