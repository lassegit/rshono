import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildExampleWith, startServer, stopServer } from './helpers.mjs';

// CSP, the CSRF allowlist and the body-size cap now come from rshono.config.ts and are baked into
// the server bundle — there is no runtime env-var interface. This suite builds the example against
// a hardened fixture config and asserts all three from that single build. Its own file so the
// build stays isolated from the default build under `--test-concurrency=1`.

const READY = /serving on http:\/\/localhost:(\d+)/;
const CONFIG = join(fileURLToPath(import.meta.url), '..', 'fixtures', 'hardened.config.mjs');

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

test('csp: true sends a nonce-based CSP and skips the SSG shortcut', async () => {
  const res = await fetch(`${base}/`);
  const header = res.headers.get('content-security-policy');
  assert.ok(header, 'missing content-security-policy header');
  const nonce = header.match(/'nonce-([^']+)'/)[1];
  assert.doesNotMatch(header, /unsafe-eval/, 'prod CSP must not allow eval');
  const html = await res.text();
  assert.ok(html.includes(`nonce="${nonce}"`), 'nonce not stamped on scripts');

  const ssg = await fetch(`${base}/docs/getting-started`);
  assert.ok(ssg.headers.get('content-security-policy'), 'SSG route missing CSP header');
  assert.match(await ssg.text(), /nonce="/);
});

test('allowedOrigins lets a listed cross-origin action through, others still rejected', async () => {
  // An allowlisted cross-origin clears the CSRF gate (then 500 on the bogus action id — not 403).
  const allowed = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: 'https://admin.example', 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.notEqual(allowed.status, 403, 'an allowlisted cross-origin action must not be rejected as CSRF');

  const denied = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.equal(denied.status, 403, 'a cross-origin action not on the allowlist is still rejected');
});

test('bodySizeLimit rejects an oversized action POST body with 413 (memory-exhaustion guard)', async () => {
  const oversized = JSON.stringify([{ blob: 'x'.repeat(4096) }]);

  // Content-Length present: rejected up front, before the body is buffered.
  const declared = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: base, 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
    body: oversized,
  });
  assert.equal(declared.status, 413, 'a body over the cap with a Content-Length should be rejected with 413');

  // No Content-Length (chunked stream): the streaming byte-counter still trips the cap.
  const chunked = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: base, 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(oversized));
        controller.close();
      },
    }),
    duplex: 'half',
  });
  assert.equal(chunked.status, 413, 'a chunked body over the cap (no Content-Length) should still be rejected with 413');

  // A body under the cap is processed normally (here it fails to resolve the bogus action → 500, not 413).
  const under = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: base, 'x-rsc-action': 'whatever', Accept: 'text/html', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.notEqual(under.status, 413, 'a body under the cap must not be rejected as too large');
});
