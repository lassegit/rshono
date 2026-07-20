/**
 * Test helpers: drive the real CLI against examples/rsc-basic (the
 * designated feature-complete test app, per AGENTS.md). No test-only
 * frameworks — node:test + fetch + child processes.
 */
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
export const EXAMPLE_DIR = join(ROOT, 'examples', 'rs-basic');
export const EXAMPLE_DIST = join(EXAMPLE_DIR, 'dist');
const CLI = join(ROOT, 'packages', 'rshono', 'bin', 'cli.cjs');

/** Run `rshono build` in the example app; throws on failure. */
export function buildExample() {
  const result = spawnSync(process.execPath, [CLI, 'build'], {
    cwd: EXAMPLE_DIR,
    encoding: 'utf8',
    timeout: 180_000,
  });
  if (result.status !== 0) {
    throw new Error(`build failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Spawn a CLI command and resolve with { child, port, output } once its
 * stdout matches urlPattern (which must capture the port as group 1).
 */
export function startServer(command, { env = {}, urlPattern, timeoutMs = 60_000 }) {
  const child = spawn(process.execPath, [CLI, command], {
    cwd: EXAMPLE_DIR,
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

/** Parse the progressive-enhancement $ACTION_* fields out of a page's HTML form. */
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
