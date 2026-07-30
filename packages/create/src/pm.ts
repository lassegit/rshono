import { spawnSync } from 'node:child_process';
import { PACKAGE_MANAGERS, type PackageManagerName } from './options.js';

export interface PackageManager {
  name: PackageManagerName;
  /** The exact version, when the environment told us — written into `packageManager` for Corepack. */
  version?: string;
  /** Argv for a full install in the project directory. */
  install: string[];
  /** What precedes a script name: `pnpm dev`, but `npm run dev`. */
  run: string;
}

const INSTALL: Record<PackageManagerName, string[]> = {
  npm: ['install'],
  pnpm: ['install'],
  yarn: [],
  bun: ['install'],
};

const RUN: Record<PackageManagerName, string> = {
  npm: 'npm run',
  pnpm: 'pnpm',
  yarn: 'yarn',
  bun: 'bun',
};

function isKnown(name: string): name is PackageManagerName {
  return PACKAGE_MANAGERS.includes(name as PackageManagerName);
}

export function packageManager(name: PackageManagerName, version?: string): PackageManager {
  return { name, version, install: INSTALL[name], run: RUN[name] };
}

/**
 * Which package manager invoked us. Every one of them sets `npm_config_user_agent` for the process it
 * spawns, from its runner as much as from `create` — `pnpm/11.9.0 npm/? node/v22.14.0 darwin arm64` — so
 * `pnx @rshono/create` scaffolds a pnpm project without asking, and the exact version comes along for the
 * `packageManager` field.
 *
 * Falls back to npm, which is also what a bare `node bin/create-rshono.mjs` gets.
 */
export function detectPackageManager(userAgent = process.env.npm_config_user_agent): PackageManager {
  const [spec] = (userAgent ?? '').split(' ');
  const [name, version] = (spec ?? '').split('/');
  if (name && isKnown(name)) return packageManager(name, version && /^\d+\.\d+\.\d+/.test(version) ? version : undefined);
  return packageManager('npm');
}

/**
 * Runs the install, streaming its output. `shell: true` on Windows because npm, pnpm and yarn are all
 * `.cmd` shims there, which `spawn` cannot execute directly — and with a shell involved the arguments
 * are all fixed strings from the tables above, never anything the user typed.
 */
export function runInstall(pm: PackageManager, cwd: string): boolean {
  return run(pm, pm.install, cwd);
}

/** `<pm> run <script>` — the one form every package manager accepts, Yarn v1 included. */
export function runScript(pm: PackageManager, script: string, cwd: string): boolean {
  return run(pm, ['run', script], cwd);
}

function run(pm: PackageManager, args: string[], cwd: string): boolean {
  const result = spawnSync(pm.name, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  return result.status === 0;
}
