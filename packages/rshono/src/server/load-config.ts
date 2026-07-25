import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RSHonoConfig } from '../config.js';

const CONFIG_FILES = ['rshono.config.ts', 'rshono.config.js', 'rshono.config.mjs'];

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
  const mod = (await import(pathToFileURL(file).href)) as { default?: RSHonoConfig };
  if (!mod.default) {
    throw new Error(`[rshono] ${file} must \`export default\` a config object (use \`defineConfig({ … })\`).`);
  }
  return mod.default;
}
