import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildExampleWith, startServer, stopServer } from './helpers.mjs';

// `checkOrigin: false` (turn off the CSRF origin check, e.g. behind a gateway that enforces it) is a
// config-file setting baked into the build. Its own file so the build is isolated under `--test-concurrency=1`.

const READY = /serving on http:\/\/localhost:(\d+)/;
const CONFIG = join(fileURLToPath(import.meta.url), '..', 'fixtures', 'no-check.config.mjs');

let server;
let base;

before(async () => {
  buildExampleWith(CONFIG);
  server = await startServer('start', { urlPattern: READY });
  base = `http://localhost:${server.port}`;
});

after(async () => {
  if (server) await stopServer(server.child);
});

test('checkOrigin: false disables the CSRF origin check', async () => {
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: {
      Origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
      'x-rsc-action': 'whatever',
      'content-type': 'text/plain',
    },
    body: '[]',
  });
  assert.notEqual(res.status, 403, 'with the origin check disabled, a cross-origin action must not be rejected');
});
