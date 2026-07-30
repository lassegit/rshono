import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const APPS_DIR = path.join(ROOT, 'apps');
export const RESULTS_DIR = path.join(ROOT, 'results');
export const FIXTURES = path.join(ROOT, 'fixtures', 'data.json');

/**
 * The four routes from spec/APP_SPEC.md. `checks` are text-content assertions the payload runner
 * uses to prove the three apps actually rendered the same thing — a byte count for a route that
 * 404'd or rendered an empty list is worse than no number at all.
 */
export const ROUTES = [
  { id: 'home', path: '/', kind: 'prerendered', checks: ['Benchmark Suite', 'Server Components', 'Server Actions', 'HTTP Endpoints'] },
  { id: 'ssr', path: '/ssr', kind: 'dynamic', checks: ['100 users', 'Ada Lovelace', 'admins'] },
  { id: 'interactive', path: '/interactive', kind: 'dynamic', checks: ['Counter', 'Filter', 'Sign up', 'Ada Lovelace'] },
  { id: 'api', path: '/api/health', kind: 'json', checks: ['"ok":true'] },
];

/**
 * Ports are fixed per target so a crashed run leaves a predictable socket to reclaim, and so two
 * runners never collide when one is left behind.
 */
export const TARGETS = [
  {
    id: 'rshono',
    label: 'rshono',
    dir: path.join(APPS_DIR, 'rshono'),
    port: 4101,
    build: ['npm', ['run', 'build']],
    start: ['npm', ['run', 'start']],
    dev: ['npm', ['run', 'dev']],
    // Cleared before a cold build; kept before a warm one.
    cacheDirs: ['dist', 'node_modules/.cache'],
    // What `build` produced, measured as the deployable artifact.
    artifactDirs: ['dist'],
    // The server bundle whose size drives cold start.
    serverBundle: 'dist/server/main.mjs',
    // Where hashed client assets land — used to attribute JS/CSS bytes.
    clientAssetPrefix: '/_static/',
  },
  {
    id: 'next',
    label: 'Next.js',
    dir: path.join(APPS_DIR, 'next'),
    port: 4102,
    build: ['npm', ['run', 'build']],
    start: ['npm', ['run', 'start']],
    dev: ['npm', ['run', 'dev']],
    cacheDirs: ['.next'],
    artifactDirs: ['.next'],
    serverBundle: null,
    clientAssetPrefix: '/_next/',
  },
  {
    id: 'tanstack-start',
    label: 'TanStack Start',
    dir: path.join(APPS_DIR, 'tanstack-start'),
    port: 4103,
    build: ['npm', ['run', 'build']],
    start: ['npm', ['run', 'start']],
    dev: ['npm', ['run', 'dev']],
    cacheDirs: ['.output', '.nitro', '.tanstack', 'dist', 'node_modules/.vite'],
    artifactDirs: ['dist'],
    serverBundle: 'dist/server/server.js',
    clientAssetPrefix: '/assets/',
  },
];

export function resolveTargets(argv = process.argv.slice(2)) {
  const only = argv.filter((a) => !a.startsWith('-'));
  const chosen = only.length ? TARGETS.filter((t) => only.includes(t.id)) : TARGETS;
  const missing = only.filter((id) => !TARGETS.some((t) => t.id === id));
  if (missing.length) throw new Error(`Unknown target(s): ${missing.join(', ')}. Known: ${TARGETS.map((t) => t.id).join(', ')}`);
  const notScaffolded = chosen.filter((t) => !existsSync(path.join(t.dir, 'package.json')));
  if (notScaffolded.length) throw new Error(`Not scaffolded: ${notScaffolded.map((t) => t.id).join(', ')}`);
  return chosen;
}

export function hasFlag(name, argv = process.argv.slice(2)) {
  return argv.includes(`--${name}`);
}

export function flagValue(name, fallback, argv = process.argv.slice(2)) {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
