import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
export const EXAMPLE_DIR = join(ROOT, 'examples', 'rs-basic');
export const EXAMPLE_DIST = join(EXAMPLE_DIR, 'dist');
/** The smallest app the framework accepts: src/routes.ts and nothing else. */
export const MINIMAL_APP_DIR = join(ROOT, 'packages', 'rshono', 'test', 'fixtures', 'minimal-app');
const CLI = join(ROOT, 'packages', 'rshono', 'bin', 'rshono.mjs');

/** The pattern `rshono start` prints once it is listening; the capture group is the port. */
export const START_READY = /serving on http:\/\/localhost:(\d+)/;

export function buildExample() {
  return buildExampleWith();
}

/**
 * Build the example, optionally with an explicit config file (absolute path) via `--config`.
 * Config now bakes into the bundle at build time, so exercising a non-default setting (CSP,
 * body limit, CSRF allowlist) means building with a fixture config rather than setting an env var.
 */
export function buildExampleWith(configPath) {
  return buildApp(EXAMPLE_DIR, configPath);
}

/** Build any app directory with the real CLI, the way a user would. */
export function buildApp(dir, configPath) {
  const args = [CLI, 'build', ...(configPath ? ['--config', configPath] : [])];
  const result = spawnSync(process.execPath, args, {
    cwd: dir,
    encoding: 'utf8',
    timeout: 180_000,
  });
  if (result.status !== 0) {
    throw new Error(`build failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

export function startServer(command, options) {
  return startApp(EXAMPLE_DIR, command, options);
}

export function startApp(dir, command, { env = {}, urlPattern, timeoutMs = 60_000 }) {
  const child = spawn(process.execPath, [CLI, command], {
    cwd: dir,
    env: { ...process.env, PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const collect = (chunk) => {
    output += chunk;
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`server did not report ready within ${timeoutMs / 1000}s:\n${output}`));
    }, timeoutMs);
    const check = () => {
      const match = output.match(urlPattern);
      if (match) {
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]), getOutput: () => output });
      }
    };
    child.stdout.on('data', check);
    child.stderr.on('data', check);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (${code}):\n${output}`));
    });
  });
}

export function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.on('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 3000).unref();
  });
}

export function parseActionForm(html) {
  const unescape = (s) => s.replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  const field = (name) => {
    const match = html.match(new RegExp(`name="\\${name}" value="([^"]*)"`));
    return match ? unescape(match[1]) : undefined;
  };
  return {
    ref: field('$ACTION_REF_1'),
    meta: field('$ACTION_1:0'),
    bound: field('$ACTION_1:1'),
    key: field('$ACTION_KEY'),
  };
}
