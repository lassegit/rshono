import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
export const EXAMPLE_DIR = join(ROOT, 'examples', 'rs-basic');
export const EXAMPLE_DIST = join(EXAMPLE_DIR, 'dist');
export const FIXTURES_DIR = join(ROOT, 'packages', 'rshono', 'test', 'fixtures');
/** The smallest app the framework accepts: src/routes.ts and nothing else. */
export const MINIMAL_APP_DIR = join(FIXTURES_DIR, 'minimal-app');
const CLI = join(ROOT, 'packages', 'rshono', 'bin', 'rshono.mjs');

/** What each command prints once it is listening; the capture group is the port. */
const READY = {
  start: /serving on http:\/\/localhost:(\d+)/,
  dev: /dev server: http:\/\/localhost:(\d+)/,
};

/**
 * The environment the example is built and served with. It lives here rather than in the example's
 * `.env`, because `.env*` is gitignored: a suite that asserts on these values has to carry them
 * itself or it passes locally and fails on a fresh checkout. The real environment wins over a
 * `.env` file, so this also pins the values against whatever a contributor happens to have there.
 */
export const APP_ENV = {
  /** Secret — asserted never to reach the browser, in the HTML, the flight payload or a chunk. */
  DATABASE_URL: 'my private database url',
  /** `PUBLIC_`-prefixed — asserted to be inlined into the client bundle and visible via `ctx.env`. */
  PUBLIC_API_ENDPOINT: 'public dummy url',
};

/**
 * Build any app directory with the real CLI, the way a user would. `config` is an absolute path to a
 * fixture config: config bakes into the bundle at build time, so exercising a non-default setting
 * (CSP, body limit, CSRF allowlist) means building with one rather than setting an env var.
 */
export function buildApp(dir, { config, args = [] } = {}) {
  const result = spawnSync(process.execPath, [CLI, 'build', ...(config ? ['--config', config] : []), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...APP_ENV },
    timeout: 180_000,
  });
  if (result.status !== 0) {
    throw new Error(`build failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

export function buildExample(config) {
  return buildApp(EXAMPLE_DIR, { config });
}

/** Runs `rshono <command>` in `dir` and resolves once it reports the address it is listening on. */
export function startApp(dir, command, { env = {}, timeoutMs = 60_000 } = {}) {
  const ready = READY[command];
  if (!ready) throw new Error(`no ready pattern for \`rshono ${command}\` — it would resolve on any output`);
  const child = spawn(process.execPath, [CLI, command], {
    cwd: dir,
    env: { ...process.env, PORT: '0', ...APP_ENV, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`server did not report ready within ${timeoutMs / 1000}s:\n${output}`));
    }, timeoutMs);
    const onData = (chunk) => {
      output += chunk;
      const match = output.match(ready);
      if (match) {
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]), base: `http://localhost:${match[1]}`, getOutput: () => output });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (${code}):\n${output}`));
    });
  });
}

export function startExample(command, options) {
  return startApp(EXAMPLE_DIR, command, options);
}

export function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.on('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 3000).unref();
  });
}

/** The built browser bundle's sources — the only way to assert what did, and did not, ship to it. */
export function clientChunks() {
  const dir = join(EXAMPLE_DIST, 'static', 'chunks');
  return readdirSync(dir).map((file) => readFileSync(join(dir, file), 'utf8'));
}

/**
 * The body a browser would POST for a form React rendered, with no JavaScript involved. React emits
 * one of two field shapes: the `$ACTION_REF`/`$ACTION_KEY` set for a `useActionState` form, or a
 * single `$ACTION_ID_<id>` when a server component renders the form itself.
 */
export function actionFormData(html, fields = {}) {
  const form = new FormData();
  const hidden = (name) => {
    const match = html.match(new RegExp(`name="\\${name}" value="([^"]*)"`));
    return match ? match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&') : undefined;
  };

  const meta = hidden('$ACTION_1:0');
  const key = hidden('$ACTION_KEY');
  const id = html.match(/name="(\$ACTION_ID_[0-9a-f]+)"/)?.[1];
  if (meta && key) {
    form.set('$ACTION_REF_1', hidden('$ACTION_REF_1') ?? '');
    form.set('$ACTION_1:0', meta);
    form.set('$ACTION_1:1', hidden('$ACTION_1:1') ?? '[{}]');
    form.set('$ACTION_KEY', key);
  } else if (id) {
    form.set(id, '');
  } else {
    throw new Error('the rendered form carries no $ACTION fields, so it cannot be submitted');
  }

  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}
