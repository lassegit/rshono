import type { RSHonoConfig } from '../config.js';

/**
 * The framework settings the server bundle needs at request time, fully resolved
 * (defaults applied, `bodySizeLimit` parsed to bytes, origins normalized to hosts).
 *
 * The value is produced once by {@link resolveServerConfig} from `rshono.config.ts`
 * and compiled into the server bundle as the `__RSHONO_CONFIG__` literal (see
 * `builder/rspack-config.ts`) — there is no runtime env-var interface for these.
 */
export interface ServerConfig {
  /**
   * `true` when the bundle came from `rshono dev`.
   *
   * Baked in rather than read from `process.env.NODE_ENV` at runtime: it is decided by which command
   * produced the bundle, and a deploy target need not have a `process` to read it from.
   */
  isDev: boolean;
  /** Deadline in ms for a single request (server action + flight + SSR). */
  renderTimeoutMs: number;
  /** Honour `X-Forwarded-Host` / `-Proto` when resolving the browser-facing URL. Forced on in dev. */
  trustProxy: boolean;
  /** Send a strict per-request-nonce Content-Security-Policy with every HTML document. */
  cspEnabled: boolean;
  /** The resolved CSP directives (built-in defaults with the user's merged over them), minus the nonce. */
  cspDirectives: Record<string, string>;
  /** CSRF origin check on server-action POSTs. */
  checkOrigin: boolean;
  /** Extra origins allowed to post server actions, normalized to lowercase `URL.host` values. */
  allowedOrigins: string[];
  /** Max request body in bytes before a 413; `0` disables the cap. */
  maxBodyBytes: number;
  /** Gzip compressible responses on the way out. */
  compress: boolean;
  /** Default listen port for `start` (overridden by `PORT`). */
  port?: number;
  /** Default bind address for `start` (overridden by `HOST`). */
  host?: string;
}

/** The single source of truth for the framework's built-in defaults. */
export const SERVER_DEFAULTS = {
  renderTimeoutMs: 10_000,
  maxBodyBytes: 1024 * 1024, // 1 MiB, matching Next.js's server-action body-size limit.
  port: 3000,
  host: '0.0.0.0',
} as const;

/**
 * The built-in {@link RSHonoConfig.csp} policy, keyed by directive so
 * {@link RSHonoConfig.cspDirectives} can override entries individually.
 *
 * `script-src` carries the per-request nonce, appended at request time (see `entry.rsc.tsx`).
 * `style-src` needs `'unsafe-inline'` because React writes inline styles.
 */
export const CSP_DEFAULTS: Record<string, string> = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data:",
  'connect-src': "'self'",
  // Not covered by default-src, and each closes an injection route of its own: a stray <base>
  // retargeting every relative URL, plugin content, framing (clickjacking), off-site form posts.
  'base-uri': "'self'",
  'object-src': "'none'",
  'frame-ancestors': "'none'",
  'form-action': "'self'",
};

const UNITS: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };

/** Parse a {@link RSHonoConfig.bodySizeLimit} value into a byte count (`false`/`0` → `0`, disabling the cap). */
export function parseByteSize(value: string | number | false | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (value === false) return 0;
  if (typeof value === 'number') return value;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?\s*$/i.exec(value);
  if (!match) {
    throw new Error(`[rshono] invalid bodySizeLimit ${JSON.stringify(value)} — use e.g. '1mb', 1048576, or false.`);
  }
  return Math.floor(Number(match[1]) * UNITS[(match[2] ?? 'b').toLowerCase()]);
}

/**
 * Normalize a config `allowedOrigins` entry (full origin or bare host) to a lowercase `URL.host`,
 * ready for a direct comparison against a parsed `Origin` header's host.
 *
 * A bare `host:port` has to be retried against a base, because on its own `'localhost:4000'`
 * parses as the *scheme* `localhost:` with path `4000` — leaving an empty host that would
 * silently never match anything. Throws rather than passing a junk entry through, so a typo
 * fails the build instead of quietly disabling the allowlist entry it was meant to add.
 */
function normalizeOrigin(entry: string): string {
  const host = URL.parse(entry)?.host || URL.parse(`http://${entry}`)?.host;
  if (!host) {
    throw new Error(
      `[rshono] invalid allowedOrigins entry ${JSON.stringify(entry)} — use a full origin ('https://admin.example.com') or a bare host ('localhost:4000').`,
    );
  }
  return host.toLowerCase();
}

/** Drop directives the user blanked out, so `cspDirectives: { 'frame-ancestors': '' }` removes one. */
function resolveCspDirectives(overrides: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries({ ...CSP_DEFAULTS, ...overrides }).filter(([, value]) => value.trim() !== ''));
}

/**
 * Resolve the user's {@link RSHonoConfig} into the {@link ServerConfig} baked into the bundle.
 *
 * `isDev` is a build-time input rather than a config field because it decides one thing the user
 * shouldn't have to: `trustProxy` is forced on under `rshono dev`, where the framework's own proxy
 * is the only way in (it sets the forwarded headers itself and binds to localhost).
 */
export function resolveServerConfig(config: RSHonoConfig, { isDev }: { isDev: boolean }): ServerConfig {
  return {
    isDev,
    renderTimeoutMs: config.renderTimeout ?? SERVER_DEFAULTS.renderTimeoutMs,
    trustProxy: isDev || (config.trustProxy ?? false),
    cspEnabled: config.csp ?? false,
    cspDirectives: resolveCspDirectives(config.cspDirectives),
    checkOrigin: config.checkOrigin ?? true,
    allowedOrigins: (config.allowedOrigins ?? [])
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(normalizeOrigin),
    maxBodyBytes: parseByteSize(config.bodySizeLimit) ?? SERVER_DEFAULTS.maxBodyBytes,
    compress: config.compress ?? true,
    port: config.port,
    host: config.host,
  };
}
