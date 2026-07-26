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
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { before, describe, test } from 'node:test';
import { buildApp, EXAMPLE_DIR, EXAMPLE_DIST } from './helpers.mjs';

const ORIGIN = 'https://rshono.example';
const SERVER_BUNDLE = join(EXAMPLE_DIST, 'server', 'main.mjs');

/** Builds the example for one target and returns its bundle, freshly evaluated. */
async function buildFor(target) {
  const stdout = buildApp(EXAMPLE_DIR, undefined, ['--deploy', target]);
  // A distinct query per target: the module cache would otherwise hand back the previous build.
  const bundle = await import(`${SERVER_BUNDLE}?${target}`);
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

  test('exports what Bun serves: a fetch handler and the address to bind', async () => {
    assert.equal(buildMarker().deploy, 'bun');
    assert.equal(typeof bundle.default.fetch, 'function');
    assert.equal(typeof bundle.default.port, 'number', 'Bun reads the port off the default export');
    assert.equal(typeof bundle.default.hostname, 'string');
  });

  test('renders through that handler', async () => {
    const { res, body } = await requestVia(bundle.default.fetch, '/');
    assert.equal(res.status, 200);
    assert.ok(body.startsWith('<!DOCTYPE html>'));
  });
});

describe('deno', () => {
  let bundle;
  before(async () => ({ bundle } = await buildFor('deno')));

  test('exports a fetch handler, which is what `deno serve` and Deno Deploy both look for', () => {
    assert.equal(buildMarker().deploy, 'deno');
    assert.equal(typeof bundle.default.fetch, 'function');
  });

  test('serves a prerendered page from disk, through Deno node compatibility', async () => {
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

describe('lambda-edge', () => {
  let bundle;
  before(async () => ({ bundle } = await buildFor('lambda-edge')));

  /** A CloudFront origin-request event — the only event type with room for a page-sized response. */
  const originRequest = (uri) => ({
    Records: [
      {
        cf: {
          config: { distributionDomainName: 'd.cloudfront.net', distributionId: 'E1', eventType: 'origin-request', requestId: 'r1' },
          request: { clientIp: '203.0.113.1', headers: { host: [{ key: 'host', value: 'rshono.example' }] }, method: 'GET', querystring: '', uri },
        },
      },
    ],
  });

  test('answers a CloudFront event with a buffered document', async () => {
    assert.equal(buildMarker().deploy, 'lambda-edge');
    const result = await bundle.default(originRequest('/'));
    assert.equal(result.status, '200', 'CloudFront reports status as a string');
    assert.ok(result.body.startsWith('<!DOCTYPE html>'), 'the whole document, in the event result — no streaming here');
  });

  // Runs here because the build left behind is for a platform: a bundle whose entry hands a handler to
  // its host has no listener, so starting it would exit silently the moment the module finished.
  test('`rshono start` refuses this build instead of starting nothing', () => {
    const cli = fileURLToPath(new URL('../bin/rshono.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [cli, 'start'], { cwd: EXAMPLE_DIR, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /targets lambda-edge/);
    assert.match(result.stderr, /--deploy node/, 'says how to get a build it can run');
  });
});
