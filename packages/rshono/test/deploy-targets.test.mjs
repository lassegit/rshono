// Every non-Node deploy target, built for real and then called the way its platform calls it.
//
// What is unique per target is the handoff (what the entry's default export has to be) and the output
// layout a `finalize` hook assembles — so that is what this asserts. The request handling underneath is
// the same code the Node and Workers suites already cover end to end.
//
// One build per target, so this is the slowest file in the suite. Move it behind its own script if that
// becomes a problem; nothing else depends on it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { before, describe, test } from 'node:test';
import { buildApp, EXAMPLE_DIR, EXAMPLE_DIST, importServerBundle } from './helpers.mjs';

const ORIGIN = 'https://rshono.example';
const CLI = fileURLToPath(new URL('../bin/rshono.mjs', import.meta.url));

/** Builds the example for one target and returns its bundle, freshly evaluated. */
async function buildFor(target) {
  const stdout = buildApp(EXAMPLE_DIR, { args: ['--deploy', target] });
  // The target names the cache key, so each build is a distinct module rather than the previous one.
  const bundle = await importServerBundle(target);
  return { stdout, bundle };
}

/** What `rshono build` recorded about the build now on disk — what `rshono start` reads to refuse one. */
function buildMarker() {
  return JSON.parse(readFileSync(join(EXAMPLE_DIST, 'rshono-build.json'), 'utf8'));
}

/** Drives a web-standard handler — the shape Vercel, Netlify and any `fetch`-based host invoke. */
async function requestVia(handler, path) {
  const res = await handler(new Request(`${ORIGIN}${path}`));
  return { res, body: await res.text() };
}

describe('bun', () => {
  let bundle;
  before(async () => ({ bundle } = await buildFor('bun')));

  test('exports what Bun serves — a fetch handler and the address to bind — and renders through it', async () => {
    assert.equal(buildMarker().deploy, 'bun');
    assert.equal(typeof bundle.default.port, 'number', 'Bun reads the port off the default export');
    assert.equal(typeof bundle.default.hostname, 'string');
    const { res, body } = await requestVia(bundle.default.fetch, '/');
    assert.equal(res.status, 200);
    assert.ok(body.startsWith('<!DOCTYPE html>'));
  });
});

describe('deno', () => {
  let bundle;
  before(async () => ({ bundle } = await buildFor('deno')));

  test('serves a prerendered page from disk through the fetch handler `deno serve` looks for', async () => {
    assert.equal(buildMarker().deploy, 'deno');
    const { res, body } = await requestVia(bundle.default.fetch, '/docs/getting-started');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=300', 'came from the prerender, not a render');
    assert.ok(body.startsWith('<!DOCTYPE html>'));
  });
});

describe('vercel', () => {
  let bundle;
  const output = join(EXAMPLE_DIR, '.vercel', 'output');
  const functionDir = join(output, 'functions', 'index.func');

  before(async () => ({ bundle } = await buildFor('vercel')));

  test('exports a web handler and renders through it', async () => {
    assert.equal(buildMarker().deploy, 'vercel');
    assert.equal(typeof bundle.default, 'function');
    const { res, body } = await requestVia(bundle.default, '/');
    assert.equal(res.status, 200);
    assert.ok(body.startsWith('<!DOCTYPE html>'));
  });

  test('splits the build the way the platform routes it', () => {
    assert.ok(existsSync(join(output, 'static', '_static', 'chunks')), 'hashed bundle is CDN-served');
    assert.ok(existsSync(join(output, 'static', 'robots.txt')), 'public/ is CDN-served at the web root');
    // Not in static output on purpose: one URL answers with a document or a flight payload depending on
    // `Accept`, which a path-keyed CDN cannot choose between.
    assert.equal(existsSync(join(output, 'static', 'docs')), false, 'prerendered pages are not CDN-served');
    assert.ok(existsSync(join(functionDir, 'dist', 'ssg', 'docs')), 'they ship inside the function instead');
  });

  test('keeps the bundle at the path its runtime derives the project root from', () => {
    assert.ok(existsSync(join(functionDir, 'dist', 'server', 'main.mjs')));
    const config = JSON.parse(readFileSync(join(functionDir, '.vc-config.json'), 'utf8'));
    assert.equal(config.handler, 'dist/server/main.mjs');
    assert.equal(config.launcherType, 'Nodejs');
    assert.equal(config.supportsResponseStreaming, true, 'buffering would undo streamed SSR');
  });

  test('routes assets before the function, and everything else to it', () => {
    const { version, routes } = JSON.parse(readFileSync(join(output, 'config.json'), 'utf8'));
    assert.equal(version, 3);
    const immutable = routes.find((route) => route.headers?.['cache-control']?.includes('immutable'));
    assert.match(immutable.src, /_static/, 'the one header the CDN cannot infer');
    assert.ok(routes.indexOf(routes.find((r) => r.handle === 'filesystem')) < routes.length - 1);
    assert.deepEqual(routes.at(-1), { src: '/(.*)', dest: '/index' }, 'the app is the fallback');
  });
});

