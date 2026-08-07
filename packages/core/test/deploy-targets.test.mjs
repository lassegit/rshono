// The two serverless targets, built for real and then called the way their platform calls them.
//
// What is unique per target is the handoff (what the entry's default export has to be) and the output
// layout a `finalize` hook assembles — so that is what this asserts. The request handling underneath is
// the same code the Node and Workers suites already cover end to end.
//
// `node` and `cloudflare` are not here: they have suites of their own. Bun and Deno have no preset —
// they run the `node` build — and asserting on its export shape under Node would prove nothing about
// either runtime.
//
// One build per target, so this is a slow file. Nothing else depends on it.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, describe, test } from 'node:test';
import { buildApp, importServerBundle, TESTBED_DIR, TESTBED_DIST } from './helpers.mjs';

const ORIGIN = 'https://rshono.example';

/** Builds the testbed for one target and returns its bundle, freshly evaluated. */
async function buildFor(target) {
  buildApp(TESTBED_DIR, { args: ['--deploy', target] });
  // The target names the cache key, so each build is a distinct module rather than the previous one.
  return importServerBundle(target);
}

/** What `rshono build` recorded about the build now on disk — what `rshono start` reads to refuse one. */
function buildMarker() {
  return JSON.parse(readFileSync(join(TESTBED_DIST, 'rshono-build.json'), 'utf8'));
}

/** Drives a web-standard handler — the shape Vercel and any `fetch`-based host invoke. */
async function requestVia(handler, path) {
  const res = await handler(new Request(`${ORIGIN}${path}`));
  return { res, body: await res.text() };
}

describe('vercel', () => {
  let bundle;
  const output = join(TESTBED_DIR, '.vercel', 'output');
  const functionDir = join(output, 'functions', 'index.func');

  before(async () => {
    bundle = await buildFor('vercel');
  });

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

describe('aws-lambda', () => {
  let bundle;

  before(async () => {
    // The Lambda runtime injects this global; `streamHandle` builds its handler out of it, and the
    // module deliberately exports nothing when it is absent so the build's prerender pass still works.
    globalThis.awslambda = { streamifyResponse: (fn) => fn, HttpResponseStream: { from: (stream) => stream } };
    bundle = await buildFor('aws-lambda');
  });

  test('exports a streaming handler when the runtime globals are present', () => {
    assert.equal(buildMarker().deploy, 'aws-lambda');
    assert.equal(typeof bundle.default, 'function', 'streamifyResponse-wrapped, so SSR still streams');
  });
});
