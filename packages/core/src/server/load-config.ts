import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RSHonoConfig } from '../config.js';

const CONFIG_FILES = ['rshono.config.ts', 'rshono.config.js', 'rshono.config.mjs'];

/**
 * Imports the config module.
 *
 * A `.js`/`.mjs` config is a plain dynamic import. A `.ts` one can't be — the CLI itself runs as
 * compiled JavaScript, so nothing in the process understands TypeScript by default. `tsx`'s
 * programmatic API is loaded for that case only, which keeps it off the startup path of every
 * other command instead of paying for a TypeScript loader the whole CLI doesn't need.
 */
async function importConfig(file: string): Promise<{ default?: RSHonoConfig }> {
  const href = pathToFileURL(file).href;
  if (!/\.[cm]?ts$/.test(file)) return import(href) as Promise<{ default?: RSHonoConfig }>;
  const { tsImport } = await import('tsx/esm/api');
  return tsImport(href, import.meta.url) as Promise<{ default?: RSHonoConfig }>;
}

/**
 * Load the project config, or `{}` if none exists. Scans `rshono.config.{ts,js,mjs}` at
 * {@link rootDir} unless an explicit {@link configPath} is given (resolved relative to `cwd`).
 */
export async function loadConfig(rootDir: string, configPath?: string): Promise<RSHonoConfig> {
  const file = configPath
    ? isAbsolute(configPath)
      ? configPath
      : resolve(process.cwd(), configPath)
    : CONFIG_FILES.map((f) => join(rootDir, f)).find(existsSync);
  if (!file) return {};
  if (!existsSync(file)) {
    throw new Error(`[rshono] config file not found: ${file}`);
  }
  const mod = await importConfig(file);
  if (!mod.default) {
    throw new Error(`[rshono] ${file} must \`export default\` a config object (use \`defineConfig({ … })\`).`);
  }
  return mod.default;
}