describe('netlify', () => {
  let bundle;
  const publishDir = join(EXAMPLE_DIR, '.netlify', 'publish');
  const functionsDir = join(EXAMPLE_DIR, '.netlify', 'functions-internal');

  before(async () => ({ bundle } = await buildFor('netlify')));

  test('exports a web handler and renders through it', async () => {
    assert.equal(buildMarker().deploy, 'netlify');
    assert.equal(typeof bundle.default, 'function');
    const { res, body } = await requestVia(bundle.default, '/');
    assert.equal(res.status, 200);
    assert.ok(body.startsWith('<!DOCTYPE html>'));
  });

  test('publishes the assets and keeps the prerender tree in the function', () => {
    assert.ok(existsSync(join(publishDir, '_static', 'chunks')));
    assert.ok(existsSync(join(publishDir, 'robots.txt')));
    assert.match(readFileSync(join(publishDir, '_headers'), 'utf8'), /immutable/);
    assert.ok(existsSync(join(functionsDir, 'dist', 'ssg', 'docs')));
    assert.ok(existsSync(join(functionsDir, 'dist', 'server', 'main.mjs')));
  });

  test('declares its routing in the function, so the project needs no redirect rule', () => {
    const entry = readFileSync(join(functionsDir, 'rshono-server.mjs'), 'utf8');
    assert.match(entry, /path:\s*'\/\*'/, 'claims every path');
    assert.match(entry, /preferStatic:\s*true/, 'a published file still wins, so assets skip the function');
  });
});

describe('aws-lambda', () => {
  let bundle;

  before(async () => {
    // The Lambda runtime injects this global; `streamHandle` builds its handler out of it, and the
    // module deliberately exports nothing when it is absent so the build's prerender pass still works.
    globalThis.awslambda = { streamifyResponse: (fn) => fn, HttpResponseStream: { from: (stream) => stream } };
    ({ bundle } = await buildFor('aws-lambda'));
  });

  test('exports a streaming handler when the runtime globals are present', () => {
    assert.equal(buildMarker().deploy, 'aws-lambda');
    assert.equal(typeof bundle.default, 'function', 'streamifyResponse-wrapped, so SSR still streams');
  });
});

// Last, so the build on disk is the aws-lambda one: `start` has to refuse it rather than run it.
describe('`rshono start` refuses what it cannot run', () => {
  const start = (cwd) => spawnSync(process.execPath, [CLI, 'start'], { cwd, encoding: 'utf8', timeout: 30_000 });

  test('a build made for a platform, which has no listener in it and would exit silently', () => {
    const result = start(EXAMPLE_DIR);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /targets aws-lambda/);
    assert.match(result.stderr, /--deploy node/, 'says how to get a build it can run');
  });

  test('no build at all, naming the command that makes one', () => {
    const result = start(mkdtempSync(join(tmpdir(), 'rshono-unbuilt-')));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no production build found/);
    assert.match(result.stderr, /rshono build/);
  });
});
