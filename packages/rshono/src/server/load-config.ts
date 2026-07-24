import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RSHonoConfig } from '../config.js';

const CONFIG_FILES = ['rshono.config.ts', 'rshono.config.js', 'rshono.config.mjs'];

/** Load `rshono.config.{ts,js,mjs}` from the project root, or `{}` if none exists. */
export async function loadConfig(rootDir: string): Promise<RSHonoConfig> {
  const file = CONFIG_FILES.map((f) => join(rootDir, f)).find(existsSync);
  if (!file) return {};
  const mod = (await import(pathToFileURL(file).href)) as { default?: RSHonoConfig };
  if (!mod.default) {
    throw new Error(`[rshono] ${file} must \`export default\` a config object (use \`defineConfig({ … })\`).`);
  }
  return mod.default;
}

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
 * Translate the runtime options into the env vars the server bundle reads at startup (the bundle runs
 * in a worker/child that inherits `process.env`). A var that's already set is left untouched, so an
 * explicit env var (a deploy override, a test) always wins over the config file.
 */
export function applyConfigToEnv(config: RSHonoConfig, env: Record<string, string | undefined> = process.env): void {
  const setDefault = (key: string, value: string | undefined) => {
    if (value !== undefined && env[key] === undefined) env[key] = value;
  };

  if (config.port !== undefined) setDefault('PORT', String(config.port));
  setDefault('HOST', config.host);
  if (config.checkOrigin === false) setDefault('RSC_HONO_CHECK_ORIGIN', '0');
  if (config.allowedOrigins?.length) setDefault('RSC_HONO_ALLOWED_ORIGINS', config.allowedOrigins.join(','));
  if (config.csp) setDefault('RSC_HONO_CSP', '1');
  const maxBody = parseByteSize(config.bodySizeLimit);
  if (maxBody !== undefined) setDefault('RSC_HONO_MAX_BODY_BYTES', String(maxBody));
  if (config.renderTimeout !== undefined) setDefault('RSC_HONO_RENDER_TIMEOUT_MS', String(config.renderTimeout));
}
