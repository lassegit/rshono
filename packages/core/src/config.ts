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
 * Deliberately small: it holds what only the *build* can decide. Everything that is a per-request
 * concern — CSRF, CSP, the body cap — is Hono middleware in `src/server.ts` instead, because Hono
 * already ships all of it and a config field would only be a worse way to spell the same call.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@rshono/core';
 *
 * export default defineConfig({
 *   deploy: 'cloudflare',
 *   siteUrl: 'https://example.com',
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
   * URL — `getRequestContext().url` and a page's `url` prop.
   *
   * Middleware in `src/server.ts` is handed Hono's `c` and so reads `c.req.url`, the *internal*
   * address, whatever this says. Hono's `csrf()` is the one to watch: behind a proxy that rewrites
   * `Host`, give it the public origin explicitly (`csrf({ origin: 'https://example.com' })`) rather
   * than leaving it to compare against an address the browser never used.
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
