import type { RspackOptions } from '@rspack/core';

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
 * import { defineConfig } from 'rshono';
 *
 * export default defineConfig({
 *   csp: true,
 *   bodySizeLimit: '4mb',
 *   allowedOrigins: ['https://admin.example.com'],
 * });
 * ```
 */
export interface RSHonoConfig {
  /** Default port for `dev` / `start`. Overridden by the `--port` flag or the `PORT` env var. Default `3000`. */
  port?: number;
  /** Bind address for `start`. Overridden by the `HOST` env var. Default `'0.0.0.0'`. */
  host?: string;
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
   * While enabled, `kind: 'static'` routes render per request (a prerendered file can't carry a
   * per-request nonce). Default `false`.
   */
  csp?: boolean;
  /**
   * Max server-action request body before it's rejected with 413 — a memory-exhaustion guard.
   * A number is bytes; a string carries a unit (`'512kb'`, `'4mb'`); `false` (or `0`) disables the cap.
   * Default `'1mb'`.
   */
  bodySizeLimit?: string | number | false;
  /** Deadline in milliseconds for a single page render (flight + SSR). Default `10000`. */
  renderTimeout?: number;
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
