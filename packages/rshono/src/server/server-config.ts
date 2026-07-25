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
  /** Deadline in ms for a single page render (flight + SSR). */
  renderTimeoutMs: number;
  /** Send a strict per-request-nonce Content-Security-Policy with every HTML document. */
  cspEnabled: boolean;
  /** CSRF origin check on server-action POSTs. */
  checkOrigin: boolean;
  /** Extra origins allowed to post server actions, normalized to `URL.host` values. */
  allowedOrigins: string[];
  /** Max action-POST body in bytes before a 413; `0` disables the cap. */
  maxBodyBytes: number;
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

/** Normalize a config `allowedOrigins` entry (full origin or bare host) to a `URL.host`. */
function normalizeOrigin(entry: string): string {
  return URL.parse(entry)?.host ?? entry;
}

/** Resolve the user's {@link RSHonoConfig} into the frozen {@link ServerConfig} baked into the bundle. */
export function resolveServerConfig(config: RSHonoConfig): ServerConfig {
  return {
    renderTimeoutMs: config.renderTimeout ?? SERVER_DEFAULTS.renderTimeoutMs,
    cspEnabled: config.csp ?? false,
    checkOrigin: config.checkOrigin ?? true,
    allowedOrigins: (config.allowedOrigins ?? [])
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(normalizeOrigin),
    maxBodyBytes: parseByteSize(config.bodySizeLimit) ?? SERVER_DEFAULTS.maxBodyBytes,
    port: config.port,
    host: config.host,
  };
}
